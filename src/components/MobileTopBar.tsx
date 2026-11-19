import { useUserStore } from '@/store/useUserStore'
import { useUIStore } from '@/store/useUIStore'
import UserGreeting from '@/components/UserGreeting'
import TopRightCluster from '@/components/TopRightCluster'

/**
 * 移动端顶部栏（md 以下显示，桌面隐藏）。
 * 极简：左侧头像入口 + 用户昵称（未设置则回退 MyDesk），右侧消息铃铛 + 小太阳。
 */
export default function MobileTopBar() {
  const nickname = useUserStore((s) => s.nickname)
  const setSearchOpen = useUIStore((s) => s.setSearchOpen)
  const displayName =
    nickname && nickname !== '我的工作台' ? nickname : 'MyDesk'

  return (
    <div className="safe-top flex items-center justify-between px-4 py-2 md:hidden">
      <div className="flex items-center gap-2">
        <UserGreeting compact />
        <span className="text-sm font-medium text-ink-400">{displayName}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          title="全局搜索"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-lg shadow-card ring-1 ring-petal-100"
        >
          🔍
        </button>
        <TopRightCluster />
      </div>
    </div>
  )
}
