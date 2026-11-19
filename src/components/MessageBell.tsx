import { useNavigate } from 'react-router-dom'
import { useItemStore } from '@/store/useItemStore'
import { useMessageStore } from '@/store/useMessageStore'
import { UPDATE_LOGS } from '@/lib/appInfo'
import { isExpiringSoon } from '@/lib/itemsUtil'

/** 全局消息铃铛：显示未读红点（更新通知 + 即将过期提醒） */
export default function MessageBell() {
  const navigate = useNavigate()
  const items = useItemStore((s) => s.items)
  const readIds = useMessageStore((s) => s.readUpdateIds)
  const deletedIds = useMessageStore((s) => s.deletedUpdateIds)

  const unreadUpdates = UPDATE_LOGS.filter(
    (u) => !deletedIds.includes(u.id) && !readIds.includes(u.id),
  ).length
  const expiring = items.filter(
    (i) => i.status === 'normal' && !i.isDraft && isExpiringSoon(i, 7),
  ).length
  const unread = unreadUpdates + expiring

  return (
    <button
      type="button"
      onClick={() => navigate('/messages')}
      title="消息"
      className="no-tap-highlight relative flex h-9 w-9 items-center justify-center rounded-full bg-surface/80 text-ink-500 shadow-card ring-1 ring-petal-100 transition hover:text-petal-600 active:scale-95"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-petal-500 px-1 text-[10px] font-bold text-white shadow">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  )
}
