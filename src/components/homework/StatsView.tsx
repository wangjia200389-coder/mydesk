import { useMemo, useState } from 'react'
import { useHomeworkStore } from '@/store/useHomeworkStore'
import {
  computeRecordStats,
  computeStudentStats,
  inTimeRange,
  todayStr,
  TIME_RANGES,
  type HomeworkRecord,
  type TimeRangeKey,
} from '@/lib/homework'

const RATING_PALETTE = [
  '#ff8da1',
  '#a78bfa',
  '#54bd9b',
  '#6aa6ff',
  '#f0b85a',
  '#c9a27e',
  '#ff9e7a',
  '#9be0c3',
]

function colorFor(opt: string, options: string[]): string {
  if (opt === '未交') return '#cbd5e1'
  const idx = options.indexOf(opt)
  return RATING_PALETTE[(idx < 0 ? options.length : idx) % RATING_PALETTE.length]!
}

/** 为详情构建：评级 -> 学生名列表（单条记录） */
function buildRatingNames(record: HomeworkRecord, rating: string, studentMap: Map<string, string>): string[] {
  const names: string[] = []
  for (const e of record.entries) {
    if ((rating === '未交' && !e.rating) || e.rating === rating) {
      names.push(e.studentName || studentMap.get(e.studentId) || '未知学生')
    }
  }
  return names
}

