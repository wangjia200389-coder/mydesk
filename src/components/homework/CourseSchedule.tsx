import { memo, useEffect, useMemo, useRef, useState, Fragment } from 'react'
import {
  useHomeworkStore,
  type ScheduleEntry,
  type ScheduleSlot,
  type Subject,
} from '@/store/useHomeworkStore'
import FileUploadButton from '@/components/FileUploadButton'
import { isCloudOcrEnabled } from '@/lib/cloudOcr'
import { usePasteUpload } from '@/lib/upload'
import {
  parseOcrImageTable,
  parseOcrImageTableCloud,
  parseScheduleExcel,
  parseTeacherSheetsExcel,
  type ParsedScheduleSlot,
} from '@/lib/scheduleParser'
import {
  DAYS,
  PERIODS,
  buildTeacherColorMap,
  compareTeachers,
  shortClass,
  surnameOf,
  type PeriodOption,
} from '@/lib/scheduleTimes'
import { buildPresetSlots, PRESET_TEACHERS, PRESET_SELF_NAME } from '@/lib/presetSchedule'
import ScheduleEditSheet, { type SheetSavePayload } from './ScheduleEditSheet'
import PeriodEditSheet from './PeriodEditSheet'
import SlotDetailSheet, { type SlotDetailItem } from './SlotDetailSheet'

const MY_NAME_KEY = 'my-desk:schedule-my-name'
const COLOR_BY_KEY = 'my-desk:schedule-color-by'

function loadPref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function savePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 忽略隐私模式写入失败 */
  }
}

function todayDayOfWeek() {
  const d = new Date().getDay()
  return d === 0 ? 7 : d
}

function labelOfWeek(w: string): string {
  return w ? `周表${w}` : '默认表'
}

function isSelfEntry(e: ScheduleEntry, myName: string): boolean {
  return !!(
    e.isSelf ||
    (myName.trim() && (e.teacherName ?? '').includes(myName.trim()))
  )
}

/**
 * 多老师同节次时，挑选要展示在格子里的那一条。
 * 优先级：① isSelf / 我的姓名匹配；② 其余按姓氏拼音首字母升序。
 */
function pickTopEntry(entries: ScheduleEntry[], myName: string): ScheduleEntry {
  if (entries.length === 0) throw new Error('entries empty')
  return (
    entries.find((e) => isSelfEntry(e, myName)) ??
    [...entries].sort((a, b) => compareTeachers(a.teacherName, b.teacherName))[0]!
  )
}

/** 详情弹层用：自己的课在前，其余按姓氏拼音 */
function sortEntriesForDisplay(entries: ScheduleEntry[], myName: string): ScheduleEntry[] {
  return [...entries].sort((a, b) => {
    const sa = isSelfEntry(a, myName) ? 0 : 1
    const sb = isSelfEntry(b, myName) ? 0 : 1
    if (sa !== sb) return sa - sb
    return compareTeachers(a.teacherName, b.teacherName)
  })
}

interface GridPeriod {
  startTime: string
  endTime: string
  label: string
  kind: PeriodOption['kind']
  index: number
}

