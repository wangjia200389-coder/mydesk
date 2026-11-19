import { Outlet } from 'react-router-dom'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import MobileTopBar from '@/components/MobileTopBar'
import TopRightCluster from '@/components/TopRightCluster'
import GlobalSearch from '@/components/GlobalSearch'

export default function MainLayout() {
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden md:flex-row">
      {/* 桌面：左侧导航；移动端隐藏 */}
      <Sidebar className="hidden md:flex" />

      {/* 移动端：顶部栏（应用标识 + 头像入口）；桌面隐藏 */}
      <MobileTopBar />

      {/* 全局搜索弹窗（路由外挂载，受 useUIStore.searchOpen 控制） */}
      <GlobalSearch />

      {/* 桌面：右上角悬浮 消息铃铛 + 小太阳（移动端在顶部栏内已包含） */}
      <div className="hidden md:block fixed right-4 top-3 z-50">
        <div className="flex items-center gap-2 rounded-full bg-surface/70 px-2.5 py-1.5 shadow-card ring-1 ring-petal-100 backdrop-blur">
          <TopRightCluster />
        </div>
      </div>

      {/* 主内容区：移动端底部留白，避免被底部导航遮挡 */}
      <main className="scroll-soft flex-1 overflow-y-auto pb-24 md:pb-0">
        <Outlet />
      </main>

      {/* 移动端：底部 Tab 导航；桌面隐藏 */}
      <BottomNav />
    </div>
  )
}
