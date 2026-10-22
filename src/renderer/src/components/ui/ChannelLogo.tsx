import { memo, useState } from 'react'
import { cn } from '@/lib/cn'
import { initials } from '@/lib/color'
import { useRelayStore } from '@/store/useRelayStore'
import type { Channel } from '@shared/types'

const sizeMap = {
  xs:   { box: 'h-7 w-7 rounded-[6px] text-[9px]' },
  sm:   { box: 'h-9 w-9 rounded-[8px] text-[10px]' },
  md:   { box: 'h-11 w-11 rounded-[8px] text-[12px]' },
  lg:   { box: 'h-24 w-24 rounded-[12px] text-[22px]' },
  xl:   { box: 'h-28 w-28 rounded-[12px] text-[26px]' },
  hero: { box: 'h-40 w-40 rounded-[16px] text-[40px]' }
} as const

interface ChannelLogoProps {
  channel: Channel
  size?: keyof typeof sizeMap
  className?: string
  /** @deprecated — kept for API compat */
  glow?: boolean
}

/**
 * Renders the channel logo fetched via the local relay proxy (bypasses CDN CORS).
 * Falls back to a neutral monogram on error or if the logo URL is absent.
 */
export const ChannelLogo = memo(function ChannelLogo({
  channel,
  size = 'md',
  className
}: ChannelLogoProps) {
  const { box } = sizeMap[size]
  const logoProxyUrl = useRelayStore((s) => s.logoProxyUrl)
  const [failed, setFailed] = useState(false)

  const src = channel.logoUrl ? logoProxyUrl(channel.logoUrl) : ''

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={`${channel.name} logo`}
        loading="lazy"
        className={cn(
          'object-contain transition-opacity duration-300',
          box,
          className
        )}
        onError={() => setFailed(true)}
      />
    )
  }

  // Neutral monogram fallback
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center',
        'bg-[#18181B] text-[#A1A1A6] font-[700] tracking-wide',
        box,
        className
      )}
    >
      {initials(channel.name)}
    </span>
  )
})
