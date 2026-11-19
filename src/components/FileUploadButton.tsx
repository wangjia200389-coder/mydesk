import { useRef, useState } from 'react'
import { isWeChat } from '@/lib/upload'

interface Props {
  /** 接受的文件类型，与原生 input accept 一致 */
  accept?: string
  /** 是否允许多选 */
  multiple?: boolean
  /** 是否调用相机（仅移动端相册/拍照场景，默认 false 表示不强制 capture） */
  capture?: boolean | 'user' | 'environment'
  /** 是否禁用 */
  disabled?: boolean
  /** 拿到用户选择的文件列表 */
  onFiles: (files: File[]) => void
  /** 按钮内容 */
  children: React.ReactNode
  /** 是否显示微信引导提示 */
  showWeChatTip?: boolean
  className?: string
}

/**
 * 统一文件上传按钮。
 *
 * 实现要点：input 用「透明覆盖层」而不是 display:none。
 * iOS Safari / 微信 X5 内核下，被 display:none 隐藏的 file input 即使调用
 * .click() 也常常唤不起文件选择器（PWA standalone 更明显）；改成铺满按钮的
 * 透明原生 input，点击直接命中原生控件，兼容性最好。
 */
export default function FileUploadButton({
  accept,
  multiple,
  capture,
  disabled,
  onFiles,
  children,
  showWeChatTip = true,
  className = '',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [wechat] = useState(() => isWeChat())

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    if (list && list.length > 0) {
      onFiles(Array.from(list))
    }
    // 置空，保证同一个文件能再次触发 change
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="inline-flex flex-col">
      <div className="relative inline-flex">
        <button type="button" disabled={disabled} className={className}>
          {children}
        </button>
        {!disabled && (
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple={multiple}
            capture={capture}
            onChange={handleChange}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="选择文件"
          />
        )}
      </div>
      {showWeChatTip && wechat && (
        <span className="mt-1 text-[11px] leading-tight text-ink-400">
          提示：可先从微信聊天将文件发送到「文件传输助手」，再点击上传。
        </span>
      )}
    </div>
  )
}
