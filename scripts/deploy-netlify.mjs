/**
 * MyDesk -> Netlify 自动部署脚本（纯 Node，无第三方依赖）
 *
 * 用法：
 *   node scripts/deploy-netlify.mjs
 *   node scripts/deploy-netlify.mjs --site warm-brioche-f00869
 *
 * Token 来源（按优先级）：
 *   1. 环境变量 NETLIFY_TOKEN
 *   2. 文件 C:\Users\28756\.workbuddy\netlify-token.txt（首行即 token）
 *
 * 原理：Netlify 文件摘要部署
 *   1) 遍历 dist，算出每个文件的 sha1
 *   2) POST /sites/{id}/deploys 提交清单，Netlify 返回「缺哪些文件」
 *   3) PUT 上传缺失文件
 *   4) 轮询直到 ready
 * 已存在且内容相同的文件不会重复上传，所以第二次开始会非常快。
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { ProxyAgent, setGlobalDispatcher, fetch as undiciFetch } from 'undici'

/* Node 的 fetch 不会自动读 http_proxy / https_proxy，本机必须走系统代理才能连上
   api.netlify.com（不然 ECONNRESET / 连接超时）。有代理变量就显式挂上去，没有则直连。
   注意：必须连 fetch 一起换成 undici 的——Node 内置 fetch 是另一份 undici 副本，
   setGlobalDispatcher 管不到它。 */
const PROXY_URL =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy ||
  ''
if (PROXY_URL) {
  setGlobalDispatcher(new ProxyAgent(PROXY_URL))
  globalThis.fetch = undiciFetch
}

const API = 'https://api.netlify.com/api/v1'
const DIST = path.resolve(process.cwd(), 'dist')
const TOKEN_FILE = path.join(os.homedir(), '.workbuddy', 'netlify-token.txt')

const argSite = (() => {
  const i = process.argv.indexOf('--site')
  return i >= 0 ? process.argv[i + 1] : null
})()
const SITE_HINT = argSite || process.env.NETLIFY_SITE || 'warm-brioche-f00869'

/* ---------- token ---------- */
function getToken() {
  const t = (process.env.NETLIFY_TOKEN || '').trim()
  if (t) return t
  if (fs.existsSync(TOKEN_FILE)) {
    const raw = fs.readFileSync(TOKEN_FILE, 'utf8').trim()
    if (raw) return raw.split(/\r?\n/)[0].trim()
  }
  console.error(
    `\n[错误] 未找到 Netlify Token。\n` +
      `请在 ${TOKEN_FILE} 首行粘贴你的 Personal Access Token，或设置环境变量 NETLIFY_TOKEN。\n`
  )
  process.exit(1)
}
const TOKEN = getToken()
const HEADERS = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }

/* ---------- 遍历 dist ---------- */
function walk(dir, base = dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const st = fs.statSync(full)
    if (st.isDirectory()) walk(full, base, out)
    else out.push(full)
  }
  return out
}

if (!fs.existsSync(DIST)) {
  console.error(`[错误] 找不到 ${DIST}，请先执行 npm run build`)
  process.exit(1)
}

const files = walk(DIST)
const manifest = {}
for (const full of files) {
  const rel = '/' + path.relative(DIST, full).split(path.sep).join('/')
  const buf = fs.readFileSync(full)
  manifest[rel] = createHash('sha1').update(buf).digest('hex')
}
console.log(`[1/5] 扫描 dist：${files.length} 个文件`)

/* ---------- 找站点 ---------- */
async function findSite() {
  const res = await fetch(`${API}/sites?per_page=100`, { headers: HEADERS })
  if (!res.ok) throw new Error(`获取站点列表失败 ${res.status}: ${await res.text()}`)
  const sites = await res.json()
  const hit =
    sites.find((s) => s.subdomain === SITE_HINT) ||
    sites.find((s) => (s.name || '').includes(SITE_HINT)) ||
    sites.find((s) => (s.url || '').includes(SITE_HINT)) ||
    sites.find((s) => (s.ssl_url || '').includes(SITE_HINT))
  if (!hit) {
    console.error(
      `\n[错误] 账号下没找到站点 ${SITE_HINT}。可用站点：\n` +
        sites.map((s) => `  - ${s.name}  https://${s.subdomain || new URL(s.url).host}.netlify.app`).join('\n')
    )
    process.exit(1)
  }
  return hit
}

