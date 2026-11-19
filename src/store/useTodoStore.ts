import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import dayjs from 'dayjs'
import weekday from 'dayjs/plugin/weekday'
import isoWeek from 'dayjs/plugin/isoWeek'
import isBetween from 'dayjs/plugin/isBetween'
dayjs.extend(weekday)
dayjs.extend(isoWeek)
dayjs.extend(isBetween)

/* ------------------------------------------------------------------ */
/* 类型                                                                */
/* ------------------------------------------------------------------ */

export type TimeSlotKey = 'none' | 'morning' | 'afternoon' | 'evening' | 'custom'

export type RepeatFreq = 'once' | 'daily' | 'weekday' | 'weekly' | 'monthly'

export interface SubTask {
  id: string
  title: string
  done: boolean
}

export interface Category {
  id: string
  name: string
  preset: boolean
  /** Tailwind class: 用于小 dot */
  dot: string
  /** Tailwind class: 用于胶囊 chip */
  chip: string
  /** Tailwind class: 用于卡片整体浅色背景（三板块里一眼识别分类） */
  cardBg: string
  /** Tailwind class: 用于卡片左侧的颜色竖条 */
  cardBar: string
}

export interface Todo {
  id: string
  title: string
  done: boolean
  completedAt: number | null
  createdAt: number
  updatedAt: number

  categoryId: string
  /** YYYY-MM-DD；v4 起所有任务都有截止日期；无截止日期的老数据自动迁移为今天 */
  dueDate: string
  timeSlot: TimeSlotKey
  customStart: string | null
  customEnd: string | null
  notes: string
  subtasks: SubTask[]
  repeat: RepeatFreq
  /** 是否允许提前完成（决定它在截止日期之前出现在「今日可做」还是「提醒」） */
  allowAheadOfSchedule: boolean
  /** 用于重复任务幂等：同一条重复系列共享一个 originId；老数据/非重复任务默认 = 自己的 id */
  originId: string
  /** 手动提醒：开启后该任务无条件进入“提醒”板块 */
  remindManual: boolean
}

/** YYYY-MM-DD；现在已经不再有「收集箱」概念 */
export type ActiveDateKey = string

export type ViewMode = 'category' | 'timeline'

export interface SubtaskHistoryItem {
  id: string
  /** 用户给这套子计划起的名字（默认取第一条子计划标题，允许改） */
  name: string
  /** 子计划模板列表 */
  subtasks: { title: string }[]
  createdAt: number
}

export type BoardSection = 'mustDoToday' | 'canDoToday' | 'reminders'
/** 折叠区域 key：三板块 + 底部完成记录（doneOnActiveDate） */
export type CollapsibleKey = BoardSection | 'doneOnActive'

export interface BoardBuckets {
  mustDoToday: Todo[]
  canDoToday: Todo[]
  reminders: Todo[]
  /** 仅用于"今日已完成"折叠区域（当前选的日期） */
  doneOnActiveDate: Todo[]
}

/* ------------------------------------------------------------------ */
/* 常量                                                                */
/* ------------------------------------------------------------------ */

export const PRESET_CATEGORIES: Category[] = [
  {
    id: 'work',
    name: '工作',
    preset: true,
    dot: 'bg-petal-500',
    chip: 'bg-petal-100 text-petal-700 ring-petal-200',
    cardBg: 'bg-petal-50/80',
    cardBar: 'bg-petal-500',
  },
  {
    id: 'study',
    name: '学习',
    preset: true,
    dot: 'bg-lavender-500',
    chip: 'bg-lavender-200 text-lavender-700 ring-lavender-300',
    cardBg: 'bg-lavender-50/80',
    cardBar: 'bg-lavender-500',
  },
  {
    id: 'life',
    name: '生活',
    preset: true,
    dot: 'bg-mint-500',
    chip: 'bg-mint-200 text-mint-700 ring-mint-300',
    cardBg: 'bg-mint-50/80',
    cardBar: 'bg-mint-500',
  },
  {
    id: 'health',
    name: '健康',
    preset: true,
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
    cardBg: 'bg-emerald-50/80',
    cardBar: 'bg-emerald-500',
  },
  {
    id: 'finance',
    name: '财务',
    preset: true,
    dot: 'bg-yellow-500',
    chip: 'bg-butter-300 text-ink-800 ring-butter-400',
    cardBg: 'bg-butter-50/80',
    cardBar: 'bg-yellow-500',
  },
  {
    id: 'other',
    name: '其他',
    preset: true,
    dot: 'bg-ink-400',
    chip: 'bg-ink-100 text-ink-600 ring-ink-200',
    cardBg: 'bg-ink-50/80',
    cardBar: 'bg-ink-400',
  },
]

export const TIME_SLOTS: {
  key: TimeSlotKey
  label: string
  hours?: string
}[] = [
  { key: 'none', label: '无时间段' },
  { key: 'morning', label: '上午', hours: '09:00 – 12:00' },
  { key: 'afternoon', label: '下午', hours: '13:00 – 18:00' },
  { key: 'evening', label: '晚上', hours: '19:00 – 22:00' },
  { key: 'custom', label: '自定义时间段' },
]

export const TIMESLOT_ORDER: Record<TimeSlotKey, number> = {
  morning: 0,
  afternoon: 1,
  evening: 2,
  custom: 3,
  none: 9,
}

