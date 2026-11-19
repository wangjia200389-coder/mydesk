import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import {
  usePomodoroStore,
  type PomodoroPhase,
} from '@/store/usePomodoroStore'

dayjs.locale('zh-cn')

const RING = 2 * Math.PI * 120
const RING_RADIUS = 120
const SIZE = 288

function formatTime(s: number) {
  const m = Math.floor(s / 60)
    .toString()
    .padStart(2, '0')
  const ss = Math.floor(s % 60)
    .toString()
    .padStart(2, '0')
  return `${m}:${ss}`
}

function getTotalSeconds(phase: PomodoroPhase, focusMin: number, breakMin: number) {
  return (phase === 'focus' ? focusMin : breakMin) * 60
}

/** 用 WebAudio 合成一段简单提示音，避免引入外部音频资源 */
function playBell() {
  try {
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const now = ctx.currentTime

    const tones = [
      { f: 880, t: 0.0, d: 0.18 },
      { f: 1318.5, t: 0.18, d: 0.22 },
      { f: 1760, t: 0.42, d: 0.3 },
    ]
    tones.forEach(({ f, t, d }) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(f, now + t)
      gain.gain.setValueAtTime(0.0001, now + t)
      gain.gain.exponentialRampToValueAtTime(0.25, now + t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + d)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + t)
      osc.stop(now + t + d + 0.02)
    })

    const close = () => ctx.close().catch(() => {})
    setTimeout(close, 1200)
  } catch {
    // 音频不可用时静默失败
  }
}

async function notify(title: string, body: string) {
  if (!('Notification' in window)) return
  if (Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: '/favicon.svg' })
    } catch {
      // Notification 构造器在某些 iframe 环境不可用时忽略
    }
    return
  }
  if (Notification.permission === 'default') {
    try {
      const p = await Notification.requestPermission()
      if (p === 'granted') new Notification(title, { body, icon: '/favicon.svg' })
    } catch {
      // requestPermission 在非安全上下文抛错时忽略
    }
  }
}

