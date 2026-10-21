import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarDays, LocateFixed } from 'lucide-react'
import type { ChannelCategory, Program } from '@shared/types'
import { cn } from '@/lib/cn'
import { CATEGORY_META } from '@/lib/constants'
import { formatDayLabel, startOfLocalDay } from '@/lib/time'
import { getMockPrograms } from '@/mocks/epg'
import { useChannelStore } from '@/store/useChannelStore'
import { useNow } from '@/hooks/useNow'
import { PageTransition, StateView } from '@/components/ui/StateView'
import { Button } from '@/components/ui/Button'
import { GuideGrid } from '@/components/guide/GuideGrid'

const dayOptions = [-1, 0, 1] as const

function dayLabel(offset: number): string {
  if (offset === 0) return 'Today'
  if (offset === -1) return 'Yesterday'
  return 'Tomorrow'
}

/** Full EPG with day navigation, category filters and jump-to-now. */
export function GuidePage(): JSX.Element {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const highlightChannelId = searchParams.get('channel')
  const now = useNow()
  const channels = useChannelStore((state) => state.channels)
  const storeEpg = useChannelStore((state) => state.epg)
  const loading = useChannelStore((state) => state.loading)
  const [dayOffset, setDayOffset] = useState(0)
  const [category, setCategory] = useState<'all' | ChannelCategory>('all')
  const [jumpToken, setJumpToken] = useState(0)

  const dayStart = useMemo(() => {
    const date = startOfLocalDay(new Date())
    date.setDate(date.getDate() + dayOffset)
    return date
  }, [dayOffset])

  const visibleChannels = useMemo(
    () => (category === 'all' ? channels : channels.filter((channel) => channel.category === category)),
    [category, channels]
  )

  const epg = useMemo(() => {
    if (dayOffset === 0) return storeEpg
    const map: Record<string, Program[]> = {}
    visibleChannels.forEach((channel) => {
      map[channel.id] = getMockPrograms(channel, dayStart)
    })
    return map
  }, [dayOffset, dayStart, storeEpg, visibleChannels])

  if (!loading && channels.length === 0) {
    return (
      <PageTransition>
        <div className="pt-[88px]">
          <StateView
            title="The guide is empty"
            description="Channels have not loaded yet. Reload the catalogue to build the schedule."
            actionLabel="Back home"
            onAction={() => navigate('/')}
          />
        </div>
      </PageTransition>
    )
  }

  const categories: Array<'all' | ChannelCategory> = [
    'all',
    'sports',
    'news',
    'movies',
    'entertainment',
    'kids',
    'regional'
  ]

  return (
    <PageTransition>
      <div className="flex h-[calc(100vh-40px)] flex-col px-8 pb-6 pt-[92px]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {dayOptions.map((offset) => {
              const date = startOfLocalDay(new Date())
              date.setDate(date.getDate() + offset)
              return (
                <button
                  key={offset}
                  type="button"
                  onClick={() => setDayOffset(offset)}
                  aria-pressed={dayOffset === offset}
                  className={cn(
                    'flex flex-col rounded-xl border px-4 py-2 text-left transition-colors duration-200',
                    dayOffset === offset
                      ? 'border-accent/45 bg-accent/[0.12]'
                      : 'border-white/[0.07] bg-white/[0.03] hover:border-white/15'
                  )}
                >
                  <span
                    className={cn(
                      'text-[12px] font-semibold',
                      dayOffset === offset ? 'text-white' : 'text-text-secondary'
                    )}
                  >
                    {dayLabel(offset)}
                  </span>
                  <span className="text-[10px] text-text-muted">{formatDayLabel(date)}</span>
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 text-[11px] text-text-muted lg:flex">
              <span className="h-2.5 w-2.5 rounded-full bg-live shadow-[0_0_8px_rgba(255,59,78,.7)]" />
              Live now
            </span>
            <Button
              variant="secondary"
              size="md"
              icon={<LocateFixed className="h-4 w-4" />}
              onClick={() => setJumpToken((value) => value + 1)}
            >
              Jump to now
            </Button>
          </div>
        </div>

        <div className="no-scrollbar -mx-1 mb-4 flex items-center gap-2 overflow-x-auto px-1">
          {categories.map((item) => {
            const label = item === 'all' ? 'All channels' : CATEGORY_META[item].label
            return (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                aria-pressed={category === item}
                className={cn(
                  'shrink-0 rounded-pill border px-3.5 py-1.5 text-[12px] font-medium transition-colors',
                  category === item
                    ? 'border-white/20 bg-white/[0.1] text-white'
                    : 'border-white/[0.07] bg-white/[0.02] text-text-muted hover:text-text-secondary'
                )}
              >
                {label}
              </button>
            )
          })}
        </div>

        <div className="glass flex min-h-[380px] flex-1 flex-col overflow-hidden rounded-panel">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
            <span className="flex items-center gap-2 text-[12px] text-text-secondary">
              <CalendarDays className="h-3.5 w-3.5 text-accent-alt" />
              {formatDayLabel(dayStart)} · {visibleChannels.length} channels · 24-hour grid
            </span>
            {dayOffset !== 0 ? (
              <span className="text-[11px] text-text-muted">Preview schedule</span>
            ) : (
              <span className="text-[11px] text-text-muted">Shift + scroll to pan time</span>
            )}
          </div>
          <div className="min-h-0 flex-1">
            <GuideGrid
              channels={visibleChannels}
              epg={epg}
              dayStart={dayStart}
              now={now}
              highlightChannelId={highlightChannelId}
              jumpToken={jumpToken}
              onOpenChannel={(channelId) => navigate(`/watch/${channelId}`)}
            />
          </div>
        </div>
      </div>
    </PageTransition>
  )
}