export const REPEAT_OPTIONS: { value: RepeatFreq; label: string }[] = [
  { value: 'once', label: '仅一次' },
  { value: 'daily', label: '每天' },
  { value: 'weekday', label: '工作日（周一至周五）' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
]

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

export const todayStr = (): string => dayjs().format('YYYY-MM-DD')
export const fmtYMD = (d: dayjs.Dayjs | Date | number): string => dayjs(d).format('YYYY-MM-DD')

/** 当前所选「年份」的第一天和最后一天（YYYY-MM-DD）；供日历面板用 */
export function yearRange(year?: number): { start: string; end: string } {
  const y = year ?? dayjs().year()
  return {
    start: dayjs(`${y}-01-01`).format('YYYY-MM-DD'),
    end: dayjs(`${y}-12-31`).format('YYYY-MM-DD'),
  }
}

export function nextDueDate(currentYMD: string, freq: RepeatFreq): string {
  const base = dayjs(currentYMD).startOf('day')
  let candidate: dayjs.Dayjs
  switch (freq) {
    case 'once':
      return currentYMD
    case 'daily':
      candidate = base.add(1, 'day')
      break
    case 'weekly':
      candidate = base.add(7, 'day')
      break
    case 'monthly': {
      candidate = base.add(1, 'month')
      break
    }
    case 'weekday': {
      candidate = base.add(1, 'day')
      let guard = 14
      while (guard-- > 0) {
        const w = candidate.isoWeekday()
        if (w >= 1 && w <= 5) break
        candidate = candidate.add(1, 'day')
      }
      break
    }
  }
  if (candidate.isBefore(base, 'day') || candidate.isSame(base, 'day')) {
    candidate = base.add(1, 'day')
  }
  return candidate.format('YYYY-MM-DD')
}

/* ------------------------------------------------------------------ */
/* 【问题 3 核心工具】：重复任务未来 30 天实例预生成 / 幂等补齐         */
/* ------------------------------------------------------------------ */

/** 判断某个日期（ymd）在给定频率下是否"命中"（即今天是否应有一条该重复任务实例） */
function freqMatches(baseWeekdayIso: number, baseMonthDay: number, freq: RepeatFreq, date: dayjs.Dayjs): boolean {
  switch (freq) {
    case 'daily':
      return true
    case 'weekday': {
      const w = date.isoWeekday()
      return w >= 1 && w <= 5
    }
    case 'weekly':
      return date.isoWeekday() === baseWeekdayIso
    case 'monthly': {
      // 月底边界：若基准是 1/31 日、目标月只有 30/29/28 天 → 退到该月最后一天
      const lastDay = date.daysInMonth()
      const targetDay = Math.min(baseMonthDay, lastDay)
      return date.date() === targetDay
    }
    case 'once':
      return false
  }
}

/**
 * 生成 [startYMD, startYMD + (limitDays - 1)] 范围内满足 freq 的所有 YYYY-MM-DD 日期数组。
 * 注意：startYMD 本身如果不命中 freq（例如 weekday 系列 + 起始是周六），不会被加入（起始自动顺延到下一个命中日）。
 */
export function genRepeatDates(startYMD: string, freq: RepeatFreq, limitDays = 30): string[] {
  if (freq === 'once' || limitDays <= 0) return []
  const start = dayjs(startYMD).startOf('day')
  const baseWeekdayIso = start.isoWeekday() // 1=Mon..7=Sun
  const baseMonthDay = start.date()
  const result: string[] = []
  for (let i = 0; i < limitDays; i++) {
    const d = start.add(i, 'day')
    if (freqMatches(baseWeekdayIso, baseMonthDay, freq, d)) {
      result.push(d.format('YYYY-MM-DD'))
    }
  }
  return result
}

/**
 * 给定一条重复任务模板（或实例），补齐未来 30 天内缺失的实例。
 * 返回：新增（未保存）的 Todo[]，由调用者负责 set({ todos: [...] }) 写回。
 * 幂等依据：同 originId + 同 dueDate → 已存在就跳过。
 * 额外：blacklist[originId] 里记录了用户手动删除过的 dueDate，命中也跳过，避免"删了又补回来"。
 */
export function buildMissingRepeatInstances(
  template: Todo,
  allTodos: Todo[],
  limitDays = 30,
  blacklist: Record<string, string[]> = {},
): Todo[] {
  if (template.repeat === 'once') return []
  const dates = genRepeatDates(template.dueDate, template.repeat, limitDays)
  if (dates.length === 0) return []
  // 把 existing 的 dueDate 拿出来（按 originId），同时做一个相似性回退
  const existKey = new Set<string>()
  for (const x of allTodos) {
    if (x.originId === template.originId) {
      existKey.add(`${x.originId}|${x.dueDate}`)
    } else if (x.title === template.title && x.categoryId === template.categoryId && x.repeat === template.repeat) {
      existKey.add(`${x.title}|${x.categoryId}|${template.repeat}|${x.dueDate}`)
    }
  }
  const blackSet = new Set<string>(blacklist[template.originId] ?? [])
  const added: Todo[] = []
  for (const due of dates) {
    if (existKey.has(`${template.originId}|${due}`)) continue
    if (existKey.has(`${template.title}|${template.categoryId}|${template.repeat}|${due}`)) continue
    if (blackSet.has(due)) continue // 用户手动删除过的单日，不再补齐
    added.push(
      makeTodo({
        title: template.title,
        categoryId: template.categoryId,
        dueDate: due,
        timeSlot: template.timeSlot,
        customStart: template.customStart,
        customEnd: template.customEnd,
        notes: template.notes,
        subtasks: template.subtasks.map((s) => ({ ...s, done: false })),
        repeat: template.repeat,
        allowAheadOfSchedule: template.allowAheadOfSchedule,
        remindManual: !!template.remindManual,
        originId: template.originId, // 继承系列 id
      }),
    )
  }
  return added
}

export interface TodoDraft {
  title: string
  categoryId: string
  /** v4 起强制有 dueDate（null 传进来会被默认今天兜底） */
  dueDate: string | null
  timeSlot: TimeSlotKey
  customStart: string | null
  customEnd: string | null
  notes: string
  subtasks: SubTask[]
  repeat: RepeatFreq
  allowAheadOfSchedule: boolean
  /** 手动提醒：开启后无条件进入提醒板块 */
  remindManual: boolean
  /** 内部使用：新建重复系列任务时，可选传 originId */
  originId?: string | null
}

export function makeTodo(d: TodoDraft): Todo {
  const now = Date.now()
  const title = d.title.trim()
  const id = uuidv4()
  return {
    id,
    originId: d.originId ?? id,
    title: title.length ? title : '未命名任务',
    done: false,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    categoryId: d.categoryId,
    // v4 需求 7：没有设置截止日期的，一律默认截止日期为今天
    dueDate: d.dueDate ?? todayStr(),
    timeSlot: d.timeSlot,
    customStart: d.timeSlot === 'custom' ? d.customStart : null,
    customEnd: d.timeSlot === 'custom' ? d.customEnd : null,
    notes: d.notes,
    subtasks: d.subtasks,
    repeat: d.repeat,
    allowAheadOfSchedule: !!d.allowAheadOfSchedule,
    remindManual: !!d.remindManual,
  }
}

/* ------------------------------------------------------------------ */
/* 【需求 6 核心】：板块分配逻辑                                        */
/* ------------------------------------------------------------------ */

/**
 * 【问题 5 修复】按【当前选中日期 activeKey = 观察日】把未完成的任务分到三个桶，
 * 另返回【当前选的日期】当天已完成的任务（给底部折叠区用）。
 * 观察日 viewDay = activeKey，规则：
 *  - 今日必做：dueDate ≤ viewDay（到达或超过截止日）
 *  - 今日可做：allowAheadOfSchedule = true 且 viewDay < dueDate（截止前一天及更早）
 *    └ 额外：若 dueDate 在 viewDay 之前但未完成，dueDate 会被自动顺延，因此这里不额外处理已过期 case
 *  - 提醒：allowAheadOfSchedule = false 且 dueDate > viewDay
 * @param todos 全部任务（会先过滤 done）
 * @param todayKey  今天（YYYY-MM-DD）：仅用于 activeKey 范围守卫，不参与分桶
 * @param activeKey 日历上当前选中的日期（YYYY-MM-DD）= 观察日 viewDay
 */
export function getBoardBuckets(
  todos: Todo[],
  todayKey: string,
  activeKey: string,
  order: Record<BoardSection, string[]>,
): BoardBuckets & { _orderMissingIds: { [k in BoardSection]?: string[] } } {
  const mustDoToday: Todo[] = []
  const canDoToday: Todo[] = []
  const reminders: Todo[] = []
  const doneOnActiveDate: Todo[] = []

  const viewDay = dayjs(activeKey).startOf('day')
  const todayDj = dayjs(todayKey).startOf('day')
  // 观察日是否在"真实今日之后"（未来日历页）。用户要求：真实今天没过完（零点没到）时，
  // 过去/今天未完成的 once 一次性任务仍然应该"只出现在今天视图"，不要提前进入未来日期
  // 视图的今日必做。顺延只在视图日期 === 或 < 真实今天时生效。
  const isFutureView = viewDay.isAfter(todayDj, 'day')

  for (const t of todos) {
    if (t.done) {
      if (t.completedAt && dayjs(t.completedAt).format('YYYY-MM-DD') === activeKey) {
        doneOnActiveDate.push(t)
      }
      continue
    }

    // 手动提醒任务无条件进入提醒板块（最高优先级）
    if (t.remindManual) {
      reminders.push(t)
      continue
    }

    const due = dayjs(t.dueDate).startOf('day')
    if (!due.isAfter(viewDay, 'day')) {
      // dueDate ≤ viewDay → 今日必做（含截止日当天 / 已过期未顺延后 due 已=today 的兜底）
      // 【用户要求】未来视图下，对 repeat==='once' 且 due 在"真实今天之前或等于真实今天"
      // 的未完成任务：暂不进入该未来视图的今日必做（等真正到了那个日期，顺延会在 rehydrate
      // 阶段把 dueDate 移到当天，届时该任务就会显示）。
      if (
        isFutureView &&
        t.repeat === 'once' &&
        !due.isAfter(todayDj, 'day')
      ) {
        continue
      }
      mustDoToday.push(t)
      continue
    }

    // dueDate > viewDay
    // 【本次修改】只有「仅一次(once)」的任务才根据 allowAheadOfSchedule 进入今日可做/提醒；
    // 所有带重复频率（每天/工作日/每周/每月）的任务都不进入这两个板块，
    // 它们只出现在「今日必做」（由未来 30 天实例预生成保证频率正确）。
    if (t.repeat === 'once') {
      if (t.allowAheadOfSchedule) {
        // 允许提前完成，且还没到截止日当天 → 今日可做
        canDoToday.push(t)
      } else {
        // 不允许提前 & 还没到 → 提醒（到 dueDate 当天会自动进入"今日必做"）
        reminders.push(t)
      }
    }
  }

  // 视图内重复系列去重：
  // 1) 对 repeat === 'weekday' 的工作日任务：若当前观察日 activeKey 本身是周六/周日 → 该系列所有任务整条不进入今日必做（周末不显示工作日任务）
  // 2) 对所有非 once 的重复系列（daily / weekday / weekly / monthly）：
  //    同一 originId 分组，每组保留 dueDate 最大（最接近 viewDay 且 ≤ viewDay）的一条，
  //    避免"过期未完成实例 + 今日新实例"同时进 mustDoToday 造成每个标题显示多条。
  // 3) 一次性任务（once）不参与以上任何去重，保持原样全部展示。
  {
    // Step 1: 先处理 weekday + activeKey 是周末的情况 → 全部 drop
    const viewDayWeekday = viewDay.isoWeekday() // 1=Mon..7=Sun
    const activeKeyIsWeekend = viewDayWeekday === 6 || viewDayWeekday === 7
    const droppedIds = new Set<string>()

    if (activeKeyIsWeekend) {
      for (const t of mustDoToday) {
        if (t.repeat === 'weekday') droppedIds.add(t.id)
      }
    }

    // Step 2: 所有非 once 的重复系列 → 同 originId 留 dueDate 最大的一条
    const keptBySeries = new Map<string, Todo>()
    for (const t of mustDoToday) {
      if (droppedIds.has(t.id)) continue
      if (t.repeat === 'once') continue // only 一次性任务不去重
      const key = String(t.originId ?? t.id)
      const cur = keptBySeries.get(key)
      if (!cur || t.dueDate > cur.dueDate) keptBySeries.set(key, t)
    }
    for (const t of mustDoToday) {
      if (droppedIds.has(t.id)) continue
      if (t.repeat === 'once') continue
      const key = String(t.originId ?? t.id)
      const keeper = keptBySeries.get(key)
      if (keeper && keeper.id !== t.id) droppedIds.add(t.id)
    }

    // Step 3: 统一从 mustDoToday 中移除所有被标记的 id
    if (droppedIds.size) {
      for (let i = mustDoToday.length - 1; i >= 0; i--) {
        if (droppedIds.has(mustDoToday[i]!.id)) mustDoToday.splice(i, 1)
      }
    }
  }

  // 【问题 7 修复（问题二强化版）】提醒板块**永远强制**按 dueDate 升序 → createdAt 升序；不尊重用户手动拖拽顺序（用户明确要求取消拖拽持久化）
  reminders.sort((a, b) => {
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
    return (a.createdAt ?? 0) - (b.createdAt ?? 0)
  })

  // 应用持久化的拖拽顺序（每板块独立；但提醒板块完全禁用拖拽顺序，强制按日期排序）
  const applyOrder = (section: BoardSection, list: Todo[]): Todo[] => {
    if (section === 'reminders') return list // 提醒：已在上面强制 dueDate 升序，直接返回，忽略任何 boardOrder
    const saved = order[section] ?? []
    const idToIndex = new Map<string, number>()
    saved.forEach((id, idx) => idToIndex.set(id, idx))
    return [...list].sort((a, b) => {
      const ia = idToIndex.get(a.id)
      const ib = idToIndex.get(b.id)
      if (ia !== undefined && ib !== undefined) return ia - ib
      if (ia !== undefined) return -1
      if (ib !== undefined) return 1
      // 兜底：今日必做/今日可做 → 新→旧（创建时间降序）
      return (b.createdAt ?? 0) - (a.createdAt ?? 0)
    })
  }

  const findMissing = (section: BoardSection, list: Todo[]): string[] => {
    const saved = new Set(order[section] ?? [])
    return list.filter((t) => !saved.has(t.id)).map((t) => t.id)
  }

  const mustOrdered = applyOrder('mustDoToday', mustDoToday)
  const canOrdered = applyOrder('canDoToday', canDoToday)
  // 【问题二】：提醒不通过 applyOrder（已经强制排序），直接使用 reminders 列表
  const remOrdered = reminders
  doneOnActiveDate.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))

  return {
    mustDoToday: mustOrdered,
    canDoToday: canOrdered,
    reminders: remOrdered,
    doneOnActiveDate,
    _orderMissingIds: {
      mustDoToday: findMissing('mustDoToday', mustOrdered),
      canDoToday: findMissing('canDoToday', canOrdered),
      reminders: findMissing('reminders', remOrdered),
    },
  }
}

