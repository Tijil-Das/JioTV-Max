import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import type { Channel, Program } from '@shared/types'
import { cn } from '@/lib/cn'
import { easePremium } from '@/lib/motion'
import { getNowNext } from '@/lib/time'
import { useNow } from '@/hooks/useNow'
import { ChannelLogoCell } from '@/components/ui/ChannelLogo'
import { highestQuality } from '@/lib/constants'

interface ChannelDrawerProps {
  open: boolean
  onClose: () => void
  channels: Channel[]
  epg: Record<string, Program[]>
  currentChannelId: string
  onSelect: (channelId: string) => void
}

/** Right-hand channel rail for zapping without leaving the player. */
export function ChannelDrawer({
  open,
  onClose,
  channels,
  epg,
  currentChannelId,
  onSelect
}: ChannelDrawerProps): JSX.Element {
  const [query, setQuery] = useState('')
  const now = useNow()

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return channels
    return channels.filter(
      (channel) =>
        channel.name.toLowerCase().includes(term) ||
        channel.number.toString().includes(term) ||
        channel.language.toLowerCase().includes(term)
    )
  }, [channels, query])

  return (
    <AnimatePresence>
      {open ? (
        <div className="absolute inset-0 z-40">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-label="Channel list"
            initial={{ x: 400 }}
            animate={{ x: 0 }}
            exit={{ x: 400 }}
            transition={{ duration: 0.32, ease: easePremium }}
            className="glass-strong absolute inset-y-0 right-0 flex w-[380px] flex-col border-l border-white/[0.08]"
          >
            <header className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
              <div>
                <h2 className="font-display text-[15px] font-semibold text-white">Channels</h2>
                <p className="mt-0.5 text-[11px] text-text-muted">
                  {channels.length} available · ↑↓ to zap
                </p>
              </div>
              <button
                type="button"
                aria-label="Close channel list"
                onClick={onClose}
                className="rounded-lg p-2 text-text-muted transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="border-b border-white/[0.06] px-4 py-3">
              <div className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 focus-within:border-accent/50">
                <Search className="h-3.5 w-3.5 text-text-muted" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter by name, number or language"
                  aria-label="Filter channels"
                  className="h-full flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-text-muted"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {visible.map((channel) => {
                const { current } = getNowNext(epg[channel.id] ?? [], now)
                const active = channel.id === currentChannelId
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => onSelect(channel.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-[10px] border px-2.5 py-2 text-left transition-colors',
                      active
                        ? 'border-[var(--red)]/40 bg-[var(--red)]/[0.12]'
                        : 'border-transparent hover:border-white/10 hover:bg-white/[0.05]'
                    )}
                  >
                    {/* Channel number in tabular numerals: 40px column (text-3, 12px) */}
                    <span className="w-10 shrink-0 text-right text-[12px] font-[500] tabular-nums text-[#66666C]">
                      {channel.number}
                    </span>
                    {/* Fixed 64 x 44px logo cell */}
                    <ChannelLogoCell channel={channel} />
                    {/* Name (14/600) and muted line (12px text-3) */}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-[600] text-[#F4F4F5]">
                          {channel.name}
                        </span>
                        {active ? (
                          <span className="rounded-[4px] bg-[var(--red)] px-1.5 py-[1px] text-[9px] font-[700] uppercase tracking-wider text-white">
                            Playing
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-[#66666C]">
                        {current
                          ? current.title
                          : `${channel.language || channel.category} · ${highestQuality(channel)}`}
                      </span>
                    </span>
                  </button>
                )
              })}
              {visible.length === 0 ? (
                <p className="px-3 py-8 text-center text-[12px] text-text-muted">
                  No channel matches “{query}”.
                </p>
              ) : null}
            </div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  )
}
