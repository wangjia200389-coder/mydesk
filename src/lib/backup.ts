/**
 * 数据备份工具：把 localStorage 里的全部 MyDesk 数据 + 物品照片 + 知识库原始文件
 * 打包成 JSON 导出，或把备份文件恢复回去。
 *
 * localStorage 直接读写原始值（zustand persist 的 {state, version} 格式），
 * 不解析内部结构，100% 兼容老数据。
 *
 * 两个必须分清的概念：
 *   1. 元数据（文件名、大小、关联关系）在 localStorage 里；
 *      原始内容（照片 dataUrl、知识库 Blob）在 IndexedDB 里。
 *      只备份 localStorage 会得到一个「有清单没有文件」的备份，
 *      所以 schema 3 起把 IndexedDB 里的二进制也一并打包成 base64。
 *   2. 「完整替换」和「合并导入」不是一回事。
 *      replace 会用备份内容整体覆盖本机，备份里没有 / 为 null 的 key 会被清掉，
 *      语义上对应「换设备」「从云端拉取」；merge 只写入备份里非空的部分，
 *      适合「把别人的几条数据并进来」。
 */

import { getAllPhotos, putPhotoRecord, type PhotoRecord } from './photo'
import { getFileBlob, listFileIds, putFileBlob } from './idbFile'

export const BACKUP_KEYS = [
  'my-desk:todos',
  'my-desk:user',
  'my-desk:pomodoro',
  'my-desk:notes',
  'my-desk:items',
  'my-desk:messages',
  'my-desk:feedback',
  'my-desk:feedback-endpoint',
  'my-desk:ocr-config',
  'my-desk:homework',
  'my-desk:cart',
  'my-desk:knowledge',
  'my-desk:review',
  // 同步码随备份一起走：换设备导入备份即可自动加入同步（注意别把备份文件外传）
  'my-desk:sync',
] as const

/** 备份里同时含同步码和 OCR 配置，导出时要提醒用户别外传 */
export const BACKUP_HAS_SECRETS = true

/** 单个文件写进 JSON 的上限（base64 编码后还会膨胀约 1/3） */
const MAX_BACKUP_FILE = 20 * 1024 * 1024

export type RestoreMode = 'replace' | 'merge'

/** 知识库原始文件（存 IndexedDB），导出时转成 base64 data URL */
export interface BackupFileEntry {
  id: string
  name?: string
  type?: string
  size: number
  dataUrl: string
}

export interface MyDeskBackup {
  app: 'mydesk'
  schema: number
  exportedAt: string
  data: Record<string, string | null>
  /** 物品照片（存 IndexedDB，一并备份） */
  photos?: PhotoRecord[]
  /** schema 3 起：知识库原始文件 */
  files?: BackupFileEntry[]
  /** 导出时被跳过的内容，用来判断这份备份是否完整 */
  warnings?: string[]
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return await res.blob()
}

/** 收集当前所有持久化 key 的原始值 + 全部照片 + 知识库原文件 */
export async function collectBackup(): Promise<MyDeskBackup> {
  const data: Record<string, string | null> = {}
  for (const k of BACKUP_KEYS) {
    data[k] = localStorage.getItem(k)
  }

  const warnings: string[] = []

  let photos: PhotoRecord[] = []
  try {
    photos = await getAllPhotos()
  } catch (e) {
    warnings.push(`物品照片读取失败：${e instanceof Error ? e.message : '未知错误'}`)
  }

  // 知识库原始文件：只备份 localStorage 的话，恢复后只剩文件名，打不开原文件
  const files: BackupFileEntry[] = []
  let ids: string[] = []
  try {
    ids = await listFileIds()
  } catch {
    warnings.push('知识库文件列表读取失败，本次备份未包含原文件')
  }
  for (const id of ids) {
    try {
      const blob = await getFileBlob(id)
      if (!blob) {
        warnings.push(`知识库文件 ${id} 在本机已缺失，已跳过`)
        continue
      }
      if (blob.size > MAX_BACKUP_FILE) {
        warnings.push(`知识库文件 ${id} 超过 20MB，已跳过`)
        continue
      }
      const named = blob as Blob & { name?: string }
      files.push({
        id,
        name: named.name,
        type: blob.type || undefined,
        size: blob.size,
        dataUrl: await blobToDataUrl(blob),
      })
    } catch {
      warnings.push(`知识库文件 ${id} 读取失败，已跳过`)
    }
  }

  return {
    app: 'mydesk',
    schema: 3,
    exportedAt: new Date().toISOString(),
    data,
    photos,
    files,
    warnings,
  }
}

