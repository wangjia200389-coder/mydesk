import { useEffect, useState } from 'react'

/**
 * PWA 自动更新守卫。
 *
 * 背景：网页的性能优化里 Service Worker 会「秒开」旧缓存版本，新版本只在后台下载，
 * 页面本身不会自动变 → 表现为「从桌面图标点进去还是旧界面」。
 *
 * 这里的做法（无需用户操作）：
 *   1. 启动、页面重新可见、恢复联网、每 15 分钟 → 主动检查一次新 SW
 *   2. 发现新 SW（有 waiting 就催它跳过等待；autoUpdate 下会直接接管）
 *   3. 新 SW 接管页面（controllerchange）→ 立刻自动刷新一次，用户看到的还是同一屏，内容已是新版
 *   4. 如果用户此刻正在输入（避免丢内容），不打断，显示在右下角的「点此更新」小胶囊；
 *      同时每 30 秒再试，一旦空闲就自动刷新
 */
const CHECK_INTERVAL = 15 * 60 * 1000
const RETRY_INTERVAL = 30 * 1000

/** 用户是否正在输入（刷新会丢内容，此时不自动刷新） */
function isEditing(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'
}

export default function UpdateWatcher() {
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let reloading = false
    let retryTimer: number | null = null

    const applyUpdate = () => {
      if (reloading) return
      if (isEditing()) {
        setPending(true)
        if (retryTimer == null) {
          retryTimer = window.setInterval(() => {
            if (!isEditing()) applyUpdate()
          }, RETRY_INTERVAL)
        }
        return
      }
      reloading = true
      window.location.reload()
    }

    // 首次安装 SW 时也会触发 controllerchange，那次不算「更新」，跳过
    let hadController = navigator.serviceWorker.controller !== null
    const onControllerChange = () => {
      if (!hadController) {
        hadController = true
        return
      }
      applyUpdate()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    const check = async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration()
        if (!reg) return
        await reg.update()
        const waiting = reg.waiting
        if (waiting) {
          waiting.postMessage({ type: 'SKIP_WAITING' })
          applyUpdate()
        }
      } catch {
        // 离线等情况下忽略，下次再试
      }
    }

    const onActive = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onActive)
    window.addEventListener('focus', onActive)
    window.addEventListener('online', onActive)

    const timer = window.setInterval(() => void check(), CHECK_INTERVAL)
    void check()

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      document.removeEventListener('visibilitychange', onActive)
      window.removeEventListener('focus', onActive)
      window.removeEventListener('online', onActive)
      window.clearInterval(timer)
      if (retryTimer != null) window.clearInterval(retryTimer)
    }
  }, [])

  if (!pending) return null

  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="no-tap-highlight fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-gradient-to-br from-petal-400 to-petal-500 px-4 py-2 text-xs font-semibold text-white shadow-soft transition hover:brightness-105 active:scale-95"
    >
      🎉 新版本已就绪 · 点此更新
    </button>
  )
}
