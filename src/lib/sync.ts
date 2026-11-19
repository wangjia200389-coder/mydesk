/**
 * MyDesk 多设备同步：Supabase PostgREST + 端到端加密，零第三方依赖。
 *
 * 设计取舍（按「简单」原则）：
 *  - 一个同步码 = 一行云端快照，payload 是整份本地文本数据的 AES-GCM 密文；
 *  - 冲突统一「后写覆盖」，用 revision 做 CAS，不做字段级合并；
 *  - 照片 / 知识库文件单独存 files 表：按 sha256 只传变化的那一个，
 *    加密后直接放 Postgres，不建 Storage bucket（少一处配置）；
 *  - 删除不传播：本机删掉的照片云端仍保留，但物品里的 photoId 引用没了，
 *    其他设备不会把它显示出来，冗余留在云端反而是个保护；
 *  - 不侵入任何现有 store：定时对本地数据做哈希，变了就上传。
 *
 * 安全模型见 supabase/schema.sql：identity_id 由同步码派生，云端只存密文。
 */
import { BACKUP_KEYS, restoreBackup } from '@/lib/backup'
import { getPhoto, listPhotoIds, putPhotoRecord } from '@/lib/photo'
import { getFileBlob, listFileIds, putFileBlob } from '@/lib/idbFile'

