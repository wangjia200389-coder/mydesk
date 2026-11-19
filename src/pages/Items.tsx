import { useMemo, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useItemStore, type ItemTag } from '@/store/useItemStore'
import { selectItems, getTagPath } from '@/lib/itemsUtil'
import { compressImageFile, savePhoto } from '@/lib/photo'
import FileUploadButton from '@/components/FileUploadButton'
import { usePasteUpload } from '@/lib/upload'
import ItemCard from '@/components/items/ItemCard'

type StatusFilter = 'normal' | 'discarded' | 'consumed'

/** 分类标签 chip：未选中=白底+彩色描边+色点，选中=彩色实底白字，提升可读性 */
function TagChip(props: {
  tag: ItemTag
  active: boolean
  onClick: () => void
  size?: 'md' | 'sm'
}) {
  const { tag, active, onClick, size = 'md' } = props
  return (
    <button
      type="button"
      onClick={onClick}
      className={`no-tap-highlight inline-flex items-center gap-1.5 rounded-full border font-medium transition active:scale-95 ${
        size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-[13px]'
      }`}
      style={{
        backgroundColor: active ? tag.color : '#ffffff',
        borderColor: active ? tag.color : `${tag.color}99`,
        color: active ? '#ffffff' : '#4a4055',
      }}
    >
      {!active && (
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: tag.color }}
        />
      )}
      {tag.name}
    </button>
  )
}

