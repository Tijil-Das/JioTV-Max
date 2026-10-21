import { cn } from '@/lib/cn'

export function Skeleton({ className }: { className?: string }): JSX.Element {
  return <div className={cn('shimmer-surface rounded-xl bg-white/[0.05]', className)} aria-hidden />
}

export function ChannelCardSkeleton(): JSX.Element {
  return (
    <div className="w-[260px] shrink-0 space-y-3" aria-hidden>
      <Skeleton className="aspect-video w-full rounded-2xl" />
      <div className="flex items-center gap-3 px-1">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-2/3 rounded-full" />
          <Skeleton className="h-2.5 w-1/2 rounded-full" />
        </div>
      </div>
    </div>
  )
}

export function RowSkeleton({ count = 5 }: { count?: number }): JSX.Element {
  return (
    <div className="flex gap-5 overflow-hidden px-8" aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <ChannelCardSkeleton key={index} />
      ))}
    </div>
  )
}
