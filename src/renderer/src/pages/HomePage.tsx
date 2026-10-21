import { useMemo } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import type { Channel, ChannelCategory } from '@shared/types'
import { channelService } from '@/services/channelService'
import { useChannelStore } from '@/store/useChannelStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { PageTransition, StateView } from '@/components/ui/StateView'
import { Button } from '@/components/ui/Button'
import { RowSkeleton, Skeleton } from '@/components/ui/Skeleton'
import { Hero } from '@/components/home/Hero'
import { CategoryTiles } from '@/components/home/CategoryTiles'
import { ChannelRow } from '@/components/home/ChannelRow'

function pick(channels: Channel[], category: ChannelCategory, count = 12): Channel[] {
  return channels.filter((channel) => channel.category === category).slice(0, count)
}

/**
 * Home is an editorial front page: hero, quick categories, then shelves.
 * Every shelf reads from the same catalogue/EPG maps so timestamps agree.
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

  const featured = useMemo(() => channelService.featured(channels), [channels])

  const continueWatching = useMemo(() => {
    const byId = new Map(channels.map((channel) => [channel.id, channel]))
    return recents
      .map((recent) => byId.get(recent.channelId))
      .filter((channel): channel is Channel => Boolean(channel))
      .slice(0, 10)
  }, [channels, recents])

  const progressByChannel = useMemo(() => {
    const map: Record<string, number> = {}
    recents.forEach((recent) => {
      map[recent.channelId] = recent.progress
    })
    return map
  }, [recents])

  const favoriteChannels = useMemo(
    () => channels.filter((channel) => favorites.includes(channel.id)),
    [channels, favorites]
  )
  const mixedLive = useMemo(
    () => [...channels].sort((a, b) => a.number - b.number).slice(0, 14),
    [channels]
  )

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
          <Hero channels={featured} epg={epg} />

          {error ? (
            <div className="mx-8 mt-6 flex items-center gap-3 rounded-2xl border border-warning/25 bg-warning/[0.07] px-4 py-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
              <p className="flex-1 text-[12px] text-text-secondary">
                {source === 'demo'
                  ? `Live JioTV catalogue unavailable — showing the demo line-up. ${error}`
                  : error}
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

          <div className="mt-10">
            <CategoryTiles channels={channels} />
          </div>

          {continueWatching.length > 0 ? (
            <ChannelRow
              className="mt-12"
              title="Continue watching"
              subtitle="Pick up where you left off"
              channels={continueWatching}
              epg={epg}
              progressByChannel={progressByChannel}
            />
          ) : null}

          <ChannelRow
            className="mt-8"
            title="Live right now"
            subtitle="A snapshot of everything on air"
            channels={mixedLive}
            epg={epg}
            viewAllTo="/category/entertainment"
          />

          {favoriteChannels.length > 0 ? (
            <ChannelRow
              className="mt-8"
              title="From My List"
              subtitle="Your hand-picked channels"
              channels={favoriteChannels}
              epg={epg}
              viewAllTo="/favorites"
            />
          ) : null}

          <ChannelRow
            className="mt-8"
            title="Sports"
            subtitle="Live matches, analysis and the road to the final"
            channels={pick(channels, 'sports')}
            epg={epg}
            viewAllTo="/category/sports"
          />
          <ChannelRow
            className="mt-8"
            title="The newsroom"
            subtitle="Breaking stories with calm, clear context"
            channels={pick(channels, 'news')}
            epg={epg}
            viewAllTo="/category/news"
          />
          <ChannelRow
            className="mt-8"
            title="Cinema tonight"
            subtitle="Films on a schedule, the way broadcast intended"
            channels={pick(channels, 'movies')}
            epg={epg}
            viewAllTo="/category/movies"
          />
          <ChannelRow
            className="mt-8"
            title="Kids corner"
            subtitle="Bright adventures and gentle bedtime stories"
            channels={pick(channels, 'kids')}
            epg={epg}
            viewAllTo="/category/kids"
          />
          <ChannelRow
            className="mt-8"
            title="Regional spotlight"
            subtitle="Stories and voices from across India"
            channels={pick(channels, 'regional')}
            epg={epg}
            viewAllTo="/category/regional"
          />
        </>
      )}
    </PageTransition>
  )
}
