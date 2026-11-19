import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import { deletePhoto } from '@/lib/photo'
import { getDescendantIds } from '@/lib/itemsUtil'

/* ------------------------------------------------------------------ */
/* 类型                                                                */
/* ------------------------------------------------------------------ */

export type ItemStatus = 'normal' | 'discarded' | 'consumed'

export interface ItemTag {
  id: string
  name: string
  level: 1 | 2 | 3
  /** 一级标签 parentId = null */
  parentId: string | null
  /** 标签主题色（hex） */
  color: string
}

export interface Item {
  id: string
  /** IndexedDB 中的照片 id（见 src/lib/photo.ts）；无照片为 null */
  photoId: string | null
  /** 列表置顶：钉在物品列表最前面（卡片右下角 📌 切换） */
  pinned?: boolean
  name: string
  quantity: number | null
  /** 金额（元，支持小数） */
  amount: number | null
  /** 已加入天数；null 表示按创建时间自动计算 */
  addedDays: number | null
  /** 保质期到期日 YYYY-MM-DD；null 表示未设置 */
  expiryDate: string | null
  /** 是否开启保质期到期提醒 */
  expiryReminder: boolean
  /** 标签 id 数组（可跨层级、可多个） */
  tags: string[]
  status: ItemStatus
  /** 草稿箱标记：草稿只存照片 + 基本信息，未正式加入 */
  isDraft: boolean
  /** 评价：1~5 星（5=夯，1=拉）；null 表示未评 */
  rating?: number | null
  /** 追加锐评（文字） */
  review?: string | null
  /** 备注说明 */
  remark?: string | null
  createdAt: number
  updatedAt: number
}

/* ------------------------------------------------------------------ */
/* 预设标签树                                                          */
/* ------------------------------------------------------------------ */

const C = {
  consume: '#ff8da1',
  durable: '#54bd9b',
  food: '#ff9e7a',
  daily: '#ffb3c6',
  med: '#9be0c3',
  cloth: '#a78bfa',
  elec: '#6aa6ff',
  furn: '#c9a27e',
  book: '#f0b85a',
}

/** 自定义标签配色池（二级新标签循环取色；三级继承父级颜色） */
const CUSTOM_PALETTE = [
  '#ff8da1',
  '#a78bfa',
  '#54bd9b',
  '#6aa6ff',
  '#f0b85a',
  '#c9a27e',
  '#ff9e7a',
  '#9be0c3',
]

export const PRESET_TAGS: ItemTag[] = [
  // 一级（固定）
  { id: 'cat-consume', name: '消耗品', level: 1, parentId: null, color: C.consume },
  { id: 'cat-durable', name: '耐用品', level: 1, parentId: null, color: C.durable },
  // 消耗品 -> 二级
  { id: 'l2-food', name: '食品', level: 2, parentId: 'cat-consume', color: C.food },
  { id: 'l2-daily', name: '日用品', level: 2, parentId: 'cat-consume', color: C.daily },
  { id: 'l2-med', name: '药品', level: 2, parentId: 'cat-consume', color: C.med },
  // 耐用品 -> 二级
  { id: 'l2-cloth', name: '衣服', level: 2, parentId: 'cat-durable', color: C.cloth },
  { id: 'l2-elec', name: '电子设备', level: 2, parentId: 'cat-durable', color: C.elec },
  { id: 'l2-furn', name: '家具', level: 2, parentId: 'cat-durable', color: C.furn },
  { id: 'l2-book', name: '书籍', level: 2, parentId: 'cat-durable', color: C.book },
  // 衣服 -> 三级
  { id: 'l3-top', name: '上衣', level: 3, parentId: 'l2-cloth', color: C.cloth },
  { id: 'l3-bottom', name: '下衣', level: 3, parentId: 'l2-cloth', color: C.cloth },
  { id: 'l3-skirt', name: '裙子', level: 3, parentId: 'l2-cloth', color: C.cloth },
  { id: 'l3-shoe', name: '鞋子', level: 3, parentId: 'l2-cloth', color: C.cloth },
  // 电子设备 -> 三级
  { id: 'l3-phone', name: '手机', level: 3, parentId: 'l2-elec', color: C.elec },
  { id: 'l3-pc', name: '电脑', level: 3, parentId: 'l2-elec', color: C.elec },
  { id: 'l3-head', name: '耳机', level: 3, parentId: 'l2-elec', color: C.elec },
]

const PRESET_IDS = new Set(PRESET_TAGS.map((t) => t.id))

/* ------------------------------------------------------------------ */
/* State                                                              */
/* ------------------------------------------------------------------ */

