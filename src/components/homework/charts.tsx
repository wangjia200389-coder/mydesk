/* 轻量图表组件：纯 SVG / CSS 实现，不引入外部图表库，保持包体精简。 */

const CHART_COLORS = [
  '#a78bfa',
  '#54bd9b',
  '#ff8da1',
  '#6aa6ff',
  '#f0b85a',
  '#ff9e7a',
  '#9be0c3',
  '#c9a27e',
]

export function pickColor(i: number): string {
  return CHART_COLORS[i % CHART_COLORS.length]!
}

/* ------------------------------------------------------------------ */
/* 柱状图（CSS 实现，响应式）                                          */
/* ------------------------------------------------------------------ */

export interface BarDatum {
  label: string
  value: number
  color?: string
}

export function BarChart({
  data,
  unit = '',
  height = 150,
}: {
  data: BarDatum[]
  unit?: string
  height?: number
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d, i) => {
        const h = Math.max(4, Math.round((d.value / max) * (height - 44)))
        return (
          <div key={`${d.label}-${i}`} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-[11px] font-semibold text-ink-700">
              {d.value}
              {unit}
            </span>
            <div
              className="w-full max-w-[52px] rounded-t-md transition-all"
              style={{ height: h, backgroundColor: d.color ?? pickColor(i) }}
              title={`${d.label}: ${d.value}${unit}`}
            />
            <span className="w-full truncate text-center text-[10px] text-ink-400">{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 环形图（SVG）                                                        */
/* ------------------------------------------------------------------ */

export interface DonutDatum {
  label: string
  value: number
  color: string
}

export function DonutChart({
  data,
  size = 150,
  thickness = 26,
  centerLabel = '',
}: {
  data: DonutDatum[]
  size?: number
  thickness?: number
  centerLabel?: string
}) {
  const total = data.reduce((a, b) => a + b.value, 0)
  if (total <= 0) {
    return <div className="py-8 text-center text-xs text-ink-400">暂无数据</div>
  }

  const cx = size / 2
  const cy = size / 2
  const r = (size - thickness) / 2

  let acc = 0
  const segments = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const start = (acc / total) * 2 * Math.PI - Math.PI / 2
      acc += d.value
      const end = (acc / total) * 2 * Math.PI - Math.PI / 2
      return { ...d, start, end }
    })

  const arc = (s: number, e: number) => {
    const large = e - s > Math.PI ? 1 : 0
    const x1 = cx + r * Math.cos(s)
    const y1 = cy + r * Math.sin(s)
    const x2 = cx + r * Math.cos(e)
    const y2 = cy + r * Math.sin(e)
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`
  }

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        {segments.map((s) => (
          <path key={s.label} d={arc(s.start, s.end)} fill={s.color} />
        ))}
        <circle cx={cx} cy={cy} r={r - thickness / 2} fill="#ffffff" />
        {centerLabel && (
          <text
            x={cx}
            y={cy + 4}
            textAnchor="middle"
            fontSize={size * 0.11}
            fontWeight={700}
            fill="#4a4055"
          >
            {centerLabel}
          </text>
        )}
      </svg>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {data.map((d) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0
          return (
            <div key={d.label} className="flex items-center gap-2 text-xs">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: d.color }}
              />
              <span className="text-ink-600">{d.label}</span>
              <span className="ml-auto font-medium text-ink-700">{d.value}</span>
              <span className="w-9 text-right text-ink-400">{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 折线图（SVG，用于成绩发展曲线）                                     */
/* ------------------------------------------------------------------ */

export interface LinePoint {
  x: string
  y: number
}

export function LineChart({
  points,
  width = 340,
  height = 190,
  unit = '',
  color = '#a78bfa',
}: {
  points: LinePoint[]
  width?: number
  height?: number
  unit?: string
  color?: string
}) {
  if (points.length === 0) {
    return <div className="py-8 text-center text-xs text-ink-400">暂无数据</div>
  }

  const padX = 34
  const padTop = 16
  const padBottom = 30
  const innerW = width - padX * 2
  const innerH = height - padTop - padBottom

  const ys = points.map((p) => p.y)
  let min = Math.min(...ys)
  let max = Math.max(...ys)
  if (min === max) {
    min -= 1
    max += 1
  }
  const range = max - min

  const xFor = (i: number) =>
    points.length <= 1 ? padX + innerW / 2 : padX + (i / (points.length - 1)) * innerW
  const yFor = (y: number) => padTop + (1 - (y - min) / range) * innerH

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.y)}`).join(' ')

  // y 轴刻度（4 段）
  const ticks = [0, 1, 2, 3, 4].map((t) => max - (range / 4) * t)

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {/* 网格线 + y 刻度 */}
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={padX}
            y1={yFor(t)}
            x2={width - padX}
            y2={yFor(t)}
            stroke="#f1e6f7"
            strokeWidth={1}
          />
          <text
            x={padX - 6}
            y={yFor(t) + 3}
            textAnchor="end"
            fontSize={10}
            fill="#9aa0a6"
          >
            {Number(t.toFixed(1))}
          </text>
        </g>
      ))}

      {/* 折线 */}
      <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

      {/* 数据点 + x 标签 */}
      {points.map((p, i) => (
        <g key={`${p.x}-${i}`}>
          <circle cx={xFor(i)} cy={yFor(p.y)} r={4} fill="#fff" stroke={color} strokeWidth={2.5} />
          <text
            x={xFor(i)}
            y={yFor(p.y) - 9}
            textAnchor="middle"
            fontSize={10}
            fontWeight={600}
            fill="#4a4055"
          >
            {p.y}
            {unit}
          </text>
          <text
            x={xFor(i)}
            y={height - 10}
            textAnchor="middle"
            fontSize={10}
            fill="#9aa0a6"
          >
            {p.x}
          </text>
        </g>
      ))}
    </svg>
  )
}
