import { NavLink } from 'react-router-dom'
import { useUIStore } from '@/store/useUIStore'
import { orderedModules, useNavStore } from '@/store/useNavStore'
import UserGreeting from '@/components/UserGreeting'

export default function Sidebar({ className = '' }: { className?: string }) {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggle = useUIStore((s) => s.toggleSidebar)
  const setSearchOpen = useUIStore((s) => s.setSearchOpen)

  return (
    <aside
      className={`flex h-full flex-col border-r border-petal-100 bg-surface/80 backdrop-blur transition-[width] duration-300 ${
        collapsed ? 'w-[76px]' : 'w-64'
      } ${className}`}
    >
      {/* 用户头像 & 昵称 */}
      <div className="px-3 py-4">
        <UserGreeting />
      </div>

      {/* 全局搜索入口 */}
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        title="全局搜索"
        className={`mx-3 mb-1 flex items-center gap-2 rounded-xl bg-cream/60 px-3 py-2.5 text-sm text-ink-400 ring-1 ring-petal-100 transition hover:bg-petal-50 hover:text-ink-600 ${
          collapsed ? 'justify-center' : ''
        }`}
      >
        <span>🔍</span>
        {!collapsed && <span>搜索</span>}
      </button>

      {/* 导航 */}
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {orderedModules(useNavStore((s) => s.order)).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={item.label}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-petal-100 text-petal-600 shadow-card'
                  : 'text-ink-500 hover:bg-petal-50 hover:text-ink-700'
              } ${collapsed ? 'justify-center' : ''}`
            }
          >
            <span className="text-lg">{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* 折叠按钮 */}
      <button
        type="button"
        onClick={toggle}
        className="m-3 flex items-center justify-center gap-2 rounded-xl border border-petal-100 px-3 py-2 text-xs font-medium text-ink-500 transition-colors hover:bg-petal-50 hover:text-petal-600"
      >
        <span className={`transition-transform ${collapsed ? 'rotate-180' : ''}`}>
          «
        </span>
        {!collapsed && <span>收起</span>}
      </button>
    </aside>
  )
}
