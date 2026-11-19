import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface UserProfile {
  nickname: string
  /** base64 data URL; null/empty 表示使用默认占位头像 */
  avatarDataUrl: string | null
}

interface UserState extends UserProfile {
  setNickname: (name: string) => void
  setAvatarDataUrl: (data: string | null) => void

  /**
   * 读取上传的图片文件并写入 avatarDataUrl
   * - 仅接受 image/*
   * - 上限 maxMB（限制原始文件大小，防止超大文件读入内存）
   * - 自动 canvas 等比缩放到 maxSide 再导出为 JPEG 85%，保证存入 localStorage 的头像足够小
   */
  setAvatarFromFile: (file: File, opt?: { maxMB?: number; maxSide?: number }) => Promise<string>

  reset: () => void
}

const DEFAULT_NICKNAME = '我的工作台'
const MAX_MB = 20
const MAX_SIDE = 320

function resizeToDataURL(file: File, maxSide: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('图片解码失败'))
      img.onload = () => {
        const ratio = Math.min(1, maxSide / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * ratio))
        const h = Math.max(1, Math.round(img.height * ratio))
        try {
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('无法创建 canvas'))
            return
          }
          ctx.drawImage(img, 0, 0, w, h)
          resolve(canvas.toDataURL('image/jpeg', 0.85))
        } catch (e) {
          reject(e instanceof Error ? e : new Error('图片处理失败'))
        }
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      nickname: DEFAULT_NICKNAME,
      avatarDataUrl: null,

      setNickname: (raw) => {
        const name = raw.trim().slice(0, 20)
        set({ nickname: name || DEFAULT_NICKNAME })
      },

      setAvatarDataUrl: (data) => set({ avatarDataUrl: data ?? null }),

      setAvatarFromFile: async (file, opt) => {
        const maxMB = opt?.maxMB ?? MAX_MB
        const maxSide = opt?.maxSide ?? MAX_SIDE
        if (!file.type.startsWith('image/')) {
          throw new Error('请上传图片文件')
        }
        if (file.size > maxMB * 1024 * 1024) {
          throw new Error(`图片大小不能超过 ${maxMB} MB`)
        }
        const dataUrl = await resizeToDataURL(file, maxSide)
        set({ avatarDataUrl: dataUrl })
        return dataUrl
      },

      reset: () => set({ nickname: DEFAULT_NICKNAME, avatarDataUrl: null }),
    }),
    {
      name: 'my-desk:user',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ nickname: s.nickname, avatarDataUrl: s.avatarDataUrl }),
    },
  ),
)