/* ------------------------------------------------------------------ */
/* State                                                              */
/* ------------------------------------------------------------------ */

export type RepeatScope = 'current' | 'future' | 'all'

interface TodoState {
  todos: Todo[]
  categories: Category[]

  /* UI 偏好（持久化） */
  viewMode: ViewMode
  /** YYYY-MM-DD；用户在日历上当前选择的日期（也决定今日已完成折叠区是哪天） */
  activeDateKey: ActiveDateKey

  /* 完成特效触发 */
  lastCompletedTick: number

  /* 子计划历史库 */
  subtaskHistoryLibrary: SubtaskHistoryItem[]

  /* 三板块独立的拖拽排序（todo id 数组，顺序即展示顺序） */
  boardOrder: Record<BoardSection, string[]>

  /* 三板块 + 底部完成记录的折叠状态（持久化到 localStorage）；default 全 false = 展开 */
  boardCollapsed: Record<CollapsibleKey, boolean>

  /* 重复系列"用户手动删除过的单日"黑名单：key=originId，value=被删除过的dueDate数组。
   * buildMissingRepeatInstances 补齐时命中即跳过，避免"刚删完又补回来"的观感。 */
  repeatDeleteBlacklist: Record<string, string[]>

  /* actions */
  setViewMode: (m: ViewMode) => void
  setActiveDateKey: (k: ActiveDateKey) => void
  toggleCollapsed: (k: CollapsibleKey) => void

