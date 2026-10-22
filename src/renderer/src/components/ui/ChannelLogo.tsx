import { memo, useEffect, useRef, useState } from 'react'
import type { Channel } from '@shared/types'
import { cn } from '@/lib/cn'
import { initials } from '@/lib/color'
import { useProcessedLogo } from '@/hooks/useProcessedLogo'
import { getLogoBox } from '@/lib/logo/logoService'

export type LogoSizeVariant =
  | 'tile'
  | 'cell'
  | 'switcher'
  | 'bug'
  | 'hero'
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'

interface ChannelLogoProps {
  channel: Channel
  size?: LogoSizeVariant
  className?: string
  /** Force early processing for above-the-fold artwork (hero, dev sheet). */
  priority?: 'visible' | 'idle'
  /** Pipeline area factor: 0.22 for tiles, 0.30 for list/switcher cells. */
  areaFactor?: number
  /** @deprecated kept for API compatibility */
  glow?: boolean
  /** @deprecated kept for API compatibility */
  metrics?: unknown
}

const monogramSize: Record<LogoSizeVariant, string> = {
  tile: 'text-[28px]',
  cell: 'text-[18px]',
  switcher: 'text-[18px]',
  bug: 'text-[12px]',
  hero: 'text-[28px]',
  xs: 'text-[12px]',
  sm: 'text-[14px]',
  md: 'text-[18px]',
  lg: 'text-[24px]',
  xl: 'text-[28px]'
}

function areaFor(size: LogoSizeVariant, explicit?: number): number {
  if (explicit !== undefined) return explicit
  if (size === 'cell' || size === 'switcher') return 0.3
  return 0.22
}

/**
 * Channel mark presentation (Addendum 3 §2/§3).
 *
 * The processed PNG is always rendered in a plain <img>. No filters, blend
 * modes or backgrounds touch it. Geometry comes from the pipeline's normalized
 * bbox and luminance centroid, expressed as percentages of the tile.
 */
export const ChannelLogo = memo(function ChannelLogo({
  channel,
  size = 'tile',
  className,
  priority = 'idle',
  areaFactor,
  glow: _glow,
  metrics: _metrics
}: ChannelLogoProps): JSX.Element {
  const hostRef = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(priority === 'visible')
  const { logo, loading } = useProcessedLogo(
    channel,
    priority === 'visible' || visible ? 'visible' : 'idle'
  )
  const [faded, setFaded] = useState(false)

  useEffect(() => {
    if (priority === 'visible' || !hostRef.current) return
    const element = hostRef.current
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '160px 0px' }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [priority])

  useEffect(() => {
    if (!logo || !logo.objectUrl) {
      setFaded(false)
      return
    }
    const frame = requestAnimationFrame(() => setFaded(true))
    return () => cancelAnimationFrame(frame)
  }, [logo])

  const showMonogram = !loading && (!logo || logo.tier === 'monogram' || !logo.objectUrl)
  const isHero = size === 'hero'
  const box = logo?.spec && !isHero ? getLogoBox(logo.spec, areaFor(size, areaFactor), 100) : null

  return (
    <span
      ref={hostRef}
      aria-hidden="true"
      className={cn('relative flex h-full w-full items-center justify-center select-none', className)}
    >
      {loading ? (
        <span className="shimmer-plate absolute inset-0 rounded-[inherit] bg-white/[0.025]" />
      ) : null}

      {showMonogram ? (
        <span
          className={cn(
            'pointer-events-none font-sans font-[600] leading-none text-[#A1A1A6]',
            monogramSize[size]
          )}
        >
          {initials(channel.name)}
        </span>
      ) : null}

      {!showMonogram && logo?.objectUrl ? (
        isHero ? (
          <img
            src={logo.objectUrl}
            alt=""
            draggable={false}
            className="pointer-events-none block h-auto w-auto max-h-[120px] max-w-[280px] object-contain"
            style={{ opacity: faded ? 1 : 0, transition: 'opacity 300ms ease' }}
          />
        ) : box ? (
          <img
            src={logo.objectUrl}
            alt=""
            draggable={false}
            className="pointer-events-none absolute block object-contain"
            style={{
              left: `${50 + box.offsetXRatio * 100}%`,
              top: `${50 + box.offsetYRatio * 100}%`,
              width: `${box.widthRatio * 100}%`,
              height: `${box.heightRatio * 100}%`,
              transform: 'translate(-50%, -50%)',
              opacity: faded ? 1 : 0,
              transition: 'opacity 300ms ease'
            }}
          />
        ) : null
      ) : null}
    </span>
  )
})

/**
 * 56 × 56 list/drawer/switcher cell (Addendum 3 §4). Same plate recipe as the
 * tile, radius 12, pipeline area factor 0.30.
 */
export const ChannelLogoCell = memo(function ChannelLogoCell({
  channel,
  className,
  priority = 'idle'
}: {
  channel: Channel
  className?: string
  priority?: 'visible' | 'idle'
}): JSX.Element {
  return (
    <span
      className={cn(
        'relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[12px]',
        'border border-[rgba(255,255,255,0.07)] bg-[#0E0E10]',
        className
      )}
    >
      <ChannelLogo
        channel={channel}
        size="cell"
        areaFactor={0.3}
        priority={priority}
        className="h-full w-full"
      />
    </span>
  )
})
