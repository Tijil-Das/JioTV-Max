import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowUpRight, Baby, Clapperboard, Film, Newspaper, Trophy, Tv } from 'lucide-react'
import type { Channel, ChannelCategory } from '@shared/types'
import { cn } from '@/lib/cn'
import { hexToRgba } from '@/lib/color'
import { CATEGORY_META } from '@/lib/constants'
import { staggerChildren, fadeUp, springSoft } from '@/lib/motion'

const tiles: Array<{ key: ChannelCategory; color: string; icon: JSX.Element }> = [
  { key: 'sports', color: '#EF4444', icon: <Trophy className="h-5 w-5" /> },
  { key: 'news', color: '#3B82F6', icon: <Newspaper className="h-5 w-5" /> },
  { key: 'movies', color: '#8B5CF6', icon: <Film className="h-5 w-5" /> },
  { key: 'entertainment', color: '#EC4899', icon: <Clapperboard className="h-5 w-5" /> },
  { key: 'kids', color: '#22D3EE', icon: <Baby className="h-5 w-5" /> },
  { key: 'regional', color: '#22C55E', icon: <Tv className="h-5 w-5" /> }
]

/** Quick-jump tiles for the six catalogue categories. */
export function CategoryTiles({ channels }: { channels: Channel[] }): JSX.Element {
  const navigate = useNavigate()
  const counts = useMemo(() => {
    const map = new Map<ChannelCategory, number>()
    channels.forEach((channel) => map.set(channel.category, (map.get(channel.category) ?? 0) + 1))
    return map
  }, [channels])

  return (
    <motion.div
      variants={staggerChildren(0.05)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      className="grid grid-cols-2 gap-4 px-8 md:grid-cols-3 xl:grid-cols-6"
    >
      {tiles.map((tile) => {
        const meta = CATEGORY_META[tile.key]
        return (
          <motion.button
            key={tile.key}
            variants={fadeUp}
            whileHover={{ y: -4 }}
            transition={springSoft}
            type="button"
            onClick={() => navigate(`/category/${tile.key}`)}
            className={cn(
              'group relative flex h-[104px] flex-col justify-between overflow-hidden rounded-2xl border border-white/[0.07] p-4 text-left',
              'bg-bg-card transition-colors hover:border-white/15'
            )}
            style={{ boxShadow: `inset 0 0 60px ${hexToRgba(tile.color, 0.08)}` }}
          >
            <span
              aria-hidden
              className="absolute -right-6 -top-8 h-24 w-24 rounded-full blur-2xl transition-opacity duration-300 group-hover:opacity-90"
              style={{ background: hexToRgba(tile.color, 0.28) }}
            />
            <span
              className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/10"
              style={{ background: hexToRgba(tile.color, 0.16), color: tile.color }}
            >
              {tile.icon}
            </span>
            <span className="relative flex items-end justify-between gap-2">
              <span>
                <span className="block text-[13px] font-semibold text-text-primary">{meta.label}</span>
                <span className="block text-[11px] text-text-muted">
                  {counts.get(tile.key) ?? 0} channels
                </span>
              </span>
              <ArrowUpRight className="h-4 w-4 translate-y-1 text-text-muted opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:text-white group-hover:opacity-100" />
            </span>
          </motion.button>
        )
      })}
    </motion.div>
  )
}
