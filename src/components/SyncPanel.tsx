import { useEffect, useState } from 'react'
import {
  clearConflictCopy,
  disableSync,
  enableSync,
  getConflictCopy,
  getSyncCode,
  getSyncState,
  joinSync,
  subscribeSync,
  syncConfigured,
  syncNow,
  type SyncConflictCopy,
  type SyncStatus,
} from '@/lib/sync'

const STATUS_TEXT: Record<SyncStatus, string> = {
  off: '未启用',
  idle: '已同步',
  syncing: '同步中…',
  offline: '离线，联网后自动同步',
  'remote-new': '云端有更新',
  error: '同步出错',
}

const DOT: Record<SyncStatus, string> = {
  off: 'bg-ink-200',
  idle: 'bg-mint-400',
  syncing: 'bg-lavender-400',
  offline: 'bg-amber-400',
  'remote-new': 'bg-amber-400',
  error: 'bg-petal-500',
}

/** 头像弹窗里的「多设备同步」面板。首次配一次，之后全自动。 */
export default function SyncPanel() {
  const [state, setState] = useState(getSyncState())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCode, setShowCode] = useState(false)
  const [createdCode, setCreatedCode] = useState<string | null>(null)
  const [inputCode, setInputCode] = useState('')
  const [conflict, setConflict] = useState<SyncConflictCopy | null>(() => getConflictCopy())

  useEffect(
    () =>
      subscribeSync(() => {
        setState({ ...getSyncState() })
        setConflict(getConflictCopy())
      }),
    [],
  )

  const configured = syncConfigured()
  const code = getSyncCode()

  const withBusy = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  const onEnable = () =>
    withBusy(async () => {
      const c = await enableSync()
      setCreatedCode(c)
      setShowCode(true)
    })

  const onJoin = () =>
    withBusy(async () => {
      if (
        !window.confirm(
          '加入同步会用云端数据整体覆盖本机现有数据，本机原有的文字记录会被清掉（即使文件本体还留在本地，也会失去关联）。建议先导出一次备份，确定继续吗？',
        )
      )
        return
      await joinSync(inputCode)
    })

  const onCopy = async () => {
    const c = createdCode ?? getSyncCode()
    if (!c) return
    try {
      await navigator.clipboard.writeText(c)
      setCreatedCode(null)
      alert('同步码已复制')
    } catch {
      setShowCode(true)
    }
  }

  const onExportConflict = () => {
    if (!conflict) return
    const blob = new Blob([JSON.stringify(conflict, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mydesk-sync-conflict-${new Date(conflict.savedAt).toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="mt-6 border-t border-petal-100 pt-5">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-base">☁️</span>
        <h4 className="text-sm font-semibold text-ink-900">多设备同步</h4>
        {state.hasCode && (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-ink-400">
            <span className={`h-2 w-2 rounded-full ${DOT[state.status]}`} />
            {state.message || STATUS_TEXT[state.status]}
          </span>
        )}
      </div>

      {!configured ? (
        <p className="text-xs leading-relaxed text-ink-400">
          同步服务尚未配置，当前仍是纯本地模式，数据只存在这台设备。
        </p>
      ) : !state.hasCode ? (
        <>
          <p className="mb-3 text-xs leading-relaxed text-ink-400">
            在主力设备生成同步码，其他设备输入同一个码即可互通。数据端到端加密，云端看不到内容。
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onEnable}
              className="w-full rounded-xl bg-petal-50 px-3 py-2.5 text-sm font-medium text-petal-600 ring-1 ring-petal-200 transition hover:bg-petal-100 active:scale-95 disabled:opacity-60"
            >
              {busy ? '处理中…' : '在这台设备生成同步码'}
            </button>
            <div className="flex gap-2">
              <input
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                placeholder="粘贴已有同步码"
                className="min-w-0 flex-1 rounded-xl border border-petal-100 bg-cream/50 px-3 py-2 text-xs text-ink-900 outline-none focus:border-petal-400"
              />
              <button
                type="button"
                disabled={busy || !inputCode.trim()}
                onClick={onJoin}
                className="shrink-0 rounded-xl bg-lavender-50 px-3 py-2 text-xs font-medium text-lavender-600 ring-1 ring-lavender-200 transition hover:bg-lavender-100 active:scale-95 disabled:opacity-60"
              >
                加入
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs text-ink-400">同步码</span>
            <button
              type="button"
              onClick={() => setShowCode((v) => !v)}
              className="rounded-full bg-petal-50 px-2 py-0.5 text-[11px] text-petal-600"
            >
              {showCode ? '隐藏' : '显示'}
            </button>
            <button
              type="button"
              onClick={onCopy}
              className="rounded-full bg-lavender-50 px-2 py-0.5 text-[11px] text-lavender-600"
            >
              复制
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('关闭同步后本机数据仍保留，但不再与其他设备互通。确定吗？'))
                  disableSync()
              }}
              className="ml-auto text-[11px] text-ink-300 hover:text-petal-600"
            >
              关闭同步
            </button>
          </div>
          {showCode && (
            <p className="mb-3 break-all rounded-xl bg-cream/60 px-3 py-2 font-mono text-[11px] text-ink-700">
              {code}
            </p>
          )}
          {createdCode && (
            <p className="mb-3 rounded-lg bg-mint-50 px-3 py-2 text-[11px] leading-relaxed text-mint-700">
              已生成，请复制后到其他设备粘贴。同步码也包含在导出的备份文件里。
            </p>
          )}
          <button
            type="button"
            disabled={busy || state.status === 'syncing'}
            onClick={() => withBusy(() => syncNow(true))}
            className="w-full rounded-xl bg-petal-50 px-3 py-2 text-sm font-medium text-petal-600 ring-1 ring-petal-200 transition hover:bg-petal-100 active:scale-95 disabled:opacity-60"
          >
            立即同步
          </button>

          {conflict && (
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
              <div className="font-medium">有一份本地冲突副本</div>
              <div className="mt-0.5">
                {new Date(conflict.savedAt).toLocaleString('zh-CN')} · {conflict.reason}。
                当前采用的是云端版本，本地改动已另存。
              </div>
              <div className="mt-1.5 flex gap-3">
                <button type="button" onClick={onExportConflict} className="underline">
                  导出副本
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearConflictCopy()
                    setConflict(null)
                  }}
                  className="underline"
                >
                  忽略
                </button>
              </div>
            </div>
          )}

          <p className="mt-2 text-[11px] leading-relaxed text-ink-300">
            文字、照片和知识库文件会自动同步。内容在浏览器里加密后才上传，云端只有密文（文件大小、哈希等元信息仍可见）。
            两台设备都改过时，会先保存本地冲突副本再采用云端版本，副本可以在上方导出。
            删除不会传播到云端。忘了同步码无法解密，请勿外传备份文件。
          </p>
        </>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-petal-50 px-3 py-2 text-xs font-medium text-petal-600">
          {error}
        </p>
      )}
    </div>
  )
}