export default function Items() {
  const navigate = useNavigate()
  const items = useItemStore((s) => s.items)
  const tags = useItemStore((s) => s.tags)
  const addItem = useItemStore((s) => s.addItem)
  const cameraRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('normal')
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const draftCount = useMemo(() => items.filter((i) => i.isDraft).length, [items])
  const selectedTag = selectedTagId ? tags.find((t) => t.id === selectedTagId) ?? null : null
  const breadcrumb = selectedTagId ? getTagPath(tags, selectedTagId) : []

  const result = useMemo(
    () => selectItems(items, { statusFilter, selectedTagId, query, tags }),
    [items, statusFilter, selectedTagId, query, tags],
  )

  const processPhoto = async (file: File) => {
    setBusy(true)
    try {
      const dataUrl = await compressImageFile(file, 800, 0.7)
      const phId = await savePhoto(dataUrl)
      const id = addItem({ photoId: phId, isDraft: true })
      navigate(`/items/${id}`)
    } catch {
      setBusy(false)
    }
  }

  const onPickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) void processPhoto(file)
  }

  // 粘贴上传：微信复制图片后粘贴即可添加新物品
  usePasteUpload((files) => {
    const img = files.find((f) => f.type.startsWith('image/'))
    if (img) void processPhoto(img)
  })

  const childrenOf = (pid: string | null) => tags.filter((t) => t.parentId === pid)
  const isSel = (id: string) => selectedTagId === id

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 md:px-8">
      {/* 顶部：小入口（左）+ 搜索图标（右上角） */}
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/items/stats"
            className="no-tap-highlight rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink-500 ring-1 ring-petal-100 transition hover:text-petal-600 hover:ring-petal-200"
          >
            📊 统计
          </Link>
          <Link
            to="/items/drafts"
            className="no-tap-highlight rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink-500 ring-1 ring-petal-100 transition hover:text-petal-600 hover:ring-petal-200"
          >
            🗒️ 草稿箱 ({draftCount})
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setSearchOpen((v) => !v)}
          title="搜索"
          className={`no-tap-highlight flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface shadow-card ring-1 transition active:scale-95 ${
            searchOpen
              ? 'text-petal-600 ring-petal-200'
              : 'text-ink-500 ring-petal-100 hover:text-petal-600'
          }`}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      </header>

      {/* 展开的搜索框 */}
      {searchOpen && (
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">
              🔍
            </span>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索物品名称…"
              className="w-full rounded-2xl border border-petal-100 bg-surface py-2.5 pl-9 pr-9 text-sm text-ink-900 shadow-card focus:outline-none focus:ring-2 focus:ring-petal-200"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-1.5 text-ink-400 hover:text-ink-700"
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setSearchOpen(false)
              setQuery('')
            }}
            className="shrink-0 rounded-xl px-3 py-2 text-sm font-medium text-ink-500 transition hover:text-ink-700"
          >
            取消
          </button>
        </div>
      )}

      {/* 状态筛选 */}
      <div className="mb-3 flex gap-1 rounded-2xl border border-petal-100 bg-surface p-1 shadow-card">
        {(
          [
            { k: 'normal', label: '正常' },
            { k: 'discarded', label: '已丢弃' },
            { k: 'consumed', label: '已消耗' },
          ] as { k: StatusFilter; label: string }[]
        ).map((s) => (
          <button
            key={s.k}
            type="button"
            onClick={() => setStatusFilter(s.k)}
            className={`flex-1 rounded-xl py-1.5 text-xs font-medium transition ${
              statusFilter === s.k
                ? 'bg-gradient-to-br from-lavender-400 to-lavender-500 text-white shadow-soft'
                : 'text-ink-500 hover:bg-petal-50'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* 分类标签浏览（仅正常视图；已丢弃/已消耗不参与标签筛选） */}
      {statusFilter === 'normal' && (
        <div className="mb-4 rounded-2xl border border-petal-100 bg-surface/80 p-3 shadow-card">
          {/* 面包屑 */}
          <div className="mb-2.5 flex flex-wrap items-center gap-1 text-[13px] text-ink-400">
            <button
              type="button"
              onClick={() => setSelectedTagId(null)}
              className={!selectedTagId ? 'font-semibold text-petal-600' : 'hover:text-petal-600'}
            >
              全部
            </button>
            {breadcrumb.map((t) => (
              <span key={t.id} className="flex items-center gap-1">
                <span className="text-ink-300">/</span>
                <button
                  type="button"
                  onClick={() => setSelectedTagId(t.id)}
                  className="hover:text-petal-600"
                >
                  {t.name}
                </button>
              </span>
            ))}
          </div>

          {/* 一级 */}
          <div className="flex flex-wrap gap-2">
            {childrenOf(null).map((t) => (
              <TagChip
                key={t.id}
                tag={t}
                active={isSel(t.id)}
                onClick={() => setSelectedTagId(isSel(t.id) ? null : t.id)}
              />
            ))}
          </div>

          {/* 二级（当选中一级或其子孙时显示） */}
          {selectedTag && (
            <div className="mt-2.5 flex flex-wrap gap-2 border-t border-petal-50 pt-2.5">
              {childrenOf(selectedTag.id).map((t) => (
                <TagChip
                  key={t.id}
                  tag={t}
                  active={isSel(t.id)}
                  onClick={() => setSelectedTagId(isSel(t.id) ? selectedTag.id : t.id)}
                />
              ))}
            </div>
          )}

          {/* 三级（当选中二级或其子孙时显示） */}
          {selectedTag && selectedTag.level >= 2 && (
            <div className="mt-2.5 flex flex-wrap gap-2 border-t border-petal-50 pt-2.5">
              {childrenOf(selectedTag.id).map((t) => (
                <TagChip
                  key={t.id}
                  tag={t}
                  size="sm"
                  active={isSel(t.id)}
                  onClick={() => setSelectedTagId(isSel(t.id) ? selectedTag.id : t.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 列表 */}
      {result.list.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-petal-200 bg-surface/60 py-16 text-center shadow-card">
          <div className="mb-2 text-4xl">📦</div>
          <p className="text-sm text-ink-500">
            {statusFilter === 'normal'
              ? query
                ? '没有匹配的物品～'
                : '还没有物品，点右下角 ＋ 添加物品吧'
              : '这里还没有相关物品'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {result.list.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* 悬浮添加物品按钮：点击弹出「拍照 / 相册」二选一 */}
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        disabled={busy}
        className="no-tap-highlight fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-petal-400 to-petal-500 text-3xl font-light text-white shadow-soft transition hover:brightness-105 active:scale-95 md:bottom-6"
        title="添加物品"
      >
        ＋
      </button>

      {/* 隐藏相机输入 */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPickPhoto}
      />

      {/* 拍照 / 相册 二选一弹层 */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/30 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPickerOpen(false)
          }}
        >
          <div className="w-full max-w-xs rounded-t-3xl bg-surface p-5 shadow-soft sm:rounded-3xl">
            <p className="mb-3 text-center text-sm font-semibold text-ink-900">
              添加物品照片
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setPickerOpen(false)
                  cameraRef.current?.click()
                }}
                className="flex flex-col items-center gap-2 rounded-2xl bg-petal-50 py-5 text-petal-600 ring-1 ring-petal-100 transition hover:bg-petal-100 active:scale-95"
              >
                <span className="text-3xl">📷</span>
                <span className="text-sm font-semibold">拍照</span>
              </button>
              <FileUploadButton
                accept="image/*"
                onFiles={(files) => {
                  setPickerOpen(false)
                  const f = files.find((x) => x.type.startsWith('image/'))
                  if (f) void processPhoto(f)
                }}
                className="flex flex-col items-center gap-2 rounded-2xl bg-lavender-50 py-5 text-sm font-semibold text-lavender-600 ring-1 ring-lavender-100 transition hover:bg-lavender-100 active:scale-95"
              >
                <span className="text-3xl">🖼️</span>
                <span>从相册选择</span>
              </FileUploadButton>
            </div>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="mt-3 w-full rounded-xl py-2 text-sm font-medium text-ink-500 transition hover:bg-petal-50"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
