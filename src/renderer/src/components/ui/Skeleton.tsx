import { cn } from '@/lib/cn'

export function Skeleton({ className }: { className?: string }): JSX.Element {
  return (
    <div
      className={cn('shimmer-surface rounded-[12px] bg-[#111113]', className)}
      aria-hidden
    />
  )
}

/**
 * 4:3 shimmering plate skeleton per section 7:
 * "Loading: a shimmering plate (1.4s, opacity only) with no placeholder logo shape."
 */
export function ChannelCardSkeleton({ fluid = false }: { fluid?: boolean }): JSX.Element {
  return (
    <div
      className={cn(
        'select-none space-y-2.5',
        fluid ? 'w-full' : 'w-[clamp(168px,14vw,220px)] shrink-0'
      )}
      aria-hidden
    >
      {/* 4:3 plate with 1.4s opacity-only shimmer and no fake logo shape */}
      <div className="aspect-[4/3] w-full rounded-[12px] border border-[rgba(255,255,255,0.07)] bg-[#111113] shimmer-plate" />
      {/* Meta lines below plate */}
      <div className="space-y-1.5 px-0.5">
        <div className="h-3.5 w-3/4 rounded-full bg-white/[0.06]" />
        <div className="h-2.5 w-1/2 rounded-full bg-white/[0.035]" />
      </div>
    </div>
  )
}

export function RowSkeleton({ count = 6 }: { count?: number }): JSX.Element {
  return (
    <div className="flex gap-4 overflow-hidden px-12 pb-6 pt-1" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <ChannelCardSkeleton key={i} />
      ))}
    </div>
  )
}
