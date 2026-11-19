import { useEffect, useMemo, useState } from 'react'
import {
  computeRecordStats,
  type HomeworkRecord,
} from '@/lib/homework'
import { getPhoto } from '@/lib/photo'

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

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-cream/50 px-2 py-3 text-center">
      <span className="text-xl font-semibold text-ink-900">{value}</span>
      <span className="mt-0.5 text-xs text-ink-400">{label}</span>
      {sub && <span className="text-[11px] text-ink-300">{sub}</span>}
    </div>
  )
}

export default function RecordStatsModal({
  record,
  totalStudents,
  ratingOptions,
  onClose,
}: {
  record: HomeworkRecord
  totalStudents: number
  ratingOptions: string[]
  onClose: () => void
}) {
  const stats = useMemo(
    () => computeRecordStats(record, totalStudents, ratingOptions),
    [record, totalStudents, ratingOptions],
  )

  const noData = !record.entries || record.entries.length === 0
  const dist = stats.ratingDistribution.map((d) => {
    const total = record.entries.length || 1
    return { ...d, pct: total > 0 ? (d.count / total) * 100 : 0 }
  })

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (option: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(option)) next.delete(option)
      else next.add(option)
      return next
    })
  }

  // 按评级分组学生名单
  const studentsByRating = useMemo(() => {
    const map = new Map<string, { name: string; note?: string; score?: number | null }[]>()
    for (const d of dist) map.set(d.option, [])
    for (const e of record.entries) {
      const key = e.rating || '未交'
      const list = map.get(key) ?? []
      list.push({
        name: e.studentName || e.studentId || '未知',
        note: e.note,
        score: e.score,
      })
      map.set(key, list)
    }
    return map
  }, [record.entries, dist])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="scroll-soft max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-soft sm:max-w-md sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink-900">单次作业统计</h3>
            <p className="mt-0.5 text-xs text-ink-400">{record.date}</p>
            <p className="mt-1 truncate text-sm text-ink-600">{record.content || '（无作业内容）'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="关闭"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cream-deep text-lg text-ink-500 transition-colors hover:bg-petal-100"
          >
            ✕
          </button>
        </div>

        {noData ? (
          <div className="rounded-2xl border border-dashed border-petal-100 bg-cream/40 py-12 text-center text-ink-400">
            <div className="text-3xl">📭</div>
            <p className="mt-2 text-sm">该次作业还没有登记数据</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* 完成率 */}
            <div className="rounded-2xl bg-gradient-to-br from-petal-50 to-mint-50 p-5 shadow-card">
              <p className="text-sm text-ink-500">完成率</p>
              <p className="mt-1 text-4xl font-semibold text-petal-600">
                {(stats.rate * 100).toFixed(0)}
                <span className="text-2xl">%</span>
              </p>
              <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-cream-deep">
                <div
                  className="h-full rounded-full bg-petal-400 transition-all"
                  style={{ width: `${stats.rate * 100}%` }}
                />
              </div>
            </div>

            {/* 核心数字 */}
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="提交人数" value={`${stats.submitted}`} sub={`/ ${stats.total}`} />
              <StatCard label="未提交" value={`${stats.unsubmitted}`} />
              <StatCard label="完成率" value={`${(stats.rate * 100).toFixed(0)}%`} />
            </div>

            {/* 得分（有则显示） */}
            {stats.hasScore && (
              <div className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-lavender-100">
                <p className="mb-3 text-sm text-ink-500">得分统计（{stats.scoreCount} 人录入）</p>
                <div className="grid grid-cols-3 gap-2">
                  <StatCard label="平均分" value={stats.scoreAvg.toFixed(1)} />
                  <StatCard label="最高分" value={`${stats.scoreMax}`} />
                  <StatCard label="最低分" value={`${stats.scoreMin}`} />
                </div>
              </div>
            )}

            {/* 评级分布 */}
            <div className="rounded-2xl bg-surface p-4 shadow-card">
              <p className="mb-3 text-sm text-ink-500">评级分布</p>
              <div className="flex h-3 w-full overflow-hidden rounded-full">
                {dist.map((d) => (
                  <div
                    key={d.option}
                    style={{ width: `${d.pct}%`, backgroundColor: colorFor(d.option, ratingOptions) }}
                    title={`${d.option}: ${d.count}`}
                  />
                ))}
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {dist.map((d) => {
                  const isOpen = expanded.has(d.option)
                  const students = studentsByRating.get(d.option) ?? []
                  return (
                    <div
                      key={d.option}
                      className="rounded-xl bg-cream/50 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => toggle(d.option)}
                        disabled={d.count === 0}
                        className="flex w-full items-center justify-between px-3 py-2.5 text-left disabled:opacity-60"
                      >
                        <span className="flex items-center gap-2 text-sm text-ink-700">
                          <span
                            className="inline-block h-3 w-3 rounded-full"
                            style={{ backgroundColor: colorFor(d.option, ratingOptions) }}
                          />
                          {d.option}
                        </span>
                        <span className="flex items-center gap-2 text-sm text-ink-500">
                          <span>{d.count} 人</span>
                          {d.count > 0 && (
                            <span className="text-xs text-ink-400">
                              {isOpen ? '▴ 收起' : '▾ 详情'}
                            </span>
                          )}
                        </span>
                      </button>

                      {isOpen && students.length > 0 && (
                        <div className="flex flex-col gap-1.5 px-3 pb-3 pt-0">
                          {students.map((st, idx) => (
                            <div
                              key={idx}
                              className="flex items-start justify-between gap-3 rounded-lg bg-surface px-2.5 py-2 shadow-sm ring-1 ring-petal-100"
                            >
                              <span className="min-w-0 shrink-0 text-xs font-medium text-ink-700">
                                {st.name}
                              </span>
                              <span className="flex min-w-0 items-start gap-2">
                                {typeof st.score === 'number' && !Number.isNaN(st.score) && (
                                  <span className="shrink-0 rounded-md bg-lavender-100 px-1.5 py-0.5 text-xs font-semibold text-lavender-700">
                                    {st.score}分
                                  </span>
                                )}
                                <span className="min-w-0 break-words text-right text-xs text-ink-400">
                                  {st.note?.trim() || (
                                    <span className="text-ink-300">无备注</span>
                                  )}
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {(record.overallEvaluation ||
                (record.overallImages && record.overallImages.length > 0)) && (
                <div className="mt-3 flex flex-col gap-2">
                  {record.overallEvaluation && (
                    <div className="rounded-xl bg-mint-50 px-3 py-2 text-xs text-mint-800">
                      <span className="mr-1">💬</span>
                      {record.overallEvaluation}
                    </div>
                  )}
                  {record.overallImages && record.overallImages.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {record.overallImages.map((pid) => (
                        <EvalImage key={pid} photoId={pid} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function EvalImage({ photoId }: { photoId: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    getPhoto(photoId)
      .then((u) => {
        if (active) setUrl(u)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [photoId])
  if (!url) return null
  return (
    <img
      src={url}
      alt="评价图片"
      className="h-16 w-16 shrink-0 rounded-lg object-cover ring-1 ring-petal-100"
    />
  )
}
