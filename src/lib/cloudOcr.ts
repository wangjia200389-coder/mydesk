/**
 * 云端 OCR（TextIn xParse）。
 *
 * 端侧 tesseract.js 对中文课程表图片识别率上不去（尤其手写/截图噪声），
 * 这里改为调用 TextIn 云端 OCR：返回结构化 Markdown（含 GFM 表格），
 * 由 scheduleParser 的 markdownToSlots 复用 Excel 解析的同一套单元格拆分逻辑映射到课程表。
 *
 * 密钥由使用者在「宝宝意见箱 → 开发者配置」里自行填写，只存在本机 localStorage
 * （my-desk:ocr-config），代码里不再内置任何凭据。
 *
 * 说明：浏览器直连第三方 OCR 意味着密钥一定会出现在请求头里，任何人拿到客户端都能取到。
 * 所以这里的定位是「自用工具，使用者填自己的密钥」，不是面向公众的多租户服务。
 * 要给他人提供云端 OCR，正确做法是放一个受控服务端中转：密钥留在服务端，
 * 服务端做身份校验和额度限制。没配置密钥时本模块整体关闭，
 * 课程表导入仍可用 Excel / 手动 / 本地 tesseract 三条路径。
 */

const OCR_CONFIG_KEY = 'my-desk:ocr-config'

export interface OcrConfig {
  provider: 'textin'
  appId: string
  secretCode: string
}

/** 只读本机配置；没有配置就返回 null（云端 OCR 关闭），不回退到任何内置凭据 */
export function loadOcrConfig(): OcrConfig | null {
  try {
    const raw = localStorage.getItem(OCR_CONFIG_KEY)
    if (!raw) return null
    const cfg = JSON.parse(raw) as Partial<OcrConfig>
    if (cfg?.provider === 'textin' && cfg.appId && cfg.secretCode) {
      return { provider: 'textin', appId: cfg.appId.trim(), secretCode: cfg.secretCode.trim() }
    }
    return null
  } catch {
    return null
  }
}

export function saveOcrConfig(cfg: OcrConfig | null) {
  try {
    if (cfg && cfg.appId && cfg.secretCode) {
      localStorage.setItem(
        OCR_CONFIG_KEY,
        JSON.stringify({ provider: 'textin', appId: cfg.appId.trim(), secretCode: cfg.secretCode.trim() }),
      )
    } else {
      localStorage.removeItem(OCR_CONFIG_KEY)
    }
  } catch {
    /* ignore */
  }
}

export function isCloudOcrEnabled(): boolean {
  return loadOcrConfig() != null
}

/** 从 TextIn 返回的 JSON 中抽取 Markdown 文本（兼容多种返回结构） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractMarkdown(json: any): string {
  const r = json?.result
  if (!r) return ''
  if (typeof r === 'string') return r
  if (typeof r.markdown === 'string') return r.markdown
  if (typeof r.text === 'string') return r.text
  if (typeof r.content === 'string') return r.content
  if (Array.isArray(r.pages) && typeof r.pages[0]?.markdown === 'string') return r.pages[0].markdown
  return ''
}

/**
 * 调用 TextIn xParse 云端 OCR，返回 Markdown（含表格）。
 * 失败抛错（带可读中文说明）。
 */
export async function recognizeScheduleMarkdown(
  file: File,
  onProgress?: (p: number) => void,
): Promise<string> {
  const cfg = loadOcrConfig()
  if (!cfg) {
    throw new Error('未配置云端 OCR 密钥：请在「宝宝意见箱 → 开发者配置」中填写 TextIn 的 app-id / secret-code')
  }
  onProgress?.(0.1)
  const buf = await file.arrayBuffer()
  onProgress?.(0.3)

  let res: Response
  try {
    res = await fetch('https://api.textin.com/ai/service/v1/pdf_to_markdown?table_flavor=md', {
      method: 'POST',
      headers: {
        'x-ti-app-id': cfg.appId,
        'x-ti-secret-code': cfg.secretCode,
        'Content-Type': 'application/octet-stream',
      },
      body: buf,
    })
  } catch {
    throw new Error('云端 OCR 网络请求失败，请检查网络后重试')
  }
  onProgress?.(0.8)

  if (!res.ok) {
    let msg = `云端 OCR 请求失败（HTTP ${res.status}）`
    try {
      const j = await res.json()
      if (j?.message || j?.msg) msg = j.message || j.msg
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }

  const json = await res.json().catch(() => null)
  onProgress?.(0.95)
  if (!json || (json?.code !== 0 && json?.code !== 200)) {
    throw new Error(json?.message || json?.msg || '云端 OCR 识别失败')
  }

  const md = extractMarkdown(json)
  if (!md.trim()) {
    throw new Error('云端 OCR 未返回可识别文字，请换一张更清晰、文字更大的截图')
  }
  onProgress?.(1)
  return md
}
