/**
 * 节次时间模板：全局唯一来源（课程表左栏、编辑抽屉、解析器兜底共用）。
 * 时间来自《2026年下学期作息时间表》（醴陵市第二中学），夏季/冬季的第1-9节一致。
 * 晚自习时间来自《高三晚自习》表头。
 */
import { pinyin } from 'pinyin-pro'

export type PeriodKind = 'day' | 'evening'

export interface PeriodOption {
  /** 顺序索引（白天 1-9，晚自习 10-15，仅用于排序与兼容旧代码） */
  index: number
  /** 左栏展示名：第1节 / 晚1 */
  label: string
  kind: PeriodKind
  start: string
  end: string
}

export const PERIODS: PeriodOption[] = [
  { index: 1, label: '第1节', kind: 'day', start: '07:50', end: '08:30' },
  { index: 2, label: '第2节', kind: 'day', start: '08:40', end: '09:20' },
  { index: 3, label: '第3节', kind: 'day', start: '09:50', end: '10:30' },
  { index: 4, label: '第4节', kind: 'day', start: '10:40', end: '11:20' },
  { index: 5, label: '第5节', kind: 'day', start: '11:30', end: '12:10' },
  { index: 6, label: '第6节', kind: 'day', start: '14:10', end: '14:50' },
  { index: 7, label: '第7节', kind: 'day', start: '15:00', end: '15:40' },
  { index: 8, label: '第8节', kind: 'day', start: '15:50', end: '16:30' },
  { index: 9, label: '第9节', kind: 'day', start: '16:50', end: '17:30' },
  { index: 10, label: '晚1', kind: 'evening', start: '18:55', end: '19:25' },
  { index: 11, label: '晚2', kind: 'evening', start: '19:25', end: '19:55' },
  { index: 12, label: '晚3', kind: 'evening', start: '20:05', end: '20:35' },
  { index: 13, label: '晚4', kind: 'evening', start: '20:35', end: '21:05' },
  { index: 14, label: '晚5', kind: 'evening', start: '21:15', end: '21:45' },
  { index: 15, label: '晚6', kind: 'evening', start: '21:45', end: '22:15' },
]

export const DAY_PERIODS = PERIODS.filter((p) => p.kind === 'day')
export const EVENING_PERIODS = PERIODS.filter((p) => p.kind === 'evening')

export const DAYS = [
  { key: 1, label: '周一', short: '一' },
  { key: 2, label: '周二', short: '二' },
  { key: 3, label: '周三', short: '三' },
  { key: 4, label: '周四', short: '四' },
  { key: 5, label: '周五', short: '五' },
  { key: 6, label: '周六', short: '六' },
  { key: 7, label: '周日', short: '日' },
]

/** 班级全称 → 短编号：'2405历政地(艺)' → '2405'；没有数字时原样返回 */
export function shortClass(label?: string): string {
  if (!label) return ''
  const m = label.match(/\d{3,4}/)
  return m ? m[0] : label
}

/**
 * 老师配色池：柔和自然的低饱和莫兰迪色（配深色文字）。
 * 用户 2026-09-08 反馈「太鲜艳刺眼」后从高饱和改为柔和色系；
 * 同一张课表里不同老师自动分配不同颜色，阅读版与编辑版共用。
 */
export const TEACHER_COLORS = [
  '#f2a7b6', // 柔粉
  '#b9a5e0', // 淡紫
  '#8fcfae', // 柔薄荷
  '#9cc1ef', // 柔蓝
  '#f5c78d', // 柔杏
  '#eeacc3', // 柔玫
  '#93d1cc', // 柔青
  '#e0b79f', // 柔陶土
]

/** 姓氏拼音（排序用；空名排最后） */
export function pinyinOfSurname(name?: string): string {
  const sur = surnameOf(name)
  if (!sur) return '\uffff'
  return pinyin(sur, { toneType: 'none', type: 'string' })
}

/** 老师排序：按姓氏拼音升序（同音再按全名比较） */
export function compareTeachers(a?: string, b?: string): number {
  return (
    pinyinOfSurname(a).localeCompare(pinyinOfSurname(b)) ||
    (a ?? '').localeCompare(b ?? '', 'zh-Hans-CN')
  )
}

/**
 * 老师 → 颜色。我的课（selfName）固定用第一位柔粉 #f2a7b6（用户要求），
 * 其余老师按姓氏拼音从剩余颜色依次取，保证互不相同。
 * selfName 不在名单里时按普通规则分配。
 */
export function buildTeacherColorMap(names: string[], selfName?: string): Map<string, string> {
  const unique = Array.from(new Set(names.filter(Boolean)))
  const self = selfName ? unique.find((n) => n === selfName) ?? null : null
  const rest = unique.filter((n) => n !== self).sort(compareTeachers)
  const ordered = self ? [self, ...rest] : rest
  const m = new Map<string, string>()
  ordered.forEach((t, i) => m.set(t, TEACHER_COLORS[i % TEACHER_COLORS.length]!))
  return m
}

/** 取中文姓名姓氏（含常见复姓） */
const COMPOUND_SURNAMES = ['欧阳', '司马', '上官', '诸葛', '东方', '独孤', '南宫', '万俟', '闻人', '夏侯', '赫连', '尉迟', '皇甫', '宇文', '慕容', '长孙', '司徒', '鲜于', '公孙', '仲孙', '钟离', '令狐', '徐离', '单于', '太史', '申屠', '乐正', '东郭', '南门', '呼延', '羊舌', '微生', '梁丘', '左丘', '东门', '西门']
export function surnameOf(name?: string): string {
  if (!name) return ''
  const n = name.trim()
  for (const s of COMPOUND_SURNAMES) {
    if (n.startsWith(s)) return s
  }
  return n.slice(0, 1)
}
