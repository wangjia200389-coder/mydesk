import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'

export interface Feedback {
  id: string
  createdAt: number
  /** 使用体验 */
  experience: string
  /** 需要修改 / 新增的地方 */
  suggestion: string
  appVersion: string
  device: string
}

interface FeedbackState {
  feedbacks: Feedback[]
  addFeedback: (f: Omit<Feedback, 'id' | 'createdAt'>) => void
}

export const useFeedbackStore = create<FeedbackState>()(
  persist(
    (set) => ({
      feedbacks: [],
      addFeedback: (f) =>
        set((s) => ({
          feedbacks: [
            { ...f, id: uuidv4(), createdAt: Date.now() },
            ...s.feedbacks,
          ],
        })),
    }),
    {
      name: 'my-desk:feedback',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