export interface ExportResult {
  name: string
  warnings: string[]
}

/** 触发浏览器下载备份文件 */
export async function downloadBackup(): Promise<ExportResult> {
  const backup = await collectBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)
  const name = `mydesk-backup-${stamp}.json`
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { name, warnings: backup.warnings ?? [] }
}

/** 读取用户选择的备份文件内容 */
export function readBackupFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

export interface RestoreResult {
  ok: boolean
  message: string
  restored: string[]
  /** replace 模式下被清掉的本地旧 key（备份里没有或为 null） */
  cleared: string[]
  restoredPhotos: number
  failedPhotos: number
  restoredFiles: number
  failedFiles: number
  warnings: string[]
}

const EMPTY_RESULT = {
  restored: [] as string[],
  cleared: [] as string[],
  restoredPhotos: 0,
  failedPhotos: 0,
  restoredFiles: 0,
  failedFiles: 0,
  warnings: [] as string[],
}

/**
 * 把备份写回 localStorage + IndexedDB。
 *
 * @param mode replace（默认）= 完整替换，备份里没有/为 null 的 key 一并清掉；
 *             merge = 合并导入，只写入备份里非空的项，本机其他数据保留。
 *
 * 写入失败会如实计入 failed*，不会出现「吞掉异常还算成功」的情况。
 */
export async function restoreBackup(text: string, mode: RestoreMode = 'replace'): Promise<RestoreResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, message: '文件不是有效的 JSON', ...EMPTY_RESULT }
  }

  const obj = parsed as Partial<MyDeskBackup>
  const data = obj?.data
  if (!data || typeof data !== 'object') {
    return { ok: false, message: '备份文件格式不正确（缺少 data 字段）', ...EMPTY_RESULT }
  }

  const restored: string[] = []
  const cleared: string[] = []

  for (const k of BACKUP_KEYS) {
    const v = (data as Record<string, unknown>)[k]
    if (typeof v === 'string') {
      localStorage.setItem(k, v)
      restored.push(k)
      continue
    }
    // null 或整个 key 缺失
    if (mode === 'replace' && localStorage.getItem(k) !== null) {
      localStorage.removeItem(k)
      cleared.push(k)
    }
  }

  let restoredPhotos = 0
  let failedPhotos = 0
  if (Array.isArray(obj.photos)) {
    const recs = obj.photos.filter(
      (p): p is PhotoRecord =>
        !!p && typeof (p as PhotoRecord).id === 'string' && typeof (p as PhotoRecord).dataUrl === 'string',
    )
    failedPhotos += obj.photos.length - recs.length
    for (const p of recs) {
      try {
        await putPhotoRecord(p)
        restoredPhotos += 1
      } catch {
        failedPhotos += 1
      }
    }
  }

  let restoredFiles = 0
  let failedFiles = 0
  if (Array.isArray(obj.files)) {
    for (const f of obj.files as Partial<BackupFileEntry>[]) {
      if (!f || typeof f.id !== 'string' || typeof f.dataUrl !== 'string') {
        failedFiles += 1
        continue
      }
      try {
        const blob = await dataUrlToBlob(f.dataUrl)
        await putFileBlob(f.id, blob)
        restoredFiles += 1
      } catch {
        failedFiles += 1
      }
    }
  }

  const failed = failedPhotos + failedFiles
  const parts: string[] = []
  if (restored.length) parts.push(`${restored.length} 项数据`)
  if (restoredPhotos) parts.push(`${restoredPhotos} 张照片`)
  if (restoredFiles) parts.push(`${restoredFiles} 个文件`)
  if (cleared.length) parts.push(`清理 ${cleared.length} 项旧数据`)

  if (parts.length === 0) {
    return {
      ok: false,
      message: failed > 0 ? `没有恢复成功的内容，${failed} 个附件写入失败` : '没有找到可恢复的数据',
      restored,
      cleared,
      restoredPhotos,
      failedPhotos,
      restoredFiles,
      failedFiles,
      warnings: [],
    }
  }

  const warnings: string[] = []
  if (failed > 0) warnings.push(`有 ${failed} 个附件写入失败，可能存储空间不足`)

  return {
    ok: true,
    message: `已恢复 ${parts.join('、')}${failed > 0 ? `（${failed} 个附件失败）` : ''}`,
    restored,
    cleared,
    restoredPhotos,
    failedPhotos,
    restoredFiles,
    failedFiles,
    warnings,
  }
}
