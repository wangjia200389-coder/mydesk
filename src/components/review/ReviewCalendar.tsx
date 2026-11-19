import { useMemo, useState } from 'react'
import dayjs from 'dayjs'

interface Props {
  /** 当前正在看的那天 */
  date: string
  /** 有复盘记录的日期（YYYY-MM-DD），用来打点 */
  marked: Set<string>
  onPick: (date: string) => void
  onClose: () => void
}

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日']

/** 复盘日历：月视图，有记录的日子打一个小圆点 */
export default function ReviewCalendar({ date, marked, onPick, onClose }: Props) {
  const [view, setView] = useState(() => dayjs(date).startOf('month'))
  const today = dayjs().format('YYYY-MM-DD')

  const cells = useMemo(() => {
    const first = view.startOf('month')
    const total = view.daysInMonth()
    // 周一为一周起始：day() 里 0 是周日，换算成 0=周一
    const lead = (first.day() + 6) % 7
    const list: (string | null)[] = Array.from({ length: lead }, () => null)
    for (let i = 1; i <= total; i += 1) {
      list.push(first.date(i).format('YYYY-MM-DD'))
    }
    return list
  }, [view])

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink-900/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-sm rounded-t-3xl bg-surface p-5 shadow-soft sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setView((v) => v.subtract(1, 'month'))}
            title="上个月"
            className="flex h-8 w-8 items-center justify-center rounded-full text-base text-ink-400 transition hover:bg-cream/70 hover:text-ink-700"
          >
            ‹
          </button>
          <span className="text-sm font-semibold text-ink-900">
            {view.format('YYYY 年 M 月')}
          </span>
          <button
            type="button"
            onClick={() => setView((v) => v.add(1, 'month'))}
            title="下个月"
            className="flex h-8 w-8 items-center justify-center rounded-full text-base text-ink-400 transition hover:bg-cream/70 hover:text-ink-700"
          >
            ›
          </button>
        </div>

        <div className="mb-1 grid grid-cols-7 text-center text-[11px] text-ink-400">
          {WEEK_LABELS.map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((d, i) => {
            if (!d) return <div key={`blank-${i}`} />
            const isToday = d === today
            const isSelected = d === date
            const has = marked.has(d)
            return (
              <button
                key={d}
                type="button"
                onClick={() => onPick(d)}
                className="relative flex h-9 flex-col items-center justify-center text-[13px] transition"
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                    isSelected
                      ? 'bg-petal-400 font-semibold text-white'
                      : isToday
                        ? 'text-petal-600 ring-1 ring-petal-300'
                        : 'text-ink-700 hover:bg-cream/70'
                  }`}
                >
                  {dayjs(d).date()}
                </span>
                {has && !isSelected && (
                  <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-petal-400" />
                )}
              </button>
            )
          })}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPick(today)}
            className="flex-1 rounded-xl bg-cream/70 py-2 text-xs font-medium text-ink-500 transition hover:bg-cream-deep active:scale-[0.99]"
          >
            回到今天
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs text-ink-400 transition hover:text-ink-700"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
