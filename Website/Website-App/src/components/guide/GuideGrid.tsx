import { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Channel, Program } from '@shared/types'
import { cn } from '@/lib/cn'
import { hexToRgba } from '@/lib/color'
import {
  addMinutes,
  formatRange,
  formatTime,
  minutesSinceDayStart,
  programBlockRect
} from '@/lib/time'
import { ChannelListRow } from '@/components/channels/ChannelListRow'

const PX_PER_MINUTE = 4
const CHANNEL_COLUMN = 320
const ROW_HEIGHT = 56
const RULER_HEIGHT = 48
const DAY_MINUTES = 24 * 60

interface GuideGridProps {
  channels: Channel[]
  epg: Record<string, Program[]>
  dayStart: Date
  now: Date
  highlightChannelId?: string | null
  jumpToken?: number
  onOpenChannel: (channelId: string) => void
}

/**
 * The full 24-hour time grid.
 *
 * Rows are virtualised with TanStack Virtual. Horizontal time is not a native
 * scroll per row: one ruler owns the scrollbar and every row is translated by
 * the same offset, which keeps 38 channels perfectly in sync and cheap.
 */
export function GuideGrid({
  channels,
  epg,
  dayStart,
  now,
  highlightChannelId,
  jumpToken = 0,
  onOpenChannel
}: GuideGridProps): JSX.Element {
  const rulerRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: channels.length,
    getScrollElement: () => bodyRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8
  })

  const totalWidth = DAY_MINUTES * PX_PER_MINUTE
  const nowMinutes = minutesSinceDayStart(now)

  // The ruler owns the horizontal scrollbar. Rows and the now line follow it
  // through a CSS variable instead of React state, so panning stays perfectly
  // in sync even at high refresh rates and never re-renders the grid.
  useEffect(() => {
    const element = rulerRef.current
    const body = bodyRef.current
    if (!element || !body) return
    const sync = () => {
      body.style.setProperty('--guide-x', `-${element.scrollLeft}px`)
    }
    sync()
    element.addEventListener('scroll', sync, { passive: true })
    return () => element.removeEventListener('scroll', sync)
  }, [])

  // Centre the current time when the user asks, or when the highlighted
  // channel arrives from a deep link.
  useEffect(() => {
    const element = rulerRef.current
    const body = bodyRef.current
    if (!element || !body) return
    const target = Math.max(0, nowMinutes * PX_PER_MINUTE - element.clientWidth * 0.45)
    element.scrollTo({ left: target, behavior: jumpToken === 0 ? 'auto' : 'smooth' })
    body.style.setProperty('--guide-x', `-${target}px`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToken])

  useEffect(() => {
    if (highlightChannelId) {
      const index = channels.findIndex((channel) => channel.id === highlightChannelId)
      if (index >= 0) virtualizer.scrollToIndex(index, { align: 'center' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightChannelId])

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const element = rulerRef.current
    if (!element) return
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      element.scrollLeft += event.deltaX
    } else if (event.shiftKey) {
      element.scrollLeft += event.deltaY
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col" onWheel={onWheel}>
      {/* Ruler */}
      <div className="flex border-b border-white/[0.07]" style={{ height: RULER_HEIGHT }}>
        <div
          className="flex shrink-0 items-center border-r border-white/[0.07] px-4 text-[12px] font-semibold uppercase tracking-[0.16em] text-[#A1A1A6]"
          style={{ width: CHANNEL_COLUMN }}
        >
          Channel
        </div>
        <div ref={rulerRef} className="no-scrollbar relative flex-1 overflow-x-auto overflow-y-hidden">
          <div className="relative h-full" style={{ width: totalWidth }}>
            {Array.from({ length: (DAY_MINUTES * 2) / 60 + 1 }).map((_, index) => {
              const minute = index * 30
              const hour = minute % 60 === 0
              return (
                <div
                  key={minute}
                  className="absolute inset-y-0 flex items-start pt-2"
                  style={{ left: minute * PX_PER_MINUTE }}
                >
                  <span
                    className={cn(
                      'absolute left-1.5 top-2 whitespace-nowrap tabular-nums',
                      hour ? 'text-[12px] font-[600] text-[#F4F4F5]' : 'text-[12px] font-[450] text-[#A1A1A6]'
                    )}
                  >
                    {formatTime(addMinutes(dayStart, minute))}
                  </span>
                </div>
              )
            })}
            {/* Ruler now marker */}
            <div
              className="absolute bottom-0 top-0 z-10 w-px bg-live/70"
              style={{ left: nowMinutes * PX_PER_MINUTE }}
            >
              <span className="absolute -left-[5px] top-0 h-2 w-2 rounded-full bg-live shadow-[0_0_10px_rgba(255,59,78,.9)]" />
            </div>
          </div>
        </div>
      </div>

      {/* Virtualised channel rows */}
      <div ref={bodyRef} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const channel = channels[virtualRow.index]
            const programs = epg[channel.id] ?? []
            const isHighlighted = channel.id === highlightChannelId

            return (
              <div
                key={channel.id}
                className="absolute left-0 top-0 w-full"
                style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
              >
                <div className="flex h-full border-b border-white/[0.045]">
                  <div
                    className="shrink-0 border-r border-white/[0.07]"
                    style={{ width: CHANNEL_COLUMN }}
                  >
                    <ChannelListRow
                      channel={channel}
                      programs={programs}
                      selected={isHighlighted}
                      onClick={() => onOpenChannel(channel.id)}
                      className="h-full rounded-none"
                    />
                  </div>

                  <div className="relative min-w-0 flex-1 overflow-hidden">
                    <div
                      className="absolute inset-y-0"
                      style={{ width: totalWidth, transform: 'translateX(var(--guide-x, 0px))' }}
                    >
                      {programs.map((program) => {
                        const rect = programBlockRect(program, dayStart, DAY_MINUTES)
                        if (rect.durationMinutes <= 0) return null
                        const start = Date.parse(program.start)
                        const end = Date.parse(program.end)
                        const time = now.getTime()
                        const isNow = start <= time && time < end
                        const isPast = end <= time
                        return (
                          <button
                            key={program.id}
                            type="button"
                            onClick={() => onOpenChannel(channel.id)}
                            title={`${program.title} · ${formatRange(program.start, program.end)}`}
                            className={cn(
                              'absolute inset-y-[3px] overflow-hidden rounded-[10px] border px-2.5 py-1.5 text-left transition-colors',
                              isNow
                                ? 'border-[rgba(225,29,46,0.45)] bg-[rgba(225,29,46,0.14)]'
                                : 'border-white/[0.06] hover:border-white/15 hover:bg-white/[0.08]',
                              isPast ? 'bg-white/[0.02]' : 'bg-white/[0.045]'
                            )}
                            style={{
                              left: rect.offsetMinutes * PX_PER_MINUTE,
                              width: Math.max(rect.durationMinutes * PX_PER_MINUTE - 4, 24),
                              boxShadow: isNow
                                ? `inset 3px 0 0 ${hexToRgba(channel.brandColor, 0.9)}`
                                : undefined
                            }}
                          >
                            <span className="flex min-w-0 items-center gap-1.5">
                              {isNow ? (
                                <span
                                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--red)]"
                                  aria-hidden
                                />
                              ) : null}
                              <span
                                className={cn(
                                  'truncate text-[12px] font-[600] leading-[1.2]',
                                  isNow
                                    ? 'text-white'
                                    : isPast
                                      ? 'text-[#A1A1A6]'
                                      : 'text-[#F4F4F5]'
                                )}
                              >
                                {program.title}
                              </span>
                            </span>
                            <span className="mt-[2px] block truncate text-[12px] font-[450] leading-[1.2] text-[#A1A1A6]">
                              {[formatRange(program.start, program.end), program.genre]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {/* A single now line spanning every virtualised row. */}
          <div
            className="pointer-events-none absolute inset-y-0 right-0 z-20"
            style={{ left: CHANNEL_COLUMN }}
          >
            <div
              className="absolute inset-y-0 w-px bg-live/60"
              style={{ transform: `translateX(calc(${nowMinutes * PX_PER_MINUTE}px + var(--guide-x, 0px)))` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
