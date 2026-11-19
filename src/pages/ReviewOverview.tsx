import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { useReviewStore, type ReviewDay } from '@/store/useReviewStore'
import {
  REVIEW_DATE_FMT,
  averageSleep,
  formatDuration,
  reviewStreak,
  sleepMinutes,
} from '@/lib/reviewUtils'

dayjs.locale('zh-cn')

type Range = 'week' | 'month' | 'year'

const RANGES: { key: Range; label: string }[] = [
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'year', label: '今年' },
]

interface Bar {
  key: string
  label: string
  /** 平均睡眠分钟数，null 表示这段时间没有数据 */
  value: number | null
}

function rangeStart(range: Range) {
  const now = dayjs()
  if (range === 'week') {
    // 周一为一周起点
    return now.subtract((now.day() + 6) % 7, 'day').startOf('day')
  }
  if (range === 'month') return now.startOf('month')
  return now.startOf('year')
}

function buildBars(range: Range, days: ReviewDay[]): Bar[] {
  const now = dayjs()

  if (range === 'week') {
    const monday = rangeStart('week')
    const byDate = new Map(days.map((d) => [d.date, d]))
    return Array.from({ length: 7 }, (_, i) => {
      const date = monday.add(i, 'day')
      const day = byDate.get(date.format(REVIEW_DATE_FMT))
      return {
        key: date.format(REVIEW_DATE_FMT),
        label: ['一', '二', '三', '四', '五', '六', '日'][i],
        value: day ? sleepMinutes(day.sleepAt, day.wakeAt) : null,
      }
    })
  }

  if (range === 'month') {
    const start = now.startOf('month')
    const total = now.daysInMonth()
    const bars: Bar[] = []
    let week = 0
    for (let day = 1; day <= total; day += 7) {
      const from = start.date(day).format(REVIEW_DATE_FMT)
      const to = start.date(Math.min(day + 6, total)).format(REVIEW_DATE_FMT)
      const inWeek = days.filter((d) => d.date >= from && d.date <= to)
      week += 1
      bars.push({ key: `w${week}`, label: String(week), value: averageSleep(inWeek) })
    }
    return bars
  }

  return Array.from({ length: 12 }, (_, i) => {
    const inMonth = days.filter((d) => {
      const dj = dayjs(d.date)
      return dj.year() === now.year() && dj.month() === i
    })
    return { key: `m${i}`, label: String(i + 1), value: averageSleep(inMonth) }
  })
}

function Stat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-semibold text-ink-900">{value}</span>
        {unit && <span className="text-[11px] text-ink-400">{unit}</span>}
      </div>
      <div className="mt-1 text-[11px] text-ink-400">{label}</div>
    </div>
  )
}

export default function ReviewOverview() {
  const navigate = useNavigate()
  const days = useReviewStore((s) => s.days)
  const [range, setRange] = useState<Range>('week')

  const start = rangeStart(range).format(REVIEW_DATE_FMT)
  const today = dayjs().format(REVIEW_DATE_FMT)

  const filtered = useMemo(
    () => days.filter((d) => d.date >= start && d.date <= today),
    [days, start, today],
  )

  const avg = averageSleep(filtered)
  const streak = reviewStreak(days)
  const bars = useMemo(() => buildBars(range, days), [range, days])
  // 以 9 小时为基准，睡眠普遍偏短时也能看出高低差；只有超过 9 小时才按实际峰值缩放
  const peak = Math.max(540, ...bars.map((b) => b.value ?? 0))

  return (
    <div className="mx-auto max-w-2xl px-5 py-6 md:px-8 md:py-10">
      <header className="mb-6 flex items-center gap-2 md:pr-28">
        <button
          type="button"
          onClick={() => navigate('/review')}
          title="返回复盘"
          className="-ml-2 flex h-8 w-8 items-center justify-center rounded-lg text-base text-ink-400 transition hover:bg-cream-deep/60 hover:text-ink-700 active:scale-95"
        >
          ‹
        </button>
        <h1 className="text-xl font-semibold text-ink-900 md:text-2xl">复盘总览</h1>
      </header>

      {/* 范围 */}
      <div className="mb-6 flex gap-1 rounded-full bg-cream/80 p-1">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRange(r.key)}
            className={`flex-1 rounded-full py-1.5 text-xs transition ${
              range === r.key
                ? 'bg-surface font-medium text-ink-900 shadow-sm'
                : 'text-ink-400 hover:text-ink-500'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* 数字 */}
      <div className="grid grid-cols-3 gap-3">
        <Stat value={String(filtered.length)} unit="天" label="记录" />
        <Stat
          value={avg === null ? '—' : (avg / 60).toFixed(1)}
          unit={avg === null ? undefined : '小时'}
          label="平均睡眠"
        />
        <Stat value={String(streak)} unit="天" label="连续记录" />
      </div>

      {/* 睡眠 */}
      <section className="mt-9">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-ink-700">睡眠</h2>
          <span className="text-[11px] text-ink-400/70">
            {range === 'week' ? '每天' : range === 'month' ? '按周平均' : '按月平均'}
          </span>
        </div>

        {filtered.length === 0 ? (
          <p className="py-8 text-center text-xs text-ink-400/60">
            这段时间还没有记录
          </p>
        ) : (
          <div className="flex h-32 gap-1.5">
            {bars.map((b) => {
              const pct = b.value ? Math.max(8, (b.value / peak) * 100) : 0
              return (
                <div key={b.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div className="flex w-full flex-1 items-end justify-center">
                    {b.value ? (
                      <div
                        className="w-full max-w-[34px] rounded-t-[6px] bg-petal-300 transition hover:bg-petal-400"
                        style={{ height: `${pct}%` }}
                        title={`${formatDuration(b.value)}`}
                      />
                    ) : (
                      <div className="h-1 w-full max-w-[34px] rounded-full bg-cream-deep/60" />
                    )}
                  </div>
                  <span className="text-[10px] text-ink-400/70">{b.label}</span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {avg !== null && filtered.length > 0 && (
        <p className="mt-6 text-xs leading-relaxed text-ink-400">
          这段时间写了 {filtered.length} 天，平均睡 {(avg / 60).toFixed(1)} 小时
          {avg < 420 ? '，偏少一些。' : avg > 540 ? '，睡得挺足。' : '。'}
        </p>
      )}
    </div>
  )
}
