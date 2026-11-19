import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'

export type NoteColor = 'petal' | 'butter' | 'mint' | 'lavender' | 'sky' | 'paper'

export interface NoteColorStyle {
  bg: string
  ring: string
  dot: string
  label: string
}

export const NOTE_COLORS: { key: NoteColor; style: NoteColorStyle }[] = [
  {
    key: 'petal',
    style: {
      bg: 'bg-[#ffe7ef]',
      ring: 'ring-[#ffc6d5]',
      dot: 'bg-petal-400',
      label: '樱花',
    },
  },
  {
    key: 'butter',
    style: {
      bg: 'bg-[#fff4cf]',
      ring: 'ring-[#ffe08a]',
      dot: 'bg-butter-400',
      label: '奶油',
    },
  },
  {
    key: 'mint',
    style: {
      bg: 'bg-[#e1f6ec]',
      ring: 'ring-[#a6e4ce]',
      dot: 'bg-mint-400',
      label: '薄荷',
    },
  },
  {
    key: 'lavender',
    style: {
      bg: 'bg-[#ede4ff]',
      ring: 'ring-[#c8b6f5]',
      dot: 'bg-lavender-400',
      label: '薰衣',
    },
  },
  {
    key: 'sky',
    style: {
      bg: 'bg-[#e0f0ff]',
      ring: 'ring-[#b0d2ff]',
      dot: 'bg-[#6aa6ff]',
      label: '天蓝',
    },
  },
  {
    key: 'paper',
    style: {
      bg: 'bg-[#faf3e9]',
      ring: 'ring-[#e8d9c1]',
      dot: 'bg-[#c59e6b]',
      label: '纸张',
    },
  },
]

export function getNoteColor(key: NoteColor): NoteColorStyle {
  return NOTE_COLORS.find((c) => c.key === key)!.style
}

export interface Note {
  id: string
  title: string
  content: string
  color: NoteColor
  collapsed?: boolean
  /** 置顶：置顶便签排在最前 */
  pinned?: boolean
  createdAt: number
  updatedAt: number
}

interface NotesState {
  notes: Note[]
  addNote: (opt?: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned'>>) => Note
  updateNote: (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned'>>) => void
  removeNote: (id: string) => void
  toggleCollapse: (id: string) => void
  setAllCollapsed: (v: boolean) => void
  togglePin: (id: string) => void
}

export const useNotesStore = create<NotesState>()(
  persist(
    (set) => ({
      notes: [],
      addNote: (opt) => {
        const n: Note = {
          id: uuidv4(),
          title: opt?.title ?? '',
          content: opt?.content ?? '',
          color: opt?.color ?? 'petal',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        set((s) => ({ notes: [n, ...s.notes] }))
        return n
      },
      updateNote: (id, patch) =>
        set((s) => ({
          notes: s.notes.map((n) =>
            n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n,
          ),
        })),
      removeNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
      toggleCollapse: (id) =>
        set((s) => ({
          notes: s.notes.map((n) =>
            n.id === id ? { ...n, collapsed: !n.collapsed, updatedAt: n.updatedAt } : n,
          ),
        })),
      setAllCollapsed: (v) =>
        set((s) => ({
          notes: s.notes.map((n) => ({ ...n, collapsed: v })),
        })),
      togglePin: (id) =>
        set((s) => ({
          notes: s.notes.map((n) =>
            n.id === id ? { ...n, pinned: !n.pinned, updatedAt: Date.now() } : n,
          ),
        })),
    }),
    {
      name: 'my-desk:notes',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ notes: s.notes }),
    },
  ),
)
