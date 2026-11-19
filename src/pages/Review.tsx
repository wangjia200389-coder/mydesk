import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { v4 as uuidv4 } from 'uuid'
import FileUploadButton from '@/components/FileUploadButton'
import Lightbox from '@/components/items/Lightbox'
import ReviewCalendar from '@/components/review/ReviewCalendar'
import ReviewSearch from '@/components/review/ReviewSearch'
import { usePhoto } from '@/hooks/usePhoto'
import { compressImageFile, deletePhoto, savePhoto } from '@/lib/photo'
import { delFileBlob, getFileBlob, putFileBlob } from '@/lib/idbFile'
import {
  REVIEW_DATE_FMT,
  formatDuration,
  formatSize,
  sleepMinutes,
} from '@/lib/reviewUtils'
import {
  DEFAULT_REVIEW_TEMPLATE,
  makeReviewDay,
  reviewHasContent,
  useReviewStore,
  type ReviewDay,
  type ReviewFile,
} from '@/store/useReviewStore'

dayjs.locale('zh-cn')

const DATE_FMT = REVIEW_DATE_FMT
/** 单个附件上限：超了不同步（同步层按 dataUrl 长度限制），也避免手机内存吃紧 */
const MAX_FILE_SIZE = 5 * 1024 * 1024

/* 右上角入口图标：内联 SVG，跟项目其他地方保持一致，不引图标库 */

function IconSearch({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M16.4 16.4 21 21" />
    </svg>
  )
}

function IconChart({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M5 20v-5M12 20V7M19 20v-9" />
      <path d="M3 20h18" />
    </svg>
  )
}

function IconList({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M4 12h16M4 17h11" />
    </svg>
  )
}

function IconPlus({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

/** 内容自适应高度的输入框（无边框，像纸上的文字） */
function AutoTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="block w-full resize-none bg-transparent text-[16px] leading-7 text-ink-900 outline-none placeholder:text-ink-400/45"
    />
  )
}

/** 整篇插图：全宽、无边框 */
function ReviewImage({ photoId }: { photoId: string }) {
  const url = usePhoto(photoId)
  if (!url) {
    return (
      <div className="flex h-44 w-full items-center justify-center bg-cream-deep/40 text-2xl text-petal-300">
        🖼️
      </div>
    )
  }
  return <img src={url} alt="" className="max-h-[70vh] w-full object-cover" />
}

