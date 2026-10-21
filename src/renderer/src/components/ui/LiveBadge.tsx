import { cn } from '@/lib/cn'

interface LiveBadgeProps {
  label?: string
  size?: 'sm' | 'md'
  className?: string
  tone?: 'live' | 'accent' | 'neutral'
}

/** Small pulsing badge used on cards, the hero and the player. */
export function LiveBadge({
  label = 'LIVE',
  size = 'sm',
  tone = 'live',
  className
}: LiveBadgeProps): JSX.Element {
  const tones = {
    live: 'bg-live text-white',
    accent: 'bg-accent text-white',
    neutral: 'bg-white/15 text-white backdrop-blur-md'
  } as const

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill font-semibold uppercase tracking-[0.12em]',
        size === 'sm' ? 'px-2 py-[3px] text-[9px]' : 'px-2.5 py-1 text-[10px]',
        tones[tone],
        className
      )}
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
}): JSX.Element {
  return (
    <span
      className={cn(
        'rounded-pill border border-white/15 bg-black/45 px-2 py-[3px] text-[9px] font-semibold uppercase tracking-[0.12em] text-white/90 backdrop-blur-md',
        className
      )}
    >
      {quality}
    </span>
  )
}
