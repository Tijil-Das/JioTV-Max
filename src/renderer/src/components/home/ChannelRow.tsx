import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Channel, Program } from '@shared/types'
import { cn } from '@/lib/cn'
import { useRowScroll } from '@/hooks/useRowScroll'
import { ChannelCard } from './ChannelCard'
import { ChannelCardSkeleton } from '@/components/ui/Skeleton'

interface ChannelRowProps {
  title: string
  /** @deprecated Addendum 4 §6a: No row subtitles anywhere. */
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
 * Addendum 4 §6 — Home row presentation & content hygiene:
 * a) No row subtitles anywhere.
 * b) Header: title on the left; "View all" followed by chevrons grouped on the right.
 *    Chevrons show only when the row can scroll, and the left chevron is hidden at scrollLeft 0.
 * d) Full-bleed scroller with padding-inline: var(--gutter) (48px) and equal scroll-padding.
 *    Gap 16px. Left mask fade only appears when scrollLeft > 0.
 */
export function ChannelRow({
  title,
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

  const canScroll = canScrollLeft || canScrollRight
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
          {canScroll ? (
            <>
              {canScrollLeft ? (
                <button
                  aria-label={`Scroll ${title} left`}
                  type="button"
                  onClick={() => scrollByPage(-1)}
                  className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#A1A1A6] transition-all duration-[120ms] hover:bg-white/[0.06] hover:text-[#F4F4F5]"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              ) : null}
              {canScrollRight ? (
                <button
                  aria-label={`Scroll ${title} right`}
                  type="button"
                  onClick={() => scrollByPage(1)}
                  className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#A1A1A6] transition-all duration-[120ms] hover:bg-white/[0.06] hover:text-[#F4F4F5]"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : null}
            </>
          ) : null}
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
