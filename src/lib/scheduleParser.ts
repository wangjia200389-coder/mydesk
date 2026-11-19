import type { ScheduleEntry } from '@/store/useHomeworkStore'
import { PERIODS } from '@/lib/scheduleTimes'
import {
  cropImageToRect,
  detectTableGrid,
  mapWordsToCells,
  preprocessForOcr,
  type TableGrid,
} from '@/lib/scheduleImageProcessor'
import { recognizeScheduleMarkdown } from '@/lib/cloudOcr'

export interface ParsedScheduleSlot {
  dayOfWeek: number
  startTime: string
  endTime: string
  entries: ScheduleEntry[]
}

const COMMON_SUBJECTS = [
  '语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理',
  '体育', '音乐', '美术', '信息技术', '通用技术', '心理', '班会', '自习',
  '早读', '晨读', '午读', '劳动', '科学', '道法', '品德', '社会',
]

type TesseractWorker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>
let cachedWorker: TesseractWorker | null = null
let cachedWorkerLang: string | null = null

async function getOcrWorker(
  lang = 'chi_sim+eng',
  logger?: OcrProgress,
): Promise<TesseractWorker> {
  if (cachedWorker && cachedWorkerLang === lang) return cachedWorker
  if (cachedWorker) {
    await cachedWorker.terminate()
    cachedWorker = null
  }
  const { createWorker } = await import('tesseract.js')
  cachedWorker = await createWorker(lang, 1, {
    logger: logger ? (m) => logger(m as { status: string; progress: number }) : undefined,
    errorHandler: (e) => console.error('[tesseract]', e),
  })
  cachedWorkerLang = lang
  return cachedWorker
}

export function terminateOcrWorker() {
  if (cachedWorker) {
    void cachedWorker.terminate()
    cachedWorker = null
    cachedWorkerLang = null
  }
}

const PERIOD_DEFAULTS: Record<number, { start: string; end: string }> = Object.fromEntries(
  PERIODS.map((p) => [p.index, { start: p.start, end: p.end }]),
)

function normalize(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\uff08\uff09]/g, '(') // 全角括号
    .replace(/[\uff09]/g, ')')
    .replace(/[\u201c\u201d\u2018\u2019]/g, '')
    .trim()
}

function pickPeriodTime(period: number): { start: string; end: string } {
  return PERIOD_DEFAULTS[period] ?? { start: '08:00', end: '08:45' }
}

function parsePeriod(text: string): { period: number | null; timeRange: string | null } {
  const t = text.trim()
  // 第1节 / 第 1 节 / 1节
  const m1 = t.match(/第?\s*(\d+)\s*节/)
  if (m1) {
    const p = Number(m1[1])
    const { start, end } = pickPeriodTime(p)
    return { period: p, timeRange: `${start}-${end}` }
  }
  // 1-9 节（左列可能只有数字）
  if (/^\d+$/.test(t)) {
    const p = Number(t)
    const { start, end } = pickPeriodTime(p)
    return { period: p, timeRange: `${start}-${end}` }
  }
  // 时间范围 HH:MM-HH:MM
  const m2 = t.match(/(\d{1,2}[:：]\d{2})\s*[-~]\s*(\d{1,2}[:：]\d{2})/)
  if (m2) {
    return { period: null, timeRange: `${m2[1]!.replace(/：/, ':')}-${m2[2]!.replace(/：/, ':')}` }
  }
  return { period: null, timeRange: null }
}

function parseDayHeader(text: string): number {
  const t = text.trim().toLowerCase()
  const map: Record<string, number> = {
    一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7,
    mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
  }
  for (const k of Object.keys(map)) {
    if (t.includes('周' + k) || t.includes('星期' + k) || t.includes(k)) return map[k]!
  }
  const m = t.match(/(\d)/)
  if (m) {
    const n = Number(m[1])
    if (n >= 1 && n <= 7) return n
  }
  return 0
}

function lcsRatio(a: string, b: string): number {
  const s = a.length < b.length ? a : b
  const t = a.length < b.length ? b : a
  const prev = new Array(s.length + 1).fill(0)
  for (let i = 1; i <= t.length; i++) {
    let prevDiagonal = 0
    for (let j = 1; j <= s.length; j++) {
      const temp = prev[j]
      if (t[i - 1] === s[j - 1]) {
        prev[j] = prevDiagonal + 1
      } else {
        prev[j] = Math.max(prev[j], prev[j - 1])
      }
      prevDiagonal = temp
    }
  }
  return prev[s.length] / Math.max(s.length, 1)
}

