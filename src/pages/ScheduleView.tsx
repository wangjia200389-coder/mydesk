import { Fragment, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { buildPresetSlots, PRESET_TEACHERS } from '@/lib/presetSchedule'
import {
  DAYS,
  PERIODS,
  buildTeacherColorMap,
  compareTeachers,
  shortClass,
  surnameOf,
} from '@/lib/scheduleTimes'
import type { ScheduleEntry } from '@/store/useHomeworkStore'

/**
 * 课表（阅读版）：点「教学工具」右上角 🗓️ 直接进来，
 * 呈现完整、无需编辑的预置课表（高三地理组五位老师 + 晚自习）。
 * 排版参考「研究生综合服务」课表：日期表头 + 左侧节次时间列 + 细线分格，
 * 手机竖屏不滑动即可一眼看全整周；编辑请走右上角 ✏️ 进入 /courses。
 */

function todayDayOfWeek() {
  const d = new Date().getDay()
  return d === 0 ? 7 : d
}

const MY_NAME = '宋宇轩'
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]

/** 自己的课：内白边 + 淡粉柔光（比普通格子明显一档，柔和不刺眼） */
const SELF_SHADOW =
  'inset 0 0 0 2px rgba(255,255,255,0.95), 0 3px 10px -3px rgba(236,72,153,0.7)'
const NORMAL_SHADOW = 'none'

function isSelf(e: ScheduleEntry): boolean {
  return !!(e.isSelf || (MY_NAME && (e.teacherName ?? '').includes(MY_NAME)))
}

/** 多老师时段：自己的课优先显示，其余按姓氏拼音取第一位 */
function topEntry(entries: ScheduleEntry[]): ScheduleEntry {
  return (
    entries.find((e) => isSelf(e)) ??
    [...entries].sort((a, b) => compareTeachers(a.teacherName, b.teacherName))[0]!
  )
}

/** 本周周一，以及周一~周日各自的日期数字 */
function weekDates() {
  const now = new Date()
  const dow = now.getDay() === 0 ? 7 : now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - (dow - 1))
  return {
    month: monday.getMonth() + 1,
    dates: ALL_DAYS.map((i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i - 1)
      return d.getDate()
    }),
  }
}

