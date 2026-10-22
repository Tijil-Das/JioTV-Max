import { cn } from '@/lib/cn'

export function Skeleton({ className }: { className?: string }): JSX.Element {
  return (
    <div
      className={cn('shimmer-surface rounded-[12px] bg-[#111113]', className)}
      aria-hidden
    />
  )
}

export function ChannelCardSkeleton(): JSX.Element {
  return (
    <div className="w-[256px] shrink-0 space-y-3" aria-hidden>
      <Skeleton className="w-full aspect-[16/10] rounded-[12px]" />
      <div className="space-y-2 px-0.5">
        <Skeleton className="h-3.5 w-2/3 rounded-full" />
        <Skeleton className="h-3 w-1/2 rounded-full" />
      </div>
    </div>
  )
}

export function RowSkeleton({ count = 5 }: { count?: number }): JSX.Element {
  return (
    <div className="flex gap-4 overflow-hidden px-12" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <ChannelCardSkeleton key={i} />
      ))}
    </div>
  )
}
