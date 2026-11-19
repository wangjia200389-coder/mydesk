import { useMemo, useState } from 'react'
import { useHomeworkStore } from '@/store/useHomeworkStore'
import { computeClassStats } from '@/lib/homework'

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

interface Row {
  id: string
  name: string
  rate: number
  distribution: { option: string; count: number }[]
}

export default function CompareView() {
  const classes = useHomeworkStore((s) => s.classes)
  const records = useHomeworkStore((s) => s.records)
  const [selected, setSelected] = useState<string[]>(() =>
    classes.slice(0, Math.min(2, classes.length)).map((c) => c.id),
  )

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )

  const rows = useMemo<Row[]>(() => {
    return selected
      .map((id) => {
        const cls = classes.find((c) => c.id === id)
        if (!cls) return null
        const recs = records.filter((r) => r.classId === id)
        const stats = computeClassStats(recs, cls.students, cls.ratingOptions)
        return {
          id: cls.id,
          name: cls.name,
          rate: stats.overallRate,
          distribution: stats.distribution,
        }
      })
      .filter((r): r is Row => Boolean(r))
      .sort((a, b) => b.rate - a.rate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, classes, records])

  // 跨班级统一配色：同一评级名（如"A"）在所有班级中颜色一致
  const allOptions = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((r) =>
      r.distribution.forEach((d) => {
        if (d.option !== '未交') set.add(d.option)
      }),
    )
    return Array.from(set)
  }, [rows])

  const colorForOpt = (opt: string): string => {
    if (opt === '未交') return '#cbd5e1'
    const idx = allOptions.indexOf(opt)
    return RATING_PALETTE[(idx < 0 ? allOptions.length : idx) % RATING_PALETTE.length]!
  }

  if (classes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-petal-100 bg-cream/40 py-12 text-center text-ink-400">
        还没有班级，先去「作业登记」新建班级再比较～
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 选择班级 */}
      <div className="rounded-2xl bg-surface p-4 shadow-card">
        <p className="mb-2 text-sm font-medium text-ink-700">
          选择要比较的班级（勾选 2 个及以上）
        </p>
        <div className="flex flex-wrap gap-2">
          {classes.map((c) => {
            const on = selected.includes(c.id)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  on
                    ? 'bg-petal-500 text-white shadow-card'
                    : 'bg-cream/60 text-ink-500 hover:bg-petal-50'
                }`}
              >
                {on ? '✓ ' : ''}
                {c.name}
              </button>
            )
          })}
        </div>
      </div>

      {rows.length < 2 ? (
        <div className="rounded-2xl border border-dashed border-petal-100 bg-cream/40 py-10 text-center text-sm text-ink-400">
          至少勾选 2 个班级才能比较
        </div>
      ) : (
        <>
          {/* 整体交齐率对比 */}
          <div className="rounded-2xl bg-surface p-5 shadow-card">
            <p className="mb-4 text-sm text-ink-500">整体交齐率对比</p>
            <div className="flex flex-col gap-3">
              {rows.map((r, i) => (
                <div key={r.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-ink-900">
                      {i === 0 ? '🏆 ' : ''}
                      {r.name}
                    </span>
                    <span className="font-semibold text-petal-600">
                      {(r.rate * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-3.5 w-full overflow-hidden rounded-full bg-cream-deep">
                    <div
                      className="h-full rounded-full bg-petal-400 transition-all"
                      style={{ width: `${r.rate * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 各评级占比对比 */}
          <div className="rounded-2xl bg-surface p-5 shadow-card">
            <p className="mb-3 text-sm text-ink-500">各评级占比对比</p>
            <div className="flex flex-col gap-4">
              {rows.map((r) => {
                const sum = r.distribution.reduce((a, b) => a + b.count, 0) || 1
                const opts = r.distribution
                  .filter((d) => d.count > 0)
                  .sort((a, b) => b.count - a.count)
                return (
                  <div key={r.id}>
                    <p className="mb-1.5 text-sm font-medium text-ink-900">{r.name}</p>
                    <div className="flex h-4 w-full overflow-hidden rounded-full">
                      {opts.map((d) => (
                        <div
                          key={d.option}
                          style={{
                            width: `${(d.count / sum) * 100}%`,
                            backgroundColor: colorForOpt(d.option),
                          }}
                          title={`${d.option}: ${d.count}`}
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {opts.map((d) => (
                        <div
                          key={d.option}
                          className="flex items-center gap-1.5 text-xs text-ink-600"
                        >
                          <span
                            className="inline-block h-3 w-3 rounded-full"
                            style={{ backgroundColor: colorForOpt(d.option) }}
                          />
                          {d.option}
                          <span className="text-ink-400">
                            {((d.count / sum) * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
