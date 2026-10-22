import { memo, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Heart, Play } from 'lucide-react'
import type { Channel, Program } from '@shared/types'
import { cn } from '@/lib/cn'
import { highestQuality } from '@/lib/constants'
import { getNowNext, getProgress } from '@/lib/time'
import { useNow } from '@/hooks/useNow'
import { useChannelStore } from '@/store/useChannelStore'
import { useRelayStore } from '@/store/useRelayStore'
import { useLogoMetrics } from '@/lib/logoMetrics'
import { ChannelLogo } from '@/components/ui/ChannelLogo'

interface ChannelCardProps {
  channel: Channel
  programs?: Program[]
  resumeProgress?: number
  className?: string
  fluid?: boolean
  /** Force the dark-plate + 72% light inset badge variant when row light plates exceed 20% */
  insetBadge?: boolean
  onNavigate?: () => void
}

/**
 * 4:3 Channel Logo Tile (rows and grids).
 * - Quiet plate: surface-2 (#111113) or light plate (#E9E9EC) for dark logos.
 * - Normalized brand mark centered on plate.
 * - Max one badge: 6px red live dot with soft pulse top-left.
 * - Hover: plate lifts to surface-3, border to hairline-strong, spring scale 1.03, logo scales 1.04.
 * - 36px solid white play circle bottom-right on hover (never obscures logo).
 * - 2px red progress bar flush at bottom only on hover/focus or Continue Watching.
 * - Meta below tile: Line 1: Channel name (14/600). Line 2: Program title (12/450) or "Language · Number".
 * - If real 16:9 program artwork exists: renders 16:9 artwork with 28px logo bug in top-left scrim chip.
 */
