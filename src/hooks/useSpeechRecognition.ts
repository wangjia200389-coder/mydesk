import { useCallback, useEffect, useRef, useState } from 'react'

/* Web Speech API 在 TS DOM 库中无完整类型，这里用最小化的 any 形态封装 */

function getRecognitionCtor(): any | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: any
    webkitSpeechRecognition?: any
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

/** 浏览器是否支持语音识别 */
export function isSpeechSupported(): boolean {
  return getRecognitionCtor() !== null
}

interface Options {
  lang?: string
  /** 每次识别出一段「最终结果」时回调（已去重，可直接追加到输入框） */
  onResult?: (text: string) => void
  /** 临时识别文本（实时预览） */
  onInterim?: (text: string) => void
  onError?: (msg: string) => void
  onEnd?: () => void
}

export function useSpeechRecognition(opts: Options = {}) {
  const [listening, setListening] = useState(false)
  const recRef = useRef<any>(null)
  const optsRef = useRef(opts)
  const lastFinalRef = useRef<string>('')
  optsRef.current = opts

  const stop = useCallback(() => {
    try {
      recRef.current?.stop()
    } catch {
      /* noop */
    }
  }, [])

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      optsRef.current.onError?.('当前浏览器不支持语音识别（建议使用 Chrome / Edge）')
      return
    }
    const rec = new Ctor()
    rec.lang = optsRef.current.lang || 'zh-CN'
    rec.continuous = true
    rec.interimResults = true
    lastFinalRef.current = ''

    rec.onresult = (event: any) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i]
        const txt = res[0]?.transcript ?? ''
        if (res.isFinal) {
          // 每次 final 只把新增的最终结果抛出去，调用方直接追加即可
          if (txt && txt !== lastFinalRef.current) {
            lastFinalRef.current = txt
            optsRef.current.onResult?.(txt)
          }
        } else {
          interim += txt
        }
      }
      optsRef.current.onInterim?.(interim)
    }

    rec.onerror = (e: any) => {
      const code = e?.error
      let msg = '语音识别失败，请重试'
      if (code === 'not-allowed' || code === 'service-not-allowed') msg = '麦克风权限被拒绝'
      else if (code === 'no-speech') msg = '没有检测到语音'
      else if (code === 'network') msg = '网络异常，识别失败'
      else if (code === 'aborted') msg = '识别已取消'
      else if (typeof code === 'string') msg = `语音识别失败：${code}`
      optsRef.current.onError?.(msg)
    }

    rec.onend = () => {
      setListening(false)
      optsRef.current.onEnd?.()
    }

    recRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch (err) {
      optsRef.current.onError?.('无法启动语音识别，请重试')
      setListening(false)
    }
  }, [])

  // 组件卸载时停止，避免麦克风常驻
  useEffect(() => () => stop(), [stop])

  return { listening, start, stop, supported: isSpeechSupported() }
}
