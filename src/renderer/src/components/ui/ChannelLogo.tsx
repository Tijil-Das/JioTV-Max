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
  /** Optional pre-resolved metrics to avoid duplicate lookups */
  metrics?: CachedLogoMetrics | null
  /** @deprecated — kept for API compatibility */
  glow?: boolean
}

/**
 * Normalized channel brand mark presentation (Addendum 2).
 * - Processed tiers: as-is (L >= 0.30), white knockout (L < 0.30 & S < 0.25), neutral halo (L < 0.30 & S >= 0.25)
 * - Transparent bounding box trimming via SVG viewBox
 * - Visual center of mass translation offset
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
    return Boolean(externalMetrics || getLogoMetricsSync(rawSrc))
  })

  useEffect(() => {
    if (metrics) {
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

  const { bbox, nativeWidth, nativeHeight, shiftXPercent, shiftYPercent, processedSrc, tier } =
    metrics

  // Upscaling cap: if source under 120px wide, show at native size; else cap at 1.5x
  const maxPxWidth =
    bbox.width < 120 ? `${bbox.width}px` : `${Math.round(bbox.width * 1.5)}px`

  // Sizing styles per variant
  let containerStyle: React.CSSProperties = {}
  let outerClass = 'relative flex items-center justify-center w-full h-full'

  if (size === 'tile') {
    // Addendum 2 Section 1: Logo box is 56% of plate width by 38% of plate height
    containerStyle = {
      width: '56%',
      height: '38%',
      maxWidth: maxPxWidth,
      maxHeight: '38%'
    }
  } else if (size === 'cell') {
    // 64x44px cell with 6px padding inside (Section 4)
    containerStyle = {
      maxWidth: '52px',
      maxHeight: '32px',
      width: '100%',
      height: '100%'
    }
  } else if (size === 'bug') {
    // Artwork corner bug: max 24px tall (Section 5)
    containerStyle = {
      maxHeight: '24px',
      maxWidth: '56px',
      width: 'auto',
      height: '24px'
    }
  } else if (size === 'hero') {
    containerStyle = {
      maxWidth: '380px',
      maxHeight: '160px',
      width: '60%',
      height: 'auto'
    }
  } else if (size in legacyBoxMap) {
    const { box } = legacyBoxMap[size as keyof typeof legacyBoxMap]
    outerClass = cn('relative flex items-center justify-center', box)
    containerStyle = {
      maxWidth: '85%',
      maxHeight: '85%',
      width: '100%',
      height: '100%'
    }
  }

  return (
    <div className={cn(outerClass, className)}>
      {/* Tier 3 Neutral Halo: circle at 70% of logo box, rgba(255,255,255,0.06), blurred 24px */}
      {tier === 'neutral-halo' ? (
        <span
          className="pointer-events-none absolute h-[70%] w-[70%] rounded-full bg-white/[0.06] blur-[24px]"
          aria-hidden="true"
        />
      ) : null}

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
            href={processedSrc || rawSrc}
            xlinkHref={processedSrc || rawSrc}
            width={nativeWidth}
            height={nativeHeight}
            preserveAspectRatio="xMidYMid meet"
          />
        </svg>
      </div>
    </div>
  )
})

/**
 * Fixed 64 x 44px logo cell for guide and list rows (Addendum 2 Section 4).
 * - Plate recipe: #0C0C0E fill, hairline border, 8px radius, 6px inner padding
 * - Absolutely no white or light cells anywhere
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

  return (
    <div
      className={cn(
        'relative flex h-[44px] w-[64px] shrink-0 items-center justify-center rounded-[8px] p-1.5 transition-colors duration-150',
        'bg-[#0C0C0E] border border-[rgba(255,255,255,0.06)]',
        className
      )}
    >
      <ChannelLogo channel={channel} size="cell" metrics={metrics} />
    </div>
  )
})
