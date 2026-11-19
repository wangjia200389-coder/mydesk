import { useState } from 'react'
import { usePhoto } from '@/hooks/usePhoto'

/** 全屏查看物品照片（点击放大） */
export default function Lightbox({
  photoId,
  onClose,
  alt = '物品照片',
}: {
  photoId: string | null
  onClose: () => void
  alt?: string
}) {
  const url = usePhoto(photoId)
  const [loaded, setLoaded] = useState(false)

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex h-[92vh] w-[92vw] items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 稳定占位：避免图片加载前后容器尺寸突变导致抖动 */}
        {!url && (
          <div className="flex flex-col items-center gap-3 text-white/70">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
            <span className="text-sm">加载中…</span>
          </div>
        )}

        {url && (
          <img
            src={url}
            alt={alt}
            onLoad={() => setLoaded(true)}
            className={`max-h-[88vh] max-w-[90vw] rounded-2xl object-contain shadow-soft transition-opacity duration-300 ${
              loaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

        <button
          type="button"
          onClick={onClose}
          title="关闭"
          className="fixed right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-lg text-ink-700 shadow-soft transition hover:bg-petal-50"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
