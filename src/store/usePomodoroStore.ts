import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import dayjs from 'dayjs'

export type PomodoroPhase = 'focus' | 'break'

interface PomodoroState {
  focusMinutes: number
  breakMinutes: number
  phase: PomodoroPhase

  /** 今日日期字符串 YYYY-MM-DD，用于自动跨天清零 */
  today: string
  todayCount: number

  setPhase: (p: PomodoroPhase) => void
  resetPhase: () => void

  /** 完成一个 focus 番茄：+1，跨天自动清零后从 1 开始 */
  recordFocusDone: () => void

  setDurations: (opt: { focus?: number; breakMin?: number }) => void
}

function todayKey() {
  return dayjs().format('YYYY-MM-DD')
}

export const usePomodoroStore = create<PomodoroState>()(
  persist(
    (set, get) => ({
      focusMinutes: 25,
      breakMinutes: 5,
      phase: 'focus',

      today: todayKey(),
      todayCount: 0,

      setPhase: (p) => set({ phase: p }),
      resetPhase: () => set({ phase: 'focus' }),

      recordFocusDone: () => {
        const current = todayKey()
        if (get().today !== current) {
          set({ today: current, todayCount: 1 })
        } else {
          set((s) => ({ todayCount: s.todayCount + 1 }))
        }
      },

      setDurations: ({ focus, breakMin }) =>
        set((s) => ({
          focusMinutes: focus ?? s.focusMinutes,
          breakMinutes: breakMin ?? s.breakMinutes,
        })),
    }),
    {
      name: 'my-desk:pomodoro',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        today: s.today,
        todayCount: s.todayCount,
        focusMinutes: s.focusMinutes,
        breakMinutes: s.breakMinutes,
      }),
    },
  ),
)
