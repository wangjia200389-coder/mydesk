import { useState } from 'react'
import type { Item } from '@/store/useItemStore'
import { useItemStore } from '@/store/useItemStore'
import { RATING_LABELS, RATING_DESC, RATING_COLORS } from '@/lib/rating'

interface Props {
  item: Item
  onClose: () => void
}

/** 物品评价弹窗：星标（从夯到拉）+ 追加锐评 */
export default function RatingModal({ item, onClose }: Props) {
  const updateItem = useItemStore((s) => s.updateItem)
  const [rating, setRating] = useState<number>(item.rating ?? 0)
  const [hover, setHover] = useState<number>(0)
  const [review, setReview] = useState<string>(item.review ?? '')
  const [saved, setSaved] = useState(false)

  const save = () => {
    updateItem(item.id, {
      rating: rating || undefined,
      review: review.trim() || undefined,
    })
    setSaved(true)
    setTimeout(onClose, 600)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/30 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-sm rounded-t-3xl bg-surface p-6 shadow-soft sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-ink-900">
            评价 · {item.name || '未命名'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-ink-400 hover:bg-petal-50 hover:text-ink-700"
          >
            ✕
          </button>
        </div>

        {/* 星标：左=拉(1) → 右=夯(5) */}
        <p className="mb-2 text-xs text-ink-400">从「夯」到「拉」，给个评价吧～</p>
        <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((star) => {
            const current = hover || rating
            const active = current >= star
            return (
              <button
                key={star}
                type="button"
                onMouseEnter={() => setHover(star)}
                onClick={() => setRating(star)}
                className="text-3xl leading-none transition-transform active:scale-90"
                style={{ color: active ? RATING_COLORS[current] ?? '#f59e0b' : '#e6dcec' }}
                aria-label={`${star} 星`}
              >
                ★
              </button>
            )
          })}
          <span
            className="ml-2 text-sm font-semibold"
            style={{ color: rating ? RATING_COLORS[rating] : '#8a7f97' }}
          >
            {rating ? RATING_LABELS[rating] : '未评'}
          </span>
        </div>
        {rating > 0 && (
          <p className="mt-1 text-xs text-ink-400">{RATING_DESC[rating]}</p>
        )}

        {/* 追加锐评 */}
        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-ink-500">
            追加锐评（选填）
          </label>
          <textarea
            value={review}
            onChange={(e) => setReview(e.target.value)}
            rows={3}
            placeholder="想吐槽还是夸夸？随便说～"
            className="w-full rounded-xl border border-petal-200 bg-cream px-3 py-2 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus:border-petal-400 focus:ring-4 focus:ring-petal-100"
          />
        </div>

        <button
          type="button"
          onClick={save}
          disabled={!rating || saved}
          className="mt-5 w-full rounded-xl bg-gradient-to-br from-petal-400 to-petal-500 py-2.5 text-sm font-semibold text-white shadow-card transition hover:brightness-105 active:scale-95 disabled:opacity-50"
        >
          {saved ? '已保存 ❤️' : '保存评价'}
        </button>
      </div>
    </div>
  )
}
