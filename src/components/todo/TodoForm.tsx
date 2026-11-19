import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { v4 as uuidv4 } from 'uuid'
import {
  REPEAT_OPTIONS,
  TIME_SLOTS,
  useTodoStore,
  type RepeatFreq,
  type SubTask,
  type TimeSlotKey,
  type Todo,
  type TodoDraft,
  type SubtaskHistoryItem,
} from '@/store/useTodoStore'
import { CategoryTagStatic } from './CategoryTag'

export interface TodoFormProps {
  open: boolean
  onClose: () => void
  editTodoId?: string | null
  /** 快捷新建：预填截止日期（现在不再有 null=收集箱；null 或空都会默认今天） */
  seedDueDate?: string | null
}

function emptySubtasks(): SubTask[] {
  return []
}

export default function TodoForm(props: TodoFormProps) {
  const categories = useTodoStore((s) => s.categories)
  const addCategory = useTodoStore((s) => s.addCategory)
  const removeCategory = useTodoStore((s) => s.removeCategory)
  const todos = useTodoStore((s) => s.todos)
  const addTodo = useTodoStore((s) => s.addTodo)
  const updateTodo = useTodoStore((s) => s.updateTodo)
  const subtaskHistoryLibrary = useTodoStore((s) => s.subtaskHistoryLibrary)
  const addSubtaskHistory = useTodoStore((s) => s.addSubtaskHistory)
  const renameSubtaskHistory = useTodoStore((s) => s.renameSubtaskHistory)
  const removeSubtaskHistory = useTodoStore((s) => s.removeSubtaskHistory)

  const editing: Todo | undefined = useMemo(
    () => (props.editTodoId ? todos.find((t) => t.id === props.editTodoId) : undefined),
    [props.editTodoId, todos],
  )

  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState<string>('other')
  const [dueDate, setDueDate] = useState<string>(dayjs().format('YYYY-MM-DD'))
  const [timeSlot, setTimeSlot] = useState<TimeSlotKey>('none')
  const [customStart, setCustomStart] = useState<string>('19:00')
  const [customEnd, setCustomEnd] = useState<string>('22:00')
  const [notes, setNotes] = useState('')
  const [subtasks, setSubtasks] = useState<SubTask[]>(emptySubtasks())
  const [subtaskInput, setSubtaskInput] = useState('')
  const [repeat, setRepeat] = useState<RepeatFreq>('once')
  const [allowAheadOfSchedule, setAllowAheadOfSchedule] = useState<boolean>(false)
  const [remindManual, setRemindManual] = useState<boolean>(false)
  const [newCatInput, setNewCatInput] = useState('')

  /* 子计划历史库 UI 状态 */
  const [showHistory, setShowHistory] = useState(false)
  const [saveToHistoryChecked, setSaveToHistoryChecked] = useState(false)
  const [historyItemNameInput, setHistoryItemNameInput] = useState('')
  const [renamingHistoryId, setRenamingHistoryId] = useState<string | null>(null)
  const [renameInput, setRenameInput] = useState('')

  // 每次打开 Modal：根据 editing 或 seed 重置
  useEffect(() => {
    if (!props.open) return
    if (editing) {
      setTitle(editing.title)
      setCategoryId(editing.categoryId)
      setDueDate(editing.dueDate)
      setTimeSlot(editing.timeSlot)
      setCustomStart(editing.customStart ?? '19:00')
      setCustomEnd(editing.customEnd ?? '22:00')
      setNotes(editing.notes)
      setSubtasks(editing.subtasks.length ? editing.subtasks.slice() : [])
      setSubtaskInput('')
      setRepeat(editing.repeat)
      setAllowAheadOfSchedule(!!editing.allowAheadOfSchedule)
      setRemindManual(!!editing.remindManual)
    } else {
      setTitle('')
      setCategoryId('other')
      setDueDate(props.seedDueDate ?? dayjs().format('YYYY-MM-DD'))
      setTimeSlot('none')
      setCustomStart('19:00')
      setCustomEnd('22:00')
      setNotes('')
      setSubtasks([])
      setSubtaskInput('')
      setRepeat('once')
      setAllowAheadOfSchedule(false)
      setRemindManual(false)
    }
    setShowHistory(false)
    setSaveToHistoryChecked(false)
    setHistoryItemNameInput('')
    setRenamingHistoryId(null)
    setRenameInput('')
  }, [props.open, editing, props.seedDueDate])

  // 截止日期：允许任意过去/未来日期（不再限制到当月）
  const today = dayjs().startOf('day')
  const quickDates = [
    { label: '今天', v: today.format('YYYY-MM-DD') },
    { label: '明天', v: today.add(1, 'day').format('YYYY-MM-DD') },
    { label: '后天', v: today.add(2, 'day').format('YYYY-MM-DD') },
    { label: '下周一', v: today.add(((8 - today.isoWeekday()) % 7 || 7), 'day').format('YYYY-MM-DD') },
    { label: '下个月今天', v: today.add(1, 'month').format('YYYY-MM-DD') },
  ]

  const addSub = () => {
    const text = subtaskInput.trim()
    if (!text) return
    setSubtasks((xs) => [...xs, { id: uuidv4(), title: text, done: false }])
    setSubtaskInput('')
  }

  const toDraft = (): TodoDraft => ({
    title,
    categoryId,
    dueDate,
    timeSlot,
    customStart: timeSlot === 'custom' ? customStart : null,
    customEnd: timeSlot === 'custom' ? customEnd : null,
    notes,
    subtasks,
    repeat,
    allowAheadOfSchedule,
    remindManual,
  })

  const onSubmit = () => {
    const d = toDraft()
    if (!d.title.trim()) return
    if (editing) {
      // 编辑时：dueDate 保证非 null（已经在 toDraft 里兜底过，若空 draft.dueDate 会是今天字符串）
      // 但 TodoDraft 定义 dueDate: string|null，而 updateTodo patch 需要 string|undefined → 手动转
      const { originId: _ignored, dueDate, ...rest } = d
      void _ignored
      const patch = { ...rest, dueDate: dueDate ?? undefined }
      updateTodo(editing.id, patch)
    } else {
      addTodo(d)
    }

    // 新建/编辑且勾选"保存到历史库"：把子计划存为模板
    if (saveToHistoryChecked && subtasks.length > 0) {
      const fallbackName =
        historyItemNameInput.trim() ||
        subtasks[0]?.title.slice(0, 16) ||
        (title.trim().length ? title.trim().slice(0, 16) + ' 子计划' : '')
      addSubtaskHistory(fallbackName, subtasks.map((s) => ({ title: s.title })))
    }

    props.onClose()
  }

  const applyHistory = (item: SubtaskHistoryItem) => {
    setSubtasks(item.subtasks.map((s) => ({ id: uuidv4(), title: s.title, done: false })))
    setShowHistory(false)
  }

  return props.open ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/30 p-3 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose()
      }}
    >
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl border border-petal-100 bg-surface p-5 shadow-soft sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-ink-900">
            {editing ? '编辑任务' : '新建任务'}
          </h3>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-lg px-2 py-1 text-ink-400 hover:bg-petal-50 hover:text-ink-700"
          >
            ✕
          </button>
        </div>

        {/* 标题 */}
        <label className="mb-1.5 block text-xs font-medium text-ink-500">任务标题</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="要做些什么呢～"
          className="w-full rounded-xl border border-petal-200 bg-cream px-4 py-2.5 text-sm outline-none transition focus:border-petal-400 focus:ring-4 focus:ring-petal-100"
          maxLength={80}
        />

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* 分类 */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-ink-500">分类</span>
              {categories.find((c) => c.id === categoryId) && !categories.find((c) => c.id === categoryId)!.preset && (
                <button
                  type="button"
                  className="text-[11px] text-petal-600 hover:text-petal-500"
                  onClick={() => removeCategory(categoryId)}
                >
                  删除该分类
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition ${
                    c.id === categoryId
                      ? 'border-transparent ring-2 ring-petal-400 shadow-card'
                      : 'border-transparent opacity-80 hover:opacity-100'
                  }`}
                >
                  <CategoryTagStatic cat={c} />
                </button>
              ))}
              <div className="flex items-center gap-1 rounded-full border border-dashed border-petal-200 px-1.5">
                <input
                  value={newCatInput}
                  onChange={(e) => setNewCatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const name = newCatInput.trim()
                      if (name) {
                        const c = addCategory(name)
                        setCategoryId(c.id)
                        setNewCatInput('')
                      }
                    }
                  }}
                  placeholder="+ 新分类（回车）"
                  className="w-28 bg-transparent px-1 py-1 text-xs outline-none placeholder:text-ink-400"
                  maxLength={12}
                />
              </div>
            </div>
          </div>

          {/* 重复频率 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">重复频率</label>
            <select
              value={repeat}
              onChange={(e) => setRepeat(e.target.value as RepeatFreq)}
              className="w-full rounded-xl border border-petal-200 bg-cream px-3 py-2 text-sm outline-none focus:border-petal-400 focus:ring-4 focus:ring-petal-100"
            >
              {REPEAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 截止日期 + 是否可以提前完成 */}
        <div className="mt-4 rounded-2xl border border-petal-100 bg-petal-50/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <label className="mb-1.5 block text-xs font-medium text-ink-700">截止日期</label>
              <div className="flex flex-wrap items-center gap-2">
                {quickDates.map((q) => (
                  <button
                    key={q.v}
                    type="button"
                    onClick={() => setDueDate(q.v)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      dueDate === q.v
                        ? 'bg-gradient-to-br from-petal-400 to-petal-500 text-white shadow-card'
                        : 'bg-white text-petal-600 ring-1 ring-petal-100 hover:bg-petal-100'
                    }`}
                  >
                    {q.label}
                  </button>
                ))}
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="rounded-xl border border-petal-200 bg-cream px-3 py-1.5 text-xs outline-none focus:border-petal-400 focus:ring-4 focus:ring-petal-100"
                />
              </div>
            </div>

            {/* 是否可以提前完成（开关）：整卡可点击 */}
            <label
              role="button"
              tabIndex={0}
              onClick={() => setAllowAheadOfSchedule((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setAllowAheadOfSchedule((v) => !v)
                }
              }}
              className="shrink-0 inline-flex cursor-pointer select-none items-center gap-2 rounded-2xl bg-white/80 px-3 py-2 ring-1 ring-petal-100 transition hover:ring-petal-300 focus:outline-none focus:ring-2 focus:ring-petal-400 focus:ring-offset-2 focus:ring-offset-petal-50/40"
            >
              <span className="text-xs font-semibold text-ink-800">可以提前完成</span>
              <span
                role="switch"
                aria-checked={allowAheadOfSchedule}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  allowAheadOfSchedule ? 'bg-gradient-to-br from-mint-400 to-mint-500' : 'bg-ink-200'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-card ring-1 ring-black/5 transition-transform duration-200 ${
                    allowAheadOfSchedule ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </span>
            </label>

            {/* 手动提醒开关 */}
            <label
              role="button"
              tabIndex={0}
              onClick={() => setRemindManual((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setRemindManual((v) => !v)
                }
              }}
              className="shrink-0 inline-flex cursor-pointer select-none items-center gap-2 rounded-2xl bg-white/80 px-3 py-2 ring-1 ring-petal-100 transition hover:ring-petal-300 focus:outline-none focus:ring-2 focus:ring-petal-400 focus:ring-offset-2 focus:ring-offset-petal-50/40"
            >
              <span className="text-xs font-semibold text-ink-800">提醒</span>
              <span
                role="switch"
                aria-checked={remindManual}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  remindManual ? 'bg-gradient-to-br from-lavender-400 to-lavender-500' : 'bg-ink-200'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-card ring-1 ring-black/5 transition-transform duration-200 ${
                    remindManual ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </span>
            </label>
          </div>
        </div>

        {/* 时间段 */}
        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium text-ink-500">时间段</label>
          <div className="flex flex-wrap gap-2">
            {TIME_SLOTS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTimeSlot(t.key)}
                className={`rounded-xl px-3 py-2 text-xs transition ${
                  timeSlot === t.key
                    ? 'bg-lavender-200 text-lavender-700 ring-2 ring-lavender-300 shadow-card'
                    : 'bg-surface ring-1 ring-petal-100 text-ink-600 hover:bg-petal-50'
                }`}
              >
                <div className="font-semibold">{t.label}</div>
                {t.hours && <div className="text-[10px] text-ink-400">{t.hours}</div>}
              </button>
            ))}
          </div>
          {timeSlot === 'custom' && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <input
                type="time"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded-lg border border-petal-200 bg-cream px-2 py-1 outline-none focus:border-petal-400 focus:ring-4 focus:ring-petal-100"
              />
              <span className="text-ink-400">至</span>
              <input
                type="time"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-lg border border-petal-200 bg-cream px-2 py-1 outline-none focus:border-petal-400 focus:ring-4 focus:ring-petal-100"
              />
            </div>
          )}
        </div>

        {/* 备注 */}
        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium text-ink-500">备注</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder=""
            className="w-full resize-y rounded-xl border border-petal-200 bg-cream px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap outline-none transition focus:border-petal-400 focus:ring-4 focus:ring-petal-100"
          />
        </div>

        {/* 子计划（含历史库） */}
        <div className="mt-4 rounded-2xl border border-petal-100 bg-surface/70 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label className="block text-xs font-medium text-ink-700">
              🧩 子计划
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {subtasks.length > 0 && (
                <label className="inline-flex items-center gap-1.5 text-[11px] text-ink-500">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-petal-500"
                    checked={saveToHistoryChecked}
                    onChange={(e) => setSaveToHistoryChecked(e.target.checked)}
                  />
                  保存到历史库
                </label>
              )}
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                className={`rounded-lg px-2.5 py-1 text-[11px] transition ${
                  showHistory
                    ? 'bg-petal-500 text-white shadow-card'
                    : 'bg-petal-100 text-petal-700 ring-1 ring-petal-200 hover:bg-petal-200'
                }`}
              >
                {showHistory ? '关闭历史库' : '📚 从历史库选择'}
              </button>
            </div>
          </div>

          {/* 保存到历史库时的命名输入 */}
          {saveToHistoryChecked && (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-mint-50 px-3 py-2 ring-1 ring-mint-100">
              <span className="text-[11px] text-mint-700 whitespace-nowrap">名称</span>
              <input
                value={historyItemNameInput}
                onChange={(e) => setHistoryItemNameInput(e.target.value)}
                placeholder=""
                className="flex-1 rounded-lg border border-mint-200 bg-white px-2 py-1 text-xs outline-none focus:border-mint-400 focus:ring-4 focus:ring-mint-100"
                maxLength={24}
              />
            </div>
          )}

          {/* 历史库面板 */}
          {showHistory && (
            <div className="mb-3 max-h-60 overflow-y-auto rounded-xl bg-white/80 p-3 ring-1 ring-petal-100">
              {subtaskHistoryLibrary.length === 0 ? (
                <div className="py-5 text-center text-xs text-ink-400">
                  历史库为空
                </div>
              ) : (
                <ul className="space-y-2">
                  {subtaskHistoryLibrary.map((item) => (
                    <li key={item.id} className="rounded-xl bg-surface p-2.5 ring-1 ring-petal-100">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {renamingHistoryId === item.id ? (
                          <input
                            value={renameInput}
                            onChange={(e) => setRenameInput(e.target.value)}
                            onBlur={() => {
                              if (renameInput.trim()) renameSubtaskHistory(item.id, renameInput)
                              setRenamingHistoryId(null)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (renameInput.trim()) renameSubtaskHistory(item.id, renameInput)
                                setRenamingHistoryId(null)
                              }
                            }}
                            autoFocus
                            className="rounded-lg border border-petal-200 bg-white px-2 py-1 text-xs outline-none focus:border-petal-400 focus:ring-4 focus:ring-petal-100"
                          />
                        ) : (
                          <span
                            className="text-xs font-semibold text-ink-800 cursor-pointer hover:text-petal-600"
                            onClick={() => {
                              setRenamingHistoryId(item.id)
                              setRenameInput(item.name)
                            }}
                            title="点击重命名"
                          >
                            {item.name}
                          </span>
                        )}
                        <div className="flex items-center gap-1">
                          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] text-ink-500">
                            {item.subtasks.length} 条
                          </span>
                          <button
                            type="button"
                            onClick={() => applyHistory(item)}
                            className="rounded-lg bg-petal-100 px-2 py-1 text-[11px] text-petal-700 ring-1 ring-petal-200 hover:bg-petal-200"
                          >
                            使用
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`删除历史模板「${item.name}」？`)) removeSubtaskHistory(item.id)
                            }}
                            className="rounded-lg px-2 py-1 text-[11px] text-ink-400 hover:bg-ink-50 hover:text-petal-600"
                            title="删除"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                      <ul className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-ink-500">
                        {item.subtasks.slice(0, 5).map((s, i) => (
                          <li key={i} className="rounded-full bg-cream px-2 py-0.5 ring-1 ring-petal-100">
                            {s.title}
                          </li>
                        ))}
                        {item.subtasks.length > 5 && (
                          <li className="rounded-full bg-ink-50 px-2 py-0.5 text-ink-400">
                            +{item.subtasks.length - 5}…
                          </li>
                        )}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <input
              value={subtaskInput}
              onChange={(e) => setSubtaskInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addSub()
                }
              }}
              placeholder="回车添加"
              className="flex-1 rounded-xl border border-petal-200 bg-cream px-4 py-2 text-sm outline-none focus:border-petal-400 focus:ring-4 focus:ring-petal-100"
              maxLength={80}
            />
            <button
              type="button"
              onClick={addSub}
              className="rounded-xl bg-mint-200 px-4 text-sm font-semibold text-mint-700 ring-1 ring-mint-300 hover:bg-mint-300"
            >
              添加
            </button>
          </div>
          {subtasks.length > 0 && (
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {subtasks.map((s) => (
                <li key={s.id} className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 text-sm ring-1 ring-petal-100">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-petal-500"
                    checked={s.done}
                    onChange={() =>
                      setSubtasks((xs) =>
                        xs.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)),
                      )
                    }
                  />
                  <span className={`flex-1 ${s.done ? 'text-ink-400 line-through' : 'text-ink-700'}`}>{s.title}</span>
                  <button
                    type="button"
                    onClick={() => setSubtasks((xs) => xs.filter((x) => x.id !== s.id))}
                    className="text-xs text-ink-400 hover:text-petal-600"
                  >
                    删除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 按钮 */}
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={props.onClose}
              className="rounded-xl border border-petal-100 bg-surface px-4 py-2 text-sm font-medium text-ink-500 hover:bg-petal-50 hover:text-ink-700"
            >
              取消
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={!title.trim()}
              className="rounded-xl bg-gradient-to-br from-petal-400 to-petal-500 px-5 py-2 text-sm font-semibold text-white shadow-card transition hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {editing ? '保存修改' : '创建任务'}
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null
}
