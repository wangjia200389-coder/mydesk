import { useState } from 'react'
import type { ItemTag } from '@/store/useItemStore'
import { tagChipStyle } from '@/lib/itemsUtil'

interface Props {
  value: string[]
  onChange: (ids: string[]) => void
  tags: ItemTag[]
  onAddTag: (name: string, level: 2 | 3, parentId: string) => ItemTag
}

/**
 * 多级标签选择器（多选）。
 * - 一级：消耗品 / 耐用品（点击切换选中）
 * - 二级：点击选中后向下展开三级
 * - 任意层级均可自定义新增（一级固定不可增删）
 */
export default function TagPicker({ value, onChange, tags, onAddTag }: Props) {
  const [adding, setAdding] = useState<{ level: 2 | 3; parentId: string } | null>(null)
  const [draftName, setDraftName] = useState('')

  const childrenOf = (pid: string | null) => tags.filter((t) => t.parentId === pid)
  const isSel = (id: string) => value.includes(id)

  const toggle = (id: string) => {
    if (isSel(id)) onChange(value.filter((v) => v !== id))
    else onChange([...value, id])
  }

  const submitAdd = () => {
    if (!adding) return
    const name = draftName.trim()
    if (name) {
      const tag = onAddTag(name, adding.level, adding.parentId)
      onChange([...value, tag.id])
    }
    setAdding(null)
    setDraftName('')
  }

  const l1 = childrenOf(null)

  return (
    <div className="space-y-3">
      {l1.map((l1t) => (
        <div key={l1t.id}>
          <div className="mb-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggle(l1t.id)}
              className="rounded-full px-3 py-1 text-sm font-medium transition"
              style={isSel(l1t.id) ? { backgroundColor: l1t.color, color: '#fff' } : tagChipStyle(l1t.color)}
            >
              {l1t.name}
            </button>
            <span className="text-[11px] text-ink-400">一级</span>
          </div>

          <div className="flex flex-wrap gap-2 pl-1">
            {childrenOf(l1t.id).map((l2) => (
              <div key={l2.id} className="flex flex-col items-start">
                <button
                  type="button"
                  onClick={() => toggle(l2.id)}
                  className="rounded-full px-3 py-1 text-sm font-medium transition"
                  style={isSel(l2.id) ? { backgroundColor: l2.color, color: '#fff' } : tagChipStyle(l2.color)}
                >
                  {l2.name}
                </button>

                {isSel(l2.id) && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5 pl-1">
                    {childrenOf(l2.id).map((l3) => (
                      <button
                        key={l3.id}
                        type="button"
                        onClick={() => toggle(l3.id)}
                        className="rounded-full px-2.5 py-0.5 text-xs font-medium transition"
                        style={isSel(l3.id) ? { backgroundColor: l3.color, color: '#fff' } : tagChipStyle(l3.color)}
                      >
                        {l3.name}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setAdding({ level: 3, parentId: l2.id })}
                      className="rounded-full border border-dashed border-petal-200 px-2 py-0.5 text-xs text-ink-400 transition hover:border-petal-300 hover:text-petal-600"
                      title="添加三级标签"
                    >
                      ＋ 三级
                    </button>
                    {adding?.level === 3 && adding.parentId === l2.id && (
                      <span className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && submitAdd()}
                          placeholder="新标签"
                          className="w-20 rounded-full border border-petal-200 px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-petal-300"
                        />
                        <button
                          type="button"
                          onClick={submitAdd}
                          className="text-xs font-medium text-petal-600"
                        >
                          确定
                        </button>
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setAdding({ level: 2, parentId: l1t.id })}
              className="h-7 self-start rounded-full border border-dashed border-petal-200 px-2 text-xs text-ink-400 transition hover:border-petal-300 hover:text-petal-600"
            >
              ＋ 二级
            </button>
          </div>
        </div>
      ))}

      {adding?.level === 2 && (
        <div className="flex items-center gap-1 rounded-xl bg-petal-50 px-3 py-2">
          <span className="text-xs text-ink-500">新二级标签：</span>
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitAdd()}
            placeholder="名称"
            className="w-24 rounded-full border border-petal-200 px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-petal-300"
          />
          <button type="button" onClick={submitAdd} className="text-xs font-medium text-petal-600">
            确定
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(null)
              setDraftName('')
            }}
            className="text-xs text-ink-400"
          >
            取消
          </button>
        </div>
      )}
    </div>
  )
}
