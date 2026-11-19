import dayjs from 'dayjs'
import { pinyin } from 'pinyin-pro'

/* ================================================================== */
/* 学期常量                                                            */
/* ================================================================== */

export interface Semester {
  label: string
  start: string // YYYY-MM-DD
  end: string // YYYY-MM-DD
}

/** 所属学期下拉选项（同时用于「本学期」统计的时间范围判定） */
export const SEMESTERS: Semester[] = [
  { label: '2025-2026 学年 第一学期', start: '2025-09-01', end: '2026-01-31' },
  { label: '2025-2026 学年 第二学期', start: '2026-02-01', end: '2026-07-15' },
  { label: '2026-2027 学年 第一学期', start: '2026-09-01', end: '2027-01-31' },
  { label: '2026-2027 学年 第二学期', start: '2027-02-01', end: '2027-07-15' },
]

export const todayStr = (): string => dayjs().format('YYYY-MM-DD')

/** 今天落在哪个学期区间内；若在假期则返回与今天最近的学期（兜底取第一个） */
export function currentSemesterLabel(): string {
  const t = todayStr()
  const hit = SEMESTERS.find((s) => t >= s.start && t <= s.end)
  if (hit) return hit.label
  // 落在假期：取与今天日期距离最近的学期
  const dist = (s: Semester) =>
    Math.min(
      Math.abs(dayjs(t).diff(dayjs(s.start), 'day')),
      Math.abs(dayjs(t).diff(dayjs(s.end), 'day')),
    )
  const nearest = [...SEMESTERS].sort((a, b) => dist(a) - dist(b))[0]
  return (nearest ?? SEMESTERS[0]).label
}

/* ================================================================== */
/* 姓名首字母 / 排序                                                   */
/* ================================================================== */

/**
 * 取姓名的「首字母串」用于 A→Z 排序：
 *  - 含中文：用 pinyin-pro 取每个字的拼音首字母（如「张三」→ "ZS"）
 *  - 纯英文/数字/混合：去空格后整体大写（如「Alice」→ "ALICE"）
 */
export function getInitials(name: string): string {
  const cleaned = (name ?? '').trim()
  if (!cleaned) return '·'
  const hasChinese = /[一-龥]/.test(cleaned)
  if (hasChinese) {
    try {
      const letters = pinyin(cleaned, {
        pattern: 'first',
        toneType: 'none',
        type: 'array',
      }) as string[]
      const joined = letters.join('').replace(/\s+/g, '').toUpperCase()
      if (joined) return joined
    } catch {
      /* 落到下面的兜底 */
    }
  }
  return cleaned.replace(/\s+/g, '').toUpperCase()
}

export interface NameHolder {
  name: string
  initial?: string
}

/**
 * 按首字母 A→Z 排序；首位相同则比较第二位（即比较完整首字母串），
 * 仍相同再按姓名原文兜底。会就地回填 initial 字段（首字母串，供展示）。
 */
export function sortStudentsByName<T extends NameHolder>(list: T[]): T[] {
  return [...list]
    .map((s) => ({ ...s, initial: getInitials(s.name) }))
    .sort((a, b) => {
      const ka = a.initial ?? ''
      const kb = b.initial ?? ''
      if (ka !== kb) return ka < kb ? -1 : 1
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
    })
}

/* ================================================================== */
/* 统计                                                                */
/* ================================================================== */

export type TimeRangeKey = 'today' | 'week' | 'month' | 'semester'

export const TIME_RANGES: { key: TimeRangeKey; label: string }[] = [
  { key: 'today', label: '今天' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'semester', label: '本学期' },
]

