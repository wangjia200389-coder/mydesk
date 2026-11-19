import { useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { useItemStore } from '@/store/useItemStore'
import ItemPhoto from '@/components/items/ItemPhoto'

export default function ItemDrafts() {
  const navigate = useNavigate()
  const items = useItemStore((s) => s.items)
  const removeItem = useItemStore((s) => s.removeItem)

  const drafts = useMemo(
    () => items.filter((i) => i.isDraft).sort((a, b) => b.createdAt - a.createdAt),
    [items],
  )

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 md:px-8">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/items" className="rounded-xl px-2 py-1 text-lg text-ink-500 transition hover:text-petal-600">
            ‹
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-ink-900 md:text-3xl">草稿箱 ✏️</h1>
            <p className="mt-0.5 text-xs text-ink-400">只存了照片的待办物品，可继续编辑</p>
          </div>
        </div>
        <span className="rounded-full bg-petal-50 px-3 py-1 text-xs font-medium text-petal-600">
          {drafts.length} 条
        </span>
      </header>

      {drafts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-petal-200 bg-surface/60 py-16 text-center shadow-card">
          <div className="mb-2 text-4xl">🗒️</div>
          <p className="text-sm text-ink-500">草稿箱是空的～拍照后点「存入草稿箱」会出现在这里</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {drafts.map((d) => (
            <div
              key={d.id}
              className="overflow-hidden rounded-2xl border border-petal-100 bg-surface shadow-card"
            >
              <button
                type="button"
                onClick={() => navigate(`/items/${d.id}`)}
                className="no-tap-highlight block w-full"
              >
                <div className="aspect-square w-full overflow-hidden bg-petal-50/60">
                  <ItemPhoto photoId={d.photoId} className="h-full w-full object-cover" alt="" />
                </div>
              </button>
              <div className="flex items-center justify-between p-3">
                <span className="text-xs text-ink-400">
                  {dayjs(d.createdAt).format('MM月DD日 HH:mm')} 创建
                </span>
                <button
                  type="button"
                  onClick={() => removeItem(d.id)}
                  className="text-xs text-petal-600 hover:underline"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
