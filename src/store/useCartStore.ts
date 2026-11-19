import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'

export interface CartItem {
  id: string
  name: string
  image?: string
  bought: boolean
  createdAt: number
}

interface CartState {
  items: CartItem[]
  addItem: (name: string, image?: string) => string
  toggleBought: (id: string) => void
  removeItem: (id: string) => void
  updateName: (id: string, name: string) => void
  /** 整体替换 items（拖拽排序后调用，顺序即持久化顺序） */
  setItems: (items: CartItem[]) => void
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],

      addItem: (name, image) => {
        const id = uuidv4()
        const item: CartItem = {
          id,
          name: name.trim() || '未命名物品',
          image,
          bought: false,
          createdAt: Date.now(),
        }
        set((s) => ({ items: [item, ...s.items] }))
        return id
      },

      toggleBought: (id) =>
        set((s) => ({
          items: s.items.map((it) =>
            it.id === id ? { ...it, bought: !it.bought } : it,
          ),
        })),

      removeItem: (id) =>
        set((s) => ({ items: s.items.filter((it) => it.id !== id) })),

      updateName: (id, name) =>
        set((s) => ({
          items: s.items.map((it) =>
            it.id === id ? { ...it, name: name.trim() || it.name } : it,
          ),
        })),

      setItems: (items) => set({ items }),
    }),
    {
      name: 'my-desk:cart',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ items: s.items }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        if (!Array.isArray(state.items)) state.items = []
        state.items = state.items.map((it) => ({
          ...it,
          name: it.name ?? '未命名物品',
          bought: !!it.bought,
          createdAt: it.createdAt ?? Date.now(),
        }))
      },
    },
  ),
)

/** 压缩图片为 Base64 JPEG；maxWidth 默认 800，quality 默认 0.7 */
export function compressImageToBase64(
  file: File,
  maxWidth = 800,
  quality = 0.7,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result
      if (typeof result !== 'string') {
        reject(new Error('读取图片失败'))
        return
      }
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const scale = Math.min(1, maxWidth / img.width)
        canvas.width = Math.floor(img.width * scale)
        canvas.height = Math.floor(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas 不可用'))
          return
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = () => reject(new Error('图片加载失败'))
      img.src = result
    }
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}
