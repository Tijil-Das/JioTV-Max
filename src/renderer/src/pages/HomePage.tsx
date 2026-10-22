import { useMemo } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import type { Channel, ChannelCategory } from '@shared/types'
import { useChannelStore } from '@/store/useChannelStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { PageTransition, StateView } from '@/components/ui/StateView'
import { Button } from '@/components/ui/Button'
import { RowSkeleton, Skeleton } from '@/components/ui/Skeleton'
import { Hero } from '@/components/home/Hero'
import { CategoryTiles } from '@/components/home/CategoryTiles'
import { ChannelRow } from '@/components/home/ChannelRow'

/**
 * Addendum 4 §6c — Simulcast collapsing (Home rows and hero only).
 * Group key = brandKey + language.
 * brandKey is the lowercase name with quality tokens (HD, SD, FHD, UHD, 4K),
 * "Live" and punctuation removed, and with the language word removed when
 * it equals channel.language. The primary is the highest quality, then lowest number.
 */
export function getSimulcastBrandKey(channel: Channel): string {
  let name = channel.name.toLowerCase()
  name = name.replace(/[^\w\s]/g, ' ')
  name = name.replace(/\b(hd|sd|fhd|uhd|4k)\b/gi, ' ')
  name = name.replace(/\b(live)\b/gi, ' ')
  if (channel.language) {
    const langWord = channel.language.toLowerCase()
    name = name.replace(new RegExp(`\\b${langWord}\\b`, 'gi'), ' ')
  }
  return name.replace(/\s+/g, ' ').trim()
}

const QUALITY_ORDER: Record<string, number> = {
  '4K': 3,
  UHD: 3,
  FHD: 2,
  HD: 2,
  SD: 1
}

function channelMaxQuality(channel: Channel): number {
  let max = 0
  for (const q of channel.quality ?? []) {
    max = Math.max(max, QUALITY_ORDER[q] ?? 1)
  }
  return max
}

export function collapseSimulcasts(channels: Channel[]): Channel[] {
  const groups = new Map<string, Channel[]>()
  for (const ch of channels) {
    const brandKey = getSimulcastBrandKey(ch)
    const groupKey = `${brandKey}__${ch.language.toLowerCase()}`
    const existing = groups.get(groupKey)
    if (existing) {
      existing.push(ch)
    } else {
      groups.set(groupKey, [ch])
    }
  }

  const result: Channel[] = []
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => {
      const qA = channelMaxQuality(a)
      const qB = channelMaxQuality(b)
      if (qA !== qB) return qB - qA
      return a.number - b.number
    })
    result.push(sorted[0])
  }
  return result
}

/**
 * Home is an editorial front page: live hero, quick categories, then shelves.
 * Addendum 4 §6:
 * a) No row subtitles anywhere.
 * b) Disjoint rows: a channel shown in one Home shelf is excluded from later shelves.
 * c) Simulcasts are collapsed into primary variants.
 */
