import dayjs from 'dayjs'
import type { CSSProperties } from 'react'
import type { Item, ItemTag } from '@/store/useItemStore'

/** 一级标签 id 常量（固定不可增删） */
export const L1_CONSUME = 'cat-consume'
export const L1_DURABLE = 'cat-durable'

export type ItemContext = 'consume' | 'durable' | 'none'

/** 返回某个标签（含其所有子孙）的 id 集合 */
export function getDescendantIds(tags: ItemTag[], rootId: string): Set<string> {
  const result = new Set<string>([rootId])
  const queue = [rootId]
  while (queue.length) {
    const cur = queue.shift()!
    for (const t of tags) {
      if (t.parentId === cur) {
        result.add(t.id)
        queue.push(t.id)
      }
    }
  }
  return result
}

/** 找到某个标签所属的一级标签 */
export function findL1(tags: ItemTag[], tagId: string): ItemTag | null {
  let cur = tags.find((t) => t.id === tagId)
  let guard = 6
  while (cur && cur.level > 1 && cur.parentId && guard-- > 0) {
    cur = tags.find((t) => t.id === cur!.parentId)
  }
  return cur && cur.level === 1 ? cur : null
}

/** 物品当前归属的一级上下文（消耗品 / 耐用品 / 无） */
export function getItemContext(tags: ItemTag[], item: Item): ItemContext {
  for (const t of item.tags) {
    const l1 = findL1(tags, t)
    if (l1) return l1.id === L1_CONSUME ? 'consume' : 'durable'
  }
  return 'none'
}

/** 根据当前选中的标签，判断排序上下文 */
export function tagContextOf(tags: ItemTag[], selectedTagId: string | null): ItemContext {
  if (!selectedTagId) return 'none'
  const l1 = findL1(tags, selectedTagId)
  if (!l1) return 'none'
  return l1.id === L1_CONSUME ? 'consume' : 'durable'
}

/** 物品是否命中某个标签（含其子孙标签向上汇总） */
export function itemMatchesTag(item: Item, tags: ItemTag[], targetTagId: string): boolean {
  if (item.tags.includes(targetTagId)) return true
  const set = getDescendantIds(tags, targetTagId)
  return item.tags.some((t) => set.has(t))
}

/** 排序规则
 * - pinned（置顶）永远排最前，组内沿用下方规则
 * - consume（消耗品）：保质期升序（无保质期排最后），再按创建时间倒序
 * - durable（耐用品）：金额降序（无金额排最后），再按创建时间倒序
 * - none：创建时间倒序
 */
export function sortItems(items: Item[], ctx: ItemContext): Item[] {
  const byCtx = (list: Item[]): Item[] => {
    const arr = [...list]
    if (ctx === 'consume') {
      arr.sort((a, b) => {
        const ae = a.expiryDate
        const be = b.expiryDate
        if (ae && be) return ae.localeCompare(be)
        if (ae && !be) return -1
        if (!ae && be) return 1
        return b.createdAt - a.createdAt
      })
    } else if (ctx === 'durable') {
      arr.sort((a, b) => {
        const aa = a.amount
        const ba = b.amount
        if (aa != null && ba != null) return ba - aa
        if (aa != null && ba == null) return -1
        if (aa == null && ba != null) return 1
        return b.createdAt - a.createdAt
      })
    } else {
      arr.sort((a, b) => b.createdAt - a.createdAt)
    }
    return arr
  }
  const pinned = byCtx(items.filter((i) => i.pinned))
  const rest = byCtx(items.filter((i) => !i.pinned))
  return [...pinned, ...rest]
}

/** 标签路径（从一级到自身），用于面包屑 */
export function getTagPath(tags: ItemTag[], tagId: string): ItemTag[] {
  const path: ItemTag[] = []
  let cur = tags.find((t) => t.id === tagId)
  let guard = 6
  while (cur && guard-- > 0) {
    path.unshift(cur)
    if (!cur.parentId) break
    cur = tags.find((t) => t.id === cur!.parentId)
  }
  return path
}

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  return dayjs(dateStr).startOf('day').diff(dayjs().startOf('day'), 'day')
}

/** 是否即将过期（默认 ≤7 天且未过期） */
export function isExpiringSoon(item: Item, withinDays = 7): boolean {
  if (!item.expiryReminder || !item.expiryDate) return false
  const d = daysUntil(item.expiryDate)
  return d != null && d >= 0 && d <= withinDays
}

export interface SelectOpts {
  statusFilter: 'normal' | 'discarded' | 'consumed'
  selectedTagId: string | null
  query: string
  tags: ItemTag[]
}

/**
 * 根据状态筛选 + 标签 + 搜索，返回最终列表与使用的排序上下文。
 * 注意：已丢弃/已消耗物品不参与任何分类标签筛选（tags 仅对 normal 生效）。
 */
export function selectItems(
  items: Item[],
  opts: SelectOpts,
): { list: Item[]; ctxUsed: ItemContext } {
  const { statusFilter, selectedTagId, query, tags } = opts

  if (statusFilter !== 'normal') {
    const list = items.filter((i) => i.status === statusFilter && !i.isDraft)
    return { list: sortItems(list, 'none'), ctxUsed: 'none' }
  }

  let base = items.filter((i) => i.status === 'normal' && !i.isDraft)
  if (selectedTagId) base = base.filter((i) => itemMatchesTag(i, tags, selectedTagId))

  if (query.trim()) {
    const q = query.trim().toLowerCase()
    base = base.filter((i) => (i.name || '').toLowerCase().includes(q))
    // 搜索结果：按创建时间倒序（不强制标签排序规则）
    return { list: sortItems(base, 'none'), ctxUsed: 'none' }
  }

  const ctx = tagContextOf(tags, selectedTagId)
  return { list: sortItems(base, ctx), ctxUsed: ctx }
}

/** 标签 chip 样式：用标签自身颜色做淡底色 + 同色文字 */
export function tagChipStyle(color: string): CSSProperties {
  return { backgroundColor: `${color}1f`, color }
}

/** 自动计算"已加入天数"（字段为空时按创建时间） */
export function displayAddedDays(item: Item): number {
  if (item.addedDays != null) return item.addedDays
  return Math.max(0, dayjs().startOf('day').diff(dayjs(item.createdAt).startOf('day'), 'day'))
}
