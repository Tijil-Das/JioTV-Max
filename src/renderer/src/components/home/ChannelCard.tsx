import { memo, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Heart, Play } from 'lucide-react'
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
 * Addendum 3 §3 — square channel icon tile.
 *
 * At rest the plate contains only the processed logo and the number chip.
 * Hover adds the play affordance, heart and (when EPG exists) a progress line.
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
  // getProgress returns a 0-100 percentage.
  const progress = current ? getProgress(current, now) : 0
  const quality = highestQuality(channel)
  const secondary = current ? null : [channel.language, quality].filter(Boolean).join(' · ')

  const open = (): void => {
    onNavigate?.()
    navigate(`/watch/${channel.id}`)
  }

  return (
    <div
      className={cn(
        'group relative shrink-0 select-none',
        fluid ? 'w-full' : 'w-[clamp(128px,10.5vw,160px)]',
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
          <div className="absolute inset-0 transition-transform duration-200 group-hover:scale-[1.03]">
            <ChannelLogo channel={channel} size="tile" />
          </div>

          <span className="pointer-events-none absolute left-2 top-2 z-20 flex h-5 items-center rounded-[6px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.10)] px-[7px] font-sans text-[12px] font-[650] tabular-nums leading-none text-[#F4F4F5]">
            {channel.number}
          </span>

          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-2 right-2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-white text-black opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            <Play className="ml-[1px] h-3.5 w-3.5 fill-black" strokeWidth={0} />
          </span>

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

          <button
            type="button"
            onClick={open}
            className="absolute inset-0 z-10 cursor-pointer rounded-[16px] focus:outline-none"
            aria-label={`Watch ${channel.name}`}
          />

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

      <div className="mt-2 min-w-0">
        <p className="truncate text-[13px] font-[600] leading-[1.25] text-[#F4F4F5]">
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
