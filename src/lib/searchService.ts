import { useTodoStore } from '@/store/useTodoStore'
import { useNotesStore } from '@/store/useNotesStore'
import { useItemStore } from '@/store/useItemStore'
import { useHomeworkStore } from '@/store/useHomeworkStore'
import { useKnowledgeStore } from '@/store/useKnowledgeStore'

export interface SearchResult {
  module: string
  /** 跳转路由 */
  to: string
  /** 显示标题 */
  title: string
  /** 摘要 */
  snippet?: string
  /** 排序权重（越大越靠前） */
  weight?: number
}

function norm(s: string): string {
  return (s || '').toLowerCase()
}

function matches(q: string, hay: string): boolean {
  return norm(hay).includes(q.toLowerCase())
}

/** 取匹配点附近的文本片段作为摘要 */
function makeSnippet(text: string, q: string): string | undefined {
  if (!text) return undefined
  const idx = norm(text).indexOf(q.toLowerCase())
  if (idx < 0) return undefined
  const start = Math.max(0, idx - 18)
  const end = Math.min(text.length, idx + q.length + 36)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

/**
 * 统一搜索：聚合各模块 store 的当前数据，按关键词（不区分大小写）匹配。
 * 非响应式地读取 getState()，适合「输入即搜」的按需场景。
 */
export function searchAll(rawQuery: string): SearchResult[] {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return []
  const results: SearchResult[] = []

  // 待办：标题、备注、子计划标题
  for (const t of useTodoStore.getState().todos) {
    const subText = t.subtasks?.map((s) => s.title).join('\n') ?? ''
    const hay = `${t.title}\n${t.notes}\n${subText}`
    if (matches(q, hay)) {
      results.push({
        module: '待办',
        to: '/todo',
        title: t.title || '（无标题任务）',
        snippet: makeSnippet(`${t.title} ${t.notes} ${subText}`, q),
        weight: t.title && matches(q, t.title) ? 10 : 5,
      })
    }
  }

  // 便签：标题、正文
  for (const n of useNotesStore.getState().notes) {
    const hay = `${n.title}\n${n.content}`
    if (matches(q, hay)) {
      results.push({
        module: '便签',
        to: '/notes',
        title: n.title || '（无标题便签）',
        snippet: makeSnippet(`${n.title} ${n.content}`, q),
        weight: n.title && matches(q, n.title) ? 10 : 5,
      })
    }
  }

  // 物品：名称、标签名、评价
  const itemsState = useItemStore.getState()
  for (const it of itemsState.items) {
    const tagNames = it.tags
      .map((tid) => itemsState.tags.find((t) => t.id === tid)?.name ?? '')
      .join(' ')
    const hay = `${it.name}\n${it.review ?? ''}\n${it.remark ?? ''}\n${tagNames}`
    if (matches(q, hay)) {
      results.push({
        module: '物品',
        to: `/items/${it.id}`,
        title: it.name || '未命名物品',
        snippet: makeSnippet(`${it.name} ${tagNames} ${it.review ?? ''} ${it.remark ?? ''}`, q) || tagNames || undefined,
        weight: it.name && matches(q, it.name) ? 10 : 5,
      })
    }
  }

  // 作业登记：作业标题、整体评价、学生姓名、学生备注
  const hw = useHomeworkStore.getState()
  const className = new Map(hw.classes.map((c) => [c.id, c.name]))
  const subjectName = new Map(hw.subjects.map((s) => [s.id, s.name]))

  for (const r of hw.records) {
    const clsName = className.get(r.classId) ?? ''
    // 作业级匹配
    const recordHay = `${r.content}\n${r.overallEvaluation ?? ''}\n${clsName}`
    if (matches(q, recordHay)) {
      results.push({
        module: '作业登记',
        to: `/homework?recordId=${encodeURIComponent(r.id)}`,
        title: r.content || '（无内容登记）',
        snippet: makeSnippet(`${clsName} ${r.content} ${r.overallEvaluation ?? ''}`, q),
        weight: r.content && matches(q, r.content) ? 10 : 5,
      })
    }
    // 学生级匹配：每个学生产生一条可定位的结果
    for (const e of r.entries) {
      const stHay = `${e.studentName ?? ''}\n${e.note ?? ''}`
      if (matches(q, stHay)) {
        results.push({
          module: '作业登记',
          to: `/homework?recordId=${encodeURIComponent(r.id)}&studentName=${encodeURIComponent(
            e.studentName ?? '',
          )}`,
          title: `${e.studentName || '未知学生'} · ${r.content || '登记'}`,
          snippet: makeSnippet(`${clsName} ${e.studentName} ${e.note || ''}`, q),
          weight: e.studentName && matches(q, e.studentName) ? 12 : 6,
        })
      }
    }
  }

  // 课程表
  for (const s of hw.scheduleSlots) {
    const cls = className.get(s.classId) ?? ''
    const entries = s.entries ?? []
    for (const e of entries) {
      const subj = subjectName.get(e.subjectId) ?? ''
      const hay = `${subj}\n${e.teacherName ?? ''}\n${e.classLabel ?? ''}\n${e.location ?? ''}\n${cls}`
      if (matches(q, hay)) {
        results.push({
          module: '课程表',
          to: '/courses',
          title: subj || '课程',
          snippet: makeSnippet(
            `${cls} ${subj} ${e.teacherName ?? ''} ${e.classLabel ?? ''} ${e.location ?? ''}`,
            q,
          ),
          weight: subj && matches(q, subj) ? 10 : e.teacherName && matches(q, e.teacherName) ? 9 : 5,
        })
      }
    }
  }

  // 知识库
  for (const f of useKnowledgeStore.getState().files) {
    const hay = `${f.name}\n${f.text ?? ''}`
    if (matches(q, hay)) {
      results.push({
        module: '知识库',
        to: '/knowledge',
        title: f.name,
        snippet: f.text ? makeSnippet(`${f.name} ${f.text}`, q) : undefined,
        weight: f.name && matches(q, f.name) ? 10 : 5,
      })
    }
  }

  // 同模块内按权重倒排
  return results.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
}
