import { useMemo, useState } from 'react'
import { useHomeworkStore } from '@/store/useHomeworkStore'
import { todayStr } from '@/lib/homework'

/**
 * 面批模块：按日期记录需要面批的学生及面批内容。
 * - 学生名单同步自班级；
 * - 待面批列表可勾选「完成」，勾选后移入「已完成面批」；
 * - 内容全程可编辑，可删除，操作简便。
 */
export default function FaceReview({ classId }: { classId: string }) {
  const cls = useHomeworkStore((s) => s.classes.find((c) => c.id === classId))
  const faceReviews = useHomeworkStore((s) => s.faceReviews)
  const addFaceReview = useHomeworkStore((s) => s.addFaceReview)
  const updateFaceReview = useHomeworkStore((s) => s.updateFaceReview)
  const removeFaceReview = useHomeworkStore((s) => s.removeFaceReview)

  const [date, setDate] = useState(todayStr())
  const [addOpen, setAddOpen] = useState(false)
  /** 「历史未面批」折叠区是否展开 */
  const [historyOpen, setHistoryOpen] = useState(false)

  const today = todayStr()

  const list = useMemo(
    () =>
      faceReviews
        .filter((f) => f.classId === classId && f.date === date)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)),
    [faceReviews, classId, date],
  )
  const pending = list.filter((f) => !f.done)
  const done = list.filter((f) => f.done)

  // 该班「全部日期」的待面批总数（用于提示）
  const pendingAll = useMemo(
    () => faceReviews.filter((f) => f.classId === classId && !f.done).length,
    [faceReviews, classId],
  )

  /** 今天之前的遗留未面批（任何日期下都能展开处理，无需跳回当天） */
  const overdue = useMemo(
    () =>
      faceReviews
        .filter((f) => f.classId === classId && !f.done && f.date < today)
        .sort((a, b) =>
          a.date === b.date ? (a.createdAt < b.createdAt ? -1 : 1) : a.date < b.date ? -1 : 1,
        ),
    [faceReviews, classId, today],
  )

  /** 遗留按日期分组：[[date, items[]], ...] */
  const overdueGroups = useMemo(() => {
    const m = new Map<string, typeof overdue>()
    for (const f of overdue) {
      if (!m.has(f.date)) m.set(f.date, [])
      m.get(f.date)!.push(f)
    }
    return Array.from(m.entries())
  }, [overdue])

  if (!cls) return null

  return (
    <div className="flex flex-col gap-3">
      {/* 日期选择 */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-3 shadow-card">
        <span className="text-sm">📅</span>
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="rounded-xl border border-petal-100 bg-cream/60 px-3 py-1.5 text-sm text-ink-900 outline-none focus:border-petal-400"
        />
        <div className="ml-auto flex items-center gap-2">
          {overdue.length > 0 ? (
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              title="查看今天之前遗留的未面批"
              className="no-tap-highlight flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-600 ring-1 ring-amber-200 transition hover:bg-amber-100 active:scale-95"
            >
              <span>🕘</span>
              历史未面批（{overdue.length}）
            </button>
          ) : (
            pendingAll > 0 && (
              <span className="rounded-full bg-petal-100 px-3 py-1 text-xs font-medium text-petal-600">
                待面批 {pendingAll} 人
              </span>
            )
          )}
        </div>
      </div>

      {/* 添加按钮 */}
      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="flex items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-petal-200 bg-petal-50/60 py-3 text-sm font-medium text-petal-600 transition hover:bg-petal-100"
      >
        ＋ 添加面批
      </button>

      {/* 待面批 */}
      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-700">
          <span className="text-petal-500">●</span> 待面批（{pending.length}）
        </h3>
        {pending.length === 0 ? (
          <p className="rounded-xl bg-cream/40 py-6 text-center text-xs text-ink-400">
            该日期暂无待面批学生
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {pending.map((f) => (
              <FaceItem
                key={f.id}
                item={f}
                onToggle={() => updateFaceReview(f.id, { done: true })}
                onContent={(content) => updateFaceReview(f.id, { content })}
                onRemove={() => {
                  if (window.confirm(`删除「${f.studentName}」的面批记录？`)) removeFaceReview(f.id)
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* 已完成面批 */}
      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-700">
          <span className="text-mint-500">●</span> 已完成面批（{done.length}）
        </h3>
        {done.length === 0 ? (
          <p className="rounded-xl bg-cream/40 py-6 text-center text-xs text-ink-400">
            暂无已完成面批
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {done.map((f) => (
              <FaceItem
                key={f.id}
                item={f}
                done
                onToggle={() => updateFaceReview(f.id, { done: false })}
                onContent={(content) => updateFaceReview(f.id, { content })}
                onRemove={() => {
                  if (window.confirm(`删除「${f.studentName}」的面批记录？`)) removeFaceReview(f.id)
                }}
              />
            ))}
          </div>
        )}
      </section>

      {addOpen && (
        <AddFaceReviewModal
          classId={classId}
          onClose={() => setAddOpen(false)}
          onAdd={(studentId, studentName, content) => {
            addFaceReview({ classId, date, studentId, studentName, content, done: false })
            setAddOpen(false)
          }}
        />
      )}

      {/* 历史未面批弹窗：从右上角入口点开，直接勾选完成 / 改内容 / 删除 */}
      {historyOpen && overdue.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/30 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setHistoryOpen(false)
          }}
        >
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-4 shadow-soft sm:rounded-3xl">
            <div className="mb-1 flex items-center gap-2">
              <span>🕘</span>
              <p className="text-sm font-semibold text-ink-900">
                历史未面批（{overdue.length}）
              </p>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="ml-auto rounded-full px-2 py-1 text-xs text-ink-400 transition hover:text-ink-700"
              >
                关闭
              </button>
            </div>
            <p className="mb-3 text-[11px] text-ink-400">
              今天之前遗留的未面批：勾选即完成（记录保留在原日期），也可直接改内容或删除。
            </p>

            <div className="flex flex-col gap-3">
              {overdueGroups.map(([d, items]) => (
                <div key={d}>
                  <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-ink-400">
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-600">
                      {d} 遗留
                    </span>
                    {items.length} 人
                  </p>
                  <div className="flex flex-col gap-2">
                    {items.map((f) => (
                      <FaceItem
                        key={f.id}
                        item={f}
                        onToggle={() => updateFaceReview(f.id, { done: true })}
                        onContent={(content) => updateFaceReview(f.id, { content })}
                        onRemove={() => {
                          if (window.confirm(`删除「${f.studentName}」的面批记录？`))
                            removeFaceReview(f.id)
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              className="mt-4 w-full rounded-xl bg-petal-50 py-2 text-sm font-medium text-petal-600 transition hover:bg-petal-100"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 单条面批                                                            */
/* ------------------------------------------------------------------ */

function FaceItem(props: {
  item: {
    id: string
    studentName: string
    content: string
    done: boolean
  }
  done?: boolean
  onToggle: () => void
  onContent: (content: string) => void
  onRemove: () => void
}) {
  const { item, done, onToggle, onContent, onRemove } = props
  return (
    <div
      className={`flex items-start gap-2 rounded-2xl border p-3 shadow-card transition ${
        done ? 'border-mint-100 bg-mint-50/40' : 'border-petal-100 bg-surface'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        title={done ? '撤销完成' : '标记完成'}
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-sm transition ${
          done
            ? 'border-mint-400 bg-mint-400 text-white'
            : 'border-petal-300 bg-surface text-transparent hover:border-petal-400'
        }`}
      >
        ✓
      </button>
      <div className="min-w-0 flex-1">
        <span
          className={`text-sm font-semibold ${done ? 'text-ink-400 line-through' : 'text-ink-900'}`}
        >
          {item.studentName}
        </span>
        <input
          value={item.content}
          onChange={(e) => onContent(e.target.value)}
          placeholder="面批内容…（可编辑）"
          className="mt-1 w-full rounded-lg border border-petal-100 bg-cream/50 px-2 py-1.5 text-sm text-ink-700 outline-none focus:border-petal-400"
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        title="删除"
        className="mt-0.5 shrink-0 rounded-full px-1.5 text-sm text-ink-300 transition hover:text-red-500"
      >
        🗑️
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 添加面批弹窗                                                        */
/* ------------------------------------------------------------------ */

function AddFaceReviewModal(props: {
  classId: string
  onClose: () => void
  onAdd: (studentId: string, studentName: string, content: string) => void
}) {
  const cls = useHomeworkStore((s) => s.classes.find((c) => c.id === props.classId))
  const [studentId, setStudentId] = useState('')
  const [content, setContent] = useState('')

  if (!cls) return null
  const selected = cls.students.find((s) => s.id === studentId)

  const submit = () => {
    if (!selected) return
    props.onAdd(selected.id, selected.name, content.trim())
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={props.onClose}
    >
      <div
        className="scroll-soft max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-soft sm:max-w-md sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-ink-900">添加面批</h3>
            <p className="mt-0.5 text-xs text-ink-400">选择学生并记录面批内容</p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cream-deep text-lg text-ink-500 transition-colors hover:bg-petal-100"
          >
            ✕
          </button>
        </div>

        <label className="mb-1 block text-xs font-medium text-ink-500">学生</label>
        <select
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          className="mb-4 w-full rounded-xl border border-petal-100 bg-cream/60 px-3 py-2.5 text-sm text-ink-900 outline-none focus:border-petal-400"
        >
          <option value="">请选择学生…</option>
          {cls.students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-xs font-medium text-ink-500">面批内容</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          placeholder="例如：讲解错题、订正思路、加强练习…"
          className="scroll-soft mb-4 w-full rounded-xl border border-petal-100 bg-cream/60 px-3 py-2.5 text-sm text-ink-900 outline-none focus:border-petal-400"
        />

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-full border border-petal-100 bg-surface px-5 py-2 text-sm font-medium text-ink-500 transition hover:bg-petal-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!selected}
            className="rounded-full bg-petal-500 px-6 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-petal-600 disabled:opacity-50"
          >
            添加
          </button>
        </div>
      </div>
    </div>
  )
}
