import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHomeworkStore } from '@/store/useHomeworkStore'
import CourseSchedule from '@/components/homework/CourseSchedule'

/**
 * 课程表独立入口（导航栏「课程表」）。
 * 复用 components/homework/CourseSchedule，仅补充「选班级」外壳：
 * - 无班级 → 引导去「教学工具」新建班级；
 * - 多班级 → 顶部下拉切换；单班级 → 直接展示。
 */
export default function CourseSchedulePage() {
  const classes = useHomeworkStore((s) => s.classes)
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = useMemo(
    () => classes.find((c) => c.id === selectedId) ?? null,
    [classes, selectedId],
  )

  if (classes.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <div className="text-5xl">🗓️</div>
        <h1 className="mt-3 text-xl font-semibold text-ink-900">课程表</h1>
        <p className="mt-2 text-sm text-ink-400">
          还没有班级，课程表需要先到「教学工具」里创建班级并上传课表。
        </p>
        <button
          type="button"
          onClick={() => navigate('/homework')}
          className="mt-5 rounded-full bg-petal-500 px-5 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-petal-600"
        >
          前往教学工具
        </button>
      </div>
    )
  }

  const active = selected ?? classes[0]!

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 md:px-6">
      {classes.length > 1 && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-sm text-ink-500">班级</span>
          <select
            value={active.id}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded-xl border border-petal-100 bg-cream/60 px-3 py-2 text-sm text-ink-900 outline-none focus:border-petal-400"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <CourseSchedule
        classId={active.id}
        onBack={() => (classes.length > 1 ? setSelectedId(null) : navigate('/'))}
      />
    </div>
  )
}
