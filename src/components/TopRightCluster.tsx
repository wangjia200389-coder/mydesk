import MessageBell from './MessageBell'
import SunMascot from './SunMascot'

/** 右上角聚簇：消息铃铛（在左）+ 小太阳（在右）。移动端顶部栏与桌面悬浮处共用。 */
export default function TopRightCluster() {
  return (
    <div className="flex items-center gap-2">
      <MessageBell />
      <SunMascot />
    </div>
  )
}
