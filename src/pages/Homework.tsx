import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useHomeworkStore } from '@/store/useHomeworkStore'
import { todayStr, type HomeworkEntry, type HomeworkRecord } from '@/lib/homework'
import { compressImageFile, savePhoto, deletePhoto, getPhoto } from '@/lib/photo'
import ClassForm from '@/components/homework/ClassForm'
import StatsView from '@/components/homework/StatsView'
import CompareView from '@/components/homework/CompareView'
import CourseSchedule from '@/components/homework/CourseSchedule'
import RecordStatsModal from '@/components/homework/RecordStatsModal'
import ScoreImportModal from '@/components/homework/ScoreImportModal'
import FaceReview from '@/components/homework/FaceReview'
import GradeAnalysis from '@/components/homework/GradeAnalysis'
import FileUploadButton from '@/components/FileUploadButton'

type Mode =
  | 'list'
  | 'compare'
  | 'class-detail'
  | 'register-list'
  | 'register-form'
  | 'stats'
  | 'face-review'
  | 'schedule'
  | 'grade'

export default function Homework() {
  const [searchParams, setSearchParams] = useSearchParams()
  const classes = useHomeworkStore((s) => s.classes)
  const records = useHomeworkStore((s) => s.records)
  const removeClass = useHomeworkStore((s) => s.removeClass)
  const addRecord = useHomeworkStore((s) => s.addRecord)
  const updateRecord = useHomeworkStore((s) => s.updateRecord)
  const removeRecord = useHomeworkStore((s) => s.removeRecord)

  const [mode, setMode] = useState<Mode>('list')
  const [activeClassId, setActiveClassId] = useState<string | null>(null)
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editClassId, setEditClassId] = useState<string | null>(null)
  const [statsRecord, setStatsRecord] = useState<HomeworkRecord | null>(null)
  const [highlightStudentName, setHighlightStudentName] = useState<string | null>(searchParams.get('studentName'))

  // 从全局搜索跳转：根据 URL recordId 打开指定登记表单
  useEffect(() => {
    const recordId = searchParams.get('recordId')
    if (!recordId) return
    const rec = records.find((r) => r.id === recordId)
    if (!rec) return
    setActiveClassId(rec.classId)
    setEditingRecordId(recordId)
    setMode('register-form')
    setHighlightStudentName(searchParams.get('studentName'))
    setSearchParams({}, { replace: true })
  }, [records, searchParams, setSearchParams])

  const activeClass = classes.find((c) => c.id === activeClassId) ?? null
  const classRecords = useMemo(
    () =>
      activeClassId
        ? records
            .filter((r) => r.classId === activeClassId)
            .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        : [],
    [records, activeClassId],
  )

  const goList = () => {
    setMode('list')
    setActiveClassId(null)
    setEditingRecordId(null)
  }

  const goClassDetail = (id: string) => {
    setActiveClassId(id)
    setMode('class-detail')
    setEditingRecordId(null)
  }

  const handleTopBack = () => {
    if (mode === 'list') return
    if (mode === 'compare') return goList()
    if (mode === 'class-detail') return goList()
    if (mode === 'register-list') return activeClass ? goClassDetail(activeClass.id) : goList()
    if (mode === 'register-form') return setMode('register-list')
    if (mode === 'stats') return setMode('register-list')
    if (mode === 'face-review') return activeClass ? goClassDetail(activeClass.id) : goList()
    if (mode === 'schedule') return activeClass ? goClassDetail(activeClass.id) : goList()
    if (mode === 'grade') return activeClass ? goClassDetail(activeClass.id) : goList()
  }

  const openNew = () => {
    setEditClassId(null)
    setFormOpen(true)
  }

  const onClassSaved = (id?: string) => {
    setFormOpen(false)
    if (id && !editClassId) {
      goClassDetail(id)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 md:px-6">
      {/* 顶部导航（精简）：子页只留返回键；列表页放课程表/班级比较/新建 */}
      {mode !== 'list' ? (
        <div className="mb-3 flex items-center">
          <button
            type="button"
            onClick={handleTopBack}
            title="返回"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-petal-100 text-lg text-petal-600 transition-colors hover:bg-petal-200"
          >
            ←
          </button>
        </div>
      ) : (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-ink-900">教学工具</h1>
          <div className="flex items-center gap-2">
            <Link
              to="/schedule"
              title="我的课表"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-petal-200 to-lavender-200 text-2xl shadow-card ring-1 ring-petal-200/70 transition-transform hover:scale-105 active:scale-95"
            >
              🗓️
            </Link>
            <button
              type="button"
              onClick={() => setMode('compare')}
              title="班级比较"
              className="rounded-2xl border border-petal-100 bg-surface px-3 py-2 text-sm font-medium text-ink-500 shadow-card transition-colors hover:bg-petal-50 hover:text-ink-700"
            >
              ⚖️ 班级比较
            </button>
            <button
              type="button"
              onClick={openNew}
              title="新建班级"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-petal-500 text-lg text-white shadow-card transition-colors hover:bg-petal-600"
            >
              ＋
            </button>
          </div>
        </div>
      )}

      {mode === 'list' && (
        <ClassListView
          classes={classes}
          records={records}
          onOpenClass={goClassDetail}
          onEditClass={(id) => {
            setEditClassId(id)
            setFormOpen(true)
          }}
          onRemoveClass={(id) => {
            const c = classes.find((x) => x.id === id)
            if (c && window.confirm(`确定删除班级「${c.name}」及其所有记录？`)) {
              removeClass(id)
            }
          }}
        />
      )}

      {mode === 'compare' && <CompareView />}

      {mode === 'class-detail' && activeClass && (
        <ClassDetailView
          cls={activeClass}
          recordCount={classRecords.length}
          onBack={goList}
          onRegister={() => setMode('register-list')}
          onFaceReview={() => setMode('face-review')}
          onGrade={() => setMode('grade')}
          onSchedule={() => setMode('schedule')}
          onEditClass={() => {
            setEditClassId(activeClass.id)
            setFormOpen(true)
          }}
        />
      )}

      {mode === 'register-list' && activeClass && (
        <RegisterList
          cls={activeClass}
          records={classRecords}
          onBack={() => activeClass && goClassDetail(activeClass.id)}
          onNew={() => {
            setEditingRecordId(null)
            setMode('register-form')
          }}
          onStats={() => setMode('stats')}
          onEdit={(id) => {
            setEditingRecordId(id)
            setMode('register-form')
          }}
          onStatsRecord={(rec) => setStatsRecord(rec)}
          onRemove={(id) => {
            if (window.confirm('确定删除这条登记记录？')) removeRecord(id)
          }}
        />
      )}

      {mode === 'register-form' && activeClass && (
        <RegisterForm
          cls={activeClass}
          record={classRecords.find((r) => r.id === editingRecordId)}
          highlightStudentName={highlightStudentName}
          onBack={() => setMode('register-list')}
          onSave={(data) => {
            if (editingRecordId) {
              updateRecord(editingRecordId, data)
            } else {
              addRecord(
                activeClass.id,
                data.date,
                data.content,
                data.entries,
                data.overallEvaluation,
                data.overallImages,
              )
            }
            setMode('register-list')
          }}
        />
      )}

      {mode === 'stats' && activeClass && <StatsView classId={activeClass.id} />}

      {mode === 'face-review' && activeClass && <FaceReview classId={activeClass.id} />}

      {mode === 'schedule' && activeClass && <CourseSchedule classId={activeClass.id} />}

      {mode === 'grade' && activeClass && <GradeAnalysis classId={activeClass.id} />}

      <ClassForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          onClassSaved()
        }}
        editClass={editClassId ? classes.find((c) => c.id === editClassId) ?? null : null}
      />

      {statsRecord && activeClass && (
        <RecordStatsModal
          record={statsRecord}
          totalStudents={activeClass.students.length}
          ratingOptions={activeClass.ratingOptions}
          onClose={() => setStatsRecord(null)}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 班级列表                                                            */
/* ------------------------------------------------------------------ */

function ClassListView(props: {
  classes: ReturnType<typeof useHomeworkStore.getState>['classes']
  records: ReturnType<typeof useHomeworkStore.getState>['records']
  onOpenClass: (id: string) => void
  onEditClass: (id: string) => void
  onRemoveClass: (id: string) => void
}) {
  const recordCountOf = (classId: string) =>
    props.records.filter((r) => r.classId === classId).length

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {props.classes.length === 0 && (
        <div className="col-span-full rounded-2xl border border-dashed border-petal-100 bg-cream/40 py-12 text-center">
          <div className="text-3xl">📚</div>
          <p className="mt-2 text-sm text-ink-400">暂无班级，先新建一个吧</p>
        </div>
      )}
      {props.classes.map((c) => (
        <div
          key={c.id}
          onClick={() => props.onOpenClass(c.id)}
          className="flex cursor-pointer flex-col gap-3 rounded-2xl bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-soft"
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-ink-900">{c.name}</h3>
              <p className="text-xs text-ink-400">
                {c.semester || '未设学期'} · {c.students.length} 人 · {recordCountOf(c.id)} 次登记
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => props.onOpenClass(c.id)}
                title="进入班级"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-petal-100 text-sm text-petal-600 transition-colors hover:bg-petal-200"
              >
                📝
              </button>
              <button
                type="button"
                onClick={() => props.onEditClass(c.id)}
                title="编辑"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-cream-deep text-sm text-ink-500 transition-colors hover:bg-petal-50"
              >
                ✏️
              </button>
            </div>
            <button
              type="button"
              onClick={() => props.onRemoveClass(c.id)}
              title="删除"
              className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full bg-cream-deep text-sm text-ink-400 transition-colors hover:bg-red-50 hover:text-red-500"
            >
              🗑️
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 班级详情（L2 入口）                                                  */
/* ------------------------------------------------------------------ */

function ClassDetailView(props: {
  cls: ReturnType<typeof useHomeworkStore.getState>['classes'][number]
  recordCount: number
  onBack: () => void
  onRegister: () => void
  onFaceReview: () => void
  onGrade: () => void
  onSchedule: () => void
  onEditClass: () => void
}) {
  const { cls, recordCount } = props
  const items = [
    { key: 'register', icon: '📝', title: '作业登记', desc: '按次登记、多次/天', onClick: props.onRegister },
    { key: 'face', icon: '✍️', title: '面批', desc: '按日期记录面批名单', onClick: props.onFaceReview },
    { key: 'grade', icon: '📊', title: '成绩分析', desc: '录入成绩、统计分析', onClick: props.onGrade },
    { key: 'schedule', icon: '📅', title: '课程安排', desc: '周课表与科目管理', onClick: props.onSchedule },
  ] as const

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl bg-surface p-4 shadow-card">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-ink-900">{cls.name}</h2>
            <p className="mt-1 text-xs text-ink-400">
              {cls.semester} · {cls.students.length} 人 · {recordCount} 次登记
            </p>
          </div>
          <button
            type="button"
            onClick={props.onEditClass}
            title="编辑班级"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-cream-deep text-sm text-ink-500 transition-colors hover:bg-petal-50"
          >
            ✏️
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            onClick={it.onClick}
            className="flex flex-col items-center gap-2 rounded-2xl bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-soft"
          >
            <span className="text-4xl">{it.icon}</span>
            <span className="text-base font-semibold text-ink-900">{it.title}</span>
            <span className="text-xs text-ink-400">{it.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 登记记录列表                                                        */
/* ------------------------------------------------------------------ */

/** 作业卡片上的整体评价：固定单行，超出省略 */
function RecordEvaluation({ text }: { text: string }) {
  return (
    <div
      title={text}
      className="mt-1.5 inline-flex w-full max-w-full items-center gap-1 rounded-lg bg-mint-50 px-2.5 py-1 text-xs text-mint-800"
    >
      <span className="shrink-0">💬</span>
      <span className="min-w-0 flex-1 truncate">{text}</span>
    </div>
  )
}

function RegisterList(props: {
  cls: ReturnType<typeof useHomeworkStore.getState>['classes'][number]
  records: HomeworkRecord[]
  onBack: () => void
  onNew: () => void
  onStats: () => void
  onStatsRecord: (record: HomeworkRecord) => void
  onEdit: (id: string) => void
  onRemove: (id: string) => void
}) {
  const { records } = props

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={props.onStats}
          title="统计分析"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-lavender-100 text-sm text-lavender-600 transition-colors hover:bg-lavender-200"
        >
          📊
        </button>
        <button
          type="button"
          onClick={props.onNew}
          className="inline-flex items-center gap-1 rounded-full bg-petal-500 px-4 py-2 text-sm font-semibold text-white shadow-card transition-colors hover:bg-petal-600"
        >
          ＋ 新建登记
        </button>
      </div>

      {records.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-petal-100 bg-cream/40 py-12 text-center text-ink-400">
          <div className="text-3xl">📝</div>
          <p className="mt-2 text-sm">还没有登记记录</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {records.map((r) => {
            const submitted = r.entries.filter((e) => e.rating).length
            const total = r.entries.length
            const rate = total > 0 ? submitted / total : 0
            return (
              <div
                key={r.id}
                className="flex min-h-[84px] w-full items-center gap-3 rounded-2xl bg-surface p-4 shadow-card"
              >
                <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-petal-100 text-petal-600">
                  <span className="text-xs">{r.date.slice(5, 7)}月</span>
                  <span className="text-lg font-bold leading-none">{r.date.slice(8)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">
                    {r.content || '（无作业内容）'}
                  </p>
                  <p className="truncate text-xs text-ink-400">
                    已交 {submitted}/{total} · {rate > 0 ? `${(rate * 100).toFixed(0)}%` : '未开始'}
                  </p>
                  {r.overallEvaluation && <RecordEvaluation text={r.overallEvaluation} />}
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => props.onStatsRecord(r)}
                    title="单次统计"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-mint-100 text-sm text-mint-700 transition-colors hover:bg-mint-200"
                  >
                    📈
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onEdit(r.id)}
                    title="编辑"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-cream-deep text-sm text-ink-500 transition-colors hover:bg-petal-50"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onRemove(r.id)}
                    title="删除"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-cream-deep text-sm text-ink-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 登记表单（新建/编辑）                                                */
/* ------------------------------------------------------------------ */

function RegisterForm(props: {
  cls: ReturnType<typeof useHomeworkStore.getState>['classes'][number]
  record?: HomeworkRecord
  highlightStudentName?: string | null
  onBack: () => void
  onSave: (data: {
    date: string
    content: string
    entries: HomeworkEntry[]
    overallEvaluation?: string
    overallImages?: string[]
  }) => void
}) {
  const { cls, record, highlightStudentName } = props
  const isEdit = !!record

  const registerDraft = useHomeworkStore((s) => s.registerDraft)
  const setRegisterDraft = useHomeworkStore((s) => s.setRegisterDraft)
  const clearRegisterDraft = useHomeworkStore((s) => s.clearRegisterDraft)

  const [date, setDate] = useState(record?.date ?? todayStr())
  const [content, setContent] = useState(record?.content ?? '')
  const [overallEvaluation, setOverallEvaluation] = useState(record?.overallEvaluation ?? '')
  const [overallImages, setOverallImages] = useState<string[]>(record?.overallImages ?? [])
  const [entries, setEntries] = useState<Record<string, HomeworkEntry>>({})
  const [batchRating, setBatchRating] = useState('')
  const [scoreImportOpen, setScoreImportOpen] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)

  // 初始化 entries 与评价；如有匹配草稿则恢复
  useEffect(() => {
    const targetRecordId = record?.id ?? null
    const draft = registerDraft
    const hasDraft =
      draft &&
      draft.classId === cls.id &&
      draft.recordId === targetRecordId &&
      Object.keys(draft.entries).length > 0

    const next: Record<string, HomeworkEntry> = {}
    if (hasDraft) {
      // 优先恢复自动保存草稿
      for (const [sid, e] of Object.entries(draft.entries)) {
        const st = cls.students.find((s) => s.id === sid)
        next[sid] = {
          ...e,
          studentName: e.studentName ?? st?.name ?? '',
        }
      }
      setDate(draft.date)
      setContent(draft.content)
      setOverallEvaluation(draft.overallEvaluation)
      setOverallImages(draft.overallImages ?? [])
    } else if (record) {
      // 编辑：保留历史 entries，用当前名单补全姓名快照
      for (const e of record.entries) {
        const st = cls.students.find((s) => s.id === e.studentId)
        next[e.studentId] = {
          ...e,
          studentName: e.studentName ?? st?.name ?? '',
        }
      }
    } else {
      // 新建：按当前班级名单生成空 entries
      for (const st of cls.students) {
        next[st.id] = {
          studentId: st.id,
          studentName: st.name,
          rating: null,
          note: '',
          score: null,
        }
      }
    }
    setEntries(next)
    if (!hasDraft) {
      setOverallEvaluation(record?.overallEvaluation ?? '')
      setOverallImages(record?.overallImages ?? [])
    }
  }, [cls, record, registerDraft])

  // 自动保存草稿（防抖 500ms）
  useEffect(() => {
    const timer = setTimeout(() => {
      setRegisterDraft({
        classId: cls.id,
        recordId: record?.id ?? null,
        date,
        content,
        overallEvaluation: overallEvaluation.trim(),
        overallImages,
        entries,
      })
    }, 500)
    return () => clearTimeout(timer)
  }, [cls.id, record?.id, date, content, overallEvaluation, overallImages, entries, setRegisterDraft])

  const setRating = (studentId: string, rating: string) =>
    setEntries((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId]!, rating: rating || null },
    }))

  const setNote = (studentId: string, note: string) =>
    setEntries((prev) => ({ ...prev, [studentId]: { ...prev[studentId]!, note } }))

  const setScore = (studentId: string, raw: string) => {
    const v = raw.trim() === '' ? null : Number(raw)
    setEntries((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId]!, score: v != null && Number.isNaN(v) ? null : v },
    }))
  }

  const applyBatch = () => {
    if (!batchRating) return
    setEntries((prev) => {
      const next = { ...prev }
      for (const st of cls.students) {
        if (!next[st.id]?.rating) {
          next[st.id] = { ...next[st.id]!, rating: batchRating }
        }
      }
      return next
    })
  }

  const handleSave = () => {
    const list = isEdit
      ? Object.values(entries)
      : cls.students.map((st) => entries[st.id] ?? { studentId: st.id, studentName: st.name, rating: null, note: '' })
    props.onSave({
      date,
      content,
      entries: list,
      overallEvaluation: overallEvaluation.trim(),
      overallImages,
    })
    clearRegisterDraft()
  }

  // 整体评价配图：压缩后存 IndexedDB，记录只存 photoId
  const addOverallImage = async (files: File[]) => {
    const f = files.find((x) => x.type.startsWith('image/'))
    if (!f || imageBusy) return
    setImageBusy(true)
    try {
      const dataUrl = await compressImageFile(f, 1000, 0.75)
      const id = await savePhoto(dataUrl)
      setOverallImages((prev) => [...prev, id])
    } catch {
      /* 忽略处理失败 */
    } finally {
      setImageBusy(false)
    }
  }

  const removeOverallImage = (photoId: string) => {
    setOverallImages((prev) => prev.filter((x) => x !== photoId))
    deletePhoto(photoId).catch(() => {})
  }

  const applyScoreImport = (map: Record<string, number | null>) => {
    setEntries((prev) => {
      const next = { ...prev }
      for (const [sid, score] of Object.entries(map)) {
        next[sid] = { ...next[sid]!, score }
      }
      return next
    })
    setScoreImportOpen(false)
  }

  const submittedCount = Object.values(entries).filter((e) => e.rating).length
  const totalCount = Object.values(entries).length

  const studentList = isEdit
    ? Object.values(entries).map((e) => ({
        id: e.studentId,
        name: e.studentName || cls.students.find((s) => s.id === e.studentId)?.name || '（未知学生）',
        initial:
          cls.students.find((s) => s.id === e.studentId)?.initial ||
          e.studentName?.charAt(0) ||
          '?',
      }))
    : cls.students

  // 高亮从全局搜索跳转过来的学生行
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})
  useEffect(() => {
    if (!highlightStudentName) return
    const target = studentList.find((st) => st.name === highlightStudentName)
    if (!target) return
    const el = rowRefs.current[target.id]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlightStudentName, studentList])

  return (
    <div className="flex flex-col gap-3">
      {/* 日期 + 内容 */}
      <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-card">
        <div className="flex items-center gap-2">
          <span className="text-base">📅</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border border-petal-100 bg-cream/60 px-3 py-2 text-ink-900 outline-none transition-colors focus:border-petal-400"
          />
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={2}
          placeholder="作业内容…"
          className="scroll-soft rounded-xl border border-petal-100 bg-cream/60 px-3 py-2.5 text-ink-900 outline-none transition-colors focus:border-petal-400"
        />
        <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-400">
          <span>💬 整体评价</span>
          <span>（选填）</span>
        </div>
        <textarea
          value={overallEvaluation}
          onChange={(e) => setOverallEvaluation(e.target.value)}
          rows={2}
          placeholder="对本次作业的整体评价、亮点或改进建议…"
          className="scroll-soft rounded-xl border border-petal-100 bg-cream/60 px-3 py-2.5 text-ink-900 outline-none transition-colors focus:border-petal-400"
        />
        {/* 整体评价配图 */}
        <div className="flex flex-wrap items-center gap-2">
          <FileUploadButton
            accept="image/*"
            onFiles={addOverallImage}
            disabled={imageBusy}
            showWeChatTip={false}
            className="inline-flex items-center gap-1 rounded-xl border border-lavender-100 bg-lavender-50 px-3 py-1.5 text-xs font-medium text-lavender-600 transition hover:bg-lavender-100"
          >
            {imageBusy ? '处理中…' : '📷 添加图片'}
          </FileUploadButton>
          {overallImages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {overallImages.map((pid) => (
                <OverallImageThumb key={pid} photoId={pid} onRemove={() => removeOverallImage(pid)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 批量 */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-lavender-50 p-3">
        <select
          value={batchRating}
          onChange={(e) => setBatchRating(e.target.value)}
          className="rounded-xl border border-lavender-200 bg-surface px-3 py-1.5 text-sm text-ink-900 outline-none"
        >
          <option value="">批量评级…</option>
          {cls.ratingOptions.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <button
          onClick={applyBatch}
          disabled={!batchRating}
          title="应用到全部未交"
          className="rounded-full bg-lavender-400 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-lavender-500 disabled:opacity-50"
        >
          应用
        </button>
        <button
          type="button"
          onClick={() => setScoreImportOpen(true)}
          title="粘贴或导入 Excel 批量录入分数"
          className="rounded-full border border-lavender-200 bg-surface px-3 py-1.5 text-sm font-medium text-lavender-600 transition hover:bg-lavender-100"
        >
          📥 批量录分
        </button>
        <span className="ml-auto text-xs text-ink-400">
          已交 {submittedCount}/{totalCount}
        </span>
      </div>

      {/* 名单 */}
      <div className="scroll-soft overflow-hidden rounded-2xl bg-surface shadow-card">
        <div className="flex items-center gap-2 px-3 pb-1 pt-2 text-[11px] text-ink-400">
          <div className="w-20 shrink-0">姓名</div>
          <div className="w-16 shrink-0">评级</div>
          <div className="w-14 shrink-0 text-center">得分</div>
          <div className="flex-1">备注</div>
        </div>
        <div className="scroll-soft max-h-[52vh] overflow-y-auto">
          {studentList.map((st) => (
            <div
              key={st.id}
              ref={(el) => { rowRefs.current[st.id] = el }}
              className={`flex items-center gap-2 border-t px-3 py-2 transition ${
                highlightStudentName && st.name === highlightStudentName
                  ? 'bg-petal-50 border-petal-200'
                  : 'border-petal-50'
              }`}
            >
              <div className="flex w-20 shrink-0 items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-petal-100 text-xs font-semibold text-petal-600">
                  {(st.initial?.charAt(0) || st.name.charAt(0)).toUpperCase()}
                </span>
                <span className="truncate text-sm font-medium text-ink-900">{st.name}</span>
              </div>
              <select
                value={entries[st.id]?.rating ?? ''}
                onChange={(e) => setRating(st.id, e.target.value)}
                className="w-16 shrink-0 rounded-lg border border-petal-100 bg-cream/60 px-2 py-1.5 text-sm text-ink-900 outline-none focus:border-petal-400"
              >
                <option value="">未交</option>
                {cls.ratingOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <input
                type="number"
                inputMode="decimal"
                value={entries[st.id]?.score ?? ''}
                onChange={(e) => setScore(st.id, e.target.value)}
                placeholder="分"
                className="w-14 shrink-0 rounded-lg border border-petal-100 bg-cream/60 px-1.5 py-1.5 text-center text-sm text-ink-900 outline-none focus:border-petal-400"
              />
              <input
                value={entries[st.id]?.note ?? ''}
                onChange={(e) => setNote(st.id, e.target.value)}
                placeholder="备注"
                className="min-w-0 flex-1 rounded-lg border border-petal-100 bg-cream/60 px-2 py-1.5 text-sm text-ink-900 outline-none focus:border-petal-400"
              />
            </div>
          ))}
        </div>
      </div>

      {/* 保存 */}
      <div className="flex items-center justify-end gap-3">
        <button
          onClick={props.onBack}
          className="rounded-full border border-petal-100 bg-surface px-5 py-2.5 text-sm font-medium text-ink-500 transition-colors hover:bg-petal-50"
        >
          取消
        </button>
        <button
          onClick={handleSave}
          className="rounded-full bg-petal-500 px-6 py-2.5 text-sm font-semibold text-white shadow-card transition-colors hover:bg-petal-600"
        >
          保存
        </button>
      </div>

      {scoreImportOpen && (
        <ScoreImportModal
          students={cls.students}
          onApply={applyScoreImport}
          onClose={() => setScoreImportOpen(false)}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 整体评价配图缩略图                                                  */
/* ------------------------------------------------------------------ */

function OverallImageThumb({ photoId, onRemove }: { photoId: string; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    getPhoto(photoId)
      .then((u) => {
        if (active) setUrl(u)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [photoId])

  return (
    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-petal-100 bg-petal-50">
      {url ? (
        <img src={url} alt="评价图片" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-petal-300">📷</div>
      )}
      <button
        type="button"
        onClick={onRemove}
        title="移除图片"
        className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-ink-900/60 text-[10px] text-white"
      >
        ✕
      </button>
    </div>
  )
}
