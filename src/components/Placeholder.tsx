interface PlaceholderProps {
  icon: string
  title: string
  description: string
  accent?: 'petal' | 'lavender' | 'mint' | 'butter'
}

const accentMap = {
  petal: 'from-petal-200 to-petal-100 text-petal-600',
  lavender: 'from-lavender-200 to-lavender-300 text-lavender-500',
  mint: 'from-mint-200 to-mint-300 text-mint-500',
  butter: 'from-butter-300 to-butter-300 text-ink-700',
} as const

export default function Placeholder({
  icon,
  title,
  description,
  accent = 'petal',
}: PlaceholderProps) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center px-6 py-10 text-center">
      <div
        className={`mb-6 flex h-28 w-28 items-center justify-center rounded-[2rem] bg-gradient-to-br text-5xl shadow-soft ${accentMap[accent]}`}
      >
        {icon}
      </div>
      <h1 className="text-2xl font-semibold text-ink-900">{title}</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-500">
        {description}
      </p>
      <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-petal-100 bg-surface px-4 py-1.5 text-xs font-medium text-ink-400 shadow-card">
        <span className="h-1.5 w-1.5 rounded-full bg-mint-400" />
        建设中 · 敬请期待
      </span>
    </div>
  )
}
