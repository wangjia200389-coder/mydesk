import { useState } from 'react'
import {
  submitFeedback,
  getFeedbackEndpoint,
  setFeedbackEndpoint,
} from '@/lib/feedback'
import { loadOcrConfig, saveOcrConfig } from '@/lib/cloudOcr'

interface Props {
  onClose: () => void
}

/** 宝宝意见箱：收集使用体验与修改建议，提交后本地保存并（若已配置）发到开发者邮箱 */
export default function FeedbackModal({ onClose }: Props) {
  const [experience, setExperience] = useState('')
  const [suggestion, setSuggestion] = useState('')
  const [sent, setSent] = useState(false)
  const [msg, setMsg] = useState('')
  const [showCfg, setShowCfg] = useState(false)
  const [endpoint, setEndpoint] = useState(getFeedbackEndpoint())
  const [ocrAppId, setOcrAppId] = useState(loadOcrConfig()?.appId ?? '')
  const [ocrSecret, setOcrSecret] = useState(loadOcrConfig()?.secretCode ?? '')
  const [showOcr, setShowOcr] = useState(false)

  const canSubmit = experience.trim() !== '' || suggestion.trim() !== ''

  const submit = async () => {
    if (!canSubmit) return
    const r = await submitFeedback(experience, suggestion)
    setMsg(r.message)
    setSent(true)
    setTimeout(onClose, 1600)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/30 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-md rounded-t-3xl bg-surface p-6 shadow-soft sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-ink-900">💌 宝宝意见箱</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-ink-400 hover:bg-petal-50 hover:text-ink-700"
          >
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-ink-400">
          你的每一条反馈都会帮助 MyDesk 变得更好～ 想夸夸、想吐槽、想加功能，尽管说。
        </p>

        <label className="mb-1 block text-xs font-medium text-ink-500">
          使用体验
        </label>
        <textarea
          value={experience}
          onChange={(e) => setExperience(e.target.value)}
          rows={3}
          placeholder="用着顺手吗？最喜欢 / 最不喜欢哪一点？"
          className="mb-4 w-full rounded-xl border border-petal-200 bg-cream px-3 py-2 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus:border-petal-400 focus:ring-4 focus:ring-petal-100"
        />

        <label className="mb-1 block text-xs font-medium text-ink-500">
          觉得需要修改 / 新增的地方
        </label>
        <textarea
          value={suggestion}
          onChange={(e) => setSuggestion(e.target.value)}
          rows={3}
          placeholder="哪里别扭？想要什么新功能？"
          className="w-full rounded-xl border border-petal-200 bg-cream px-3 py-2 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus:border-petal-400 focus:ring-4 focus:ring-petal-100"
        />

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || sent}
          className="mt-5 w-full rounded-xl bg-gradient-to-br from-lavender-400 to-lavender-500 py-2.5 text-sm font-semibold text-white shadow-card transition hover:brightness-105 active:scale-95 disabled:opacity-50"
        >
          {sent ? '已收到 ❤️' : '提交反馈'}
        </button>

        {msg && (
          <p className="mt-3 rounded-lg bg-mint-50 px-3 py-2 text-xs font-medium text-mint-700">
            {msg}
          </p>
        )}

        {/* 开发者配置接收地址（仅开发者可见，普通用户无需关心） */}
        <button
          type="button"
          onClick={() => setShowCfg((v) => !v)}
          className="mt-3 text-xs text-ink-400 underline"
        >
          开发者：配置接收邮箱 / 接口
        </button>
        {showCfg && (
          <div className="mt-2 rounded-xl bg-petal-50 p-3">
            <p className="mb-2 text-[11px] leading-relaxed text-ink-500">
              粘贴 Formspree / 自建接口的接收地址（https://...），提交后反馈会自动发到开发者邮箱。留空则仅本地保存。
            </p>
            <input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://formspree.io/f/xxxx"
              className="w-full rounded-lg border border-petal-200 bg-surface px-3 py-2 text-xs text-ink-900 outline-none focus:border-petal-400"
            />
            <button
              type="button"
              onClick={() => {
                setFeedbackEndpoint(endpoint)
                setMsg('已保存接收地址 ✅')
              }}
              className="mt-2 w-full rounded-lg bg-petal-100 py-2 text-xs font-semibold text-petal-600 transition hover:bg-petal-200"
            >
              保存地址
            </button>
          </div>
        )}

        {/* 云端 OCR 配置（课程表图片高清识别） */}
        <button
          type="button"
          onClick={() => setShowOcr((v) => !v)}
          className="mt-3 text-xs text-ink-400 underline"
        >
          开发者：配置课程表云端 OCR（TextIn）
        </button>
        {showOcr && (
          <div className="mt-2 rounded-xl bg-petal-50 p-3">
            <p className="mb-2 text-[11px] leading-relaxed text-ink-500">
              填入你在 TextIn（textin.com）申请的 app-id 与 secret-code，课程表图片会走云端高清 OCR，识别率高于本地。免费额度 1000 页/天。
              不填也能用：图片走本地识别，Excel 导入和手动录入完全不受影响。
              <br />
              密钥只存在这台设备的浏览器里，不会进入备份或同步；但调用识别时会作为请求头发给你填的服务商——这是浏览器直连 OCR 的固有限制。给别人用请填你自己的密钥，或不要开启这一项。
            </p>
            <input
              value={ocrAppId}
              onChange={(e) => setOcrAppId(e.target.value)}
              placeholder="TextIn app-id"
              className="mb-2 w-full rounded-lg border border-petal-200 bg-surface px-3 py-2 text-xs text-ink-900 outline-none focus:border-petal-400"
            />
            <input
              value={ocrSecret}
              onChange={(e) => setOcrSecret(e.target.value)}
              placeholder="TextIn secret-code"
              className="w-full rounded-lg border border-petal-200 bg-surface px-3 py-2 text-xs text-ink-900 outline-none focus:border-petal-400"
            />
            <button
              type="button"
              onClick={() => {
                saveOcrConfig(
                  ocrAppId.trim() && ocrSecret.trim()
                    ? { provider: 'textin', appId: ocrAppId.trim(), secretCode: ocrSecret.trim() }
                    : null,
                )
                setMsg(ocrAppId.trim() && ocrSecret.trim() ? '已启用云端 OCR ✅' : '已关闭云端 OCR')
              }}
              className="mt-2 w-full rounded-lg bg-petal-100 py-2 text-xs font-semibold text-petal-600 transition hover:bg-petal-200"
            >
              保存 OCR 配置
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
