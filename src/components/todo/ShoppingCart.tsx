import { useState } from 'react'
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
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useCartStore, compressImageToBase64, type CartItem } from '@/store/useCartStore'
import FileUploadButton from '@/components/FileUploadButton'
import { usePasteUpload } from '@/lib/upload'

export default function ShoppingCart({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const items = useCartStore((s) => s.items)
  const addItem = useCartStore((s) => s.addItem)
  const toggleBought = useCartStore((s) => s.toggleBought)
  const removeItem = useCartStore((s) => s.removeItem)
  const setItems = useCartStore((s) => s.setItems)

  const [name, setName] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [compressing, setCompressing] = useState(false)

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return
    setCompressing(true)
    try {
      const base64 = await compressImageToBase64(file, 800, 0.7)
      setPreview(base64)
    } catch {
      setPreview(null)
    } finally {
      setCompressing(false)
    }
  }

  const handleAdd = () => {
    const n = name.trim()
    if (!n) return
    addItem(n, preview ?? undefined)
    setName('')
    setPreview(null)
  }

  const boughtItems = items.filter((it) => it.bought)
  const unboughtItems = items.filter((it) => !it.bought)

  // 粘贴上传：用户从微信复制图片后粘贴即可选择
  usePasteUpload((files) => {
    const img = files.find((f) => f.type.startsWith('image/'))
    if (img) void handleFile(img)
  })
  // 拖拽用扁平有序 id 列表（未购在前、已购在后）
  const flatIds = [...unboughtItems, ...boughtItems].map((it) => it.id)
  const itemMap = new Map(items.map((it) => [it.id, it]))

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 10 } }),
  )

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = flatIds.indexOf(active.id as string)
    const newIndex = flatIds.indexOf(over.id as string)
    if (oldIndex < 0 || newIndex < 0) return
    const nextIds = arrayMove(flatIds, oldIndex, newIndex)
    setItems(nextIds.map((id) => itemMap.get(id)!).filter(Boolean))
  }

  return (
    <>
      {/* 遮罩：移动端全屏，桌面端半透明背景 */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-ink-900/20 backdrop-blur-[1px] md:bg-ink-900/10"
          onClick={onClose}
        />
      )}

      {/* 面板：移动端右侧抽屉，桌面端右上方面板 */}
      <div
        className={`fixed z-50 transform bg-surface shadow-soft transition-transform duration-200 md:right-4 md:top-20 md:mt-2 md:w-80 md:rounded-3xl md:ring-1 md:ring-petal-100 ${
          open
            ? 'translate-x-0 md:translate-y-0 md:opacity-100'
            : 'translate-x-full md:translate-y-2 md:opacity-0 md:pointer-events-none'
        } top-0 right-0 h-full w-[85vw] max-w-sm`}
      >
        <div className="flex h-full flex-col p-4 md:h-auto md:max-h-[70vh]">
          {/* 头部 */}
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-ink-900">🛒 购物清单</h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-ink-400 hover:bg-petal-50 hover:text-ink-700"
            >
              ✕
            </button>
          </div>

          {/* 添加表单 */}
          <div className="mb-3 rounded-2xl bg-petal-50/60 p-3 ring-1 ring-petal-100">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd()
              }}
              placeholder="物品名称（必填）"
              className="mb-2 w-full rounded-xl border border-petal-100 bg-surface px-3 py-2 text-sm outline-none focus:border-petal-400"
              maxLength={40}
            />
            <div className="flex items-center gap-2">
              <FileUploadButton
                accept="image/*"
                disabled={compressing}
                onFiles={(files) => {
                  const f = files.find((x) => x.type.startsWith('image/'))
                  if (f) void handleFile(f)
                }}
                className="rounded-xl bg-surface px-3 py-1.5 text-xs text-ink-600 ring-1 ring-petal-100 transition hover:bg-petal-50 disabled:opacity-50"
              >
                {compressing ? '压缩中…' : preview ? '已选图片' : '📷 选图片'}
              </FileUploadButton>
              {preview && (
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="text-xs text-ink-400 hover:text-petal-600"
                >
                  清除
                </button>
              )}
              <button
                type="button"
                onClick={handleAdd}
                disabled={!name.trim()}
                className="ml-auto rounded-xl bg-petal-500 px-3 py-1.5 text-xs font-semibold text-white shadow-card transition hover:bg-petal-600 disabled:opacity-50"
              >
                添加
              </button>
            </div>
            {preview && (
              <div className="mt-2 overflow-hidden rounded-xl">
                <img
                  src={preview}
                  alt="preview"
                  className="h-20 w-full object-cover"
                />
              </div>
            )}
          </div>

          {/* 列表 */}
          <div className="flex-1 overflow-y-auto md:max-h-[50vh]">
            {items.length === 0 ? (
              <div className="py-8 text-center text-xs text-ink-400">
                购物清单为空
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
              >
                <SortableContext items={flatIds} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-2">
                    {unboughtItems.map((it) => (
                      <CartRow
                        key={it.id}
                        item={it}
                        onToggle={() => toggleBought(it.id)}
                        onRemove={() => removeItem(it.id)}
                      />
                    ))}
                    {boughtItems.length > 0 && (
                      <div className="my-1 text-xs text-ink-400">已购买</div>
                    )}
                    {boughtItems.map((it) => (
                      <CartRow
                        key={it.id}
                        item={it}
                        onToggle={() => toggleBought(it.id)}
                        onRemove={() => removeItem(it.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function CartRow({
  item,
  onToggle,
  onRemove,
}: {
  item: CartItem
  onToggle: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-xl bg-surface p-2.5 shadow-sm ring-1 ring-petal-100 ${
        isDragging ? 'opacity-80 ring-petal-300' : ''
      } ${item.bought ? 'opacity-60' : ''}`}
    >
      {/* 拖拽手柄 */}
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        title="拖拽排序"
        className="shrink-0 cursor-grab touch-none px-1 text-ink-300 transition hover:text-petal-500 active:cursor-grabbing"
        aria-label="拖拽排序"
      >
        ⠿
      </button>
      <button
        type="button"
        onClick={onToggle}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition ${
          item.bought
            ? 'border-petal-500 bg-petal-500 text-white'
            : 'border-petal-200 bg-cream'
        }`}
      >
        {item.bought && (
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="4 11 8 15 16 5" />
          </svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${item.bought ? 'text-ink-400 line-through' : 'text-ink-800'}`}>
          {item.name}
        </p>
      </div>
      {item.image && (
        <img
          src={item.image}
          alt=""
          className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-petal-100"
        />
      )}
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 text-xs text-ink-400 hover:text-petal-600"
      >
        🗑️
      </button>
    </div>
  )
}
