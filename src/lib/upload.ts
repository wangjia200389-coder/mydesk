import { useEffect, useRef } from 'react'

/** 判断当前是否运行在微信内置浏览器 */
export function isWeChat(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent.toLowerCase()
  return ua.includes('micromessenger')
}

/** 尝试从 DataTransferItemList 中提取文件（微信/浏览器 paste 的图片或文件） */
function getFilesFromDataTransfer(items: DataTransferItemList | undefined): File[] {
  if (!items) return []
  const files: File[] = []
  for (const item of Array.from(items)) {
    const file = item.getAsFile()
    if (file) files.push(file)
  }
  return files
}

/**
 * 监听页面全局 paste 事件，将文件/图片交给回调。
 * 组件挂载时启用，卸载时自动清理。
 */
export function usePasteUpload(onFiles: (files: File[]) => void) {
  const onFilesRef = useRef(onFiles)
  onFilesRef.current = onFiles

  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const dt = e.clipboardData
      if (!dt) return
      const files = dt.files?.length
        ? Array.from(dt.files)
        : getFilesFromDataTransfer(dt.items)
      if (files.length > 0) {
        e.preventDefault()
        onFilesRef.current(files)
      }
    }
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [])
}