function findSubjectName(text: string, knownSubjects: string[]): string | null {
  const t = text
  const allCandidates = [...new Set([...knownSubjects, ...COMMON_SUBJECTS])]

  // 1. 优先精确子串匹配（长度降序，避免「地」匹配「地理」）
  for (const name of [...allCandidates].sort((a, b) => b.length - a.length)) {
    if (t.includes(name)) return name
  }

  // 2. 模糊匹配：按字符最长公共子序列比例，OCR 缺字/错字时仍能命中
  let best: string | null = null
  let bestScore = 0
  for (const name of allCandidates) {
    const score = lcsRatio(name, t)
    if (score >= 0.6 && score > bestScore) {
      bestScore = score
      best = name
    }
  }
  return best
}

/** 从一行文本中提取班级编号，如 2403、2404、2414 */
function findClassLabel(text: string): string | null {
  const m = text.match(/(\d{3,4})/)
  if (m) return m[1]!
  const m2 = text.match(/(高一|高二|高三|七年级|八年级|九年级|初一|初二|初三)(\d+|\W?\d+?)班/)
  if (m2) return `${m2[1]}${m2[2].replace(/\D/g, '')}班`
  return null
}

function entryKey(e: Omit<ScheduleEntry, 'isSelf'>): string {
  return `${e.subjectId}|${e.teacherName}|${e.classLabel}`
}

function parseCellEntries(cellText: string, knownSubjects: string[]): Omit<ScheduleEntry, 'isSelf'>[] {
  const entries: Omit<ScheduleEntry, 'isSelf'>[] = []
  if (!cellText.trim()) return entries

  // 年级总课表单元格内常见格式：
  // 1. 科目\n班级\n老师（多行属于同一门课）
  // 2. 科目 老师 班级
  // 3. 科目（老师）班级
  // 4. 多门课用 ; / ； / , / ， / 、 分隔
  // 注意：换行通常不是分隔符，而是同一门课的多行内容（如 Excel 单元格内换行）
  const groups = cellText
    .split(/[;；,，、]/)
    .map((g) => normalize(g).replace(/\n/g, ' ').trim())
    .filter(Boolean)

  for (const group of groups) {
    const entry = parseOneEntry(group, knownSubjects)
    if (entry) entries.push(entry)
  }

  // 去重：同科目+同老师+同班级只保留一条（Excel 截图中常见重复行）
  const seen = new Set<string>()
  return entries.filter((e) => {
    const k = entryKey(e)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** 从一组 token 中识别一个课程条目 */
function parseOneEntry(
  text: string,
  knownSubjects: string[],
): Omit<ScheduleEntry, 'isSelf'> | null {
  if (!text) return null

  // 1. 识别科目
  const subjectName = findSubjectName(text, knownSubjects)

  // 2. 识别班级
  let classLabel = findClassLabel(text)

  // 3. 提取老师名：去掉科目、班级、括号、数字后剩下的短文本
  let rest = text
  if (subjectName) {
    // 只替换完整匹配，避免重复替换
    rest = rest.replace(subjectName, '')
  }
  if (classLabel) {
    rest = rest.replace(classLabel, '')
  }
  rest = rest.replace(/[()（）\[\]]/g, ' ').replace(/\s+/g, ' ').trim()
  // 去掉独立数字（如节次、序号）
  rest = rest.replace(/\b\d{1,2}\b/g, ' ').replace(/\s+/g, ' ').trim()

  const parts = rest.split(' ').filter((x) => x.length >= 1 && x.length <= 6)
  const teacherName = parts[0] ?? ''

  if (!subjectName && !teacherName && !classLabel) return null

  return {
    subjectId: subjectName || '',
    teacherName,
    classLabel: classLabel || undefined,
  }
}

function applySubjectIds(
  entries: Omit<ScheduleEntry, 'isSelf'>[],
  subjectNameToId: Map<string, string>,
  addSubject: (name: string) => string,
): ScheduleEntry[] {
  return entries.map((e) => {
    if (!e.subjectId) return { ...e, subjectId: '', isSelf: false }
    let sid = subjectNameToId.get(e.subjectId)
    if (!sid) {
      sid = addSubject(e.subjectId)
      subjectNameToId.set(e.subjectId, sid)
    }
    return { ...e, subjectId: sid, isSelf: false }
  })
}

/** 解析年级总表：列=星期，行=节次，单元格内可能是多门课 */
export async function parseScheduleExcel(
  file: File,
  addSubject: (name: string) => string,
): Promise<ParsedScheduleSlot[]> {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })

  const allSlots: ParsedScheduleSlot[] = []

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]!
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    if (rows.length === 0) continue

    const headers = Object.keys(rows[0] ?? {})
    // 找星期列索引
    const dayIndexes: { col: string; day: number }[] = []
    for (const h of headers) {
      const day = parseDayHeader(String(rows[0]?.[h] ?? h))
      if (day >= 1 && day <= 7) dayIndexes.push({ col: h, day })
    }

    // 如果第一行不是表头，尝试把每个列头本身当作星期解析
    if (dayIndexes.length === 0) {
      for (const h of headers) {
        const day = parseDayHeader(h)
        if (day >= 1 && day <= 7) dayIndexes.push({ col: h, day })
      }
    }
    if (dayIndexes.length === 0) continue

    const subjectNameToId = new Map<string, string>()

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]!
      const firstCol = String(row[headers[0]!] ?? '')
      const { period, timeRange } = parsePeriod(firstCol)
      if (!period && !timeRange) continue

      const startTime = timeRange ? timeRange.split('-')[0]! : pickPeriodTime(period!).start
      const endTime = timeRange ? timeRange.split('-')[1]! : pickPeriodTime(period!).end

      for (const { col, day } of dayIndexes) {
        const cellText = String(row[col] ?? '')
        const entries = parseCellEntries(cellText, [])
        if (entries.length === 0) continue
        allSlots.push({
          dayOfWeek: day,
          startTime,
          endTime,
          entries: applySubjectIds(entries, subjectNameToId, addSubject),
        })
      }
    }
  }

  return allSlots
}

