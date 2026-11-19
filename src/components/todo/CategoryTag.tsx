import { useTodoStore, type Category } from '@/store/useTodoStore'

export default function CategoryTag(props: {
  categoryId: string
  size?: 'sm' | 'md'
}) {
  const cat = useTodoStore((s) => s.ensureCategory(props.categoryId))
  const size = props.size ?? 'sm'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ring-1 ring-inset font-medium ${
        cat.chip
      } ${size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cat.dot}`} />
      {cat.name}
    </span>
  )
}

export function CategoryTagStatic(props: {
  cat: Category
  size?: 'sm' | 'md'
}) {
  const size = props.size ?? 'sm'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ring-1 ring-inset font-medium ${
        props.cat.chip
      } ${size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${props.cat.dot}`} />
      {props.cat.name}
    </span>
  )
}