export function HomePage(): JSX.Element {
  const channels = useChannelStore((state) => state.channels)
  const epg = useChannelStore((state) => state.epg)
  const loading = useChannelStore((state) => state.loading)
  const error = useChannelStore((state) => state.error)
  const recents = useChannelStore((state) => state.recents)
  const favorites = useChannelStore((state) => state.favorites)
  const source = useChannelStore((state) => state.source)
  const fetchCatalogue = useChannelStore((state) => state.fetchCatalogue)
  const mode = useSettingsStore((state) => state.mode)
  const showHero = useSettingsStore((state) => state.showHero)

  const recentlyWatched = useMemo(() => {
    const byId = new Map(channels.map((channel) => [channel.id, channel]))
    const picked = recents
      .map((recent) => byId.get(recent.channelId))
      .filter((channel): channel is Channel => Boolean(channel))
    return collapseSimulcasts(picked).slice(0, 10)
  }, [channels, recents])

  const favoriteChannels = useMemo(() => {
    const matching = channels.filter((channel) => favorites.includes(channel.id))
    return collapseSimulcasts(matching)
  }, [channels, favorites])

  // Disjoint shelves: channels shown in earlier shelves are excluded from later shelves (§6b)
  const {
    sportsChannels,
    newsChannels,
    entertainmentChannels,
    movieChannels,
    kidsChannels,
    regionalChannels
  } = useMemo(() => {
    const seen = new Set<string>()

    const pickDisjoint = (category: ChannelCategory, count = 14): Channel[] => {
      const matching = channels.filter((c) => c.category === category && !seen.has(c.id))
      const collapsed = collapseSimulcasts(matching)
      const selected = collapsed.slice(0, count)
      for (const ch of selected) seen.add(ch.id)
      return selected
    }

    const sports = pickDisjoint('sports')
    const news = pickDisjoint('news')
    const entertainment = pickDisjoint('entertainment')
    const movies = pickDisjoint('movies')
    const kids = pickDisjoint('kids')
    const regional = pickDisjoint('regional')

    return {
      sportsChannels: sports,
      newsChannels: news,
      entertainmentChannels: entertainment,
      movieChannels: movies,
      kidsChannels: kids,
      regionalChannels: regional
    }
  }, [channels])

  const isInitialLoading = loading && channels.length === 0

  if (!isInitialLoading && channels.length === 0) {
    return (
      <PageTransition>
        <div className="pt-[88px]">
          <StateView
            tone={error ? 'error' : 'default'}
            title="No channels yet"
            description={
              error ??
              'The catalogue came back empty. Check your connection and try loading it again.'
            }
            actionLabel="Reload catalogue"
            onAction={() => void fetchCatalogue(mode, true)}
          />
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      {isInitialLoading ? (
        <>
          <div className="px-8 pb-10 pt-[92px]">
            <Skeleton className="h-[440px] w-full rounded-panel" />
          </div>
          <RowSkeleton />
          <RowSkeleton />
        </>
      ) : (
        <>
          {showHero ? <Hero /> : <div className="pt-[88px]" />}

          {error ? (
            <div className="mx-8 mt-6 flex items-center gap-3 rounded-2xl border border-warning/25 bg-warning/[0.07] px-4 py-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
              <p className="flex-1 text-[12px] text-text-secondary">
                {error}
              </p>
              <Button
                size="sm"
                variant="ghost"
                icon={<RefreshCw className="h-3.5 w-3.5" />}
                onClick={() => void fetchCatalogue(mode, true)}
              >
                Retry
              </Button>
            </div>
          ) : null}

          <div className="relative z-10 mt-7 mb-1">
            <CategoryTiles channels={channels} />
          </div>

          {recentlyWatched.length > 0 ? (
            <ChannelRow
              className="mt-12"
              title="Recently watched"
              channels={recentlyWatched}
              epg={epg}
            />
          ) : null}

          {favoriteChannels.length > 0 ? (
            <ChannelRow
              className="mt-8"
              title="From My List"
              channels={favoriteChannels}
              epg={epg}
              viewAllTo="/favorites"
            />
          ) : null}

          <ChannelRow
            className="mt-8"
            title="Sports"
            channels={sportsChannels}
            epg={epg}
            viewAllTo="/category/sports"
          />

          <ChannelRow
            className="mt-8"
            title="News"
            channels={newsChannels}
            epg={epg}
            viewAllTo="/category/news"
          />

          <ChannelRow
            className="mt-8"
            title="Entertainment"
            channels={entertainmentChannels}
            epg={epg}
            viewAllTo="/category/entertainment"
          />

          <ChannelRow
            className="mt-8"
            title="Movies"
            channels={movieChannels}
            epg={epg}
            viewAllTo="/category/movies"
          />

          <ChannelRow
            className="mt-8"
            title="Kids"
            channels={kidsChannels}
            epg={epg}
            viewAllTo="/category/kids"
          />

          <ChannelRow
            className="mt-8"
            title="Regional"
            channels={regionalChannels}
            epg={epg}
            viewAllTo="/category/regional"
          />
        </>
      )}
    </PageTransition>
  )
}
