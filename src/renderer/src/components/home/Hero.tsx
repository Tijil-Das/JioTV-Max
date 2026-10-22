import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import type { StreamInfo } from '@shared/types'
import { cn } from '@/lib/cn'
import { highestQuality } from '@/lib/constants'
import { formatRange, getNowNext, getProgress } from '@/lib/time'
import { useNow } from '@/hooks/useNow'
import { useHeroPlayer } from '@/hooks/useHeroPlayer'
import { channelService } from '@/services/channelService'
import {
  featuredService,
  loadHeroLast,
  saveHeroLast,
  type HeroCandidate
} from '@/services/featuredService'
import { streamProbe } from '@/services/streamProbe'
import { useChannelStore } from '@/store/useChannelStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { Button } from '@/components/ui/Button'
import { ChannelLogo, ChannelLogoCell } from '@/components/ui/ChannelLogo'

/**
 * Addendum 3 §8 — live hero.
 *
 * Only verified channels reach the hero. Candidates come from the deterministic
 * featured ranking (§6) and are probed through the same resolve path as the
 * player (§7). The first verified candidate owns the stage; up to six verified
 * channels form the switcher. With zero verified channels the hero collapses
 * (1fr → 0fr, 300ms) and leaves no placeholder.
 */

const MAX_SWITCHER = 6
const RERANK_MS = 15 * 60_000
const HOVER_DWELL_MS = 250
const VERIFY_WINDOW = 12
const SWITCHER_WANTED = 3

