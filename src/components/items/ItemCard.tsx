import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Item } from '@/store/useItemStore'
import { useItemStore } from '@/store/useItemStore'
import { getItemContext, daysUntil, tagChipStyle } from '@/lib/itemsUtil'
import { RATING_LABELS, RATING_COLORS } from '@/lib/rating'
import ItemPhoto from './ItemPhoto'
import RatingModal from './RatingModal'
import Lightbox from './Lightbox'

/** 物品网格卡片：照片缩略图 + 名称 + 关键信息 + 右上角评价徽章（独立于卡片链接） */
export default function ItemCard({ item }: { item: Item }) {
  const tags = useItemStore((s) => s.tags)
  const updateItem = useItemStore((s) => s.updateItem)
  const ctx = getItemContext(tags, item)
  const [ratingOpen, setRatingOpen] = useState(false)
  const [zoom, setZoom] = useState(false)

  const keyInfo = (): { text: string; warn?: boolean } | null => {
    if (item.status !== 'normal') return null
    if (ctx === 'consume') {
      if (item.expiryDate) {
        const d = daysUntil(item.expiryDate)
        return { text: d != null && d >= 0 ? `${d} 天后到期` : '已过期', warn: d != null && d >= 0 && d <= 7 }
      }
      return { text: '未设保质期' }
    }
    if (ctx === 'durable') {
      return { text: item.amount != null ? `¥${item.amount}` : '未填金额' }
    }
    return null
  }

  const info = keyInfo()
  const statusLabel =
    item.status === 'discarded' ? '已丢弃' : item.status === 'consumed' ? '已消耗' : null
  const rated = typeof item.rating === 'number' && item.rating > 0

  return (
    <div className="group relative transition duration-200 hover:-translate-y-0.5 hover:shadow-soft">
      <Link
        to={`/items/${item.id}`}
        className="no-tap-highlight block overflow-hidden rounded-2xl border border-petal-100 bg-surface shadow-card"
      >
        <div
          className="relative aspect-square w-full overflow-hidden bg-petal-50/60"
          onClick={(e) => {
            if (!item.photoId) return
            e.preventDefault()
            e.stopPropagation()
            setZoom(true)
          }}
          title={item.photoId ? '点击放大' : undefined}
        >
          <ItemPhoto photoId={item.photoId} className="h-full w-full object-cover" alt={item.name} />
          {(item.pinned || statusLabel) && (
            <span className="absolute left-2 top-2 flex gap-1">
              {item.pinned && (
                <span className="flex h-5 items-center rounded-full bg-petal-500/90 px-1.5 text-[10px] text-white backdrop-blur">
                  📌
                </span>
              )}
              {statusLabel && (
                <span className="rounded-full bg-ink-900/70 px-2 py-0.5 text-[11px] font-medium text-white">
                  {statusLabel}
                </span>
              )}
            </span>
          )}
          {item.photoId && (
            <span className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink-900/40 text-xs text-white/90 backdrop-blur">
              🔍
            </span>
          )}
        </div>
        <div className="p-3">
          <p className="line-clamp-1 text-sm font-semibold text-ink-900">{item.name || '未命名物品'}</p>
          {info && (
            <p className={`mt-0.5 text-xs ${info.warn ? 'font-medium text-petal-600' : 'text-ink-400'}`}>
              {info.text}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {item.tags.slice(0, 2).map((tid) => {
              const t = tags.find((x) => x.id === tid)
              if (!t) return null
              return (
                <span
                  key={tid}
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={tagChipStyle(t.color)}
                >
                  {t.name}
                </span>
              )
            })}
            {item.tags.length > 2 && (
              <span className="text-[10px] text-ink-300">+{item.tags.length - 2}</span>
            )}
          </div>
          {item.review && (
            <p className="mt-1.5 line-clamp-1 pr-7 text-[11px] italic text-ink-400">“{item.review}”</p>
          )}
          {item.remark && (
            <p className="mt-1 line-clamp-2 pr-7 text-[11px] leading-4 text-ink-500">{item.remark}</p>
          )}
        </div>
      </Link>

      {/* 置顶按钮：卡片右下角，点击立即切换并保存，置顶的物品排在列表最前 */}
      <button
        type="button"
        onClick={() => updateItem(item.id, { pinned: !item.pinned })}
        title={item.pinned ? '取消置顶' : '置顶'}
        aria-pressed={!!item.pinned}
        className={`no-tap-highlight absolute bottom-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-[13px] shadow-sm backdrop-blur transition active:scale-90 ${
          item.pinned
            ? 'bg-petal-500 text-white'
            : 'bg-surface/85 text-ink-300 ring-1 ring-petal-100 hover:text-petal-500'
        }`}
      >
        📌
      </button>

      {/* 评价徽章：右上角小标识（独立按钮，点击打开评价弹窗，不触发跳转） */}
      <button
        type="button"
        onClick={() => setRatingOpen(true)}
        title="评价这个物品"
        style={rated ? { backgroundColor: RATING_COLORS[item.rating!] } : undefined}
        className={`absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm backdrop-blur transition active:scale-95 ${
          rated
            ? 'text-white'
            : 'bg-surface/85 text-ink-400 ring-1 ring-petal-100'
        }`}
      >
        {rated ? (
          <>
            <span>★</span>
            <span>{RATING_LABELS[item.rating!]}</span>
          </>
        ) : (
          <span>评</span>
        )}
      </button>

      {ratingOpen && <RatingModal item={item} onClose={() => setRatingOpen(false)} />}
      {zoom && <Lightbox photoId={item.photoId} onClose={() => setZoom(false)} />}
    </div>
  )
}
