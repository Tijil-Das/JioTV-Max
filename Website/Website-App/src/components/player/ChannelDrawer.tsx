import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import type { Channel, Program } from '@shared/types'
import { easePremium } from '@/lib/motion'
import { ChannelListRow } from '@/components/channels/ChannelListRow'
import { smartSearchChannels } from '@/lib/search/smartSearch'

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

  const visible = useMemo(() => {
    const term = query.trim()
    if (!term) return channels
    return smartSearchChannels(term, channels, epg, new Date(), 50)
  }, [channels, query, epg])

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
                <p className="mt-0.5 text-[12px] text-[#A1A1A6]">
                  {channels.length} available · ↑↓ to zap
                </p>
              </div>
              <button
                type="button"
                aria-label="Close channel list"
                onClick={onClose}
                className="rounded-lg p-2 text-[#A1A1A6] transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="border-b border-white/[0.06] px-4 py-3">
              <div className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 focus-within:border-[var(--red-line)]">
                <Search className="h-3.5 w-3.5 text-[#A1A1A6]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter by name, number or language"
                  aria-label="Filter channels"
                  className="h-full flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-[#A1A1A6]"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3 flex flex-col gap-2">
              {visible.map((channel) => (
                <ChannelListRow
                  key={channel.id}
                  channel={channel}
                  programs={epg[channel.id]}
                  selected={channel.id === currentChannelId}
                  onClick={() => onSelect(channel.id)}
                />
              ))}
              {visible.length === 0 ? (
                <p className="px-3 py-8 text-center text-[12px] text-[#A1A1A6]">
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
