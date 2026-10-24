import { cn } from '@/lib/cn'

interface LiveBadgeProps {
  label?: string
  size?: 'sm' | 'md'
  className?: string
  style?: React.CSSProperties
}

/**
 * LIVE badge: solid red, white dot that pulses.
 * 20px height, 4px radius, 10px/700 uppercase with 0.08em tracking.
 */
export function LiveBadge({ label = 'LIVE', size = 'sm', className, style }: LiveBadgeProps): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[5px] rounded-[4px] bg-[#E11D2E] font-[700] uppercase tracking-[0.08em] text-white',
        size === 'sm' ? 'h-5 px-[6px] text-[12px]' : 'h-[22px] px-2 text-[12px]',
        className
      )}
      style={style}
    >
      <span className="live-dot" aria-hidden />
      {label}
    </span>
  )
}

export function QualityBadge({
  quality,
  className
}: {
  quality: string
  className?: string
}): JSX.Element | null {
  if (!quality) return null
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[4px] border border-white/[0.14] bg-black/60 ' +
          'px-[6px] h-5 text-[12px] font-[600] uppercase tracking-[0.06em] text-[#F4F4F5]',
        className
      )}
    >
      {quality}
    </span>
  )
}
