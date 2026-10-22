import { memo, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Heart } from 'lucide-react'
import type { Channel, Program } from '@shared/types'
import { cn } from '@/lib/cn'
import { highestQuality } from '@/lib/constants'
import { getNowNext, getProgress } from '@/lib/time'
import { useNow } from '@/hooks/useNow'
import { useChannelStore } from '@/store/useChannelStore'
import { ChannelLogo } from '@/components/ui/ChannelLogo'

interface ChannelCardProps {
  channel: Channel
  programs?: Program[]
  /** @deprecated progress is intentionally hidden on live tiles. */
  resumeProgress?: number
  className?: string
  /** Fill a grid cell rather than using the fixed row width. */
  fluid?: boolean
  onNavigate?: () => void
}

/**
 * Addendum 4 §4 — square channel icon tile (rows and grids).
 *
 * Size: --tile: clamp(144px, 11.6vw, 176px). 1:1, radius 16px.
 * Plate: fill #0E0E10, 1px rgba(255,255,255,0.07) border.
 * Number chip: 20px tall, padding 0 7px, radius 6px, fill rgba(255,255,255,0.10).
 * Hover scale applies to whole tile only. Logo is never scaled separately.
 */
export const ChannelCard = memo(function ChannelCard({
  channel,
  programs,
  className,
  fluid = false,
  onNavigate
}: ChannelCardProps): JSX.Element {
  const navigate = useNavigate()
  const now = useNow()
  const reduceMotion = useReducedMotion()
  const favorites = useChannelStore((state) => state.favorites)
  const toggleFavorite = useChannelStore((state) => state.toggleFavorite)
  const isFavorite = favorites.includes(channel.id)

  const current = useMemo(() => getNowNext(programs ?? [], now).current, [programs, now])
  const progress = current ? getProgress(current, now) : 0
  const quality = highestQuality(channel)
  const secondary = current ? null : [channel.language, quality].filter(Boolean).join(' · ')

  const open = (): void => {
    onNavigate?.()
    navigate(`/watch/${channel.id}`)
  }

  const ariaLabel = current
    ? `Channel ${channel.number}, ${channel.name}, ${channel.language}, ${quality}, now: ${current.title}`
    : `Channel ${channel.number}, ${channel.name}, ${channel.language}, ${quality}`

  return (
    <div
      className={cn(
        'group relative shrink-0 select-none',
        fluid ? 'w-full' : 'w-[clamp(144px,11.6vw,176px)]',
        className
      )}
    >
      <motion.div
        className="relative"
        whileHover={reduceMotion ? undefined : { scale: 1.04 }}
        whileTap={reduceMotion ? undefined : { scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      >
        <div
          className={cn(
            'relative aspect-square w-full overflow-hidden rounded-[16px] border border-[rgba(255,255,255,0.07)] bg-[#0E0E10]',
            'transition-colors duration-150 group-hover:border-[rgba(255,255,255,0.14)] group-hover:bg-[#151518]',
            'group-focus-within:outline group-focus-within:outline-2 group-focus-within:outline-offset-2 group-focus-within:outline-[var(--red-line)]'
          )}
        >
          {/* Logo container: fixed 1:1 optical square, flex-centered with safe-zone padding */}
          <div className="flex h-full w-full items-center justify-center p-3">
            <ChannelLogo channel={channel} context="tile" className="h-full w-full" />
          </div>

          {/* Number chip (top-left, inset 8px): 20px tall, padding 0 7px, radius 6px */}
          <span className="pointer-events-none absolute left-2 top-2 z-20 flex h-5 items-center rounded-[6px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.10)] px-[7px] font-sans text-[12px] font-[650] tabular-nums leading-none text-[#F4F4F5]">
            <span>{channel.number}</span>
          </span>

          {/* EPG progress line (bottom edge) */}
          {current && progress > 0 ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[2px] bg-white/[0.06] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
            >
              <span
                className="block h-full bg-[var(--red)]"
                style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
              />
            </span>
          ) : null}

          {/* Accessible tile button (§7) */}
          <button
            type="button"
            onClick={open}
            className="absolute inset-0 z-10 cursor-pointer rounded-[16px] focus:outline-none"
            aria-label={ariaLabel}
          />

          {/* Favorite button */}
          <button
            type="button"
            onClick={() => toggleFavorite(channel.id)}
            className={cn(
              'absolute right-2 top-2 z-30 flex h-7 w-7 items-center justify-center rounded-full',
              'opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--red-line)]'
            )}
            aria-label={isFavorite ? `Remove ${channel.name} from My List` : `Add ${channel.name} to My List`}
            aria-pressed={isFavorite}
          >
            <Heart
              className={cn('h-4 w-4', isFavorite ? 'fill-[var(--red)] text-[var(--red)]' : 'text-white')}
              strokeWidth={2}
            />
          </button>
        </div>
      </motion.div>

      {/* Under tile: 8px gap, two single-line ellipsis rows with title tooltip */}
      <div className="mt-2 min-w-0">
        <p
          title={channel.name}
          className="truncate text-[13px] font-[600] leading-[1.25] text-[#F4F4F5]"
        >
          {channel.name}
        </p>
        <p className="mt-[3px] flex min-w-0 items-center gap-1.5 text-[12px] font-[450] leading-[1.25] text-[#A1A1A6]">
          {current ? (
            <>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--red)]" aria-hidden />
              <span className="truncate">{current.title}</span>
            </>
          ) : (
            <span className="truncate">{secondary}</span>
          )}
        </p>
      </div>
    </div>
  )
})
