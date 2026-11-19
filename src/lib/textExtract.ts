/* 从上传文件中尽量提取纯文本，用于全局搜索建索引。
 * - 原生可读：txt / md / csv（File.text）
 * - xlsx / xls：复用已安装的 xlsx 包解析各工作表
 * - 图片 / pdf / docx / pptx：浏览器无原生文本提取能力，返回空串（仅按文件名检索）
 * 返回空串均为「合法降级」，调用方应回退到文件名搜索。 */

export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  const mime = file.type

  const isPlain =
    name.endsWith('.txt') ||
    name.endsWith('.md') ||
    name.endsWith('.csv') ||
    mime === 'text/plain' ||
    mime === 'text/markdown' ||
    mime === 'text/csv'

  if (isPlain) {
    try {
      return (await file.text()).slice(0, 20000)
    } catch {
      return ''
    }
  }

  const isExcel =
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    mime.includes('spreadsheet') ||
    mime.includes('excel')

  if (isExcel) {
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const parts: string[] = []
      for (const sn of wb.SheetNames) {
        const ws = wb.Sheets[sn]
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
          header: 1,
          defval: '',
        })
        for (const row of rows) parts.push((row as unknown[]).join(' '))
      }
      return parts.join('\n').slice(0, 20000)
    } catch {
      return ''
    }
  }

  return ''
}
