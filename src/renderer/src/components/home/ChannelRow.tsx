import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Channel, Program } from '@shared/types'
import { cn } from '@/lib/cn'
import { useRowScroll } from '@/hooks/useRowScroll'
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
  /** @deprecated live tiles never show resume progress. */
  progressByChannel?: Record<string, number>
}

/**
 * Addendum 3 §3 row.
 *
 * Full-bleed scroller with the 48px gutter as both padding and scroll-padding
 * so the first tile's left edge is exactly the row title's left edge. The right
 * edge is masked with a peek of the next tile; the left mask only appears once
 * the scroller has moved.
 */
export function ChannelRow({
  title,
  subtitle,
  channels,
  epg,
  loading = false,
  viewAllTo,
  className
}: ChannelRowProps): JSX.Element {
  const navigate = useNavigate()
  const { ref, canScrollLeft, canScrollRight, scrollByPage, onWheel } =
    useRowScroll<HTMLDivElement>()

  if (!loading && channels.length === 0) return <></>

  const maskImage = canScrollLeft
    ? 'linear-gradient(to right, transparent 0, #000 48px, #000 calc(100% - 64px), transparent 100%)'
    : 'linear-gradient(to right, #000 0, #000 calc(100% - 64px), transparent 100%)'

  return (
    <section
      className={cn('relative', className)}
      aria-labelledby={`row-${title.replace(/\s+/g, '-').toLowerCase()}`}
    >
      <header className="mb-4 flex items-center justify-between gap-6 px-[var(--gutter)]">
        <div className="min-w-0">
          <h2
            id={`row-${title.replace(/\s+/g, '-').toLowerCase()}`}
            className="text-[20px] font-[600] tracking-[-0.01em] text-[#F4F4F5]"
          >
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-[12px] font-[450] text-[#A1A1A6]">{subtitle}</p>
          ) : null}
        </div>
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
              'flex h-8 w-8 items-center justify-center rounded-[8px] text-[#A1A1A6] transition-all duration-[120ms]',
              'hover:bg-white/[0.06] hover:text-[#F4F4F5]',
              !canScrollLeft && 'pointer-events-none opacity-0'
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
              'flex h-8 w-8 items-center justify-center rounded-[8px] text-[#A1A1A6] transition-all duration-[120ms]',
              'hover:bg-white/[0.06] hover:text-[#F4F4F5]',
              !canScrollRight && 'pointer-events-none opacity-0'
            )}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div
        ref={ref}
        onWheel={onWheel}
        className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-[var(--gutter)] pb-6 pt-1 scroll-px-[var(--gutter)]"
        style={{
          maskImage,
          WebkitMaskImage: maskImage
        }}
      >
        {loading
          ? Array.from({ length: 6 }).map((_, index) => (
              <ChannelCardSkeleton key={index} />
            ))
          : channels.map((channel) => (
              <div key={channel.id} className="shrink-0 snap-start">
                <ChannelCard channel={channel} programs={epg[channel.id]} />
              </div>
            ))}
      </div>
    </section>
  )
}