export default function Pomodoro() {
  const focusMinutes = usePomodoroStore((s) => s.focusMinutes)
  const breakMinutes = usePomodoroStore((s) => s.breakMinutes)
  const phase = usePomodoroStore((s) => s.phase)
  const setPhase = usePomodoroStore((s) => s.setPhase)
  const recordFocusDone = usePomodoroStore((s) => s.recordFocusDone)
  const todayCount = usePomodoroStore((s) => s.todayCount)

  const total = getTotalSeconds(phase, focusMinutes, breakMinutes)

  const [remaining, setRemaining] = useState(total)
  const [running, setRunning] = useState(false)
  const intervalRef = useRef<number | null>(null)
  const finishedFlagRef = useRef(false)

  const clearTimer = useCallback(() => {
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const onFinish = useCallback(async () => {
    if (finishedFlagRef.current) return
    finishedFlagRef.current = true

    playBell()

    if (phase === 'focus') {
      recordFocusDone()
      await notify('🍅 一颗番茄完成啦！', '休息 5 分钟，奖励自己一下～')
      setPhase('break')
    } else {
      await notify('🌿 休息结束～', '准备好开始下一颗番茄了吗？')
      setPhase('focus')
    }
  }, [phase, recordFocusDone, setPhase])

  // 切阶段/切时长时，若未在运行则同步剩余时间
  useEffect(() => {
    if (!running) {
      setRemaining(total)
      finishedFlagRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total])

  // 倒计时
  useEffect(() => {
    if (!running) {
      clearTimer()
      return
    }
    finishedFlagRef.current = false
    const startedAt = Date.now()
    const startRemaining = remaining

    intervalRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000)
      const next = Math.max(0, startRemaining - elapsed)
      setRemaining(next)
      if (next <= 0) {
        clearTimer()
        setRunning(false)
        onFinish()
      }
    }, 200)

    return clearTimer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, phase])

  const progress = total > 0 ? 1 - remaining / total : 0
  const dashoffset = RING * (1 - progress)

  const toggleRun = () => setRunning((r) => !r)

  const reset = () => {
    clearTimer()
    setRunning(false)
    setRemaining(total)
    finishedFlagRef.current = false
  }

  const statusLabel = useMemo(
    () => (phase === 'focus' ? '专注中' : '休息中'),
    [phase],
  )

  const switchPhase = (p: PomodoroPhase) => {
    if (p === phase) return
    clearTimer()
    setRunning(false)
    setPhase(p)
    setRemaining(getTotalSeconds(p, focusMinutes, breakMinutes))
    finishedFlagRef.current = false
  }

  const gradient = useMemo(() => {
    if (phase === 'focus') {
      return 'from-petal-400 via-petal-300 to-petal-500'
    }
    return 'from-mint-400 via-mint-300 to-mint-500'
  }, [phase])

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center px-8 py-10">
      <header className="mb-8 w-full text-center">
        <h1 className="text-3xl font-semibold text-ink-900">番茄钟 🍅</h1>
        <p className="mt-2 text-sm text-ink-500">
          25 分钟专注 + 5 分钟休息，用一颗小番茄的时间，温柔地推动自己前进。
        </p>
      </header>

      {/* 阶段切换 */}
      <div className="mb-6 inline-flex rounded-2xl border border-petal-100 bg-surface/80 p-1 shadow-card">
        {(
          [
            { k: 'focus' as const, label: '专注' },
            { k: 'break' as const, label: '休息' },
          ]
        ).map((s) => (
          <button
            key={s.k}
            type="button"
            onClick={() => switchPhase(s.k)}
            className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${
              phase === s.k
                ? 'bg-petal-100 text-petal-600 shadow-card'
                : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            {s.label}
            {s.k === 'focus'
              ? ` ${focusMinutes}min`
              : ` ${breakMinutes}min`}
          </button>
        ))}
      </div>

      {/* 圆形进度 */}
      <div className="relative">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="drop-shadow-[0_10px_25px_rgba(80,50,90,0.18)]"
        >
          <defs>
            <linearGradient id="pomodoroGradient" x1="0" y1="0" x2="1" y2="1">
              {phase === 'focus' ? (
                <>
                  <stop offset="0%" stopColor="#ff8da1" />
                  <stop offset="100%" stopColor="#c084fc" />
                </>
              ) : (
                <>
                  <stop offset="0%" stopColor="#7fd1b9" />
                  <stop offset="100%" stopColor="#ffd166" />
                </>
              )}
            </linearGradient>
          </defs>

          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RING_RADIUS}
            fill="#ffffff"
            stroke="#ffe0e8"
            strokeWidth={14}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="url(#pomodoroGradient)"
            strokeWidth={14}
            strokeLinecap="round"
            strokeDasharray={RING}
            strokeDashoffset={dashoffset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            style={{ transition: 'stroke-dashoffset 0.2s linear' }}
          />
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs font-medium uppercase tracking-widest text-ink-400">
            {running ? statusLabel : '待开始'}
          </span>
          <span className={`mt-2 bg-gradient-to-br bg-clip-text text-6xl font-bold text-transparent ${gradient}`}>
            {formatTime(remaining)}
          </span>
          <span className="mt-2 inline-flex items-center gap-2 rounded-full border border-petal-100 bg-surface px-3 py-1 text-xs text-ink-500 shadow-card">
            <span>🍅</span>
            今日完成 <span className="font-semibold text-petal-600">{todayCount}</span> 颗
          </span>
        </div>
      </div>

      {/* 按钮 */}
      <div className="mt-8 flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-2xl border border-petal-100 bg-surface px-5 py-3 text-sm font-medium text-ink-500 shadow-card transition hover:bg-petal-50 hover:text-ink-700"
        >
          ↺ 重置
        </button>
        <button
          type="button"
          onClick={toggleRun}
          className={`rounded-2xl px-8 py-3 text-sm font-semibold text-white shadow-soft transition active:scale-95 ${
            running
              ? 'bg-gradient-to-br from-lavender-400 to-lavender-500 hover:brightness-105'
              : 'bg-gradient-to-br from-petal-400 to-petal-500 hover:brightness-105'
          }`}
        >
          {running ? '⏸ 暂停' : '▶ 开始'}
        </button>
      </div>

      <p className="mt-6 text-xs text-ink-400">
        小提示：首次使用请在本页点击一次「开始」后允许通知权限～
      </p>
    </div>
  )
}
