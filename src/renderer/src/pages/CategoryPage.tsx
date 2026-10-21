import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Baby, Clapperboard, Film, Newspaper, Trophy, Tv } from 'lucide-react'
import type { ChannelCategory } from '@shared/types'
import { CATEGORY_META } from '@/lib/constants'
import { hexToRgba } from '@/lib/color'
import { useChannelStore } from '@/store/useChannelStore'
import { PageTransition, StateView } from '@/components/ui/StateView'
import { ChannelGrid } from '@/components/channels/ChannelGrid'
import { Skeleton } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'

const categoryColor: Record<ChannelCategory, string> = {
  sports: '#EF4444',
  news: '#3B82F6',
  movies: '#8B5CF6',
  entertainment: '#EC4899',
  kids: '#22D3EE',
  regional: '#22C55E'
}

const categoryIcon: Record<ChannelCategory, JSX.Element> = {
  sports: <Trophy className="h-6 w-6" />,
  news: <Newspaper className="h-6 w-6" />,
  movies: <Film className="h-6 w-6" />,
  entertainment: <Clapperboard className="h-6 w-6" />,
  kids: <Baby className="h-6 w-6" />,
  regional: <Tv className="h-6 w-6" />
}

/** Full catalogue wall for one category, with an editorial header. */
export function CategoryPage(): JSX.Element {
  const { category } = useParams<{ category: string }>()
  const navigate = useNavigate()
  const channels = useChannelStore((state) => state.channels)
  const epg = useChannelStore((state) => state.epg)
  const loading = useChannelStore((state) => state.loading)

  const key = category as ChannelCategory
  const meta = CATEGORY_META[key]

  const items = useMemo(
    () => channels.filter((channel) => channel.category === key),
    [channels, key]
  )

  if (!meta || !categoryIcon[key]) {
    return (
      <PageTransition>
        <div className="pt-[88px]">
          <StateView
            title="That category does not exist"
            description="Pick a section from the sidebar or head back home."
            actionLabel="Back home"
            onAction={() => navigate('/')}
          />
        </div>
      </PageTransition>
    )
  }

  const color = categoryColor[key]

  return (
    <PageTransition>
      <div className="px-8 pb-6 pt-[92px]">
        <div
          className="relative overflow-hidden rounded-panel border border-white/[0.07] p-7"
          style={{
            background: `radial-gradient(100% 160% at 90% 0%, ${hexToRgba(color, 0.24)} 0%, transparent 58%), linear-gradient(140deg, #121219, #0a0a0f)`
          }}
        >
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <span
                className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10"
                style={{ background: hexToRgba(color, 0.16), color }}
              >
                {categoryIcon[key]}
              </span>
              <div>
                <h2 className="font-display text-[26px] font-bold tracking-tight text-white">
                  {meta.label}
                </h2>
                <p className="mt-1 text-[13px] text-text-secondary">{meta.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-6 pr-2">
              <div className="text-right">
                <p className="font-display text-[22px] font-semibold text-white">{items.length}</p>
                <p className="text-[11px] uppercase tracking-[0.14em] text-text-muted">Channels</p>
              </div>
              <div className="h-10 w-px bg-white/10" />
              <div className="text-right">
                <p className="font-display text-[22px] font-semibold text-white">
                  {items.filter((channel) => channel.quality.includes('HD')).length}
                </p>
                <p className="text-[11px] uppercase tracking-[0.14em] text-text-muted">In HD</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-8 pb-4">
        {loading && items.length === 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="space-y-3">
                <Skeleton className="aspect-video w-full rounded-2xl" />
                <Skeleton className="h-3 w-2/3 rounded-full" />
              </div>
            ))}
          </div>
        ) : (
          <ChannelGrid channels={items} epg={epg} />
        )}
      </div>

      <div className="px-8 pb-10">
        <Button variant="ghost" onClick={() => navigate('/')}>
          ← Back to home
        </Button>
      </div>
    </PageTransition>
  )
}
