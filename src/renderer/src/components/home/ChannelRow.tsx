import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Channel, Program } from '@shared/types'
import { cn } from '@/lib/cn'
import { useRowScroll } from '@/hooks/useRowScroll'
import { ChannelCard } from './ChannelCard'
import { ChannelCardSkeleton } from '@/components/ui/Skeleton'
import { IconButton } from '@/components/ui/Button'

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

/** Horizontally scrolling shelf with edge-aware controls and a soft mask. */
export function ChannelRow({
  title,
  subtitle,
  channels,
  epg,
  loading = false,
  viewAllTo,
  className,
  progressByChannel
}: ChannelRowProps): JSX.Element {
  const navigate = useNavigate()
  const { ref, canScrollLeft, canScrollRight, scrollByPage, onWheel } = useRowScroll<HTMLDivElement>()

  if (!loading && channels.length === 0) return <></>

  return (
    <section className={cn('relative', className)} aria-labelledby={`row-${title.replace(/\s+/g, '-').toLowerCase()}`}>
      <header className="mb-4 flex items-end justify-between gap-6 px-8">
        <div>
          <h2
            id={`row-${title.replace(/\s+/g, '-').toLowerCase()}`}
            className="font-display text-[17px] font-semibold tracking-tight text-text-primary"
          >
            {title}
          </h2>
          {subtitle ? <p className="mt-1 text-[12px] text-text-muted">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-1.5">
          {viewAllTo ? (
            <button
              type="button"
              onClick={() => navigate(viewAllTo)}
              className="mr-1 rounded-lg px-3 py-1.5 text-[12px] font-medium text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              View all
            </button>
          ) : null}
          <IconButton
            label={`Scroll ${title} left`}
            size="sm"
            onClick={() => scrollByPage(-1)}
            disabled={!canScrollLeft}
            className={cn('transition-opacity', canScrollLeft ? 'opacity-100' : 'opacity-0')}
          >
            <ChevronLeft className="h-4 w-4" />
          </IconButton>
          <IconButton
            label={`Scroll ${title} right`}
            size="sm"
            onClick={() => scrollByPage(1)}
            disabled={!canScrollRight}
            className={cn('transition-opacity', canScrollRight ? 'opacity-100' : 'opacity-0')}
          >
            <ChevronRight className="h-4 w-4" />
          </IconButton>
        </div>
      </header>

      <div
        ref={ref}
        onWheel={onWheel}
        className="no-scrollbar flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth px-8 pb-6 pt-1"
      >
        {loading
          ? Array.from({ length: 6 }).map((_, index) => <ChannelCardSkeleton key={index} />)
          : channels.map((channel) => (
              <div key={channel.id} className="snap-start">
                <ChannelCard
                  channel={channel}
                  programs={epg[channel.id]}
                  resumeProgress={progressByChannel?.[channel.id]}
                />
              </div>
            ))}
      </div>
    </section>
  )
}
