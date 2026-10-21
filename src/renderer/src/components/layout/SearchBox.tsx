import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Clock3, Search, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { tween } from '@/lib/motion'
import { useDebounce } from '@/hooks/useDebounce'
import { useChannelStore } from '@/store/useChannelStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { getNowNext } from '@/lib/time'
import { useNow } from '@/hooks/useNow'
import { ChannelLogo } from '@/components/ui/ChannelLogo'
import type { Channel } from '@shared/types'

/**
 * Expanding search field (420 → 560px) with a live result dropdown.
 * Ctrl/Cmd+K focuses it from anywhere; the input owns its own keyboard model.
 */
export function SearchBox(): JSX.Element {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const debouncedQuery = useDebounce(query, 160)
  const channels = useChannelStore((state) => state.channels)
  const epg = useChannelStore((state) => state.epg)
  const recentSearches = useSettingsStore((state) => state.recentSearches)
  const addRecentSearch = useSettingsStore((state) => state.addRecentSearch)
  const now = useNow()

  const results = useMemo(() => {
    const term = debouncedQuery.trim().toLowerCase()
    if (!term) return []
    return channels
      .filter((channel) => {
        const current = getNowNext(epg[channel.id] ?? [], now).current
        return (
          channel.name.toLowerCase().includes(term) ||
          channel.language.toLowerCase().includes(term) ||
          channel.category.includes(term) ||
          channel.number.toString().includes(term) ||
          current?.title.toLowerCase().includes(term)
        )
      })
      .slice(0, 6)
  }, [channels, debouncedQuery, epg, now])

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

  const openChannel = (channel: Channel, term?: string) => {
    if (term) addRecentSearch(term)
    setFocused(false)
    setQuery('')
    navigate(`/watch/${channel.id}`)
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

  const open = focused && (results.length > 0 || query.length === 0)

  return (
    <div ref={containerRef} className="relative no-drag">
      <div
        className={cn(
          'flex h-11 items-center gap-3 rounded-2xl border px-4 transition-all duration-300 ease-premium',
          'w-[420px] focus-within:w-[560px]',
          focused
            ? 'border-accent/40 bg-white/[0.07] shadow-[0_0_0_1px_rgba(124,92,255,.25),0_18px_50px_-24px_rgba(124,92,255,.7)]'
            : 'border-white/[0.07] bg-white/[0.035] hover:border-white/15'
        )}
      >
        <Search className={cn('h-4 w-4 shrink-0', focused ? 'text-accent-glow' : 'text-text-muted')} />
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
          className="h-full flex-1 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-muted"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
            className="rounded-md p-1 text-text-muted hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="hidden shrink-0 items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-text-muted lg:flex">
            Ctrl K
          </span>
        )}
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            id="search-results"
            role="listbox"
            initial={{ opacity: 0, y: 8, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.99 }}
            transition={tween(0.18)}
            className="glass-strong absolute left-0 right-0 top-[calc(100%+10px)] z-50 overflow-hidden rounded-panel"
          >
            {query.length === 0 ? (
              <div className="p-4">
                {recentSearches.length > 0 ? (
                  <>
                    <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
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
                          className="flex items-center gap-1.5 rounded-pill border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-text-secondary transition-colors hover:bg-white/[0.09] hover:text-white"
                        >
                          <Clock3 className="h-3 w-3" />
                          {term}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
                <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Browse
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {['Sports', 'News', 'Movies', 'Kids', 'Entertainment', 'Regional'].map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => setQuery(term)}
                      className="flex items-center justify-between rounded-xl px-3 py-2 text-left text-[12px] text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-white"
                    >
                      {term}
                      <ArrowRight className="h-3.5 w-3.5 opacity-40" />
                    </button>
                  ))}
                </div>
              </div>
            ) : results.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-[13px] font-medium text-text-primary">No matches for “{query}”</p>
                <p className="mt-1 text-[12px] text-text-muted">
                  Try a channel number, language or a show title.
                </p>
              </div>
            ) : (
              <ul className="max-h-[380px] overflow-y-auto p-2">
                {results.map((channel, index) => {
                  const current = getNowNext(epg[channel.id] ?? [], now).current
                  return (
                    <li key={channel.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={index === activeIndex}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => openChannel(channel, query.trim())}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                          index === activeIndex ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'
                        )}
                      >
                        <ChannelLogo channel={channel} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-text-primary">
                            {channel.name}
                          </span>
                          <span className="block truncate text-[11px] text-text-muted">
                            {current ? `Now: ${current.title}` : `${channel.category} · ${channel.language}`}
                          </span>
                        </span>
                        <span className="shrink-0 text-[10px] font-semibold tabular-nums text-text-muted">
                          {channel.number}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
