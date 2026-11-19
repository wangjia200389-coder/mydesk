import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import {
  sortStudentsByName,
  type HomeworkEntry,
  type HomeworkRecord,
  type HomeworkStudent,
} from '@/lib/homework'

/* ------------------------------------------------------------------ */
/* 类型                                                                */
/* ------------------------------------------------------------------ */

export interface HomeworkClass {
  id: string
  name: string
  /** 所属学期（SEMESTERS 的 label） */
  semester: string
  /** 已按首字母 A→Z 排序的学生名单 */
  students: HomeworkStudent[]
  /** 自定义评级选项（默认 ['A','B','C']），可增删改 */
  ratingOptions: string[]
  createdAt: number
}

/** 用户自定义科目（用于课程安排） */
export interface Subject {
  id: string
  name: string
  color: string
}

/** 课程表时间段内的单个课程条目 */
export interface ScheduleEntry {
  subjectId: string
  /** 任课教师姓名/简称；用于高亮「我的课」 */
  teacherName: string
  /** 授课班级标签（如 2403、高一1班） */
  classLabel?: string
  /** 上课地点 */
  location?: string
  /** 是否标记为「我的课」 */
  isSelf?: boolean
}

/** 面批记录：按日期记录需要面批的学生及内容，done 表示已完成 */
export interface FaceReview {
  id: string
  classId: string
  date: string // YYYY-MM-DD
  studentId: string
  studentName: string // 快照姓名
  content: string
  done: boolean
  createdAt: number
  updatedAt: number
}

/** 单次考试某学生的成绩 */
export interface ExamEntry {
  studentId: string
  studentName: string
  score: number | null // null = 未录入/缺考
}

/** 一次考试（成绩分析用） */
export interface Exam {
  id: string
  classId: string
  name: string
  date: string // YYYY-MM-DD
  subject: string // 科目（选填）
  fullScore: number // 满分
  entries: ExamEntry[]
  createdAt: number
  updatedAt: number
}

/** 课程表时间段（按班级） */
export interface ScheduleSlot {
  id: string
  classId: string
  dayOfWeek: number // 1=周一 … 7=周日
  startTime: string // HH:MM
  endTime: string // HH:MM
  /** 同一时间段内的所有课程条目（支持年级总课表多课同格） */
  entries: ScheduleEntry[]
  /** 所属周表（'' = 默认周表；'A'/'B'/自定义名 = 周表 A/B…）。老数据缺省按默认周表处理。 */
  weekType?: string
  // 旧数据兼容字段（v1.6.0 之前为单条记录）
  subjectId?: string
  classLabel?: string
  location?: string
}

const DEFAULT_RATING_OPTIONS = ['A', 'B', 'C']

export const DEFAULT_SUBJECT_COLORS = [
  '#ff8da1',
  '#a78bfa',
  '#54bd9b',
  '#6aa6ff',
  '#f0b85a',
  '#c9a27e',
  '#ff9e7a',
  '#9be0c3',
  '#f472b6',
  '#60a5fa',
]

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

/** 由原始姓名数组构建排序后的学生名单；保留同名学生的旧 id，避免历史记录失联 */
function buildStudents(existing: HomeworkStudent[], names: string[]): HomeworkStudent[] {
  const byName = new Map(existing.map((s) => [s.name, s]))
  const base: HomeworkStudent[] = names.map(
    (n) => byName.get(n) ?? { id: uuidv4(), name: n, initial: '' },
  )
  return sortStudentsByName(base)
}