export const ChannelCard = memo(function ChannelCard({
  channel,
  programs = [],
  resumeProgress,
  className,
  fluid = false,
  insetBadge = false,
  onNavigate
}: ChannelCardProps) {
  const navigate = useNavigate()
  const now = useNow()
  const favorites = useChannelStore((state) => state.favorites)
  const toggleFavorite = useChannelStore((state) => state.toggleFavorite)
  const isFavorite = favorites.includes(channel.id)

  const logoProxyUrl = useRelayStore((s) => s.logoProxyUrl)
  const rawSrc = channel.logoUrl ? logoProxyUrl(channel.logoUrl) : ''
  const { metrics } = useLogoMetrics(rawSrc)

  const [isHovered, setIsHovered] = useState(false)

  const { current } = useMemo(() => getNowNext(programs, now), [programs, now])
  const liveProgress = current ? getProgress(current, now) : 0
  const isContinueWatching = resumeProgress != null
  const progress = isContinueWatching ? resumeProgress * 100 : liveProgress

  const open = () => {
    onNavigate?.()
    navigate(`/watch/${channel.id}`)
  }

  // Check if real 16:9 artwork exists (never fake thumbnail)
  const hasArtwork = Boolean(current?.artworkUrl)

  // Contrast rule: dark/low-contrast logos switch plate to #E9E9EC
  const useLightPlate = Boolean(metrics?.useLightPlate) && !insetBadge

  // Meta line 2: program title, or fallback to "Language · Number"
  const metaLine2 = current?.title
    ? current.title
    : `${channel.language || 'General'} · ${channel.number}`

  const quality = highestQuality(channel)

  return (
    <motion.article
      layout={false}
      whileHover={{ scale: 1.03 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className={cn(
        'group relative flex select-none flex-col',
        fluid ? 'w-full' : 'w-[clamp(168px,14vw,220px)] shrink-0',
        className
      )}
    >
      <button
        type="button"
        onClick={open}
        aria-label={`Watch ${channel.name}`}
        className={cn(
          'relative block w-full overflow-hidden rounded-[12px] text-left outline-none transition-[background-color,border-color] duration-200',
          'focus-visible:outline-2 focus-visible:outline-[var(--red-line)] focus-visible:outline-offset-2',
          hasArtwork ? 'aspect-video' : 'aspect-[4/3]',
          // Plate styling
          hasArtwork
            ? 'bg-[#111113] border border-[rgba(255,255,255,0.07)] group-hover:border-[rgba(255,255,255,0.14)]'
            : useLightPlate
              ? 'bg-[#E9E9EC] border border-[rgba(0,0,0,0.08)] group-hover:bg-[#F4F4F6] group-hover:border-[rgba(0,0,0,0.18)]'
              : 'bg-[#111113] border border-[rgba(255,255,255,0.07)] group-hover:bg-[#18181B] group-hover:border-[rgba(255,255,255,0.14)]'
        )}
      >
        {/* Real artwork case: 16:9 program still with logo bug top-left */}
        {hasArtwork ? (
          <div className="relative h-full w-full">
            <img
              src={current!.artworkUrl}
              alt={current?.title || channel.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
            {/* Top-left: 55% black scrim chip with 28px logo bug + 6px red live dot */}
            <div className="absolute left-2.5 top-2.5 flex items-center gap-2">
              <span className="flex items-center rounded-[6px] bg-black/55 px-1.5 py-1 backdrop-blur-sm">
                <ChannelLogo channel={channel} size="bug" metrics={metrics} />
              </span>
              {channel.isLive ? (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#E11D2E] opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#E11D2E]" />
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          /* Standard 4:3 Logo Tile */
          <div className="relative flex h-full w-full items-center justify-center p-3">
            {/* 6px Red live dot in top-left corner */}
            {channel.isLive ? (
              <span
                className="absolute left-3 top-3 z-10 flex h-1.5 w-1.5 pointer-events-none"
                aria-label="Live broadcast"
              >
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#E11D2E] opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#E11D2E]" />
              </span>
            ) : null}

            {/* Logo presentation on the plate (scales 1.04 on hover) */}
            <div
              className={cn(
                'relative flex h-full w-full items-center justify-center transition-transform duration-200 ease-out group-hover:scale-[1.04]',
                insetBadge && 'rounded-[10px] bg-[#E9E9EC] p-2 h-[72%] w-[72%]'
              )}
            >
              <ChannelLogo
                channel={channel}
                size="tile"
                metrics={metrics}
              />
            </div>

            {/* Play affordance: 36px solid white circle at bottom-right corner (never hides logo) */}
            <span
              className={cn(
                'absolute bottom-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-black shadow-md',
                'opacity-0 scale-90 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
                'group-hover:opacity-100 group-hover:scale-100',
                'group-focus-visible:opacity-100 group-focus-visible:scale-100'
              )}
              aria-hidden="true"
            >
              <Play className="ml-0.5 h-4 w-4 fill-current text-black" />
            </span>
          </div>
        )}

        {/* 2px Red progress line flush with bottom edge: only on hover/focus or Continue Watching */}
        {(isContinueWatching || isHovered) && progress > 0 ? (
          <span className="absolute inset-x-0 bottom-0 z-20 h-[2px] bg-white/10 pointer-events-none">
            <span
              className="block h-full bg-[#E11D2E] transition-[width] duration-300"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </span>
        ) : null}
      </button>

      {/* Meta row — below the tile, outside it */}
      <div className="mt-2.5 flex items-start justify-between gap-1.5 px-0.5">
        <div className="min-w-0 flex-1">
          {/* Line 1: Channel name (14/600, text-1, 1-line ellipsis) */}
          <p className="truncate text-[14px] font-[600] leading-snug text-[#F4F4F5]">
            {channel.name}
          </p>
          {/* Line 2: Program title (12/450, text-3, ellipsis) */}
          <p className="mt-0.5 truncate text-[12px] font-[450] leading-tight text-[#66666C]">
            {metaLine2}
            {quality === 'HD' || quality === '4K' ? ` · ${quality}` : ''}
          </p>
        </div>

        {/* Favorite heart icon */}
        <button
          type="button"
          aria-label={isFavorite ? `Remove ${channel.name} from My List` : `Add ${channel.name} to My List`}
          aria-pressed={isFavorite}
          onClick={(e) => {
            e.stopPropagation()
            toggleFavorite(channel.id)
          }}
          className={cn(
            'shrink-0 rounded-[8px] p-1 transition-colors duration-150',
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
