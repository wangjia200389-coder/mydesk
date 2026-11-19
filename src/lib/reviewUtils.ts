import dayjs from 'dayjs'
import type { ReviewDay } from '@/store/useReviewStore'

export const REVIEW_DATE_FMT = 'YYYY-MM-DD'

/** 睡眠时长（跨零点按 +24h 算）；任一时间为空返回 null */
export function sleepMinutes(sleepAt: string, wakeAt: string): number | null {
  if (!sleepAt || !wakeAt) return null
  const [h1, m1] = sleepAt.split(':').map(Number)
  const [h2, m2] = wakeAt.split(':').map(Number)
  if ([h1, m1, h2, m2].some((n) => Number.isNaN(n))) return null
  let diff = h2 * 60 + m2 - (h1 * 60 + m1)
  if (diff <= 0) diff += 24 * 60
  return diff
}

export function formatDuration(mins: number) {
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 平均睡眠分钟数；没有可算的记录返回 null */
export function averageSleep(days: ReviewDay[]): number | null {
  const mins = days
    .map((d) => sleepMinutes(d.sleepAt, d.wakeAt))
    .filter((x): x is number => x !== null)
  if (!mins.length) return null
  return mins.reduce((a, b) => a + b, 0) / mins.length
}

/** 连续记录天数：今天没写不立刻断，从昨天往前数 */
export function reviewStreak(days: ReviewDay[]): number {
  const set = new Set(days.map((d) => d.date))
  let cur = dayjs().startOf('day')
  if (!set.has(cur.format(REVIEW_DATE_FMT))) cur = cur.subtract(1, 'day')
  let n = 0
  while (set.has(cur.format(REVIEW_DATE_FMT))) {
    n += 1
    cur = cur.subtract(1, 'day')
  }
  return n
}
