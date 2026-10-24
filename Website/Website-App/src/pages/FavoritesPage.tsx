import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useChannelStore } from '@/store/useChannelStore'
import { PageTransition, StateView } from '@/components/ui/StateView'
import { ChannelCard } from '@/components/home/ChannelCard'
import { downloadLatestApp } from '@/lib/downloadApp'

/** My List: favourite channels without filters. */
export function FavoritesPage(): JSX.Element {
  const navigate = useNavigate()
  const channels = useChannelStore((state) => state.channels)
  const epg = useChannelStore((state) => state.epg)
  const favorites = useChannelStore((state) => state.favorites)

  const favoriteChannels = useMemo(
    () => channels.filter((channel) => favorites.includes(channel.id)),
    [channels, favorites]
  )

  return (
    <PageTransition className="flex-1 flex flex-col min-h-[calc(100vh-100px)]">
      <div className="px-4 sm:px-8 pb-4 sm:pb-6 pt-[76px] sm:pt-[92px]">
        <div className="flex items-center gap-3.5 sm:gap-4">
          <span className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl border border-live/25 bg-live/10 text-live">
            <Heart className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <div>
            <h2 className="font-display text-[20px] sm:text-[24px] font-bold tracking-tight text-white">My List</h2>
            <p className="mt-0.5 sm:mt-1 text-[12px] sm:text-[13px] text-text-secondary">
              {favoriteChannels.length > 0
                ? `${favoriteChannels.length} ${favoriteChannels.length === 1 ? 'favorite channel' : 'favorite channels'} saved for quick access.`
                : 'Save your favorite channels here for instant access across devices.'}
            </p>
          </div>
        </div>
      </div>

      <div className={cn('px-4 sm:px-8 pb-16', favoriteChannels.length === 0 ? 'flex-1 flex flex-col items-center justify-center min-h-[380px]' : '')}>
        {favoriteChannels.length === 0 ? (
          <StateView
            title="Install the JioTV Max app to explore more."
            actionLabel="Download JioTV Max App"
            onAction={downloadLatestApp}
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(var(--tile),1fr))] gap-3 sm:gap-4">
            {favoriteChannels.map((channel) => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                programs={epg[channel.id]}
                fluid
              />
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  )
}
