import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useItemStore } from '@/store/useItemStore'
import { useMessageStore } from '@/store/useMessageStore'
import { UPDATE_LOGS } from '@/lib/appInfo'
import { isExpiringSoon, daysUntil } from '@/lib/itemsUtil'
import FeedbackModal from '@/components/FeedbackModal'

/** 消息中心：更新通知（可标记已读/删除）+ 物品过期提醒；右下角悬浮「宝宝意见箱」 */
export default function Messages() {
  const items = useItemStore((s) => s.items)
  const readIds = useMessageStore((s) => s.readUpdateIds)
  const deletedIds = useMessageStore((s) => s.deletedUpdateIds)
  const toggleRead = useMessageStore((s) => s.toggleRead)
  const markAllRead = useMessageStore((s) => s.markAllRead)
  const deleteUpdate = useMessageStore((s) => s.deleteUpdate)
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  const visibleUpdates = UPDATE_LOGS.filter((u) => !deletedIds.includes(u.id))
  const unreadCount = visibleUpdates.filter((u) => !readIds.includes(u.id)).length

  const expiring = items
    .filter((i) => i.status === 'normal' && !i.isDraft && isExpiringSoon(i, 7))
    .sort(
      (a, b) =>
        (daysUntil(a.expiryDate) ?? 999) - (daysUntil(b.expiryDate) ?? 999),
    )

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 md:px-8">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink-900 md:text-3xl">
          消息中心 🔔
        </h1>
        <Link to="/items" className="text-xs text-petal-600">
          返回
        </Link>
      </header>

      {/* 更新通知 */}
      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-700">更新通知</h2>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllRead(visibleUpdates.map((u) => u.id))}
              className="text-xs font-medium text-petal-600 transition hover:text-petal-500"
            >
              全部已读
            </button>
          )}
        </div>
        {visibleUpdates.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-petal-200 bg-surface/60 p-6 text-center text-sm text-ink-400">
            暂无更新通知
          </div>
        ) : (
          <div className="space-y-2">
            {visibleUpdates.map((u) => {
              const isRead = readIds.includes(u.id)
              return (
                <div
                  key={u.id}
                  className={`rounded-2xl border p-4 shadow-card transition ${
                    isRead
                      ? 'border-petal-100 bg-surface'
                      : 'border-lavender-200 bg-lavender-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {!isRead && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-petal-500" />
                        )}
                        <p className="text-sm font-semibold text-ink-900">
                          {u.title}
                        </p>
                      </div>
                      <p className="mt-0.5 text-[11px] text-ink-300">
                        v{u.version} · {u.date}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-ink-500">
                        {u.desc}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggleRead(u.id)}
                        className="whitespace-nowrap rounded-lg bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-500 ring-1 ring-petal-100 transition hover:text-petal-600"
                      >
                        {isRead ? '标为未读' : '标为已读'}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteUpdate(u.id)}
                        className="whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-medium text-petal-600 transition hover:bg-petal-50"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* 物品提醒 */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-ink-700">物品提醒</h2>
        {expiring.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-petal-200 bg-surface/60 p-6 text-center text-sm text-ink-400">
            暂无即将过期的物品 🎉
          </div>
        ) : (
          <div className="space-y-2">
            {expiring.map((i) => (
              <Link
                key={i.id}
                to={`/items/${i.id}`}
                className="flex items-center justify-between rounded-2xl border border-petal-100 bg-surface p-4 shadow-card transition hover:bg-petal-50"
              >
                <div>
                  <p className="text-sm font-semibold text-ink-900">
                    {i.name || '未命名物品'}
                  </p>
                  <p className="text-xs text-ink-400">保质期提醒</p>
                </div>
                <span className="rounded-full bg-petal-100 px-3 py-1 text-xs font-medium text-petal-600">
                  {daysUntil(i.expiryDate) === 0
                    ? '今天到期'
                    : `${daysUntil(i.expiryDate)} 天后到期`}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 宝宝意见箱：右下角悬浮入口 */}
      <button
        type="button"
        onClick={() => setFeedbackOpen(true)}
        className="no-tap-highlight fixed bottom-20 right-4 z-40 flex items-center gap-1.5 rounded-full bg-gradient-to-br from-lavender-400 to-lavender-500 px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:brightness-105 active:scale-95 md:bottom-6"
      >
        💌 宝宝意见箱
      </button>

      {feedbackOpen && (
        <FeedbackModal onClose={() => setFeedbackOpen(false)} />
      )}
    </div>
  )
}