const site = await findSite()
const publicUrl = site.ssl_url || site.url
console.log(`[2/5] 目标站点：${site.name}  ${publicUrl}`)

/* ---------- 创建部署 ---------- */
const createRes = await fetch(`${API}/sites/${site.id}/deploys`, {
  method: 'POST',
  headers: HEADERS,
  body: JSON.stringify({ files: manifest, draft: false, async: true }),
})
if (!createRes.ok) throw new Error(`创建部署失败 ${createRes.status}: ${await createRes.text()}`)
const deploy = await createRes.json()
console.log(`[3/5] 部署已创建：${deploy.id}（state=${deploy.state}）`)

/* ---------- 等 Netlify 算出「缺哪些文件」 ----------
 * 注意：async:true 时创建接口返回的 required 是空的，
 * 必须轮询 /deploys/{id} 等 state 变成 prepared 后 required 才有值。 */
async function getRequired(id, timeoutMs = 120000) {
  const t0 = Date.now()
  let last = null
  while (Date.now() - t0 < timeoutMs) {
    const r = await fetch(`${API}/deploys/${id}`, { headers: HEADERS })
    if (!r.ok) throw new Error(`查询部署状态失败 ${r.status}`)
    const d = await r.json()
    last = d
    if (d.state === 'error') throw new Error(`部署失败：${d.error_message || '未知错误'}`)
    if (Array.isArray(d.required) && d.required.length > 0) return { required: d.required, state: d.state }
    if (d.state === 'uploaded' || d.state === 'ready' || d.state === 'uploading') {
      return { required: [], state: d.state }
    }
    await new Promise((res) => setTimeout(res, 1500))
  }
  console.warn('      [警告] 等待文件清单超时，改为全量上传')
  return { required: Object.values(manifest), state: last?.state || 'unknown' }
}

const { required, state: stateAfterManifest } = await getRequired(deploy.id)
console.log(`[4/5] 需上传 ${required.length}/${files.length} 个文件（其余走远端缓存，state=${stateAfterManifest}）`)

if (required.length > 0) {
  let done = 0
  for (const sha of required) {
    const rel = Object.keys(manifest).find((k) => manifest[k] === sha)
    if (!rel) continue
    const buf = fs.readFileSync(path.join(DIST, rel.slice(1)))
    const url = `${API}/deploys/${deploy.id}/files${rel.split('/').map(encodeURIComponent).join('/')}`

    /* 走代理上传时偶发 ECONNRESET（代理会掐掉复用连接），重试几次即可 */
    let lastErr = null
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        const up = await fetch(url, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/octet-stream' },
          body: buf,
          keepalive: false,
        })
        if (!up.ok) throw new Error(`上传 ${rel} 失败 ${up.status}: ${await up.text()}`)
        lastErr = null
        break
      } catch (e) {
        lastErr = e
        if (attempt < 4) await new Promise((r) => setTimeout(r, 600 * attempt))
      }
    }
    if (lastErr) throw lastErr
    done++
    process.stdout.write(`      ${done}/${required.length}\r`)
  }
  console.log(`      ${done}/${required.length} 上传完成      `)
}

/* ---------- 轮询状态 ---------- */
async function waitReady(id, timeoutMs = 180000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const r = await fetch(`${API}/deploys/${id}`, { headers: HEADERS })
    if (!r.ok) throw new Error(`查询部署状态失败 ${r.status}`)
    const d = await r.json()
    if (d.state === 'ready') return d
    if (d.state === 'error') throw new Error(`部署失败：${d.error_message || '未知错误'}`)
    await new Promise((res) => setTimeout(res, 2000))
  }
  throw new Error('部署超时（3 分钟）')
}

const final = await waitReady(deploy.id)
console.log(`[5/5] 部署完成：${final.state}`)
console.log(`\n✅ 线上地址：${publicUrl}`)
console.log(`   部署 ID ：${final.id}`)
console.log(`   提交    ：${final.commit_ref || final.title || '-'}`)
