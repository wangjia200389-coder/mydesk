import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import MainLayout from '@/layouts/MainLayout'
import Dashboard from '@/pages/Dashboard'
import Todo from '@/pages/Todo'
import Pomodoro from '@/pages/Pomodoro'
import Notes from '@/pages/Notes'
import Review from '@/pages/Review'
import ReviewOverview from '@/pages/ReviewOverview'
import Items from '@/pages/Items'
import ItemDetail from '@/pages/ItemDetail'
import ItemDrafts from '@/pages/ItemDrafts'
import ItemsStats from '@/pages/ItemsStats'
import Messages from '@/pages/Messages'
import CourseSchedulePage from '@/pages/CourseSchedule'
import ScheduleView from '@/pages/ScheduleView'
import Knowledge from '@/pages/Knowledge'

const Homework = lazy(() => import('@/pages/Homework'))

export const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      // 默认首页 = 待办事项
      { index: true, element: <Todo /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'todo', element: <Todo /> },
      // 个人物品（放在待办后面）
      { path: 'items', element: <Items /> },
      { path: 'items/stats', element: <ItemsStats /> },
      { path: 'items/drafts', element: <ItemDrafts /> },
      { path: 'items/:id', element: <ItemDetail /> },
      { path: 'messages', element: <Messages /> },
      { path: 'homework', element: <Suspense fallback={<div className="p-10 text-center text-ink-400">加载中…</div>}><Homework /></Suspense> },
      { path: 'pomodoro', element: <Pomodoro /> },
      { path: 'notes', element: <Notes /> },
      { path: 'review', element: <Review /> },
      { path: 'review/overview', element: <ReviewOverview /> },
      { path: 'courses', element: <CourseSchedulePage /> },
      { path: 'schedule', element: <ScheduleView /> },
      { path: 'knowledge', element: <Knowledge /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
