import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'

/** 附件文件（存在 IndexedDB，这里只留元数据） */
export interface ReviewFile {
  id: string
  name: string
  size: number
}

/** 一条复盘点：问题 + 回答 + 可选图片/文件。问题可改，也可以随手加新的。 */
export interface ReviewField {
  id: string
  label: string
  value: string
  /** 图片 id（存 mydesk-photos 库，会跟着多设备同步） */
  photoIds?: string[]
  /** 文件（存 my-desk-knowledge 库，会跟着多设备同步） */
  files?: ReviewFile[]
}

/** 一天一条复盘，date 天然唯一 */
export interface ReviewDay {
  /** YYYY-MM-DD */
  date: string
  /** 入睡时间 HH:mm */
  sleepAt: string
  /** 起床时间 HH:mm */
  wakeAt: string
  fields: ReviewField[]
  /** 当天配图（存 mydesk-photos 库，会跟着多设备同步） */
  photoIds?: string[]
  /** 当天附件（存 my-desk-knowledge 库，会跟着多设备同步） */
  files?: ReviewFile[]
  updatedAt: number
}

/** 默认模板：就是老大给的那三条 */
export const DEFAULT_REVIEW_TEMPLATE = [
  '今天最费劲的一件事',
  '今天有一个瞬间还不错',
  '明天最不想面对的一件',
]

export function makeReviewDay(date: string, template: string[]): ReviewDay {
  return {
    date,
    sleepAt: '',
    wakeAt: '',
    fields: template.map((label) => ({ id: uuidv4(), label, value: '' })),
    photoIds: [],
    files: [],
    updatedAt: 0,
  }
}

/** 有实质内容才建档，避免每天打开一次就留一条空记录 */
export function reviewHasContent(d: ReviewDay): boolean {
  if (d.sleepAt || d.wakeAt) return true
  if ((d.photoIds?.length ?? 0) > 0 || (d.files?.length ?? 0) > 0) return true
  return d.fields.some((f) => f.value.trim().length > 0)
}

interface ReviewState {
  days: ReviewDay[]
  template: string[]
  upsertDay: (day: ReviewDay) => void
  removeDay: (date: string) => void
  setTemplate: (labels: string[]) => void
}

export const useReviewStore = create<ReviewState>()(
  persist(
    (set) => ({
      days: [],
      template: DEFAULT_REVIEW_TEMPLATE,
      upsertDay: (day) =>
        set((s) => {
          const next = s.days.filter((d) => d.date !== day.date)
          next.push({ ...day, updatedAt: Date.now() })
          next.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
          return { days: next }
        }),
      removeDay: (date) =>
        set((s) =>
          s.days.some((d) => d.date === date)
            ? { days: s.days.filter((d) => d.date !== date) }
            : {},
        ),
      setTemplate: (labels) => {
        const clean = labels.map((l) => l.trim()).filter(Boolean)
        set({ template: clean.length ? clean : DEFAULT_REVIEW_TEMPLATE })
      },
    }),
    {
      name: 'my-desk:review',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ days: s.days, template: s.template }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        if (!Array.isArray(state.template) || state.template.length === 0) {
          state.template = [...DEFAULT_REVIEW_TEMPLATE]
        }
        if (!Array.isArray(state.days)) {
          state.days = []
          return
        }
        // 兜底：旧版本/异常数据补齐字段，避免页面拿到 undefined 崩掉
        state.days = state.days
          .filter((d) => d && typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date))
          .map((d) => {
            const rawFields = Array.isArray(d.fields)
              ? d.fields.filter((f) => f && typeof f === 'object')
              : []

            // v1.10.5 把附件挂在每条复盘点下；现在统一收拢成「当天附件」，
            // 旧的挂载点顺手清掉，避免同一张图被渲染两次。
            const legacyPhotos = rawFields.flatMap((f) =>
              Array.isArray(f.photoIds) ? f.photoIds : [],
            )
            const legacyFiles = rawFields.flatMap((f) =>
              Array.isArray(f.files) ? f.files : [],
            )

            const photos = Array.from(
              new Set(
                [
                  ...(Array.isArray(d.photoIds) ? d.photoIds : []),
                  ...legacyPhotos,
                ].filter((x): x is string => typeof x === 'string'),
              ),
            )

            const fileMap = new Map<string, ReviewFile>()
            for (const f of [...(Array.isArray(d.files) ? d.files : []), ...legacyFiles]) {
              if (!f || typeof f !== 'object' || typeof f.id !== 'string') continue
              fileMap.set(f.id, {
                id: f.id,
                name: typeof f.name === 'string' && f.name ? f.name : '文件',
                size: typeof f.size === 'number' ? f.size : 0,
              })
            }

            return {
              date: d.date,
              sleepAt: typeof d.sleepAt === 'string' ? d.sleepAt : '',
              wakeAt: typeof d.wakeAt === 'string' ? d.wakeAt : '',
              fields: rawFields.map((f) => ({
                id: typeof f.id === 'string' && f.id ? f.id : uuidv4(),
                label: typeof f.label === 'string' ? f.label : '',
                value: typeof f.value === 'string' ? f.value : '',
              })),
              photoIds: photos,
              files: [...fileMap.values()],
              updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : 0,
            }
          })
          .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      },
    },
  ),
)
