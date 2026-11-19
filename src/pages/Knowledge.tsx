import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { useKnowledgeStore, type KnowledgeFile } from '@/store/useKnowledgeStore'
import { extractText } from '@/lib/textExtract'
import { getFileBlob } from '@/lib/idbFile'
import FileUploadButton from '@/components/FileUploadButton'
import { usePasteUpload } from '@/lib/upload'

dayjs.locale('zh-cn')

function fileIcon(f: KnowledgeFile): string {
  if (f.kind === 'note') return '📝'
  const m = f.mime.toLowerCase()
  const n = f.name.toLowerCase()
  if (m.startsWith('image/')) return '🖼️'
  if (m === 'application/pdf' || n.endsWith('.pdf')) return '📕'
  if (n.endsWith('.doc') || n.endsWith('.docx')) return '📘'
  if (n.endsWith('.xls') || n.endsWith('.xlsx') || m.includes('excel')) return '📗'
  if (n.endsWith('.ppt') || n.endsWith('.pptx')) return '📙'
  if (n.endsWith('.csv')) return '📊'
  return '📄'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function Knowledge() {
  const packs = useKnowledgeStore((s) => s.packs)
  const files = useKnowledgeStore((s) => s.files)
  const addPack = useKnowledgeStore((s) => s.addPack)
  const renamePack = useKnowledgeStore((s) => s.renamePack)
  const removePack = useKnowledgeStore((s) => s.removePack)
  const addFile = useKnowledgeStore((s) => s.addFile)
  const renameFile = useKnowledgeStore((s) => s.renameFile)
  const updateFileText = useKnowledgeStore((s) => s.updateFileText)
  const removeFile = useKnowledgeStore((s) => s.removeFile)

  const [activePack, setActivePack] = useState<string>('all')
  const [uploading, setUploading] = useState(false)

  // 粘贴上传：支持微信复制文件/图片
  usePasteUpload((files) => {
    void handleFiles(files as unknown as FileList)
  })

  const [noteModal, setNoteModal] = useState<{ id?: string; name: string; content: string } | null>(null)
  const [preview, setPreview] = useState<KnowledgeFile | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const packName = (id: string | null) =>
    id ? packs.find((p) => p.id === id)?.name ?? '未分类' : '未分类'

  const filtered = useMemo(() => {
    const list = activePack === 'all' ? files : files.filter((f) => f.packId === activePack)
    return [...list].sort((a, b) => b.createdAt - a.createdAt)
  }, [files, activePack])

  const handleFiles = async (list: FileList | File[] | null) => {
    if (!list || list.length === 0) return
    setUploading(true)
    try {
      for (const file of Array.from(list)) {
        const text = await extractText(file)
        await addFile({
          name: file.name,
          kind: 'file',
          mime: file.type || 'application/octet-stream',
          packId: activePack === 'all' ? null : activePack,
          size: file.size,
          text,
          blob: file,
        })
      }
    } finally {
      setUploading(false)
    }
  }

  const openNote = (f?: KnowledgeFile) =>
    setNoteModal({ id: f?.id, name: f?.name ?? '', content: f?.text ?? '' })

  const saveNote = async () => {
    if (!noteModal) return
    const name = noteModal.name.trim() || '未命名笔记'
    if (noteModal.id) {
      renameFile(noteModal.id, name)
      updateFileText(noteModal.id, noteModal.content)
    } else {
      await addFile({
        name,
        kind: 'note',
        mime: 'text/plain',
        packId: activePack === 'all' ? null : activePack,
        size: noteModal.content.length,
        text: noteModal.content,
      })
    }
    setNoteModal(null)
  }

  const openPreview = async (f: KnowledgeFile) => {
    setPreview(f)
    if (f.kind === 'file' && f.mime.startsWith('image/')) {
      const blob = await getFileBlob(f.id)
      if (blob) setPreviewUrl(URL.createObjectURL(blob))
    }
  }

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreview(null)
    setPreviewUrl(null)
  }

  const doRenamePack = (id: string) => {
    const p = packs.find((x) => x.id === id)
    const v = window.prompt('知识包名称', p?.name ?? '')
    if (v != null) renamePack(id, v)
  }

  const doRenameFile = (f: KnowledgeFile) => {
    const v = window.prompt('文件名称', f.name)
    if (v != null) renameFile(f.id, v)
  }

  const doRemoveFile = (f: KnowledgeFile) => {
    if (window.confirm(`确定删除「${f.name}」？`)) removeFile(f.id)
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">知识库 📚</h1>
          <p className="mt-1 text-sm text-ink-500">存放笔记与各类文件，支持全局搜索检索。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openNote()}
            className="rounded-2xl border border-petal-100 bg-surface px-4 py-2.5 text-sm font-medium text-ink-600 shadow-card transition hover:bg-petal-50"
          >
            ＋ 新建笔记
          </button>
          <button
            type="button"
            onClick={() => {
              const v = window.prompt('知识包名称', '')
              if (v != null && v.trim()) addPack(v.trim())
            }}
            className="rounded-2xl border border-petal-100 bg-surface px-4 py-2.5 text-sm font-medium text-ink-600 shadow-card transition hover:bg-petal-50"
          >
            📁 新建知识包
          </button>
          <FileUploadButton
            accept=".txt,.md,.csv,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*"
            multiple
            disabled={uploading}
            onFiles={handleFiles}
            className="rounded-2xl bg-gradient-to-br from-petal-400 to-petal-500 px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:brightness-105 disabled:opacity-60"
          >
            {uploading ? '处理中…' : '📥 上传文件'}
          </FileUploadButton>
        </div>
      </header>

      {/* 知识包筛选 */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActivePack('all')}
          className={`rounded-full px-3 py-1.5 text-sm transition ${
            activePack === 'all'
              ? 'bg-petal-500 text-white shadow-card'
              : 'bg-surface text-ink-500 ring-1 ring-petal-100 hover:bg-petal-50'
          }`}
        >
          全部
        </button>
        {packs.map((p) => (
          <span
            key={p.id}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm transition ${
              activePack === p.id
                ? 'bg-petal-500 text-white shadow-card'
                : 'bg-surface text-ink-500 ring-1 ring-petal-100 hover:bg-petal-50'
            }`}
          >
            <button type="button" onClick={() => setActivePack(p.id)}>
              📁 {p.name}
            </button>
            <button
              type="button"
              title="重命名"
              onClick={() => doRenamePack(p.id)}
              className="opacity-70 hover:opacity-100"
            >
              ✎
            </button>
            <button
              type="button"
              title="删除知识包（含其中文件）"
              onClick={() => {
                if (window.confirm(`删除知识包「${p.name}」及其下所有文件？`)) removePack(p.id)
              }}
              className="opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      {/* 文件网格 */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-mint-300 bg-surface/60 py-20 text-center shadow-card">
          <div className="mb-3 text-5xl">📚</div>
          <p className="text-sm text-ink-500">
            {files.length === 0 ? '还没有内容，上传文件或写张笔记吧～' : '该分类下暂无内容'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((f) => (
            <div
              key={f.id}
              className="flex flex-col rounded-2xl bg-surface p-4 shadow-card ring-1 ring-petal-100"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{fileIcon(f)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-900" title={f.name}>
                    {f.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-400">
                    {packName(f.packId)} · {dayjs(f.createdAt).format('MM-DD HH:mm')}
                    {f.size > 0 && ` · ${formatSize(f.size)}`}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {f.kind === 'note' ? (
                  <button
                    type="button"
                    onClick={() => openNote(f)}
                    className="rounded-lg bg-petal-50 px-2.5 py-1 text-xs text-petal-700 transition hover:bg-petal-100"
                  >
                    编辑
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => openPreview(f)}
                    className="rounded-lg bg-petal-50 px-2.5 py-1 text-xs text-petal-700 transition hover:bg-petal-100"
                  >
                    预览/下载
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => doRenameFile(f)}
                  className="rounded-lg px-2.5 py-1 text-xs text-ink-500 transition hover:bg-cream-deep"
                >
                  重命名
                </button>
                <button
                  type="button"
                  onClick={() => doRemoveFile(f)}
                  className="rounded-lg px-2.5 py-1 text-xs text-ink-500 transition hover:bg-red-50 hover:text-red-500"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 笔记编辑弹窗 */}
      {noteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/25 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setNoteModal(null)
          }}
        >
          <div className="w-full max-w-lg rounded-3xl bg-surface p-5 shadow-soft ring-1 ring-petal-100">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-widest text-ink-400">
                {noteModal.id ? '编辑笔记' : '新建笔记'}
              </p>
              <button
                type="button"
                onClick={() => setNoteModal(null)}
                className="rounded-lg px-2 py-1 text-sm text-ink-400 hover:bg-petal-50 hover:text-ink-700"
              >
                ✕
              </button>
            </div>
            <input
              value={noteModal.name}
              onChange={(e) => setNoteModal({ ...noteModal, name: e.target.value })}
              placeholder="笔记标题"
              className="mb-2 w-full rounded-xl border border-petal-100 bg-cream/40 px-3 py-2 text-sm outline-none focus:border-petal-400"
            />
            <textarea
              value={noteModal.content}
              onChange={(e) => setNoteModal({ ...noteModal, content: e.target.value })}
              rows={8}
              placeholder="写点什么…"
              className="w-full resize-none rounded-xl border border-petal-100 bg-cream/40 p-3 text-sm leading-relaxed text-ink-700 outline-none focus:border-petal-400"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNoteModal(null)}
                className="rounded-xl border border-petal-100 bg-surface px-4 py-2 text-sm font-medium text-ink-500 hover:bg-petal-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={saveNote}
                className="rounded-xl bg-gradient-to-br from-petal-400 to-petal-500 px-5 py-2 text-sm font-semibold text-white shadow-card hover:brightness-105"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 文件预览/下载弹窗 */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/25 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) closePreview()
          }}
        >
          <div className="w-full max-w-lg rounded-3xl bg-surface p-5 shadow-soft ring-1 ring-petal-100">
            <div className="mb-3 flex items-center justify-between">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-900" title={preview.name}>
                {preview.name}
              </p>
              <button
                type="button"
                onClick={closePreview}
                className="rounded-lg px-2 py-1 text-sm text-ink-400 hover:bg-petal-50 hover:text-ink-700"
              >
                ✕
              </button>
            </div>
            {preview.kind === 'file' && previewUrl ? (
              <img src={previewUrl} alt={preview.name} className="max-h-[50vh] w-full rounded-xl object-contain" />
            ) : preview.kind === 'file' ? (
              <div className="py-6 text-center text-sm text-ink-400">该文件类型暂不支持内联预览，可下载查看。</div>
            ) : (
              <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-xl bg-cream/40 p-3 text-sm leading-relaxed text-ink-700">
                {preview.text || '（空笔记）'}
              </pre>
            )}
            {preview.kind === 'file' && (
              <div className="mt-4 flex justify-end">
                <a
                  href="#"
                  onClick={async (e) => {
                    e.preventDefault()
                    const blob = await getFileBlob(preview.id)
                    if (!blob) return
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = preview.name
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                  className="rounded-xl bg-gradient-to-br from-petal-400 to-petal-500 px-5 py-2 text-sm font-semibold text-white shadow-card hover:brightness-105"
                >
                  ⬇️ 下载
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
