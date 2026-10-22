import { memo, useEffect, useState } from 'react'
import type { Channel } from '@shared/types'
import { cn } from '@/lib/cn'
import { initials } from '@/lib/color'
import { useRelayStore } from '@/store/useRelayStore'
import { useLogoMetrics, type CachedLogoMetrics, getLogoMetricsSync } from '@/lib/logoMetrics'

export type LogoSizeVariant =
  | 'tile'
  | 'cell'
  | 'bug'
  | 'hero'
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'

const legacyBoxMap = {
  xs: { box: 'h-7 w-7 text-[10px]' },
  sm: { box: 'h-9 w-9 text-[11px]' },
  md: { box: 'h-11 w-11 text-[13px]' },
  lg: { box: 'h-24 w-24 text-[24px]' },
  xl: { box: 'h-28 w-28 text-[28px]' }
} as const

interface ChannelLogoProps {
  channel: Channel
  size?: LogoSizeVariant
  className?: string
  /** Optional pre-resolved metrics to avoid duplicate hook lookups */
  metrics?: CachedLogoMetrics | null
  /** @deprecated — kept for API compatibility */
  glow?: boolean
}

/**
 * Normalized channel brand mark presentation.
 * - Trims transparent padding to true bounding box via SVG viewBox
 * - Aspect ratio normalization: wide wordmarks and tall emblems feel equal in visual weight
 * - Density compensation & light-on-dark irradiation scaling
 * - Center-of-mass visual translation
 * - Upscaling cap (1.5x max, 1x if under 120px)
 * - Shimmering plate during load (opacity only)
 * - 300ms fade-in once normalized
 * - Monogram fallback (Inter 600, text-2) on error or missing source
 */