  addCategory: (name: string) => Category
  removeCategory: (id: string) => void
  ensureCategory: (id: string) => Category

  /** 新建任务；若 draft.repeat != once，自动预生成未来 30 天实例（幂等） */
  addTodo: (d: TodoDraft) => Todo
  /** 编辑【仅此一次】（兼容旧调用） */
  updateTodo: (id: string, patch: Partial<Omit<Todo, 'id' | 'createdAt'>>) => void
  /** 编辑重复任务，scope=current: 仅此条；scope=future: 同 originId 且 dueDate ≥ id.dueDate 的未完成条一起改 */
  updateTodoScope: (id: string, patch: Partial<Omit<Todo, 'id' | 'createdAt' | 'dueDate' | 'originId' | 'repeat'>>, scope: Exclude<RepeatScope, 'all'>) => void
  /** 删除【仅此一次】（兼容旧调用，id 非重复也直接删） */
  removeTodo: (id: string) => void
  /** 删除重复任务 */
  removeTodoScope: (id: string, scope: RepeatScope) => void
  toggleTodo: (id: string) => { justCompleted: boolean; todo: Todo | null }

  toggleSubtask: (todoId: string, subId: string) => void
  removeSubtask: (todoId: string, subId: string) => void
  addSubtask: (todoId: string, title: string) => void

