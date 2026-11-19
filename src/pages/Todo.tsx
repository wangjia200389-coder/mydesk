import { useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'
import {
  useTodoStore,
  todayStr,
  type ViewMode,
} from '@/store/useTodoStore'
import TodoForm from '@/components/todo/TodoForm'
import CongratsToast from '@/components/todo/CongratsToast'
import CategoryView from '@/components/todo/CategoryView'
import TimelineView from '@/components/todo/TimelineView'
import ShoppingCart from '@/components/todo/ShoppingCart'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

/* ======= 全年日历弹窗（按月切换，覆盖今年全年） ======= */
function YearCalendarPanel(props: {
  open: boolean
  onClose: () => void
  value: string
  onChange: (ymd: string) => void
}) {
  const [viewMonth, setViewMonth] = useState<dayjs.Dayjs>(() => dayjs(props.value).startOf('month'))

  useEffect(() => {
    if (props.open) setViewMonth(dayjs(props.value).startOf('month'))
  }, [props.open, props.value])

  if (!props.open) return null

  const year = viewMonth.year()
  const month = viewMonth.month()
  const firstDay = viewMonth.startOf('month')
  const totalDays = viewMonth.daysInMonth()
  const startWeekday = firstDay.isoWeekday() % 7 // 0=周日
  const today = todayStr()
  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

  // 今年范围限制（1月~12月）
  const canPrevMonth = month > 0
  const canNextMonth = month < 11

  const cells: (dayjs.Dayjs | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(dayjs(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`))
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/20 p-3 pt-20 backdrop-blur-[2px] sm:items-center sm:pt-0"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose()
      }}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-petal-100 bg-surface p-4 shadow-soft sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部：年份 + 月份切换 */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => props.onChange(today)}
            className="rounded-xl bg-petal-100 px-3 py-1.5 text-xs font-semibold text-petal-700 ring-1 ring-petal-200 hover:bg-petal-200"
          >
            回到今天 ☀️
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!canPrevMonth}
              onClick={() => setViewMonth((m) => m.subtract(1, 'month'))}
              className="rounded-lg px-2 py-1 text-ink-500 transition hover:bg-petal-50 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              ‹
            </button>
            <div className="min-w-[120px] text-center text-sm font-semibold text-ink-800">
              {year} 年 {month + 1} 月
            </div>
            <button
              type="button"
              disabled={!canNextMonth}
              onClick={() => setViewMonth((m) => m.add(1, 'month'))}
              className="rounded-lg px-2 py-1 text-ink-500 transition hover:bg-petal-50 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              ›
            </button>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-lg px-2 py-1 text-ink-400 transition hover:bg-petal-50 hover:text-ink-700"
          >
            ✕
          </button>
        </div>

        {/* 星期标题 */}
        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-ink-400">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={`py-1 ${i === 0 || i === 6 ? 'text-petal-400' : ''}`}>
              {w}
            </div>
          ))}
        </div>

        {/* 日期格子 */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((c, i) => {
            if (!c) return <div key={i} />
            const ymd = c.format('YYYY-MM-DD')
            const isToday = ymd === today
            const isSelected = ymd === props.value
            const isPast = c.isBefore(dayjs(today).startOf('day'), 'day')
            const weekend = i % 7 === 0 || i % 7 === 6
            return (
              <button
                key={ymd}
                type="button"
                onClick={() => {
                  props.onChange(ymd)
                  props.onClose()
                }}
                className={`relative flex aspect-square items-center justify-center rounded-xl text-xs font-medium transition sm:text-sm ${
                  isSelected
                    ? 'bg-gradient-to-br from-petal-400 to-petal-500 text-white shadow-soft'
                    : isToday
                      ? 'bg-petal-100 text-petal-700 ring-2 ring-petal-300'
                      : isPast
                        ? weekend
                          ? 'text-petal-300/60 hover:bg-petal-50/60'
                          : 'text-ink-300 hover:bg-ink-50'
                        : weekend
                          ? 'text-petal-500 hover:bg-petal-50'
                          : 'text-ink-600 hover:bg-petal-50'
                }`}
              >
                {c.date()}
                {isToday && !isSelected && (
                  <span className="absolute bottom-1 h-1 w-1 rounded-full bg-petal-500" />
                )}
              </button>
            )
          })}
        </div>

        {/* 底部说明 */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-400">
          <span>
            {year}-01-01 ~ {year}-12-31
          </span>
        </div>
      </div>
    </div>
  )
}

function CartButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="购物清单"
      className={`relative flex h-9 w-9 items-center justify-center rounded-full text-lg shadow-card ring-1 transition hover:bg-petal-50 md:h-11 md:w-11 ${
        open ? 'bg-petal-100 ring-petal-300' : 'bg-surface ring-petal-100'
      }`}
    >
      🛒
    </button>
  )
}

export default function Todo() {
  const toggleTodo = useTodoStore((s) => s.toggleTodo)
  const lastCompletedTick = useTodoStore((s) => s.lastCompletedTick)
  const setViewMode = useTodoStore((s) => s.setViewMode)
  const setActiveDateKey = useTodoStore((s) => s.setActiveDateKey)

  // 读取持久化值（store 里 activeDateKey / viewMode 已经经过 onRehydrateStorage 兜底）
  const storedActive = useTodoStore((s) => s.activeDateKey)
  const storedView = useTodoStore((s) => s.viewMode)

  const [formOpen, setFormOpen] = useState(false)
  const [seedDue, setSeedDue] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [congratsKey, setCongratsKey] = useState(0)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)

  // 【需求：打开页面默认呈现今天】
  // 初次挂载强制跳到今天（覆盖 localStorage 残留的任何日期），
  // 之后用户在本次会话中的切换正常生效（effect 只跑一次 [] 依赖）
  useEffect(() => {
    setActiveDateKey(todayStr())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // activeKey：一定是 YYYY-MM-DD（v4 起已经没有 inbox 概念）
  const activeKey: string =
    typeof storedActive === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(storedActive)
      ? storedActive
      : todayStr()

  const viewMode: ViewMode = storedView === 'timeline' ? 'timeline' : 'category'

  // 完成特效：监听 store 的 lastCompletedTick
  const lastTickRef = useRef(lastCompletedTick)
  useEffect(() => {
    if (lastCompletedTick !== lastTickRef.current) {
      lastTickRef.current = lastCompletedTick
      setCongratsKey((k) => k + 1)
    }
  }, [lastCompletedTick])

  const onToggleDone = (id: string) => {
    // 完成/取消完成：所有内部逻辑（重复任务生成 + 特效 tick + 从 boardOrder 移除）都在 toggleTodo 里
    toggleTodo(id)
  }

  const openCreate = (seed: string | null) => {
    setEditingId(null)
    setSeedDue(seed)
    setFormOpen(true)
  }

  const openEdit = (id: string) => {
    setEditingId(id)
    setFormOpen(true)
  }

  // 桌面端头部日期显示文字
  const activeDateLabel = useMemo(() => {
    const d = dayjs(activeKey)
    const diff = d.diff(dayjs(todayStr()).startOf('day'), 'day')
    let rel = ''
    if (diff === 0) rel = '（今天）'
    else if (diff === 1) rel = '（明天）'
    else if (diff === 2) rel = '（后天）'
    else if (diff === -1) rel = '（昨天）'
    else if (diff === -2) rel = '（前天）'
    return `${d.format('YYYY 年 M 月 D 日')} ${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.isoWeekday() % 7]} ${rel}`
  }, [activeKey])

  // 移动端紧凑日期标签
  const activeDateCompact = useMemo(() => {
    const d = dayjs(activeKey)
    const diff = d.diff(dayjs(todayStr()).startOf('day'), 'day')
    if (diff === 0) return '今天'
    if (diff === 1) return '明天'
    if (diff === -1) return '昨天'
    return d.format('M月D日')
  }, [activeKey])

  const shiftDay = (delta: number) => {
    setActiveDateKey(dayjs(activeKey).add(delta, 'day').format('YYYY-MM-DD'))
  }

  return (
    <div className="todo-page mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <CongratsToast tick={congratsKey} />
      <YearCalendarPanel
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        value={activeKey}
        onChange={(ymd) => setActiveDateKey(ymd)}
      />

      {/* ===== 移动端：极简头部 ===== */}
      <header className="mb-4 flex items-center justify-between gap-3 md:hidden">
        {/* 日期切换器 */}
        <div className="flex items-center rounded-full bg-surface p-1 shadow-card ring-1 ring-petal-100">
          <button
            type="button"
            onClick={() => shiftDay(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-400 transition hover:bg-petal-50 active:bg-petal-100"
            aria-label="前一天"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setCalendarOpen(true)}
            className="flex min-w-[88px] flex-col items-center px-2"
          >
            <span className="text-sm font-semibold leading-none text-ink-800">
              {activeDateCompact}
            </span>
            <span className="mt-0.5 text-[10px] leading-none text-ink-400">
              {dayjs(activeKey).format('M月D日 ddd')}
            </span>
          </button>
          <button
            type="button"
            onClick={() => shiftDay(1)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-400 transition hover:bg-petal-50 active:bg-petal-100"
            aria-label="后一天"
          >
            ›
          </button>
        </div>

        {/* 购物车 */}
        <CartButton open={cartOpen} onClick={() => setCartOpen((v) => !v)} />

        {/* 视图切换小胶囊 */}
        <div className="flex rounded-full bg-surface p-1 shadow-card ring-1 ring-petal-100">
          <button
            type="button"
            onClick={() => setViewMode('category')}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              viewMode === 'category'
                ? 'bg-lavender-400 text-white shadow-soft'
                : 'text-ink-500'
            }`}
          >
            分类
          </button>
          <button
            type="button"
            onClick={() => setViewMode('timeline')}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              viewMode === 'timeline'
                ? 'bg-mint-400 text-white shadow-soft'
                : 'text-ink-500'
            }`}
          >
            时间
          </button>
        </div>
      </header>

      {/* ===== 桌面端：保持原有完整头部 ===== */}
      <header className="mb-6 hidden flex-wrap items-center justify-between gap-3 md:flex">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setCalendarOpen(true)}
            title="打开日历选择日期"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-petal-100 to-lavender-100 text-2xl shadow-card ring-1 ring-petal-200 transition hover:-translate-y-0.5 hover:shadow-soft active:scale-95"
          >
            📅
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-ink-900 sm:text-3xl">
              待办清单 ✅
            </h1>
            <button
              type="button"
              onClick={() => setCalendarOpen(true)}
              className="mt-1 inline-flex items-center gap-1 rounded-full bg-petal-50 px-2.5 py-1 text-xs font-medium text-petal-700 ring-1 ring-petal-200 transition hover:bg-petal-100 sm:text-sm"
            >
              {activeDateLabel}
              <span className="text-petal-400">▾</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-2xl border border-petal-100 bg-surface p-1 shadow-card">
            <button
              type="button"
              onClick={() => setViewMode('category')}
              className={`rounded-xl px-3 py-1.5 text-xs transition sm:px-4 sm:text-sm ${
                viewMode === 'category'
                  ? 'bg-gradient-to-br from-lavender-400 to-lavender-500 text-white shadow-soft'
                  : 'text-ink-500 hover:bg-petal-50'
              }`}
            >
              📊 分类视图
            </button>
            <button
              type="button"
              onClick={() => setViewMode('timeline')}
              className={`rounded-xl px-3 py-1.5 text-xs transition sm:px-4 sm:text-sm ${
                viewMode === 'timeline'
                  ? 'bg-gradient-to-br from-mint-400 to-mint-500 text-white shadow-soft'
                  : 'text-ink-500 hover:bg-petal-50'
              }`}
            >
              🕘 24h 时间轴
            </button>
          </div>

          <CartButton open={cartOpen} onClick={() => setCartOpen((v) => !v)} />

          <button
            type="button"
            onClick={() => openCreate(activeKey)}
            title="新建任务"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-petal-400 to-petal-500 text-2xl font-bold leading-none text-white shadow-soft transition hover:brightness-105 active:scale-95 sm:h-12 sm:w-12"
          >
            +
          </button>
        </div>
      </header>

      {/* 主内容 */}
      <section className="mt-2 pb-20 md:pb-0">
        {viewMode === 'category' ? (
          <CategoryView
            activeKey={activeKey}
            onEdit={openEdit}
            onToggleDone={onToggleDone}
          />
        ) : (
          <TimelineView
            activeKey={activeKey}
            onEdit={openEdit}
            onToggleDone={onToggleDone}
          />
        )}
      </section>

      {/* 移动端：右下角悬浮新建按钮 */}
      <button
        type="button"
        onClick={() => openCreate(activeKey)}
        title="新建任务"
        className="fixed right-5 bottom-24 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-petal-400 to-petal-500 text-3xl font-light text-white shadow-lg shadow-petal-300/40 transition hover:brightness-105 active:scale-95 md:hidden"
        aria-label="新建任务"
      >
        +
      </button>

      <ShoppingCart open={cartOpen} onClose={() => setCartOpen(false)} />

      <TodoForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditingId(null)
        }}
        editTodoId={editingId}
        seedDueDate={seedDue}
      />
    </div>
  )
}