export default memo(function CourseSchedule({
  classId,
  onBack,
}: {
  classId: string
  onBack?: () => void
}) {
  const subjects = useHomeworkStore((s) => s.subjects)
  const allSlots = useHomeworkStore((s) => s.scheduleSlots)
  const addSubject = useHomeworkStore((s) => s.addSubject)
  const addScheduleSlot = useHomeworkStore((s) => s.addScheduleSlot)
  const updateScheduleSlot = useHomeworkStore((s) => s.updateScheduleSlot)
  const removeScheduleSlot = useHomeworkStore((s) => s.removeScheduleSlot)
  const removeScheduleSlots = useHomeworkStore((s) => s.removeScheduleSlots)
  const renameScheduleWeekType = useHomeworkStore((s) => s.renameScheduleWeekType)

  const [notice, setNotice] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrStatus, setOcrStatus] = useState('')
  const [ocrDrafts, setOcrDrafts] = useState<ParsedScheduleSlot[] | null>(null)

  const [myName, setMyName] = useState(() => loadPref(MY_NAME_KEY, ''))
  const [colorBy, setColorBy] = useState<'subject' | 'teacher'>(() =>
    loadPref(COLOR_BY_KEY, 'subject') === 'teacher' ? 'teacher' : 'subject',
  )
  /** 用户是否已手动选过上色方式；没选过则交给下面的智能判断 */
  const colorByManual = useRef(loadPref(COLOR_BY_KEY, '') !== '')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [activeWeek, setActiveWeek] = useState('')
  const [newWeekName, setNewWeekName] = useState('')

  const [selSubject, setSelSubject] = useState('')
  const [selClass, setSelClass] = useState('')
  const [selTeacher, setSelTeacher] = useState('')

  const [editing, setEditing] = useState<{
    day: number
    periodIndex: number
    slot: ScheduleSlot | null
  } | null>(null)

  const [detail, setDetail] = useState<{
    day: number
    periodIndex: number
    slot: ScheduleSlot
  } | null>(null)

  const [editingPeriod, setEditingPeriod] = useState<
    | {
        startTime: string
        endTime: string
        label: string
      }
    | null
  >(null)

  const [renamingWeek, setRenamingWeek] = useState<string | null>(null)

  const classSlots = useMemo(
    () => allSlots.filter((x) => x.classId === classId),
    [allSlots, classId],
  )

  /**
   * 找默认科目的 id。
   * 优先级：① 名称为「地理」的科目；② 第一个已存在科目；③ 现场创建「地理」。
   */
  const ensureDefaultSubjectId = (): string => {
    const geo = subjects.find((s) => s.name.trim() === '地理')
    if (geo) return geo.id
    if (subjects.length > 0) return subjects[0]!.id
    return addSubject('地理')
  }
  const defaultSubjectId = useMemo(() => {
    const geo = subjects.find((s) => s.name.trim() === '地理')
    if (geo) return geo.id
    if (subjects.length > 0) return subjects[0]!.id
    return ''
  }, [subjects])

  /** 周表列表：默认表（''）+ 已存在的自定义表 */
  const weekTypes = useMemo(() => {
    const set = new Set<string>()
    for (const s of classSlots) {
      const w = s.weekType ?? ''
      if (w) set.add(w)
    }
    return ['', ...Array.from(set)]
  }, [classSlots])

  const slots = useMemo(
    () => classSlots.filter((x) => (x.weekType ?? '') === activeWeek),
    [classSlots, activeWeek],
  )

  const subjectMap = useMemo(
    () => new Map<string, Subject>(subjects.map((s) => [s.id, s])),
    [subjects],
  )

  /** 当前周表内的老师（筛选下拉 / 输入提示用） */
  const teacherNames = useMemo(() => {
    const set = new Set<string>()
    for (const s of slots) {
      for (const e of s.entries ?? []) if (e.teacherName) set.add(e.teacherName)
    }
    return Array.from(set)
  }, [slots])

  /**
   * 老师 → 稳定颜色。
   * 取整个班级（跨周表）的老师清单来分配，保证切换周表时同一老师颜色不变。
   * 我的课固定柔粉（selfName 优先），其余老师按拼音从剩余颜色取。
   */
  const teacherColorMap = useMemo(() => {
    const names: string[] = []
    for (const s of classSlots) {
      for (const e of s.entries ?? []) if (e.teacherName) names.push(e.teacherName)
    }
    return buildTeacherColorMap(names, myName.trim() || PRESET_SELF_NAME)
  }, [classSlots, myName])

  // 智能默认：课表里出现多位老师且用户从未手动选过，自动切到「按老师」上色。
  useEffect(() => {
    if (colorByManual.current) return
    if (teacherNames.length >= 2) {
      setColorBy('teacher')
      colorByManual.current = true
    }
  }, [teacherNames])

  const classLabels = useMemo(() => {
    const set = new Set<string>()
    for (const s of slots) {
      for (const e of s.entries ?? []) if (e.classLabel) set.add(e.classLabel)
    }
    return Array.from(set)
  }, [slots])

  /** 展示的节次：模板 15 节（9 白天 + 6 晚自习）∪ 已有数据的自定义时间 */
  const periods = useMemo<GridPeriod[]>(() => {
    const map = new Map<string, GridPeriod>()
    for (const p of PERIODS) {
      map.set(p.start, {
        startTime: p.start,
        endTime: p.end,
        label: p.label,
        kind: p.kind,
        index: p.index,
      })
    }
    for (const s of slots) {
      if (!map.has(s.startTime)) {
        map.set(s.startTime, {
          startTime: s.startTime,
          endTime: s.endTime,
          label: s.startTime,
          kind: s.startTime >= '18:00' ? 'evening' : 'day',
          index: Number(s.startTime.slice(0, 2)) || 90,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.index !== b.index ? a.index - b.index : a.startTime.localeCompare(b.startTime),
    )
  }, [slots])

  /** dayOfWeek → startTime → slot */
  const grid = useMemo(() => {
    const m = new Map<number, Map<string, ScheduleSlot>>()
    for (const s of slots) {
      if (!m.has(s.dayOfWeek)) m.set(s.dayOfWeek, new Map())
      const dayMap = m.get(s.dayOfWeek)!
      if (!dayMap.has(s.startTime)) dayMap.set(s.startTime, s)
    }
    return m
  }, [slots])

  const today = todayDayOfWeek()
  const daysToShow = [1, 2, 3, 4, 5, 6, 7]

  usePasteUpload((files) => {
    const excel = files.find(
      (f) => f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.csv'),
    )
    const image = files.find((f) => f.type.startsWith('image/'))
    if (excel) void handleExcel(excel)
    if (image) void handleImage(image)
  })

  /* ---------------------------------------------------------------- */
  /* 导入                                                              */
  /* ---------------------------------------------------------------- */

  /** 把解析结果写入当前周表：同位置已存在则合并，否则新建（实时读 store，避免批量改动后闭包旧数据） */
  const commitParsed = (parsed: ParsedScheduleSlot[]) => {
    const liveSlots = useHomeworkStore.getState().scheduleSlots
    let created = 0
    for (const s of parsed) {
      const existing = liveSlots.find(
        (x) =>
          x.classId === classId &&
          (x.weekType ?? '') === activeWeek &&
          x.dayOfWeek === s.dayOfWeek &&
          x.startTime === s.startTime,
      )
      if (existing) {
        const merged = [...(existing.entries ?? []), ...s.entries]
        updateScheduleSlot(existing.id, { entries: merged, weekType: activeWeek })
      } else {
        addScheduleSlot({
          classId,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          entries: s.entries,
          weekType: activeWeek,
        })
        created += 1
      }
    }
    return created
  }

  /** 一键导入预置课表（地理组四位老师 + 晚自习），覆盖当前周表 */
  const importPreset = () => {
    const label = labelOfWeek(activeWeek)
    const msg =
      slots.length > 0
        ? `将清空「${label}」现有的 ${slots.length} 个时间段，并写入预置课表（${PRESET_TEACHERS.join('、')} + 晚自习），确定吗？`
        : `将预置课表（${PRESET_TEACHERS.join('、')} + 晚自习）写入「${label}」，确定吗？`
    if (!window.confirm(msg)) return
    const geoId = ensureDefaultSubjectId()
    if (slots.length > 0) removeScheduleSlots(slots.map((s) => s.id))
    const created = commitParsed(buildPresetSlots(geoId))
    // 预置课表属于「宋宇轩」，顺便帮用户填好姓名并切到按老师上色
    if (!myName.trim()) {
      setMyName(PRESET_SELF_NAME)
      savePref(MY_NAME_KEY, PRESET_SELF_NAME)
    }
    setColorBy('teacher')
    savePref(COLOR_BY_KEY, 'teacher')
    colorByManual.current = true
    setNotice(`已写入预置课表：${created} 个时间段，你的课已自动高亮`)
  }

  async function handleExcel(file: File) {
    if (!/\.(xlsx?|csv)$/i.test(file.name)) {
      setNotice('请上传 Excel 文件（.xlsx/.xls/.csv）')
      return
    }
    setParsing(true)
    setNotice(null)
    setOcrDrafts(null)
    try {
      const addSub = (name: string) => addSubject(name)
      let parsed = await parseScheduleExcel(file, addSub)
      if (parsed.length === 0) parsed = await parseTeacherSheetsExcel(file, addSub)
      if (parsed.length === 0) {
        setNotice('未解析到有效课程数据，请检查表头与内容')
        return
      }
      const created = commitParsed(parsed)
      setNotice(`已导入到「${labelOfWeek(activeWeek)}」，新增 ${created} 个时间段`)
    } catch (e) {
      setNotice(`解析失败：${e instanceof Error ? e.message : '未知错误'}`)
    } finally {
      setParsing(false)
    }
  }

  async function handleImage(file: File) {
    if (!file.type.startsWith('image/')) {
      setNotice('请上传图片文件')
      return
    }
    const useCloud = isCloudOcrEnabled()
    setParsing(true)
    setOcrProgress(0)
    setOcrStatus(useCloud ? '云端 OCR 高清识别中…' : '正在定位表格...')
    setNotice(null)
    setOcrDrafts(null)
    try {
      const drafts = useCloud
        ? await parseOcrImageTableCloud(file, (name) => addSubject(name), (p) => {
            setOcrStatus(p.status)
            setOcrProgress(p.progress)
          })
        : await parseOcrImageTable(file, (name) => addSubject(name), (p) => {
            setOcrStatus(p.status)
            setOcrProgress(p.progress)
          })
      if (drafts.length === 0) {
        setNotice(
          useCloud
            ? '云端 OCR 未识别到课程文字，请换一张更清晰、文字更大的截图再试'
            : '图片未识别到课程文字，建议先裁剪为清晰截图再试',
        )
        return
      }
      setOcrDrafts(drafts)
      const engine = useCloud ? '云端 OCR' : '本地识别'
      setNotice(`图片${engine}完成，共 ${drafts.length} 条记录，请在下方校对后确认导入`)
    } catch (e) {
      setNotice(`图片识别失败：${e instanceof Error ? e.message : '未知错误'}`)
    } finally {
      setParsing(false)
      setOcrProgress(0)
      setOcrStatus('')
    }
  }

  const applyOcrDrafts = (mapped: ParsedScheduleSlot[]) => {
    const created = commitParsed(mapped)
    setOcrDrafts(null)
    setNotice(`已导入到「${labelOfWeek(activeWeek)}」，新增 ${created} 个时间段`)
  }

  /* ---------------------------------------------------------------- */
  /* 编辑：点击格子                                                     */
  /* ---------------------------------------------------------------- */

  const openCell = (day: number, startTime: string) => {
    const slot = grid.get(day)?.get(startTime) ?? null
    const pIndex = PERIODS.find((p) => p.start === startTime)?.index ?? 1
    const entries = slot?.entries ?? []
    // 多位老师：先弹详情层，再决定是否编辑
    if (slot && entries.length > 1) {
      setDetail({ day, periodIndex: pIndex, slot })
      return
    }
    // 空格新建时若还没有「地理」科目，顺手建一个
    if (!slot) ensureDefaultSubjectId()
    setEditing({ day, periodIndex: pIndex, slot })
  }

  const handleSheetSave = (payload: SheetSavePayload) => {
    const origin = editing?.slot ?? null
    const samePlace =
      origin &&
      origin.dayOfWeek === payload.dayOfWeek &&
      origin.startTime === payload.startTime &&
      (origin.weekType ?? '') === payload.weekType

    if (samePlace) {
      updateScheduleSlot(origin.id, { entries: payload.entries })
    } else {
      // 迁移：先清掉原位置的重复数据，再写入目标位置
      const dupIds = allSlots
        .filter(
          (x) =>
            x.classId === classId &&
            (x.weekType ?? '') === (origin?.weekType ?? '') &&
            x.dayOfWeek === origin?.dayOfWeek &&
            x.startTime === origin?.startTime,
        )
        .map((x) => x.id)
      if (dupIds.length > 0) removeScheduleSlots(dupIds)

      const target = allSlots.find(
        (x) =>
          x.classId === classId &&
          (x.weekType ?? '') === payload.weekType &&
          x.dayOfWeek === payload.dayOfWeek &&
          x.startTime === payload.startTime,
      )
      if (target && !dupIds.includes(target.id)) {
        updateScheduleSlot(target.id, {
          entries: [...(target.entries ?? []), ...payload.entries],
        })
      } else if (!target) {
        addScheduleSlot({
          classId,
          dayOfWeek: payload.dayOfWeek,
          startTime: payload.startTime,
          endTime: payload.endTime,
          entries: payload.entries,
          weekType: payload.weekType,
        })
      }
    }
    setEditing(null)
    setNotice(null)
  }

  const handleDeleteSlot = (slotId: string) => {
    removeScheduleSlot(slotId)
    setEditing(null)
  }

  const openPeriodEdit = (p: { startTime: string; endTime: string; label: string }) => {
    setEditingPeriod(p)
  }

  const savePeriodTimes = (newStart: string, newEnd: string) => {
    if (!editingPeriod) return
    const oldStart = editingPeriod.startTime
    const affected = allSlots.filter((x) => x.classId === classId && x.startTime === oldStart)
    for (const s of affected) {
      updateScheduleSlot(s.id, { startTime: newStart, endTime: newEnd })
    }
    setEditingPeriod(null)
    setNotice(
      `已更新${editingPeriod.label}：${newStart} - ${newEnd}（影响 ${affected.length} 个时间段）`,
    )
  }

  /* ---------------------------------------------------------------- */
  /* 批量删除 / 周表管理                                                */
  /* ---------------------------------------------------------------- */

  const clearCurrentWeek = () => {
    if (slots.length === 0) return
    const label = labelOfWeek(activeWeek)
    if (
      !window.confirm(
        `确定清空「${label}」的全部课程吗？共 ${slots.length} 个时间段，此操作不可撤销。`,
      )
    ) {
      return
    }
    removeScheduleSlots(slots.map((s) => s.id))
    setNotice(`已清空「${label}」`)
  }

  const addWeek = () => {
    const name = newWeekName.trim()
    if (!name || weekTypes.includes(name)) return
    setActiveWeek(name)
    setNewWeekName('')
    setNotice(`已切到周表「${name}」`)
  }

  const removeWeek = (w: string) => {
    if (!w) return
    const count = classSlots.filter((x) => (x.weekType ?? '') === w).length
    if (!window.confirm(`删除周表「${w}」及其 ${count} 个时间段的课程？`)) return
    removeScheduleSlots(classSlots.filter((x) => (x.weekType ?? '') === w).map((x) => x.id))
    if (activeWeek === w) setActiveWeek('')
  }

  const submitRenameWeek = (oldName: string, newName: string) => {
    const v = newName.trim()
    if (!v || v === oldName) {
      setRenamingWeek(null)
      return
    }
    if (weekTypes.includes(v)) {
      setNotice(`周表「${v}」已存在`)
      return
    }
    renameScheduleWeekType(oldName, v)
    if (activeWeek === oldName) setActiveWeek(v)
    setNotice(`已把「${oldName}」改名为「${v}」`)
    setRenamingWeek(null)
  }

  const hasFilter = !!(selSubject || selClass || selTeacher)
  const totalCount = slots.reduce((n, s) => n + (s.entries?.length ?? 0), 0)

  return (
    <div className="flex flex-col gap-3">
      {onBack && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-petal-100 text-lg text-petal-600 transition-colors hover:bg-petal-200"
          >
            ←
          </button>
        </div>
      )}

      {/* 操作条：导入 + 设置 */}
      <div className="flex flex-wrap items-center gap-2">
        <FileUploadButton
          accept=".xlsx,.xls,.csv,image/*"
          disabled={parsing}
          onFiles={(files) => {
            const excel = files.find((f) => /\.(xlsx?|csv)$/i.test(f.name))
            const image = files.find((f) => f.type.startsWith('image/'))
            if (excel) void handleExcel(excel)
            if (image) void handleImage(image)
          }}
          className="inline-flex items-center gap-2 rounded-full bg-petal-500 px-4 py-2 text-sm font-semibold text-white shadow-card transition-colors hover:bg-petal-600 disabled:opacity-50"
        >
          {parsing ? '解析中…' : '📥 导入课表'}
        </FileUploadButton>
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          className={`rounded-full px-3 py-2 text-sm transition ${
            settingsOpen ? 'bg-petal-100 text-petal-700' : 'bg-cream-deep text-ink-500 hover:bg-petal-50'
          }`}
        >
          ⚙︎ 设置
        </button>
        <span className="text-xs text-ink-400">
          {totalCount > 0 ? `当前表 ${totalCount} 节课` : '点格子即可加课'}
        </span>
      </div>

      {parsing && (
        <div className="rounded-2xl bg-surface p-3 shadow-card">
          <div className="mb-1 flex justify-between text-[11px] text-ink-500">
            <span>{ocrStatus || '解析中…'}</span>
            <span>{Math.round(ocrProgress * 100)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-petal-100">
            <div
              className="h-full rounded-full bg-petal-500 transition-all"
              style={{ width: `${Math.max(5, Math.round(ocrProgress * 100))}%` }}
            />
          </div>
        </div>
      )}

      {notice && (
        <p className="rounded-xl bg-petal-50 px-3 py-2 text-xs text-petal-700">{notice}</p>
      )}

      {/* 周表切换 */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
        {weekTypes.map((w) => {
          const active = w === activeWeek
          const count = classSlots.filter((x) => (x.weekType ?? '') === w).length
          return (
            <div key={w || '__default'} className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (active && w) {
                    // 自定义周表再次点击 → 重命名
                    setRenamingWeek(w)
                  } else {
                    setActiveWeek(w)
                  }
                }}
                title={active && w ? '点击重命名' : undefined}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  active
                    ? 'bg-petal-500 text-white shadow-card'
                    : 'bg-surface text-ink-500 ring-1 ring-petal-100 hover:bg-petal-50'
                }`}
              >
                {labelOfWeek(w)}
                <span className={`ml-1 text-[11px] ${active ? 'text-white/80' : 'text-ink-300'}`}>
                  {count}
                </span>
              </button>
              {w && active && (
                <button
                  type="button"
                  onClick={() => removeWeek(w)}
                  title="删除该周表"
                  className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-ink-200 text-[9px] text-white transition hover:bg-red-400"
                >
                  ✕
                </button>
              )}
            </div>
          )
        })}
        <div className="flex shrink-0 items-center gap-1">
          <input
            value={newWeekName}
            onChange={(e) => setNewWeekName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addWeek()
            }}
            placeholder="新表(A/B)"
            className="w-24 rounded-full border border-petal-100 bg-surface px-3 py-1.5 text-sm outline-none focus:border-petal-400"
          />
          <button
            type="button"
            onClick={addWeek}
            disabled={!newWeekName.trim()}
            className="rounded-full bg-cream-deep px-3 py-1.5 text-sm text-ink-600 transition hover:bg-petal-50 disabled:opacity-40"
          >
            ＋ 建周表
          </button>
        </div>
      </div>

      {/* OCR 校对 */}
      {ocrDrafts && ocrDrafts.length > 0 && (
        <OcrMappingPanel
          drafts={ocrDrafts}
          subjects={subjects}
          onApply={applyOcrDrafts}
          onCancel={() => setOcrDrafts(null)}
        />
      )}

      {/* 空课表：一键导入预置课表 */}
      {slots.length === 0 && !parsing && !ocrDrafts && (
        <button
          type="button"
          onClick={importPreset}
          className="flex flex-col items-center gap-2 rounded-2xl bg-surface p-6 text-center shadow-card transition hover:bg-petal-50/60"
        >
          <span className="text-3xl">🗓️</span>
          <span className="text-sm font-semibold text-ink-800">
            一键导入我的预置课表（2026 秋 · 地理组）
          </span>
          <span className="text-xs text-ink-400">
            {PRESET_TEACHERS.join('、')} 共 {PRESET_TEACHERS.length} 位老师全部课程 + 你的晚自习，自动按老师配色并高亮你的课
          </span>
        </button>
      )}

      {/* 设置（默认收起） */}
      {settingsOpen && (
        <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-card">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-500">我的姓名</span>
            <input
              value={myName}
              onChange={(e) => {
                setMyName(e.target.value)
                savePref(MY_NAME_KEY, e.target.value)
              }}
              placeholder="用于高亮自己的课"
              className="min-w-0 flex-1 rounded-xl border border-petal-100 bg-cream/60 px-3 py-2 text-sm outline-none focus:border-petal-400"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-petal-50 pt-3">
            <span className="text-sm text-ink-500">筛选</span>
            <select
              value={selSubject}
              onChange={(e) => setSelSubject(e.target.value)}
              className="rounded-xl border border-petal-100 bg-cream/60 px-3 py-1.5 text-sm outline-none focus:border-petal-400"
            >
              <option value="">全部科目</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              value={selTeacher}
              onChange={(e) => setSelTeacher(e.target.value)}
              className="rounded-xl border border-petal-100 bg-cream/60 px-3 py-1.5 text-sm outline-none focus:border-petal-400"
            >
              <option value="">全部老师</option>
              {teacherNames.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={selClass}
              onChange={(e) => setSelClass(e.target.value)}
              className="rounded-xl border border-petal-100 bg-cream/60 px-3 py-1.5 text-sm outline-none focus:border-petal-400"
            >
              <option value="">全部班级</option>
              {classLabels.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {hasFilter && (
              <button
                type="button"
                onClick={() => {
                  setSelSubject('')
                  setSelClass('')
                  setSelTeacher('')
                }}
                className="text-xs text-ink-400 hover:text-petal-600"
              >
                清除
              </button>
            )}
          </div>

          {subjects.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-petal-50 pt-3">
              {subjects.map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-ink-700"
                  style={{ backgroundColor: (s.color || '#cbd5e1') + '33' }}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: s.color || '#94a3b8' }}
                  />
                  {s.name}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-petal-50 pt-3">
            <button
              type="button"
              onClick={importPreset}
              className="rounded-full bg-petal-500 px-4 py-1.5 text-sm font-medium text-white shadow-card transition hover:bg-petal-600"
            >
              📥 导入预置课表
            </button>
            <button
              type="button"
              onClick={clearCurrentWeek}
              disabled={slots.length === 0}
              className="rounded-full border border-red-100 bg-red-50 px-4 py-1.5 text-sm font-medium text-red-500 transition hover:bg-red-100 disabled:opacity-40"
            >
              清空当前周表
            </button>
            <span className="text-[11px] text-ink-400">支持 Excel / 图片，也可直接粘贴截图</span>
          </div>
        </div>
      )}

      {/* 周课表 */}
      <div className="rounded-2xl bg-surface p-3 shadow-card sm:p-4">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink-800">本周课表</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const next = colorBy === 'subject' ? 'teacher' : 'subject'
                setColorBy(next)
                savePref(COLOR_BY_KEY, next)
              }}
              title={colorBy === 'subject' ? '当前按科目上色' : '当前按老师上色'}
              className="rounded-full bg-cream-deep px-2.5 py-1 text-[11px] text-ink-500 transition hover:bg-petal-50"
            >
              {colorBy === 'subject' ? '🎨 按科目' : '🎨 按老师'}
            </button>
            <span className="text-xs text-ink-400">→ 右滑看周末</span>
          </div>
        </div>

        <div className="scrollbar-hide -mx-1 overflow-x-auto px-1">
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `2.9rem repeat(${daysToShow.length}, minmax(3.1rem, 1fr))` }}
          >
            <div className="rounded-lg bg-cream/50" />
            {daysToShow.map((dkey) => {
              const d = DAYS.find((x) => x.key === dkey)!
              const isToday = dkey === today
              return (
                <div
                  key={dkey}
                  className={`rounded-lg py-1.5 text-center text-xs font-bold ${
                    isToday ? 'bg-petal-500 text-white shadow-card' : 'bg-lavender-100 text-ink-700'
                  }`}
                >
                  {d.label}
                </div>
              )
            })}

            {periods.map((p, idx) => {
              const isFirstEvening = p.kind === 'evening' && periods[idx - 1]?.kind !== 'evening'
              return (
                <Fragment key={p.startTime}>
                  {isFirstEvening && (
                    <div
                      style={{ gridColumn: '1 / -1' }}
                      className="mt-1 rounded-lg bg-lavender-100/70 py-1 text-center text-[11px] font-semibold text-ink-500"
                    >
                      🌙 晚自习
                    </div>
                  )}
                  <ScheduleRow
                    period={p}
                    daysToShow={daysToShow}
                    today={today}
                    grid={grid}
                    subjectMap={subjectMap}
                    teacherColorMap={teacherColorMap}
                    colorBy={colorBy}
                    selSubject={selSubject}
                    selClass={selClass}
                    selTeacher={selTeacher}
                    myName={myName}
                    onCellClick={openCell}
                    onPeriodClick={openPeriodEdit}
                    defaultSubjectName="地理"
                  />
                </Fragment>
              )
            })}
          </div>
        </div>

        {/* 老师颜色图例 */}
        {colorBy === 'teacher' && teacherColorMap.size > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-petal-50 pt-2.5">
            {Array.from(teacherColorMap.entries())
              .sort((a, b) => compareTeachers(a[0], b[0]))
              .map(([name, color]) => {
                const self = myName.trim() ? name.includes(myName.trim()) : false
                return (
                  <span
                    key={name}
                    className={`inline-flex items-center gap-1.5 text-[11px] ${
                      self ? 'font-bold text-petal-700' : 'text-ink-500'
                    }`}
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${self ? 'ring-1 ring-petal-500 ring-offset-1' : ''}`}
                      style={{ backgroundColor: color }}
                    />
                    {name}
                    {self ? '（我）' : ''}
                  </span>
                )
              })}
            <span className="text-[11px] text-ink-300">· 右上小圆点 = 该节有多位老师</span>
          </div>
        )}
      </div>

      {editing && (
        <ScheduleEditSheet
          day={editing.day}
          periodIndex={editing.periodIndex}
          slot={editing.slot}
          subjects={subjects}
          teacherOptions={teacherNames}
          weekTypes={weekTypes}
          weekType={activeWeek}
          defaultSubjectId={defaultSubjectId}
          onAddSubject={(name) => addSubject(name)}
          onSave={handleSheetSave}
          onDeleteSlot={handleDeleteSlot}
          onClose={() => setEditing(null)}
        />
      )}

      {detail && (
        <SlotDetailSheet
          dayLabel={DAYS.find((d) => d.key === detail.day)?.label ?? ''}
          periodLabel={
            periods.find((p) => p.startTime === detail.slot.startTime)?.label ??
            `第${detail.periodIndex}节`
          }
          startTime={detail.slot.startTime}
          endTime={detail.slot.endTime}
          isEvening={detail.slot.startTime >= '18:00'}
          items={sortEntriesForDisplay(detail.slot.entries ?? [], myName).map(
            (entry): SlotDetailItem => ({
              entry,
              color: entry.teacherName
                ? teacherColorMap.get(entry.teacherName) ?? '#cbd5e1'
                : '#cbd5e1',
              isSelf: isSelfEntry(entry, myName),
            }),
          )}
          subjectMap={subjectMap}
          onEdit={() => {
            setEditing({ day: detail.day, periodIndex: detail.periodIndex, slot: detail.slot })
            setDetail(null)
          }}
          onClose={() => setDetail(null)}
        />
      )}

      {editingPeriod && (
        <PeriodEditSheet
          periodLabel={editingPeriod.label}
          startTime={editingPeriod.startTime}
          endTime={editingPeriod.endTime}
          affectedCount={
            allSlots.filter(
              (x) => x.classId === classId && x.startTime === editingPeriod.startTime,
            ).length
          }
          onSave={savePeriodTimes}
          onClose={() => setEditingPeriod(null)}
        />
      )}

      {renamingWeek && (
        <RenameWeekModal
          oldName={renamingWeek}
          onConfirm={(v) => submitRenameWeek(renamingWeek, v)}
          onClose={() => setRenamingWeek(null)}
        />
      )}
    </div>
  )
})

