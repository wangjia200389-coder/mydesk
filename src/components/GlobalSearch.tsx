import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUIStore } from '@/store/useUIStore'
import { searchAll, type SearchResult } from '@/lib/searchService'

function useDebouncedValue<T>(value: T, delay = 200) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(t)
  }, [value, delay])
  return debounced
}

/** 全局搜索弹窗：从各模块 store 聚合数据，输入即搜，结果按模块分组，点击跳转。 */
export default function GlobalSearch() {
  const open = useUIStore((s) => s.searchOpen)
  const setOpen = useUIStore((s) => s.setSearchOpen)
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const debouncedQ = useDebouncedValue(q, 200)

  useEffect(() => {
    if (open) {
      setQ('')
      const t = window.setTimeout(() => inputRef.current?.focus(), 50)
      return () => window.clearTimeout(t)
    }
  }, [open])

  const results = useMemo(() => (open ? searchAll(debouncedQ) : []), [open, debouncedQ])

  const grouped = useMemo(() => {
    const map = new Map<string, SearchResult[]>()
    for (const r of results) {
      if (!map.has(r.module)) map.set(r.module, [])
      map.get(r.module)!.push(r)
    }
    return Array.from(map.entries())
  }, [results])

  if (!open) return null

  const go = (to: string) => {
    setOpen(false)
    navigate(to)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-ink-900/30 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl rounded-3xl bg-surface shadow-soft ring-1 ring-petal-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 搜索框 */}
        <div className="flex items-center gap-2 border-b border-petal-100 px-4 py-3">
          <span className="text-lg">🔍</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
            }}
            placeholder="搜索待办、便签、物品、作业、课程、知识库…"
            className="flex-1 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-ink-400 hover:text-ink-700"
          >
            ✕
          </button>
        </div>

        {/* 结果 */}
        <div className="max-h-[55vh] overflow-y-auto p-2">
          {q.trim() === '' ? (
            <p className="px-3 py-8 text-center text-sm text-ink-400">输入关键词，跨模块即时搜索</p>
          ) : grouped.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-ink-400">
              没有匹配「{q}」的内容
            </p>
          ) : (
            grouped.map(([module, items]) => (
              <div key={module} className="mb-1">
                <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                  {module}
                </p>
                {items.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => go(r.to)}
                    className="flex w-full flex-col items-start rounded-xl px-3 py-2 text-left transition hover:bg-petal-50"
                  >
                    <span className="truncate text-sm font-medium text-ink-800">{r.title}</span>
                    {r.snippet && (
                      <span className="mt-0.5 line-clamp-1 text-xs text-ink-400">{r.snippet}</span>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
