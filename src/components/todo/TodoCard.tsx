import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import {
  REPEAT_OPTIONS,
  TIME_SLOTS,
  useTodoStore,
  type Category,
  type Todo,
} from '@/store/useTodoStore'
import CategoryTag from './CategoryTag'

const timeslotLabel = (t: Todo) => {
  if (t.timeSlot === 'custom' && t.customStart && t.customEnd) {
    return `${t.customStart} – ${t.customEnd}`
  }
  const slot = TIME_SLOTS.find((x) => x.key === t.timeSlot)
  if (!slot) return ''
  return slot.hours ? `${slot.label} ${slot.hours}` : slot.label
}

export type TodoCardVariant = 'default' | 'board' | 'compact'

export default function TodoCard(props: {
  todo: Todo
  onEdit: (id: string) => void
  onToggleDone: (id: string) => void
  /**
   * default：原卡片 + 分类背景/左侧色条（用于"今日已完成"折叠区等）
   * board：三板块里的卡片（浅色背景 + 左侧分类色条）
   * compact：24h 时间轴格子里
   */
  variant?: TodoCardVariant
  /** 在 dnd-kit 里需要给最外层 element 额外 attributes / listeners / style */
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>
  dragStyles?: React.CSSProperties
  /** 只在"提醒"板块用到：额外显示到期距离天数的提示 */
  reminderMeta?: string
  /** 只在"今日可做"板块用到：显示到期距离天数 */
  canDoMeta?: string
  /** 只在三板块里：把"编辑/删除"操作固定常显（移动端没 hover） */
  alwaysShowActions?: boolean
  /** board 变体下是否显示左侧的「⋮⋮」拖拽手柄；提醒板块取消拖拽时应设为 false */
  showDragHandle?: boolean
}) {
  const {
    todo,
    variant = 'default',
    dragHandleProps,
    dragStyles,
    reminderMeta,
    canDoMeta,
    alwaysShowActions: _alwaysShowActions = false,
    showDragHandle = true,
  } = props
  const toggleSub = useTodoStore((s) => s.toggleSubtask)
  const removeSub = useTodoStore((s) => s.removeSubtask)
  const addSub = useTodoStore((s) => s.addSubtask)
  const removeTodo = useTodoStore((s) => s.removeTodo)
  const cat: Category = useTodoStore((s) => s.ensureCategory(todo.categoryId))

  const [expanded, setExpanded] = useState(false)
  const [subInput, setSubInput] = useState('')

  const repeatLabel = useMemo(
    () => REPEAT_OPTIONS.find((r) => r.value === todo.repeat)?.label ?? '仅一次',
    [todo.repeat],
  )
  const timeLabel = timeslotLabel(todo)

  // ======= compact（24h 时间轴） =======
  if (variant === 'compact') {
    return (
      <div
        onClick={() => props.onEdit(todo.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') props.onEdit(todo.id)
        }}
        className={`flex h-full w-full cursor-pointer items-start gap-1.5 overflow-hidden rounded-xl p-1.5 text-[11px] ring-1 ring-inset shadow-card transition ${
          todo.done
            ? // 已完成：灰暗色 + 删除线 + 弱 ring
              'bg-ink-100 ring-ink-200 opacity-70'
            : // 未完成：分类浅色背景 + 分类 ring，醒目
              `${cat.cardBg} ring-petal-200/40 hover:-translate-y-0.5 hover:shadow-soft`
        }`}
        style={dragStyles}
        {...dragHandleProps}
      >
        {/* 左侧小色条 */}
        <span className={`mt-0.5 h-full w-1 shrink-0 rounded-full ${cat.cardBar}`} />
        <label
          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            className="peer sr-only"
            checked={todo.done}
            onChange={() => props.onToggleDone(todo.id)}
          />
          <span className="flex h-4 w-4 items-center justify-center rounded border-2 border-surface bg-cream transition peer-checked:border-petal-500 peer-checked:bg-petal-500">
            <svg viewBox="0 0 20 20" className="h-3 w-3 text-white opacity-0 peer-checked:opacity-100" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="4 11 8 15 16 5" />
            </svg>
          </span>
        </label>
        <div className="min-w-0 flex-1">
          <div
            className={`truncate font-semibold leading-tight ${
              todo.done ? 'text-ink-500 line-through' : 'text-ink-800'
            }`}
          >
            {todo.title}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-ink-500">
            {timeLabel && <span>⏰{timeLabel}</span>}
            {todo.repeat !== 'once' && <span>🔁{repeatLabel}</span>}
            <span className={`inline-flex h-1.5 w-1.5 rounded-full ${cat.dot}`} title={cat.name} />
          </div>
        </div>
      </div>
    )
  }

  // ======= board（三板块） =======
  if (variant === 'board') {
    return (
      <div
        className={`relative overflow-hidden rounded-2xl p-3.5 shadow-card ring-1 ring-inset transition ${
          todo.done
            ? 'bg-ink-50 ring-ink-100 opacity-75'
            : `${cat.cardBg} ring-petal-100 hover:shadow-soft`
        }`}
        style={dragStyles}
      >
        {/* 左侧竖条（分类色） */}
        <span className={`absolute left-0 top-0 h-full w-1.5 ${cat.cardBar}`} />

        <div className="flex items-stretch gap-3 pl-2">
          {/* 拖拽手柄 + 复选框组合（showDragHandle=false 时只保留复选框，用于提醒板块取消拖拽） */}
          <div
            className="mt-0.5 flex items-center gap-1 self-start"
            {...(showDragHandle ? dragHandleProps : undefined)}
          >
            {/* 复选框优先拿事件，不冒泡到 drag handle */}
            <label
              className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                className="peer sr-only"
                checked={todo.done}
                onChange={() => props.onToggleDone(todo.id)}
              />
              <span className="flex h-5 w-5 items-center justify-center rounded-md border-2 border-white bg-cream transition ring-1 ring-petal-200 peer-checked:border-petal-500 peer-checked:bg-petal-500 peer-checked:ring-0">
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="4 11 8 15 16 5" />
                </svg>
              </span>
            </label>
            {/* 6 点拖拽手柄 */}
            {showDragHandle && (
              <span title="拖拽排序" className="select-none text-ink-300 hover:text-ink-500 cursor-grab active:cursor-grabbing text-sm">
                ⋮⋮
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4
                className={`flex-1 break-words text-sm font-semibold leading-snug sm:text-[15px] ${
                  todo.done ? 'text-ink-400 line-through' : 'text-ink-900'
                }`}
              >
                {todo.title}
              </h4>
              <CategoryTag categoryId={todo.categoryId} size="sm" />
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-500">
              <span>📅 {todo.dueDate}</span>
              {timeLabel && <span>⏰ {timeLabel}</span>}
              {todo.repeat !== 'once' && <span>🔁 {repeatLabel}</span>}
              {todo.allowAheadOfSchedule && <span className="rounded-full bg-mint-100 px-2 py-0.5 text-mint-700 ring-1 ring-mint-200">允许提前</span>}
              {todo.remindManual && <span className="rounded-full bg-lavender-100 px-2 py-0.5 text-lavender-700 ring-1 ring-lavender-200">🔔 提醒</span>}
              {reminderMeta && <span className="rounded-full bg-lavender-100 px-2 py-0.5 text-lavender-700 ring-1 ring-lavender-200">{reminderMeta}</span>}
              {canDoMeta && <span className="rounded-full bg-petal-100 px-2 py-0.5 text-petal-700 ring-1 ring-petal-200">{canDoMeta}</span>}
            </div>

            {((todo.notes && todo.notes.trim()) || todo.subtasks.length > 0) && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-1.5 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-ink-500 hover:bg-white/60 hover:text-petal-600"
              >
                <span>{expanded ? '收起' : '展开'}</span>
                {todo.notes && <span>· 📝</span>}
                {todo.subtasks.length > 0 && (
                  <span>· ✔️ {todo.subtasks.filter((s) => s.done).length}/{todo.subtasks.length}</span>
                )}
              </button>
            )}

            {expanded && (
              <div className="mt-2.5 space-y-2.5 rounded-xl bg-white/70 p-3 ring-1 ring-petal-100">
                {todo.notes && (
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-700">{todo.notes}</p>
                )}
                {todo.subtasks.length > 0 && (
                  <ul className="flex flex-col gap-1.5">
                    {todo.subtasks.map((s) => (
                      <li key={s.id} className="flex items-center gap-2 rounded-lg bg-surface px-2 py-1 text-xs ring-1 ring-petal-100">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-petal-500"
                          checked={s.done}
                          onChange={() => toggleSub(todo.id, s.id)}
                        />
                        <span className={`flex-1 ${s.done ? 'text-ink-400 line-through' : 'text-ink-700'}`}>{s.title}</span>
                        <button type="button" onClick={() => removeSub(todo.id, s.id)} className="text-ink-300 hover:text-petal-600">✕</button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <input
                    value={subInput}
                    onChange={(e) => setSubInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addSub(todo.id, subInput)
                        setSubInput('')
                      }
                    }}
                    placeholder="追加子任务（回车）"
                    className="flex-1 rounded-lg border border-petal-200 bg-surface px-3 py-1.5 text-xs outline-none focus:border-petal-400 focus:ring-4 focus:ring-petal-100"
                    maxLength={80}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 卡片右侧垂直居中的编辑/删除操作区：常显+加大尺寸，方便用户立刻点击编辑 */}
          <div className="ml-1 flex shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl bg-white/40 px-1.5 py-1 ring-1 ring-inset ring-petal-100/70 backdrop-blur-[1px]">
            <button
              type="button"
              title="编辑任务"
              onClick={(e) => {
                e.stopPropagation()
                props.onEdit(todo.id)
              }}
              className="group flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 ring-1 ring-transparent transition hover:bg-petal-100 hover:text-petal-600 hover:ring-petal-200 active:scale-95"
            >
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
            </button>
            <div className="h-px w-5 bg-petal-100" aria-hidden />
            <button
              type="button"
              title="删除任务"
              onClick={(e) => {
                e.stopPropagation()
                if (confirm(`删除任务「${todo.title}」？`)) removeTodo(todo.id)
              }}
              className="group flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 ring-1 ring-transparent transition hover:bg-rose-50 hover:text-rose-500 hover:ring-rose-200 active:scale-95"
            >
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ======= default（今日已完成折叠区用） =======
  return (
    <div className={`group relative overflow-hidden rounded-2xl p-3.5 shadow-card ring-1 ring-inset ${todo.done ? 'bg-ink-50 ring-ink-100 opacity-75' : `${cat.cardBg} ring-petal-100`}`}>
      <span className={`absolute left-0 top-0 h-full w-1.5 ${cat.cardBar}`} />
      <div className="flex items-start gap-3 pl-2">
        <label className="mt-0.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="peer sr-only"
            checked={todo.done}
            onChange={() => props.onToggleDone(todo.id)}
          />
          <span className="flex h-5 w-5 items-center justify-center rounded-md border-2 border-white bg-cream transition ring-1 ring-petal-200 peer-checked:border-petal-500 peer-checked:bg-petal-500 peer-checked:ring-0">
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="4 11 8 15 16 5" />
            </svg>
          </span>
        </label>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className={`flex-1 break-words text-sm font-semibold leading-snug sm:text-[15px] ${todo.done ? 'text-ink-400 line-through' : 'text-ink-900'}`}>{todo.title}</h4>
            <CategoryTag categoryId={todo.categoryId} size="sm" />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-500">
            <span>📅 {todo.dueDate}</span>
            {timeLabel && <span>⏰ {timeLabel}</span>}
            {todo.repeat !== 'once' && <span>🔁 {repeatLabel}</span>}
            {todo.completedAt && <span className="ml-auto">✅ {dayjs(todo.completedAt).format('HH:mm')} 完成</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-end gap-1">
          <button
            type="button"
            onClick={() => props.onEdit(todo.id)}
            className="rounded-lg px-2 py-1 text-xs text-ink-300 hover:bg-white/60 hover:text-petal-600"
          >
            ✏️
          </button>
        </div>
      </div>
    </div>
  )
}
