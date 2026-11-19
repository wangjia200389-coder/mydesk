import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface NavModule {
  key: string
  to: string
  label: string
  icon: string
  end?: boolean
}

/** 全量模块定义（桌面侧边栏与移动端底栏共用，保证顺序一致） */
export const NAV_MODULES: NavModule[] = [
  { key: 'todo', to: '/', label: '待办', icon: '✅', end: true },
  { key: 'items', to: '/items', label: '物品', icon: '📦' },
  { key: 'homework', to: '/homework', label: '教学工具', icon: '📚' },
  { key: 'dashboard', to: '/dashboard', label: '仪表盘', icon: '🌸' },
  { key: 'pomodoro', to: '/pomodoro', label: '番茄钟', icon: '🍅' },
  { key: 'notes', to: '/notes', label: '便签', icon: '🗒️' },
  { key: 'review', to: '/review', label: '复盘', icon: '🌙' },
  { key: 'knowledge', to: '/knowledge', label: '知识库', icon: '📖' },
]

const DEFAULT_ORDER = NAV_MODULES.map((m) => m.key)

/** 解析持久化顺序：保留已知模块、过滤已删除、追加新增模块（保持默认顺序） */
function resolveOrder(stored: string[] | undefined): string[] {
  const base = stored && stored.length ? stored : DEFAULT_ORDER
  const known = new Set(NAV_MODULES.map((m) => m.key))
  const filtered = base.filter((k) => known.has(k))
  for (const m of NAV_MODULES) {
    if (!filtered.includes(m.key)) filtered.push(m.key)
  }
  return filtered
}

interface NavState {
  /** 模块 key 的有序数组，用户可拖动调整，持久化 */
  order: string[]
  setOrder: (order: string[]) => void
}

export const useNavStore = create<NavState>()(
  persist(
    (set) => ({
      order: DEFAULT_ORDER,
      setOrder: (order) => set({ order }),
    }),
    {
      name: 'my-desk:nav',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ order: s.order }),
      onRehydrateStorage: () => (state) => {
        if (state) state.order = resolveOrder(state.order)
      },
    },
  ),
)

/** 按持久化顺序返回排序后的模块列表 */
export function orderedModules(order: string[]): NavModule[] {
  const map = new Map(NAV_MODULES.map((m) => [m.key, m]))
  return order
    .map((k) => map.get(k))
    .filter((m): m is NavModule => Boolean(m))
}
