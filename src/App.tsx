import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { router } from '@/router'
import UpdateWatcher from '@/components/UpdateWatcher'
import { initSync } from '@/lib/sync'

function App() {
  useEffect(() => initSync(), [])
  return (
    <>
      <RouterProvider router={router} />
      {/* 检测到新版本自动刷新，无需手动在浏览器里刷新 */}
      <UpdateWatcher />
    </>
  )
}

export default App
