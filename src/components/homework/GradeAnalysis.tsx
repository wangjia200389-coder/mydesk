import { useMemo, useState } from 'react'
import { useHomeworkStore, type Exam } from '@/store/useHomeworkStore'
import { todayStr } from '@/lib/homework'
import ScoreImportModal from '@/components/homework/ScoreImportModal'
import { BarChart, DonutChart, LineChart, pickColor } from './charts'

type View = 'overview' | 'entry' | 'compare' | 'student'

/* ------------------------------------------------------------------ */
/* 统计工具                                                            */
/* ------------------------------------------------------------------ */

interface ExamStats {
  count: number
  avg: number
  max: number
  min: number
  passRate: number
  excellentRate: number
}

function examStats(exam: Exam): ExamStats {
  const scores = exam.entries
    .map((e) => e.score)
    .filter((s): s is number => typeof s === 'number' && !Number.isNaN(s))
  const count = scores.length
  const full = exam.fullScore || 100
  const avg = count ? scores.reduce((a, b) => a + b, 0) / count : 0
  const max = count ? Math.max(...scores) : 0
  const min = count ? Math.min(...scores) : 0
  const pass = scores.filter((s) => s >= full * 0.6).length
  const excellent = scores.filter((s) => s >= full * 0.9).length
  return {
    count,
    avg,
    max,
    min,
    passRate: count ? pass / count : 0,
    excellentRate: count ? excellent / count : 0,
  }
}

function scoreBands(exam: Exam): { label: string; value: number }[] {
  const full = exam.fullScore || 100
  const n = 5
  const w = full / n
  const bands: { label: string; value: number }[] = []
  for (let i = 0; i < n; i++) {
    const lo = i * w
    const hi = i === n - 1 ? full : (i + 1) * w
    const count = exam.entries.filter(
      (e) => typeof e.score === 'number' && e.score >= lo && e.score <= hi,
    ).length
    bands.push({ label: `${Math.round(lo)}-${Math.round(hi)}`, value: count })
  }
  return bands
}

function gradePie(exam: Exam): { label: string; value: number; color: string }[] {
  const full = exam.fullScore || 100
  const defs = [
    { label: '优秀', color: '#54bd9b', test: (p: number) => p >= 0.9 },
    { label: '良好', color: '#6aa6ff', test: (p: number) => p >= 0.8 },
    { label: '中等', color: '#f0b85a', test: (p: number) => p >= 0.7 },
    { label: '及格', color: '#ff9e7a', test: (p: number) => p >= 0.6 },
    { label: '不及格', color: '#ff8da1', test: () => true },
  ]
  return defs.map((d) => ({
    label: d.label,
    color: d.color,
    value: exam.entries.filter((e) => {
      if (typeof e.score !== 'number') return false
      return d.test(e.score / full)
    }).length,
  }))
}

/* ------------------------------------------------------------------ */
/* 主组件                                                              */
/* ------------------------------------------------------------------ */