/** 判断一条记录日期是否落在指定时间范围；semester 需传班级所属学期 label */
export function inTimeRange(date: string, range: TimeRangeKey, semesterLabel?: string): boolean {
  if (range === 'today') return date === todayStr()
  if (range === 'week') {
    // 以周一为一周起点
    const ref = dayjs()
    const diff = (ref.day() + 6) % 7
    const start = ref.subtract(diff, 'day').format('YYYY-MM-DD')
    const end = ref.add(6 - diff, 'day').format('YYYY-MM-DD')
    return date >= start && date <= end
  }
  if (range === 'month') return date.startsWith(dayjs().format('YYYY-MM'))
  // semester
  const sem = SEMESTERS.find((s) => s.label === semesterLabel)
  if (!sem) return true // 学期未知时兜底：全部计入
  return date >= sem.start && date <= sem.end
}

export interface HomeworkStudent {
  id: string
  name: string
  initial: string
}

export interface HomeworkEntry {
  studentId: string
  studentName?: string // 登记时快照学生姓名，班级名单修改后仍可显示
  rating: string | null // null = 未交（另类分类）
  note: string
  score?: number | null // 得分（选填）；null/缺失 = 未录入
}

export interface HomeworkRecord {
  id: string
  classId: string
  date: string // YYYY-MM-DD
  content: string
  entries: HomeworkEntry[]
  overallEvaluation?: string // 作业整体评价（选填）
  /** 整体评价的配图（IndexedDB 照片 id 数组，选填） */
  overallImages?: string[]
  createdAt: number
  updatedAt: number
}

export interface PerRecordStat {
  date: string
  content: string
  submitted: number // 已提交（有评级）人数
  total: number // 应提交人数
  rate: number // 0~1
}

export interface ClassStats {
  totalStudents: number
  recordCount: number
  overallRate: number // 整体交齐率 0~1（已提交人次 / 应提交人次）
  distribution: { option: string; count: number }[] // 含「未交」
  perRecord: PerRecordStat[]
}

export interface StudentRecordRow {
  date: string
  content: string
  rating: string | null
  note: string
}

export interface StudentStats {
  totalAssigned: number // 应提交次数
  submitted: number
  rate: number
  rows: StudentRecordRow[]
}

/**
 * 班级整体统计：给定时间范围内的记录 + 班级学生 + 评级选项。
 * 未交 = 评级为 null 的条目（包含「记录创建时该学生尚未加入班级」的情况）。
 */
export function computeClassStats(
  records: HomeworkRecord[],
  students: HomeworkStudent[],
  ratingOptions: string[],
): ClassStats {
  const totalStudents = students.length
  const perRecord: PerRecordStat[] = []
  const distMap = new Map<string, number>()
  ratingOptions.forEach((o) => distMap.set(o, 0))
  distMap.set('未交', 0)

  let totalSubmitted = 0
  let totalExpected = 0

  const sorted = [...records].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  for (const rec of sorted) {
    let submitted = 0
    for (const entry of rec.entries) {
      if (entry.rating && distMap.has(entry.rating)) {
        distMap.set(entry.rating, (distMap.get(entry.rating) ?? 0) + 1)
        submitted += 1
      } else if (entry.rating) {
        // 自定义评级已被删除但仍出现在历史记录里：归入该值
        distMap.set(entry.rating, (distMap.get(entry.rating) ?? 0) + 1)
        submitted += 1
      } else {
        distMap.set('未交', (distMap.get('未交') ?? 0) + 1)
      }
    }
    // 班级后续新增的学生（不在此记录 entries 中）→ 视为未交
    const missing = totalStudents - rec.entries.length
    if (missing > 0) distMap.set('未交', (distMap.get('未交') ?? 0) + missing)

    const expected = Math.max(totalStudents, rec.entries.length)
    totalSubmitted += submitted
    totalExpected += expected

    perRecord.push({
      date: rec.date,
      content: rec.content,
      submitted,
      total: expected,
      rate: expected > 0 ? submitted / expected : 0,
    })
  }

  if (ratingOptions.length === 0) distMap.delete('未交') // 极端情况保护

  const distribution = Array.from(distMap.entries())
    .map(([option, count]) => ({ option, count }))
    .sort((a, b) => {
      if (a.option === '未交') return 1
      if (b.option === '未交') return -1
      return b.count - a.count
    })

  return {
    totalStudents,
    recordCount: records.length,
    overallRate: totalExpected > 0 ? totalSubmitted / totalExpected : 0,
    distribution,
    perRecord,
  }
}

