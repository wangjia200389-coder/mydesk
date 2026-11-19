/**
 * 预置课表：2026 年下期高三年级地理组（醴陵市第二中学）。
 * 数据来源（2026-09-08 由用户提供的三个 Excel 解析核对）：
 *   - 《2026年下期高三年级教师个人课表》sheet：曾杜珍 / 付如 / 宋宇轩 / 郭光辉（各 12 节）、丁传军（6 节）
 *   - 《2026年下学期作息时间表》第 1-9 节时间
 *   - 《高三晚自习》：宋宇轩 周二 2406 晚3-晚6、周五 2406 晚1-晚2
 * 说明：
 *   - 全部是地理课；晚自习条目不带科目（表格中科目列有误，用户要求忽略）
 *   - 宋宇轩 = 用户本人，entries 标记 isSelf: true
 *   - 班级保留全称（如 2405历政地(艺)），UI 用 shortClass() 显示 2405
 */
import type { ScheduleEntry } from '@/store/useHomeworkStore'
import type { ParsedScheduleSlot } from '@/lib/scheduleParser'
import { PERIODS } from '@/lib/scheduleTimes'

export const PRESET_TEACHERS = ['曾杜珍', '付如', '宋宇轩', '郭光辉', '丁传军'] as const
export const PRESET_SELF_NAME = '宋宇轩'

interface RawCourse {
  /** 1=周一 … 5=周五 */
  day: number
  /** PERIODS.index：1-9 白天，10-15 晚自习 */
  period: number
  classLabel: string
}

const RAW: Record<(typeof PRESET_TEACHERS)[number], RawCourse[]> = {
  宋宇轩: [
    { day: 1, period: 4, classLabel: '2405历政地(艺)' },
    { day: 1, period: 5, classLabel: '2406历政地(艺)' },
    { day: 2, period: 5, classLabel: '2405历政地(艺)' },
    { day: 2, period: 6, classLabel: '2406历政地(艺)' },
    { day: 2, period: 7, classLabel: '2406历政地(艺)' },
    { day: 2, period: 8, classLabel: '2405历政地(艺)' },
    { day: 3, period: 6, classLabel: '2406历政地(艺)' },
    { day: 3, period: 8, classLabel: '2405历政地(艺)' },
    { day: 4, period: 2, classLabel: '2406历政地(艺)' },
    { day: 4, period: 5, classLabel: '2405历政地(艺)' },
    { day: 5, period: 2, classLabel: '2405历政地(艺)' },
    { day: 5, period: 5, classLabel: '2406历政地(艺)' },
    // 晚自习（2406）：周二 晚3-晚6，周五 晚1-晚2
    { day: 2, period: 12, classLabel: '2406历政地(艺)' },
    { day: 2, period: 13, classLabel: '2406历政地(艺)' },
    { day: 2, period: 14, classLabel: '2406历政地(艺)' },
    { day: 2, period: 15, classLabel: '2406历政地(艺)' },
    { day: 5, period: 10, classLabel: '2406历政地(艺)' },
    { day: 5, period: 11, classLabel: '2406历政地(艺)' },
  ],
  曾杜珍: [
    { day: 1, period: 4, classLabel: '2401历政地' },
    { day: 1, period: 5, classLabel: '2402历政地' },
    { day: 2, period: 6, classLabel: '2401历政地' },
    { day: 2, period: 7, classLabel: '2401历政地' },
    { day: 2, period: 8, classLabel: '2402历政地' },
    { day: 2, period: 9, classLabel: '2402历政地' },
    { day: 3, period: 6, classLabel: '2402历政地' },
    { day: 3, period: 8, classLabel: '2401历政地' },
    { day: 4, period: 2, classLabel: '2402历政地' },
    { day: 4, period: 4, classLabel: '2401历政地' },
    { day: 5, period: 2, classLabel: '2402历政地' },
    { day: 5, period: 5, classLabel: '2401历政地' },
  ],
  // 丁传军：6 节，全在 2408物化地
  丁传军: [
    { day: 1, period: 5, classLabel: '2408物化地' },
    { day: 2, period: 6, classLabel: '2408物化地' },
    { day: 3, period: 7, classLabel: '2408物化地' },
    { day: 4, period: 3, classLabel: '2408物化地' },
    { day: 4, period: 4, classLabel: '2408物化地' },
    { day: 5, period: 2, classLabel: '2408物化地' },
  ],
  付如: [
    { day: 1, period: 2, classLabel: '2403历政地' },
    { day: 1, period: 5, classLabel: '2404历政地' },
    { day: 2, period: 6, classLabel: '2404历政地' },
    { day: 2, period: 7, classLabel: '2404历政地' },
    { day: 2, period: 8, classLabel: '2403历政地' },
    { day: 2, period: 9, classLabel: '2403历政地' },
    { day: 3, period: 6, classLabel: '2403历政地' },
    { day: 3, period: 8, classLabel: '2404历政地' },
    { day: 4, period: 2, classLabel: '2404历政地' },
    { day: 4, period: 4, classLabel: '2403历政地' },
    { day: 5, period: 4, classLabel: '2404历政地' },
    { day: 5, period: 5, classLabel: '2403历政地' },
  ],
  郭光辉: [
    { day: 1, period: 4, classLabel: '2407物化地' },
    { day: 1, period: 5, classLabel: '2409物化地' },
    { day: 2, period: 8, classLabel: '2407物化地' },
    { day: 2, period: 9, classLabel: '2409物化地' },
    { day: 3, period: 6, classLabel: '2407物化地' },
    { day: 3, period: 8, classLabel: '2409物化地' },
    { day: 4, period: 1, classLabel: '2407物化地' },
    { day: 4, period: 2, classLabel: '2407物化地' },
    { day: 4, period: 3, classLabel: '2409物化地' },
    { day: 4, period: 4, classLabel: '2409物化地' },
    { day: 5, period: 4, classLabel: '2409物化地' },
    { day: 5, period: 5, classLabel: '2407物化地' },
  ],
}

/**
 * 生成预置课表 slots。
 * @param geoSubjectId 「地理」科目的 id（调用方负责 ensure 存在）；晚自习条目不挂科目。
 */
export function buildPresetSlots(geoSubjectId: string): ParsedScheduleSlot[] {
  const map = new Map<string, ParsedScheduleSlot>()
  for (const teacher of PRESET_TEACHERS) {
    for (const c of RAW[teacher]) {
      const p = PERIODS.find((x) => x.index === c.period)
      if (!p) continue
      const key = `${c.day}|${p.start}`
      let slot = map.get(key)
      if (!slot) {
        slot = { dayOfWeek: c.day, startTime: p.start, endTime: p.end, entries: [] }
        map.set(key, slot)
      }
      const entry: ScheduleEntry = {
        subjectId: p.kind === 'day' ? geoSubjectId : '',
        teacherName: teacher,
        classLabel: c.classLabel,
        isSelf: teacher === PRESET_SELF_NAME,
      }
      slot.entries.push(entry)
    }
  }
  return Array.from(map.values())
}
