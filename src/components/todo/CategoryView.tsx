import { useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  useTodoStore,
  todayStr,
  getBoardBuckets,
  type BoardSection,
  type Todo,
} from '@/store/useTodoStore'
import TodoCard from './TodoCard'

/* 单个拖拽 item 的包装组件（直接用 TodoCard variant=board 渲染） */
function SortableBoardCard(props: {
  todo: Todo
  section: BoardSection
  onEdit: (id: string) => void
  onToggleDone: (id: string) => void
  metaText?: { reminderMeta?: string; canDoMeta?: string }
  alwaysShowActions?: boolean
  /** 是否显示 ⋮⋮ 拖拽手柄（提醒板块取消拖拽时为 false） */
  draggable?: boolean
}) {
  const { draggable = true } = props
  // 即便板块本身是 draggable，也可能该条任务所在板块整体禁用（此时 sortable 仍可能可用，但我们不启用 drag handle 与 setNodeRef 外层）
  const sortable = useSortable({ id: props.todo.id, disabled: !draggable })
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable
  const dragStyles = draggable
    ? ({
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 50 : undefined,
      } as React.CSSProperties)
    : undefined
  const dragHandleProps = draggable ? { ...attributes, ...listeners } : undefined

  return (
    <div ref={setNodeRef}>
      <TodoCard
        todo={props.todo}
        variant="board"
        onEdit={props.onEdit}
        onToggleDone={props.onToggleDone}
        dragHandleProps={dragHandleProps}
        dragStyles={dragStyles}
        reminderMeta={props.metaText?.reminderMeta}
        canDoMeta={props.metaText?.canDoMeta}
        alwaysShowActions={props.alwaysShowActions}
        showDragHandle={draggable}
      />
    </div>
  )
}

export interface CategoryViewProps {
  /** 日历上选中的日期（决定"今日已完成"折叠区展示哪天完成的） */
  activeKey: string
  onEdit: (id: string) => void
  onToggleDone: (id: string) => void
}

