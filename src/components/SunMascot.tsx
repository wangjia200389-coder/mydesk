/** 可爱小太阳吉祥物（呼应应用的暖色调，作为品牌锚点）。全局复用。 */
export default function SunMascot() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <g stroke="#BA7517" strokeWidth="6" strokeLinecap="round">
        <line x1="60" y1="20" x2="60" y2="8" />
        <line x1="28" y1="32" x2="20" y2="24" />
        <line x1="92" y1="32" x2="100" y2="24" />
        <line x1="14" y1="60" x2="2" y2="60" />
        <line x1="106" y1="60" x2="118" y2="60" />
        <line x1="28" y1="88" x2="20" y2="96" />
        <line x1="92" y1="88" x2="100" y2="96" />
        <line x1="60" y1="100" x2="60" y2="112" />
      </g>
      <circle cx="60" cy="60" r="34" fill="#FAC775" stroke="#BA7517" strokeWidth="5" />
      <circle cx="50" cy="58" r="4" fill="#2C2C2A" />
      <circle cx="70" cy="58" r="4" fill="#2C2C2A" />
      <circle cx="42" cy="68" r="5" fill="#F4C0D1" />
      <circle cx="78" cy="68" r="5" fill="#F4C0D1" />
      <path
        d="M52 68 q8 8 16 0"
        stroke="#2C2C2A"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  )
}
