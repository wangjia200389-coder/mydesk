import { useMemo, useState } from 'react'
import type { HomeworkStudent } from '@/lib/homework'
import { parseScoreExcel, type ScoreRow } from '@/lib/excel'
import FileUploadButton from '@/components/FileUploadButton'

/**
 * 批量录入分数弹窗：
 *  1. 粘贴「姓名 分数」文本（每行一人，空格/逗号/Tab 分隔均可）；
 *  2. 或上传微信/QQ 导出的 Excel（姓名 + 分数两列）；
 *  自动按姓名匹配班级名单，预览后一键应用。
 */
export default function ScoreImportModal({
  students,
  onApply,
  onClose,
}: {
  students: HomeworkStudent[]
  onApply: (map: Record<string, number | null>) => void
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [rows, setRows] = useState<ScoreRow[]>([])
  const [importing, setImporting] = useState(false)

  /** 解析粘贴文本为 姓名/分数 行 */
  const parsed = useMemo<ScoreRow[]>(() => {
    if (rows.length > 0) return rows
    const out: ScoreRow[] = []
    const seen = new Set<string>()
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim()
      if (!t) continue
      // 支持 空格 / 逗号 / Tab 分隔
      const parts = t.split(/[\t,，\s]+/)
      const name = parts[0]?.trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const raw = parts[1]
      let score: number | null = null
      if (raw != null && raw.trim() !== '') {
        const n = Number(raw)
        if (!Number.isNaN(n)) score = n
      }
      out.push({ name, score })
    }
    return out
  }, [text, rows])

  /** 按姓名匹配班级名单（大小写不敏感、精确匹配） */
  const matchResult = useMemo(() => {
    const byName = new Map(students.map((s) => [s.name.toLowerCase(), s.id]))
    const map: Record<string, number | null> = {}
    const matched: ScoreRow[] = []
    const unmatched: string[] = []
    for (const r of parsed) {
      const id = byName.get(r.name.toLowerCase())
      if (id) {
        map[id] = r.score
        matched.push(r)
      } else {
        unmatched.push(r.name)
      }
    }
    return { map, matched, unmatched }
  }, [parsed, students])

  const onExcel = async (files: File[]) => {
    const f = files[0]
    if (!f) return
    setImporting(true)
    try {
      const r = await parseScoreExcel(f)
      setRows(r)
      setText('')
    } catch {
      setRows([])
    } finally {
      setImporting(false)
    }
  }

  const clearAll = () => {
    setText('')
    setRows([])
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="scroll-soft max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-soft sm:max-w-md sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-ink-900">批量录入分数</h3>
            <p className="mt-0.5 text-xs text-ink-400">
              粘贴「姓名 分数」或上传 Excel，自动匹配班级名单
            </p>
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

        {/* 粘贴区 */}
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setRows([])
          }}
          rows={6}
          placeholder={'每行一人，例如：\n张三 95\n李四 88\n王五 76'}
          className="scroll-soft w-full rounded-xl border border-petal-100 bg-cream/60 px-3 py-2.5 text-sm text-ink-900 outline-none transition-colors focus:border-petal-400"
        />

        {/* 操作行 */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <FileUploadButton
            accept=".xlsx,.xls"
            onFiles={onExcel}
            showWeChatTip={false}
            className="rounded-xl border border-petal-100 bg-surface px-3 py-2 text-sm font-medium text-ink-600 transition hover:bg-petal-50"
          >
            {importing ? '解析中…' : '📥 从 Excel 导入'}
          </FileUploadButton>
          {(text || rows.length > 0) && (
            <button
              type="button"
              onClick={clearAll}
              className="rounded-xl px-3 py-2 text-sm text-ink-400 transition hover:text-ink-700"
            >
              清空
            </button>
          )}
        </div>

        {/* 预览 */}
        {(parsed.length > 0 || matchResult.matched.length > 0) && (
          <div className="mt-4 rounded-xl bg-cream/50 p-3 text-xs">
            <div className="flex items-center gap-3 text-ink-500">
              <span>
                解析 {parsed.length} 条 · 匹配{' '}
                <span className="font-semibold text-mint-700">{matchResult.matched.length}</span> 人
              </span>
              {matchResult.unmatched.length > 0 && (
                <span className="text-petal-600">
                  未匹配 {matchResult.unmatched.length} 人
                </span>
              )}
            </div>
            {matchResult.unmatched.length > 0 && (
              <p className="mt-1.5 break-words text-ink-400">
                未匹配：{matchResult.unmatched.slice(0, 20).join('、')}
                {matchResult.unmatched.length > 20 ? '…' : ''}
              </p>
            )}
            {matchResult.matched.length > 0 && (
              <div className="mt-2 flex max-h-28 flex-col gap-0.5 overflow-y-auto">
                {matchResult.matched.map((r, i) => (
                  <div key={`${r.name}-${i}`} className="flex justify-between px-1 py-0.5">
                    <span className="text-ink-700">{r.name}</span>
                    <span className="font-semibold text-lavender-700">
                      {r.score != null ? r.score : '未录入'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 底部 */}
        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-petal-100 bg-surface px-5 py-2 text-sm font-medium text-ink-500 transition hover:bg-petal-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onApply(matchResult.map)}
            disabled={matchResult.matched.length === 0}
            className="rounded-full bg-petal-500 px-6 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-petal-600 disabled:opacity-50"
          >
            应用 {matchResult.matched.length > 0 ? `(${matchResult.matched.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
