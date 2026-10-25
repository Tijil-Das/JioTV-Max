import { memo, useEffect, useRef, useState } from 'react'
import type { Channel } from '@shared/types'
import { cn } from '@/lib/cn'
import { initials } from '@/lib/color'
import { useProcessedLogo } from '@/hooks/useProcessedLogo'
import { useChannelStore } from '@/store/useChannelStore'

export type ChannelLogoContext =
  | 'tile'
  | 'cell'
  | 'switcher'
  | 'hero'
  | 'banner'

export type LogoSizeVariant =
  | ChannelLogoContext
  | 'bug'
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'

export interface ChannelLogoProps {
  channelId?: string
  channel?: Channel
  context?: ChannelLogoContext
  size?: LogoSizeVariant
  className?: string
  style?: React.CSSProperties
  /** Force early processing for above-the-fold artwork (hero, dev sheet). */
  priority?: 'visible' | 'idle'
  /** Explicit override for pipeline area factor (0.30 for tiles, 0.38 for cells). */
  areaFactor?: number
  /** @deprecated kept for API compatibility */
  glow?: boolean
  /** @deprecated kept for API compatibility */
  metrics?: unknown
}

const monogramSize: Record<string, string> = {
  tile: 'text-[28px]',
  cell: 'text-[18px]',
  switcher: 'text-[18px]',
  bug: 'text-[12px]',
  hero: 'text-[28px]',
  banner: 'text-[20px]',
  xs: 'text-[12px]',
  sm: 'text-[14px]',
  md: 'text-[18px]',
  lg: 'text-[24px]',
  xl: 'text-[28px]'
}

function resolveContext(
  context?: ChannelLogoContext,
  size?: LogoSizeVariant
): ChannelLogoContext {
  if (context) return context
  if (size === 'cell' || size === 'switcher' || size === 'hero' || size === 'banner') {
    return size
  }
  if (size === 'sm' || size === 'md') return 'cell'
  if (size === 'lg' || size === 'xl') return 'banner'
  return 'tile'
}

/**
 * Addendum 4 §2 — One component everywhere:
 * Use a single <ChannelLogo channelId context> for tiles, list rows, search
 * results, the guide column, the channel drawer, the hero switcher, the hero,
 * and the player banner. Never render a logo <img> anywhere else.
 *
 * | context | box | area factor |
 * | tile | tile size | 0.30 |
 * | list / search / guide / drawer cell | 56x56 | 0.38 |
 * | hero switcher plate | 56x56 | 0.38 |
 * | hero logo | no plate, max height 40px, max width 180px | n/a |
 * | player banner | max height 40px | n/a |
 */
export const ChannelLogo = memo(function ChannelLogo({
  channelId,
  channel: directChannel,
  context: rawContext,
  size,
  className,
  style,
  priority = 'idle',
  areaFactor: explicitAreaFactor,
  glow: _glow,
  metrics: _metrics
}: ChannelLogoProps): JSX.Element {
  const storeChannel = useChannelStore((state) =>
    channelId ? state.channels.find((c) => c.id === channelId) : undefined
  )
  const channel = directChannel ?? storeChannel

  const context = resolveContext(rawContext, size)
  const isCell = context === 'cell' || context === 'switcher'
  const isHero = context === 'hero'
  const isBanner = context === 'banner'

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

  // Inner logo content
  const content = (
    <span
      ref={hostRef}
      aria-hidden="true"
      className={cn(
        'relative flex h-full w-full items-center justify-center select-none',
        !isCell && className
      )}
    >
      {loading ? (
        <span className="shimmer-plate absolute inset-0 rounded-[inherit] bg-white/[0.025]" />
      ) : null}

      {showMonogram ? (
        <span
          className={cn(
            'pointer-events-none font-sans font-[600] leading-none text-[#A1A1A6]',
            monogramSize[context] ?? monogramSize.tile
          )}
        >
          {initials(channel?.name ?? channelId ?? 'TV')}
        </span>
      ) : null}

      {!showMonogram && logo?.objectUrl ? (
        isHero ? (
          <img
            src={logo.objectUrl}
            alt=""
            draggable={false}
            decoding="async"
            className="pointer-events-none block h-auto w-auto max-h-[40px] max-w-[180px] object-contain"
            style={{
              imageRendering: 'auto',
              filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.85))',
              opacity: faded ? 1 : 0,
              transition: 'opacity 300ms ease'
            }}
          />
        ) : isBanner ? (
          <img
            src={logo.objectUrl}
            alt=""
            draggable={false}
            decoding="async"
            className="pointer-events-none block h-auto w-auto max-h-[40px] object-contain"
            style={{
              imageRendering: 'auto',
              opacity: faded ? 1 : 0,
              transition: 'opacity 300ms ease'
            }}
          />
        ) : (
          <img
            src={logo.objectUrl}
            alt=""
            draggable={false}
            decoding="async"
            className="pointer-events-none block h-full w-full object-contain object-center"
            style={{
              imageRendering: 'auto',
              opacity: faded ? 1 : 0,
              transition: 'opacity 300ms ease'
            }}
          />
        )
      ) : null}
    </span>
  )

  // Context "cell" and "switcher": 56 × 56 plate with safe-zone padding and uniform static plate
  if (isCell) {
    return (
      <span
        style={style}
        className={cn(
          'relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[12px] p-2 border border-[rgba(255,255,255,0.07)] bg-[#0E0E10]',
          className
        )}
      >
        {content}
      </span>
    )
  }

  return content
})

/** Backward-compatible alias for 56 × 56 cell plate. */
export const ChannelLogoCell = memo(function ChannelLogoCell(props: ChannelLogoProps): JSX.Element {
  return <ChannelLogo {...props} context="cell" />
})
