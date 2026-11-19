import type { ScheduleEntry, Subject } from '@/store/useHomeworkStore'
import { shortClass } from '@/lib/scheduleTimes'

export interface SlotDetailItem {
  entry: ScheduleEntry
  color: string
  isSelf: boolean
}

interface Props {
  /** 展示用：周几 */
  dayLabel: string
  /** 展示用：第1节 / 晚1 */
  periodLabel: string
  startTime: string
  endTime: string
  /** 是否晚自习时段（影响「类型」文案） */
  isEvening: boolean
  /** 已排好序的条目（自己的课在前，其余按姓氏拼音） */
  items: SlotDetailItem[]
  subjectMap: Map<string, Subject>
  onEdit: () => void
  onClose: () => void
}

/**
 * 时段详情弹层：一个时间段有多位老师上课时，
 * 点击格子先弹出本弹层列出全部课程，再按需进入编辑。
 */
export default function SlotDetailSheet({
  dayLabel,
  periodLabel,
  startTime,
  endTime,
  isEvening,
  items,
  subjectMap,
  onEdit,
  onClose,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink-900/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-md rounded-t-3xl bg-surface p-5 shadow-soft sm:rounded-3xl">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink-900">
            {dayLabel} · {periodLabel}
          </h3>
          <button
            type="button"
            onClick={onClose}
            title="关闭"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-cream-deep text-ink-500 transition hover:bg-petal-50"
          >
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-ink-400">
          {startTime} - {endTime}
          {isEvening ? ' · 晚自习' : ''} · 共 {items.length} 位老师
        </p>

        <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
          {items.map(({ entry, color, isSelf }) => {
            const sub = entry.subjectId ? subjectMap.get(entry.subjectId) : undefined
            return (
              <div
                key={`${entry.teacherName}-${entry.classLabel ?? ''}`}
                className={`flex items-center gap-3 rounded-2xl p-3 ${
                  isSelf ? 'ring-2 ring-petal-500 ring-offset-1 ring-offset-surface' : ''
                }`}
                style={{ backgroundColor: color + '26' }}
              >
                <span
                  className="h-9 w-9 shrink-0 rounded-xl"
                  style={{ backgroundColor: color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
                    {entry.teacherName || '未填老师'}
                    {isSelf && (
                      <span className="rounded-full bg-petal-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        我
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-ink-600">
                    {entry.classLabel || '未填班级'}
                    {sub ? ` · ${sub.name}` : isEvening ? ' · 晚自习' : ''}
                    {entry.location ? ` · ${entry.location}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-ink-400">{shortClass(entry.classLabel)}</span>
              </div>
            )
          })}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border border-petal-100 bg-surface py-2.5 text-sm font-medium text-ink-600 transition hover:bg-petal-50"
          >
            关闭
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="flex-[2] rounded-2xl bg-gradient-to-br from-petal-400 to-petal-500 py-2.5 text-sm font-semibold text-white shadow-card transition hover:brightness-105 active:scale-[0.98]"
          >
            编辑此格
          </button>
        </div>
      </div>
    </div>
  )
}