/* ------------------------------------------------------------------ */

function ScheduleRow({
  period,
  daysToShow,
  today,
  grid,
  subjectMap,
  teacherColorMap,
  colorBy,
  selSubject,
  selClass,
  selTeacher,
  myName,
  onCellClick,
  onPeriodClick,
  defaultSubjectName,
}: {
  period: GridPeriod
  daysToShow: number[]
  today: number
  grid: Map<number, Map<string, ScheduleSlot>>
  subjectMap: Map<string, Subject>
  teacherColorMap: Map<string, string>
  colorBy: 'subject' | 'teacher'
  selSubject: string
  selClass: string
  selTeacher: string
  myName: string
  onCellClick: (day: number, startTime: string) => void
  onPeriodClick: (p: { startTime: string; endTime: string; label: string }) => void
  defaultSubjectName: string
}) {
  return (
    <>
      <button
        type="button"
        onClick={() =>
          onPeriodClick({
            startTime: period.startTime,
            endTime: period.endTime,
            label: period.label,
          })
        }
        title="点击编辑时间"
        className={`flex flex-col items-center justify-center rounded-lg px-0.5 py-1 text-center transition ${
          period.kind === 'evening'
            ? 'bg-lavender-100/80 hover:bg-lavender-100'
            : 'bg-lavender-50 hover:bg-lavender-100'
        }`}
      >
        <span className="text-[10px] font-semibold leading-none text-ink-500">{period.label}</span>
        <span className="mt-0.5 text-[12px] font-bold leading-tight text-ink-800">
          {period.startTime}
        </span>
        <span className="text-[10px] leading-tight text-ink-400">{period.endTime}</span>
      </button>

      {daysToShow.map((dkey) => {
        const slot = grid.get(dkey)?.get(period.startTime) ?? null
        const entries = slot?.entries ?? []
        const isEmpty = entries.length === 0
        return (
          <button
            type="button"
            key={dkey}
            onClick={() => onCellClick(dkey, period.startTime)}
            className={`group relative flex aspect-square min-h-[3.2rem] cursor-pointer flex-col rounded-lg text-center transition ${
              isEmpty
                ? `border border-dashed border-petal-100/80 ${
                    dkey === today ? 'bg-petal-50/60' : 'bg-cream/30 hover:bg-petal-50/40'
                  }`
                : 'border border-transparent hover:border-petal-400/70'
            }`}
            title={isEmpty ? '点击添加课程' : entries.length > 1 ? '点击查看全部课程' : '点击编辑'}
          >
            {isEmpty ? null : (() => {
              const top = pickTopEntry(entries, myName)
              const sub = subjectMap.get(top.subjectId)
              const subOk = !selSubject || top.subjectId === selSubject
              const clsOk = !selClass || (top.classLabel || '') === selClass
              const tchOk = !selTeacher || top.teacherName === selTeacher
              const filtering = !!(selSubject || selClass || selTeacher)
              const isMatch = filtering && subOk && clsOk && tchOk
              const dimmed = filtering && !isMatch
              const isSelf = isSelfEntry(top, myName)
              const byTeacher = colorBy === 'teacher'
              const base = byTeacher
                ? top.teacherName
                  ? teacherColorMap.get(top.teacherName) ?? '#cbd5e1'
                  : '#cbd5e1'
                : sub?.color || '#cbd5e1'
              // 柔和莫兰迪底色配深色文字，比原来的高饱和+白字更耐看
              return (
                <div
                  className={`flex flex-1 flex-col items-center justify-center overflow-hidden rounded-lg px-1 py-0.5 transition ${
                    dimmed ? 'opacity-25' : ''
                  } ${isMatch ? 'ring-2 ring-lavender-400' : ''}`}
                  style={{
                    backgroundColor: base,
                    boxShadow: isSelf
                      ? 'inset 0 0 0 2px rgba(255,255,255,0.92), 0 4px 12px -8px rgba(236,72,153,0.6)'
                      : undefined,
                  }}
                >
                  <p
                    className={`w-full truncate text-center text-[13px] leading-tight text-ink-900 ${
                      isSelf ? 'font-extrabold' : 'font-bold'
                    }`}
                  >
                    {top.teacherName ? surnameOf(top.teacherName) : sub?.name || defaultSubjectName}
                  </p>
                  {top.classLabel && (
                    <p className="w-full truncate text-center text-[11px] font-semibold leading-tight text-ink-700/80">
                      {shortClass(top.classLabel)}
                    </p>
                  )}
                </div>
              )
            })()}
            {/* 多老师时段：右上角小圆点提示有更多 */}
            {entries.length > 1 && (
              <span
                className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-petal-600 shadow-[0_0_0_2px_rgba(255,255,255,0.9)]"
                title={`还有 ${entries.length - 1} 节课`}
              />
            )}
          </button>
        )
      })}
    </>
  )
}

