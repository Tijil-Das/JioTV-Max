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
 * Square plate skeleton (Addendum 3 §3): shimmer only, no fake logo shape.
 */
export function ChannelCardSkeleton({ fluid = false }: { fluid?: boolean }): JSX.Element {
  return (
    <div
      className={cn(
        'select-none space-y-2',
        fluid ? 'w-full' : 'w-[clamp(128px,10.5vw,160px)] shrink-0'
      )}
      aria-hidden
    >
      <div className="aspect-square w-full rounded-[16px] border border-[rgba(255,255,255,0.07)] bg-[#0E0E10] shimmer-plate" />
      <div className="space-y-1.5 px-0.5">
        <div className="h-3.5 w-3/4 rounded-full bg-white/[0.06]" />
        <div className="h-2.5 w-1/2 rounded-full bg-white/[0.035]" />
      </div>
    </div>
  )
}

export function RowSkeleton({ count = 6 }: { count?: number }): JSX.Element {
  return (
    <div
      className="flex gap-4 overflow-hidden px-[var(--gutter)] pb-6 pt-1"
      aria-hidden
    >
      {Array.from({ length: count }).map((_, i) => (
        <ChannelCardSkeleton key={i} />
      ))}
    </div>
  )
}
