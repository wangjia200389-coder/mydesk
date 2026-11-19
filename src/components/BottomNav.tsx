import { useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  orderedModules,
  useNavStore,
  type NavModule,
} from '@/store/useNavStore'

function isActivePath(pathname: string, mod: NavModule): boolean {
  if (mod.end) return pathname === mod.to
  return pathname === mod.to || pathname.startsWith(mod.to + '/')
}

function SortableNavItem({
  module,
  onActivate,
}: {
  module: NavModule
  onActivate: (to: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: module.key })
  const pathname = useLocation().pathname
  const active = isActivePath(pathname, module)

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onActivate(module.to)}
      title={module.label}
      className={`relative flex w-[68px] shrink-0 snap-start flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
        isDragging
          ? 'scale-105 text-petal-600'
          : active
            ? 'text-petal-600'
            : 'text-ink-400 hover:text-ink-500'
      }`}
    >
      {active && (
        <span className="absolute top-0 h-1 w-9 rounded-full bg-petal-400" />
      )}
      <span
        className={`text-xl leading-none transition-transform ${
          active ? 'scale-110' : ''
        }`}
      >
        {module.icon}
      </span>
      <span className="text-[11px] font-medium leading-none">{module.label}</span>
    </button>
  )
}

/**
 * 移动端底部 Tab 导航（md 以下显示，桌面隐藏）。
 * - 横向可滑动：每格 68px，约 5 个铺满屏宽，其余滑动可见
 * - 长按拖动可调整顺序；顺序持久化（my-desk:nav），下次进入沿用
 * - 轻点（非拖动）正常跳转对应模块
 */
export default function BottomNav() {
  const navigate = useNavigate()
  const order = useNavStore((s) => s.order)
  const setOrder = useNavStore((s) => s.setOrder)
  const modules = orderedModules(order)
  // 拖动结束后拦截一次误触跳转
  const draggedRef = useRef(false)

  // 桌面：移动超过 8px 即进入拖动；移动端：长按 200ms 进入拖动（容忍 10px 抖动，避免手指微颤误取消）
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 10 } }),
  )

  const handleActivate = (to: string) => {
    if (draggedRef.current) {
      draggedRef.current = false
      return
    }
    navigate(to)
  }

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (over && active.id !== over.id) {
      const oldIndex = order.indexOf(active.id as string)
      const newIndex = order.indexOf(over.id as string)
      if (oldIndex >= 0 && newIndex >= 0) {
        setOrder(arrayMove(order, oldIndex, newIndex))
      }
    }
    // 防止紧接其后的 click 误触发跳转
    draggedRef.current = true
    window.setTimeout(() => {
      draggedRef.current = false
    }, 0)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={modules.map((m) => m.key)}
        strategy={horizontalListSortingStrategy}
      >
        <nav className="scrollbar-hide safe-bottom fixed inset-x-0 bottom-0 z-40 flex snap-x overflow-x-auto border-t border-petal-100 bg-surface/90 backdrop-blur-md no-tap-highlight md:hidden">
          {modules.map((m) => (
            <SortableNavItem key={m.key} module={m} onActivate={handleActivate} />
          ))}
        </nav>
      </SortableContext>
    </DndContext>
  )
}
