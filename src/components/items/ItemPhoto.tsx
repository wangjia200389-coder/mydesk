import { useState } from 'react'
import { usePhoto } from '@/hooks/usePhoto'

interface Props {
  photoId: string | null
  className?: string
  alt?: string
}

/** 物品照片：从 IndexedDB 异步加载；无照片/加载中显示可爱占位，加载完成后淡入。 */
export default function ItemPhoto({ photoId, className = '', alt = '' }: Props) {
  const url = usePhoto(photoId)
  const [loaded, setLoaded] = useState(false)

  if (url) {
    return (
      <img
        src={url}
        alt={alt}
        onLoad={() => setLoaded(true)}
        className={`transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'} ${className}`}
      />
    )
  }

  return (
    <div
      className={`flex items-center justify-center bg-petal-50 text-4xl text-petal-300 ${className}`}
    >
      📦
    </div>
  )
}
