import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Channel, Program } from '@shared/types'
import { cn } from '@/lib/cn'
import { useRowScroll } from '@/hooks/useRowScroll'
import { useRelayStore } from '@/store/useRelayStore'
import { getLogoMetricsSync } from '@/lib/logoMetrics'
import { ChannelCard } from './ChannelCard'
import { ChannelCardSkeleton } from '@/components/ui/Skeleton'

interface ChannelRowProps {
  title: string
  subtitle?: string
  channels: Channel[]
  epg: Record<string, Program[]>
  loading?: boolean
  viewAllTo?: string
  className?: string
  progressByChannel?: Record<string, number>
}

/**
 * Horizontally scrolling shelf.
 * - Title flush-left at 48px gutter.
 * - Standard row: 6 tiles visible at 1440px width, 16px gap (gap-4).
 * - Tile width: clamp(168px, 14vw, 220px).
 * - Light plate 20% cap rule: if light plates exceed 20% of the row,
 *   excess light-plate channels render with a 72% #E9E9EC inset badge on dark plate.
 */
export function ChannelRow({
  title,
  channels,
  epg,
  loading = false,
  viewAllTo,
  className,
  progressByChannel
}: ChannelRowProps): JSX.Element {
  const navigate = useNavigate()
  const { ref, canScrollLeft, canScrollRight, scrollByPage, onWheel } = useRowScroll<HTMLDivElement>()
  const logoProxyUrl = useRelayStore((s) => s.logoProxyUrl)

  // Calculate light plate distribution to enforce the 20% cap
  const { channelInsetBadgeMap } = useMemo(() => {
    const maxAllowedLight = Math.max(1, Math.round(channels.length * 0.2))
    let lightCount = 0
    const insetMap = new Map<string, boolean>()

    for (const ch of channels) {
      const src = ch.logoUrl ? logoProxyUrl(ch.logoUrl) : ''
      const metrics = getLogoMetricsSync(src)
      if (metrics?.useLightPlate) {
        lightCount++
        if (lightCount > maxAllowedLight) {
          insetMap.set(ch.id, true)
        }
      }
    }
    return { channelInsetBadgeMap: insetMap }
  }, [channels, logoProxyUrl])

  if (!loading && channels.length === 0) return <></>

  return (
    <section className={cn('relative', className)} aria-labelledby={`row-${title.replace(/\s+/g, '-').toLowerCase()}`}>
      {/* Header — flush left at 48px gutter, no subtitle */}
      <header className="mb-4 flex items-center justify-between gap-6 px-12">
        <h2
          id={`row-${title.replace(/\s+/g, '-').toLowerCase()}`}
          className="text-[20px] font-[600] tracking-[-0.01em] text-[#F4F4F5]"
        >
          {title}
        </h2>
        <div className="flex items-center gap-1">
          {viewAllTo ? (
            <button
              type="button"
              onClick={() => navigate(viewAllTo)}
              className="mr-2 rounded-[8px] px-3 py-1.5 text-[13px] font-[500] text-[#A1A1A6] transition-colors duration-[120ms] hover:bg-white/[0.06] hover:text-[#F4F4F5]"
            >
              View all
            </button>
          ) : null}
          <button
            aria-label={`Scroll ${title} left`}
            type="button"
            onClick={() => scrollByPage(-1)}
            disabled={!canScrollLeft}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-[8px] text-[#66666C] transition-all duration-[120ms]',
              'hover:bg-white/[0.06] hover:text-[#F4F4F5]',
              !canScrollLeft && 'opacity-0 pointer-events-none'
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            aria-label={`Scroll ${title} right`}
            type="button"
            onClick={() => scrollByPage(1)}
            disabled={!canScrollRight}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-[8px] text-[#66666C] transition-all duration-[120ms]',
              'hover:bg-white/[0.06] hover:text-[#F4F4F5]',
              !canScrollRight && 'opacity-0 pointer-events-none'
            )}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div
        ref={ref}
        onWheel={onWheel}
        className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-12 pb-6 pt-1"
      >
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <ChannelCardSkeleton key={i} />)
          : channels.map((ch) => (
              <div key={ch.id} className="snap-start">
                <ChannelCard
                  channel={ch}
                  programs={epg[ch.id]}
                  resumeProgress={progressByChannel?.[ch.id]}
                  insetBadge={channelInsetBadgeMap.get(ch.id) ?? false}
                />
              </div>
            ))}
      </div>
    </section>
  )
}