export default function CategoryView(props: CategoryViewProps) {
  const todos = useTodoStore((s) => s.todos)
  const boardOrder = useTodoStore((s) => s.boardOrder)
  const setBoardSectionOrder = useTodoStore((s) => s.setBoardSectionOrder)
  const boardCollapsed = useTodoStore((s) => s.boardCollapsed)
  const toggleCollapsed = useTodoStore((s) => s.toggleCollapsed)

  const todayKey = todayStr()
  const [screenWidth, setScreenWidth] = useState<number>(() =>
    typeof window === 'undefined' ? 1024 : window.innerWidth,
  )
  useEffect(() => {
    const onR = () => setScreenWidth(window.innerWidth)
    window.addEventListener('resize', onR)
    return () => window.removeEventListener('resize', onR)
  }, [])
  const isMobile = screenWidth < 768

  // 拖拽传感器：只有在"拖拽手柄（⋮⋮）"上按下才激活，避免误触勾选框
  const handleSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 3 },
  })
  const sensors = useSensors(handleSensor)

  const buckets = useMemo(() => {
    return getBoardBuckets(todos, todayKey, props.activeKey, boardOrder)
  }, [todos, todayKey, props.activeKey, boardOrder])

  // 把新 todo（_orderMissingIds）补写回 order，保证下次打开顺序仍然保留
  const wroteRef = useRef(0)
  useEffect(() => {
    const missing: Partial<Record<BoardSection, string[]>> = buckets._orderMissingIds ?? {}
    const keys: BoardSection[] = ['mustDoToday', 'canDoToday', 'reminders']
    let patch = false
    const patchOrder = { ...boardOrder }
    for (const k of keys) {
      const add = missing[k]
      if (add && add.length) {
        patchOrder[k] = [...(patchOrder[k] ?? []), ...add]
        patch = true
      }
    }
    if (patch) {
      wroteRef.current += 1
      if (wroteRef.current < 10) {
        for (const k of keys) setBoardSectionOrder(k, patchOrder[k])
      }
    }
    // 只在 buckets 计算结果变化时补写
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    buckets._orderMissingIds?.mustDoToday?.join(','),
    buckets._orderMissingIds?.canDoToday?.join(','),
    buckets._orderMissingIds?.reminders?.join(','),
  ])

  const onDragEnd = (e: DragEndEvent, section: BoardSection) => {
    const { active, over } = e
    if (!over) return
    if (active.id === over.id) return
    const current =
      section === 'mustDoToday'
        ? buckets.mustDoToday.map((t) => t.id)
        : section === 'canDoToday'
          ? buckets.canDoToday.map((t) => t.id)
          : buckets.reminders.map((t) => t.id)
    const oldIdx = current.indexOf(String(active.id))
    const newIdx = current.indexOf(String(over.id))
    if (oldIdx < 0 || newIdx < 0) return
    const next = arrayMove(current, oldIdx, newIdx)
    setBoardSectionOrder(section, next)
  }

  // === meta texts ===
  const makeReminderMeta = (t: Todo) => {
    const d = dayjs(t.dueDate).diff(dayjs(todayKey).startOf('day'), 'day')
    if (d <= 0) return null
    if (d === 1) return '明天到期'
    return `${d} 天后到期`
  }
  const makeCanDoMeta = (t: Todo) => {
    const d = dayjs(t.dueDate).diff(dayjs(todayKey).startOf('day'), 'day')
    if (d <= 1) return null
    return `还有 ${d} 天截止，可提前完成`
  }

  const SectionBlock = (p: {
    title: string
    sub: string
    accent: string
    emptyHint: string
    section: BoardSection
    todos: Todo[]
    collapsible?: boolean
    /** 是否启用拖拽排序 + 显示拖拽手柄；提醒板块按需求必须禁用（强制日期排序） */
    draggable?: boolean
  }) => {
    // 三板块无论是否有内容都始终渲染，避免用户"以为页面丢了板块"；空时走下方 emptyHint 占位
    const collapsed = p.collapsible ? !!boardCollapsed[p.section] : false
    const arrowCls = collapsed ? '' : 'rotate-180'
    const draggable = p.draggable !== false

    return (
      <section className="mb-5">
        <header className="mb-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${p.accent}`} />
            <h2 className="text-base font-semibold text-ink-800">{p.title}</h2>
            {p.todos.length > 0 && (
              <span className="rounded-full bg-ink-100/80 px-1.5 py-0 text-[10px] font-medium text-ink-500">
                {p.todos.length}
              </span>
            )}
          </div>
          {p.collapsible && (
            <button
              type="button"
              onClick={() => toggleCollapsed(p.section)}
              aria-label={collapsed ? '展开' : '收起'}
              title={collapsed ? '展开' : '收起'}
              className="shrink-0 rounded-lg p-1 text-ink-400 transition hover:bg-petal-50 hover:text-petal-600"
            >
              <svg
                viewBox="0 0 20 20"
                className={`h-4 w-4 transition-transform ${arrowCls}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="5 8 10 13 15 8" />
              </svg>
            </button>
          )}
        </header>

        {collapsed ? null : p.todos.length === 0 ? (
          p.emptyHint ? (
            <div className="py-2 text-center text-xs text-ink-300">
              {p.emptyHint}
            </div>
          ) : null
        ) : draggable ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e) => onDragEnd(e, p.section)}
          >
            <SortableContext items={p.todos.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-3">
                {p.todos.map((t) => (
                  <SortableBoardCard
                    key={t.id}
                    todo={t}
                    section={p.section}
                    onEdit={props.onEdit}
                    onToggleDone={props.onToggleDone}
                    alwaysShowActions={isMobile}
                    draggable
                    metaText={{
                      reminderMeta: p.section === 'reminders' ? makeReminderMeta(t) ?? undefined : undefined,
                      canDoMeta: p.section === 'canDoToday' ? makeCanDoMeta(t) ?? undefined : undefined,
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          // 【问题二】提醒板块：完全禁用拖拽，不包 DndContext；直接渲染 TodoCard 且不显示手柄
          <div className="flex flex-col gap-3">
            {p.todos.map((t) => (
              <TodoCard
                key={t.id}
                todo={t}
                variant="board"
                onEdit={props.onEdit}
                onToggleDone={props.onToggleDone}
                alwaysShowActions={isMobile}
                reminderMeta={p.section === 'reminders' ? makeReminderMeta(t) ?? undefined : undefined}
                canDoMeta={p.section === 'canDoToday' ? makeCanDoMeta(t) ?? undefined : undefined}
                showDragHandle={false}
              />
            ))}
          </div>
        )}
      </section>
    )
  }

  const doneCollapsed = !!boardCollapsed.doneOnActive

  return (
    <div>
      <SectionBlock
        title="今日必做"
        sub=""
        accent="bg-petal-500"
        emptyHint="暂无"
        section="mustDoToday"
        todos={buckets.mustDoToday}
        collapsible
      />

      <SectionBlock
        title="今日可做"
        sub=""
        accent="bg-mint-500"
        emptyHint="暂无"
        section="canDoToday"
        todos={buckets.canDoToday}
        collapsible
      />

      <SectionBlock
        title="提醒"
        sub=""
        accent="bg-lavender-500"
        emptyHint="暂无"
        section="reminders"
        todos={buckets.reminders}
        collapsible
        draggable={false}
      />

      {/* 底部：今日已完成（默认收起；按 props.activeKey 展示那一天的完成记录） */}
      <section className="mt-6">
        <button
          type="button"
          onClick={() => toggleCollapsed('doneOnActive')}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-petal-100 bg-surface/60 px-4 py-2.5 text-left transition hover:bg-petal-50/50"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink-700">
              {props.activeKey === todayKey ? '今日已完成' : `${props.activeKey} 完成记录`}
            </span>
            {buckets.doneOnActiveDate.length > 0 && (
              <span className="rounded-full bg-ink-100/80 px-1.5 py-0 text-[10px] text-ink-500">
                {buckets.doneOnActiveDate.length}
              </span>
            )}
          </div>
          <svg
            viewBox="0 0 20 20"
            className={`h-4 w-4 text-ink-400 transition-transform ${doneCollapsed ? '' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="5 8 10 13 15 8" />
          </svg>
        </button>
        {!doneCollapsed && (
          <div className="mt-2.5 flex flex-col gap-2.5">
            {buckets.doneOnActiveDate.length === 0 ? (
              <div className="py-2 text-center text-xs text-ink-300">暂无</div>
            ) : (
              buckets.doneOnActiveDate.map((t) => (
                <TodoCard
                  key={t.id}
                  todo={t}
                  variant="default"
                  onEdit={props.onEdit}
                  onToggleDone={props.onToggleDone}
                />
              ))
            )}
          </div>
        )}
      </section>
    </div>
  )
}