/** 解析教师个人课表集合：每个 sheet 是教师姓名，单元格内是科目+班级 */
export async function parseTeacherSheetsExcel(
  file: File,
  addSubject: (name: string) => string,
): Promise<ParsedScheduleSlot[]> {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })

  const allSlots: ParsedScheduleSlot[] = []

  for (const sheetName of wb.SheetNames) {
    const teacherName = sheetName.replace(/^Sheet\d*$/, '').trim() || ''
    if (!teacherName) continue // 跳过默认 sheet 名

    const sheet = wb.Sheets[sheetName]!

    // 优先尝试「两行一节」教师个人表（科目行 + (班级)行 成对）
    const paired = parseTeacherSheetPairedRows(XLSX, sheet, teacherName, addSubject)
    if (paired.length > 0) {
      allSlots.push(...paired)
      continue
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    if (rows.length === 0) continue

    const headers = Object.keys(rows[0] ?? {})
    const dayIndexes: { col: string; day: number }[] = []
    for (const h of headers) {
      const day = parseDayHeader(String(rows[0]?.[h] ?? h))
      if (day >= 1 && day <= 7) dayIndexes.push({ col: h, day })
    }
    if (dayIndexes.length === 0) {
      for (const h of headers) {
        const day = parseDayHeader(h)
        if (day >= 1 && day <= 7) dayIndexes.push({ col: h, day })
      }
    }
    if (dayIndexes.length === 0) continue

    const subjectNameToId = new Map<string, string>()

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]!
      const firstCol = String(row[headers[0]!] ?? '')
      const { period, timeRange } = parsePeriod(firstCol)
      if (!period && !timeRange) continue

      const startTime = timeRange ? timeRange.split('-')[0]! : pickPeriodTime(period!).start
      const endTime = timeRange ? timeRange.split('-')[1]! : pickPeriodTime(period!).end

      for (const { col, day } of dayIndexes) {
        const cellText = String(row[col] ?? '')
        const entries = parseCellEntries(cellText, []).map((e) => ({
          ...e,
          teacherName: e.teacherName || teacherName,
        }))
        if (entries.length === 0) continue
        allSlots.push({
          dayOfWeek: day,
          startTime,
          endTime,
          entries: applySubjectIds(entries, subjectNameToId, addSubject),
        })
      }
    }
  }

  return allSlots
}

/**
 * 「两行一节」教师个人表（醴陵二中格式）：
 *   - 列 = 星期一…星期五（表头行）
 *   - 每节占两行：第一行科目（地理/语文…），第二行 (2403历政地) 班级
 *   - 节次列含「第N节」，sheet 名 = 教师姓名
 * 用 header:1 数组方式按原始行读取，把成对的两行合并为一个单元格文本再解析。
 */