export const ChannelLogo = memo(function ChannelLogo({
  channel,
  size = 'tile',
  className,
  metrics: externalMetrics
}: ChannelLogoProps) {
  const logoProxyUrl = useRelayStore((s) => s.logoProxyUrl)
  const rawSrc = channel.logoUrl ? logoProxyUrl(channel.logoUrl) : ''

  const hookResult = useLogoMetrics(rawSrc)
  const metrics = externalMetrics ?? hookResult.metrics
  const loading = !externalMetrics && hookResult.loading
  const error = !rawSrc || (!externalMetrics && hookResult.error)

  const [ready, setReady] = useState<boolean>(() => {
    // If metrics were already in memory cache at mount time, show immediately
    return Boolean(externalMetrics || getLogoMetricsSync(rawSrc))
  })

  useEffect(() => {
    if (metrics) {
      // Fade in smoothly over 300ms once normalized metrics are available
      const id = requestAnimationFrame(() => setReady(true))
      return () => cancelAnimationFrame(id)
    }
    setReady(false)
    return undefined
  }, [metrics])

  // Broken or missing logo: clean monogram fallback centered on the plate
  if (error || (!metrics && !loading)) {
    const fallbackFontSize =
      size === 'bug'
        ? 'text-[11px]'
        : size === 'cell'
          ? 'text-[13px]'
          : size === 'hero'
            ? 'text-[36px]'
            : size in legacyBoxMap
              ? legacyBoxMap[size as keyof typeof legacyBoxMap].box.split(' ').pop()
              : 'text-[18px]'

    return (
      <span
        aria-hidden="true"
        className={cn(
          'flex h-full w-full items-center justify-center font-sans font-[600] text-[#A1A1A6] select-none',
          fallbackFontSize,
          className
        )}
      >
        {initials(channel.name)}
      </span>
    )
  }

  // Shimmer plate while measuring pixels (1.4s opacity only, no placeholder logo shape)
  if (loading && !metrics) {
    return (
      <div
        className={cn('shimmer-plate h-full w-full bg-white/[0.04]', className)}
        aria-hidden="true"
      />
    )
  }

  if (!metrics) return null

  const { bbox, nativeWidth, nativeHeight, shiftXPercent, shiftYPercent, widthPercent } = metrics

  // Upscaling cap: if source under 120px wide, show at native size; else cap at 1.5x
  const maxPxWidth =
    bbox.width < 120
      ? `${bbox.width}px`
      : `${Math.round(bbox.width * 1.5)}px`

  // Sizing styles per variant
  let containerStyle: React.CSSProperties = {}
  let outerClass = 'relative flex items-center justify-center w-full h-full'

  if (size === 'tile') {
    // Standard 4:3 card plate: normalized width (40% - 68%), max 72% height
    containerStyle = {
      width: `${widthPercent}%`,
      aspectRatio: `${bbox.width} / ${bbox.height}`,
      maxWidth: maxPxWidth,
      maxHeight: '72%'
    }
  } else if (size === 'cell') {
    // 72x40px guide/list row logo cell with 6px padding inside
    containerStyle = {
      maxWidth: '60px',
      maxHeight: '28px',
      aspectRatio: `${bbox.width} / ${bbox.height}`,
      width: '100%',
      height: '100%'
    }
  } else if (size === 'bug') {
    // Artwork corner bug: max 28px tall, sitting inside scrim chip
    containerStyle = {
      maxHeight: '24px',
      maxWidth: '64px',
      aspectRatio: `${bbox.width} / ${bbox.height}`,
      width: 'auto',
      height: '24px'
    }
  } else if (size === 'hero') {
    containerStyle = {
      maxWidth: '380px',
      maxHeight: '160px',
      aspectRatio: `${bbox.width} / ${bbox.height}`,
      width: `${Math.min(70, widthPercent * 1.1)}%`,
      height: 'auto'
    }
  } else if (size in legacyBoxMap) {
    const { box } = legacyBoxMap[size as keyof typeof legacyBoxMap]
    outerClass = cn('relative flex items-center justify-center', box)
    containerStyle = {
      maxWidth: '85%',
      maxHeight: '85%',
      aspectRatio: `${bbox.width} / ${bbox.height}`,
      width: '100%',
      height: '100%'
    }
  }

  return (
    <div className={cn(outerClass, className)}>
      <div
        className={cn(
          'relative flex items-center justify-center transition-opacity duration-300 pointer-events-none select-none',
          ready ? 'opacity-100' : 'opacity-0'
        )}
        style={containerStyle}
      >
        <svg
          viewBox={`${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`}
          className="h-full w-full overflow-visible"
          style={{
            transform: `translate(${shiftXPercent}%, ${shiftYPercent}%)`,
            transformOrigin: 'center center'
          }}
          aria-hidden="true"
        >
          <image
            href={rawSrc}
            xlinkHref={rawSrc}
            width={nativeWidth}
            height={nativeHeight}
            preserveAspectRatio="none"
          />
        </svg>
      </div>
    </div>
  )
})

/**
 * Fixed 72 x 40px logo cell for guide and list rows (Section 5).
 * - surface-2 plate (#111113), 8px radius, 6px padding inside
 * - Switches to light plate (#E9E9EC) for dark logos
 * - All logo cells share identical dimensions across the column
 */
export const ChannelLogoCell = memo(function ChannelLogoCell({
  channel,
  className
}: {
  channel: Channel
  className?: string
}): JSX.Element {
  const logoProxyUrl = useRelayStore((s) => s.logoProxyUrl)
  const rawSrc = channel.logoUrl ? logoProxyUrl(channel.logoUrl) : ''
  const { metrics } = useLogoMetrics(rawSrc)
  const useLightPlate = Boolean(metrics?.useLightPlate)

  return (
    <div
      className={cn(
        'relative flex h-[40px] w-[72px] shrink-0 items-center justify-center rounded-[8px] p-1.5 transition-colors duration-150',
        useLightPlate
          ? 'bg-[#E9E9EC] border border-[rgba(0,0,0,0.08)]'
          : 'bg-[#111113] border border-[rgba(255,255,255,0.07)]',
        className
      )}
    >
      <ChannelLogo channel={channel} size="cell" metrics={metrics} />
    </div>
  )
})