const ENV = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}
const REMOTE = (ENV.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')
const ANON = ENV.VITE_SUPABASE_ANON_KEY ?? ''

/**
 * 线上走同源代理：浏览器只连 Netlify 域名，由 public/_redirects 在服务端转发到 Supabase。
 * 这样手机不必直连 *.supabase.co（国内移动网络常被阻断），也没有跨域预检。
 * 本地 dev server 不读 _redirects，所以开发时仍直连远端。
 */
const isLocalDev =
  typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
const BASE = isLocalDev
  ? REMOTE
  : typeof location !== 'undefined'
    ? location.origin
    : REMOTE
export const syncConfigured = () => !!(REMOTE && ANON)

const SYNC_KEY = 'my-desk:sync'
const SALT = 'mydesk-sync-v1'
const MODULES = BACKUP_KEYS.filter((k) => k !== SYNC_KEY)
/** 单个文件 dataUrl 上限（约 9MB 二进制），超过跳过，避免请求体过大 */
const MAX_DATA_URL = 12 * 1024 * 1024
const BATCH = 3

interface Prefs {
  code: string
  identityId: string
  deviceId: string
  lastRevision: number
  lastSyncAt: number
  pending: boolean
}

interface Row {
  payload: string
  revision: number
  updated_at: string
  device_id: string
}

/* ------------------------------------------------------------------ */
/* 冲突副本                                                             */
/* ------------------------------------------------------------------ */

const CONFLICT_KEY = 'my-desk:sync-conflict'

export interface SyncConflictCopy {
  savedAt: number
  reason: string
  /** 本地修改所基于的云端版本 */
  localBaseline: number
  /** 冲突时云端的版本 */
  remoteRevision: number
  data: Record<string, string | null>
}

/**
 * 冲突时把本地快照另存一份。
 *
 * 同步是整份快照覆盖，不是逐字段合并，所以一旦「本地有未上传的修改 + 云端也被别的设备改过」，
 * 无论选哪一边都会丢掉另一边的改动。这里先落一份副本到本机，
 * 至少让用户能把丢掉的内容捞回来，而不是静默覆盖。
 * 只保留最近一次，避免反复冲突把 localStorage 撑爆。
 */
function saveConflictCopy(reason: string, p: Prefs, remoteRevision: number): boolean {
  try {
    const copy: SyncConflictCopy = {
      savedAt: Date.now(),
      reason,
      localBaseline: p.lastRevision,
      remoteRevision,
      data: localPayload(),
    }
    localStorage.setItem(CONFLICT_KEY, JSON.stringify(copy))
    return true
  } catch {
    return false
  }
}

export function getConflictCopy(): SyncConflictCopy | null {
  try {
    const raw = localStorage.getItem(CONFLICT_KEY)
    return raw ? (JSON.parse(raw) as SyncConflictCopy) : null
  } catch {
    return null
  }
}

export function clearConflictCopy() {
  try {
    localStorage.removeItem(CONFLICT_KEY)
  } catch {
    /* ignore */
  }
}

type FileKind = 'photo' | 'kb'
interface LocalFile {
  fileId: string
  kind: FileKind
  dataUrl: string
  size: number
  sha256: string
}

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'offline' | 'remote-new' | 'error'

export interface SyncState {
  configured: boolean
  hasCode: boolean
  status: SyncStatus
  message: string
}

const listeners = new Set<() => void>()
let state: SyncState = { configured: syncConfigured(), hasCode: false, status: 'off', message: '' }
let lastHash = ''
let pushTimer: number | null = null
let filesBusy = false
let lastInteractionAt = 0
let lastFileSyncAt = 0
let lastFileFp = ''

/** 后台自动应用远端数据时，别打断正在输入或刚操作过的用户 */
function safeToReload(): boolean {
  if (document.visibilityState !== 'visible') return false
  const el = document.activeElement as HTMLElement | null
  if (
    el &&
    (el.isContentEditable ||
      el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT')
  )
    return false
  return Date.now() - lastInteractionAt > 5000
}

function emit(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  listeners.forEach((fn) => fn())
}
export function subscribeSync(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
export function getSyncState(): SyncState {
  return state
}

/* ------------------------------------------------------------------ */
/* 编解码 / 身份                                                        */
/* ------------------------------------------------------------------ */

function toB64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64(text: string): Uint8Array {
  const s = text.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function newSyncCode(): string {
  return toB64(crypto.getRandomValues(new Uint8Array(24)))
}

async function derive(code: string): Promise<{ identityId: string; key: CryptoKey }> {
  const enc = new TextEncoder()
  const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(SALT), iterations: 120000, hash: 'SHA-256' },
    base,
    256,
  )
  const idHash = new Uint8Array(await crypto.subtle.digest('SHA-256', bits))
  const identityId = Array.from(idHash.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  const key = await crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
  return { identityId, key }
}

async function encrypt(key: CryptoKey, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new TextEncoder().encode(JSON.stringify(value))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
  const out = new Uint8Array(iv.byteLength + cipher.byteLength)
  out.set(iv, 0)
  out.set(new Uint8Array(cipher), iv.byteLength)
  return toB64(out)
}

async function decrypt(key: CryptoKey, text: string): Promise<unknown> {
  const raw = fromB64(text)
  const iv = raw.slice(0, 12)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, raw.slice(12))
  return JSON.parse(new TextDecoder().decode(plain))
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function dataUrlToBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  return await res.blob()
}

/* ------------------------------------------------------------------ */
/* 本地偏好 / 快照                                                      */
/* ------------------------------------------------------------------ */

function loadPrefs(): Prefs | null {
  try {
    const raw = localStorage.getItem(SYNC_KEY)
    return raw ? (JSON.parse(raw) as Prefs) : null
  } catch {
    return null
  }
}

function savePrefs(p: Prefs) {
  localStorage.setItem(SYNC_KEY, JSON.stringify(p))
}

function makePrefs(code: string, identityId: string, pending: boolean): Prefs {
  let deviceId = ''
  try {
    deviceId = localStorage.getItem('my-desk:device-id') ?? ''
  } catch { /* ignore */ }
  if (!deviceId) {
    deviceId = toB64(crypto.getRandomValues(new Uint8Array(8)))
    localStorage.setItem('my-desk:device-id', deviceId)
  }
  return { code, identityId, deviceId, lastRevision: 0, lastSyncAt: 0, pending }
}

function localPayload(): Record<string, string | null> {
  const data: Record<string, string | null> = {}
  for (const k of MODULES) data[k] = localStorage.getItem(k)
  return data
}

/** 文件指纹只列 id，不读 7MB 内容，5 秒轮询也不会卡 */
async function fileFingerprint(): Promise<string> {
  try {
    const photos = await listPhotoIds()
    const kbs = await listFileIds()
    return [...photos.map((i) => `ph_${i}`), ...kbs.map((i) => `kb_${i}`)].sort().join('|')
  } catch {
    return ''
  }
}

async function payloadHash(): Promise<string> {
  const fp = await fileFingerprint()
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(localPayload()) + '|' + fp),
  )
  return Array.from(new Uint8Array(buf).slice(0, 12))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** 读取全部本地二进制（只在真正同步文件时调用） */
async function collectLocalFiles(): Promise<LocalFile[]> {
  const out: LocalFile[] = []
  const photoIds = await listPhotoIds()
  for (const id of photoIds) {
    const dataUrl = await getPhoto(id)
    if (!dataUrl || dataUrl.length > MAX_DATA_URL) continue
    out.push({
      fileId: `ph_${id}`,
      kind: 'photo',
      dataUrl,
      size: dataUrl.length,
      sha256: await sha256Hex(dataUrl),
    })
  }
  const kbIds = await listFileIds()
  for (const id of kbIds) {
    const blob = await getFileBlob(id)
    if (!blob) continue
    const dataUrl = await blobToDataUrl(blob)
    if (dataUrl.length > MAX_DATA_URL) continue
    out.push({
      fileId: `kb_${id}`,
      kind: 'kb',
      dataUrl,
      size: dataUrl.length,
      sha256: await sha256Hex(dataUrl),
    })
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Supabase PostgREST                                                   */
/* ------------------------------------------------------------------ */

function reqHeaders(identityId: string): Record<string, string> {
  return {
    apikey: ANON,
    Authorization: `Bearer ${ANON}`,
    'Content-Type': 'application/json',
    'x-identity-id': identityId,
  }
}

async function pull(identityId: string): Promise<Row | null> {
  const url = `${BASE}/rest/v1/snapshots?identity_id=eq.${encodeURIComponent(identityId)}&select=payload,revision,updated_at,device_id`
  const res = await fetch(url, { headers: reqHeaders(identityId) })
  if (!res.ok) throw new Error(`读取云端失败（${res.status}）`)
  const rows = (await res.json()) as Row[]
  return rows[0] ?? null
}

async function insert(identityId: string, p: Prefs, payload: string): Promise<boolean> {
  const res = await fetch(`${BASE}/rest/v1/snapshots`, {
    method: 'POST',
    headers: { ...reqHeaders(identityId), Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify({
      identity_id: identityId,
      payload,
      revision: 1,
      device_id: p.deviceId,
      updated_at: new Date().toISOString(),
      schema_version: 1,
    }),
  })
  return res.ok
}

/** CAS：只有 revision 仍是 expected 才写入；返回 false 表示别的设备抢先写过 */
async function update(identityId: string, p: Prefs, payload: string, expected: number): Promise<boolean> {
  const url = `${BASE}/rest/v1/snapshots?identity_id=eq.${encodeURIComponent(identityId)}&revision=eq.${expected}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...reqHeaders(identityId), Prefer: 'return=representation' },
    body: JSON.stringify({
      payload,
      revision: expected + 1,
      device_id: p.deviceId,
      updated_at: new Date().toISOString(),
    }),
  })
  if (!res.ok) throw new Error(`上传失败（${res.status}）`)
  const rows = (await res.json()) as Row[]
  return Array.isArray(rows) && rows.length > 0
}

/* ------------------------------------------------------------------ */
/* 二进制文件同步                                                       */
/* ------------------------------------------------------------------ */

async function listRemoteFiles(identityId: string): Promise<Map<string, string>> {
  const url = `${BASE}/rest/v1/files?identity_id=eq.${encodeURIComponent(identityId)}&select=file_id,sha256`
  const res = await fetch(url, { headers: reqHeaders(identityId) })
  if (!res.ok) throw new Error(`读取云端文件清单失败（${res.status}）`)
  const rows = (await res.json()) as { file_id: string; sha256: string }[]
  return new Map(rows.map((r) => [r.file_id, r.sha256]))
}

async function uploadOne(identityId: string, key: CryptoKey, f: LocalFile): Promise<boolean> {
  const payload = await encrypt(key, { dataUrl: f.dataUrl })
  const res = await fetch(`${BASE}/rest/v1/files`, {
    method: 'POST',
    headers: { ...reqHeaders(identityId), Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify({
      identity_id: identityId,
      file_id: f.fileId,
      kind: f.kind,
      payload,
      sha256: f.sha256,
      size_bytes: f.size,
      updated_at: new Date().toISOString(),
    }),
  })
  return res.ok
}

/** 下载一个文件；返回本地照片 id（非照片返回 null），供界面刷新用 */
async function downloadOne(
  identityId: string,
  key: CryptoKey,
  fileId: string,
): Promise<string | null> {
  const url = `${BASE}/rest/v1/files?identity_id=eq.${encodeURIComponent(identityId)}&file_id=eq.${encodeURIComponent(fileId)}&select=payload,kind`
  const res = await fetch(url, { headers: reqHeaders(identityId) })
  if (!res.ok) throw new Error(`下载文件失败（${res.status}）`)
  const rows = (await res.json()) as { payload: string; kind: FileKind }[]
  const row = rows[0]
  if (!row) return null
  const plain = (await decrypt(key, row.payload)) as { dataUrl?: string }
  if (!plain?.dataUrl) return null
  const rawId = fileId.slice(3)
  if (row.kind === 'photo') {
    await putPhotoRecord({ id: rawId, dataUrl: plain.dataUrl })
    return rawId
  }
  await putFileBlob(rawId, await dataUrlToBlob(plain.dataUrl))
  return null
}

/** 按 sha256 只传变化的；云端多出来的补下载。失败不影响文本同步结果。
 *  文本每 15 秒同步，但读 7MB 照片算哈希太重：本地文件没增减时最多 60 秒查一次。 */
async function syncFiles(key: CryptoKey, identityId: string): Promise<void> {
  if (filesBusy) return
  const fp = await fileFingerprint()
  if (fp === lastFileFp && Date.now() - lastFileSyncAt < 60000) return
  filesBusy = true
  try {
    const local = await collectLocalFiles()
    const remote = await listRemoteFiles(identityId)
    const localIds = new Set(local.map((f) => f.fileId))
    const toUpload = local.filter((f) => remote.get(f.fileId) !== f.sha256)
    const toDownload = [...remote.keys()].filter((id) => !localIds.has(id))
    if (toUpload.length === 0 && toDownload.length === 0) {
      // 没有变化也报一下云端总量，方便判断照片到底有没有传上去
      emit({
        status: 'idle',
        message: remote.size > 0 ? `已是最新（云端 ${remote.size} 个文件）` : '已是最新',
      })
      return
    }

    const total = toUpload.length + toDownload.length
    let done = 0
    let failed = 0
    const downloadedPhotos: string[] = []
    const tick = () => {
      done++
      emit({ status: 'syncing', message: `同步文件中 ${done}/${total}` })
    }

    for (let i = 0; i < toUpload.length; i += BATCH) {
      await Promise.all(
        toUpload.slice(i, i + BATCH).map(async (f) => {
          try {
            if (!(await uploadOne(identityId, key, f))) failed++
          } catch { failed++ }
          tick()
        }),
      )
    }
    for (let i = 0; i < toDownload.length; i += BATCH) {
      await Promise.all(
        toDownload.slice(i, i + BATCH).map(async (id) => {
          try {
            const photoId = await downloadOne(identityId, key, id)
            if (photoId) downloadedPhotos.push(photoId)
          } catch { failed++ }
          tick()
        }),
      )
    }

    // 照片写进 IndexedDB 后通知界面重读，否则列表会一直停在 📦 占位
    if (downloadedPhotos.length > 0) {
      window.dispatchEvent(
        new CustomEvent('mydesk-files-updated', { detail: { ids: downloadedPhotos } }),
      )
    }

    // 下载写入了 IndexedDB，重算指纹，避免下一轮误判为「本地有改动」
    lastHash = await payloadHash()
    lastFileFp = await fileFingerprint()
    // 有失败的文件就下一轮立刻重试，不等 60 秒
    lastFileSyncAt = failed > 0 ? 0 : Date.now()
    emit({
      status: 'idle',
      message: failed > 0
        ? `文件同步完成，${failed} 个失败（下次会重试）`
        : `已同步（含 ${total} 个文件）`,
    })
  } catch (err) {
    emit({
      status: 'idle',
      message: `文件同步未完成：${err instanceof Error ? err.message : '未知错误'}`,
    })
  } finally {
    filesBusy = false
  }
}

/* ------------------------------------------------------------------ */
/* 编排                                                                 */
/* ------------------------------------------------------------------ */

function markSynced(p: Prefs, revision: number, message: string) {
  p.lastRevision = revision
  p.lastSyncAt = Date.now()
  p.pending = false
  savePrefs(p)
  emit({ status: 'idle', message })
}

async function applyRemote(row: Row, key: CryptoKey, p: Prefs, message: string) {
  const plain = (await decrypt(key, row.payload)) as Record<string, string | null>
  // replace：云端快照里没有的模块要在本地清掉。
  // 之前只写字符串，null 被跳过，导致上一台设备留下的旧模块数据一直残留。
  const result = await restoreBackup(
    JSON.stringify({ app: 'mydesk', schema: 3, exportedAt: new Date().toISOString(), data: plain }),
    'replace',
  )
  if (!result.ok) throw new Error(result.message)
  markSynced(p, row.revision, message)
  lastHash = await payloadHash()
  // reload 后 initSync 会再跑一轮 syncNow，那轮会自动补齐二进制文件
  window.location.reload()
}

/**
 * @param applyRemoteIfNewer 启动时/手动点同步=true（以云端为准）；
 *                           后台轮询=false（页面空闲时也会自动应用，正在输入则稍后重试）
 */
export async function syncNow(applyRemoteIfNewer = true): Promise<void> {
  const p = loadPrefs()
  if (!syncConfigured() || !p?.code) return
  emit({ status: 'syncing', message: '同步中…' })
  try {
    const { identityId, key } = await derive(p.code)
    const row = await pull(identityId)

    if (!row) {
      const ok = await insert(identityId, p, await encrypt(key, localPayload()))
      if (!ok) throw new Error('云端初始化失败，请检查 SQL 是否执行')
      markSynced(p, 1, '已同步')
      lastHash = await payloadHash()
      await syncFiles(key, identityId)
      return
    }

    // 手动点「立即同步」或启动时：云端有别人写的新数据就先拉下来，
    // 避免本机 pending（可能只是哈希竞态造成的误判）反过来把云端新数据盖掉。
    if (applyRemoteIfNewer && row.revision > p.lastRevision) {
      await applyRemote(row, key, p, '已获取云端最新数据')
      return
    }

    if (p.pending) {
      // 本地有未上传的修改。先看云端是否已经走到本地基线之后：
      // 如果是，说明两台设备都改过，直接把本地快照推上去会抹掉对方的改动。
      // 这时先存一份本地副本，再采用云端版本，让用户还能找回自己的内容。
      if (row.revision > p.lastRevision) {
        const saved = saveConflictCopy('本地修改与云端更新冲突（尚未上传）', p, row.revision)
        const cur = loadPrefs()
        if (cur) {
          cur.pending = false
          savePrefs(cur)
        }
        if (applyRemoteIfNewer || safeToReload()) {
          await applyRemote(
            row,
            key,
            p,
            saved ? '云端有更新，本地改动已另存为副本' : '云端有更新，已采用云端版本',
          )
          return
        }
        emit({
          status: 'remote-new',
          message: saved ? '云端有更新，本地改动已另存，稍后同步' : '云端有更新，稍后自动同步',
        })
        return
      }

      // 基线一致才允许 CAS 上传。expected 用本地基线（p.lastRevision），
      // 而不是刚拉下来的 row.revision —— 后者只能防住「拉取到提交」之间的竞争，
      // 防不住「本地快照基于旧版本」这种情况。
      const ok = await update(identityId, p, await encrypt(key, localPayload()), p.lastRevision)
      if (ok) {
        markSynced(p, p.lastRevision + 1, '已同步')
        lastHash = await payloadHash()
        await syncFiles(key, identityId)
        return
      }

      // CAS 失败：pull 之后又有设备写了进来。重新拉一份最新的再决定，不用手里这份旧 row。
      const fresh = await pull(identityId)
      const saved = saveConflictCopy('上传时云端被其他设备抢先更新', p, fresh?.revision ?? row.revision)
      const cur = loadPrefs()
      if (cur) {
        cur.pending = false
        savePrefs(cur)
      }
      if (fresh && (applyRemoteIfNewer || safeToReload())) {
        await applyRemote(
          fresh,
          key,
          p,
          saved ? '云端已更新，本地改动已另存为副本' : '云端已更新，已采用云端版本',
        )
        return
      }
      emit({ status: 'remote-new', message: '云端有更新，稍后自动同步' })
      return
    }

    if (row.revision > p.lastRevision) {
      // 后台轮询发现别的设备写了新数据：页面在前台且用户没在输入、5 秒没操作就自动刷新，
      // 不需要用户手动点「立即同步」。正在输入则等下一轮（15 秒后）再试。
      if (safeToReload()) {
        await applyRemote(row, key, p, '已获取云端最新数据')
        return
      }
      emit({ status: 'remote-new', message: '云端有更新，稍后自动同步' })
      return
    }

    emit({ status: 'idle', message: '已是最新' })
    await syncFiles(key, identityId)
  } catch (err) {
    const offline = !navigator.onLine
    emit({
      status: offline ? 'offline' : 'error',
      message: offline ? '离线中，联网后自动同步' : (err instanceof Error ? err.message : '同步失败'),
    })
  }
}

/** 生成本机同步码并上传第一份快照（在主力设备上点一次） */
export async function enableSync(): Promise<string> {
  if (!syncConfigured()) throw new Error('同步尚未配置')
  const code = newSyncCode()
  const { identityId } = await derive(code)
  savePrefs(makePrefs(code, identityId, true))
  emit({ configured: true, hasCode: true })
  await syncNow(true)
  // 首次启用时把轮询和本地变化检测也拉起来，不需要刷新页面
  startSyncLoop()
  return code
}

/** 在其他设备输入同步码：会用云端数据覆盖本机 */
export async function joinSync(code: string): Promise<void> {
  const trimmed = code.trim()
  if (!trimmed) throw new Error('请粘贴同步码')
  const { identityId, key } = await derive(trimmed)
  const row = await pull(identityId)
  if (!row) throw new Error('这个同步码在云端还没有数据，请先在主力设备生成')
  await decrypt(key, row.payload) // 先验证码是否正确
  savePrefs(makePrefs(trimmed, identityId, false))
  emit({ configured: true, hasCode: true })
  await applyRemote(row, key, loadPrefs()!, '已加入同步')
}

export function disableSync() {
  localStorage.removeItem(SYNC_KEY)
  stopSyncLoop()
  emit({ hasCode: false, status: 'off', message: '已关闭同步，本地数据仍保留' })
}

export function getSyncCode(): string | null {
  return loadPrefs()?.code ?? null
}

/* ------------------------------------------------------------------ */
/* 同步循环的生命周期                                                    */
/* ------------------------------------------------------------------ */

let loopStop: (() => void) | null = null

/**
 * 启动定时器 + 事件监听。做成可重复调用、幂等的生命周期：
 * 应用启动时如果没有同步码，initSync 不会启动任何东西；
 * 之后在当前页面点「生成同步码」，enableSync 会再次调用这个函数把循环拉起来。
 * 原先只在 initSync 里启动，导致首次启用后必须刷新页面才会真正开始同步。
 */
function startSyncLoop() {
  if (loopStop) return
  const p = loadPrefs()
  if (!syncConfigured() || !p?.code) return

  void payloadHash().then((h) => { lastHash = h })
  void syncNow(true)

  const hashTimer = window.setInterval(() => {
    void payloadHash().then((h) => {
      if (h === lastHash) return
      lastHash = h
      const cur = loadPrefs()
      if (!cur) return
      cur.pending = true
      savePrefs(cur)
      if (pushTimer != null) window.clearTimeout(pushTimer)
      pushTimer = window.setTimeout(() => {
        pushTimer = null
        void syncNow(false)
      }, 2000)
    })
  }, 5000)

  const checkTimer = window.setInterval(() => void syncNow(false), 15000)
  const onActive = () => { if (document.visibilityState === 'visible') void syncNow(false) }
  const onOnline = () => void syncNow(true)
  const onInteract = () => { lastInteractionAt = Date.now() }
  document.addEventListener('visibilitychange', onActive)
  window.addEventListener('online', onOnline)
  window.addEventListener('pointerdown', onInteract, { passive: true })
  window.addEventListener('keydown', onInteract)

  loopStop = () => {
    window.clearInterval(hashTimer)
    window.clearInterval(checkTimer)
    if (pushTimer != null) {
      window.clearTimeout(pushTimer)
      pushTimer = null
    }
    document.removeEventListener('visibilitychange', onActive)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('pointerdown', onInteract)
    window.removeEventListener('keydown', onInteract)
  }
}

function stopSyncLoop() {
  loopStop?.()
  loopStop = null
}

/** 应用启动时调用一次；返回清理函数 */
export function initSync(): () => void {
  const p = loadPrefs()
  emit({ configured: syncConfigured(), hasCode: !!p?.code, status: p?.code ? 'idle' : 'off' })
  startSyncLoop()
  return stopSyncLoop
}
