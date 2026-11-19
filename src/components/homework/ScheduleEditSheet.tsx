import { useMemo, useState } from 'react'
import type { ScheduleEntry, ScheduleSlot, Subject } from '@/store/useHomeworkStore'
import { DAYS, PERIODS, type PeriodOption } from '@/lib/scheduleTimes'

/** 节次时间模板：全局唯一来源在 @/lib/scheduleTimes，这里 re-export 兼容旧引用 */
export { DAYS, PERIODS, type PeriodOption }

export interface SheetSavePayload {
  dayOfWeek: number
  startTime: string
  endTime: string
  weekType: string
  entries: ScheduleEntry[]
}

interface Props {
  /** 初始星期 */
  day: number
  /** 初始节次索引（1 起） */
  periodIndex: number
  /** 已存在的格子；为空表示点击的是空格（新增） */
  slot: ScheduleSlot | null
  subjects: Subject[]
  /** 已有老师名列表（输入提示） */
  teacherOptions: string[]
  /** 周表选项（含默认表） */
  weekTypes: string[]
  /** 当前周表 */
  weekType: string
  /** 新建 entry 时默认选中的科目 id（默认地理；老数据无此字段时回退 subjects[0]） */
  defaultSubjectId?: string
  onAddSubject: (name: string) => string
  onSave: (payload: SheetSavePayload) => void
  /** 删除整个格子（清空该格全部课程） */
  onDeleteSlot: (slotId: string) => void
  onClose: () => void
}

const fieldCls =
  'w-full rounded-xl border border-petal-100 bg-cream/50 px-3 py-2 text-sm text-ink-900 outline-none transition-colors focus:border-petal-400'

const emptyEntry = (defaultSubjectId = ''): ScheduleEntry => ({
  subjectId: defaultSubjectId,
  teacherName: '',
  classLabel: '',
  location: '',
  isSelf: false,
})

/**
 * 课程编辑抽屉：点击课表格子唤起。
 * - 有课 → 编辑该格全部课程（可逐条改/删，可再加一节）
 * - 空格 → 新增课程（星期/节次已预填），顶部仍可临时改位置
 * 保存时按「目标位置」整体迁移，支持把一节课挪到别的星期/节次/周表。
 */