function dedupeNames(raw: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const n of raw) {
    const t = (n ?? '').trim()
    if (!t) continue
    const k = t.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

function pickSubjectColor(index: number): string {
  return DEFAULT_SUBJECT_COLORS[index % DEFAULT_SUBJECT_COLORS.length]!
}

/* ------------------------------------------------------------------ */
/* State                                                              */
/* ------------------------------------------------------------------ */

interface HomeworkState {
  classes: HomeworkClass[]
  records: HomeworkRecord[]
  subjects: Subject[]
  scheduleSlots: ScheduleSlot[]
  faceReviews: FaceReview[]
  exams: Exam[]

  /* 作业登记表单草稿（自动保存用） */
  registerDraft: {
    classId: string
    recordId: string | null
    date: string
    content: string
    overallEvaluation: string
    overallImages: string[]
    entries: Record<string, HomeworkEntry>
  } | null

  /* 班级管理 */
  addClass: (
    name: string,
    semester: string,
    studentNames: string[],
    ratingOptions?: string[],
  ) => string
  updateClassMeta: (id: string, patch: { name?: string; semester?: string }) => void
  setClassStudents: (id: string, studentNames: string[]) => void
  removeClass: (id: string) => void

  /* 评级选项（动态可配） */
  addRatingOption: (classId: string, opt: string) => void
  renameRatingOption: (classId: string, oldOpt: string, newOpt: string) => void
  removeRatingOption: (classId: string, opt: string) => void
  /** 整体替换评级选项（编辑班级用）；被删项→未交，等长则为重命名以保留历史 */
  setRatingOptions: (classId: string, options: string[]) => void

  /* 作业登记记录（允许多条/天：add 新建，update 按 id 编辑） */
  addRecord: (
    classId: string,
    date: string,
    content: string,
    entries: HomeworkEntry[],
    overallEvaluation?: string,
    overallImages?: string[],
  ) => string
  updateRecord: (
    id: string,
    patch: Partial<
      Pick<HomeworkRecord, 'date' | 'content' | 'entries' | 'overallEvaluation' | 'overallImages'>
    >,
  ) => void
  removeRecord: (id: string) => void

  /* 面批 */
  addFaceReview: (data: Omit<FaceReview, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateFaceReview: (
    id: string,
    patch: Partial<Pick<FaceReview, 'date' | 'content' | 'done' | 'studentId' | 'studentName'>>,
  ) => void
  removeFaceReview: (id: string) => void

  /* 成绩 */
  addExam: (data: Omit<Exam, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateExam: (
    id: string,
    patch: Partial<Pick<Exam, 'name' | 'date' | 'subject' | 'fullScore' | 'entries'>>,
  ) => void
  removeExam: (id: string) => void

  /* 科目管理 */
  addSubject: (name: string, color?: string) => string
  updateSubject: (id: string, patch: Partial<Pick<Subject, 'name' | 'color'>>) => void
  removeSubject: (id: string) => void

  /* 课程表 */
  addScheduleSlot: (slot: Omit<ScheduleSlot, 'id'>) => string
  updateScheduleSlot: (
    id: string,
    patch: Partial<Omit<ScheduleSlot, 'id' | 'classId'>>,
  ) => void
  removeScheduleSlot: (id: string) => void
  /** 批量删除多个时间段（一键清空 / 按条件批量删除用） */
  removeScheduleSlots: (ids: string[]) => void
  /** 把某个时间段移动到指定周表（AB 表调整归属用） */
  setSlotWeekType: (id: string, weekType: string) => void
  /** 重命名周表：把整张课表（含所有周表下的时间段）的 weekType 从 oldName 改成 newName */
  renameScheduleWeekType: (oldName: string, newName: string) => void
  addScheduleEntry: (slotId: string, entry: Omit<ScheduleEntry, 'isSelf'>) => void
  updateScheduleEntry: (
    slotId: string,
    entryIndex: number,
    patch: Partial<ScheduleEntry>,
  ) => void
  removeScheduleEntry: (slotId: string, entryIndex: number) => void

  /* 作业登记表单草稿 */
  setRegisterDraft: (
    draft: NonNullable<HomeworkState['registerDraft']>,
  ) => void
  clearRegisterDraft: () => void
}

export const useHomeworkStore = create<HomeworkState>()(
  persist(
    (set, get) => ({
      classes: [],
      records: [],
      subjects: [],
      scheduleSlots: [],
      faceReviews: [],
      exams: [],
      registerDraft: null,

      addClass: (name, semester, studentNames, ratingOptions) => {
        const id = uuidv4()
        const now = Date.now()
        const cls: HomeworkClass = {
          id,
          name: name.trim() || '未命名班级',
          semester: semester || '',
          students: buildStudents([], dedupeNames(studentNames)),
          ratingOptions:
            ratingOptions && ratingOptions.length
              ? [...ratingOptions]
              : [...DEFAULT_RATING_OPTIONS],
          createdAt: now,
        }
        set((s) => ({ classes: [cls, ...s.classes] }))
        return id
      },

      updateClassMeta: (id, patch) =>
        set((s) => ({
          classes: s.classes.map((c) =>
            c.id === id
              ? {
                  ...c,
                  name: patch.name !== undefined ? patch.name.trim() || c.name : c.name,
                  semester: patch.semester !== undefined ? patch.semester : c.semester,
                }
              : c,
          ),
        })),

      setClassStudents: (id, studentNames) =>
        set((s) => ({
          classes: s.classes.map((c) =>
            c.id === id ? { ...c, students: buildStudents(c.students, dedupeNames(studentNames)) } : c,
          ),
        })),

      removeClass: (id) =>
        set((s) => ({
          classes: s.classes.filter((c) => c.id !== id),
          // 同时删除该班所有登记记录、课程表、面批与成绩
          records: s.records.filter((r) => r.classId !== id),
          scheduleSlots: s.scheduleSlots.filter((x) => x.classId !== id),
          faceReviews: s.faceReviews.filter((x) => x.classId !== id),
          exams: s.exams.filter((x) => x.classId !== id),
        })),

      addRatingOption: (classId, opt) => {
        const v = opt.trim()
        if (!v) return
        set((s) => ({
          classes: s.classes.map((c) =>
            c.id === classId && !c.ratingOptions.includes(v)
              ? { ...c, ratingOptions: [...c.ratingOptions, v] }
              : c,
          ),
        }))
      },

      renameRatingOption: (classId, oldOpt, newOpt) => {
        const v = newOpt.trim()
        if (!v || v === oldOpt) return
        set((s) => ({
          classes: s.classes.map((c) => {
            if (c.id !== classId) return c
            if (c.ratingOptions.some((o) => o !== oldOpt && o === v)) return c
            return {
              ...c,
              ratingOptions: c.ratingOptions.map((o) => (o === oldOpt ? v : o)),
            }
          }),
          records: s.records.map((r) =>
            r.classId === classId
              ? {
                  ...r,
                  entries: r.entries.map((e) =>
                    e.rating === oldOpt ? { ...e, rating: v } : e,
                  ),
                }
              : r,
          ),
        }))
      },

      removeRatingOption: (classId, opt) =>
        set((s) => ({
          classes: s.classes.map((c) =>
            c.id === classId
              ? { ...c, ratingOptions: c.ratingOptions.filter((o) => o !== opt) }
              : c,
          ),
          records: s.records.map((r) =>
            r.classId === classId
              ? {
                  ...r,
                  entries: r.entries.map((e) =>
                    e.rating === opt ? { ...e, rating: null } : e,
                  ),
                }
              : r,
          ),
        })),

      setRatingOptions: (classId, options) => {
        const opts = Array.from(
          new Set(options.map((o) => o.trim()).filter((o) => o.length > 0)),
        )
        set((s) => {
          const cls = s.classes.find((c) => c.id === classId)
          if (!cls) return s
          const old = cls.ratingOptions
          const renameMap = new Map<string, string>()
          if (old.length === opts.length) {
            for (let i = 0; i < old.length; i++) {
              if (old[i] !== opts[i]) renameMap.set(old[i]!, opts[i]!)
            }
          }
          const valid = new Set(opts)
          return {
            classes: s.classes.map((c) =>
              c.id === classId ? { ...c, ratingOptions: opts } : c,
            ),
            records: s.records.map((r) =>
              r.classId === classId
                ? {
                    ...r,
                    entries: r.entries.map((e) => {
                      if (e.rating == null) return e
                      if (renameMap.has(e.rating)) return { ...e, rating: renameMap.get(e.rating)! }
                      if (!valid.has(e.rating)) return { ...e, rating: null }
                      return e
                    }),
                  }
                : r,
            ),
          }
        })
      },

      addRecord: (classId, date, content, entries, overallEvaluation, overallImages) => {
        const now = Date.now()
        const rec: HomeworkRecord = {
          id: uuidv4(),
          classId,
          date,
          content: content.trim(),
          entries,
          overallEvaluation: overallEvaluation ?? '',
          overallImages: overallImages ?? [],
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({ records: [rec, ...s.records] }))
        return rec.id
      },

      updateRecord: (id, patch) =>
        set((s) => ({
          records: s.records.map((r) =>
            r.id === id
              ? {
                  ...r,
                  ...(patch.date !== undefined && { date: patch.date }),
                  ...(patch.content !== undefined && { content: patch.content.trim() }),
                  ...(patch.entries !== undefined && { entries: patch.entries }),
                  ...(patch.overallEvaluation !== undefined && {
                    overallEvaluation: patch.overallEvaluation,
                  }),
                  ...(patch.overallImages !== undefined && {
                    overallImages: patch.overallImages,
                  }),
                  updatedAt: Date.now(),
                }
              : r,
          ),
        })),

      removeRecord: (id) =>
        set((s) => ({ records: s.records.filter((r) => r.id !== id) })),

      addFaceReview: (data) => {
        const now = Date.now()
        const item: FaceReview = { ...data, id: uuidv4(), createdAt: now, updatedAt: now }
        set((s) => ({ faceReviews: [item, ...s.faceReviews] }))
        return item.id
      },

      updateFaceReview: (id, patch) =>
        set((s) => ({
          faceReviews: s.faceReviews.map((f) =>
            f.id === id ? { ...f, ...patch, updatedAt: Date.now() } : f,
          ),
        })),

      removeFaceReview: (id) =>
        set((s) => ({ faceReviews: s.faceReviews.filter((f) => f.id !== id) })),

      addExam: (data) => {
        const now = Date.now()
        const exam: Exam = { ...data, id: uuidv4(), createdAt: now, updatedAt: now }
        set((s) => ({ exams: [exam, ...s.exams] }))
        return exam.id
      },

      updateExam: (id, patch) =>
        set((s) => ({
          exams: s.exams.map((e) =>
            e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e,
          ),
        })),

      removeExam: (id) =>
        set((s) => ({ exams: s.exams.filter((e) => e.id !== id) })),

      addSubject: (name, color) => {
        const id = uuidv4()
        const subject: Subject = {
          id,
          name: name.trim() || '未命名科目',
          color: color ?? pickSubjectColor(get().subjects.length),
        }
        set((s) => ({ subjects: [...s.subjects, subject] }))
        return id
      },

      updateSubject: (id, patch) =>
        set((s) => ({
          subjects: s.subjects.map((sub) =>
            sub.id === id
              ? {
                  ...sub,
                  ...(patch.name !== undefined && { name: patch.name.trim() || sub.name }),
                  ...(patch.color !== undefined && { color: patch.color }),
                }
              : sub,
          ),
        })),

      removeSubject: (id) =>
        set((s) => ({
          subjects: s.subjects.filter((sub) => sub.id !== id),
          // 依赖该科目的课程表条目一并删除，避免悬空
          scheduleSlots: s.scheduleSlots.filter((x) => x.subjectId !== id),
        })),

      addScheduleSlot: (slot) => {
        const id = uuidv4()
        const item: ScheduleSlot = {
          ...slot,
          id,
          entries: slot.entries ?? [],
        }
        set((s) => ({
          scheduleSlots: [...s.scheduleSlots, item],
        }))
        return id
      },

      updateScheduleSlot: (id, patch) =>
        set((s) => ({
          scheduleSlots: s.scheduleSlots.map((x) =>
            x.id === id
              ? {
                  ...x,
                  ...(patch.dayOfWeek !== undefined && { dayOfWeek: patch.dayOfWeek }),
                  ...(patch.startTime !== undefined && { startTime: patch.startTime }),
                  ...(patch.endTime !== undefined && { endTime: patch.endTime }),
                  ...(patch.entries !== undefined && { entries: patch.entries }),
                  ...(patch.subjectId !== undefined && { subjectId: patch.subjectId }),
                  ...(patch.location !== undefined && { location: patch.location }),
                  ...(patch.weekType !== undefined && { weekType: patch.weekType }),
                }
              : x,
          ),
        })),

      removeScheduleSlot: (id) =>
        set((s) => ({
          scheduleSlots: s.scheduleSlots.filter((x) => x.id !== id),
        })),

      removeScheduleSlots: (ids) => {
        if (ids.length === 0) return
        const set2 = new Set(ids)
        set((s) => ({ scheduleSlots: s.scheduleSlots.filter((x) => !set2.has(x.id)) }))
      },

      setSlotWeekType: (id, weekType) =>
        set((s) => ({
          scheduleSlots: s.scheduleSlots.map((x) =>
            x.id === id ? { ...x, weekType } : x,
          ),
        })),

      renameScheduleWeekType: (oldName, newName) => {
        if (!oldName || !newName || oldName === newName) return
        set((s) => ({
          scheduleSlots: s.scheduleSlots.map((x) =>
            (x.weekType ?? '') === oldName ? { ...x, weekType: newName } : x,
          ),
        }))
      },

      addScheduleEntry: (slotId, entry) =>
        set((s) => ({
          scheduleSlots: s.scheduleSlots.map((x) =>
            x.id === slotId
              ? { ...x, entries: [...(x.entries ?? []), { ...entry, isSelf: false }] }
              : x,
          ),
        })),

      updateScheduleEntry: (slotId, entryIndex, patch) =>
        set((s) => ({
          scheduleSlots: s.scheduleSlots.map((x) =>
            x.id === slotId
              ? {
                  ...x,
                  entries: (x.entries ?? []).map((e, i) =>
                    i === entryIndex ? { ...e, ...patch } : e,
                  ),
                }
              : x,
          ),
        })),

      removeScheduleEntry: (slotId, entryIndex) =>
        set((s) => ({
          scheduleSlots: s.scheduleSlots.map((x) =>
            x.id === slotId
              ? { ...x, entries: (x.entries ?? []).filter((_, i) => i !== entryIndex) }
              : x,
          ),
        })),

      setRegisterDraft: (draft) => set({ registerDraft: draft }),
      clearRegisterDraft: () => set({ registerDraft: null }),
    }),
    {
      name: 'my-desk:homework',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        classes: s.classes,
        records: s.records,
        subjects: s.subjects,
        scheduleSlots: s.scheduleSlots,
        faceReviews: s.faceReviews,
        exams: s.exams,
        registerDraft: s.registerDraft,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        if (!Array.isArray(state.classes)) state.classes = []
        if (!Array.isArray(state.records)) state.records = []
        if (!Array.isArray(state.subjects)) state.subjects = []
        if (!Array.isArray(state.scheduleSlots)) state.scheduleSlots = []
        if (!Array.isArray(state.faceReviews)) state.faceReviews = []
        if (!Array.isArray(state.exams)) state.exams = []
        if (!state.registerDraft || typeof state.registerDraft !== 'object') state.registerDraft = null
        if (state.registerDraft && !Array.isArray(state.registerDraft.overallImages)) {
          state.registerDraft.overallImages = []
        }
        // 字段兜底：老数据可能缺 initial / ratingOptions / overallEvaluation / score
        state.classes = state.classes.map((c) => ({
          ...c,
          students: sortStudentsByName(
            (c.students ?? []).map((st) => ({
              ...st,
              initial: st.initial || '',
            })),
          ),
          ratingOptions: Array.isArray(c.ratingOptions) && c.ratingOptions.length
            ? c.ratingOptions
            : [...DEFAULT_RATING_OPTIONS],
        }))
        state.records = (state.records ?? []).map((r) => ({
          ...r,
          overallEvaluation: r.overallEvaluation ?? '',
          overallImages: Array.isArray(r.overallImages) ? r.overallImages : [],
          entries: (r.entries ?? []).map((e) => ({
            ...e,
            score: e.score ?? null,
          })),
        }))
        state.faceReviews = (state.faceReviews ?? []).map((f) => ({
          ...f,
          content: f.content ?? '',
          done: !!f.done,
        }))
        state.exams = (state.exams ?? []).map((x) => ({
          ...x,
          subject: x.subject ?? '',
          fullScore: typeof x.fullScore === 'number' ? x.fullScore : 100,
          entries: Array.isArray(x.entries) ? x.entries : [],
        }))

        // scheduleSlots：兜底 classLabel，并把旧单条记录结构迁移为 entries 数组
        state.scheduleSlots = (state.scheduleSlots ?? []).map((s) => {
          const base = { ...s, classLabel: s.classLabel ?? '' }
          // 多周表字段兜底：老数据归入默认周表
          if (base.weekType === undefined || base.weekType === null) base.weekType = ''
          if (!Array.isArray(base.entries)) {
            const entry: ScheduleEntry = {
              subjectId: base.subjectId ?? '',
              teacherName: '',
              classLabel: base.classLabel || undefined,
              location: base.location || undefined,
              isSelf: false,
            }
            base.entries = entry.subjectId ? [entry] : []
          }
          return base
        })
      },
    },
  ),
)
