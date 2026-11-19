import { APP_VERSION } from './appInfo'
import { useFeedbackStore } from '@/store/useFeedbackStore'

/**
 * 反馈接收地址（开发者配置）。
 * 留空 = 仅本地保存；填入 Formspree / 自建接口地址后，提交会自动 POST 到开发者邮箱。
 * 地址保存在 localStorage（key 见下），开发者可在「宝宝意见箱 → 开发者配置」里填写。
 */
const FEEDBACK_ENDPOINT_KEY = 'my-desk:feedback-endpoint'

export function getFeedbackEndpoint(): string {
  try {
    return localStorage.getItem(FEEDBACK_ENDPOINT_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setFeedbackEndpoint(url: string) {
  try {
    if (url.trim()) localStorage.setItem(FEEDBACK_ENDPOINT_KEY, url.trim())
    else localStorage.removeItem(FEEDBACK_ENDPOINT_KEY)
  } catch {
    /* ignore */
  }
}

export interface SubmitResult {
  ok: boolean
  local: boolean
  remote: boolean
  message: string
}

/**
 * 提交反馈：
 * 1) 始终本地保存（兜底，绝不丢数据）
 * 2) 若配置了接收接口，尝试 POST 到该地址（Formspree 等会转发到开发者邮箱）
 */
export async function submitFeedback(
  experience: string,
  suggestion: string,
): Promise<SubmitResult> {
  const entry = {
    experience: experience.trim(),
    suggestion: suggestion.trim(),
    appVersion: APP_VERSION,
    device:
      typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
  }

  useFeedbackStore.getState().addFeedback(entry)

  const endpoint = getFeedbackEndpoint()
  if (endpoint) {
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          ...entry,
          _subject: 'MyDesk · 宝宝意见箱反馈',
          type: 'app-feedback',
        }),
      })
      return {
        ok: true,
        local: true,
        remote: true,
        message: '已收到，并发送到开发者邮箱啦 ❤️',
      }
    } catch {
      return {
        ok: true,
        local: true,
        remote: false,
        message:
          '已保存到本地，但发送失败（接口可能暂不可用），稍后可在意见箱重新提交。',
      }
    }
  }

  return {
    ok: true,
    local: true,
    remote: false,
    message: '已收到，谢谢宝宝 ❤️（开发者尚未配置接收邮箱，反馈已存在本地）',
  }
}
