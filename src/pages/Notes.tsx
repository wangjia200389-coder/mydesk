import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { useNotesStore, type Note } from '@/store/useNotesStore'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'

/** 内容是否长到需要折叠：超 80 字或多于 3 行 */
function isLongNote(n: Note) {
  return n.content.length > 80 || n.content.split('\n').length > 3
}

dayjs.locale('zh-cn')

function formatTime(ts: number) {
  const diff = Date.now() - ts
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`
  const d = dayjs(ts)
  return dayjs().isSame(d, 'day')
    ? d.format('HH:mm')
    : d.format('MM-DD HH:mm')
}

function isBlank(n: Note | { title: string; content: string }) {
  return !n.title.trim() && !n.content.trim()
}

export default function Notes() {
  const notes = useNotesStore((s) => s.notes)
  const addNote = useNotesStore((s) => s.addNote)
  const updateNote = useNotesStore((s) => s.updateNote)
  const removeNote = useNotesStore((s) => s.removeNote)
  const toggleCollapse = useNotesStore((s) => s.toggleCollapse)
  const setAllCollapsed = useNotesStore((s) => s.setAllCollapsed)
  const togglePin = useNotesStore((s) => s.togglePin)

  const allCollapsed =
    notes.length > 0 && notes.every((n) => n.collapsed)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [creating, setCreating] = useState(false)

  // 语音转文字
  const [interimText, setInterimText] = useState('')
  const [micError, setMicError] = useState<string | null>(null)
  const speech = useSpeechRecognition({
    lang: 'zh-CN',
    onResult: (text) => {
      setDraftContent((prev) => (prev ? prev + text : text))
    },
    onInterim: setInterimText,
    onError: (msg) => {
      setMicError(msg)
      setInterimText('')
    },
    onEnd: () => setInterimText(''),
  })
  const toggleMic = () => {
    if (speech.listening) {
      speech.stop()
    } else {
      setInterimText('')
      setMicError(null)
      speech.start()
    }
  }

  const sorted = useMemo(
    () =>
      [...notes].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        return b.updatedAt - a.updatedAt
      }),
    [notes],
  )

  const openNew = () => {
    setCreating(true)
    setEditingId(null)
    setDraftTitle('')
    setDraftContent('')
  }

  const openEdit = (n: Note) => {
    setCreating(false)
    setEditingId(n.id)
    setDraftTitle(n.title)
    setDraftContent(n.content)
  }

  const closeModal = () => {
    speech.stop()
    setCreating(false)
    setEditingId(null)
    setInterimText('')
    setMicError(null)
  }

  const save = () => {
    if (creating) {
      if (isBlank({ title: draftTitle, content: draftContent })) {
        closeModal()
        return
      }
      addNote({ title: draftTitle, content: draftContent })
    } else if (editingId) {
      updateNote(editingId, {
        title: draftTitle,
        content: draftContent,
      })
    }
    closeModal()
  }

  const onRemove = (id: string) => {
    if (!window.confirm('确定要删除这张便签吗？')) return
    removeNote(id)
    if (editingId === id) closeModal()
  }

  const modalOpen = creating || !!editingId

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink-900">便签 🗒️</h1>
          <p className="mt-2 text-sm text-ink-500">
            把灵感、待记和小事贴在小桌面上，随手可写。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {notes.length > 0 && (
            <button
              type="button"
              onClick={() => setAllCollapsed(!allCollapsed)}
              title={allCollapsed ? '全部展开' : '全部折叠'}
              className="rounded-2xl border border-petal-100 bg-surface px-4 py-3 text-sm font-medium text-ink-500 shadow-card transition hover:bg-petal-50 hover:text-ink-700 active:scale-95"
            >
              {allCollapsed ? '⊞ 全部展开' : '⊟ 全部折叠'}
            </button>
          )}
          <button
            type="button"
            onClick={openNew}
            className="rounded-2xl bg-gradient-to-br from-petal-400 to-petal-500 px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:brightness-105 active:scale-95"
          >
            + 新建便签
          </button>
        </div>
      </header>

      {/* 网格 */}
      {sorted.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sorted.map((n) => {
            const blank = isBlank(n)
            const collapsed = n.collapsed ?? false
            const long = isLongNote(n)
            return (
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                onClick={() => openEdit(n)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openEdit(n)
                  }
                }}
                className="group relative flex cursor-pointer flex-col rounded-2xl bg-surface p-4 shadow-card ring-1 ring-petal-100 transition hover:-translate-y-0.5 hover:shadow-soft"
              >
                <div className="mb-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      togglePin(n.id)
                    }}
                    title={n.pinned ? '取消置顶' : '置顶'}
                    className={`rounded-full p-1 text-xs transition ${
                      n.pinned
                        ? 'bg-petal-100 text-petal-600'
                        : 'text-ink-300 opacity-0 group-hover:opacity-100 hover:text-petal-500'
                    }`}
                  >
                    {n.pinned ? '📌' : '📍'}
                  </button>
                  <span className="text-[11px] text-ink-400">
                    {formatTime(n.updatedAt)}
                  </span>
                </div>
                <h3 className={`line-clamp-2 text-base font-semibold text-ink-900 ${blank ? 'italic opacity-60' : ''}`}>
                  {n.title}
                </h3>
                <div className="relative flex-1">
                  <p
                    className={`mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-700 ${
                      collapsed ? 'line-clamp-3' : ''
                    } ${blank ? 'italic opacity-60' : ''}`}
                  >
                    {n.content || '（空白便签）'}
                  </p>
                  {collapsed && long && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-white/70 to-transparent" />
                  )}
                </div>
                {long && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleCollapse(n.id)
                    }}
                    className="mt-1 self-start rounded-lg px-2 py-0.5 text-xs text-ink-400 transition hover:bg-white/60 hover:text-petal-600"
                  >
                    {collapsed ? '展开 ▾' : '收起 ▴'}
                  </button>
                )}
                <div className="mt-3 flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      openEdit(n)
                    }}
                    className="rounded-lg px-2 py-1 text-xs text-ink-500 transition hover:bg-white/60 hover:text-ink-700"
                  >
                    ✏️ 编辑
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemove(n.id)
                    }}
                    className="rounded-lg px-2 py-1 text-xs text-ink-500 transition hover:bg-white/60 hover:text-petal-600"
                  >
                    🗑️ 删除
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-mint-300 bg-surface/60 py-20 text-center shadow-card">
          <div className="mb-3 text-5xl">🗒️</div>
          <p className="text-sm text-ink-500">还没有便签，点右上角写一张吧～</p>
        </div>
      )}

      {/* 新建/编辑 浮层 */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/25 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal()
          }}
        >
          <div className="w-full max-w-lg rounded-3xl bg-surface p-5 shadow-soft ring-1 ring-petal-100">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-widest text-ink-400">
                {creating ? '新建便签' : '编辑便签'}
              </p>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg px-2 py-1 text-sm text-ink-400 hover:bg-white/60 hover:text-ink-700"
              >
                ✕
              </button>
            </div>

            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="标题（可留空）"
              className="w-full border-b border-ink-400/20 bg-transparent pb-2 text-lg font-semibold text-ink-900 placeholder:text-ink-400/70 outline-none"
            />
            {/* 语音转文字 */}
            <div className="mt-3">
              <div className="mb-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleMic}
                  title={speech.listening ? '停止录音' : '语音转文字'}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium shadow-card transition ${
                    speech.listening
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'bg-surface text-ink-600 ring-1 ring-petal-100 hover:bg-petal-50'
                  }`}
                >
                  {speech.listening ? '🔴 停止' : '🎤 语音'}
                </button>
                {speech.listening && (
                  <span className="animate-pulse text-xs text-petal-600">聆听中…</span>
                )}
                {!speech.supported && (
                  <span className="text-xs text-ink-400">当前浏览器不支持语音识别</span>
                )}
              </div>
              {micError && <p className="mb-2 text-xs text-red-500">{micError}</p>}
            </div>

            <textarea
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              rows={8}
              placeholder="写下点什么～（也可点「🎤 语音」直接说）"
              className="mt-1 w-full resize-none rounded-xl bg-white/50 p-3 text-sm leading-relaxed text-ink-700 placeholder:text-ink-400/70 outline-none ring-1 ring-inset ring-ink-400/10 focus:ring-petal-300"
            />
            {interimText && (
              <p className="mt-1 text-xs text-ink-400">识别中：{interimText}</p>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border border-petal-100 bg-surface px-4 py-2 text-sm font-medium text-ink-500 hover:bg-petal-50 hover:text-ink-700"
              >
                取消
              </button>
              <button
                type="button"
                onClick={save}
                className="rounded-xl bg-gradient-to-br from-petal-400 to-petal-500 px-5 py-2 text-sm font-semibold text-white shadow-card hover:brightness-105 active:scale-95"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
