import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Channel, ChannelCategory } from '@shared/types'
import { CATEGORY_META } from '@/lib/constants'
import { cn } from '@/lib/cn'

const CATEGORY_KEYS: ChannelCategory[] = ['sports', 'news', 'movies', 'entertainment', 'kids', 'regional']

/**
 * Category filter chips — replaces the colorful tile grid.
 * 36px tall, surface-2, hairline, 8px radius, 13/550 text-2.
 * Active: red-tint fill, red-line border, text-1.
 * No icons in colored boxes. No colored backgrounds.
 */
export function CategoryTiles({ channels }: { channels: Channel[] }): JSX.Element {
  const navigate = useNavigate()
  const counts = useMemo(() => {
    const map = new Map<ChannelCategory, number>()
    channels.forEach((ch) => map.set(ch.category, (map.get(ch.category) ?? 0) + 1))
    return map
  }, [channels])

  return (
    <div className="flex flex-wrap items-center gap-2 px-12">
      {CATEGORY_KEYS.map((key) => {
        const meta = CATEGORY_META[key]
        const count = counts.get(key) ?? 0
        if (!meta || count === 0) return null
        return (
          <button
            key={key}
            type="button"
            onClick={() => navigate(`/category/${key}`)}
            className={cn(
              'flex h-9 items-center gap-2 rounded-[8px] border px-3.5',
              'border-[rgba(255,255,255,0.07)] bg-[#111113]',
              'text-[13px] font-[550] text-[#A1A1A6]',
              'transition-colors duration-[120ms]',
              'hover:border-[rgba(255,255,255,0.14)] hover:text-[#F4F4F5]'
            )}
          >
            {meta.label}
            <span className="text-[12px] font-[450] text-[#A1A1A6]">{count}</span>
          </button>
        )
      })}
    </div>
  )
}
