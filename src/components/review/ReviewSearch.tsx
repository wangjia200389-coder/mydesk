import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import type { ReviewDay } from '@/store/useReviewStore'

dayjs.locale('zh-cn')

interface Props {
  days: ReviewDay[]
  onPick: (date: string, fieldId?: string) => void
  onClose: () => void
}

interface Hit {
  key: string
  date: string
  /** 命中的是某条复盘点时，带上它的 id 用于定位 */
  fieldId?: string
  label: string
  snippet: string
  kind: 'field' | 'file'
}

/** 取命中位置前后一小段，避免整段文字铺满结果列表 */
function excerpt(text: string, q: string, radius = 16) {
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return ''
  const start = Math.max(0, i - radius)
  const end = Math.min(text.length, i + q.length + radius)
  const body = text.slice(start, end).replace(/\s+/g, ' ')
  return `${start > 0 ? '…' : ''}${body}${end < text.length ? '…' : ''}`
}

function Highlight({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0 || !q) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-petal-100 px-0.5 text-petal-600">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  )
}

/** 复盘搜索：只搜文字内容和文件名，命中后跳到那一天 */
export default function ReviewSearch({ days, onPick, onClose }: Props) {
  const [q, setQ] = useState('')
  const query = q.trim()

  const hits = useMemo<Hit[]>(() => {
    if (!query) return []
    const needle = query.toLowerCase()
    const out: Hit[] = []
    const sorted = [...days].sort((a, b) => (a.date < b.date ? 1 : -1))

    for (const d of sorted) {
      for (const f of d.fields) {
        const inLabel = f.label.toLowerCase().includes(needle)
        const inValue = f.value.toLowerCase().includes(needle)
        if (!inLabel && !inValue) continue
        out.push({
          key: `${d.date}-${f.id}`,
          date: d.date,
          fieldId: f.id,
          label: f.label || '未命名',
          snippet: inValue ? excerpt(f.value, query) : '',
          kind: 'field',
        })
      }
      for (const file of d.files ?? []) {
        if (!file.name.toLowerCase().includes(needle)) continue
        out.push({
          key: `${d.date}-${file.id}`,
          date: d.date,
          label: file.name,
          snippet: '',
          kind: 'file',
        })
      }
    }
    return out.slice(0, 60)
  }, [days, query])

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-surface">
      <div className="safe-top mx-auto max-w-2xl px-5 pb-10 pt-4 md:px-8">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-cream/70 px-3.5 py-2.5">
            <span className="shrink-0 text-sm text-ink-400">🔍</span>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜复盘内容、文件名"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400/60"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                title="清空"
                className="shrink-0 text-xs text-ink-400/60 transition hover:text-ink-700"
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-xs text-ink-400 transition hover:text-ink-700"
          >
            取消
          </button>
        </div>

        {!query ? (
          <p className="mt-6 text-xs leading-relaxed text-ink-400/70">
            输入几个字，会在所有复盘的问题、回答和文件名里找。点结果直接跳到那天。
          </p>
        ) : hits.length === 0 ? (
          <p className="mt-6 text-xs text-ink-400/70">没有找到「{query}」</p>
        ) : (
          <>
            <div className="mt-4 text-[11px] text-ink-400/70">找到 {hits.length} 条</div>
            <div className="mt-1">
              {hits.map((h) => (
                <button
                  key={h.key}
                  type="button"
                  onClick={() => onPick(h.date, h.fieldId)}
                  className="flex w-full items-baseline gap-3 border-b border-petal-50 py-3 text-left transition hover:bg-cream/40"
                >
                  <span className="w-14 shrink-0 text-[11px] text-ink-400">
                    {dayjs(h.date).format('MM-DD')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink-700">
                      {h.kind === 'file' && <span className="mr-1">📄</span>}
                      <Highlight text={h.label} q={query} />
                    </span>
                    {h.snippet && (
                      <span className="mt-0.5 block truncate text-xs text-ink-400">
                        <Highlight text={h.snippet} q={query} />
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
