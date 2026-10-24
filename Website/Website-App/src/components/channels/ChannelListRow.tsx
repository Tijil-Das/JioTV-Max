import { memo, useMemo } from 'react'
import type { Channel, Program } from '@shared/types'
import { cn } from '@/lib/cn'
import { highestQuality } from '@/lib/constants'
import { getNowNext } from '@/lib/time'
import { useNow } from '@/hooks/useNow'
import { ChannelLogo } from '@/components/ui/ChannelLogo'

interface ChannelListRowProps {
  channel: Channel
  programs?: Program[]
  selected?: boolean
  onClick?: () => void
  className?: string
  trailing?: React.ReactNode
}

/**
 * Addendum 3 §4 — 56px list row for search, guide and the player drawer.
 * Number column 44px, 56×56 logo cell, then channel name over the current
 * EPG title (or Language · Quality). Selected rows get a red left rule.
 */
export const ChannelListRow = memo(function ChannelListRow({
  channel,
  programs,
  selected = false,
  onClick,
  className,
  trailing
}: ChannelListRowProps): JSX.Element {
  const now = useNow()
  const current = useMemo(() => getNowNext(programs ?? [], now).current, [programs, now])
  const quality = highestQuality(channel)
  const secondary = [channel.language, quality].filter(Boolean).join(' · ')

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'relative flex h-16 w-full items-center gap-3 overflow-hidden rounded-[10px] px-3 py-1 text-left transition-colors duration-150',
        selected ? 'bg-[rgba(255,255,255,0.06)]' : 'hover:bg-white/[0.035]',
        className
      )}
    >
      {selected ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-1.5 left-0 w-[2px] rounded-r bg-[var(--red-line)]"
        />
      ) : null}
      <span className="w-11 shrink-0 text-right text-[14px] font-[600] tabular-nums leading-none text-[#A1A1A6]">
        {channel.number}
      </span>
      <ChannelLogo channelId={channel.id} channel={channel} context="cell" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-[600] leading-[1.2] text-[#F4F4F5]">
          {channel.name}
        </span>
        <span className="mt-[3px] flex min-w-0 items-center gap-1.5 text-[12px] font-[450] leading-[1.2] text-[#A1A1A6]">
          {current ? (
            <>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--red)]" aria-hidden />
              <span className="truncate">{current.title}</span>
            </>
          ) : (
            <span className="truncate">{secondary}</span>
          )}
        </span>
      </span>
      {trailing}
    </button>
  )
})
