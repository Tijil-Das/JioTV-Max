import { memo, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Heart, Play } from 'lucide-react'
import type { Channel, Program } from '@shared/types'
import { cn } from '@/lib/cn'
import { highestQuality } from '@/lib/constants'
import { getNowNext, getProgress, formatTimeLeft } from '@/lib/time'
import { useNow } from '@/hooks/useNow'
import { useChannelStore } from '@/store/useChannelStore'
import { ChannelLogo } from '@/components/ui/ChannelLogo'
import { LiveBadge, QualityBadge } from '@/components/ui/LiveBadge'

interface ChannelCardProps {
  channel: Channel
  programs?: Program[]
  resumeProgress?: number
  className?: string
  fluid?: boolean
  onNavigate?: () => void
}

/**
 * Channel card — 16:10 tile, surface-2 bg, hairline border, 12px radius.
 * Neutral surface only — no brand-color tint, no gradient background.
 * Logo centered at ~50% width on a dark neutral field.
 * Hover: scale 1.03 spring, hairline-strong border, 35% black scrim, white circle play button.
 */
export const ChannelCard = memo(function ChannelCard({
  channel,
  programs = [],
  resumeProgress,
  className,
  fluid = false,
  onNavigate
}: ChannelCardProps) {
  const navigate = useNavigate()
  const now = useNow()
  const favorites = useChannelStore((state) => state.favorites)
  const toggleFavorite = useChannelStore((state) => state.toggleFavorite)
  const isFavorite = favorites.includes(channel.id)

  const { current, next } = useMemo(() => getNowNext(programs, now), [programs, now])
  const liveProgress = current ? getProgress(current, now) : 0
  const progress = resumeProgress != null ? resumeProgress * 100 : liveProgress
  const quality = highestQuality(channel)

  const open = () => {
    onNavigate?.()
    navigate(`/watch/${channel.id}`)
  }

  return (
    <motion.article
      layout={false}
      whileHover={{ scale: 1.03 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      className={cn(
        'group relative flex select-none flex-col',
        fluid ? 'w-full' : 'w-[256px] shrink-0',
        className
      )}
    >
      <button
        type="button"
        onClick={open}
        aria-label={`Watch ${channel.name} live`}
        className={cn(
          'relative block w-full overflow-hidden rounded-[12px] text-left outline-none',
          'bg-[#111113] border border-[rgba(255,255,255,0.07)]',
          'group-hover:border-[rgba(255,255,255,0.14)]',
          'transition-[border-color] duration-[200ms]',
          'aspect-[16/10]'
        )}
      >
        {/* Channel logo — centered, contain, ~50% width, no tint behind it */}
        <span className="absolute inset-0 flex items-center justify-center">
          <ChannelLogo channel={channel} size="lg" />
        </span>

        {/* Hover: 35% black scrim fades in */}
        <span className="absolute inset-0 bg-black/0 transition-[background] duration-[200ms] group-hover:bg-black/35" />

        {/* Top-left: LIVE badge */}
        <span className="absolute left-3 top-3 flex items-center gap-2">
          {channel.isLive ? <LiveBadge /> : null}
        </span>

        {/* Top-right: quality badge */}
        <span className="absolute right-3 top-3">
          <QualityBadge quality={quality} />
        </span>

        {/* Play affordance — 44px white circle with black glyph, fades in on hover */}
        <span className="absolute inset-0 flex items-center justify-center">
          <span
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-full bg-white text-black',
              'opacity-0 scale-90 transition-all duration-[200ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
              'group-hover:opacity-100 group-hover:scale-100',
              'group-focus-visible:opacity-100 group-focus-visible:scale-100'
            )}
          >
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </span>
        </span>

        {/* Progress bar — flush at bottom edge, 2px height */}
        {progress > 0 ? (
          <span className="absolute inset-x-0 bottom-0 h-[2px] bg-white/10">
            <span
              className="block h-full bg-[#E11D2E] transition-[width] duration-700"
              style={{ width: `${progress}%` }}
            />
          </span>
        ) : null}
      </button>

      {/* Meta row — below the tile, not on it */}
      <div className="mt-3 flex items-start gap-2 px-0.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-[600] text-[#F4F4F5]">{channel.name}</p>
          <p className="mt-0.5 truncate text-[12px] text-[#66666C]">
            {current
              ? `Now · ${current.title}`
              : next
                ? `Next · ${next.title}`
                : channel.language}
          </p>
        </div>
        <button
          type="button"
          aria-label={isFavorite ? `Remove ${channel.name} from My List` : `Add ${channel.name} to My List`}
          aria-pressed={isFavorite}
          onClick={(e) => {
            e.stopPropagation()
            toggleFavorite(channel.id)
          }}
          className={cn(
            'shrink-0 rounded-[8px] p-1.5 transition-colors duration-[120ms]',
            isFavorite
              ? 'text-[#E11D2E]'
              : 'text-[#66666C] opacity-0 hover:text-[#F4F4F5] group-hover:opacity-100 focus-visible:opacity-100'
          )}
        >
          <Heart className={cn('h-3.5 w-3.5', isFavorite && 'fill-current')} />
        </button>
      </div>
    </motion.article>
  )
})