function parseTeacherSheetPairedRows(
  XLSX: typeof import('xlsx'),
  sheet: import('xlsx').WorkSheet,
  teacherName: string,
  addSubject: (name: string) => string,
): ParsedScheduleSlot[] {
  const grid = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' })
  if (grid.length < 3) return []

  // 1. 定位星期表头行：单元格含 星期一…星期日 个数 ≥ 2
  let headerRow = -1
  let dayCols: { col: number; day: number }[] = []
  for (let r = 0; r < Math.min(grid.length, 12); r++) {
    const cols: { col: number; day: number }[] = []
    const row = grid[r] ?? []
    for (let c = 0; c < row.length; c++) {
      const day = parseDayHeader(String(row[c] ?? ''))
      if (day >= 1 && day <= 7) cols.push({ col: c, day })
    }
    if (cols.length >= 2) {
      headerRow = r
      dayCols = cols
      break
    }
  }
  if (headerRow < 0) return []

  // 2. 定位节次列：表头下方行里「第N节」出现次数最多的列
  const maxCols = Math.max(...grid.map((r) => r.length), 1)
  let periodCol = -1
  let bestCnt = 0
  for (let c = 0; c < maxCols; c++) {
    if (dayCols.some((d) => d.col === c)) continue
    let cnt = 0
    for (let r = headerRow + 1; r < grid.length; r++) {
      const { period } = parsePeriod(String(grid[r]?.[c] ?? ''))
      if (period) cnt++
    }
    if (cnt > bestCnt) {
      bestCnt = cnt
      periodCol = c
    }
  }
  if (periodCol < 0 || bestCnt < 2) return []

  // 3. 逐行解析；若某行的星期格只有「(2403历政地)」式班级而上一行有科目，则合并到上一行
  const subjectNameToId = new Map<string, string>()
  const out: ParsedScheduleSlot[] = []
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    const { period, timeRange } = parsePeriod(String(row[periodCol] ?? ''))
    if (!period && !timeRange) continue
    const startTime = timeRange ? timeRange.split('-')[0]! : pickPeriodTime(period!).start
    const endTime = timeRange ? timeRange.split('-')[1]! : pickPeriodTime(period!).end

    for (const { col, day } of dayCols) {
      const cur = String(row[col] ?? '').trim()
      const prev = r > headerRow + 1 ? String(grid[r - 1]?.[col] ?? '').trim() : ''
      const next = r + 1 < grid.length ? String(grid[r + 1]?.[col] ?? '').trim() : ''

      // 判断本格是否「纯班级行」：含 (数字 组合) 且不含科目词
      const isClassOnly = /[（(]\s*\d{3,4}/.test(cur) && !findSubjectName(cur, [])
      // 合并策略：科目行 + 紧邻的班级行
      let text = cur
      if (!isClassOnly && /[（(]\s*\d{3,4}/.test(next) && !findSubjectName(next, [])) {
        text = `${cur} ${next}`.trim()
      } else if (isClassOnly && findSubjectName(prev, [])) {
        continue // 已被上一行合并
      }
      if (!text) continue

      const entries = parseCellEntries(text, []).map((e) => ({
        ...e,
        teacherName: e.teacherName || teacherName,
      }))
      if (entries.length === 0) continue
      out.push({
        dayOfWeek: day,
        startTime,
        endTime,
        entries: applySubjectIds(entries, subjectNameToId, addSubject),
      })
    }
  }
  return out
}

export interface OcrWord {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface OcrTable {
  /** 识别到的纯文本 */
  text: string
  /** 按行组织的识别文字块（已合并邻近字） */
  rows: OcrWord[][]
  /** 图片尺寸 */
  width: number
  height: number
  /** 检测到的表格网格（如有） */
  grid?: TableGrid
}

export type OcrProgress = (progress: { status: string; progress: number }) => void

/** 用 tesseract.js 对图片做 OCR，返回带位置信息的文字块（worker 会复用） */
export async function ocrScheduleImage(
  file: File | Blob,
  onProgress?: OcrProgress,
): Promise<OcrTable> {
  const worker = await getOcrWorker('chi_sim+eng', onProgress)
  const imageForOcr = file instanceof File ? file : new File([file], 'ocr.jpg', { type: 'image/jpeg' })
  const ret = await worker.recognize(imageForOcr)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = ret.data as any
  const rawWords: OcrWord[] =
    (data.words as Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }>)?.map(
      (w) => ({
        text: w.text,
        x0: w.bbox.x0,
        y0: w.bbox.y0,
        x1: w.bbox.x1,
        y1: w.bbox.y1,
      }),
    ) ?? []

  const merged = mergeNearbyWords(rawWords)
  const rows = clusterWordsIntoRows(merged)

  // 图片尺寸兜底
  const firstLine = data.lines?.[0]
  const lastLine = data.lines?.[data.lines.length - 1]
  const width = firstLine?.bbox?.x1 ?? 1000
  const height = lastLine?.bbox?.y1 ?? width * 1.4

  return {
    text: data.text ?? '',
    rows,
    width,
    height,
  }
}

/** 把相邻且同一行的文字块合并成词/短语（解决中文逐字识别） */
function mergeNearbyWords(words: OcrWord[]): OcrWord[] {
  if (words.length === 0) return []
  const sorted = [...words].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
  const out: OcrWord[] = [sorted[0]!]

  for (let i = 1; i < sorted.length; i++) {
    const w = sorted[i]!
    const last = out[out.length - 1]!
    const h = Math.max(last.y1 - last.y0, w.y1 - w.y0)
    const overlapY = Math.min(last.y1, w.y1) - Math.max(last.y0, w.y0)
    const gapX = w.x0 - last.x1

    // 同一行、水平距离很近（中文通常贴在一起）则合并
    if (overlapY > h * 0.35 && gapX < h * 1.8 && gapX > -h * 0.3) {
      last.text += gapX > h * 0.25 ? ` ${w.text}` : w.text
      last.x1 = Math.max(last.x1, w.x1)
      last.y0 = Math.min(last.y0, w.y0)
      last.y1 = Math.max(last.y1, w.y1)
    } else {
      out.push(w)
    }
  }
  return out
}

/** 按 y 坐标把文字块聚类成行 */
function clusterWordsIntoRows(words: OcrWord[]): OcrWord[][] {
  if (words.length === 0) return []
  const sorted = [...words].sort((a, b) => a.y0 - b.y0)
  const rows: OcrWord[][] = [[sorted[0]!]]

  for (let i = 1; i < sorted.length; i++) {
    const w = sorted[i]!
    const cy = (w.y0 + w.y1) / 2
    let placed = false
    for (const row of rows) {
      const rowCy = row.reduce((sum, x) => sum + (x.y0 + x.y1) / 2, 0) / row.length
      const h = row.reduce((max, x) => Math.max(max, x.y1 - x.y0), 0)
      if (Math.abs(cy - rowCy) < h * 0.65) {
        row.push(w)
        placed = true
        break
      }
    }
    if (!placed) rows.push([w])
  }
  return rows.map((r) => r.sort((a, b) => a.x0 - b.x0))
}

export interface OcrTableColumn {
  day: number
  /** 列中心 x 坐标 */
  x: number
}

export interface OcrTableRow {
  period: number
  /** 行中心 y 坐标 */
  y: number
}

export interface OcrTableCell {
  day: number
  period: number
  text: string
  x: number
  y: number
}

/** 从 OCR 行结构中识别表格表头（星期列 + 节次行） */
export function detectOcrTableStructure(rows: OcrWord[][]): {
  dayHeaderRow: number
  dayColumns: OcrTableColumn[]
  periodColStart: number
  periodColEnd: number
  periodRows: OcrTableRow[]
} | null {
  if (rows.length < 3) return null

  // 1. 找星期表头行：包含最多星期词的行
  let bestHeaderRow = -1
  let bestDayCols: OcrTableColumn[] = []
  let bestScore = 0

  for (let i = 0; i < rows.length; i++) {
    const cols: OcrTableColumn[] = []
    for (const w of rows[i]!) {
      const day = parseDayHeader(w.text)
      if (day >= 1 && day <= 7) {
        cols.push({ day, x: (w.x0 + w.x1) / 2 })
      }
    }
    if (cols.length > bestScore) {
      bestScore = cols.length
      bestDayCols = cols
      bestHeaderRow = i
    }
  }
  if (bestHeaderRow < 0 || bestDayCols.length < 2) return null

  // 按列中心排序
  bestDayCols.sort((a, b) => a.x - b.x)

  // 2. 估算左侧节次列范围：取星期表头左侧第一个词与最左边缘之间
  const firstDayX = bestDayCols[0]?.x ?? 0
  const periodColEnd = firstDayX - 20
  const periodColStart = 0

  // 3. 找节次行：在星期表头下方的行，左侧有「第N节」或纯数字
  const periodRows: OcrTableRow[] = []
  for (let i = bestHeaderRow + 1; i < rows.length; i++) {
    const row = rows[i]!
    const leftWords = row.filter((w) => w.x1 <= periodColEnd + 30)
    const combined = leftWords.map((w) => w.text).join('')
    const { period } = parsePeriod(combined)
    if (period && period >= 1 && period <= 15) {
      periodRows.push({ period, y: row.reduce((sum, w) => sum + (w.y0 + w.y1) / 2, 0) / row.length })
    }
  }
  if (periodRows.length === 0) return null

  return {
    dayHeaderRow: bestHeaderRow,
    dayColumns: bestDayCols,
    periodColStart,
    periodColEnd,
    periodRows,
  }
}

/** 根据表格结构把每个文字块映射到单元格 */
export function mapOcrWordsToCells(
  rows: OcrWord[][],
  structure: ReturnType<typeof detectOcrTableStructure>,
): OcrTableCell[] {
  if (!structure) return []
  const { dayHeaderRow, dayColumns, periodColEnd, periodRows } = structure

  const cells: OcrTableCell[] = []
  // 预计算每个 period 行的 y 区间
  const periodRanges: { period: number; y0: number; y1: number }[] = []
  for (let i = 0; i < periodRows.length; i++) {
    const prevY = i === 0 ? (periodRows[0]?.y ?? 0) : periodRows[i - 1]!.y
    const nextY = i === periodRows.length - 1 ? periodRows[i]!.y * 2 - prevY : periodRows[i + 1]!.y
    const y = periodRows[i]!.y
    const y0 = (prevY + y) / 2
    const y1 = (y + nextY) / 2
    periodRanges.push({ period: periodRows[i]!.period, y0, y1 })
  }

  // 预计算每个 day 列的 x 区间
  const dayRanges: { day: number; x0: number; x1: number }[] = []
  for (let i = 0; i < dayColumns.length; i++) {
    const prevX = i === 0 ? 0 : dayColumns[i - 1]!.x
    const nextX = i === dayColumns.length - 1 ? dayColumns[i]!.x * 2 - prevX : dayColumns[i + 1]!.x
    const x = dayColumns[i]!.x
    const x0 = (prevX + x) / 2
    const x1 = (x + nextX) / 2
    dayRanges.push({ day: dayColumns[i]!.day, x0, x1 })
  }

  for (let r = dayHeaderRow + 1; r < rows.length; r++) {
    const row = rows[r]!
    const rowY = row.reduce((sum, w) => sum + (w.y0 + w.y1) / 2, 0) / row.length
    const periodRange = periodRanges.find((p) => rowY >= p.y0 && rowY <= p.y1)
    if (!periodRange) continue

    for (const w of row) {
      const cx = (w.x0 + w.x1) / 2
      if (cx <= periodColEnd) continue // 跳过左侧节次列
      const dayRange = dayRanges.find((d) => cx >= d.x0 && cx <= d.x1)
      if (!dayRange) continue
      cells.push({
        day: dayRange.day,
        period: periodRange.period,
        text: w.text,
        x: cx,
        y: rowY,
      })
    }
  }

  return cells
}

/** 解析 OCR 图片为课程表条目，按表格结构自动映射到星期/节次 */
export async function parseOcrImageTable(
  file: File,
  addSubject: (name: string) => string,
  onProgress?: OcrProgress,
): Promise<ParsedScheduleSlot[]> {
  onProgress?.({ status: 'preprocessing', progress: 0.05 })

  // 第一步：预处理（放大 + 灰度 + 自适应二值化），让表格线与文字更清晰
  let preprocessed: Blob
  try {
    preprocessed = await preprocessForOcr(file)
  } catch {
    preprocessed = file
  }

  // 第二步：用 Canvas 检测表格网格并裁剪
  let grid: TableGrid | null = null
  let imageForOcr: File | Blob = preprocessed

  try {
    grid = await detectTableGrid(preprocessed)
    if (grid && grid.cols.length >= 3 && grid.rows.length >= 3) {
      const cropped = await cropImageToRect(preprocessed, {
        x: grid.x,
        y: grid.y,
        width: grid.width,
        height: grid.height,
      })
      imageForOcr = cropped
      onProgress?.({ status: 'table-detected', progress: 0.15 })
    }
  } catch {
    grid = null
  }

  // 第三步：对裁剪后的图片做 OCR
  const ocr = await ocrScheduleImage(
    imageForOcr instanceof File ? imageForOcr : new File([imageForOcr], file.name, { type: file.type }),
    onProgress,
  )

  // 第三步：如果有网格，用网格线把文字块映射到单元格
  if (grid) {
    const words: OcrWord[] = []
    for (const row of ocr.rows) {
      for (const w of row) words.push(w)
    }
    const mapped = mapWordsToCells(words, grid)
    const grouped = new Map<string, { day: number; period: number; texts: string[] }>()
    for (const c of mapped) {
      const key = `${c.day}-${c.period}`
      const item = grouped.get(key)
      if (item) {
        item.texts.push(c.text)
      } else {
        grouped.set(key, { day: c.day, period: c.period, texts: [c.text] })
      }
    }

    const subjectNameToId = new Map<string, string>()
    const slots: ParsedScheduleSlot[] = []
    for (const { day, period, texts } of grouped.values()) {
      const cellText = texts.join('\n')
      const entries = parseCellEntries(cellText, [])
      if (entries.length === 0) continue
      const { start, end } = pickPeriodTime(period)
      slots.push({
        dayOfWeek: day,
        startTime: start,
        endTime: end,
        entries: applySubjectIds(entries, subjectNameToId, addSubject),
      })
    }
    if (slots.length > 0) return slots
  }

  // 兜底：旧版基于坐标的表格结构识别
  const structure = detectOcrTableStructure(ocr.rows)
  if (!structure) {
    return parseOcrTextFallback(ocr.text, addSubject)
  }

  const cells = mapOcrWordsToCells(ocr.rows, structure)
  const grouped = new Map<string, { day: number; period: number; texts: string[] }>()
  for (const c of cells) {
    const key = `${c.day}-${c.period}`
    const item = grouped.get(key)
    if (item) {
      item.texts.push(c.text)
    } else {
      grouped.set(key, { day: c.day, period: c.period, texts: [c.text] })
    }
  }

  const subjectNameToId = new Map<string, string>()
  const slots: ParsedScheduleSlot[] = []
  for (const { day, period, texts } of grouped.values()) {
    const cellText = texts.join('\n')
    const entries = parseCellEntries(cellText, [])
    if (entries.length === 0) continue
    const { start, end } = pickPeriodTime(period)
    slots.push({
      dayOfWeek: day,
      startTime: start,
      endTime: end,
      entries: applySubjectIds(entries, subjectNameToId, addSubject),
    })
  }

  return slots
}

/** 解析 OCR 文本为课程表（按行），返回可让用户手动映射的草稿 */
export function parseOcrTextFallback(
  text: string,
  addSubject: (name: string) => string,
): ParsedScheduleSlot[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const subjectNameToId = new Map<string, string>()

  const slots: ParsedScheduleSlot[] = []

  for (const line of lines) {
    const entries = parseCellEntries(line, [])
    if (entries.length === 0) continue
    slots.push({
      dayOfWeek: 1,
      startTime: '08:00',
      endTime: '08:45',
      entries: applySubjectIds(entries, subjectNameToId, addSubject),
    })
  }

  return slots
}

/* ───────────────────────── 云端 OCR（TextIn Markdown）解析 ───────────────────────── */

/** 把一行 GFM 表格行按 | 拆成单元格（去掉首尾的空串）；并把单元格内的 <br> 换成空格 */
function splitMdRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s
    .split('|')
    .map((c) => c.replace(/<\s*br\s*\/?\s*>/gi, ' ').replace(/\s+/g, ' ').trim())
}

