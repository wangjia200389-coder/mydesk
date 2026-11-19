import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface MessageState {
  /** 已读过的更新通知 id 列表 */
  readUpdateIds: string[]
  /** 已删除的更新通知 id 列表（从消息中心隐藏） */
  deletedUpdateIds: string[]
  /** 标记单条已读 */
  markRead: (id: string) => void
  /** 标记单条未读 */
  markUnread: (id: string) => void
  /** 切换单条已读/未读 */
  toggleRead: (id: string) => void
  /** 全部标记已读 */
  markAllRead: (ids: string[]) => void
  /** 删除单条更新通知 */
  deleteUpdate: (id: string) => void
}

export const useMessageStore = create<MessageState>()(
  persist(
    (set) => ({
      readUpdateIds: [],
      deletedUpdateIds: [],
      markRead: (id) =>
        set((s) =>
          s.readUpdateIds.includes(id)
            ? s
            : { readUpdateIds: [...s.readUpdateIds, id] },
        ),
      markUnread: (id) =>
        set((s) => ({
          readUpdateIds: s.readUpdateIds.filter((x) => x !== id),
        })),
      toggleRead: (id) =>
        set((s) =>
          s.readUpdateIds.includes(id)
            ? { readUpdateIds: s.readUpdateIds.filter((x) => x !== id) }
            : { readUpdateIds: [...s.readUpdateIds, id] },
        ),
      markAllRead: (ids) =>
        set({ readUpdateIds: Array.from(new Set(ids)) }),
      deleteUpdate: (id) =>
        set((s) => ({
          deletedUpdateIds: Array.from(new Set([...s.deletedUpdateIds, id])),
          readUpdateIds: s.readUpdateIds.filter((x) => x !== id),
        })),
    }),
    {
      name: 'my-desk:messages',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