/** 单个学生的详细统计：遍历时间范围内所有记录，取出该生的评级/备注 */
export function computeStudentStats(
  records: HomeworkRecord[],
  student: HomeworkStudent,
): StudentStats {
  const rows: StudentRecordRow[] = []
  let submitted = 0
  const sorted = [...records].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  for (const rec of sorted) {
    const entry = rec.entries.find((e) => e.studentId === student.id)
    if (entry) {
      rows.push({ date: rec.date, content: rec.content, rating: entry.rating, note: entry.note })
      if (entry.rating) submitted += 1
    } else {
      // 该记录发生时此学生尚未加入班级 → 记一次未交
      rows.push({ date: rec.date, content: rec.content, rating: null, note: '（当时尚未入班）' })
    }
  }
  const totalAssigned = rows.length
  return {
    totalAssigned,
    submitted,
    rate: totalAssigned > 0 ? submitted / totalAssigned : 0,
    rows,
  }
}

/* ================================================================== */
/* 单次作业统计                                                        */
/* ================================================================== */

export interface RecordStat {
  total: number // 应提交人数（班级当前人数，取与 entries 较大值）
  submitted: number // 已提交（有评级）人数
  unsubmitted: number // 未提交人数
  rate: number // 完成率 0~1
  hasScore: boolean // 是否存在得分记录
  scoreCount: number // 录入得分的人数
  scoreAvg: number
  scoreMax: number
  scoreMin: number
  ratingDistribution: { option: string; count: number }[] // 各评级人数（含「未交」，按 ratingOptions 排序）
}

/** 单次作业的统计：基于该次记录动态计算；total 取班级人数与 entries 的较大值（与整体统计口径一致） */
export function computeRecordStats(
  record: HomeworkRecord,
  totalStudents: number,
  ratingOptions: string[] = [],
): RecordStat {
  const entries = record.entries ?? []
  const submitted = entries.filter((e) => e.rating).length
  const total = Math.max(totalStudents, entries.length)
  const unsubmitted = Math.max(0, total - submitted)
  const rate = total > 0 ? submitted / total : 0

  const scores = entries
    .map((e) => e.score)
    .filter((s): s is number => typeof s === 'number' && !Number.isNaN(s))
  const hasScore = scores.length > 0
  const scoreAvg = hasScore ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  const scoreMax = hasScore ? Math.max(...scores) : 0
  const scoreMin = hasScore ? Math.min(...scores) : 0

  // 评级分布（含未交），按 ratingOptions 顺序；历史自定义评级不在选项中也保留
  const distMap = new Map<string, number>()
  ratingOptions.forEach((o) => distMap.set(o, 0))
  distMap.set('未交', 0)
  for (const e of entries) {
    if (e.rating) distMap.set(e.rating, (distMap.get(e.rating) ?? 0) + 1)
    else distMap.set('未交', (distMap.get('未交') ?? 0) + 1)
  }
  const ratingDistribution = Array.from(distMap.entries())
    .map(([option, count]) => ({ option, count }))
    .sort((a, b) => {
      if (a.option === '未交') return 1
      if (b.option === '未交') return -1
      const ia = ratingOptions.indexOf(a.option)
      const ib = ratingOptions.indexOf(b.option)
      if (ia === -1 && ib === -1) return b.count - a.count
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })

  return {
    total,
    submitted,
    unsubmitted,
    rate,
    hasScore,
    scoreCount: scores.length,
    scoreAvg,
    scoreMax,
    scoreMin,
    ratingDistribution,
  }
}

/** 整体评价摘要：过长截断（默认前 20 字 + 省略号）；空串返回空串 */
export function summarizeEvaluation(text: string | undefined, max = 20): string {
  const t = (text ?? '').trim()
  if (!t) return ''
  return t.length > max ? `${t.slice(0, max)}…` : t
}
