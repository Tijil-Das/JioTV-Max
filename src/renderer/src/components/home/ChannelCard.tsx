import { memo, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Crown, Heart, Play } from 'lucide-react'
import type { Channel, Program } from '@shared/types'
import { cn } from '@/lib/cn'
import { hexToRgba } from '@/lib/color'
import { highestQuality } from '@/lib/constants'
import { formatRange, formatTimeLeft, getNowNext, getProgress } from '@/lib/time'
import { useNow } from '@/hooks/useNow'
import { useChannelStore } from '@/store/useChannelStore'
import { ChannelLogo } from '@/components/ui/ChannelLogo'
import { LiveBadge, QualityBadge } from '@/components/ui/LiveBadge'

interface ChannelCardProps {
  channel: Channel
  programs?: Program[]
  /** 0-1 override used by the Continue Watching row. */
  resumeProgress?: number
  className?: string
  /** Stretch to the width of a CSS grid cell instead of the fixed row width. */
  fluid?: boolean
  onNavigate?: () => void
}

/**
 * The workhorse of the app. One 16:9 art tile with live signalling,
 * mini-EPG progress and a hover play state, plus a compact meta row.
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
  const tint = channel.brandColor

  const open = () => {
    onNavigate?.()
    navigate(`/watch/${channel.id}`)
  }

  return (
    <motion.article
      layout={false}
      whileHover={{ y: -5 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      style={{ ['--tint' as string]: hexToRgba(tint, 0.5) }}
      className={cn(
        'group relative flex select-none flex-col',
        fluid ? 'w-full' : 'w-[264px] shrink-0',
        className
      )}
    >
      <button
        type="button"
        onClick={open}
        aria-label={`Watch ${channel.name} live`}
        className={cn(
          'relative block aspect-video w-full overflow-hidden rounded-2xl border border-white/[0.07] text-left',
          'bg-bg-card outline-none transition-shadow duration-300',
          'group-hover:border-white/15 group-hover:shadow-[0_22px_60px_-22px_var(--tint)]',
          'focus-visible:ring-2 focus-visible:ring-accent-glow'
        )}
      >
        {/* Layered brand artwork replaces missing logo art gracefully. */}
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            background: `radial-gradient(120% 120% at 15% 0%, ${hexToRgba(tint, 0.55)} 0%, rgba(9,9,13,.96) 58%), linear-gradient(150deg, rgba(255,255,255,.08), transparent 45%)`
          }}
        />
        <span
          aria-hidden
          className="absolute -right-6 -top-10 font-display text-[110px] font-extrabold leading-none tracking-tighter text-white/[0.05]"
        >
          {channel.number}
        </span>
        <span
          aria-hidden
          className="absolute bottom-[-18px] left-3 font-display text-[58px] font-extrabold uppercase leading-none tracking-tighter text-white/[0.07]"
        >
          {channel.name.replace(/\s*(HD|SD|4K)\+?$/i, '').slice(0, 10)}
        </span>
        <span
          aria-hidden
          className="absolute inset-0 opacity-[0.18] transition-opacity duration-500 group-hover:opacity-25"
          style={{
            background:
              'repeating-linear-gradient(108deg, rgba(255,255,255,.12) 0 2px, transparent 2px 9px)'
          }}
        />

        <span className="absolute left-3 top-3 flex items-center gap-2">
          {channel.isLive ? <LiveBadge /> : null}
          {channel.isPremium ? (
            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-amber-400/90 text-black">
              <Crown className="h-2.5 w-2.5" />
            </span>
          ) : null}
        </span>
        <span className="absolute right-3 top-3 flex items-center gap-2">
          <QualityBadge quality={quality} />
        </span>

        {/* Play affordance */}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-14 w-14 translate-y-2 scale-90 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white opacity-0 backdrop-blur-md transition-all duration-300 ease-premium group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </span>
        </span>

        {/* Mini EPG footer */}
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-4 pb-3 pt-10">
          <span className="block truncate text-[12px] font-medium text-white">
            {current?.title ?? 'Live now'}
          </span>
          <span className="mt-1.5 flex items-center gap-3">
            <span className="h-[3px] flex-1 overflow-hidden rounded-pill bg-white/15">
              <span
                className="block h-full rounded-pill bg-accent-gradient transition-[width] duration-700 ease-premium"
                style={{ width: `${progress}%` }}
              />
            </span>
            <span className="shrink-0 text-[10px] tabular-nums text-white/70">
              {resumeProgress != null
                ? `${Math.round(resumeProgress * 100)}% watched`
                : current
                  ? formatTimeLeft(current.end, now)
                  : ''}
            </span>
          </span>
        </span>
      </button>

      <div className="mt-3 flex items-center gap-3 px-0.5">
        <ChannelLogo channel={channel} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-text-primary">{channel.name}</p>
          <p className="mt-0.5 truncate text-[11px] text-text-muted">
            {channel.number} · {channel.language}
            {current ? ` · ${formatRange(current.start, current.end)}` : ''}
            {!current && next ? ` · ${next.title} next` : ''}
          </p>
        </div>
        <button
          type="button"
          aria-label={isFavorite ? `Remove ${channel.name} from My List` : `Add ${channel.name} to My List`}
          aria-pressed={isFavorite}
          onClick={(event) => {
            event.stopPropagation()
            toggleFavorite(channel.id)
          }}
          className={cn(
            'rounded-lg p-2 transition-all duration-200',
            isFavorite
              ? 'text-live opacity-100'
              : 'text-text-muted opacity-0 hover:text-white group-hover:opacity-100 focus-visible:opacity-100'
          )}
        >
          <Heart className={cn('h-3.5 w-3.5', isFavorite && 'fill-current')} />
        </button>
      </div>
    </motion.article>
  )
})