/* ------------------------------------------------------------------ */

function RenameWeekModal({
  oldName,
  onConfirm,
  onClose,
}: {
  oldName: string
  onConfirm: (v: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(oldName)
  const ok = value.trim() && value.trim() !== oldName
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink-900/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-sm rounded-t-3xl bg-surface p-5 shadow-soft sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink-900">重命名周表</h3>
          <button
            type="button"
            onClick={onClose}
            title="关闭"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-cream-deep text-ink-500 transition hover:bg-petal-50"
          >
            ✕
          </button>
        </div>
        <p className="mb-2 text-xs text-ink-500">把「{oldName}」改名为：</p>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && ok) onConfirm(value)
            if (e.key === 'Escape') onClose()
          }}
          placeholder="例如：A、单周、双周"
          className="w-full rounded-xl border border-petal-100 bg-cream/50 px-3 py-2 text-sm text-ink-900 outline-none focus:border-petal-400"
        />
        <p className="mt-2 text-[11px] text-ink-400">
          会把当前班级所有标记为「{oldName}」的课程统一改名；其他周表不受影响。
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border border-petal-100 bg-surface py-2.5 text-sm font-medium text-ink-600 transition hover:bg-petal-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!ok}
            onClick={() => onConfirm(value)}
            className="flex-[2] rounded-2xl bg-gradient-to-br from-petal-400 to-petal-500 py-2.5 text-sm font-semibold text-white shadow-card transition hover:brightness-105 active:scale-[0.98] disabled:opacity-40"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function OcrMappingPanel({
  drafts,
  subjects,
  onApply,
  onCancel,
}: {
  drafts: ParsedScheduleSlot[]
  subjects: Subject[]
  onApply: (mapped: ParsedScheduleSlot[]) => void
  onCancel: () => void
}) {
  const [mapped] = useState<ParsedScheduleSlot[]>(drafts)
  const preview = useMemo(
    () =>
      mapped.slice(0, 60).map((slot, i) => {
        const day = DAYS.find((d) => d.key === slot.dayOfWeek)?.label ?? '?'
        const names = slot.entries
          .map((e) => {
            const s = subjects.find((x) => x.id === e.subjectId)?.name ?? ''
            return [s, e.teacherName, e.classLabel].filter(Boolean).join(' ')
          })
          .filter(Boolean)
          .join('、')
        return { key: `${i}-${slot.dayOfWeek}-${slot.startTime}`, day, time: slot.startTime, names }
      }),
    [mapped, subjects],
  )

  return (
    <div className="rounded-2xl bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-900">识别结果（{mapped.length} 条）</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-petal-100 bg-surface px-3 py-1 text-xs text-ink-500 hover:bg-petal-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onApply(mapped)}
            className="rounded-full bg-petal-500 px-3 py-1 text-xs font-semibold text-white shadow-card hover:bg-petal-600"
          >
            确认导入
          </button>
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto rounded-xl bg-cream/40 p-2">
        {preview.map((p) => (
          <p key={p.key} className="flex gap-2 py-1 text-[12px] leading-relaxed">
            <span className="w-10 shrink-0 text-ink-400">{p.day}</span>
            <span className="w-12 shrink-0 text-ink-400">{p.time}</span>
            <span className="min-w-0 flex-1 text-ink-700">{p.names || '（空）'}</span>
          </p>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-ink-400">
        确认后可在课表里直接点格子微调；不同老师会自动用不同颜色区分。
      </p>
    </div>
  )
}
