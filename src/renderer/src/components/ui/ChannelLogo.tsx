import { memo } from 'react'
import { cn } from '@/lib/cn'
import { hexToRgba, initials } from '@/lib/color'
import type { Channel } from '@shared/types'

const sizeMap = {
  xs: { box: 'h-7 w-7 rounded-md text-[9px]', ring: 'ring-1' },
  sm: { box: 'h-9 w-9 rounded-lg text-[10px]', ring: 'ring-1' },
  md: { box: 'h-11 w-11 rounded-xl text-[12px]', ring: 'ring-1' },
  lg: { box: 'h-14 w-14 rounded-2xl text-[15px]', ring: 'ring-1' },
  xl: { box: 'h-20 w-20 rounded-[22px] text-[22px]', ring: 'ring-1' }
} as const

interface ChannelLogoProps {
  channel: Channel
  size?: keyof typeof sizeMap
  className?: string
  glow?: boolean
}

/**
 * Real JioTV logo when available; otherwise a brand-tinted monogram so the UI
 * never shows a broken image icon.
 */
export const ChannelLogo = memo(function ChannelLogo({
  channel,
  size = 'md',
  className,
  glow = false
}: ChannelLogoProps) {
  const dimensions = sizeMap[size]
  const style = {
    background: `linear-gradient(145deg, ${hexToRgba(channel.brandColor, 0.34)}, rgba(12,12,18,.9) 70%)`,
    borderColor: hexToRgba(channel.brandColor, 0.4),
    color: '#fff',
    boxShadow: glow ? `0 0 26px ${hexToRgba(channel.brandColor, 0.35)}` : undefined
  }

  if (channel.logoUrl) {
    return (
      <img
        src={channel.logoUrl}
        alt={`${channel.name} logo`}
        loading="lazy"
        className={cn('object-contain', dimensions.box, className)}
        onError={(event) => {
          event.currentTarget.style.display = 'none'
        }}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      style={style}
      className={cn(
        'flex shrink-0 items-center justify-center border font-display font-bold tracking-wide',
        dimensions.box,
        dimensions.ring,
        className
      )}
    >
      {initials(channel.name)}
    </span>
  )
})
