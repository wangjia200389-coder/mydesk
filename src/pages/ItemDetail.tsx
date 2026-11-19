import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useItemStore } from '@/store/useItemStore'
import ItemForm from '@/components/items/ItemForm'

export default function ItemDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const item = useItemStore((s) => s.items.find((i) => i.id === id))
  const setStatus = useItemStore((s) => s.setStatus)

  // 找不到则回退列表（用 effect，避免在 render 中触发导航）
  useEffect(() => {
    if (!item) navigate('/items', { replace: true })
  }, [item, navigate])

  if (!item) return null

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 md:px-8">
      {/* 头部 */}
      <header className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-xl px-2 py-1 text-lg text-ink-500 transition hover:text-petal-600"
        >
          ‹ 返回
        </button>
        <h1 className="text-lg font-semibold text-ink-900">物品详情</h1>
        <span className="w-10" />
      </header>

      <ItemForm item={item} onDone={(target) => navigate(target === 'drafts' ? '/items/drafts' : '/items')} />

      {/* 状态管理（仅正式物品） */}
      {item.status === 'normal' && !item.isDraft && (
        <div className="mt-6 rounded-2xl border border-petal-100 bg-surface p-4 shadow-card">
          <p className="mb-2 text-sm font-medium text-ink-700">标记为</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStatus(item.id, 'discarded')}
              className="flex-1 rounded-xl border border-petal-200 bg-surface py-2 text-sm font-medium text-ink-600 transition hover:bg-petal-50"
            >
              已丢弃
            </button>
            <button
              type="button"
              onClick={() => setStatus(item.id, 'consumed')}
              className="flex-1 rounded-xl border border-petal-200 bg-surface py-2 text-sm font-medium text-ink-600 transition hover:bg-petal-50"
            >
              已消耗
            </button>
          </div>
        </div>
      )}

      {/* 恢复 */}
      {item.status !== 'normal' && (
        <div className="mt-6 rounded-2xl border border-petal-100 bg-surface p-4 shadow-card">
          <p className="mb-2 text-sm text-ink-500">
            该物品当前标记为「{item.status === 'discarded' ? '已丢弃' : '已消耗'}」，已退出分类视图。
          </p>
          <button
            type="button"
            onClick={() => setStatus(item.id, 'normal')}
            className="w-full rounded-xl bg-gradient-to-br from-mint-400 to-mint-500 py-2 text-sm font-semibold text-white shadow-card transition hover:brightness-105"
          >
            恢复正常
          </button>
        </div>
      )}
    </div>
  )
}