export default function Review() {
  const navigate = useNavigate()
  const days = useReviewStore((s) => s.days)
  const template = useReviewStore((s) => s.template)
  const upsertDay = useReviewStore((s) => s.upsertDay)
  const removeDay = useReviewStore((s) => s.removeDay)
  const setTemplate = useReviewStore((s) => s.setTemplate)

  const today = dayjs().format(DATE_FMT)
  const [date, setDate] = useState(today)

  const findDay = (d: string): ReviewDay | null => {
    const exist = days.find((x) => x.date === d)
    return exist
      ? {
          ...exist,
          fields: exist.fields.map((f) => ({ ...f })),
          photoIds: [...(exist.photoIds ?? [])],
          files: [...(exist.files ?? [])],
        }
      : null
  }

  const [draft, setDraft] = useState<ReviewDay>(
    () => findDay(today) ?? makeReviewDay(today, template),
  )
  const [saved, setSaved] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [tpl, setTpl] = useState<{ id: string; label: string }[]>([])
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null)
  const [attachBusy, setAttachBusy] = useState(false)
  const [calOpen, setCalOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [flashField, setFlashField] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const saveTimer = useRef<number | undefined>(undefined)
  const pendingRef = useRef<ReviewDay | null>(null)
  // 异步操作（压缩图片/写 IndexedDB）回来时，以这里的最新值为准，避免覆盖掉期间的输入
  const draftRef = useRef(draft)
  draftRef.current = draft

  /** 切日期：取当天记录，没有就给一份模板草稿 */
  const daysRef = useRef(days)
  daysRef.current = days
  const templateRef = useRef(template)
  templateRef.current = template

  /** 把还在 400ms 等待中的编辑立刻落盘（切日期/离开页面时用，避免丢最后几个字） */
  const flushPending = () => {
    window.clearTimeout(saveTimer.current)
    const p = pendingRef.current
    if (!p) return
    pendingRef.current = null
    if (reviewHasContent(p)) upsertDay(p)
  }

  const goDate = (d: string) => {
    if (d === date) return
    flushPending()
    const exist = daysRef.current.find((x) => x.date === d)
    setDraft(
      exist
        ? {
            ...exist,
            fields: exist.fields.map((f) => ({ ...f })),
            photoIds: [...(exist.photoIds ?? [])],
            files: [...(exist.files ?? [])],
          }
        : makeReviewDay(d, templateRef.current),
    )
    setDate(d)
    setSaved(false)
  }

  /** 从搜索/日历跳过来：关掉浮层，命中某条时滚过去并闪一下 */
  const jumpTo = (d: string, fieldId?: string) => {
    goDate(d)
    setSearchOpen(false)
    setCalOpen(false)
    if (!fieldId) return
    setFlashField(fieldId)
    window.setTimeout(() => {
      document
        .getElementById(`review-field-${fieldId}`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 260)
    window.setTimeout(() => setFlashField(null), 2400)
  }

  const markedDates = useMemo(() => new Set(days.map((d) => d.date)), [days])

  /** 所有编辑都走这里：更新界面 + 400ms 后落盘 */
  const scheduleSave = (next: ReviewDay) => {
    setDraft(next)
    pendingRef.current = next
    window.clearTimeout(saveTimer.current)

    if (!reviewHasContent(next)) {
      pendingRef.current = null
      removeDay(next.date)
      setSaved(false)
      return
    }
    saveTimer.current = window.setTimeout(() => {
      const p = pendingRef.current
      if (!p) return
      pendingRef.current = null
      upsertDay(p)
      setSaved(true)
    }, 400)
  }

  const patch = (p: Partial<ReviewDay>) => scheduleSave({ ...draftRef.current, ...p })

  const updateField = (id: string, p: { label?: string; value?: string }) =>
    patch({
      fields: draftRef.current.fields.map((f) => (f.id === id ? { ...f, ...p } : f)),
    })

  const addField = () =>
    patch({
      fields: [...draftRef.current.fields, { id: uuidv4(), label: '', value: '' }],
    })

  const removeField = (id: string) =>
    patch({ fields: draftRef.current.fields.filter((f) => f.id !== id) })

  /* ---------------- 当天附件 ---------------- */

  const addImages = async (list: File[]) => {
    const imgs = list.filter((f) => f.type.startsWith('image/'))
    if (!imgs.length) return
    setAttachBusy(true)
    const ids: string[] = []
    try {
      for (const file of imgs) {
        try {
          const dataUrl = await compressImageFile(file, 1200, 0.8)
          ids.push(await savePhoto(dataUrl))
        } catch {
          /* 单张失败就跳过，不影响其他 */
        }
      }
      if (ids.length) {
        const cur = draftRef.current
        patch({ photoIds: [...(cur.photoIds ?? []), ...ids] })
      }
    } finally {
      setAttachBusy(false)
    }
  }

  const addFiles = async (list: File[]) => {
    if (!list.length) return
    setAttachBusy(true)
    const ok: ReviewFile[] = []
    try {
      for (const file of list) {
        if (file.size > MAX_FILE_SIZE) {
          window.alert(`「${file.name}」超过 5MB，换个小一点的吧`)
          continue
        }
        const id = `rf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
        try {
          await putFileBlob(id, file)
          ok.push({ id, name: file.name, size: file.size })
        } catch {
          window.alert(`「${file.name}」保存失败`)
        }
      }
      if (ok.length) {
        const cur = draftRef.current
        patch({ files: [...(cur.files ?? []), ...ok] })
      }
    } finally {
      setAttachBusy(false)
    }
  }

  const removeImage = (photoId: string) => {
    deletePhoto(photoId).catch(() => {})
    patch({ photoIds: (draftRef.current.photoIds ?? []).filter((x) => x !== photoId) })
  }

  const removeFile = (fileId: string) => {
    delFileBlob(fileId).catch(() => {})
    patch({ files: (draftRef.current.files ?? []).filter((x) => x.id !== fileId) })
  }

  const openFile = async (file: ReviewFile) => {
    try {
      const blob = await getFileBlob(file.id)
      if (!blob) {
        window.alert('这个文件还没同步到本机，稍后再试')
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch {
      window.alert('打开失败')
    }
  }

  // 切页面时把还没落盘的内容补上，避免最后几个字丢掉
  useEffect(() => {
    return () => {
      window.clearTimeout(saveTimer.current)
      const p = pendingRef.current
      if (p && reviewHasContent(p)) useReviewStore.getState().upsertDay(p)
      pendingRef.current = null
    }
  }, [])

  const isToday = date === today
  const duration = sleepMinutes(draft.sleepAt, draft.wakeAt)
  const photos = draft.photoIds ?? []
  const files = draft.files ?? []

  const openTemplate = () => {
    setTpl(template.map((label) => ({ id: uuidv4(), label })))
    setTemplateOpen(true)
  }

  const saveTemplate = () => {
    const labels = tpl.map((t) => t.label.trim()).filter(Boolean)
    setTemplate(labels)
    setTemplateOpen(false)
    // 当前这天还没写内容时，直接用新模板重排，省得用户以为没生效
    if (!reviewHasContent(draft)) {
      setDraft(makeReviewDay(date, labels.length ? labels : DEFAULT_REVIEW_TEMPLATE))
      setSaved(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-6 md:px-8 md:py-10">
      <header className="mb-5 flex items-center justify-between gap-3 md:pr-28">
        <h1 className="text-xl font-semibold text-ink-900 md:text-2xl">每日复盘</h1>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-1 rounded-full bg-cream-deep/60 px-2 py-1.5 text-[11.5px] font-medium leading-none text-ink-500 transition hover:bg-petal-50 hover:text-petal-600 active:scale-95"
          >
            <IconSearch className="h-3.5 w-3.5 shrink-0 text-petal-400" />
            <span>搜索</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/review/overview')}
            className="flex items-center gap-1 rounded-full bg-cream-deep/60 px-2 py-1.5 text-[11.5px] font-medium leading-none text-ink-500 transition hover:bg-petal-50 hover:text-petal-600 active:scale-95"
          >
            <IconChart className="h-3.5 w-3.5 shrink-0 text-petal-400" />
            <span>总览</span>
          </button>
          <button
            type="button"
            onClick={openTemplate}
            className="flex items-center gap-1 rounded-full bg-cream-deep/60 px-2 py-1.5 text-[11.5px] font-medium leading-none text-ink-500 transition hover:bg-petal-50 hover:text-petal-600 active:scale-95"
          >
            <IconList className="h-3.5 w-3.5 shrink-0 text-petal-400" />
            <span>模板</span>
          </button>
        </div>
      </header>

      {/* 日期：一行文字，不用容器 */}
      <div className="mb-5 flex items-center gap-1 text-sm text-ink-400">
        <button
          type="button"
          onClick={() => goDate(dayjs(date).subtract(1, 'day').format(DATE_FMT))}
          title="前一天"
          className="-ml-1.5 flex h-8 w-7 items-center justify-center rounded-lg text-base transition hover:bg-cream-deep/60 hover:text-ink-700 active:scale-95"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => setCalOpen(true)}
          title="打开日历"
          className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 transition hover:bg-cream-deep/60"
        >
          <span className="text-[15px] font-medium text-ink-900">
            {dayjs(date).format('MM-DD')} {dayjs(date).format('ddd')}
          </span>
          <span className="text-[10px] text-ink-400">▾</span>
        </button>
        <button
          type="button"
          onClick={() => goDate(dayjs(date).add(1, 'day').format(DATE_FMT))}
          disabled={isToday}
          title="后一天"
          className="flex h-8 w-7 items-center justify-center rounded-lg text-base transition hover:bg-cream-deep/60 hover:text-ink-700 active:scale-95 disabled:opacity-20"
        >
          ›
        </button>
        {!isToday && (
          <button
            type="button"
            onClick={() => goDate(today)}
            className="ml-1 rounded-full px-2 py-0.5 text-[11px] text-ink-400 transition hover:bg-cream-deep/60"
          >
            回到今天
          </button>
        )}
      </div>

      {/* 睡眠 */}
      <div className="mb-6 flex flex-wrap items-baseline gap-x-1.5 text-[15px] text-ink-700">
        <span className="text-ink-400">睡</span>
        <input
          type="time"
          value={draft.sleepAt}
          onChange={(e) => patch({ sleepAt: e.target.value })}
          className="w-[86px] bg-transparent py-0.5 text-[15px] text-ink-900 outline-none"
        />
        <span className="text-ink-400">—</span>
        <input
          type="time"
          value={draft.wakeAt}
          onChange={(e) => patch({ wakeAt: e.target.value })}
          className="w-[86px] bg-transparent py-0.5 text-[15px] text-ink-900 outline-none"
        />
        {duration != null && (
          <span className="ml-1 text-xs text-ink-400">{formatDuration(duration)}</span>
        )}
      </div>

      {/* 复盘点 */}
      <div className="space-y-6">
        {draft.fields.map((f) => (
          <div
            key={f.id}
            id={`review-field-${f.id}`}
            className={`-mx-2 -my-1 scroll-mt-24 rounded-xl px-2 py-1 transition-colors duration-500 ${
              flashField === f.id ? 'bg-petal-50/80' : ''
            }`}
          >
            <div className="mb-0.5 flex items-baseline gap-1">
              <input
                value={f.label}
                onChange={(e) => updateField(f.id, { label: e.target.value })}
                placeholder="写一个问题"
                className="min-w-[3em] max-w-full shrink-0 bg-transparent text-[13px] font-medium tracking-wide text-ink-500 outline-none [field-sizing:content] placeholder:font-normal placeholder:text-ink-400/40 focus:text-ink-700"
              />
              <span className="shrink-0 text-[13px] text-ink-500">:</span>
              <button
                type="button"
                onClick={() => removeField(f.id)}
                title="删除这一条"
                className="ml-auto flex h-7 w-6 shrink-0 items-center justify-center rounded-lg text-xs text-ink-400/40 transition hover:bg-cream-deep/60 hover:text-petal-500 active:scale-95"
              >
                ✕
              </button>
            </div>
            <div className="mt-1.5 rounded-2xl bg-surface/70 px-3.5 py-2 ring-1 ring-petal-100/60 transition-colors focus-within:bg-surface/85 focus-within:ring-petal-200">
              <AutoTextarea
                value={f.value}
                onChange={(v) => updateField(f.id, { value: v })}
                placeholder="随手写两句"
              />
            </div>
          </div>
        ))}
      </div>

      {/* 整篇图片 */}
      {photos.length > 0 && (
        <div className="mt-6 space-y-3">
          {photos.map((pid) => (
            <div key={pid} className="relative">
              <button
                type="button"
                onClick={() => setPreviewPhoto(pid)}
                title="点击查看大图"
                className="block w-full overflow-hidden rounded-xl bg-cream-deep/30"
              >
                <ReviewImage photoId={pid} />
              </button>
              <button
                type="button"
                onClick={() => removeImage(pid)}
                title="移除图片"
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink-900/45 text-[11px] text-white backdrop-blur-sm transition hover:bg-ink-900/70 active:scale-95"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 整篇文件 */}
      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          {files.map((file) => (
            <div key={file.id} className="flex items-center gap-2 text-[13px]">
              <button
                type="button"
                onClick={() => void openFile(file)}
                title="点击打开"
                className="flex min-w-0 items-center gap-1.5 text-ink-500 transition hover:text-petal-600"
              >
                <span className="shrink-0">📄</span>
                <span className="truncate">{file.name}</span>
                <span className="shrink-0 text-[11px] text-ink-400/60">
                  {formatSize(file.size)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => removeFile(file.id)}
                title="移除文件"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] text-ink-400/40 transition hover:bg-cream-deep/60 hover:text-petal-500 active:scale-95"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 底部：一个加号，点开选加什么 */}
      <div className="mt-7 flex items-center gap-3">
        <div className="relative">
          {addOpen && (
            <>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                tabIndex={-1}
                aria-label="关闭"
                className="fixed inset-0 z-10 cursor-default"
              />
              <div className="absolute left-full top-1/2 z-20 ml-2 flex -translate-y-1/2 items-center gap-0.5 whitespace-nowrap rounded-full bg-surface p-1 shadow-soft ring-1 ring-petal-100">
                <div className="shrink-0">
                  <FileUploadButton
                    accept="image/*"
                    multiple
                    showWeChatTip={false}
                    onFiles={(fs) => {
                      setAddOpen(false)
                      void addImages(fs)
                    }}
                    className="rounded-full px-2.5 py-1.5 text-[12px] leading-none text-ink-500 transition hover:bg-petal-50 hover:text-petal-600 active:scale-95"
                  >
                    图片
                  </FileUploadButton>
                </div>
                <div className="shrink-0">
                  <FileUploadButton
                    multiple
                    showWeChatTip={false}
                    onFiles={(fs) => {
                      setAddOpen(false)
                      void addFiles(fs)
                    }}
                    className="rounded-full px-2.5 py-1.5 text-[12px] leading-none text-ink-500 transition hover:bg-petal-50 hover:text-petal-600 active:scale-95"
                  >
                    文件
                  </FileUploadButton>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    addField()
                    setAddOpen(false)
                  }}
                  className="rounded-full px-2.5 py-1.5 text-[12px] leading-none text-ink-500 transition hover:bg-petal-50 hover:text-petal-600 active:scale-95"
                >
                  复盘点
                </button>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => setAddOpen((v) => !v)}
            title="添加图片 / 文件 / 复盘点"
            aria-expanded={addOpen}
            className={`flex h-9 w-9 items-center justify-center rounded-full border border-dashed transition active:scale-95 ${
              addOpen
                ? 'border-petal-300 bg-petal-50 text-petal-500'
                : 'border-petal-200 text-ink-400 hover:bg-petal-50 hover:text-petal-500'
            }`}
          >
            <IconPlus className="h-[18px] w-[18px]" />
          </button>
        </div>
        {attachBusy && <span className="text-[11px] text-ink-400/60">处理中…</span>}
      </div>

      <div className="mt-3 text-[11px] text-ink-400/50">
        {saved ? '已保存' : '内容会自动保存'}
      </div>

      {/* 模板编辑 */}
      {templateOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-ink-900/40 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setTemplateOpen(false)
          }}
        >
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-soft sm:rounded-3xl">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-base font-semibold text-ink-900">复盘模板</h3>
              <button
                type="button"
                onClick={() => setTemplateOpen(false)}
                title="关闭"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-cream-deep text-ink-500 transition hover:bg-petal-50"
              >
                ✕
              </button>
            </div>
            <p className="mb-4 text-xs leading-relaxed text-ink-400">
              新建一天时按这些问题生成，已有的记录不会变。
            </p>

            <div className="space-y-2">
              {tpl.map((t) => (
                <div key={t.id} className="flex items-center gap-2">
                  <input
                    value={t.label}
                    onChange={(e) =>
                      setTpl((list) =>
                        list.map((x) => (x.id === t.id ? { ...x, label: e.target.value } : x)),
                      )
                    }
                    placeholder="写一个复盘的问题"
                    className="min-w-0 flex-1 rounded-xl bg-cream/60 px-3 py-2 text-sm text-ink-700 outline-none ring-1 ring-transparent transition focus:bg-surface focus:ring-petal-200"
                  />
                  <button
                    type="button"
                    onClick={() => setTpl((list) => list.filter((x) => x.id !== t.id))}
                    title="删除"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs text-ink-400/60 transition hover:bg-petal-50 hover:text-petal-500"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setTpl((list) => [...list, { id: uuidv4(), label: '' }])}
              className="mt-3 w-full rounded-2xl border border-dashed border-petal-200 py-2 text-xs font-medium text-petal-500 transition hover:bg-petal-50"
            >
              + 加一条问题
            </button>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setTpl(DEFAULT_REVIEW_TEMPLATE.map((label) => ({ id: uuidv4(), label })))
                }
                className="rounded-2xl bg-cream-deep px-3 py-2.5 text-xs font-medium text-ink-500 transition hover:bg-petal-50 active:scale-95"
              >
                恢复默认
              </button>
              <button
                type="button"
                onClick={saveTemplate}
                className="flex-1 rounded-2xl bg-gradient-to-br from-petal-400 to-petal-500 px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:brightness-105 active:scale-95"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {calOpen && (
        <ReviewCalendar
          date={date}
          marked={markedDates}
          onPick={(d) => jumpTo(d)}
          onClose={() => setCalOpen(false)}
        />
      )}

      {searchOpen && (
        <ReviewSearch
          days={days}
          onPick={(d, fieldId) => jumpTo(d, fieldId)}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {previewPhoto && (
        <Lightbox
          photoId={previewPhoto}
          alt="复盘图片"
          onClose={() => setPreviewPhoto(null)}
        />
      )}
    </div>
  )
}
