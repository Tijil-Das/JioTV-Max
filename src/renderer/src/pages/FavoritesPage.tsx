import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { useChannelStore } from '@/store/useChannelStore'
import { PageTransition, StateView } from '@/components/ui/StateView'
import { ChannelGrid } from '@/components/channels/ChannelGrid'
import { Button } from '@/components/ui/Button'

/** My List: favourite channels, filterable with the shared grid. */
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
    <PageTransition>
      <div className="px-8 pb-6 pt-[92px]">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-live/25 bg-live/10 text-live">
            <Heart className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-[24px] font-bold tracking-tight text-white">My List</h2>
            <p className="mt-1 text-[13px] text-text-secondary">
              {favoriteChannels.length > 0
                ? `${favoriteChannels.length} channels you keep coming back to.`
                : 'Save channels here for one-tap access.'}
            </p>
          </div>
        </div>
      </div>

      <div className="px-8 pb-10">
        {favoriteChannels.length === 0 ? (
          <StateView
            icon={<Heart className="h-7 w-7" />}
            title="Your list is empty"
            description="Hover any channel card and tap the heart. Favourites appear here across restarts."
            actionLabel="Browse channels"
            onAction={() => navigate('/')}
          />
        ) : (
          <ChannelGrid
            channels={favoriteChannels}
            epg={epg}
            emptyTitle="No favourites match those filters"
          />
        )}
      </div>

      {favoriteChannels.length > 0 ? (
        <div className="px-8 pb-10">
          <Button variant="ghost" onClick={() => navigate('/')}>
            ← Back to home
          </Button>
        </div>
      ) : null}
    </PageTransition>
  )
}
