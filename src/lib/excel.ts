/**
 * 解析上传的 Excel 名单，提取学生姓名列。
 * xlsx 体积较大且仅在建班时用到，故按需动态导入，避免拖慢首屏。
 * 逻辑：
 *  1. 取第一个工作表；
 *  2. 逐行扫描，找到含「姓名 / 名字 / name」表头的行作为表头行，其所在列即姓名列；
 *  3. 若找不到表头，默认取第 0 列，且所有行均为姓名（无表头场景）；
 *  4. 提取姓名、去空格、过滤空值、按出现顺序去重。
 */
export async function parseRosterExcel(file: File): Promise<string[]> {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return []
  const sheet = wb.Sheets[sheetName]
  if (!sheet) return []

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
  }) as unknown[][]

  // 表头探测：第一处出现「姓名/名字/name」的单元格，记录 (行, 列)
  let headerRow = -1
  let nameCol = 0
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    if (!Array.isArray(row)) continue
    const idx = row.findIndex(
      (c) => typeof c === 'string' && /(姓名|名字|name)/i.test(c.trim()),
    )
    if (idx >= 0) {
      headerRow = r
      nameCol = idx
      break
    }
  }

  const names: string[] = []
  const seen = new Set<string>()
  const add = (raw: unknown) => {
    const text = typeof raw === 'string' ? raw.trim() : raw != null ? String(raw).trim() : ''
    if (!text) return
    const key = text.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    names.push(text)
  }

  if (headerRow >= 0) {
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r]
      if (!Array.isArray(row)) continue
      add(row[nameCol])
    }
  } else {
    // 无表头：直接取第 0 列
    for (const row of rows) {
      if (!Array.isArray(row)) continue
      add(row[0])
    }
  }

  return names
}

/* ------------------------------------------------------------------ */
/* 成绩导入                                                            */
/* ------------------------------------------------------------------ */

export interface ScoreRow {
  name: string
  score: number | null
}

/**
 * 解析上传的成绩 Excel，提取「姓名 + 分数」两列。
 * 兼容微信/QQ 导出的常见表格：
 *  1. 取第一个工作表；
 *  2. 自动探测「姓名/名字/name」列与「分数/成绩/得分/score」列；
 *  3. 找不到表头时，默认第 0 列为姓名、第 1 列为分数；
 *  4. 逐行提取，空姓名/空分数跳过。
 */
export async function parseScoreExcel(file: File): Promise<ScoreRow[]> {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return []
  const sheet = wb.Sheets[sheetName]
  if (!sheet) return []

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
  }) as unknown[][]

  let nameCol = -1
  let scoreCol = -1
  let headerRow = -1
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    if (!Array.isArray(row)) continue
    row.forEach((c, ci) => {
      if (typeof c !== 'string') return
      const t = c.trim()
      if (nameCol < 0 && /(姓名|名字|name)/i.test(t)) nameCol = ci
      if (scoreCol < 0 && /(分数|成绩|得分|score|分值)/i.test(t)) scoreCol = ci
    })
    if (nameCol >= 0 || scoreCol >= 0) {
      headerRow = r
      break
    }
  }
  if (nameCol < 0) nameCol = 0
  if (scoreCol < 0) scoreCol = 1

  const out: ScoreRow[] = []
  const start = headerRow >= 0 ? headerRow + 1 : 0
  const seen = new Set<string>()
  for (let r = start; r < rows.length; r++) {
    const row = rows[r]
    if (!Array.isArray(row)) continue
    const rawName = row[nameCol]
    const name = (typeof rawName === 'string' ? rawName : rawName != null ? String(rawName) : '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const rawScore = row[scoreCol]
    let score: number | null = null
    if (rawScore != null && String(rawScore).trim() !== '') {
      const n = Number(rawScore)
      if (!Number.isNaN(n)) score = n
    }
    out.push({ name, score })
  }
  return out
}
