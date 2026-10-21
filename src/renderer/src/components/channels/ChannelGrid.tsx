import { useMemo, useState } from 'react'
import { LayoutGrid, ListFilter } from 'lucide-react'
import type { Channel, ChannelQuality, Program } from '@shared/types'
import { cn } from '@/lib/cn'
import { ChannelCard } from '@/components/home/ChannelCard'
import { StateView } from '@/components/ui/StateView'

type SortKey = 'number' | 'name' | 'language'

interface ChannelGridProps {
  channels: Channel[]
  epg: Record<string, Program[]>
  emptyTitle?: string
  emptyDescription?: string
}

/**
 * Filterable channel wall used by category pages and My List.
 * Filters are intentionally lightweight — no server round trip for 38 rows.
 */
export function ChannelGrid({
  channels,
  epg,
  emptyTitle = 'Nothing here yet',
  emptyDescription = 'Try another filter or browse the full catalogue.'
}: ChannelGridProps): JSX.Element {
  const [language, setLanguage] = useState<string>('all')
  const [quality, setQuality] = useState<'all' | ChannelQuality>('all')
  const [sort, setSort] = useState<SortKey>('number')

  const languages = useMemo(
    () => Array.from(new Set(channels.map((channel) => channel.language))).sort(),
    [channels]
  )

  const visible = useMemo(() => {
    const filtered = channels.filter((channel) => {
      const matchesLanguage = language === 'all' || channel.language === language
      const matchesQuality = quality === 'all' || channel.quality.includes(quality)
      return matchesLanguage && matchesQuality
    })
    return filtered.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'language') return a.language.localeCompare(b.language) || a.number - b.number
      return a.number - b.number
    })
  }, [channels, language, quality, sort])

  if (channels.length === 0) {
    return <StateView title={emptyTitle} description={emptyDescription} />
  }

  const selectClass =
    'h-10 rounded-xl border border-white/10 bg-bg-card px-3 text-[12px] text-text-secondary outline-none transition-colors hover:border-white/20 focus:border-accent/50'

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          <ListFilter className="h-3.5 w-3.5" />
          Filter
        </span>
        <label className="sr-only" htmlFor="filter-language">
          Language
        </label>
        <select
          id="filter-language"
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          className={selectClass}
        >
          <option value="all">All languages</option>
          {languages.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <div className="flex rounded-xl border border-white/10 bg-bg-card p-1">
          {(['all', 'HD', '4K'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setQuality(option)}
              aria-pressed={quality === option}
              className={cn(
                'rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors',
                quality === option ? 'bg-white/[0.1] text-white' : 'text-text-muted hover:text-text-secondary'
              )}
            >
              {option === 'all' ? 'Any quality' : option}
            </button>
          ))}
        </div>

        <label className="sr-only" htmlFor="filter-sort">
          Sort
        </label>
        <select
          id="filter-sort"
          value={sort}
          onChange={(event) => setSort(event.target.value as SortKey)}
          className={selectClass}
        >
          <option value="number">Channel number</option>
          <option value="name">Name (A–Z)</option>
          <option value="language">Language</option>
        </select>

        <span className="ml-auto flex items-center gap-2 text-[12px] text-text-muted">
          <LayoutGrid className="h-3.5 w-3.5" />
          {visible.length} of {channels.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <StateView
          title="No channels match those filters"
          description="Clear a filter or two and the wall will fill up again."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {visible.map((channel) => (
            <ChannelCard key={channel.id} channel={channel} programs={epg[channel.id]} fluid />
          ))}
        </div>
      )}
    </div>
  )
}
