import { useRef, useState } from 'react'
import type { Item } from '@/store/useItemStore'
import { useItemStore } from '@/store/useItemStore'
import { compressImageFile, savePhoto, deletePhoto } from '@/lib/photo'
import FileUploadButton from '@/components/FileUploadButton'
import { usePasteUpload } from '@/lib/upload'
import { displayAddedDays } from '@/lib/itemsUtil'
import ItemPhoto from './ItemPhoto'
import TagPicker from './TagPicker'
import Lightbox from './Lightbox'

interface Props {
  item: Item
  onDone: (target: 'items' | 'drafts') => void
}

const fieldCls =
  'w-full rounded-xl border border-petal-200 bg-surface px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-petal-200'

/** 物品编辑表单（新建/编辑/草稿共用）。负责照片压缩、字段与标签维护。 */
export default function ItemForm({ item, onDone }: Props) {
  const tags = useItemStore((s) => s.tags)
  const updateItem = useItemStore((s) => s.updateItem)
  const addTag = useItemStore((s) => s.addTag)
  const removeItem = useItemStore((s) => s.removeItem)
  const cameraRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(item.name)
  const [quantity, setQuantity] = useState(item.quantity != null ? String(item.quantity) : '')
  const [amount, setAmount] = useState(item.amount != null ? String(item.amount) : '')
  const [addedDays, setAddedDays] = useState(item.addedDays != null ? String(item.addedDays) : '')
  const [expiryDate, setExpiryDate] = useState(item.expiryDate ?? '')
  const [expiryReminder, setExpiryReminder] = useState(item.expiryReminder)
  const [selectedTags, setSelectedTags] = useState<string[]>(item.tags)
  const [photoId, setPhotoId] = useState<string | null>(item.photoId)
  const [remark, setRemark] = useState(item.remark ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(false)

  // 粘贴上传：微信复制图片后粘贴即可设为物品照片
  usePasteUpload((files) => {
    const img = files.find((f) => f.type.startsWith('image/'))
    if (img) void processImage(img)
  })

  const persist = (extra: Partial<Item> = {}) => {
    updateItem(item.id, {
      name: name.trim(),
      quantity: quantity === '' ? null : Number(quantity),
      amount: amount === '' ? null : Number(amount),
      addedDays: addedDays === '' ? null : Number(addedDays),
      expiryDate: expiryDate || null,
      expiryReminder,
      tags: selectedTags,
      photoId,
      remark: remark.trim() || null,
      ...extra,
    })
  }

  const processImage = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const dataUrl = await compressImageFile(file, 800, 0.7)
      const id = await savePhoto(dataUrl)
      if (photoId) deletePhoto(photoId).catch(() => {})
      setPhotoId(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '图片处理失败')
    } finally {
      setBusy(false)
    }
  }

  const onPickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) void processImage(file)
  }

  const saveFinal = () => {
    persist({ isDraft: false })
    onDone('items')
  }
  const saveDraft = () => {
    persist({ isDraft: true })
    onDone('drafts')
  }
  const deleteThis = () => {
    removeItem(item.id)
    onDone(item.isDraft ? 'drafts' : 'items')
  }

  return (
    <div className="space-y-5">
      {/* 照片 */}
      <div className="flex items-center gap-4">
        <div
          className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl border border-petal-100 bg-petal-50/60"
          onClick={() => photoId && setZoom(true)}
          title={photoId ? '点击放大' : undefined}
        >
          <ItemPhoto photoId={photoId} className="h-full w-full object-cover" alt={item.name} />
          {photoId && (
            <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink-900/40 text-[10px] text-white">
              🔍
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={busy}
              className="flex-1 rounded-xl bg-gradient-to-br from-petal-400 to-petal-500 px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:brightness-105 active:scale-95 disabled:opacity-60"
            >
              {busy ? '处理中…' : '📷 拍照'}
            </button>
            <FileUploadButton
              accept="image/*"
              disabled={busy}
              onFiles={(files) => {
                const f = files.find((x) => x.type.startsWith('image/'))
                if (f) void processImage(f)
              }}
              className="flex-1 rounded-xl bg-gradient-to-br from-lavender-400 to-lavender-500 px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:brightness-105 active:scale-95 disabled:opacity-60"
            >
              {busy ? '处理中…' : '🖼️ 相册'}
            </FileUploadButton>
          </div>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onPickPhoto}
          />
          {error && <p className="text-xs text-petal-600">{error}</p>}
        </div>
      </div>

      {/* 名称 */}
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">名称</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：防晒霜、冬季外套"
          className={fieldCls}
        />
      </div>

      {/* 数量 / 金额 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">数量</label>
          <input
            type="number"
            min={0}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="选填"
            className={fieldCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">金额（元）</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="选填"
            className={fieldCls}
          />
        </div>
      </div>

      {/* 已加入天数 */}
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">已加入天数</label>
        <input
          type="number"
          min={0}
          value={addedDays}
          onChange={(e) => setAddedDays(e.target.value)}
          placeholder="选填，留空按添加时间自动计算"
          className={fieldCls}
        />
        <p className="mt-1 text-[11px] text-ink-400">
          当前已加入约 {displayAddedDays({ ...item, addedDays: addedDays === '' ? null : Number(addedDays) })} 天
        </p>
      </div>

      {/* 保质期 */}
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">保质期（到期日）</label>
        <input
          type="date"
          value={expiryDate}
          onChange={(e) => setExpiryDate(e.target.value)}
          className={fieldCls}
        />
      </div>

      {/* 到期提醒开关 */}
      <label className="flex cursor-pointer items-center justify-between rounded-xl bg-petal-50 px-4 py-3">
        <span className="text-sm font-medium text-ink-700">保质期到期提醒</span>
        <button
          type="button"
          role="switch"
          aria-checked={expiryReminder}
          onClick={() => setExpiryReminder((v) => !v)}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            expiryReminder ? 'bg-petal-400' : 'bg-ink-200'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              expiryReminder ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </button>
      </label>

      {/* 备注 */}
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">备注说明</label>
        <textarea
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          placeholder="记录物品的额外信息，例如购买渠道、使用心得、存放位置…"
          rows={3}
          className={`${fieldCls} resize-none`}
        />
      </div>

      {/* 标签 */}
      <div>
        <label className="mb-2 block text-xs font-medium text-ink-500">分类标签（可多选）</label>
        <TagPicker value={selectedTags} onChange={setSelectedTags} tags={tags} onAddTag={addTag} />
      </div>

      {/* 操作按钮 */}
      <div className="flex flex-wrap gap-2 pt-2">
        {item.isDraft ? (
          <>
            <button
              type="button"
              onClick={saveFinal}
              className="flex-1 rounded-xl bg-gradient-to-br from-petal-400 to-petal-500 px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:brightness-105 active:scale-95"
            >
              保存为物品
            </button>
            <button
              type="button"
              onClick={saveDraft}
              className="rounded-xl border border-petal-200 bg-surface px-4 py-2.5 text-sm font-medium text-ink-600 transition hover:bg-petal-50"
            >
              存入草稿箱
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => persist()}
            className="flex-1 rounded-xl bg-gradient-to-br from-petal-400 to-petal-500 px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:brightness-105 active:scale-95"
          >
            保存
          </button>
        )}
        <button
          type="button"
          onClick={deleteThis}
          className="rounded-xl border border-petal-100 px-4 py-2.5 text-sm font-medium text-petal-600 transition hover:bg-petal-50"
        >
          {item.isDraft ? '删除草稿' : '删除'}
        </button>
      </div>

      {zoom && <Lightbox photoId={photoId} onClose={() => setZoom(false)} />}
    </div>
  )
}