export default function ScheduleEditSheet({
  day,
  periodIndex,
  slot,
  subjects,
  teacherOptions,
  weekTypes,
  weekType,
  defaultSubjectId = '',
  onAddSubject,
  onSave,
  onDeleteSlot,
  onClose,
}: Props) {
  const initialIndex = useMemo(() => {
    const hit = PERIODS.find((p) => p.start === slot?.startTime)
    return hit?.index ?? periodIndex
  }, [slot, periodIndex])

  const [dayOfWeek, setDayOfWeek] = useState(day)
  const [pIndex, setPIndex] = useState(initialIndex)
  const [wk, setWk] = useState(slot?.weekType ?? weekType)
  const [entries, setEntries] = useState<ScheduleEntry[]>(() => {
    const src = slot?.entries ?? []
    return src.length > 0 ? src.map((e) => ({ ...e })) : [emptyEntry(defaultSubjectId)]
  })
  const [newSubject, setNewSubject] = useState('')

  const period = PERIODS.find((p) => p.index === pIndex) ?? PERIODS[0]!

  const patchEntry = (idx: number, patch: Partial<ScheduleEntry>) => {
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)))
  }

  const removeEntry = (idx: number) => {
    setEntries((prev) => (prev.length === 1 ? [emptyEntry(defaultSubjectId)] : prev.filter((_, i) => i !== idx)))
  }

  const validEntries = entries.filter((e) => e.subjectId || e.teacherName || e.classLabel)

  const handleAddSubject = () => {
    const name = newSubject.trim()
    if (!name) return
    const id = onAddSubject(name)
    setNewSubject('')
    // 自动挂到第一条还没选科目的课
    setEntries((prev) => {
      const target = prev.findIndex((e) => !e.subjectId)
      if (target < 0) return prev
      return prev.map((e, i) => (i === target ? { ...e, subjectId: id } : e))
    })
  }

  const handleSave = () => {
    if (validEntries.length === 0) {
      // 全部清空等同于删除该格
      if (slot) onDeleteSlot(slot.id)
      else onClose()
      return
    }
    onSave({
      dayOfWeek,
      startTime: period.start,
      endTime: period.end,
      weekType: wk,
      entries: validEntries.map((e) => ({
        subjectId: e.subjectId,
        teacherName: (e.teacherName ?? '').trim(),
        classLabel: (e.classLabel ?? '').trim() || undefined,
        location: (e.location ?? '').trim() || undefined,
        isSelf: false,
      })),
    })
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink-900/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-soft sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink-900">
            {slot ? '编辑课程' : '添加课程'}
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

        {/* 位置：星期 / 节次 / 周表 */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          <select
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(Number(e.target.value))}
            className={fieldCls}
          >
            {DAYS.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
          <select
            value={pIndex}
            onChange={(e) => setPIndex(Number(e.target.value))}
            className={fieldCls}
          >
            {PERIODS.map((p) => (
              <option key={p.index} value={p.index}>
                {p.label}
              </option>
            ))}
          </select>
          <select value={wk} onChange={(e) => setWk(e.target.value)} className={fieldCls}>
            {weekTypes.map((w) => (
              <option key={w || '__default'} value={w}>
                {w ? `${w}表` : '默认表'}
              </option>
            ))}
          </select>
        </div>
        <p className="-mt-2 mb-4 text-center text-xs text-ink-400">
          {period.start} - {period.end}
        </p>

        {/* 课程条目 */}
        <div className="flex flex-col gap-3">
          {entries.map((e, idx) => (
            <div key={idx} className="rounded-2xl bg-cream/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-ink-500">
                  第 {idx + 1} 节 · {DAYS.find((d) => d.key === dayOfWeek)?.label}
                </span>
                {entries.length > 0 && (
                  <button
                    type="button"
                    onClick={() => removeEntry(idx)}
                    title="删除这节课"
                    className="text-xs text-ink-400 transition hover:text-red-500"
                  >
                    删除
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={e.subjectId}
                  onChange={(ev) => patchEntry(idx, { subjectId: ev.target.value })}
                  className={fieldCls}
                >
                  <option value="">选择科目</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <input
                  value={e.teacherName ?? ''}
                  onChange={(ev) => patchEntry(idx, { teacherName: ev.target.value })}
                  placeholder="老师"
                  list="schedule-teacher-options"
                  className={fieldCls}
                />
                <input
                  value={e.classLabel ?? ''}
                  onChange={(ev) => patchEntry(idx, { classLabel: ev.target.value })}
                  placeholder="班级（可选）"
                  className={fieldCls}
                />
                <input
                  value={e.location ?? ''}
                  onChange={(ev) => patchEntry(idx, { location: ev.target.value })}
                  placeholder="地点（可选）"
                  className={fieldCls}
                />
              </div>
            </div>
          ))}
          <datalist id="schedule-teacher-options">
            {teacherOptions.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>

        {/* 新科目 + 再加一节 */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEntries((prev) => [...prev, emptyEntry(defaultSubjectId)])}
            className="rounded-full border border-petal-200 bg-surface px-4 py-2 text-sm font-medium text-petal-600 transition hover:bg-petal-50"
          >
            ＋ 同节次再加一节课
          </button>
          <div className="flex min-w-[12rem] flex-1 items-center gap-2">
            <input
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddSubject()
              }}
              placeholder="新科目名称"
              className={fieldCls}
            />
            <button
              type="button"
              onClick={handleAddSubject}
              disabled={!newSubject.trim()}
              className="shrink-0 rounded-full bg-cream-deep px-3 py-2 text-sm text-ink-600 transition hover:bg-petal-50 disabled:opacity-40"
            >
              新建
            </button>
          </div>
        </div>

        {/* 底部操作 */}
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
            onClick={handleSave}
            className="flex-[2] rounded-2xl bg-gradient-to-br from-petal-400 to-petal-500 py-2.5 text-sm font-semibold text-white shadow-card transition hover:brightness-105 active:scale-[0.98]"
          >
            保存
          </button>
        </div>
        {slot && (
          <button
            type="button"
            onClick={() => onDeleteSlot(slot.id)}
            className="mt-2 w-full rounded-2xl py-2 text-xs text-ink-400 transition hover:text-red-500"
          >
            清空该节次全部课程
          </button>
        )}
      </div>
    </div>
  )
}
