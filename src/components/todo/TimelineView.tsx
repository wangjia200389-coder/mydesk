import { useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { useTodoStore, todayStr, type Todo, type Category } from '@/store/useTodoStore'

/* 布局方式：
 *  - 整体 = 左侧刻度列（64px 宽） + 右侧任务列（flex-1），每行对应 1 小时，行高固定 ROW_HEIGHT=64px
 *  - 任务块在右侧列使用「position: absolute」，top = startMinutes * MINUTE_PX，height = durationMinutes * MINUTE_PX
 *  - 这样可以精确处理 09:30 / 10:45 等非整小时边界（iPhone 日历 / Google 日历风格）
 */
const ROW_HEIGHT = 44 // px，每小时行高（= 60 分钟）；压缩后整体更紧凑、滚动更少
const MINUTE_PX = ROW_HEIGHT / 60 // 每分钟对应的像素高度 ≈ 0.733px
const LEFT_GUTTER = 56 // 左侧刻度列宽度 px（压缩后略收窄）
const TASK_OVERLAP_STEP = 130 // 同一时段多任务重叠时，每个后续块向右缩进的 px

export interface TimelineViewProps {
  activeKey: string
  onEdit: (id: string) => void
  onToggleDone: (id: string) => void
}

/* HH:mm -> 当天 0:00 起的分钟数（0 ~ 1439） */
function toMinutes(hhmm: string | null): number | null {
  if (!hhmm) return null
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(hhmm)
  if (!m) return null
  const h = Math.max(0, Math.min(23, parseInt(m[1], 10)))
  const mm = Math.max(0, Math.min(59, parseInt(m[2], 10)))
  return h * 60 + mm
}

/* 根据 timeSlot / customStart~End 推断任务的 startMinutes/endMinutes（用于未完成任务） */
function inferMinutes(t: Todo): { start: number; end: number } | null {
  if (t.timeSlot === 'custom' && t.customStart && t.customEnd) {
    const s = toMinutes(t.customStart)
    const e = toMinutes(t.customEnd)
    if (s === null || e === null) return null
    const start = Math.min(s, e)
    let end = Math.max(s, e)
    if (end - start < 15) end = start + 15
    return { start, end: Math.min(end, 24 * 60) }
  }
  if (t.timeSlot === 'morning') return { start: 9 * 60, end: 12 * 60 }
  if (t.timeSlot === 'afternoon') return { start: 13 * 60, end: 18 * 60 }
  if (t.timeSlot === 'evening') return { start: 19 * 60, end: 22 * 60 }
  return null
}

/**
 * 【需求3】已完成任务：按 completedAt 推断它落在哪个小时格子
 *  - completedAt 是 ms 时间戳，但只关心"当天是哪一小时完成的"
 *  - 这里传入 activeKey（YYYY-MM-DD）来判断该 completedAt 是否属于当天
 *  - 若不属于当天（比如昨天完成的、或旧数据 completedAt=null），返回 null
 *  - 已完成块在时间轴上是一个 1 小时的格子（从 hh:00 到 hh+1:00），用 done=true 区分样式
 */
function inferDoneMinutes(t: Todo, activeKey: string): { start: number; end: number } | null {
  if (!t.done || !t.completedAt) return null
  const d = dayjs(t.completedAt)
  // 完成 timestamps 必须落在 activeKey 这一天（按本地时区 YYYY-MM-DD 比较）
  if (d.format('YYYY-MM-DD') !== activeKey) return null
  const hour = d.hour()
  const start = hour * 60
  const end = Math.min(start + 60, 24 * 60)
  return { start, end }
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)

export default function TimelineView(props: TimelineViewProps) {
  const todos = useTodoStore((s) => s.todos)
  const ensureCategory = useTodoStore((s) => s.ensureCategory)
  const todayKey = todayStr()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [, forceTick] = useState(0)

  // 每 30 秒刷新一次「当前时间红线」位置（否则分钟推移红线不移动）
  useEffect(() => {
    const id = setInterval(() => forceTick((x) => x + 1), 30 * 1000)
    return () => clearInterval(id)
  }, [])

  // 初始滚动到 06:00 附近（更实用），且仅当 activeKey === todayKey 时
  useEffect(() => {
    if (!scrollRef.current) return
    if (props.activeKey === todayKey) {
      const targetMin = Math.max(0, dayjs().hour() * 60 + dayjs().minute() - 60) // 露出当前时间上方 1 小时
      scrollRef.current.scrollTop = Math.max(0, targetMin * MINUTE_PX - 40)
    } else {
      scrollRef.current.scrollTop = Math.max(0, 6 * 60 * MINUTE_PX - 40) // 默认 06:00
    }
    // 每次切换 activeKey 重新定位
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.activeKey])

  /* 【需求3】筛选当天要展示的任务：
   *  - 未完成：dueDate === activeKey
   *  - 已完成：completedAt 落在 activeKey 这一天（按完成时间归位，而非 dueDate）
   *  - 旧任务若没有 completedAt，则按 dueDate 兜底（避免数据丢失不显示）
   */
  const inDayTodos = useMemo(
    () =>
      todos.filter((t) => {
        if (t.done) {
          if (t.completedAt) {
            return dayjs(t.completedAt).format('YYYY-MM-DD') === props.activeKey
          }
          // 旧数据兜底：没有 completedAt 的已完成任务，按 dueDate 显示
          return t.dueDate === props.activeKey
        }
        return t.dueDate === props.activeKey
      }),
    [todos, props.activeKey],
  )

  /* 计算每个任务在绝对坐标系中的位置 & 重叠缩进 */
  const positioned = useMemo(() => {
    const raw: {
      todo: Todo
      cat: Category
      start: number
      end: number
      top: number
      height: number
      overlapIdx: number
    }[] = []
    for (const t of inDayTodos) {
      // 【需求3】已完成任务：用 completedAt 推断小时格子；
      //  - 旧数据若 completedAt=null，回退用 inferMinutes（timeSlot）→ 实在没有时间段就跳过
      let range: { start: number; end: number } | null
      if (t.done) {
        range = inferDoneMinutes(t, props.activeKey) ?? inferMinutes(t)
      } else {
        range = inferMinutes(t)
      }
      if (!range) continue
      raw.push({
        todo: t,
        cat: ensureCategory(t.categoryId),
        start: range.start,
        end: range.end,
        top: range.start * MINUTE_PX,
        height: Math.max(28, (range.end - range.start) * MINUTE_PX),
        overlapIdx: 0,
      })
    }
    // 按开始时间升序、结束时间降序（长的排前面，方便重叠识别）
    raw.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start
      return b.end - a.end
    })
    // 重叠检测：同一时间段里相交的任务各自向右错开
    for (let i = 0; i < raw.length; i++) {
      const cur = raw[i]!
      let idx = 0
      for (let j = 0; j < i; j++) {
        const prev = raw[j]!
        const intersects = cur.start < prev.end && prev.start < cur.end
        if (intersects && prev.overlapIdx === idx) idx += 1
      }
      cur.overlapIdx = idx
    }
    return raw
  }, [inDayTodos, ensureCategory, props.activeKey])

  const dateLabel = (() => {
    const d = dayjs(props.activeKey)
    const diff = d.diff(dayjs(todayKey).startOf('day'), 'day')
    let suffix = ''
    if (diff === 0) suffix = '（今天）'
    else if (diff === 1) suffix = '（明天）'
    else if (diff === -1) suffix = '（昨天）'
    return d.format('YYYY年MM月DD日 dddd') + suffix
  })()

  // 当前时间（只在 activeKey=今天 时生效），用于红色横线
  const nowMin =
    props.activeKey === todayKey ? dayjs().hour() * 60 + dayjs().minute() : null
  const nowTopPx = nowMin !== null ? nowMin * MINUTE_PX : null

  return (
    <div className="space-y-4">
      {/* 头部信息 */}
      <header className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-ink-800 sm:text-lg">
          🕘 24h 时间轴 · {dateLabel}
        </h2>
      </header>

      {/* 时间轴主体：iPhone 日历风格 */}
      <div className="rounded-3xl border border-petal-100 bg-surface shadow-card">
        <div
          ref={scrollRef}
          className="relative max-h-[calc(100dvh-340px)] min-h-[420px] overflow-y-auto overflow-x-hidden md:max-h-[calc(100vh-260px)] md:min-h-[560px]"
        >
          {/* 容器（24小时总高）；相对定位用于任务块绝对定位 */}
          <div
            className="relative w-full"
            style={{ height: `${24 * ROW_HEIGHT}px` }}
          >
            {/* 每小时一行：左侧刻度 + 右侧分隔横线 */}
            {HOURS.map((h) => {
              const isCurrentHour =
                props.activeKey === todayKey && h === dayjs().hour()
              const timeText = `${h.toString().padStart(2, '0')}:00`
              return (
                <div
                  key={h}
                  className={`absolute left-0 right-0 flex ${
                    isCurrentHour ? 'bg-petal-50/50' : ''
                  }`}
                  style={{ top: `${h * ROW_HEIGHT}px`, height: `${ROW_HEIGHT}px` }}
                >
                  {/* 左侧刻度 */}
                  <div
                    className={`relative flex shrink-0 flex-col items-end pr-2 pt-0 ${
                      isCurrentHour ? 'text-petal-600' : 'text-ink-400'
                    }`}
                    style={{ width: `${LEFT_GUTTER}px` }}
                  >
                    <span
                      className={`-mt-2 text-xs font-semibold tabular-nums ${
                        isCurrentHour ? 'text-petal-600' : 'text-ink-400'
                      }`}
                    >
                      {timeText}
                    </span>
                  </div>

                  {/* 右侧横线区域 */}
                  <div className="relative flex-1">
                    {/* 整小时横线 */}
                    <div
                      className={`absolute left-0 right-0 top-0 border-t ${
                        isCurrentHour ? 'border-petal-300' : 'border-petal-50'
                      }`}
                    />
                    {/* 半小时虚线（更弱的引导线） */}
                    <div
                      className="absolute left-0 right-0 border-t border-dashed border-petal-50"
                      style={{ top: `${ROW_HEIGHT / 2}px` }}
                    />
                  </div>
                </div>
              )
            })}

            {/* 当前时间红色横线（仅今天） */}
            {nowTopPx !== null && (
              <div
                className="pointer-events-none absolute z-30"
                style={{
                  left: 0,
                  right: 0,
                  top: `${nowTopPx}px`,
                }}
              >
                <div className="flex items-center">
                  {/* 左侧红色小圆点（对齐刻度列中部） */}
                  <div
                    className="flex shrink-0 items-center justify-end pr-1.5"
                    style={{ width: `${LEFT_GUTTER}px` }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white shadow-card" />
                  </div>
                  {/* 贯穿右侧的红色横线 */}
                  <div className="relative h-[2px] flex-1 bg-gradient-to-r from-red-500 via-red-400 to-red-300" />
                </div>
              </div>
            )}

            {/* 任务块（绝对定位；iPhone 日历风格） */}
            {positioned.map((p) => {
              const overlapLeft = p.overlapIdx * (TASK_OVERLAP_STEP / 10) // 错开缩进（按百分比减少更稳）
              const done = p.todo.done
              const catColor = categoryToCssColor(p.cat.cardBar)
              // 填充背景：未完成用分类 chip 色（如工作=浅粉、学习=浅紫）铺满名片；已完成用灰调
              const bgClass = done ? 'bg-ink-100/90 ring-ink-200' : `${p.cat.chip.split(' ')[0]} ring-white/70`
              const barColor = done ? '#cbd5e1' : catColor
              return (
                <div
                  key={p.todo.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => props.onEdit(p.todo.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') props.onEdit(p.todo.id)
                  }}
                  className={`group absolute cursor-pointer overflow-hidden rounded-xl pl-2 pr-2.5 py-1.5 text-[12px] leading-tight shadow-sm ring-1 ring-inset transition hover:-translate-y-0.5 hover:shadow-card ${bgClass}`}
                  style={{
                    left: `calc(${LEFT_GUTTER}px + 8px + ${overlapLeft}px)`,
                    right: `${8 + p.overlapIdx * 12}px`,
                    top: `${p.top + 2}px`,
                    height: `${Math.max(32, p.height - 4)}px`,
                  }}
                >
                  {/* 左侧分类颜色竖条 */}
                  <div
                    className="pointer-events-none absolute left-0 top-0 h-full w-1 rounded-l-xl"
                    style={{ backgroundColor: barColor }}
                  />

                  <div className="flex h-full items-start gap-2 pl-1">
                    {/* 复选框：独立的点击区域（stopPropagation 避免触发编辑） */}
                    <label
                      className="mt-0.5 flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={p.todo.done}
                        onChange={() => props.onToggleDone(p.todo.id)}
                      />
                      <span className="flex h-4 w-4 items-center justify-center rounded-md border-2 border-white bg-cream transition ring-1 ring-petal-200 peer-checked:border-petal-500 peer-checked:bg-petal-500 peer-checked:ring-0">
                        <svg
                          viewBox="0 0 20 20"
                          className="h-3 w-3 text-white opacity-0 peer-checked:opacity-100"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                        >
                          <polyline points="4 11 8 15 16 5" />
                        </svg>
                      </span>
                    </label>

                    {/* 任务标题 + 时间 + 分类 */}
                    <div className="min-w-0 flex-1">
                      <div
                        className={`truncate font-semibold text-[13px] ${
                          done ? 'text-ink-400 line-through' : 'text-ink-800'
                        }`}
                        title={p.todo.title}
                      >
                        {p.todo.title}
                      </div>
                      <div
                        className={`mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] ${
                          done ? 'text-ink-400' : 'text-ink-500'
                        }`}
                      >
                        {done && p.todo.completedAt ? (
                          // 已完成：显示实际完成时间（HH:mm）
                          <span className="tabular-nums">✓ {dayjs(p.todo.completedAt).format('HH:mm')}</span>
                        ) : (
                          // 未完成：显示计划时段
                          <span className="tabular-nums">
                            {mmToHHmm(p.start)}–{mmToHHmm(p.end)}
                          </span>
                        )}
                        <span
                          className={`inline-block h-1.5 w-1.5 rounded-full ${p.cat.dot}`}
                          title={p.cat.name}
                        />
                        {p.todo.repeat !== 'once' && <span>🔁</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 图例（仅色块，无解释文字） */}
        <div className="flex flex-wrap items-center gap-4 border-t border-petal-50 px-4 py-3 text-[11px] text-ink-500 sm:text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-6 rounded-md ring-1 ring-inset ring-petal-200/40" style={{ background: 'linear-gradient(135deg, #ffffff 0%, #fdf2f8 100%)' }} />
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-6 rounded-md bg-ink-100 ring-1 ring-inset ring-ink-200 opacity-70" />
          </span>
          {props.activeKey === todayKey && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-1 rounded-sm bg-red-500" />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/* === 工具函数 === */

function mmToHHmm(totalMin: number): string {
  const h = Math.floor(totalMin / 60)
  const m = totalMin - h * 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

/**
 * Tailwind class（如 bg-petal-500 / bg-lavender-500）→ 实际 CSS 颜色值
 * 因为 Tailwind class 在运行时没法直接拿色值，这里用「与预设分类一一对应」的手写 map 做兜底映射；
 * 自定义分类（bg-pink-500 / bg-sky-500 ...）也覆盖了 CUSTOM_COLORS 里的 6 种。
 */
function categoryToCssColor(tailwindClass: string): string {
  const map: Record<string, string> = {
    'bg-petal-500': '#f472b6',
    'bg-lavender-500': '#a78bfa',
    'bg-mint-500': '#34d399',
    'bg-emerald-500': '#10b981',
    'bg-yellow-500': '#eab308',
    'bg-ink-400': '#9ca3af',
    'bg-pink-500': '#ec4899',
    'bg-sky-500': '#0ea5e9',
    'bg-orange-500': '#f97316',
    'bg-violet-500': '#8b5cf6',
    'bg-teal-500': '#14b8a6',
    'bg-fuchsia-500': '#d946ef',
  }
  return map[tailwindClass] ?? '#cbd5e1'
}

