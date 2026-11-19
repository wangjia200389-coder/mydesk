import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import { putFileBlob, delFileBlob } from '@/lib/idbFile'

export type KnowledgeFileKind = 'note' | 'file'

export interface KnowledgeFile {
  id: string
  name: string
  /** 展示用类型标签：note（纯文本笔记）/ file（上传文件） */
  kind: KnowledgeFileKind
  /** MIME 或扩展名，用于图标与下载 */
  mime: string
  packId: string | null
  createdAt: number
  size: number
  /** 提取出的文本（用于搜索）；笔记即正文；文件提取失败则为空（仅文件名可搜） */
  text?: string
}

export interface KnowledgePack {
  id: string
  name: string
  createdAt: number
}

interface KnowledgeState {
  packs: KnowledgePack[]
  files: KnowledgeFile[]
  addPack: (name: string) => string
  renamePack: (id: string, name: string) => void
  removePack: (id: string) => Promise<void>
  /** 新增文件：有 blob 则存 IndexedDB；笔记可只传 text（blob 留空） */
  addFile: (input: {
    name: string
    kind: KnowledgeFileKind
    mime: string
    packId: string | null
    size: number
    text?: string
    blob?: Blob
  }) => Promise<string>
  renameFile: (id: string, name: string) => void
  updateFileText: (id: string, text: string) => void
  removeFile: (id: string) => Promise<void>
}

export const useKnowledgeStore = create<KnowledgeState>()(
  persist(
    (set, get) => ({
      packs: [],
      files: [],

      addPack: (name) => {
        const id = uuidv4()
        const pack: KnowledgePack = {
          id,
          name: name.trim() || '未命名知识包',
          createdAt: Date.now(),
        }
        set((s) => ({ packs: [...s.packs, pack] }))
        return id
      },

      renamePack: (id, name) =>
        set((s) => ({
          packs: s.packs.map((p) =>
            p.id === id ? { ...p, name: name.trim() || p.name } : p,
          ),
        })),

      removePack: async (id) => {
        const ids = get()
          .files.filter((f) => f.packId === id)
          .map((f) => f.id)
        await Promise.all(ids.map((fid) => delFileBlob(fid)))
        set((s) => ({
          packs: s.packs.filter((p) => p.id !== id),
          files: s.files.filter((f) => f.packId !== id),
        }))
      },

      addFile: async (input) => {
        const id = uuidv4()
        if (input.blob) await putFileBlob(id, input.blob)
        const meta: KnowledgeFile = {
          id,
          name: input.name,
          kind: input.kind,
          mime: input.mime,
          packId: input.packId,
          createdAt: Date.now(),
          size: input.size,
          text: input.text || undefined,
        }
        set((s) => ({ files: [meta, ...s.files] }))
        return id
      },

      renameFile: (id, name) =>
        set((s) => ({
          files: s.files.map((f) =>
            f.id === id ? { ...f, name: name.trim() || f.name } : f,
          ),
        })),

      updateFileText: (id, text) =>
        set((s) => ({
          files: s.files.map((f) => (f.id === id ? { ...f, text } : f)),
        })),

      removeFile: async (id) => {
        await delFileBlob(id)
        set((s) => ({ files: s.files.filter((f) => f.id !== id) }))
      },
    }),
    {
      name: 'my-desk:knowledge',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ packs: s.packs, files: s.files }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        if (!Array.isArray(state.packs)) state.packs = []
        if (!Array.isArray(state.files)) state.files = []
        state.files = state.files.map((f) => ({ ...f, text: f.text ?? undefined }))
      },
    },
  ),
)
