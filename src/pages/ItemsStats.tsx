import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useItemStore } from '@/store/useItemStore'
import { itemMatchesTag, isExpiringSoon } from '@/lib/itemsUtil'

/** 物品统计页：按大类（甜甜圈）+ 按品类（条形）+ 状态，给用户一个整体感知 */
export default function ItemsStats() {
  const items = useItemStore((s) => s.items)
  const tags = useItemStore((s) => s.tags)

  const data = useMemo(() => {
    const normal = items.filter((i) => i.status === 'normal' && !i.isDraft)
    const l1 = tags.filter((t) => t.level === 1)
    const l2 = tags.filter((t) => t.level === 2)
    const l1Counts = l1.map((t) => ({
      tag: t,
      count: normal.filter((i) => itemMatchesTag(i, tags, t.id)).length,
    }))
    const l2Counts = l2
      .map((t) => ({
        tag: t,
        count: normal.filter((i) => itemMatchesTag(i, tags, t.id)).length,
      }))
      .sort((a, b) => b.count - a.count)
    const status = {
      normal: normal.length,
      discarded: items.filter((i) => i.status === 'discarded').length,
      consumed: items.filter((i) => i.status === 'consumed').length,
    }
    const rated = normal.filter((i) => i.rating).length
    const expiring = normal.filter((i) => isExpiringSoon(i, 7)).length
    return { l1Counts, l2Counts, status, rated, expiring, total: normal.length }
  }, [items, tags])

  const { total, l1Counts, l2Counts, status, rated, expiring } = data
  const maxL2 = Math.max(1, ...l2Counts.map((x) => x.count))
  const r = 54
  const circ = 2 * Math.PI * r
  let offset = 0

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 md:px-8">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            to="/items"
            className="rounded-xl px-2 py-1 text-lg text-ink-500 transition hover:text-petal-600"
          >
            ‹
          </Link>
          <h1 className="text-2xl font-semibold text-ink-900 md:text-3xl">
            物品统计 📊
          </h1>
        </div>
        <Link
          to="/items"
          className="rounded-full bg-petal-50 px-3 py-1 text-xs font-medium text-petal-600 ring-1 ring-petal-200"
        >
          返回物品
        </Link>
      </header>

      {/* 总数 */}
      <div className="mb-5 rounded-3xl bg-gradient-to-br from-petal-400 to-lavender-400 p-6 text-white shadow-card">
        <p className="text-sm opacity-90">你一共拥有</p>
        <p className="mt-1 text-5xl font-bold tabular-nums">{total}</p>
        <p className="mt-1 text-sm opacity-90">件个人物品 📦</p>
        <div className="mt-4 flex gap-4 text-xs opacity-95">
          <span>⭐ 已评价 {rated}</span>
          <span>⏰ 即将过期 {expiring}</span>
        </div>
      </div>

      {/* 一级分类甜甜圈 + 图例 */}
      <div className="mb-5 rounded-3xl border border-petal-100 bg-surface p-5 shadow-card">
        <h2 className="mb-4 text-sm font-semibold text-ink-700">按大类</h2>
        <div className="flex items-center gap-6">
          <svg width="140" height="140" viewBox="0 0 140 140" className="shrink-0">
            <circle cx="70" cy="70" r={r} fill="none" stroke="#f3ecf3" strokeWidth="18" />
            {l1Counts
              .filter((s) => s.count > 0)
              .map((s) => {
                const len = total ? (s.count / total) * circ : 0
                const el = (
                  <circle
                    key={s.tag.id}
                    cx="70"
                    cy="70"
                    r={r}
                    fill="none"
                    stroke={s.tag.color}
                    strokeWidth="18"
                    strokeDasharray={`${len} ${circ - len}`}
                    strokeDashoffset={-offset}
                    transform="rotate(-90 70 70)"
                    strokeLinecap="round"
                  />
                )
                offset += len
                return el
              })}
            <text
              x="70"
              y="66"
              textAnchor="middle"
              className="fill-ink-900"
              fontSize="26"
              fontWeight="700"
            >
              {total}
            </text>
            <text
              x="70"
              y="86"
              textAnchor="middle"
              className="fill-ink-400"
              fontSize="11"
            >
              件
            </text>
          </svg>
          <div className="flex-1 space-y-2">
            {l1Counts.map((s) => (
              <div
                key={s.tag.id}
                className="flex items-center justify-between text-sm"
              >
                <span className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: s.tag.color }}
                  />
                  {s.tag.name}
                </span>
                <span className="font-semibold text-ink-900">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 二级分类条形 */}
      <div className="mb-5 rounded-3xl border border-petal-100 bg-surface p-5 shadow-card">
        <h2 className="mb-4 text-sm font-semibold text-ink-700">按品类</h2>
        <div className="space-y-3">
          {l2Counts.map((s) => (
            <div key={s.tag.id}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-ink-700">{s.tag.name}</span>
                <span className="font-semibold text-ink-900">{s.count}</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-petal-50">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(s.count / maxL2) * 100}%`,
                    backgroundColor: s.tag.color,
                  }}
                />
              </div>
            </div>
          ))}
          {l2Counts.every((s) => s.count === 0) && (
            <p className="text-sm text-ink-400">还没有物品，先去添加吧～</p>
          )}
        </div>
      </div>

      {/* 状态 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { k: '正常', v: status.normal, c: 'from-mint-200 to-mint-300 text-mint-700' },
          { k: '已丢弃', v: status.discarded, c: 'from-ink-100 to-ink-200 text-ink-500' },
          { k: '已消耗', v: status.consumed, c: 'from-butter-300 to-butter-400 text-ink-700' },
        ].map((s) => (
          <div
            key={s.k}
            className={`rounded-2xl bg-gradient-to-br ${s.c} p-4 text-center shadow-card`}
          >
            <p className="text-2xl font-bold tabular-nums">{s.v}</p>
            <p className="mt-0.5 text-xs opacity-80">{s.k}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
