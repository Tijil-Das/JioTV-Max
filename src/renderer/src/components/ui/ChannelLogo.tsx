import { memo } from 'react'
import { cn } from '@/lib/cn'
import { initials } from '@/lib/color'
import type { Channel } from '@shared/types'

const sizeMap = {
  xs:   { box: 'h-7 w-7 rounded-[6px] text-[9px]' },
  sm:   { box: 'h-9 w-9 rounded-[8px] text-[10px]' },
  md:   { box: 'h-11 w-11 rounded-[8px] text-[12px]' },
  // Used in cards — ~50% of tile width means we let the parent control width
  lg:   { box: 'h-24 w-24 rounded-[12px] text-[22px]' },
  xl:   { box: 'h-28 w-28 rounded-[12px] text-[26px]' },
  // Used in the hero — large centered logo
  hero: { box: 'h-40 w-40 rounded-[16px] text-[40px]' }
} as const

interface ChannelLogoProps {
  channel: Channel
  size?: keyof typeof sizeMap
  className?: string
  /** @deprecated — glow removed; kept for API compat */
  glow?: boolean
}

/**
 * Real logo via <img> (object-contain, fade in after load).
 * Fallback: monogram in text-2 on surface-3. No brand-color tint or glow.
 */
export const ChannelLogo = memo(function ChannelLogo({
  channel,
  size = 'md',
  className
}: ChannelLogoProps) {
  const { box } = sizeMap[size]

  if (channel.logoUrl) {
    return (
      <img
        src={channel.logoUrl}
        alt={`${channel.name} logo`}
        loading="lazy"
        className={cn('object-contain', box, className)}
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
      />
    )
  }

  // Fallback monogram — neutral, no color
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