export interface ItemDraft {
  photoId?: string | null
  pinned?: boolean
  name?: string
  quantity?: number | null
  amount?: number | null
  addedDays?: number | null
  expiryDate?: string | null
  expiryReminder?: boolean
  tags?: string[]
  isDraft?: boolean
  rating?: number | null
  review?: string | null
  remark?: string | null
}

interface ItemState {
  items: Item[]
  tags: ItemTag[]

  /* actions */
  addItem: (opt?: ItemDraft) => string
  updateItem: (id: string, patch: Partial<Omit<Item, 'id' | 'createdAt'>>) => void
  removeItem: (id: string) => void
  setStatus: (id: string, status: ItemStatus) => void

  /** 新增标签：一级固定不可增删；二/三级可自定义 */
  addTag: (name: string, level: 2 | 3, parentId: string) => ItemTag
  /** 删除标签（仅自定义）：级联删除子孙，并从所有物品中剥离 */
  removeTag: (id: string) => void
}

export const useItemStore = create<ItemState>()(
  persist(
    (set, get) => ({
      items: [],
      tags: PRESET_TAGS,

      addItem: (opt) => {
        const now = Date.now()
        const item: Item = {
          id: uuidv4(),
          photoId: opt?.photoId ?? null,
          pinned: opt?.pinned ?? false,
          name: opt?.name ?? '',
          quantity: opt?.quantity ?? null,
          amount: opt?.amount ?? null,
          addedDays: opt?.addedDays ?? null,
          expiryDate: opt?.expiryDate ?? null,
          expiryReminder: opt?.expiryReminder ?? false,
          tags: opt?.tags ?? [],
          status: 'normal',
          isDraft: opt?.isDraft ?? false,
          rating: opt?.rating ?? null,
          review: opt?.review ?? null,
          remark: opt?.remark ?? null,
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({ items: [item, ...s.items] }))
        return item.id
      },

      updateItem: (id, patch) =>
        set((s) => ({
          items: s.items.map((it) =>
            it.id === id ? { ...it, ...patch, updatedAt: Date.now() } : it,
          ),
        })),

      removeItem: (id) => {
        const it = get().items.find((i) => i.id === id)
        if (it?.photoId) deletePhoto(it.photoId).catch(() => {})
        set((s) => ({ items: s.items.filter((i) => i.id !== id) }))
      },

      setStatus: (id, status) =>
        set((s) => ({
          items: s.items.map((it) =>
            it.id === id ? { ...it, status, updatedAt: Date.now() } : it,
          ),
        })),

      addTag: (raw, level, parentId) => {
        const name = raw.trim().slice(0, 12) || '新标签'
        const tags = get().tags
        let color: string
        if (level === 3) {
          color = tags.find((t) => t.id === parentId)?.color ?? CUSTOM_PALETTE[0]!
        } else {
          const usedCustom = tags.filter(
            (t) => t.level === 2 && !PRESET_IDS.has(t.id),
          ).length
          color = CUSTOM_PALETTE[usedCustom % CUSTOM_PALETTE.length]!
        }
        const id = `tag_${Date.now().toString(36)}_${uuidv4().slice(0, 5)}`
        const tag: ItemTag = { id, name, level, parentId, color }
        set({ tags: [...tags, tag] })
        return tag
      },

      removeTag: (id) => {
        const tag = get().tags.find((t) => t.id === id)
        if (!tag || PRESET_IDS.has(id)) return
        const toRemove = getDescendantIds(get().tags, id)
        set((s) => ({
          tags: s.tags.filter((t) => !toRemove.has(t.id)),
          items: s.items.map((it) =>
            it.tags.some((tid) => toRemove.has(tid))
              ? { ...it, tags: it.tags.filter((tid) => !toRemove.has(tid)), updatedAt: Date.now() }
              : it,
          ),
        }))
      },
    }),
    {
      name: 'my-desk:items',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ items: s.items, tags: s.tags }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        // 确保预设标签始终存在（老数据/手动删掉预设后补回）
        if (!Array.isArray(state.tags) || state.tags.length === 0) {
          state.tags = [...PRESET_TAGS]
        } else {
          const presetMissing = PRESET_TAGS.filter(
            (p) => !state!.tags.some((t) => t.id === p.id),
          )
          state.tags = [...presetMissing, ...state.tags]
        }
        if (!Array.isArray(state.items)) state.items = []
        // 老数据补备注 / 置顶字段
        state.items.forEach((it) => {
          if (it.remark === undefined) it.remark = null
          if (it.pinned === undefined) it.pinned = false
        })
      },
    },
  ),
)