export default function ScheduleView() {
  const navigate = useNavigate()
  /** 多老师时段详情（点格子弹出，阅读版只读） */
  const [detail, setDetail] = useState<{
    dayLabel: string
    periodLabel: string
    startTime: string
    endTime: string
    isEvening: boolean
    entries: ScheduleEntry[]
  } | null>(null)

  const slots = useMemo(() => buildPresetSlots(''), [])

  /** dayOfWeek → startTime → entries */
  const grid = useMemo(() => {
    const m = new Map<number, Map<string, ScheduleEntry[]>>()
    for (const s of slots) {
      if (!m.has(s.dayOfWeek)) m.set(s.dayOfWeek, new Map())
      m.get(s.dayOfWeek)!.set(s.startTime, s.entries)
    }
    return m
  }, [slots])

  /** 老师 → 颜色：我的课固定柔粉，其余按拼音分配（与编辑页同一规则） */
  const teacherColorMap = useMemo(
    () => buildTeacherColorMap([...PRESET_TEACHERS], MY_NAME),
    [],
  )

  const today = todayDayOfWeek()
  const { month, dates } = useMemo(weekDates, [])

  const myDayCount = slots.reduce(
    (n, s) => n + (s.entries ?? []).filter((e) => isSelf(e) && s.startTime < '18:00').length,
    0,
  )
  const myEveningDays = Array.from(
    new Set(
      slots
        .filter((s) => s.startTime >= '18:00' && (s.entries ?? []).some((e) => isSelf(e)))
        .map((s) => s.dayOfWeek),
    ),
  ).sort((a, b) => a - b)

  return (
    <div className="mx-auto max-w-3xl px-3 py-5 md:px-6">
      {/* 顶栏 */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          title="返回"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-petal-100 text-lg text-petal-600 transition-colors hover:bg-petal-200"
        >
          ←
        </button>
        <div className="min-w-0 flex-1 text-center">
          <h1 className="text-lg font-bold text-ink-900">🗓️ 我的课表</h1>
          <p className="text-[11px] text-ink-400">2026 年下期 · 高三地理组 · 全部为地理课</p>
        </div>
        <Link
          to="/courses"
          title="编辑课表"
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-cream-deep px-3 text-xs font-medium text-ink-500 transition-colors hover:bg-petal-50 hover:text-petal-600"
        >
          ✏️ 编辑
        </Link>
      </div>

      {/* 概览 */}
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-petal-100/80 px-3 py-1 text-xs font-semibold text-petal-700">
          📖 白天 {myDayCount} 节
        </span>
        <span className="rounded-full bg-lavender-100/80 px-3 py-1 text-xs font-semibold text-ink-600">
          🌙 晚自习{' '}
          {myEveningDays.length > 0
            ? myEveningDays.map((d) => '周' + DAYS.find((x) => x.key === d)?.short).join('、')
            : '无'}
        </span>
      </div>

      {/* 整周课表：细线分格，一屏看全 */}
      <div className="rounded-2xl bg-surface p-1.5 shadow-card">
        <div
          className="grid gap-px rounded-xl bg-lavender-100/70"
          style={{ gridTemplateColumns: '3.2rem repeat(7, 1fr)' }}
        >
          {/* 表头：月份 + 日期/星期 */}
          <div className="flex flex-col items-start justify-end bg-surface px-1 pb-1.5 pt-2">
            <span className="text-[11px] font-bold text-ink-500">{month}月</span>
          </div>
          {ALL_DAYS.map((dkey) => {
            const isToday = dkey === today
            return (
              <div
                key={dkey}
                className={`flex flex-col items-center py-1.5 ${
                  isToday ? 'bg-petal-50' : 'bg-surface'
                }`}
              >
                <span
                  className={`text-[13px] font-bold leading-tight ${
                    isToday ? 'text-petal-600' : 'text-ink-700'
                  }`}
                >
                  {String(dates[dkey - 1]).padStart(2, '0')}
                </span>
                <span
                  className={`text-[10px] leading-tight ${
                    isToday ? 'font-bold text-petal-500' : 'text-ink-400'
                  }`}
                >
                  {'周' + DAYS.find((x) => x.key === dkey)!.short}
                </span>
              </div>
            )
          })}

          {PERIODS.map((p, idx) => {
            const isFirstEvening = p.kind === 'evening' && PERIODS[idx - 1]?.kind !== 'evening'
            return (
              <Fragment key={p.start}>
                {isFirstEvening && (
                  <div
                    style={{ gridColumn: '1 / -1' }}
                    className="bg-gradient-to-r from-lavender-100/80 to-petal-50/80 py-1 text-center text-[10px] font-bold tracking-[0.35em] text-ink-400"
                  >
                    🌙 晚自习
                  </div>
                )}
                {/* 左侧节次 + 时间 */}
                <div className="flex flex-col items-start justify-center bg-surface px-1 py-1">
                  <span
                    className={`text-[10px] font-bold leading-tight ${
                      p.kind === 'evening' ? 'text-ink-500' : 'text-ink-600'
                    }`}
                  >
                    {p.label}
                  </span>
                  <span className="text-[9px] leading-tight text-ink-400">{p.start}</span>
                  <span className="text-[9px] leading-tight text-ink-300">{p.end}</span>
                </div>
                {/* 七天格子 */}
                {ALL_DAYS.map((dkey) => {
                  const entries = grid.get(dkey)?.get(p.start) ?? []
                  const isEmpty = entries.length === 0
                  const top = isEmpty ? null : topEntry(entries)
                  const self = top ? isSelf(top) : false
                  const color = top?.teacherName
                    ? teacherColorMap.get(top.teacherName) ?? '#eef1f5'
                    : '#eef1f5'
                  const isToday = dkey === today
                  const multi = entries.length > 1
                  return (
                    <button
                      type="button"
                      key={p.start + '-' + dkey}
                      onClick={() =>
                        multi &&
                        setDetail({
                          dayLabel: DAYS.find((x) => x.key === dkey)!.label,
                          periodLabel: p.label,
                          startTime: p.start,
                          endTime: p.end,
                          isEvening: p.kind === 'evening',
                          entries,
                        })
                      }
                      title={multi ? `点击查看 ${entries.length} 位老师的课` : undefined}
                      className={`relative flex min-h-[3rem] flex-col items-center justify-center overflow-hidden px-0.5 py-1 transition ${
                        multi ? 'cursor-pointer active:scale-95' : ''
                      } ${isEmpty ? (isToday ? 'bg-petal-50/50' : 'bg-surface') : ''}`}
                      style={
                        isEmpty
                          ? undefined
                          : {
                              margin: 2,
                              borderRadius: 8,
                              backgroundColor: color,
                              boxShadow: self ? SELF_SHADOW : NORMAL_SHADOW,
                            }
                      }
                    >
                      {!isEmpty && top && (
                        <>
                          <p
                            className={`w-full truncate text-center text-[12px] leading-tight text-ink-900 ${
                              self ? 'font-extrabold' : 'font-semibold'
                            }`}
                          >
                            {surnameOf(top.teacherName)}
                          </p>
                          <p className="w-full truncate text-center text-[10px] leading-tight text-ink-700/75">
                            {shortClass(top.classLabel)}
                          </p>
                        </>
                      )}
                      {entries.length > 1 && (
                        <span
                          title="该时段还有其他老师的课"
                          className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-white/95 shadow-sm"
                        />
                      )}
                      {/* 自己的课：右上角小粉点，低调但认得出 */}
                      {self && (
                        <span className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-petal-400" />
                      )}
                    </button>
                  )
                })}
              </Fragment>
            )
          })}
        </div>
      </div>

      {/* 老师颜色图例 */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 rounded-2xl bg-surface px-3.5 py-2.5 shadow-card">
        {Array.from(teacherColorMap.entries())
          .sort((a, b) => compareTeachers(a[0], b[0]))
          .map(([name, color]) => {
            const self = name.includes(MY_NAME)
            return (
              <span
                key={name}
                className={`inline-flex items-center gap-1.5 text-[11px] ${
                  self ? 'font-bold text-petal-600' : 'text-ink-500'
                }`}
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{
                    backgroundColor: color,
                    boxShadow: self ? 'inset 0 0 0 1.5px rgba(255,255,255,0.95)' : undefined,
                  }}
                />
                {name}
                {self ? '（我）' : ''}
              </span>
            )
          })}
        <span className="text-[11px] text-ink-300">白边柔光 = 我的课</span>
      </div>

      <p className="mt-2 px-1 text-center text-[11px] text-ink-300">
        晚自习：周二 晚3-晚6 · 周五 晚1-晚2（2406 班）· 周末暂无排课
      </p>

      {/* 多老师时段详情（只读） */}
      {detail && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-ink-900/40 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-surface p-5 shadow-soft sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-base font-semibold text-ink-900">
                {detail.dayLabel} · {detail.periodLabel}
              </h3>
              <button
                type="button"
                onClick={() => setDetail(null)}
                title="关闭"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-cream-deep text-ink-500 transition hover:bg-petal-50"
              >
                ✕
              </button>
            </div>
            <p className="mb-4 text-xs text-ink-400">
              {detail.startTime} - {detail.endTime}
              {detail.isEvening ? ' · 晚自习' : ''} · 共 {detail.entries.length} 位老师
            </p>

            <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
              {[...detail.entries]
                .sort((a, b) => {
                  const sa = isSelf(a) ? 0 : 1
                  const sb = isSelf(b) ? 0 : 1
                  return sa !== sb ? sa - sb : compareTeachers(a.teacherName, b.teacherName)
                })
                .map((entry) => {
                  const self = isSelf(entry)
                  const color = entry.teacherName
                    ? teacherColorMap.get(entry.teacherName) ?? '#e2e8f0'
                    : '#e2e8f0'
                  return (
                    <div
                      key={(entry.teacherName ?? '') + (entry.classLabel ?? '')}
                      className={`flex items-center gap-3 rounded-2xl p-3 ${
                        self ? 'ring-2 ring-petal-300' : ''
                      }`}
                      style={{ backgroundColor: color + '33' }}
                    >
                      <span
                        className="h-9 w-9 shrink-0 rounded-xl"
                        style={{ backgroundColor: color }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
                          {entry.teacherName || '未填老师'}
                          {self && (
                            <span className="rounded-full bg-petal-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                              我
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-ink-600">
                          {entry.classLabel || '未填班级'}
                          {detail.isEvening ? ' · 晚自习' : ' · 地理'}
                          {entry.location ? ` · ${entry.location}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-ink-400">
                        {shortClass(entry.classLabel)}
                      </span>
                    </div>
                  )
                })}
            </div>

            <button
              type="button"
              onClick={() => setDetail(null)}
              className="mt-5 w-full rounded-2xl bg-cream-deep py-2.5 text-sm font-medium text-ink-600 transition hover:bg-petal-50"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