export default function GradeAnalysis({ classId }: { classId: string }) {
  const cls = useHomeworkStore((s) => s.classes.find((c) => c.id === classId))
  const exams = useHomeworkStore((s) => s.exams)
  const addExam = useHomeworkStore((s) => s.addExam)
  const updateExam = useHomeworkStore((s) => s.updateExam)
  const removeExam = useHomeworkStore((s) => s.removeExam)

  const [view, setView] = useState<View>('overview')
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null)
  const [editingExamId, setEditingExamId] = useState<string | null>(null)

  const classExams = useMemo(
    () =>
      exams
        .filter((e) => e.classId === classId)
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    [exams, classId],
  )
  const selectedExam =
    classExams.find((e) => e.id === selectedExamId) ?? classExams[classExams.length - 1] ?? null

  if (!cls) return null

  // 录入/编辑成绩
  if (view === 'entry') {
    const editing = editingExamId ? classExams.find((e) => e.id === editingExamId) ?? null : null
    return (
      <GradeForm
        classId={classId}
        exam={editing}
        onCancel={() => {
          setView('overview')
          setEditingExamId(null)
        }}
        onSave={(data) => {
          if (editing) {
            updateExam(editing.id, data)
          } else {
            addExam({ classId, ...data })
            setSelectedExamId(null)
          }
          setView('overview')
          setEditingExamId(null)
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 考试选择 + 录入 */}
      <div className="flex items-center gap-2">
        <div className="scrollbar-hide -mx-1 flex flex-1 gap-2 overflow-x-auto px-1 py-1">
          {classExams.length === 0 && (
            <span className="text-sm text-ink-400">还没有成绩记录</span>
          )}
          {classExams.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => {
                setSelectedExamId(e.id)
                setView('overview')
              }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                selectedExam?.id === e.id && view !== 'compare'
                  ? 'bg-lavender-500 text-white shadow-card'
                  : 'bg-lavender-50 text-lavender-600 hover:bg-lavender-100'
              }`}
            >
              {e.name || e.date}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingExamId(null)
            setView('entry')
          }}
          className="shrink-0 rounded-full bg-petal-500 px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-petal-600"
        >
          ＋ 录入成绩
        </button>
      </div>

      {/* 视图切换 */}
      <div className="flex gap-1 self-start rounded-full bg-lavender-50 p-1">
        {(
          [
            { k: 'overview', l: '本次分析' },
            { k: 'compare', l: '班级对比' },
            { k: 'student', l: '个人发展' },
          ] as { k: View; l: string }[]
        ).map((t) => (
          <button
            key={t.k}
            onClick={() => setView(t.k)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              view === t.k ? 'bg-surface text-lavender-600 shadow-card' : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {classExams.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-petal-100 bg-cream/40 py-12 text-center">
          <div className="text-3xl">📊</div>
          <p className="mt-2 text-sm text-ink-400">点右上角「录入成绩」开始记录</p>
        </div>
      ) : view === 'overview' && selectedExam ? (
        <Overview
          exam={selectedExam}
          onEdit={() => {
            setEditingExamId(selectedExam.id)
            setView('entry')
          }}
          onRemove={() => {
            if (window.confirm(`确定删除「${selectedExam.name || selectedExam.date}」？`)) {
              removeExam(selectedExam.id)
              setSelectedExamId(null)
            }
          }}
        />
      ) : view === 'compare' ? (
        <Compare classExams={classExams} />
      ) : view === 'student' ? (
        <StudentCurve classId={classId} classExams={classExams} />
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 本次分析                                                            */
/* ------------------------------------------------------------------ */

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-cream/50 px-2 py-3 text-center">
      <span className="text-lg font-semibold text-ink-900">{value}</span>
      <span className="mt-0.5 text-xs text-ink-400">{label}</span>
      {sub && <span className="text-[11px] text-ink-300">{sub}</span>}
    </div>
  )
}

function Overview({ exam, onEdit, onRemove }: { exam: Exam; onEdit: () => void; onRemove: () => void }) {
  const stats = examStats(exam)
  const bands = scoreBands(exam)
  const pie = gradePie(exam)

  const students = [...exam.entries].sort((a, b) => {
    const av = typeof a.score === 'number' ? a.score : -Infinity
    const bv = typeof b.score === 'number' ? b.score : -Infinity
    return bv - av
  })

  return (
    <div className="flex flex-col gap-4">
      {/* 考试信息 */}
      <div className="flex items-start justify-between gap-3 rounded-2xl bg-surface p-4 shadow-card">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-ink-900">{exam.name || '未命名考试'}</h3>
          <p className="mt-0.5 text-xs text-ink-400">
            {exam.date}
            {exam.subject ? ` · ${exam.subject}` : ''} · 满分 {exam.fullScore || 100}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onEdit}
            title="编辑"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-cream-deep text-sm text-ink-500 transition hover:bg-petal-50"
          >
            ✏️
          </button>
          <button
            type="button"
            onClick={onRemove}
            title="删除"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-cream-deep text-sm text-ink-400 transition hover:bg-red-50 hover:text-red-500"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* 核心数字 */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="平均分" value={stats.avg.toFixed(1)} sub={`已录 ${stats.count} 人`} />
        <StatCard label="最高分" value={`${stats.max}`} />
        <StatCard label="最低分" value={`${stats.min}`} />
        <StatCard label="及格率" value={`${(stats.passRate * 100).toFixed(0)}%`} />
        <StatCard label="优秀率" value={`${(stats.excellentRate * 100).toFixed(0)}%`} />
        <StatCard label="满分" value={`${exam.fullScore || 100}`} />
      </div>

      {/* 分数段柱状图 */}
      <div className="rounded-2xl bg-surface p-4 shadow-card">
        <p className="mb-3 text-sm text-ink-500">分数段分布</p>
        <BarChart data={bands.map((b, i) => ({ ...b, color: pickColor(i) }))} unit="人" />
      </div>

      {/* 等级占比环形图 */}
      <div className="rounded-2xl bg-surface p-4 shadow-card">
        <p className="mb-3 text-sm text-ink-500">等级占比</p>
        <DonutChart data={pie} centerLabel={`${stats.count}人`} />
      </div>

      {/* 学生成绩列表 */}
      <div className="rounded-2xl bg-surface p-4 shadow-card">
        <p className="mb-3 text-sm text-ink-500">学生成绩（{students.length} 人）</p>
        <div className="flex flex-col gap-1">
          {students.map((e, i) => {
            const full = exam.fullScore || 100
            const pct = typeof e.score === 'number' ? e.score / full : -1
            return (
              <div key={`${e.studentId}-${i}`} className="flex items-center gap-3 rounded-lg bg-cream/40 px-3 py-2 text-sm">
                <span className="w-6 shrink-0 text-center text-xs text-ink-300">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-ink-900">
                  {e.studentName || '未知学生'}
                </span>
                {typeof e.score === 'number' ? (
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-sm font-semibold ${
                      pct >= 0.9
                        ? 'bg-mint-100 text-mint-700'
                        : pct >= 0.6
                          ? 'bg-lavender-100 text-lavender-700'
                          : 'bg-petal-100 text-petal-600'
                    }`}
                  >
                    {e.score}
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-ink-300">未录入</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 班级对比                                                            */
/* ------------------------------------------------------------------ */

function Compare({ classExams }: { classExams: Exam[] }) {
  const points = classExams
    .filter((e) => examStats(e).count > 0)
    .map((e) => {
      const s = examStats(e)
      return { x: e.name || e.date.slice(5), y: Number(s.avg.toFixed(1)) }
    })

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl bg-surface p-4 shadow-card">
        <p className="mb-3 text-sm text-ink-500">班级平均分变化（共 {classExams.length} 次考试）</p>
        {points.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-400">暂无已录入成绩</p>
        ) : (
          <LineChart points={points} unit="分" color="#a78bfa" />
        )}
      </div>
      <div className="rounded-2xl bg-surface p-4 shadow-card">
        <p className="mb-3 text-sm text-ink-500">各次考试平均分</p>
        <BarChart data={points.map((p, i) => ({ label: p.x, value: p.y, color: pickColor(i) }))} unit="分" />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 个人发展曲线                                                        */
/* ------------------------------------------------------------------ */

function StudentCurve({ classId, classExams }: { classId: string; classExams: Exam[] }) {
  const cls = useHomeworkStore((s) => s.classes.find((c) => c.id === classId))
  const [studentId, setStudentId] = useState('')

  const students = cls?.students ?? []
  const selected = students.find((s) => s.id === studentId) ?? students[0] ?? null

  const points = selected
    ? classExams
        .filter((e) => {
          const en = e.entries.find((x) => x.studentId === selected.id)
          return en && typeof en.score === 'number'
        })
        .map((e) => {
          const en = e.entries.find((x) => x.studentId === selected!.id)!
          return { x: e.name || e.date.slice(5), y: en.score as number }
        })
    : []

  // 进步/退步
  const delta =
    points.length >= 2 ? points[points.length - 1].y - points[0].y : 0

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl bg-surface p-4 shadow-card">
        <label className="mb-2 block text-xs font-medium text-ink-500">选择学生</label>
        <select
          value={selected?.id ?? ''}
          onChange={(e) => setStudentId(e.target.value)}
          className="w-full rounded-xl border border-petal-100 bg-cream/60 px-3 py-2.5 text-sm text-ink-900 outline-none focus:border-petal-400"
        >
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-2xl bg-surface p-4 shadow-card">
        <p className="mb-1 text-sm text-ink-500">
          {selected?.name ?? ''} 的成绩发展曲线
        </p>
        {points.length >= 2 && (
          <p
            className={`mb-3 text-xs font-medium ${
              delta > 0 ? 'text-mint-600' : delta < 0 ? 'text-petal-600' : 'text-ink-400'
            }`}
          >
            {delta > 0
              ? `较首次 ↑ ${delta.toFixed(1)} 分，有进步`
              : delta < 0
                ? `较首次 ↓ ${Math.abs(delta).toFixed(1)} 分，需关注`
                : '较首次持平'}
          </p>
        )}
        {points.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-400">该生暂无成绩记录</p>
        ) : (
          <LineChart points={points} unit="分" color="#54bd9b" />
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 成绩录入表单                                                        */
/* ------------------------------------------------------------------ */

function GradeForm({
  classId,
  exam,
  onSave,
  onCancel,
}: {
  classId: string
  exam: Exam | null
  onSave: (data: { name: string; date: string; subject: string; fullScore: number; entries: Exam['entries'] }) => void
  onCancel: () => void
}) {
  const cls = useHomeworkStore((s) => s.classes.find((c) => c.id === classId))
  const [name, setName] = useState(exam?.name ?? '')
  const [date, setDate] = useState(exam?.date ?? todayStr())
  const [subject, setSubject] = useState(exam?.subject ?? '')
  const [fullScore, setFullScore] = useState(exam ? String(exam.fullScore) : '100')
  const [entries, setEntries] = useState<Record<string, number | null>>(() => {
    const m: Record<string, number | null> = {}
    for (const st of cls?.students ?? []) m[st.id] = null
    for (const e of exam?.entries ?? []) m[e.studentId] = e.score ?? null
    return m
  })
  const [importOpen, setImportOpen] = useState(false)

  if (!cls) return null

  const setScore = (sid: string, raw: string) => {
    const v = raw.trim() === '' ? null : Number(raw)
    setEntries((prev) => ({
      ...prev,
      [sid]: v != null && Number.isNaN(v) ? null : v,
    }))
  }

  const applyImport = (map: Record<string, number | null>) => {
    setEntries((prev) => ({ ...prev, ...map }))
    setImportOpen(false)
  }

  const save = () => {
    const rosterIds = new Set(cls.students.map((s) => s.id))
    const list: Exam['entries'] = cls.students.map((st) => ({
      studentId: st.id,
      studentName: st.name,
      score: entries[st.id] ?? null,
    }))
    for (const e of exam?.entries ?? []) {
      if (!rosterIds.has(e.studentId)) list.push(e)
    }
    onSave({
      name: name.trim() || '未命名考试',
      date,
      subject: subject.trim(),
      fullScore: Number(fullScore) || 100,
      entries: list,
    })
  }

  const scored = Object.values(entries).filter((v) => typeof v === 'number').length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink-900">{exam ? '编辑成绩' : '录入成绩'}</h2>
        <span className="text-xs text-ink-400">已录 {scored}/{cls.students.length} 人</span>
      </div>

      {/* 考试信息 */}
      <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-card">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">考试名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：期中考试"
              className="w-full rounded-xl border border-petal-100 bg-cream/60 px-3 py-2 text-sm text-ink-900 outline-none focus:border-petal-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">日期</label>
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="w-full rounded-xl border border-petal-100 bg-cream/60 px-3 py-2 text-sm text-ink-900 outline-none focus:border-petal-400"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">科目（选填）</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="如：数学"
              className="w-full rounded-xl border border-petal-100 bg-cream/60 px-3 py-2 text-sm text-ink-900 outline-none focus:border-petal-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">满分</label>
            <input
              type="number"
              min={1}
              value={fullScore}
              onChange={(e) => setFullScore(e.target.value)}
              className="w-full rounded-xl border border-petal-100 bg-cream/60 px-3 py-2 text-sm text-ink-900 outline-none focus:border-petal-400"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="self-start rounded-xl border border-lavender-200 bg-lavender-50 px-3 py-2 text-sm font-medium text-lavender-600 transition hover:bg-lavender-100"
        >
          📥 批量导入（粘贴 / Excel）
        </button>
      </div>

      {/* 学生成绩列表 */}
      <div className="scroll-soft overflow-hidden rounded-2xl bg-surface shadow-card">
        <div className="flex items-center gap-2 px-3 pb-1 pt-2 text-[11px] text-ink-400">
          <div className="flex-1">姓名</div>
          <div className="w-24 shrink-0">成绩</div>
        </div>
        <div className="scroll-soft max-h-[52vh] overflow-y-auto">
          {cls.students.map((st) => (
            <div key={st.id} className="flex items-center gap-2 border-t border-petal-50 px-3 py-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-petal-100 text-xs font-semibold text-petal-600">
                  {(st.initial?.charAt(0) || st.name.charAt(0)).toUpperCase()}
                </span>
                <span className="truncate text-sm font-medium text-ink-900">{st.name}</span>
              </div>
              <input
                type="number"
                inputMode="decimal"
                value={entries[st.id] ?? ''}
                onChange={(e) => setScore(st.id, e.target.value)}
                placeholder="分"
                className="w-24 shrink-0 rounded-lg border border-petal-100 bg-cream/60 px-2 py-1.5 text-center text-sm text-ink-900 outline-none focus:border-petal-400"
              />
            </div>
          ))}
        </div>
      </div>

      {/* 保存 */}
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-petal-100 bg-surface px-5 py-2.5 text-sm font-medium text-ink-500 transition hover:bg-petal-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={save}
          className="rounded-full bg-petal-500 px-6 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-petal-600"
        >
          保存
        </button>
      </div>

      {importOpen && (
        <ScoreImportModal
          students={cls.students}
          onApply={applyImport}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  )
}
