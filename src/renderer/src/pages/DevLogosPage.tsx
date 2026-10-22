import { useCallback, useEffect, useState } from 'react'
import type { Channel } from '@shared/types'
import { cn } from '@/lib/cn'
import { useProcessedLogo } from '@/hooks/useProcessedLogo'
import { useChannelStore } from '@/store/useChannelStore'
import { ChannelLogo } from '@/components/ui/ChannelLogo'
import type { LogoPipelineFlag } from '@/lib/logo/pipeline'

/**
 * Addendum 4 §9 — `/dev/logos` contact sheet (dev builds only).
 *
 * Contact sheet of the whole catalog on the real plate, 12 columns,
 * each labeled with flags: low-res, low-contrast, matted, opaque-light, monogram.
 * Includes a "flagged only" filter and flag counts.
 */

interface AuditReport {
  isFlagged: boolean
  flags: LogoPipelineFlag[]
  tier: string
}

function LogoAuditCell({
  channel,
  onReport
}: {
  channel: Channel
  onReport: (channelId: string, report: AuditReport) => void
}): JSX.Element {
  const { logo, loading } = useProcessedLogo(channel, 'visible')
  const isMonogram = (logo?.tier ?? 'monogram') === 'monogram'
  const flags = (logo?.flags ?? []) as LogoPipelineFlag[]
  const isFlagged = !loading && (isMonogram || flags.length > 0)

  useEffect(() => {
    if (!loading) {
      onReport(channel.id, {
        isFlagged,
        flags: isMonogram && !flags.includes('monogram') ? [...flags, 'monogram'] : flags,
        tier: logo?.tier ?? 'monogram'
      })
    }
  }, [channel.id, isFlagged, flags, isMonogram, loading, logo?.tier, onReport])

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[16px] border border-[rgba(255,255,255,0.07)] bg-[#0E0E10] p-3">
        <ChannelLogo channelId={channel.id} channel={channel} context="tile" priority="visible" className="h-full w-full" />
      </div>
      <p className="truncate text-[12px] font-[600] text-[#F4F4F5]">
        {channel.number} · {channel.name}
      </p>
      <p className="truncate text-[11px] font-[450] text-[#A1A1A6]">
        {loading
          ? 'processing…'
          : flags.length > 0
            ? flags.join(', ')
            : logo?.tier ?? 'asis'}
      </p>
    </div>
  )
}

export function DevLogosPage(): JSX.Element {
  const channels = useChannelStore((state) => state.channels)
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [reports, setReports] = useState<Record<string, AuditReport>>({})

  const report = useCallback((channelId: string, item: AuditReport) => {
    setReports((previous) => {
      const prev = previous[channelId]
      if (
        prev &&
        prev.isFlagged === item.isFlagged &&
        prev.tier === item.tier &&
        prev.flags.length === item.flags.length
      ) {
        return previous
      }
      return { ...previous, [channelId]: item }
    })
  }, [])

  const visible = flaggedOnly
    ? channels.filter((channel) => reports[channel.id]?.isFlagged)
    : channels

  const flagCounts = {
    'low-res': 0,
    'low-contrast': 0,
    matted: 0,
    'opaque-light': 0,
    monogram: 0
  }

  let totalFlagged = 0
  for (const rep of Object.values(reports)) {
    if (rep.isFlagged) totalFlagged += 1
    for (const f of rep.flags) {
      if (f in flagCounts) flagCounts[f as keyof typeof flagCounts] += 1
    }
  }

  return (
    <div className="min-h-full px-[var(--gutter)] pb-16 pt-[92px]">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-[600] tracking-[-0.01em] text-[#F4F4F5]">
            Logo pipeline audit
          </h1>
          <p className="mt-1 text-[12px] font-[450] text-[#A1A1A6]">
            {channels.length} channels · {totalFlagged} flagged · Addendum 4 pixel-pure spec
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-[4px] border border-white/10 bg-white/5 px-2 py-0.5 text-[#F4F4F5]">
              low-res: {flagCounts['low-res']}
            </span>
            <span className="rounded-[4px] border border-white/10 bg-white/5 px-2 py-0.5 text-[#F4F4F5]">
              low-contrast: {flagCounts['low-contrast']}
            </span>
            <span className="rounded-[4px] border border-white/10 bg-white/5 px-2 py-0.5 text-[#F4F4F5]">
              matted: {flagCounts.matted}
            </span>
            <span className="rounded-[4px] border border-white/10 bg-white/5 px-2 py-0.5 text-[#F4F4F5]">
              opaque-light: {flagCounts['opaque-light']}
            </span>
            <span className="rounded-[4px] border border-white/10 bg-white/5 px-2 py-0.5 text-[#F4F4F5]">
              monogram: {flagCounts.monogram}
            </span>
          </div>
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
          Flagged only ({totalFlagged})
        </button>
      </header>

      <div className="grid grid-cols-12 gap-3">
        {visible.map((channel) => (
          <LogoAuditCell key={channel.id} channel={channel} onReport={report} />
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
