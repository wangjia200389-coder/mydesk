import { useEffect, useMemo, useState } from 'react'
import { SEMESTERS, currentSemesterLabel, sortStudentsByName, type HomeworkStudent } from '@/lib/homework'
import { parseRosterExcel } from '@/lib/excel'
import { useHomeworkStore, type HomeworkClass } from '@/store/useHomeworkStore'
import FileUploadButton from '@/components/FileUploadButton'
import { usePasteUpload } from '@/lib/upload'

interface Props {
  open: boolean
  onClose: () => void
  editClass?: HomeworkClass | null
}

export default function ClassForm({ open, onClose, editClass }: Props) {
  const addClass = useHomeworkStore((s) => s.addClass)
  const updateClassMeta = useHomeworkStore((s) => s.updateClassMeta)
  const setClassStudents = useHomeworkStore((s) => s.setClassStudents)
  const setRatingOptions = useHomeworkStore((s) => s.setRatingOptions)

  const [name, setName] = useState('')
  const [semester, setSemester] = useState(currentSemesterLabel())
  const [namesText, setNamesText] = useState('')
  const [ratingOptions, setRatingOptionsLocal] = useState<string[]>(['A', 'B', 'C'])
  const [parseError, setParseError] = useState('')
  const [parsing, setParsing] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editingVal, setEditingVal] = useState('')
  const [newOpt, setNewOpt] = useState('')

  // 粘贴上传：从微信复制 Excel 名单后粘贴即可导入
  usePasteUpload((files) => {
    const excel = files.find(
      (f) =>
        f.name.endsWith('.xlsx') ||
        f.name.endsWith('.xls') ||
        f.name.endsWith('.csv'),
    )
    if (excel) void handleExcel(excel)
  })

  // 打开 / 切换编辑对象时同步初始值
  useEffect(() => {
    if (!open) return
    if (editClass) {
      setName(editClass.name)
      setSemester(editClass.semester || SEMESTERS[0]!.label)
      setNamesText(editClass.students.map((s) => s.name).join('\n'))
      setRatingOptionsLocal([...editClass.ratingOptions])
    } else {
      setName('')
      setSemester(currentSemesterLabel())
      setNamesText('')
      setRatingOptionsLocal(['A', 'B', 'C'])
    }
    setParseError('')
    setEditingIdx(null)
    setNewOpt('')
  }, [open, editClass])

  const names = useMemo(
    () =>
      Array.from(
        new Set(
          namesText
            .split('\n')
            .map((n) => n.trim())
            .filter(Boolean),
        ),
      ),
    [namesText],
  )

  const previewStudents: HomeworkStudent[] = useMemo(
    () => sortStudentsByName(names.map((n) => ({ id: '', name: n, initial: '' }))),
    [names],
  )

  if (!open) return null

  const handleExcel = async (file: File) => {
    setParsing(true)
    setParseError('')
    try {
      const parsed = await parseRosterExcel(file)
      if (parsed.length === 0) {
        setParseError('未能从文件中识别到姓名，请检查是否包含「姓名」表头列。')
      } else {
        setNamesText(parsed.join('\n'))
      }
    } catch {
      setParseError('Excel 解析失败，请确认文件格式为 .xlsx / .xls / .csv。')
    } finally {
      setParsing(false)
    }
  }

  const commitRename = (idx: number) => {
    const v = editingVal.trim()
    if (v && !ratingOptions.some((o, i) => i !== idx && o === v)) {
      setRatingOptionsLocal((opts) => opts.map((o, i) => (i === idx ? v : o)))
    }
    setEditingIdx(null)
  }

  const addOpt = () => {
    const v = newOpt.trim()
    if (v && !ratingOptions.includes(v)) setRatingOptionsLocal((opts) => [...opts, v])
    setNewOpt('')
  }

  const removeOpt = (idx: number) => {
    setRatingOptionsLocal((opts) => opts.filter((_, i) => i !== idx))
    setEditingIdx(null)
  }

  const handleSave = () => {
    if (!name.trim()) return
    if (names.length === 0) return
    if (ratingOptions.length === 0) return
    if (editClass) {
      updateClassMeta(editClass.id, { name, semester })
      setClassStudents(editClass.id, names)
      setRatingOptions(editClass.id, ratingOptions)
    } else {
      addClass(name.trim(), semester, names, ratingOptions)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30 backdrop-blur-sm md:items-center">
      <div className="scroll-soft max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-soft md:rounded-3xl md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-ink-900">
            {editClass ? '编辑班级' : '新建班级'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full bg-petal-50 px-3 py-1 text-sm text-petal-600 transition-colors hover:bg-petal-100"
          >
            关闭
          </button>
        </div>

        {/* 基础信息 */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-700">班级名称 *</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：高三(1)班"
              className="rounded-xl border border-petal-100 bg-cream/60 px-3 py-2.5 text-ink-900 outline-none transition-colors focus:border-petal-400"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-700">所属学期 *</span>
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className="rounded-xl border border-petal-100 bg-cream/60 px-3 py-2.5 text-ink-900 outline-none transition-colors focus:border-petal-400"
            >
              {SEMESTERS.map((s) => (
                <option key={s.label} value={s.label}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* 名单导入 */}
        <div className="mt-5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink-700">
              班级成员名单（{names.length} 人）
            </span>
            <FileUploadButton
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              disabled={parsing}
              onFiles={(files) => {
                const f = files.find(
                  (x) =>
                    x.name.endsWith('.xlsx') ||
                    x.name.endsWith('.xls') ||
                    x.name.endsWith('.csv'),
                )
                if (f) void handleExcel(f)
              }}
              className="rounded-full bg-lavender-100 px-3 py-1.5 text-sm font-medium text-lavender-700 transition-colors hover:bg-lavender-200 disabled:opacity-60"
            >
              {parsing ? '解析中…' : '📥 从 Excel 导入'}
            </FileUploadButton>
          </div>
          <textarea
            value={namesText}
            onChange={(e) => setNamesText(e.target.value)}
            rows={4}
            placeholder="可手动输入，每行一个姓名；或用上方按钮从 Excel 导入（自动识别「姓名」列）"
            className="scroll-soft rounded-xl border border-petal-100 bg-cream/60 px-3 py-2.5 text-sm text-ink-900 outline-none transition-colors focus:border-petal-400"
          />
          {parseError && <p className="text-xs text-red-500">{parseError}</p>}

          {/* 名单预览：每行一名（按首字母自动排序） */}
          {previewStudents.length > 0 && (
            <div className="scroll-soft mt-1 max-h-44 overflow-y-auto rounded-xl border border-petal-100">
              <div className="flex items-center gap-2 px-3 pb-1 pt-2 text-[11px] text-ink-400">
                <div className="w-24 shrink-0">姓名</div>
                <div className="w-20 shrink-0">评级</div>
                <div className="flex-1">备注</div>
              </div>
              {previewStudents.map((st, i) => (
                <div
                  key={`${st.name}-${i}`}
                  className="flex items-center gap-2 border-t border-petal-50 px-3 py-2"
                >
                  <div className="flex w-24 shrink-0 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-petal-100 text-xs font-semibold text-petal-600">
                      {(st.initial?.charAt(0) || st.name.charAt(0)).toUpperCase()}
                    </span>
                    <span className="truncate text-sm font-medium text-ink-900">
                      {st.name}
                    </span>
                  </div>
                  <span className="w-20 shrink-0 rounded-md bg-cream-deep px-2 py-1 text-center text-xs text-ink-400">
                    登记时选
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-400">
                    登记时填
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 评级选项（动态可配） */}
        <div className="mt-5 flex flex-col gap-2">
          <span className="text-sm font-medium text-ink-700">作业评级选项（可增删改）</span>
          <div className="flex flex-wrap items-center gap-2">
            {ratingOptions.map((opt, idx) => (
              <div
                key={`${opt}-${idx}`}
                className="flex items-center gap-1 rounded-full bg-mint-100 px-2.5 py-1 text-sm text-mint-700 ring-1 ring-mint-300"
              >
                {editingIdx === idx ? (
                  <input
                    autoFocus
                    value={editingVal}
                    onChange={(e) => setEditingVal(e.target.value)}
                    onBlur={() => commitRename(idx)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(idx)
                      if (e.key === 'Escape') setEditingIdx(null)
                    }}
                    className="w-12 rounded bg-surface px-1 text-center text-mint-800 outline-none"
                  />
                ) : (
                  <button
                    onClick={() => {
                      setEditingIdx(idx)
                      setEditingVal(opt)
                    }}
                    className="font-medium"
                    title="点击重命名"
                  >
                    {opt}
                  </button>
                )}
                <button
                  onClick={() => removeOpt(idx)}
                  className="text-mint-700/60 transition-colors hover:text-red-500"
                  title="删除"
                >
                  ✕
                </button>
              </div>
            ))}
            <div className="flex items-center gap-1">
              <input
                value={newOpt}
                onChange={(e) => setNewOpt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addOpt()}
                placeholder="新增"
                className="w-16 rounded-full border border-petal-100 bg-cream/60 px-2.5 py-1 text-sm text-ink-900 outline-none focus:border-petal-400"
              />
              <button
                onClick={addOpt}
                className="rounded-full bg-petal-100 px-2.5 py-1 text-sm text-petal-600 transition-colors hover:bg-petal-200"
              >
                ＋
              </button>
            </div>
          </div>
        </div>

        {/* 底部操作 */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-full border border-petal-100 px-5 py-2.5 text-sm font-medium text-ink-500 transition-colors hover:bg-petal-50"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || names.length === 0 || ratingOptions.length === 0}
            className="rounded-full bg-petal-500 px-6 py-2.5 text-sm font-semibold text-white shadow-card transition-colors hover:bg-petal-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {editClass ? '保存修改' : '创建班级'}
          </button>
        </div>
      </div>
    </div>
  )
}