  /* 子计划历史库 */
  addSubtaskHistory: (name: string, subtasks: { title: string }[]) => SubtaskHistoryItem
  renameSubtaskHistory: (id: string, name: string) => void
  removeSubtaskHistory: (id: string) => void

  /* 拖拽写回顺序 */
  setBoardSectionOrder: (section: BoardSection, orderedIds: string[]) => void
}

/* 自定义分类的配色池（新增 cardBg + cardBar），循环使用 */
const CUSTOM_COLORS: Omit<Category, 'id' | 'name' | 'preset'>[] = [
  { dot: 'bg-pink-500', chip: 'bg-pink-100 text-pink-700 ring-pink-200', cardBg: 'bg-pink-50/80', cardBar: 'bg-pink-500' },
  { dot: 'bg-sky-500', chip: 'bg-sky-100 text-sky-700 ring-sky-200', cardBg: 'bg-sky-50/80', cardBar: 'bg-sky-500' },
  { dot: 'bg-orange-500', chip: 'bg-orange-100 text-orange-700 ring-orange-200', cardBg: 'bg-orange-50/80', cardBar: 'bg-orange-500' },
  { dot: 'bg-violet-500', chip: 'bg-violet-100 text-violet-700 ring-violet-200', cardBg: 'bg-violet-50/80', cardBar: 'bg-violet-500' },
  { dot: 'bg-teal-500', chip: 'bg-teal-100 text-teal-700 ring-teal-200', cardBg: 'bg-teal-50/80', cardBar: 'bg-teal-500' },
  { dot: 'bg-fuchsia-500', chip: 'bg-fuchsia-100 text-fuchsia-700 ring-fuchsia-200', cardBg: 'bg-fuchsia-50/80', cardBar: 'bg-fuchsia-500' },
]

