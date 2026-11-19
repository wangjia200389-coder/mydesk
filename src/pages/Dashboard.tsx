import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { useTodoStore } from '@/store/useTodoStore'
import { usePomodoroStore } from '@/store/usePomodoroStore'
import { useItemStore } from '@/store/useItemStore'
import { isExpiringSoon } from '@/lib/itemsUtil'
import {
  getNoteColor,
  useNotesStore,
  type Note,
} from '@/store/useNotesStore'

dayjs.locale('zh-cn')

function useNow(tickMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), tickMs)
    return () => window.clearInterval(id)
  }, [tickMs])
  return now
}

function greetingByHour(h: number) {
  if (h < 5) return '夜深啦，注意休息呀 🌙'
  if (h < 11) return '早上好，元气满满的一天 ☀️'
  if (h < 14) return '中午好，别忘了吃午饭哦 🍚'
  if (h < 18) return '下午好，进度过半啦 ☕'
  if (h < 22) return '晚上好，稍微放松一下 🌸'
  return '夜里啦，早点睡哦 🌙'
}

interface StatProps {
  label: string
  value: React.ReactNode
  icon: string
  accent: 'petal' | 'lavender' | 'mint' | 'butter'
}

const accentMap: Record<StatProps['accent'], string> = {
  petal: 'bg-petal-100 text-petal-600',
  lavender: 'bg-lavender-200 text-lavender-500',
  mint: 'bg-mint-200 text-mint-500',
  butter: 'bg-butter-300 text-ink-700',
}

function StatCard(props: StatProps) {
  return (
    <div className="rounded-2xl border border-petal-100 bg-surface/90 p-5 shadow-card backdrop-blur transition-transform hover:-translate-y-0.5">
      <div
        className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl text-xl ${accentMap[props.accent]}`}
      >
        {props.icon}
      </div>
      <p className="text-2xl font-semibold text-ink-900">{props.value}</p>
      <p className="mt-1 text-sm text-ink-400">{props.label}</p>
    </div>
  )
}

interface QuickCard {
  to: string
  icon: string
  title: string
  desc: string
  accent: 'petal' | 'lavender' | 'mint' | 'butter'
}

const quickBgMap: Record<QuickCard['accent'], string> = {
  petal: 'from-petal-50 to-petal-100 hover:from-petal-100 hover:to-petal-200',
  lavender: 'from-lavender-200 to-lavender-300/70 hover:from-lavender-300 hover:to-lavender-300',
  mint: 'from-mint-200 to-mint-300/70 hover:from-mint-300 hover:to-mint-300',
  butter: 'from-butter-300/70 to-butter-300 hover:from-butter-300 hover:to-butter-400',
}

function NotePreview({ n }: { n: Note }) {
  const cs = getNoteColor(n.color)
  const blank = !n.title.trim() && !n.content.trim()
  return (
    <Link
      to="/notes"
      className={`flex h-full flex-col rounded-2xl p-4 ring-1 transition hover:-translate-y-0.5 hover:shadow-soft ${cs.bg} ${cs.ring}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className={`h-2.5 w-2.5 rounded-full ${cs.dot}`} />
        <span className="text-[11px] text-ink-400">
          {dayjs(n.updatedAt).format('HH:mm')}
        </span>
      </div>
      <h4 className={`line-clamp-1 text-sm font-semibold text-ink-900 ${blank ? 'italic opacity-60' : ''}`}>
        {n.title || '（无标题）'}
      </h4>
      <p className={`mt-1 line-clamp-4 flex-1 whitespace-pre-wrap text-xs leading-relaxed text-ink-700 ${blank ? 'italic opacity-60' : ''}`}>
        {n.content || '（空白便签）'}
      </p>
    </Link>
  )
}

