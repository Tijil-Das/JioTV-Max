import { useCallback, useEffect, useState } from 'react'
import type { Channel } from '@shared/types'
import { cn } from '@/lib/cn'
import { useProcessedLogo } from '@/hooks/useProcessedLogo'
import { useChannelStore } from '@/store/useChannelStore'
import { ChannelLogo } from '@/components/ui/ChannelLogo'

/**
 * Addendum 3 §2 — `/dev/logos` contact sheet (dev only).
 *
 * Twelve columns, one plate per channel, tier + flags labels, and a "flagged"
 * filter for logos that fell back to a monogram or carry pipeline flags.
 */

function LogoAuditCell({
  channel,
  onFlag
}: {
  channel: Channel
  onFlag: (channelId: string, flagged: boolean) => void
}): JSX.Element {
  const { logo, loading } = useProcessedLogo(channel, 'visible')
  const flagged =
    !loading && ((logo?.tier ?? 'monogram') === 'monogram' || (logo?.flags.length ?? 0) > 0)

  useEffect(() => {
    if (!loading) onFlag(channel.id, flagged)
  }, [channel.id, flagged, loading, onFlag])

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative aspect-square overflow-hidden rounded-[12px] border border-[rgba(255,255,255,0.07)] bg-[#0E0E10]">
        <ChannelLogo channel={channel} priority="visible" />
      </div>
      <p className="truncate text-[12px] font-[600] text-[#F4F4F5]">
        {channel.number} · {channel.name}
      </p>
      <p className="truncate text-[12px] font-[450] text-[#A1A1A6]">
        {loading
          ? 'processing…'
          : `${logo?.tier ?? 'none'}${logo?.flags.length ? ` · ${logo.flags.join(', ')}` : ''}`}
      </p>
    </div>
  )
}

export function DevLogosPage(): JSX.Element {
  const channels = useChannelStore((state) => state.channels)
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [flagged, setFlagged] = useState<Record<string, boolean>>({})

  const report = useCallback((channelId: string, isFlagged: boolean) => {
    setFlagged((previous) =>
      previous[channelId] === isFlagged ? previous : { ...previous, [channelId]: isFlagged }
    )
  }, [])

  const visible = flaggedOnly ? channels.filter((channel) => flagged[channel.id]) : channels
  const flaggedCount = Object.values(flagged).filter(Boolean).length

  return (
    <div className="min-h-full px-[var(--gutter)] pb-16 pt-[92px]">
      <header className="mb-6 flex items-center justify-between gap-6">
        <div>
          <h1 className="text-[24px] font-[600] tracking-[-0.01em] text-[#F4F4F5]">
            Logo pipeline audit
          </h1>
          <p className="mt-1 text-[12px] font-[450] text-[#A1A1A6]">
            {channels.length} channels · {flaggedCount} flagged · worker + IndexedDB pipeline
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFlaggedOnly((value) => !value)}
          aria-pressed={flaggedOnly}
          className={cn(
            'rounded-[8px] border px-4 py-2 text-[12px] font-[500] transition-colors duration-150',
            flaggedOnly
              ? 'border-[var(--red-line)] bg-[rgba(225,29,46,0.12)] text-[#F4F4F5]'
              : 'border-[rgba(255,255,255,0.07)] bg-[#111113] text-[#A1A1A6] hover:border-[rgba(255,255,255,0.14)]'
          )}
        >
          Flagged only
        </button>
      </header>

      <div className="grid grid-cols-12 gap-3">
        {visible.map((channel) => (
          <LogoAuditCell key={channel.id} channel={channel} onFlag={report} />
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="mt-10 text-center text-[13px] font-[450] text-[#A1A1A6]">
          {flaggedOnly ? 'No flagged logos.' : 'No channels loaded yet.'}
        </p>
      ) : null}
    </div>
  )
}
