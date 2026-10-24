import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Clock3, Loader2, Search, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { tween } from '@/lib/motion'
import { useDebounce } from '@/hooks/useDebounce'
import { useNow } from '@/hooks/useNow'
import { useChannelStore } from '@/store/useChannelStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { ChannelListRow } from '@/components/channels/ChannelListRow'
import { smartSearchChannels } from '@/lib/search/smartSearch'
import type { Channel } from '@shared/types'

/**
 * Expanding search field (420 → 560px) with a live result dropdown.
 * Ctrl/Cmd+K focuses it from anywhere; the input owns its own keyboard model.
 */
export function SearchBox(): JSX.Element {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const debouncedQuery = useDebounce(query, 75)
  const channels = useChannelStore((state) => state.channels)
  const epg = useChannelStore((state) => state.epg)
  const recentSearches = useSettingsStore((state) => state.recentSearches)
  const addRecentSearch = useSettingsStore((state) => state.addRecentSearch)
  const now = useNow()
  const nowMinute = Math.floor(now.getTime() / 60000)

  // Search is in progress when user has typed input that is pending debounce/execution
  const isSearching = query.trim().length > 0 && query !== debouncedQuery

  const results = useMemo(() => {
    return smartSearchChannels(debouncedQuery, channels, epg, now, 10)
  }, [channels, debouncedQuery, epg, nowMinute])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setFocused(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [])

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.children[activeIndex] as HTMLElement | undefined
      activeEl?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex])

  const openChannel = (channel: Channel, term?: string) => {
    if (term) addRecentSearch(term)
    setFocused(false)
    setQuery('')
    if (channel.id.startsWith('ch-specimen-')) {
      navigate(`/watch/${channel.id}`)
    } else {
      navigate('/watch/ch-specimen-1', { state: { requestedChannel: channel } })
    }
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(index + 1, Math.max(results.length - 1, 0)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      if (results[activeIndex]) openChannel(results[activeIndex], query.trim())
    } else if (event.key === 'Escape') {
      setQuery('')
      setFocused(false)
      inputRef.current?.blur()
    }
  }

  const open = focused && (results.length > 0 || query.length === 0 || isSearching || query.trim().length > 0)

  return (
    <div
      ref={containerRef}
      className="relative no-drag w-full max-w-[min(380px,calc(100vw-24px))] sm:w-[380px] sm:max-w-none sm:focus-within:w-[500px] transition-[width,max-width] duration-[200ms]"
    >
      <div
        className={cn(
          'flex h-10 w-full items-center gap-2.5 rounded-[10px] border px-3 sm:px-3.5',
          'transition-[border-color,background] duration-[200ms]',
          'bg-[#111113]',
          focused
            ? 'border-[rgba(255,255,255,0.24)]'
            : 'border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.14)]'
        )}
      >
        {isSearching ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--red-line)]" />
        ) : (
          <Search className="h-4 w-4 shrink-0 text-[#A1A1A6]" />
        )}
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(0)
          }}
          onFocus={() => setFocused(true)}
          onKeyDown={onKeyDown}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="search-results"
          aria-label="Search channels and shows"
          placeholder="Search channels, shows, sport…"
          className="h-full flex-1 bg-transparent text-[13px] text-[#F4F4F5] outline-none placeholder:text-[#A1A1A6]"
        />
        {query ? (
          <div className="flex items-center gap-1.5">
            {isSearching && (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--red-line)]" />
            )}
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
              className="rounded-[6px] p-1 text-[#A1A1A6] transition-colors hover:text-[#F4F4F5]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <span className="hidden shrink-0 items-center gap-1 rounded-[6px] border border-[rgba(255,255,255,0.07)] px-1.5 py-0.5 text-[11px] font-[500] text-[#A1A1A6] lg:flex">
            Ctrl+K
          </span>
        )}
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            id="search-results"
            role="listbox"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={tween(0.16)}
            className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-[12px] border border-[rgba(255,255,255,0.12)] bg-[#121215]/95 backdrop-blur-[36px] shadow-[0_24px_64px_rgba(0,0,0,0.92)]"
          >
            {query.length === 0 ? (
              <div className="p-4">
                {recentSearches.length > 0 ? (
                  <>
                    <p className="px-2 pb-2 text-[12px] font-[600] uppercase tracking-[0.12em] text-[#A1A1A6]">
                      Recent
                    </p>
                    <div className="flex flex-wrap gap-2 px-2 pb-3">
                      {recentSearches.map((term) => (
                        <button
                          key={term}
                          type="button"
                          onClick={() => {
                            setQuery(term)
                            setActiveIndex(0)
                          }}
                          className="flex items-center gap-1.5 rounded-[8px] border border-[rgba(255,255,255,0.07)] bg-[#18181B] px-2.5 py-1.5 text-[12px] text-[#A1A1A6] transition-colors duration-[120ms] hover:border-[rgba(255,255,255,0.14)] hover:text-[#F4F4F5]"
                        >
                          <Clock3 className="h-3 w-3" />
                          {term}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
                <p className="px-2 pb-2 text-[12px] font-[600] uppercase tracking-[0.12em] text-[#A1A1A6]">
                  Browse
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {['Sports', 'News', 'Movies', 'Kids', 'Entertainment', 'Regional'].map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => setQuery(term)}
                      className="flex items-center justify-between rounded-[8px] px-3 py-2 text-left text-[13px] text-[#A1A1A6] transition-colors duration-[120ms] hover:bg-white/[0.05] hover:text-[#F4F4F5]"
                    >
                      {term}
                      <ArrowRight className="h-3.5 w-3.5 opacity-40" />
                    </button>
                  ))}
                </div>
              </div>
            ) : isSearching && results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-5 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--red-line)] mb-2.5" />
                <p className="text-[13px] font-medium text-text-primary">Searching channels and shows…</p>
                <p className="mt-1 text-[12px] text-text-secondary">
                  Finding best matches for “{query}”
                </p>
              </div>
            ) : results.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-[13px] font-medium text-text-primary">No matches for “{query}”</p>
                <p className="mt-1 text-[12px] text-text-secondary">
                  Try a channel number, language or a show title.
                </p>
              </div>
            ) : (
              <>
                {isSearching && (
                  <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-medium text-[#A1A1A6] border-b border-white/[0.06] bg-white/[0.02]">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin text-[var(--red-line)]" />
                      Searching…
                    </span>
                    <span className="text-[10px] text-white/40">Updating</span>
                  </div>
                )}
                <ul ref={listRef} className="max-h-[420px] overflow-y-auto p-2 flex flex-col gap-2">
                  {results.map((channel, index) => (
                    <li
                      key={channel.id}
                      role="option"
                      aria-selected={index === activeIndex}
                      onMouseEnter={() => setActiveIndex(index)}
                    >
                      <ChannelListRow
                        channel={channel}
                        programs={epg[channel.id]}
                        selected={index === activeIndex}
                        onClick={() => openChannel(channel, query.trim())}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

