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
  onNavigate?: () => void
}

/**
 * 4:3 Channel Logo Tile (Addendum 2).
 * - Quiet dark plate: #0C0C0E fill with faint top-down lift, hairline border (rgba(255,255,255,0.06)).
 * - Hover: fill rises to #151518, border to hairline-strong, scale 1.03 (spring, damping 28).
 * - Top-left: 6px red LIVE dot with soft pulse.
 * - Top-right: channel number in 11px text-3 tabular numerals (70% opacity at rest, 100% on hover).
 * - Center: processed logo mark in 56% x 38% box, centered with visual-center offset.
 * - Bottom-right: 36px white play circle on hover (never overlaps logo).
 * - Bottom edge: 2px flush red progress line (hover or Continue Watching only).
 * - Below plate:
 *   - Line 1: Channel name (14/600 text-1) + Favorite heart aligned to right on hover (16px text-2).
 *   - Line 2: Program title (12/450 text-3) or "Language · Quality" (e.g. "Hindi · HD").
 * - If real 16:9 program artwork exists: renders 16:9 still with 24px logo bug top-left.
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

  // Real 16:9 program artwork (never fake thumbnail)
  const hasArtwork = Boolean(current?.artworkUrl)

  // Quality label
  const quality = highestQuality(channel)

  // Meta line 2: current program title, or fallback to "Language · Quality"
  const metaLine2 = current?.title
    ? current.title
    : `${channel.language || 'General'} · ${quality}`

  const isWhiteKnockout = metrics?.tier === 'white-knockout'

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
          // Quiet dark plate recipe: #0C0C0E fill with hairline border; rises to #151518 on hover
          'bg-[#0C0C0E] border border-[rgba(255,255,255,0.06)] group-hover:bg-[#151518] group-hover:border-[rgba(255,255,255,0.14)]'
        )}
        style={{
          // Faint top-down lift inside the plate per Section 1
          backgroundImage:
            'radial-gradient(120% 90% at 50% 0%, rgba(255,255,255,0.035), transparent 60%)'
        }}
      >
        {/* Real artwork case: 16:9 still with logo bug top-left */}
        {hasArtwork ? (
          <div className="relative h-full w-full">
            <img
              src={current!.artworkUrl}
              alt={current?.title || channel.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
            {/* Top-left: if white knockout, direct on scrim; otherwise 55% black scrim chip */}
            <div className="absolute left-2.5 top-2.5 flex items-center gap-2">
              {isWhiteKnockout ? (
                <ChannelLogo channel={channel} size="bug" metrics={metrics} />
              ) : (
                <span className="flex items-center rounded-[6px] bg-black/55 px-1.5 py-1 backdrop-blur-sm">
                  <ChannelLogo channel={channel} size="bug" metrics={metrics} />
                </span>
              )}
              {channel.isLive ? (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#E11D2E] opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#E11D2E]" />
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          /* Standard 4:3 Logo Tile (Addendum 2 Section 1 & 3) */
          <div className="relative flex h-full w-full items-center justify-center">
            {/* Top-left: 6px Red LIVE dot with soft pulse (non-live: nothing) */}
            {channel.isLive ? (
              <span
                className="absolute left-3 top-3 z-10 flex h-1.5 w-1.5 pointer-events-none"
                aria-label="Live broadcast"
              >
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#E11D2E] opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#E11D2E]" />
              </span>
            ) : null}

            {/* Top-right: channel number in 11px text-3 tabular numerals (70% rest, 100% hover) */}
            <span
              className="absolute right-3 top-2.5 z-10 text-[11px] font-[500] tabular-nums text-[#66666C] opacity-70 transition-opacity duration-150 group-hover:opacity-100 pointer-events-none select-none"
              aria-label={`Channel number ${channel.number}`}
            >
              {channel.number}
            </span>

            {/* Center: processed logo mark, nothing else on the plate */}
            <div className="relative flex h-full w-full items-center justify-center transition-transform duration-200 ease-out group-hover:scale-[1.04]">
              <ChannelLogo channel={channel} size="tile" metrics={metrics} />
            </div>

            {/* Bottom-right: 36px solid white play circle with black glyph (hover only, never overlaps logo) */}
            <span
              className={cn(
                'absolute bottom-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-black shadow-md pointer-events-none',
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

        {/* Bottom edge: 2px flush red progress line (hover or Continue Watching only) */}
        {(isContinueWatching || isHovered) && progress > 0 ? (
          <span className="absolute inset-x-0 bottom-0 z-20 h-[2px] bg-white/10 pointer-events-none">
            <span
              className="block h-full bg-[#E11D2E] transition-[width] duration-300"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </span>
        ) : null}
      </button>

      {/* Under the plate */}
      <div className="mt-2.5 flex items-start justify-between gap-1.5 px-0.5">
        <div className="min-w-0 flex-1">
          {/* Line 1: Channel name (14/600 text-1, ellipsis) */}
          <div className="flex items-center justify-between gap-1.5">
            <p className="truncate text-[14px] font-[600] leading-snug text-[#F4F4F5]">
              {channel.name}
            </p>
            {/* Heart/favorite appears only on hover, aligned to right of line 1, 16px text-2 */}
            <button
              type="button"
              aria-label={isFavorite ? `Remove ${channel.name} from My List` : `Add ${channel.name} to My List`}
              aria-pressed={isFavorite}
              onClick={(e) => {
                e.stopPropagation()
                toggleFavorite(channel.id)
              }}
              className={cn(
                'shrink-0 rounded-[6px] p-0.5 text-[#A1A1A6] transition-all duration-150',
                isFavorite
                  ? 'text-[#E11D2E] opacity-100'
                  : 'opacity-0 hover:text-[#F4F4F5] group-hover:opacity-100 focus-visible:opacity-100'
              )}
            >
              <Heart className={cn('h-4 w-4', isFavorite && 'fill-current text-[#E11D2E]')} />
            </button>
          </div>

          {/* Line 2: Program title (12/450 text-3, ellipsis) or "Language · Quality" */}
          <p className="mt-0.5 truncate text-[12px] font-[450] leading-tight text-[#66666C]">
            {metaLine2}
          </p>
        </div>
      </div>
    </motion.article>
  )
})
