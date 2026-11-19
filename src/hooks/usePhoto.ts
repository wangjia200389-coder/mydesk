import { useEffect, useState } from 'react'
import { getPhoto } from '@/lib/photo'

/** 全局内存缓存，避免同一 photoId 反复从 IndexedDB 读取造成闪烁。 */
const cache = new Map<string, string>()

/** 同步层把照片写入 IndexedDB 后广播的事件（见 src/lib/sync.ts）。 */
const FILES_UPDATED_EVT = 'mydesk-files-updated'

/** 订阅者：收到「文件已更新」后需要重读的组件。 */
const listeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener(FILES_UPDATED_EVT, (e) => {
    const ids = (e as CustomEvent<{ ids?: string[] }>).detail?.ids
    // 只清被写入的那几个，避免整列表重读造成闪烁；没带 ids 就全清。
    if (!ids || ids.length === 0) cache.clear()
    else ids.forEach((id) => cache.delete(id))
    listeners.forEach((fn) => fn())
  })
}

/**
 * 异步加载 IndexedDB 中的照片（按 photoId）。
 * 返回 dataUrl；loading 中为 null；id 为空也返回 null。
 * 已加载过的 photoId 会命中内存缓存，瞬间返回，避免弹窗/列表闪烁。
 */
export function usePhoto(id: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => (id ? cache.get(id) ?? null : null))
  const [version, setVersion] = useState(0)

  // 同步层下载完照片会广播，这里重读一次
  useEffect(() => {
    const fn = () => setVersion((v) => v + 1)
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])

  useEffect(() => {
    let active = true
    if (!id) {
      setUrl(null)
      return
    }
    const cached = cache.get(id)
    if (cached !== undefined) {
      setUrl(cached)
      return
    }
    setUrl(null)
    getPhoto(id)
      .then((u) => {
        // 只缓存真实存在的照片：null 往往表示「同步文件还没下载完」，
        // 缓存了就会让 📦 占位永久留在界面上（历史 bug）。
        if (u) cache.set(id, u)
        if (active) setUrl(u)
      })
      .catch(() => {
        if (active) setUrl(null)
      })
    return () => {
      active = false
    }
  }, [id, version])

  return url
}
