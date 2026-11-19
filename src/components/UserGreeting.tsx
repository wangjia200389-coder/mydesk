import { useEffect, useRef, useState } from 'react'
import { useUIStore } from '@/store/useUIStore'
import { useUserStore } from '@/store/useUserStore'
import {
  downloadBackup,
  readBackupFile,
  restoreBackup,
} from '@/lib/backup'
import SyncPanel from '@/components/SyncPanel'

function AvatarCircle(props: {
  url: string | null
  size?: number
  className?: string
}) {
  const size = props.size ?? 40
  if (props.url) {
    return (
      <img
        src={props.url}
        alt="avatar"
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-2xl object-cover ring-2 ring-petal-100 shadow-card ${props.className ?? ''}`}
      />
    )
  }
  return (
    <div
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-petal-400 to-lavender-400 ring-2 ring-petal-100 text-xl shadow-soft ${props.className ?? ''}`}
    >
      🐾
    </div>
  )
}

export default function UserGreeting({ compact = false }: { compact?: boolean }) {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const nickname = useUserStore((s) => s.nickname)
  const avatarDataUrl = useUserStore((s) => s.avatarDataUrl)
  const setNickname = useUserStore((s) => s.setNickname)
  const setAvatarDataUrl = useUserStore((s) => s.setAvatarDataUrl)
  const setAvatarFromFile = useUserStore((s) => s.setAvatarFromFile)

  const [open, setOpen] = useState(false)
  const [draftNick, setDraftNick] = useState(nickname)
  const [draftAvatar, setDraftAvatar] = useState<string | null>(avatarDataUrl)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const backupFileRef = useRef<HTMLInputElement>(null)
  const [backupMsg, setBackupMsg] = useState<string | null>(null)
  const [backupError, setBackupError] = useState<string | null>(null)

  // 打开 Modal 时同步草稿
  useEffect(() => {
    if (open) {
      setDraftNick(nickname)
      setDraftAvatar(avatarDataUrl)
      setError(null)
      setBusy(false)
      setBackupMsg(null)
      setBackupError(null)
    }
  }, [open, nickname, avatarDataUrl])

  const onPickBackupFile = async (f: File | undefined | null) => {
    if (!f) return
    setBackupMsg(null)
    setBackupError(null)
    // 导入是完整替换：备份里没有的模块会被清掉，所以先说清楚再动手
    if (
      !window.confirm(
        '导入会用备份内容整体替换这台设备上的 MyDesk 数据。\n备份里没有的内容（比如这台设备上后来新建的记录）会被清掉。\n\n要继续吗？',
      )
    ) {
      return
    }
    try {
      const text = await readBackupFile(f)
      const result = await restoreBackup(text, 'replace')
      if (result.ok) {
        setBackupMsg(
          result.warnings.length ? `${result.message}；${result.warnings.join('；')}` : result.message,
        )
        // 写回 localStorage 后刷新页面，让 zustand persist 重新加载
        setTimeout(() => window.location.reload(), 900)
      } else {
        setBackupError(result.message)
      }
    } catch {
      setBackupError('读取文件失败，请重试')
    }
  }

  const handleExport = async () => {
    setBackupMsg(null)
    setBackupError(null)
    try {
      const { name, warnings } = await downloadBackup()
      const base = `已导出 ${name}（含数据、照片和知识库原文件）。文件内含同步码与 OCR 配置，请勿发给别人或公开上传`
      setBackupMsg(warnings.length ? `${base}。注意：${warnings.join('；')}` : base)
    } catch {
      setBackupError('导出失败，请重试')
    }
  }

  const onPickFile = async (f: File | undefined | null) => {
    if (!f) return
    setBusy(true)
    setError(null)
    try {
      const data = await setAvatarFromFile(f, { maxSide: 320 })
      setDraftAvatar(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败')
    } finally {
      setBusy(false)
    }
  }

  const save = () => {
    setNickname(draftNick)
    setAvatarDataUrl(draftAvatar)
    setOpen(false)
  }

  const clearAvatar = () => {
    setDraftAvatar(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <>
      {compact ? (
        /* 移动端顶部栏：仅圆形头像按钮 */
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="点击编辑头像与昵称"
          className="no-tap-highlight flex h-10 w-10 items-center justify-center rounded-2xl bg-surface ring-2 ring-petal-100 shadow-card transition active:scale-95"
        >
          <AvatarCircle url={avatarDataUrl} size={36} className="!ring-0 !shadow-none" />
        </button>
      ) : (
        /* 侧边栏展示区 */
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-petal-50"
          title="点击编辑头像与昵称"
        >
          <AvatarCircle url={avatarDataUrl} size={40} />
          {!collapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold text-ink-900 group-hover:text-petal-600">
                {nickname}
              </p>
              <p className="mt-0.5 truncate text-xs text-ink-400">
                点击编辑资料
              </p>
            </div>
          )}
        </button>
      )}

      {/* 编辑 Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/25 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-3xl border border-petal-100 bg-surface p-6 shadow-soft">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-ink-900">
                编辑个人资料
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-ink-400 hover:bg-petal-50 hover:text-ink-700"
              >
                ✕
              </button>
            </div>

            {/* 头像上传 */}
            <div className="flex flex-col items-center text-center">
              <label className="cursor-pointer">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onPickFile(e.target.files?.[0])}
                />
                <AvatarCircle
                  url={busy && !draftAvatar ? null : draftAvatar}
                  size={96}
                />
              </label>
              <p className="mt-3 text-xs text-ink-400">
                点击头像上传图片，≤20MB，会自动压缩
              </p>
              <div className="mt-2 flex gap-2 text-xs">
                <button
                  type="button"
                  className="rounded-full bg-petal-50 px-3 py-1 font-medium text-petal-600 hover:bg-petal-100"
                  onClick={() => fileRef.current?.click()}
                >
                  选择图片
                </button>
                <button
                  type="button"
                  className="rounded-full border border-petal-100 px-3 py-1 font-medium text-ink-500 hover:bg-petal-50 hover:text-ink-700"
                  onClick={clearAvatar}
                >
                  使用默认
                </button>
              </div>
              {error && (
                <p className="mt-2 text-xs font-medium text-petal-600">
                  {error}
                </p>
              )}
            </div>

            {/* 昵称 */}
            <div className="mt-6">
              <label className="mb-1.5 block text-xs font-medium text-ink-500">
                昵称（最多 20 字）
              </label>
              <input
                value={draftNick}
                onChange={(e) => setDraftNick(e.target.value)}
                maxLength={20}
                placeholder="给自己起个可爱的名字～"
                className="w-full rounded-xl border border-petal-200 bg-cream px-4 py-2.5 text-sm text-ink-700 placeholder:text-ink-400 outline-none transition focus:border-petal-400 focus:ring-4 focus:ring-petal-100"
              />
            </div>

            {/* 按钮 */}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-petal-100 bg-surface px-4 py-2 text-sm font-medium text-ink-500 hover:bg-petal-50 hover:text-ink-700"
              >
                取消
              </button>
              <button
                type="button"
                onClick={save}
                className="rounded-xl bg-gradient-to-br from-petal-400 to-petal-500 px-5 py-2 text-sm font-semibold text-white shadow-card hover:brightness-105 active:scale-95"
              >
                保存
              </button>
            </div>

            {/* 数据备份 */}
            <div className="mt-6 border-t border-petal-100 pt-5">
              <div className="mb-2 flex items-center gap-1.5">
                <span className="text-base">🗂️</span>
                <h4 className="text-sm font-semibold text-ink-900">数据备份</h4>
              </div>
              <p className="mb-3 text-xs leading-relaxed text-ink-400">
                数据存在手机本地，建议定期导出备份，换手机或误清缓存时可一键恢复。
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleExport}
                  className="flex-1 rounded-xl bg-petal-50 px-3 py-2.5 text-sm font-medium text-petal-600 ring-1 ring-petal-200 transition hover:bg-petal-100 active:scale-95"
                >
                  📤 导出备份
                </button>
                <button
                  type="button"
                  onClick={() => backupFileRef.current?.click()}
                  className="flex-1 rounded-xl bg-lavender-50 px-3 py-2.5 text-sm font-medium text-lavender-600 ring-1 ring-lavender-200 transition hover:bg-lavender-100 active:scale-95"
                >
                  📥 导入恢复
                </button>
              </div>
              {backupMsg && (
                <p className="mt-3 rounded-lg bg-mint-50 px-3 py-2 text-xs font-medium text-mint-700">
                  {backupMsg}
                </p>
              )}
              {backupError && (
                <p className="mt-3 rounded-lg bg-petal-50 px-3 py-2 text-xs font-medium text-petal-600">
                  {backupError}
                </p>
              )}
            </div>

            <SyncPanel />

            {/* 隐藏的备份文件选择 */}
            <input
              ref={backupFileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => onPickBackupFile(e.target.files?.[0])}
            />
          </div>
        </div>
      )}
    </>
  )
}