export default function StatsView({ classId }: { classId: string }) {
  const cls = useHomeworkStore((s) => s.classes.find((c) => c.id === classId))
  const records = useHomeworkStore((s) => s.records)

  const [range, setRange] = useState<TimeRangeKey>('today')
  const [pickedDate, setPickedDate] = useState<string>(todayStr())
  const [showDate, setShowDate] = useState(false)
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null)
  const [view, setView] = useState<'class' | 'student'>('class')
  const [query, setQuery] = useState('')
  const [pickedStudent, setPickedStudent] = useState<string | null>(null)
  const [expandedRatings, setExpandedRatings] = useState<Set<string>>(new Set())

  // 时间范围内的作业记录（最近一次在前；今天范围再按 pickedDate 过滤）
  const rangeRecords = useMemo(() => {
    const all = records.filter((r) => r.classId === classId)
    const scoped = all.filter((r) => inTimeRange(r.date, range, cls?.semester))
    const list = range === 'today' ? scoped.filter((r) => r.date === pickedDate) : scoped
    return [...list].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1
      return b.createdAt - a.createdAt
    })
  }, [records, classId, range, pickedDate, cls?.semester])

  // 当前选中的作业：优先 selectedRecordId；不在范围内则回退到最近一次
  const effectiveRecord = useMemo(() => {
    if (selectedRecordId) {
      const hit = rangeRecords.find((r) => r.id === selectedRecordId)
      if (hit) return hit
    }
    return rangeRecords[0] ?? null
  }, [rangeRecords, selectedRecordId])

  /* 下面这些 Hook 必须无条件执行。
     班级可能在运行中被删除或切换，若把 useMemo 放在 `if (!cls) return null` 之后，
     两次渲染的 Hook 调用数量就会变化，违反 Hooks 规则 —— 所以空值一律在 Hook 内部处理。 */
  const students = cls?.students

  const studentMap = useMemo(() => new Map((students ?? []).map((s) => [s.id, s.name])), [students])

  // 班级维度：所选作业的学生明细
  const perStudentRows = useMemo(() => {
    if (!students || !effectiveRecord) return []
    return students.map((st) => {
      const entry = effectiveRecord.entries.find((e) => e.studentId === st.id)
      return { student: st, rating: entry?.rating ?? null, note: entry?.note ?? '' }
    })
  }, [students, effectiveRecord])

  // 个人维度
  const matchedStudents = useMemo(() => {
    const q = query.trim()
    return (students ?? []).filter((s) => (q ? s.name.includes(q) : true))
  }, [students, query])

  const picked = pickedStudent && students ? (students.find((s) => s.id === pickedStudent) ?? null) : null

  const studentStats = useMemo(
    () => (picked && effectiveRecord ? computeStudentStats([effectiveRecord], picked) : null),
    [picked, effectiveRecord],
  )

  if (!cls) return null

  const totalStudents = cls.students.length
  const recordStats = effectiveRecord
    ? computeRecordStats(effectiveRecord, totalStudents, cls.ratingOptions)
    : null

  const toggleRatingDetail = (opt: string) => {
    setExpandedRatings((prev) => {
      const next = new Set(prev)
      if (next.has(opt)) next.delete(opt)
      else next.add(opt)
      return next
    })
  }

  const rangeLabel = TIME_RANGES.find((t) => t.key === range)?.label ?? ''

  return (
    <div className="flex flex-col gap-3">
      {/* 时间范围 +（今天时）日期选择 */}
      <div className="flex flex-wrap items-center gap-2 rounded-full bg-petal-50 p-1">
        {TIME_RANGES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setRange(t.key)
              setSelectedRecordId(null)
              if (t.key !== 'today') setShowDate(false)
            }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              range === t.key ? 'bg-surface text-petal-600 shadow-card' : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            {t.label}
          </button>
        ))}
        {range === 'today' && (
          <button
            type="button"
            onClick={() => setShowDate((v) => !v)}
            title="选择日期"
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-base transition-colors ${
              showDate ? 'bg-surface text-petal-600 shadow-card' : 'text-ink-400 hover:bg-surface'
            }`}
          >
            📅
          </button>
        )}
      </div>
      {range === 'today' && showDate && (
        <div className="flex items-center gap-2 rounded-full bg-cream/60 px-3 py-1.5">
          <span className="text-sm">📅</span>
          <input
            type="date"
            value={pickedDate}
            onChange={(e) => {
              if (e.target.value) setPickedDate(e.target.value)
            }}
            className="bg-transparent text-sm text-ink-900 outline-none"
          />
        </div>
      )}

      {/* 作业视图：时间范围内全部作业，横向可滚动 */}
      {rangeRecords.length > 0 && (
        <div className="scrollbar-hide -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
          {rangeRecords.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelectedRecordId(r.id)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                effectiveRecord?.id === r.id
                  ? 'bg-lavender-500 text-white shadow-card'
                  : 'bg-lavender-50 text-lavender-600 hover:bg-lavender-100'
              }`}
            >
              {(r.content || r.date).slice(0, 12)}
            </button>
          ))}
        </div>
      )}

      {/* 维度切换 */}
      <div className="flex gap-1 self-start rounded-full bg-lavender-50 p-1">
        {([
          { k: 'class', l: '班级整体' },
          { k: 'student', l: '个人详细' },
        ] as const).map((tab) => (
          <button
            key={tab.k}
            onClick={() => setView(tab.k)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              view === tab.k ? 'bg-surface text-lavender-600 shadow-card' : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            {tab.l}
          </button>
        ))}
      </div>

      {rangeRecords.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-petal-100 bg-cream/40 py-12 text-center text-ink-400">
          {range === 'today' ? `「${pickedDate}」当天还没有作业登记记录` : `「${rangeLabel}」范围内还没有作业登记记录`}
        </div>
      ) : !recordStats ? null : view === 'class' ? (
        <>
          {/* 完成率概览 */}
          <div className="rounded-2xl bg-gradient-to-br from-petal-50 to-mint-50 p-5 shadow-card">
            <p className="text-sm text-ink-500">完成率（{effectiveRecord?.content || effectiveRecord?.date}）</p>
            <p className="mt-1 text-4xl font-semibold text-petal-600">
              {(recordStats.rate * 100).toFixed(0)}
              <span className="text-2xl">%</span>
            </p>
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-cream-deep">
              <div
                className="h-full rounded-full bg-petal-400 transition-all"
                style={{ width: `${recordStats.rate * 100}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-ink-400">
              提交 {recordStats.submitted} / 应提交 {recordStats.total} · 未提交 {recordStats.unsubmitted}
            </p>
          </div>

          {/* 评级分布 */}
          <div className="rounded-2xl bg-surface p-5 shadow-card">
            <p className="mb-3 text-sm text-ink-500">评级分布</p>
            <div className="flex h-4 w-full overflow-hidden rounded-full">
              {recordStats.ratingDistribution.map((d) => (
                <div
                  key={d.option}
                  style={{
                    width: `${(recordStats.total || 1) > 0 ? (d.count / recordStats.total) * 100 : 0}%`,
                    backgroundColor: colorFor(d.option, cls.ratingOptions),
                  }}
                  title={`${d.option}: ${d.count}`}
                />
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {recordStats.ratingDistribution.map((d) => {
                const expanded = expandedRatings.has(d.option)
                const names = expanded ? buildRatingNames(effectiveRecord!, d.option, studentMap) : []
                return (
                  <div key={d.option} className="rounded-xl border border-petal-50 bg-cream/40 transition-colors">
                    <button
                      type="button"
                      onClick={() => toggleRatingDetail(d.option)}
                      className="flex w-full items-center justify-between px-3 py-2"
                    >
                      <div className="flex items-center gap-1.5 text-sm text-ink-600">
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{ backgroundColor: colorFor(d.option, cls.ratingOptions) }}
                        />
                        {d.option}
                        <span className="text-ink-400">{d.count} 人</span>
                      </div>
                      {d.count > 0 && (
                        <span className="text-xs text-ink-400">{expanded ? '收起 ▴' : '详情 ▾'}</span>
                      )}
                    </button>
                    {expanded && (
                      <div className="px-3 pb-3">
                        {names.length === 0 ? (
                          <p className="text-xs text-ink-400">暂无记录</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {names.map((name, i) => (
                              <span
                                key={`${name}-${i}`}
                                className="rounded-full bg-surface px-2 py-0.5 text-xs text-ink-600 shadow-card"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 学生明细 */}
          <div className="rounded-2xl bg-surface p-5 shadow-card">
            <p className="mb-3 text-sm text-ink-500">学生明细（{perStudentRows.length} 人）</p>
            <div className="flex flex-col gap-1">
              {perStudentRows.map((row) => (
                <div
                  key={row.student.id}
                  className="flex items-center gap-3 rounded-lg bg-cream/40 px-3 py-2 text-sm"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-petal-100 text-xs font-semibold text-petal-600">
                    {(row.student.initial?.charAt(0) || row.student.name.charAt(0)).toUpperCase()}
                  </span>
                  <span className="w-20 shrink-0 truncate font-medium text-ink-900">{row.student.name}</span>
                  <span
                    className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: row.rating
                        ? colorFor(row.rating, cls.ratingOptions) + '33'
                        : '#e2e8f0',
                      color: row.rating ? colorFor(row.rating, cls.ratingOptions) : '#64748b',
                    }}
                  >
                    {row.rating ?? '未交'}
                  </span>
                  <span className="flex-1 truncate text-ink-400">{row.note || ''}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* 个人：搜索 + 列表 */}
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPickedStudent(null)
            }}
            placeholder="搜索学生姓名…"
            className="w-full rounded-xl border border-petal-100 bg-cream/60 px-4 py-2.5 text-ink-900 outline-none transition-colors focus:border-petal-400"
          />
          <div className="scroll-soft flex max-h-44 flex-col gap-1 overflow-y-auto">
            {matchedStudents.map((s) => (
              <button
                key={s.id}
                onClick={() => setPickedStudent(s.id)}
                className={`flex items-center justify-between rounded-xl px-4 py-2.5 text-left text-sm transition-colors ${
                  pickedStudent === s.id ? 'bg-petal-100 text-petal-700' : 'bg-cream/40 text-ink-700 hover:bg-petal-50'
                }`}
              >
                <span>{s.name}</span>
                <span className="text-xs text-ink-400">{s.initial}</span>
              </button>
            ))}
            {matchedStudents.length === 0 && <p className="py-3 text-center text-xs text-ink-400">无匹配学生</p>}
          </div>

          {/* 个人详情（所选作业） */}
          {picked && studentStats && (
            <div className="rounded-2xl bg-surface p-5 shadow-card">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-ink-900">{picked.name}</h3>
                <span className="rounded-full bg-mint-100 px-3 py-1 text-sm font-medium text-mint-700">
                  {effectiveRecord?.content || effectiveRecord?.date}
                </span>
              </div>
              {studentStats.rows.length === 0 ? (
                <p className="mt-3 text-sm text-ink-400">该作业没有此学生的登记记录</p>
              ) : (
                studentStats.rows.map((row, i) => (
                  <div
                    key={`${row.date}-${i}`}
                    className="mt-3 flex items-center gap-3 rounded-lg bg-cream/40 px-3 py-2 text-sm"
                  >
                    <span className="w-20 shrink-0 text-xs text-ink-400">{row.date}</span>
                    <span
                      className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: row.rating ? colorFor(row.rating, cls.ratingOptions) + '33' : '#e2e8f0',
                        color: row.rating ? colorFor(row.rating, cls.ratingOptions) : '#64748b',
                      }}
                    >
                      {row.rating ?? '未交'}
                    </span>
                    <span className="flex-1 truncate text-ink-600">{row.content || '（无内容）'}</span>
                    {row.note && <span className="shrink-0 text-xs text-ink-400">📝 {row.note}</span>}
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