export const useTodoStore = create<TodoState>()(
  persist(
    (set, get) => ({
      todos: [],
      categories: PRESET_CATEGORIES,
      viewMode: 'category',
      activeDateKey: todayStr(),
      lastCompletedTick: 0,
      subtaskHistoryLibrary: [],
      boardOrder: { mustDoToday: [], canDoToday: [], reminders: [] },
      boardCollapsed: { mustDoToday: false, canDoToday: false, reminders: false, doneOnActive: true },
      repeatDeleteBlacklist: {},

      setViewMode: (m) => set({ viewMode: m }),
      setActiveDateKey: (k) => set({ activeDateKey: k }),
      toggleCollapsed: (k) =>
        set((s) => ({ boardCollapsed: { ...s.boardCollapsed, [k]: !s.boardCollapsed[k] } })),

      addCategory: (raw) => {
        const name = raw.trim().slice(0, 12) || '新分类'
        const categories = get().categories
        const usedCustom = categories.filter((c) => !c.preset).length
        const style = CUSTOM_COLORS[usedCustom % CUSTOM_COLORS.length]
        const id = `cat_${Date.now().toString(36)}_${uuidv4().slice(0, 5)}`
        const c: Category = { id, name, preset: false, ...style }
        set({ categories: [...categories, c] })
        return c
      },

      removeCategory: (id) => {
        const cat = get().categories.find((c) => c.id === id)
        if (!cat || cat.preset) return
        set((s) => ({
          categories: s.categories.filter((c) => c.id !== id),
          todos: s.todos.map((t) =>
            t.categoryId === id ? { ...t, categoryId: 'other', updatedAt: Date.now() } : t,
          ),
        }))
      },

      ensureCategory: (id) => {
        const c = get().categories.find((c) => c.id === id)
        return c ?? PRESET_CATEGORIES[5]!
      },

      addTodo: (d) => {
        // 先把模板 todo 建好（如果是重复，originId = 自己的 id 作为系列头）
        const todo = makeTodo(d)
        if (todo.repeat === 'once') {
          set((s) => ({ todos: [todo, ...s.todos] }))
          return todo
        }
        // 重复任务：预生成未来 30 天实例（幂等 + 参考黑名单）
        set((s) => {
          const mergedBase = [todo, ...s.todos]
          const extras = buildMissingRepeatInstances(todo, mergedBase, 30, s.repeatDeleteBlacklist)
          return { todos: [...extras, ...mergedBase] }
        })
        return todo
      },

      updateTodo: (id, patch) => get().updateTodoScope(id, patch, 'current'),

      updateTodoScope: (id, patch, scope) =>
        set((s) => {
          const source = s.todos.find((t) => t.id === id)
          if (!source) return s
          const now = Date.now()
          if (scope === 'current' || source.repeat === 'once') {
            return {
              todos: s.todos.map((t) =>
                t.id === id ? { ...t, ...patch, updatedAt: now } : t,
              ),
            }
          }
          // scope === 'future'：更新所有同 originId 且 dueDate ≥ source.dueDate 的 未完成 任务
          return {
            todos: s.todos.map((t) => {
              if (t.id === id) return { ...t, ...patch, updatedAt: now }
              if (
                !t.done &&
                t.originId === source.originId &&
                t.repeat === source.repeat &&
                t.dueDate >= source.dueDate
              ) {
                return { ...t, ...patch, updatedAt: now }
              }
              return t
            }),
          }
        }),

      removeTodo: (id) => get().removeTodoScope(id, 'current'),

      removeTodoScope: (id, scope) => {
        set((s) => {
          const source = s.todos.find((t) => t.id === id)
          if (!source) return s
          let pred: (t: Todo) => boolean
          if (scope === 'current' || source.repeat === 'once') {
            pred = (t) => t.id !== id
          } else if (scope === 'future') {
            // 所有同 originId 且 dueDate >= source.dueDate 的 未完成 + source 自己
            pred = (t) => {
              if (t.id === id) return false
              if (t.originId !== source.originId) return true
              if (t.done) return true
              return t.dueDate < source.dueDate
            }
          } else {
            // scope === 'all'：同 originId 所有实例（含完成/未完成，包括模板）
            pred = (t) => t.originId !== source.originId
          }
          const kept = s.todos.filter(pred)
          const keptIds = new Set(kept.map((t) => t.id))
          const order = { ...s.boardOrder }
          ;(Object.keys(order) as BoardSection[]).forEach((k) => {
            order[k] = order[k].filter((x) => keptIds.has(x))
          })

          // 【删除重复任务单条 → 写入黑名单，避免 buildMissingRepeatInstances 立刻又补回来】
          let blacklist = { ...(s.repeatDeleteBlacklist ?? {}) }
          if (source.repeat !== 'once') {
            if (scope === 'current') {
              // 仅删单条 → 把"这一天"记录为该系列黑名单
              const arr = new Set<string>(blacklist[source.originId] ?? [])
              arr.add(source.dueDate)
              blacklist[source.originId] = Array.from(arr)
            } else if (scope === 'future' || scope === 'all') {
              // 系列级删除 → 直接把该 originId 的整条黑名单清掉，避免将来恢复系列时无法生成
              if (Object.prototype.hasOwnProperty.call(blacklist, source.originId)) {
                const { [source.originId]: _removed, ...rest } = blacklist
                blacklist = rest
              }
            }
          }
          return { todos: kept, boardOrder: order, repeatDeleteBlacklist: blacklist }
        })
      },

      toggleTodo: (id) => {
        const s = get()
        const t = s.todos.find((t) => t.id === id)
        if (!t) return { justCompleted: false, todo: null }

        if (t.done) {
          // 取消完成：回滚，从 boardOrder 中不需要额外处理（下次分配时自动根据 order 排）
          set((st) => ({
            todos: st.todos.map((x) =>
              x.id === id ? { ...x, done: false, completedAt: null, updatedAt: Date.now() } : x,
            ),
          }))
          return { justCompleted: false, todo: { ...t, done: false, completedAt: null } }
        }

        // 未完成 -> 完成
        const now = Date.now()
        const completedTodo: Todo = { ...t, done: true, completedAt: now, updatedAt: now }

        if (t.repeat === 'once') {
          set((st) => {
            // 完成后从三板块的 boardOrder 里移除该 id
            const order = { ...st.boardOrder }
            ;(Object.keys(order) as BoardSection[]).forEach((k) => {
              order[k] = order[k].filter((x) => x !== id)
            })
            return {
              todos: st.todos.map((x) => (x.id === id ? completedTodo : x)),
              boardOrder: order,
              lastCompletedTick: st.lastCompletedTick + 1,
            }
          })
          return { justCompleted: true, todo: completedTodo }
        }

        // 重复任务：生成下一条（注意 v4 里 dueDate 一定有，所以不做 !dueDate 分支）
        const nextDue = nextDueDate(t.dueDate, t.repeat)
        if (!dayjs(nextDue).isAfter(dayjs(t.dueDate), 'day')) {
          set((st) => {
            const order = { ...st.boardOrder }
            ;(Object.keys(order) as BoardSection[]).forEach((k) => {
              order[k] = order[k].filter((x) => x !== id)
            })
            return {
              todos: st.todos.map((x) => (x.id === id ? completedTodo : x)),
              boardOrder: order,
              lastCompletedTick: st.lastCompletedTick + 1,
            }
          })
          return { justCompleted: true, todo: completedTodo }
        }

        const alreadyHasNext = s.todos.some((x) => {
          if (x.id === id) return false
          const matchByOrigin = x.originId === t.originId && x.dueDate === nextDue
          const matchBySimilarity =
            x.title === t.title &&
            x.categoryId === t.categoryId &&
            x.repeat === t.repeat &&
            x.dueDate === nextDue &&
            !x.done
          return matchByOrigin || matchBySimilarity
        })

        set((st) => {
          const order = { ...st.boardOrder }
          ;(Object.keys(order) as BoardSection[]).forEach((k) => {
            order[k] = order[k].filter((x) => x !== id)
          })
          const updated = st.todos.map((x) => (x.id === id ? completedTodo : x))
          if (alreadyHasNext) {
            return {
              todos: updated,
              boardOrder: order,
              lastCompletedTick: st.lastCompletedTick + 1,
            }
          }
          const cloneTodo = makeTodo({
            title: t.title,
            categoryId: t.categoryId,
            dueDate: nextDue,
            timeSlot: t.timeSlot,
            customStart: t.customStart,
            customEnd: t.customEnd,
            notes: t.notes,
            subtasks: t.subtasks.map((s2) => ({ ...s2, done: false })),
            repeat: t.repeat,
            allowAheadOfSchedule: t.allowAheadOfSchedule,
            remindManual: !!t.remindManual,
            originId: t.originId,
          })
          return {
            todos: [cloneTodo, ...updated],
            boardOrder: order,
            lastCompletedTick: st.lastCompletedTick + 1,
          }
        })
        return { justCompleted: true, todo: completedTodo }
      },

      toggleSubtask: (todoId, subId) =>
        set((s) => ({
          todos: s.todos.map((t) =>
            t.id === todoId
              ? {
                  ...t,
                  updatedAt: Date.now(),
                  subtasks: t.subtasks.map((sb) =>
                    sb.id === subId ? { ...sb, done: !sb.done } : sb,
                  ),
                }
              : t,
          ),
        })),
      removeSubtask: (todoId, subId) =>
        set((s) => ({
          todos: s.todos.map((t) =>
            t.id === todoId
              ? { ...t, subtasks: t.subtasks.filter((sb) => sb.id !== subId), updatedAt: Date.now() }
              : t,
          ),
        })),
      addSubtask: (todoId, title) => {
        const text = title.trim()
        if (!text) return
        set((s) => ({
          todos: s.todos.map((t) =>
            t.id === todoId
              ? {
                  ...t,
                  updatedAt: Date.now(),
                  subtasks: [
                    ...t.subtasks,
                    { id: uuidv4(), title: text, done: false },
                  ],
                }
              : t,
          ),
        }))
      },

      addSubtaskHistory: (name, subtasks) => {
        const item: SubtaskHistoryItem = {
          id: uuidv4(),
          name: name.trim().slice(0, 24) || '未命名子计划模板',
          subtasks: subtasks.map((s) => ({ title: s.title.trim() })).filter((s) => s.title.length > 0),
          createdAt: Date.now(),
        }
        if (item.subtasks.length === 0) return item
        set((s) => ({ subtaskHistoryLibrary: [item, ...s.subtaskHistoryLibrary] }))
        return item
      },
      renameSubtaskHistory: (id, name) =>
        set((s) => ({
          subtaskHistoryLibrary: s.subtaskHistoryLibrary.map((x) =>
            x.id === id ? { ...x, name: name.trim().slice(0, 24) || x.name } : x,
          ),
        })),
      removeSubtaskHistory: (id) =>
        set((s) => ({ subtaskHistoryLibrary: s.subtaskHistoryLibrary.filter((x) => x.id !== id) })),

      setBoardSectionOrder: (section, orderedIds) =>
        set((s) => ({ boardOrder: { ...s.boardOrder, [section]: orderedIds.slice() } })),
    }),
    {
      name: 'my-desk:todos',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        todos: s.todos,
        categories: s.categories,
        viewMode: s.viewMode,
        activeDateKey: s.activeDateKey,
        subtaskHistoryLibrary: s.subtaskHistoryLibrary,
        boardOrder: s.boardOrder,
        boardCollapsed: s.boardCollapsed,
        repeatDeleteBlacklist: s.repeatDeleteBlacklist,
        // filterDone、reminderQueue、lastCompletedTick 不持久化（lastCompletedTick 每次启动为 0 即可，不影响鼓励语）
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return

        /* --------------------------------------------------------------- */
        /* 【需求 8 自动顺延 + 需求 7 删除收集箱 + 老数据迁移】              */
        /* --------------------------------------------------------------- */
        const today = todayStr()
        const todayDj = dayjs(today).startOf('day')

        // 1) 补 todos 默认值，顺便迁移老字段：
        //    - dueDate=null → today（删除收集箱）
        //    - 新增 allowAheadOfSchedule（默认 false，保守归入"提醒"）
        //    - 删掉 remindAt / notifiedKey
        //    - 老数据 completedAt / updatedAt / originId 兜底
        //    - 【问题一】自动顺延去重：重复系列任务，若 目标日期（today） 已存在同 originId 的实例，则保留原 dueDate 不再顺延（避免重复）
        //    - 【本次修复 问题一】顺延去重按「任务名称（title）」判断：若目标日期已存在同名任务（无论来源），则不再顺延
        const rawTodos = (state.todos ?? []) as (Todo & { remindAt?: unknown; notifiedKey?: unknown })[]
        // 1) originId+dueDate → Set，供重复任务 originId 维度去重判定（必须在 map 前就用 raw 的 originId 兜底好）
        const existingKey = new Set<string>()
        // 2) 目标日期（today）的「任务标题」Set（trim 后），供按名称顺延去重
        const existingTitlesOnToday = new Set<string>()
        for (const r of rawTodos) {
          const originId = (r as any).originId ?? r.id
          const due = r.dueDate ?? today
          existingKey.add(`${String(originId)}|${String(due)}`)
          // 收集 dueDate === today 的任务的 title（trim 后）
          if (due === today && typeof r.title === 'string') {
            existingTitlesOnToday.add(r.title.trim())
          }
        }
        state.todos = rawTodos.map((raw) => {
          const base = { ...raw }
          // 清理已删除字段（避免 JSON 里残留）
          delete (base as any).remindAt
          delete (base as any).notifiedKey

          const categoryId = base.categoryId ?? 'other'
          const dueDate = base.dueDate ?? today
          const originId = (base as any).originId ?? base.id
          const repeat: RepeatFreq = base.repeat ?? 'once'
          const isRepeat = repeat !== 'once'

          // 自动顺延：dueDate < today 且未完成 → dueDate = today
          // 【用户新要求】带重复频率的任务（每天/工作日/每周/每月）当天没完成也 NEVER 顺延，
          //   只保留原 dueDate（作为"历史未完成记录"，未来实例由 buildMissingRepeatInstances 预生成30天保证频率正确）；
          //   仅对 repeat === 'once' 的一次性任务执行自动顺延 + 按名称去重。
          let finalDue = dueDate
          if (!base.done && !isRepeat && dayjs(finalDue).isBefore(todayDj, 'day')) {
            const targetDate = today
            const titleTrimmed = typeof base.title === 'string' ? base.title.trim() : ''
            // 【顺延去重】跳过条件（满足任意一条即跳过顺延，避免重复）：
            //   目标日期（today）已存在同名任务（按 title 去重，trim 后比较）
            const shouldSkipPostpone = titleTrimmed !== '' && existingTitlesOnToday.has(titleTrimmed)
            if (!shouldSkipPostpone) {
              finalDue = targetDate
            }
          }
          const defaults = {
            categoryId,
            dueDate: finalDue,
            timeSlot: 'none' as const,
            customStart: null,
            customEnd: null,
            notes: base.notes ?? '',
            subtasks: (base.subtasks ?? []) as SubTask[],
            repeat,
            allowAheadOfSchedule: !!base.allowAheadOfSchedule,
            remindManual: !!base.remindManual,
            completedAt: base.completedAt ?? null,
            updatedAt: base.updatedAt ?? base.createdAt ?? Date.now(),
            originId,
            done: !!base.done,
          }
          return { ...base, ...defaults }
        })

        // 2) 重复系列断链归一化（维持 v3 修复）
        try {
          const groups = new Map<string, Todo[]>()
          for (const todo of state.todos) {
            if (todo.repeat === 'once') continue
            const key = `${todo.title.trim()}|${todo.categoryId}|${todo.repeat}`
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key)!.push(todo)
          }
          for (const [, list] of groups) {
            if (list.length < 2) continue
            list.sort((a, b) => {
              if (a.dueDate < b.dueDate) return -1
              if (a.dueDate > b.dueDate) return 1
              return (a.createdAt ?? 0) - (b.createdAt ?? 0)
            })
            const seriesOriginId = list[0]!.originId
            for (const todo of list) todo.originId = seriesOriginId
          }
        } catch {
          /* 静默 */
        }

        // 3) 板顺序初始化 + 清理掉已不存在的 todo id
        if (!state.boardOrder || typeof state.boardOrder !== 'object') {
          state.boardOrder = { mustDoToday: [], canDoToday: [], reminders: [] }
        } else {
          const keys: BoardSection[] = ['mustDoToday', 'canDoToday', 'reminders']
          const ids = new Set(state.todos.map((t) => t.id))
          for (const k of keys) {
            const arr = (state.boardOrder as any)[k]
            if (!Array.isArray(arr)) {
              ;(state.boardOrder as any)[k] = []
            } else {
              ;(state.boardOrder as any)[k] = arr.filter((id) => typeof id === 'string' && ids.has(id))
            }
          }
        }

        // 3.5) 重复任务单日删除黑名单兜底
        if (!state.repeatDeleteBlacklist || typeof state.repeatDeleteBlacklist !== 'object') {
          state.repeatDeleteBlacklist = {}
        } else {
          // 清理掉非字符串 key / value 不是数组的项
          const clean: Record<string, string[]> = {}
          for (const k of Object.keys(state.repeatDeleteBlacklist)) {
            const v = (state.repeatDeleteBlacklist as any)[k]
            if (Array.isArray(v)) clean[k] = v.filter((x: unknown) => typeof x === 'string')
          }
          state.repeatDeleteBlacklist = clean
        }

        // 4) 子计划历史库初始化
        if (!Array.isArray(state.subtaskHistoryLibrary)) state.subtaskHistoryLibrary = []

        // 5) 确保 categories 全（且预设分类补上 cardBg / cardBar 新字段）
        if (!state.categories || state.categories.length === 0) {
          state.categories = PRESET_CATEGORIES
        } else {
          // 预设分类的字段升级（老 preset 可能没有 cardBg/cardBar）
          state.categories = state.categories.map((c) => {
            const preset = PRESET_CATEGORIES.find((p) => p.id === c.id)
            return preset ? { ...c, dot: preset.dot, chip: preset.chip, cardBg: preset.cardBg, cardBar: preset.cardBar } : c
          })
          const presetMissing = PRESET_CATEGORIES.filter(
            (p) => !state.categories!.some((c) => c.id === p.id),
          )
          state.categories = [...presetMissing, ...state.categories]
        }

        // 6) activeDateKey 永远今天
        state.activeDateKey = today

        // 7) viewMode 兜底
        if (state.viewMode !== 'category' && state.viewMode !== 'timeline') {
          state.viewMode = 'category'
        }

        // 8) 重复任务预补齐未来 30 天实例（老数据可能只有今天+明天2条）
        //    参考 repeatDeleteBlacklist：用户手动删除过的单日不再被补齐回来。
        try {
          // 按 originId 分组 → 取每个系列里 dueDate 最小的未完成条作为模板去扩展
          const series = new Map<string, Todo>()
          for (const t of state.todos) {
            if (t.repeat === 'once') continue
            const cur = series.get(t.originId)
            if (!cur || t.dueDate < cur.dueDate) series.set(t.originId, t)
          }
          // 逐个补齐，每补齐一个会扩大 state.todos，保证幂等（buildMissingRepeatInstances 会扫描 state.todos）
          for (const template of series.values()) {
            const extras = buildMissingRepeatInstances(
              template,
              state.todos,
              30,
              state.repeatDeleteBlacklist ?? {},
            )
            if (extras.length) state.todos = state.todos.concat(extras)
          }
        } catch {
          /* 静默 */
        }
      },
    },
  ),
)
