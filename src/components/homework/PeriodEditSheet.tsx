import { useEffect, useState } from 'react'

interface Props {
  /** 节次展示名：第1节 / 晚1 */
  periodLabel: string
  /** 当前显示的起止时间 */
  startTime: string
  endTime: string
  /** 涉及该节次的课程条数（提示用户） */
  affectedCount: number
  onSave: (startTime: string, endTime: string) => void
  onClose: () => void
}

/**
 * 第N节起止时间编辑：点击课表左侧时间格唤起。
 * 保存时只调整当前班级在该 startTime 下的所有时间段；
 * 不改全局 PERIODS 模板——它只作为「空格默认值」。
 */
export default function PeriodEditSheet({
  periodLabel,
  startTime,
  endTime,
  affectedCount,
  onSave,
  onClose,
}: Props) {
  const [start, setStart] = useState(startTime)
  const [end, setEnd] = useState(endTime)

  useEffect(() => {
    setStart(startTime)
    setEnd(endTime)
  }, [startTime, endTime])

  const valid = /^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end) && start < end

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink-900/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-md rounded-t-3xl bg-surface p-5 shadow-soft sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink-900">编辑{periodLabel}时间</h3>
          <button
            type="button"
            onClick={onClose}
            title="关闭"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-cream-deep text-ink-500 transition hover:bg-petal-50"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-xs text-ink-500">
            开始
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="rounded-xl border border-petal-100 bg-cream/50 px-3 py-2 text-base text-ink-900 outline-none focus:border-petal-400"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-ink-500">
            结束
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="rounded-xl border border-petal-100 bg-cream/50 px-3 py-2 text-base text-ink-900 outline-none focus:border-petal-400"
            />
          </label>
        </div>

        <p className="mt-3 text-[11px] text-ink-400">
          将影响当前班级已记录的 {affectedCount} 个该节次时间段；空白格仍可继续添加。
        </p>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border border-petal-100 bg-surface py-2.5 text-sm font-medium text-ink-600 transition hover:bg-petal-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!valid || (start === startTime && end === endTime)}
            onClick={() => onSave(start, end)}
            className="flex-[2] rounded-2xl bg-gradient-to-br from-petal-400 to-petal-500 py-2.5 text-sm font-semibold text-white shadow-card transition hover:brightness-105 active:scale-[0.98] disabled:opacity-40"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
