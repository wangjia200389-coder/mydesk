import { useEffect, useMemo, useState } from 'react'

const COMPLIMENTS: string[] = [
  '太棒了小宝，又完成一件事！🎉',
  '继续保持，你可以的小宝！✨',
  '小宝你太厉害啦，进度满满！🚀',
  '小宝今天效率拉满，夸夸！🌸',
  '干得漂亮小宝，又向目标迈进一步！🔥',
  '小宝好棒！又解锁了新成就！🏅',
  '为你骄傲，小宝！做的真不错！💖',
  '小宝真的太靠谱了，这件事做得好！🌟',
  '小宝就是最棒的！又多完成一件～🥳',
  '厉害呀小宝，行动起来所向披靡！⚡️',
  '小宝你超棒的，奖励自己一下吧！🍀',
  '认真的小宝最迷人，又完成一件！🎀',
  '小宝出手，问题带走！真厉害！🐾',
  '今天的小宝闪闪发光！继续冲冲！✨',
  '小宝做事真靠谱，这件事完美收尾！👏',
  '小宝今天也超努力的，爱你呀！💗',
  '小宝真是执行力爆表！又搞定一件！🎯',
  '小宝你就是时间管理大师！太牛了！⏰',
  '小宝的任务列表越来越短啦，厉害！✅',
  '优秀的小宝又完成了，继续保持！🦄',
  '小宝这件事做的真漂亮，点个赞！👍',
  '小宝你好帅/好棒！今天状态满分！💯',
  '小宝又成功了一次，宇宙为你鼓掌！🌌',
  '小宝这件事做得特别漂亮，狠狠夸！🎊',
  '给小宝一个大大的抱抱，你真的好棒！🫂',
  '小宝的每一小步，都是向梦想靠近！🌈',
  '又少一件待办！小宝的节奏太稳啦～🧸',
  '小宝的努力值得全世界点赞！🌍✨',
  '你今天真的太出彩啦小宝！🌞',
  '小宝！你就是小太阳一样的存在！☀️',
]

let _i = 0
function pickCompliment(): string {
  _i = (_i + 1 + Math.floor(Math.random() * 97)) % COMPLIMENTS.length
  return COMPLIMENTS[_i]!
}

const STARTER_EMOJIS = ['🎉', '✨', '🌸', '💖', '🎀', '🍭', '🌈', '🧸', '🦄', '🫶', '🐾']
function pickEmoji() {
  return STARTER_EMOJIS[Math.floor(Math.random() * STARTER_EMOJIS.length)]!
}

export default function CongratsToast(props: { tick: number }) {
  const [item, setItem] = useState<{
    id: number
    text: string
    key: number
    emoji: string
  } | null>(null)

  useEffect(() => {
    if (props.tick <= 0) return
    const id = Date.now() + Math.random()
    setItem({ id, text: pickCompliment(), key: id, emoji: pickEmoji() })
    const t = window.setTimeout(() => {
      setItem((cur) => (cur && cur.id === id ? null : cur))
    }, 2500) // 延长到 2.5 秒，给小宝慢慢看
    return () => window.clearTimeout(t)
  }, [props.tick])

  const style = useMemo(
    () =>
      (item
        ? {
            opacity: 1,
            transform: 'translate(-50%, -50%) scale(1)',
          }
        : {
            opacity: 0,
            transform: 'translate(-50%, -50%) scale(0.4)',
          }) as React.CSSProperties,
    [item],
  )

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center"
    >
      <div
        key={item?.key ?? 0}
        style={style}
        className={`absolute left-1/2 top-1/2 transition-all duration-300 ${
          item ? 'animate-[congrats-pop_2.5s_ease-in-out]' : ''
        }`}
      >
        <div className="pointer-events-none relative">
          {/* 周围小星星 */}
          <span className="absolute -left-10 -top-6 select-none text-3xl drop-shadow animate-[twinkle_0.9s_ease-in-out_infinite]">
            ✨
          </span>
          <span className="absolute -right-8 top-0 select-none text-2xl drop-shadow animate-[twinkle_1.1s_ease-in-out_infinite]">
            ⭐️
          </span>
          <span className="absolute -bottom-8 left-2 select-none text-2xl drop-shadow animate-[twinkle_0.8s_ease-in-out_infinite]">
            💫
          </span>
          <span className="absolute -bottom-6 right-6 select-none text-xl drop-shadow animate-[twinkle_1.2s_ease-in-out_infinite]">
            🌟
          </span>

          {/* 主卡片 */}
          <div className="relative max-w-[86vw] rounded-[2rem] border-4 border-white/70 bg-gradient-to-br from-petal-100 via-butter-200 to-mint-200 px-8 py-6 text-center shadow-[0_20px_60px_-15px_rgba(244,114,182,0.45)] ring-1 ring-petal-200">
            <div className="mb-1 animate-[wiggle_0.9s_ease-in-out_infinite] text-5xl drop-shadow-sm">
              {item?.emoji ?? '🎉'}
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-base font-bold leading-relaxed text-ink-900 sm:text-lg">
              {item?.text ?? ' '}
            </p>
            <p className="mt-1 text-[11px] tracking-wider text-ink-500">
              ♡ 小宝的专属夸奖时刻 ♡
            </p>
          </div>
        </div>
      </div>

      {/* 背景淡淡的光斑（不阻挡交互） */}
      {item && (
        <div className="pointer-events-none absolute h-60 w-60 animate-[glow_2.5s_ease-in-out] rounded-full bg-gradient-to-br from-petal-300/30 via-lavender-300/25 to-mint-300/25 blur-3xl" />
      )}
    </div>
  )
}