export function Hero(): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const now = useNow()
  const prefersReducedMotion = useReducedMotion()
  const livePreviewOnHome = useSettingsStore((state) => state.livePreviewOnHome)
  const reduceMotion = useSettingsStore((state) => state.reduceMotion)
  const mode = useSettingsStore((state) => state.mode)
  const defaultQuality = useSettingsStore((state) => state.defaultQuality)
  const channels = useChannelStore((state) => state.channels)
  const epg = useChannelStore((state) => state.epg)
  const still = Boolean(prefersReducedMotion) || reduceMotion

  const [candidates, setCandidates] = useState<HeroCandidate[]>([])
  const [verified, setVerified] = useState<string[]>([])
  const [failed, setFailed] = useState<string[]>([])
  const [windowSize, setWindowSize] = useState(VERIFY_WINDOW)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeStream, setActiveStream] = useState<StreamInfo | null>(null)
  const [userPaused, setUserPaused] = useState(false)
  const [overridePlay, setOverridePlay] = useState(false)
  const [inView, setInView] = useState(true)
  const [documentVisible, setDocumentVisible] = useState(
    typeof document === 'undefined' ? true : !document.hidden
  )

  const sectionRef = useRef<HTMLElement>(null)
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const dwellRef = useRef<{ id: string; timer: number } | null>(null)

  const channelById = useMemo(
    () => new Map(channels.map((channel) => [channel.id, channel])),
    [channels]
  )
  const debugHero = new URLSearchParams(location.search).get('debug') === 'hero'

  // ---- Deterministic ranking, reranked on boundaries and every 15 minutes ---
  useEffect(() => {
    let cancelled = false
    const rank = async (): Promise<void> => {
      const next = await featuredService.getHeroCandidates(new Date())
      if (cancelled) return
      setCandidates((previous) => {
        if (previous.length === 0) return next
        // Stable merge: keep the existing order for channels that still rank so
        // a rerank never swaps the stage abruptly.
        const rankedIds = new Set(next.map((candidate) => candidate.channel.id))
        const kept = previous.filter((candidate) => rankedIds.has(candidate.channel.id))
        const keptIds = new Set(kept.map((candidate) => candidate.channel.id))
        return [...kept, ...next.filter((candidate) => !keptIds.has(candidate.channel.id))]
      })
    }
    void rank()
    const timer = window.setInterval(() => void rank(), RERANK_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [channels.length])

  // ---- Stream verification (max 3 probes in flight, service-scheduled) -----
  useEffect(() => {
    const slice = candidates.slice(0, windowSize)
    if (slice.length === 0) return
    let cancelled = false
    let settled = 0
    let okCount = 0
    for (const candidate of slice) {
      const id = candidate.channel.id
      void streamProbe.verify(id).then((ok) => {
        if (cancelled) return
        settled += 1
        if (ok) {
          okCount += 1
          setVerified((previous) => (previous.includes(id) ? previous : [...previous, id]))
        } else {
          setFailed((previous) => (previous.includes(id) ? previous : [...previous, id]))
        }
        if (settled === slice.length && okCount < SWITCHER_WANTED && windowSize < candidates.length) {
          setWindowSize((size) => Math.min(candidates.length, size + VERIFY_WINDOW))
        }
      })
    }
    return () => {
      cancelled = true
    }
  }, [candidates, windowSize])

  const verifiedOrdered = useMemo(
    () =>
      candidates
        .map((candidate) => candidate.channel.id)
        .filter((id) => verified.includes(id))
        .slice(0, MAX_SWITCHER),
    [candidates, verified]
  )
  const verifiedKey = verifiedOrdered.join('|')

  // ---- Active channel: prefer the last good hero across sessions -----------
  useEffect(() => {
    if (verifiedOrdered.length === 0) {
      setActiveId(null)
      return
    }
    setActiveId((previous) => {
      if (previous && verifiedOrdered.includes(previous)) return previous
      const remembered = loadHeroLast().find((id) => verifiedOrdered.includes(id))
      return remembered ?? verifiedOrdered[0]
    })
    saveHeroLast(verifiedOrdered)
  }, [verifiedKey])

  // ---- Resolve the URL for the active channel through the player path ------
  useEffect(() => {
    if (!activeId) {
      setActiveStream(null)
      return
    }
    const handoff = streamProbe.lastStream(activeId)
    if (handoff) {
      setActiveStream(handoff)
      return
    }
    const channel = channelById.get(activeId)
    if (!channel) {
      setActiveStream(null)
      return
    }
    let cancelled = false
    setActiveStream(null)
    void channelService
      .getStream(channel, mode, defaultQuality)
      .then((stream) => {
        if (!cancelled) setActiveStream(stream)
      })
      .catch(() => {
        if (!cancelled) setActiveStream(null)
      })
    return () => {
      cancelled = true
    }
  }, [activeId, channelById, mode, defaultQuality])

  // ---- Preview state -------------------------------------------------------
  const previewAllowed = overridePlay || (livePreviewOnHome && !still)
  const canPlay = previewAllowed && inView && documentVisible
  const enabled = canPlay && Boolean(activeId) && Boolean(activeStream)
  const previewOn = enabled && !userPaused

  const handleFailure = useCallback((channelId: string) => {
    // Watchdog verdict: negative-cache the channel and drop it from the hero.
    streamProbe.markFailure(channelId)
    setVerified((previous) => previous.filter((id) => id !== channelId))
    setFailed((previous) => (previous.includes(channelId) ? previous : [...previous, channelId]))
  }, [])

  const { videoRefs, opacity, destroyAll } = useHeroPlayer({
    stream: enabled ? activeStream : null,
    channelId: enabled ? activeId : null,
    enabled,
    paused: userPaused,
    onFailure: handleFailure
  })

  // ---- Lifecycle: stop below 25% visibility, on hidden, on route leave -----
  useEffect(() => {
    const element = sectionRef.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setInView(entry.intersectionRatio >= 0.25)
      },
      { threshold: [0, 0.25, 0.5, 1] }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onVisibility = (): void => setDocumentVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => () => streamProbe.destroyProbePlayers(), [])

  // ---- Auto scroll to top when hero is loaded (if user hasn't scrolled) ----
  const userHasScrolled = useRef(false)
  const hasAutoScrolled = useRef(false)

  useEffect(() => {
    const markScrolled = (): void => {
      userHasScrolled.current = true
    }
    window.addEventListener('wheel', markScrolled, { passive: true })
    window.addEventListener('touchmove', markScrolled, { passive: true })
    const onKeyDown = (e: KeyboardEvent): void => {
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Space'].includes(e.code)) {
        userHasScrolled.current = true
      }
    }
    window.addEventListener('keydown', onKeyDown)
    if (window.scrollY > 20) {
      userHasScrolled.current = true
    }
    return () => {
      window.removeEventListener('wheel', markScrolled)
      window.removeEventListener('touchmove', markScrolled)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  // ---- Interaction ---------------------------------------------------------
  const select = useCallback((id: string) => {
    setUserPaused(false)
    setActiveId(id)
  }, [])

  const cancelDwell = useCallback(() => {
    if (dwellRef.current) window.clearTimeout(dwellRef.current.timer)
    dwellRef.current = null
  }, [])

  const startDwell = useCallback(
    (id: string) => {
      if (id === activeId) return
      cancelDwell()
      dwellRef.current = { id, timer: window.setTimeout(() => select(id), HOVER_DWELL_MS) }
    },
    [activeId, cancelDwell, select]
  )

  const [tooltipId, setTooltipId] = useState<string | null>(null)
  const tooltipTimer = useRef<number | null>(null)

  const showTooltip = useCallback((id: string) => {
    if (tooltipTimer.current) window.clearTimeout(tooltipTimer.current)
    tooltipTimer.current = window.setTimeout(() => setTooltipId(id), 400)
  }, [])

  const hideTooltip = useCallback(() => {
    if (tooltipTimer.current) window.clearTimeout(tooltipTimer.current)
    tooltipTimer.current = null
    setTooltipId(null)
  }, [])

  const onTablistKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const ids = verifiedOrdered
    if (ids.length === 0) return
    const index = activeId ? ids.indexOf(activeId) : -1
    let next = -1
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1 + ids.length) % ids.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + ids.length) % ids.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = ids.length - 1
    else if (event.key === 'Enter') {
      if (activeId) {
        event.preventDefault()
        watch(activeId)
        return
      }
    }
    if (next < 0) return
    event.preventDefault()
    const id = ids[next]
    select(id)
    chipRefs.current[id]?.focus()
  }

  const watch = useCallback(
    (id: string): void => {
      const handoff = streamProbe.lastStream(id)
      streamProbe.destroyProbePlayers()
      destroyAll()
      navigate(`/watch/${id}`, handoff ? { state: { stream: handoff } } : undefined)
    },
    [destroyAll, navigate]
  )

  // ---- Render (Addendum 3 §8) -----------------------------------------------
  const expanded = verifiedOrdered.length > 0
  const activeChannel = activeId ? channelById.get(activeId) ?? null : null
  const current = activeChannel ? getNowNext(epg[activeChannel.id] ?? [], now).current : null
  const quality = activeChannel ? highestQuality(activeChannel) : ''
  const progress = current ? getProgress(current, now) : 0
  const artwork = current?.artworkUrl ?? ''

  // Auto scroll to upper hero section once all hero content is loaded, if user hasn't scrolled yet
  useEffect(() => {
    if (!expanded || !activeChannel || hasAutoScrolled.current) return
    hasAutoScrolled.current = true
    if (!userHasScrolled.current && window.scrollY > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [expanded, activeChannel])

  const activeIdx = activeId ? verifiedOrdered.indexOf(activeId) : 0
  const prevId =
    verifiedOrdered.length > 1
      ? verifiedOrdered[(activeIdx - 1 + verifiedOrdered.length) % verifiedOrdered.length]
      : null
  const nextId =
    verifiedOrdered.length > 1
      ? verifiedOrdered[(activeIdx + 1) % verifiedOrdered.length]
      : null
  const prevChannel = prevId ? channelById.get(prevId) ?? null : null
  const nextChannel = nextId ? channelById.get(nextId) ?? null : null

  const cleanTitle = useMemo(() => {
    if (current?.title) return current.title
    return activeChannel?.name.replace(/\s+live$/i, '') ?? ''
  }, [current, activeChannel])

  const metaParts = useMemo(() => {
    if (!activeChannel) return []
    const parts: string[] = []
    if (current) {
      parts.push(formatRange(current.start, current.end))
      const endMs = new Date(current.end).getTime()
      const nowMs = now.getTime()
      if (endMs > nowMs) {
        const minsLeft = Math.max(1, Math.round((endMs - nowMs) / 60000))
        parts.push(`${minsLeft} min left`)
      }
    }
    if (activeChannel.language) {
      parts.push(activeChannel.language)
    }
    if (quality) {
      parts.push(quality)
    }
    return parts
  }, [activeChannel, current, now, quality])

  return (
    <div
      className="relative z-0 transition-[margin] duration-300 ease-out"
      style={{ marginBottom: expanded ? -40 : 40 }}
    >
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
        aria-hidden={!expanded}
      >
        <div className="min-h-0 overflow-hidden">
          <section
            ref={sectionRef}
            aria-label="Featured live channel"
            onClick={() => activeChannel && watch(activeChannel.id)}
            className="group/hero relative h-[clamp(440px,60vh,640px)] w-full cursor-pointer select-none overflow-hidden bg-[#0A0A0B]"
          >
            {/* Center flex container: 16:9 video frame with adjacent channels peeping on wide screens */}
            <div className="relative mx-auto flex h-full w-full items-center justify-center overflow-hidden">
              {/* Previous channel peeping from left */}
              {prevChannel && verifiedOrdered.length > 1 ? (
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Watch ${prevChannel.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    watch(prevChannel.id)
                  }}
                  onMouseEnter={() => showTooltip(prevChannel.id)}
                  onMouseLeave={hideTooltip}
                  className={cn(
                    'group/left relative hidden h-[84%] flex-1 max-w-[280px] min-w-[70px] shrink cursor-pointer items-center justify-end overflow-hidden',
                    'rounded-l-2xl border-y border-l border-white/[0.08] bg-[#0E0E10]/95 backdrop-blur-md',
                    'transition-all duration-300 hover:border-white/[0.22] hover:bg-[#151518] hover:scale-[1.01] xl:flex'
                  )}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/40 to-black/75" />
                  <div className="relative z-10 flex flex-col items-center justify-center gap-2 p-4 text-center">
                    <div className="h-10 w-10 shrink-0 filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                      <ChannelLogo channel={prevChannel} size="cell" priority="visible" />
                    </div>
                    <span className="rounded-[6px] border border-white/10 bg-white/10 px-2 py-0.5 font-sans text-[11px] font-[650] tabular-nums text-[#F4F4F5]">
                      CH {prevChannel.number}
                    </span>
                    <p className="line-clamp-1 max-w-[150px] text-[13px] font-[600] text-[#A1A1A6] group-hover/left:text-[#F4F4F5]">
                      {prevChannel.name}
                    </p>
                    <span className="flex items-center gap-1 text-[11px] font-[500] text-[#8A8A91] transition-colors group-hover/left:text-[var(--red)]">
                      <ChevronLeft className="h-3 w-3" /> Click to watch
                    </span>
                  </div>
                </div>
              ) : null}

              {/* Active 16:9 Video & Content Stage: Never cuts top or bottom */}
              <div className="relative h-full aspect-[16/9] max-w-full shrink-0 overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.9)] z-20">
                {/* Static backdrop: real EPG artwork when present */}
                <div className="absolute inset-0" aria-hidden>
                  {artwork ? (
                    <img
                      src={artwork}
                      alt=""
                      className="h-full w-full object-cover object-center opacity-30"
                      draggable={false}
                    />
                  ) : null}
                </div>

                {/* A/B video slots: max two hls instances, 400ms crossfade, full 16:9 aspect */}
                <div className="absolute inset-0" aria-hidden>
                  {[0, 1].map((slot) => (
                    <video
                      key={slot}
                      ref={videoRefs[slot]}
                      muted
                      autoPlay
                      playsInline
                      disablePictureInPicture
                      disableRemotePlayback
                      tabIndex={-1}
                      aria-hidden
                      className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                      style={{
                        objectPosition: 'center 30%',
                        opacity: opacity[slot],
                        transition: 'opacity 500ms ease'
                      }}
                    />
                  ))}
                </div>

                {/* Scrims: the only gradients in the app (Addendum 3 §8) */}
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[96px]"
                  aria-hidden
                  style={{
                    background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)'
                  }}
                />
                <div
                  className="pointer-events-none absolute inset-0 z-10"
                  aria-hidden
                  style={{
                    background: 'linear-gradient(to right, rgba(0,0,0,0.92) 0%, transparent 60%)'
                  }}
                />
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[200px]"
                  aria-hidden
                  style={{
                    background: 'linear-gradient(to top, rgba(0,0,0,1) 0%, transparent 100%)'
                  }}
                />
                <div
                  className="pointer-events-none absolute inset-0 z-10 bg-black/20"
                  aria-hidden
                />
                {!previewOn ? (
                  <div
                    className="pointer-events-none absolute inset-0 z-10"
                    aria-hidden
                    style={{
                      background:
                        'radial-gradient(circle at 75% 50%, rgba(225,29,46,0.06) 0%, transparent 65%)'
                    }}
                  />
                ) : null}

                {/* Content: left, bottom-aligned, max-width 560px, 48px gutter, 56px bottom padding, 12px rhythm */}
                {activeChannel ? (
                  <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col px-[var(--gutter)] pb-[56px]">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activeChannel.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.2 }}
                        className="flex max-w-[560px] flex-col gap-3"
                      >
                        {/* 1. Processed logo, max 36px tall and 160px wide, black drop-shadow */}
                        <div
                          className="flex h-9 max-w-[160px] items-center"
                          style={{ filter: 'drop-shadow(0 2px 12px rgba(0,0,0,0.6))' }}
                        >
                          <ChannelLogo channel={activeChannel} size="hero" priority="visible" />
                        </div>

                        {/* 2. Overline: 6px red dot + LIVE NOW (11/600, 0.12em, text-2) + · CH 155 (12/650 tabular text-1) */}
                        <div className="flex items-center gap-2">
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--red)]"
                            aria-hidden
                          />
                          <span className="text-[11px] font-[600] uppercase tracking-[0.12em] text-[#A1A1A6]">
                            LIVE NOW
                          </span>
                          <span className="font-sans text-[12px] font-[650] tabular-nums text-[#F4F4F5]">
                            · CH {activeChannel.number}
                          </span>
                        </div>

                        {/* 3. Title: current EPG program title, 52/700/-0.03em, max 2 lines */}
                        <h1 className="line-clamp-2 text-[52px] font-[700] leading-[1.05] tracking-[-0.03em] text-[#F4F4F5]">
                          {cleanTitle}
                        </h1>

                        {/* 4. Meta: 6:00 – 7:00 PM · 42 min left · English · HD + 140px 2px progress bar */}
                        {metaParts.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-2 text-[14px] font-[500] text-[#A1A1A6]">
                            <span>{metaParts.join(' · ')}</span>
                            {current && progress > 0 ? (
                              <span
                                aria-hidden="true"
                                className="inline-block h-[2px] w-[140px] overflow-hidden rounded-full bg-white/[0.12]"
                              >
                                <span
                                  className="block h-full bg-[var(--red)]"
                                  style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
                                />
                              </span>
                            ) : null}
                          </div>
                        ) : null}

                        {/* 5. Description: EPG only, max 2 lines, text-2, max 520px */}
                        {current?.description ? (
                          <p className="line-clamp-2 max-w-[520px] text-[14px] font-[450] leading-relaxed text-[#A1A1A6]">
                            {current.description}
                          </p>
                        ) : null}

                        {/* 6. Buttons: Primary "Watch live", Secondary "Guide" */}
                        <div className="mt-1 flex items-center gap-3">
                          <Button
                            variant="primary"
                            size="lg"
                            icon={<Play className="h-4 w-4 fill-current" />}
                            onClick={(e) => {
                              e.stopPropagation()
                              watch(activeChannel.id)
                            }}
                          >
                            Watch live
                          </Button>
                          <Button
                            variant="ghost"
                            size="lg"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/guide?channel=${activeChannel.id}`)
                            }}
                          >
                            Guide
                          </Button>
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                ) : null}

                {/* Always-on 32px pause/play icon button (accessibility) */}
                {activeChannel ? (
                  <button
                    type="button"
                    title={previewOn ? 'Pause live preview' : 'Play live preview'}
                    aria-label={previewOn ? 'Pause live preview' : 'Play live preview'}
                    aria-pressed={previewOn}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (previewOn) {
                        setUserPaused(true)
                      } else {
                        setOverridePlay(true)
                        setUserPaused(false)
                      }
                    }}
                    className={cn(
                      'absolute right-[24px] top-[76px] z-30 flex h-8 w-8 items-center justify-center rounded-full',
                      'border border-[rgba(255,255,255,0.14)] bg-black/55 text-[#F4F4F5] backdrop-blur-sm',
                      'transition-colors duration-150 hover:bg-black/75',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--red-line)]'
                    )}
                  >
                    {previewOn ? (
                      <Pause className="h-3.5 w-3.5 fill-current" strokeWidth={0} />
                    ) : (
                      <Play className="ml-[1px] h-3.5 w-3.5 fill-current" strokeWidth={0} />
                    )}
                  </button>
                ) : null}

                {/* Channel Switcher (bottom-right inside active 16:9 stage): up to 6 plates of 56x56 */}
                {verifiedOrdered.length > 0 ? (
                  <div
                    role="tablist"
                    aria-label="Verified featured channels"
                    onKeyDown={onTablistKeyDown}
                    className="absolute bottom-[56px] right-[24px] z-30 flex items-center gap-[10px]"
                  >
                    {verifiedOrdered.map((id) => {
                      const channel = channelById.get(id)
                      if (!channel) return null
                      const selected = id === activeId
                      return (
                        <div key={id} className="relative">
                          {tooltipId === id ? (
                            <div
                              role="tooltip"
                              className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2.5 -translate-x-1/2 whitespace-nowrap rounded-[8px] border border-[rgba(255,255,255,0.12)] bg-[#111113] px-2.5 py-1 text-[12px] font-[500] text-[#F4F4F5] shadow-lg"
                            >
                              {channel.name} · CH {channel.number}
                            </div>
                          ) : null}
                          <button
                            ref={(element) => {
                              chipRefs.current[id] = element
                            }}
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            tabIndex={selected ? 0 : -1}
                            title={channel.name}
                            aria-label={`Show ${channel.name}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              watch(id)
                            }}
                            onMouseEnter={() => {
                              startDwell(id)
                              showTooltip(id)
                            }}
                            onMouseLeave={() => {
                              cancelDwell()
                              hideTooltip()
                            }}
                            onFocus={() => {
                              cancelDwell()
                              showTooltip(id)
                            }}
                            onBlur={hideTooltip}
                            className={cn(
                              'relative rounded-[12px] transition-opacity duration-150',
                              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--red-line)]',
                              selected
                                ? 'opacity-100 after:absolute after:inset-[-2px] after:rounded-[14px] after:border-2 after:border-[var(--red-line)] after:content-[""]'
                                : 'opacity-60 hover:opacity-100'
                            )}
                          >
                            <ChannelLogoCell channel={channel} priority="visible" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>

              {/* Next channel peeping from right */}
              {nextChannel && verifiedOrdered.length > 1 ? (
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Watch ${nextChannel.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    watch(nextChannel.id)
                  }}
                  onMouseEnter={() => showTooltip(nextChannel.id)}
                  onMouseLeave={hideTooltip}
                  className={cn(
                    'group/right relative hidden h-[84%] flex-1 max-w-[280px] min-w-[70px] shrink cursor-pointer items-center justify-start overflow-hidden',
                    'rounded-r-2xl border-y border-r border-white/[0.08] bg-[#0E0E10]/95 backdrop-blur-md',
                    'transition-all duration-300 hover:border-white/[0.22] hover:bg-[#151518] hover:scale-[1.01] xl:flex'
                  )}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/40 to-black/85" />
                  <div className="relative z-10 flex flex-col items-center justify-center gap-2 p-4 text-center">
                    <div className="h-10 w-10 shrink-0 filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                      <ChannelLogo channel={nextChannel} size="cell" priority="visible" />
                    </div>
                    <span className="rounded-[6px] border border-white/10 bg-white/10 px-2 py-0.5 font-sans text-[11px] font-[650] tabular-nums text-[#F4F4F5]">
                      CH {nextChannel.number}
                    </span>
                    <p className="line-clamp-1 max-w-[150px] text-[13px] font-[600] text-[#A1A1A6] group-hover/right:text-[#F4F4F5]">
                      {nextChannel.name}
                    </p>
                    <span className="flex items-center gap-1 text-[11px] font-[500] text-[#8A8A91] transition-colors group-hover/side-right:text-[var(--red)]">
                      Click to watch <ChevronRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            {/* ?debug=hero — candidate scores and verification verdicts */}
            {debugHero ? (
              <div className="absolute left-[var(--gutter)] top-[76px] z-30 max-h-[70%] w-[380px] overflow-auto rounded-[12px] border border-[rgba(255,255,255,0.14)] bg-black/85 p-3 font-mono text-[12px] leading-relaxed text-[#A1A1A6]">
                <p className="mb-2 text-[12px] font-[600] text-[#F4F4F5]">
                  hero debug · verified {verifiedOrdered.length} · failed {failed.length}
                </p>
                {candidates.slice(0, VERIFY_WINDOW).map((candidate) => {
                  const id = candidate.channel.id
                  const state = verified.includes(id) ? 'ok' : failed.includes(id) ? 'fail' : '…'
                  const sources = Object.entries(candidate.sources)
                    .map(([key, value]) => `${key}:${value.toFixed(2)}`)
                    .join(' ')
                  return (
                    <p key={id}>
                      {String(candidate.channel.number).padStart(3, '0')} {candidate.channel.name} ·{' '}
                      {candidate.score.toFixed(3)} · {sources || 'fallback'} · {state}
                    </p>
                  )
                })}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  )
}