/**
 * 把 TextIn 返回的 Markdown 解析为课程表条目。
 * 自动识别两种主流版式：
 *   - 方向 A：列 = 星期、行 = 节次（最常见）
 *   - 方向 B：行 = 星期、列 = 节次（转置）
 * 单元格拆分复用 parseCellEntries（与 Excel 解析同一套逻辑）。
 */
export function markdownToSlots(
  markdown: string,
  addSubject: (name: string) => string,
): ParsedScheduleSlot[] {
  const lines = markdown.split('\n')
  const allSlots: ParsedScheduleSlot[] = []
  const subjectNameToId = new Map<string, string>()

  let i = 0
  while (i < lines.length) {
    if (lines[i]!.includes('|')) {
      const table: string[] = []
      while (i < lines.length && lines[i]!.includes('|')) {
        table.push(lines[i]!)
        i++
      }
      allSlots.push(...parseOneMarkdownTable(table, addSubject, subjectNameToId))
    } else {
      i++
    }
  }
  return allSlots
}

function parseOneMarkdownTable(
  table: string[],
  addSubject: (name: string) => string,
  subjectNameToId: Map<string, string>,
): ParsedScheduleSlot[] {
  if (table.length < 3) return [] // 至少需要：表头 + 分隔行 + 1 数据行

  const header = splitMdRow(table[0]!)
  const rows = table.slice(2)

  // 方向 A：列 = 星期
  const colDay = header.map((h) => parseDayHeader(h))
  const dayCols = colDay.filter((d) => d >= 1 && d <= 7).length
  if (dayCols >= 2) {
    // 定位「节次列」：非星期列中，能解析出节次的行数最多的那一列。
    // 兼容前置「上午/下午」时段列（此时节次在第二列）与直接节次在首列两种版式。
    const rowCells = rows.map((r) => splitMdRow(r))
    const maxCols = Math.max(header.length, ...rowCells.map((c) => c.length), 1)
    let periodCol = 0
    let bestCnt = -1
    for (let c = 0; c < maxCols; c++) {
      if (colDay[c] >= 1 && colDay[c] <= 7) continue // 星期列不当节次列
      let cnt = 0
      for (const cells of rowCells) {
        const { period, timeRange } = parsePeriod(cells[c] ?? '')
        if (period || timeRange) cnt++
      }
      if (cnt > bestCnt) {
        bestCnt = cnt
        periodCol = c
      }
    }
    return rows.flatMap((rowLine) => {
      const cells = splitMdRow(rowLine)
      const { period, timeRange } = parsePeriod(cells[periodCol] ?? '')
      if (!period && !timeRange) return []
      const startTime = timeRange ? timeRange.split('-')[0]! : pickPeriodTime(period!).start
      const endTime = timeRange ? timeRange.split('-')[1]! : pickPeriodTime(period!).end
      const out: ParsedScheduleSlot[] = []
      for (let c = 0; c < cells.length; c++) {
        const day = colDay[c] ?? 0
        if (day < 1 || day > 7) continue
        const text = cells[c] ?? ''
        if (!text.trim()) continue
        const entries = parseCellEntries(text, [])
        if (entries.length === 0) continue
        out.push({
          dayOfWeek: day,
          startTime,
          endTime,
          entries: applySubjectIds(entries, subjectNameToId, addSubject),
        })
      }
      return out
    })
  }

  // 方向 B：行 = 星期（转置），表头应为节次
  const rowDay = rows.map((r) => parseDayHeader(splitMdRow(r)[0] ?? ''))
  const dayRows = rowDay.filter((d) => d >= 1 && d <= 7).length
  if (dayRows >= 2) {
    return rows.flatMap((rowLine, r) => {
      const day = rowDay[r] ?? 0
      if (day < 1 || day > 7) return []
      const cells = splitMdRow(rowLine)
      const out: ParsedScheduleSlot[] = []
      for (let c = 1; c < cells.length; c++) {
        const { period, timeRange } = parsePeriod(header[c] ?? '')
        if (!period && !timeRange) continue
        const startTime = timeRange ? timeRange.split('-')[0]! : pickPeriodTime(period!).start
        const endTime = timeRange ? timeRange.split('-')[1]! : pickPeriodTime(period!).end
        const text = cells[c] ?? ''
        if (!text.trim()) continue
        const entries = parseCellEntries(text, [])
        if (entries.length === 0) continue
        out.push({
          dayOfWeek: day,
          startTime,
          endTime,
          entries: applySubjectIds(entries, subjectNameToId, addSubject),
        })
      }
      return out
    })
  }

  return []
}

/** 云端 OCR（TextIn）入口：识别图片 → Markdown → 课程表条目 */
export async function parseOcrImageTableCloud(
  file: File,
  addSubject: (name: string) => string,
  onProgress?: OcrProgress,
): Promise<ParsedScheduleSlot[]> {
  onProgress?.({ status: '云端 OCR 识别中…', progress: 0.15 })
  const md = await recognizeScheduleMarkdown(file, (p) =>
    onProgress?.({ status: '云端 OCR 识别中…', progress: p * 0.9 }),
  )
  onProgress?.({ status: '正在整理表格…', progress: 0.96 })
  const slots = markdownToSlots(md, addSubject)
  onProgress?.({ status: 'done', progress: 1 })
  return slots
}