export default function Dashboard() {
  const now = useNow(1000)
  const d = dayjs(now)
  const dateStr = d.format('YYYY年MM月DD日 dddd')
  const timeStr = d.format('HH:mm:ss')
  const greeting = greetingByHour(d.hour())

  const todos = useTodoStore((s) => s.todos)
  const todayPomodoros = usePomodoroStore((s) => s.todayCount)
  const notes = useNotesStore((s) => s.notes)
  const items = useItemStore((s) => s.items)

  const itemStats = useMemo(() => {
    const normal = items.filter((i) => i.status === 'normal' && !i.isDraft)
    const expiring = normal.filter((i) => isExpiringSoon(i, 7)).length
    return { total: normal.length, expiring }
  }, [items])

  const todoStats = useMemo(() => {
    const total = todos.length
    const done = todos.filter((t) => t.done).length
    const active = total - done
    const percent = total > 0 ? Math.round((done / total) * 100) : 0
    return { total, done, active, percent }
  }, [todos])

  const latestNotes = useMemo(
    () => [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3),
    [notes],
  )

  const quickCards: QuickCard[] = [
    {
      to: '/todo',
      icon: '✅',
      title: '待办清单',
      desc: `还有 ${todoStats.active} 件事等你处理`,
      accent: 'petal',
    },
    {
      to: '/pomodoro',
      icon: '🍅',
      title: '开始专注',
      desc: `今天已完成 ${todayPomodoros} 颗番茄`,
      accent: 'lavender',
    },
    {
      to: '/notes',
      icon: '🗒️',
      title: '便签本',
      desc: `共 ${notes.length} 张便签可随时翻阅`,
      accent: 'mint',
    },
    {
      to: '/items',
      icon: '📦',
      title: '个人物品',
      desc:
        itemStats.expiring > 0
          ? `有 ${itemStats.expiring} 件物品即将过期`
          : `共 ${itemStats.total} 件物品`,
      accent: 'petal',
    },
    {
      to: '/todo',
      icon: '✨',
      title: '快速添加',
      desc: '记一件今天要做的小事',
      accent: 'butter',
    },
  ]

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      {/* 问候 + 实时时间 */}
      <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-sm text-ink-400">{dateStr}</p>
          <h1 className="mt-1 text-3xl font-semibold text-ink-900">
            欢迎回来 🌸
          </h1>
          <p className="mt-2 text-sm text-ink-500">{greeting}</p>
        </div>
        <div className="rounded-2xl border border-petal-100 bg-surface/80 px-6 py-4 text-right shadow-card backdrop-blur">
          <p className="text-xs uppercase tracking-widest text-ink-400">
            当前时间
          </p>
          <p className="mt-0.5 bg-gradient-to-br from-petal-500 via-lavender-500 to-mint-500 bg-clip-text text-3xl font-bold tabular-nums text-transparent">
            {timeStr}
          </p>
        </div>
      </header>

      {/* 统计卡：待办三围 + 今日番茄 */}
      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon="📋"
          label="待办 · 总数"
          value={todoStats.total}
          accent="petal"
        />
        <StatCard
          icon="☘️"
          label="待办 · 未完成"
          value={todoStats.active}
          accent="mint"
        />
        <StatCard
          icon="🎉"
          label="待办 · 已完成"
          value={`${todoStats.done} (${todoStats.percent}%)`}
          accent="lavender"
        />
        <StatCard
          icon="🍅"
          label="今日番茄"
          value={`${todayPomodoros} 颗`}
          accent="butter"
        />
      </section>

      {/* 快捷入口卡片 */}
      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-lg font-semibold text-ink-900">快捷入口</h2>
          <span className="text-xs text-ink-400">点击卡片前往对应模块</span>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {quickCards.map((c) => (
            <Link
              key={c.to + c.title}
              to={c.to}
              className={`rounded-2xl border border-white/60 bg-gradient-to-br p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-soft ${quickBgMap[c.accent]}`}
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/70 text-2xl shadow-card">
                {c.icon}
              </div>
              <h3 className="text-base font-semibold text-ink-900">{c.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">{c.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* 最新 3 条便签 */}
      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-lg font-semibold text-ink-900">最新便签</h2>
          <Link
            to="/notes"
            className="text-xs font-medium text-petal-600 hover:text-petal-500"
          >
            查看全部 →
          </Link>
        </div>
        {latestNotes.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {latestNotes.map((n) => (
              <NotePreview key={n.id} n={n} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-petal-200 bg-surface/60 py-14 text-center shadow-card">
            <div className="mb-2 text-4xl">🗒️</div>
            <p className="text-sm text-ink-500">
              还没有便签～
              <Link to="/notes" className="ml-1 text-petal-600 hover:text-petal-500">
                去写第一张吧
              </Link>
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
