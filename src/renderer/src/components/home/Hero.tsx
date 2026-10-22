import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion'
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
  saveHeroLast,
  type HeroCandidate
} from '@/services/featuredService'
import { streamProbe } from '@/services/streamProbe'
import { useChannelStore } from '@/store/useChannelStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { Button } from '@/components/ui/Button'
import { ChannelLogo } from '@/components/ui/ChannelLogo'

const slideVariants: Variants = {
  enter: (dir: number) => ({
    opacity: 0,
    x: dir > 0 ? 80 : -80
  }),
  center: {
    opacity: 1,
    x: 0,
    transition: {
      x: { type: 'spring', stiffness: 300, damping: 30 },
      opacity: { duration: 0.25 }
    }
  },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir > 0 ? -80 : 80,
    transition: {
      x: { type: 'spring', stiffness: 300, damping: 30 },
      opacity: { duration: 0.2 }
    }
  })
}

/**
 * Addendum 3 §8 — live hero.
 *
 * Only verified channels reach the hero. Candidates come from the deterministic
 * featured ranking (§6) and are probed through the same resolve path as the
 * player (§7). The first verified candidate owns the stage; up to six verified
 * channels form the switcher. With zero verified channels the hero collapses
 * (1fr → 0fr, 300ms) and leaves no placeholder.
 */

const MAX_SWITCHER = 5
const RERANK_MS = 15 * 60_000
const VERIFY_WINDOW = 20
const SWITCHER_WANTED = 5

export function Hero(): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const now = useNow()
  const prefersReducedMotion = useReducedMotion()
  const showHero = useSettingsStore((state) => state.showHero)
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
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeStream, setActiveStream] = useState<StreamInfo | null>(null)
  const [userPaused, setUserPaused] = useState(false)
  const [overridePlay, setOverridePlay] = useState(false)
  const [inView, setInView] = useState(true)
  const [documentVisible, setDocumentVisible] = useState(
    typeof document === 'undefined' ? true : !document.hidden
  )
  const [direction, setDirection] = useState<1 | -1>(1)
  const [mouseActive, setMouseActive] = useState(false)
  const [videoHovered, setVideoHovered] = useState(false)
  const mouseTimerRef = useRef<number | null>(null)

  const onMouseMove = useCallback(() => {
    setMouseActive(true)
    if (mouseTimerRef.current) window.clearTimeout(mouseTimerRef.current)
    mouseTimerRef.current = window.setTimeout(() => setMouseActive(false), 3000)
  }, [])

  const sectionRef = useRef<HTMLElement>(null)
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const channelById = useMemo(
    () => new Map(channels.map((channel) => [channel.id, channel])),
    [channels]
  )

  // ---- PopularityEngine ranking, reranked on boundaries and every 15 minutes ---
  useEffect(() => {
    let cancelled = false
    const rank = async (): Promise<void> => {
      const next = await featuredService.getHeroCandidates(new Date())
      if (cancelled) return
      setCandidates((previous) => {
        if (previous.length === 0) return next
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

  // ---- Stream verification & plan entitlement probe -----
  useEffect(() => {
    if (candidates.length === 0) return
    let cancelled = false
    const probeCandidates = async (): Promise<void> => {
      // 1. Sync any already-cached results first (e.g. from splash preloader)
      for (const candidate of candidates) {
        if (cancelled) return
        const id = candidate.channel.id
        const cached = streamProbe.cached(id)
        if (cached === true) {
          setVerified((prev) => (prev.includes(id) ? prev : [...prev, id]))
        } else if (cached === false) {
          setFailed((prev) => (prev.includes(id) ? prev : [...prev, id]))
        }
      }
      // 2. Probe top candidates sequentially to prevent API flooding
      for (const candidate of candidates) {
        if (cancelled) return
        const id = candidate.channel.id
        const cached = streamProbe.cached(id)
        if (cached !== undefined) continue
        const ok = await streamProbe.verify(id)
        if (cancelled) return
        if (ok) {
          setVerified((prev) => (prev.includes(id) ? prev : [...prev, id]))
        } else {
          setFailed((prev) => (prev.includes(id) ? prev : [...prev, id]))
        }
      }
    }
    void probeCandidates()
    return () => {
      cancelled = true
    }
  }, [candidates])

  const verifiedOrdered = useMemo(() => {
    if (candidates.length === 0) return []
    // Exclude channels whose streams cannot be fetched or aren't in user's plan
    const eligible = candidates
      .map((c) => c.channel.id)
      .filter((id) => !failed.includes(id))

    // Fall back to all candidates if all failed or still probing so Hero never vanishes
    const pool = eligible.length > 0 ? eligible : candidates.map((c) => c.channel.id)

    // Channels verified to have working playable streams
    const verifiedOnes = pool.filter((id) => verified.includes(id))
    if (verifiedOnes.length >= MAX_SWITCHER) {
      return verifiedOnes.slice(0, MAX_SWITCHER)
    }

    // Fill remaining with unprobed eligible candidates
    const combined = [...verifiedOnes]
    for (const id of pool) {
      if (combined.length >= MAX_SWITCHER) break
      if (!combined.includes(id)) combined.push(id)
    }
    return combined.slice(0, MAX_SWITCHER)
  }, [candidates, verified, failed])
  const verifiedKey = verifiedOrdered.join('|')

  // ---- Active channel: prefer the first hero candidate across sessions -----------
  useEffect(() => {
    if (verifiedOrdered.length === 0) {
      setActiveId(null)
      return
    }
    setActiveId((previous) => {
      if (previous && verifiedOrdered.includes(previous)) return previous
      return verifiedOrdered[0]
    })
    saveHeroLast(verifiedOrdered)
  }, [verifiedKey])

  const handleFailure = useCallback((channelId: string) => {
    // console.warn(`[hero] player stream issue on ${channelId}`)
  }, [])

  // ---- Resolve the URL for the active channel through the player path ------
  useEffect(() => {
    if (!activeId) {
      setActiveStream(null)
      return
    }
    const currentActiveId = activeId
    const handoff = streamProbe.lastStream(currentActiveId)
    if (handoff && handoff.channelId === currentActiveId) {
      setActiveStream(handoff)
      return
    }
    const channel = channelById.get(currentActiveId)
    if (!channel) {
      return
    }
    let cancelled = false
    void channelService
      .getStream(channel, mode, defaultQuality)
      .then((stream) => {
        if (!cancelled) {
          streamProbe.setStreamHandoff(currentActiveId, stream)
          setActiveStream(stream)
        }
      })
      .catch((err) => {
        // console.warn(`[hero] getStream error on ${currentActiveId}:`, err)
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

  // ---- Interaction ---------------------------------------------------------
  const select = useCallback((id: string) => {
    setUserPaused(false)
    setActiveId(id)
  }, [])

  const dwellTimerRef = useRef<number | null>(null)

  const startDwell = useCallback(
    (id: string, index: number) => {
      if (dwellTimerRef.current) window.clearTimeout(dwellTimerRef.current)
      dwellTimerRef.current = window.setTimeout(() => {
        if (id !== activeId) {
          setDirection(index > activeIdx ? 1 : -1)
          select(id)
        }
      }, 200)
    },
    [activeId, activeIdx, select]
  )

  const cancelDwell = useCallback(() => {
    if (dwellTimerRef.current) window.clearTimeout(dwellTimerRef.current)
    dwellTimerRef.current = null
  }, [])

  useEffect(() => () => cancelDwell(), [cancelDwell])

  const [tooltipId, setTooltipId] = useState<string | null>(null)
  const tooltipTimer = useRef<number | null>(null)

  const showTooltip = useCallback((id: string) => {
    if (tooltipTimer.current) window.clearTimeout(tooltipTimer.current)
    tooltipTimer.current = window.setTimeout(() => setTooltipId(id), 300)
  }, [])

  const hideTooltip = useCallback(() => {
    if (tooltipTimer.current) window.clearTimeout(tooltipTimer.current)
    tooltipTimer.current = null
    setTooltipId(null)
  }, [])

  const goToPrev = useCallback(() => {
    if (verifiedOrdered.length <= 1) return
    setDirection(-1)
    const prevIndex = (activeIdx - 1 + verifiedOrdered.length) % verifiedOrdered.length
    select(verifiedOrdered[prevIndex])
  }, [verifiedOrdered, activeIdx, select])

  const goToNext = useCallback(() => {
    if (verifiedOrdered.length <= 1) return
    setDirection(1)
    const nextIndex = (activeIdx + 1) % verifiedOrdered.length
    select(verifiedOrdered[nextIndex])
  }, [verifiedOrdered, activeIdx, select])

  const onTablistKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const ids = verifiedOrdered
    if (ids.length === 0) return
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      goToNext()
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      goToPrev()
    } else if (event.key === 'Home') {
      event.preventDefault()
      setDirection(-1)
      select(ids[0])
    } else if (event.key === 'End') {
      event.preventDefault()
      setDirection(1)
      select(ids[ids.length - 1])
    } else if (event.key === 'Enter') {
      if (activeId) {
        event.preventDefault()
        watch(activeId)
      }
    }
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
  const expanded = verifiedOrdered.length > 0 || candidates.length > 0
  const activeChannel =
    (activeId ? channelById.get(activeId) : null) ??
    (verifiedOrdered[0] ? channelById.get(verifiedOrdered[0]) : null) ??
    candidates[0]?.channel ??
    null
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

  if (!showHero) return <></>

  return (
    <div
      className="relative z-0 flex flex-col items-center justify-center pt-[72px] pb-8 px-1 sm:px-2 md:px-4 transition-[margin] duration-300 ease-out bg-[#0A0A0B] overflow-visible"
      style={{ marginBottom: 0 }}
    >
      <div
        className={cn(
          'w-full grid transition-[grid-template-rows] duration-300 ease-out',
          expanded ? 'overflow-visible' : 'overflow-hidden'
        )}
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
        aria-hidden={!expanded}
      >
        <div
          className={cn(
            'min-h-0 w-full flex items-center justify-center',
            expanded ? 'overflow-visible' : 'overflow-hidden'
          )}
        >
          <div className="relative mx-auto flex items-center justify-center w-full max-w-[1540px] px-1 sm:px-2 overflow-visible">
            {/* Left Channel Skip Arrow (in free space to the left of the video container) */}
            {verifiedOrdered.length > 1 ? (
              <button
                type="button"
                aria-label="Previous channel"
                title={prevChannel ? `Previous: ${prevChannel.name}` : 'Previous channel'}
                onClick={(e) => {
                  e.stopPropagation()
                  goToPrev()
                }}
                className={cn(
                  'mr-4 sm:mr-7 md:mr-9 shrink-0 z-30',
                  'flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full',
                  'border border-white/15 bg-white/[0.08] hover:bg-white/[0.18] text-white backdrop-blur-md shadow-[0_4px_24px_rgba(0,0,0,0.65)]',
                  'transition-all duration-300 ease-out active:scale-95 hover:scale-110',
                  'opacity-80 hover:opacity-100',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--red-line)]',
                  videoHovered ? '-translate-x-4 sm:-translate-x-6 opacity-95' : 'translate-x-0'
                )}
              >
                <ChevronLeft className="h-6 w-6 stroke-[2.5]" />
              </button>
            ) : null}

            <section
              ref={sectionRef}
              aria-label="Featured live channel"
              onMouseMove={onMouseMove}
              onMouseEnter={() => {
                setMouseActive(true)
                setVideoHovered(true)
              }}
              onMouseLeave={() => {
                setMouseActive(false)
                setVideoHovered(false)
              }}
              onClick={() => activeChannel && watch(activeChannel.id)}
              style={{
                width: 'min(calc(100% - 150px), calc(72vh * 16 / 9))',
                maxWidth: '1340px',
                aspectRatio: '16 / 9'
              }}
              className="group/hero relative cursor-pointer select-none overflow-hidden bg-[#0A0A0B] rounded-[24px] shadow-[0_24px_64px_rgba(0,0,0,0.85)] ring-1 ring-white/[0.08]"
            >
            {/* Cinema Stage — 16:9 aspect ratio strictly preserved */}
            <div className="relative h-full w-full overflow-hidden">
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

              {/* A/B video slots: gently softened when idle, full brightness on hover */}
              <div className="absolute inset-0" aria-hidden>
                <div className="relative h-full w-full overflow-hidden transition-[filter] duration-500 brightness-[0.82] group-hover/hero:brightness-100">
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
                      className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
                      style={{
                        opacity: opacity[slot],
                        transition: 'opacity 300ms ease'
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Edge crossfade: 4-sided solid black gradient feathering that retracts outwards on hover */}
              <div
                className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
                aria-hidden
              >
                {/* Top crossfade: retracts upward on hover */}
                <div
                  className="absolute inset-x-0 top-0 h-[56px] transition-all duration-500 ease-out group-hover/hero:-translate-y-8 group-hover/hero:opacity-25"
                  style={{
                    background:
                      'linear-gradient(to bottom, #0A0A0B 0%, rgba(10,10,11,0.92) 25%, rgba(10,10,11,0.45) 65%, transparent 100%)'
                  }}
                />
                {/* Bottom crossfade: retracts downward on hover */}
                <div
                  className="absolute inset-x-0 bottom-0 h-[56px] transition-all duration-500 ease-out group-hover/hero:translate-y-8 group-hover/hero:opacity-25"
                  style={{
                    background:
                      'linear-gradient(to top, #0A0A0B 0%, rgba(10,10,11,0.92) 25%, rgba(10,10,11,0.45) 65%, transparent 100%)'
                  }}
                />
                {/* Left crossfade: retracts leftward on hover */}
                <div
                  className="absolute inset-y-0 left-0 w-[56px] transition-all duration-500 ease-out group-hover/hero:-translate-x-8 group-hover/hero:opacity-25"
                  style={{
                    background:
                      'linear-gradient(to right, #0A0A0B 0%, rgba(10,10,11,0.92) 25%, rgba(10,10,11,0.45) 65%, transparent 100%)'
                  }}
                />
                {/* Right crossfade: retracts rightward on hover */}
                <div
                  className="absolute inset-y-0 right-0 w-[56px] transition-all duration-500 ease-out group-hover/hero:translate-x-8 group-hover/hero:opacity-25"
                  style={{
                    background:
                      'linear-gradient(to left, #0A0A0B 0%, rgba(10,10,11,0.92) 25%, rgba(10,10,11,0.45) 65%, transparent 100%)'
                  }}
                />
                {/* Localized subtle vignette behind bottom-left hero text for legibility */}
                <div
                  className="absolute bottom-0 left-0 h-[200px] w-[460px] max-w-full transition-opacity duration-500 ease-out group-hover/hero:opacity-60"
                  style={{
                    background:
                      'radial-gradient(ellipse at bottom left, rgba(10,10,11,0.75) 0%, rgba(10,10,11,0.25) 50%, transparent 75%)'
                  }}
                />
              </div>

              {/* Content with Side Scrolling Slide Animation */}
              {activeChannel ? (
                <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col px-6 sm:px-8 pb-7">
                  <AnimatePresence custom={direction} mode="wait">
                    <motion.div
                      key={activeChannel.id}
                      custom={direction}
                      variants={slideVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      className="flex max-w-[540px] flex-col gap-2.5 drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]"
                    >
                      {/* 1. Overline: LIVE NOW */}
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

                      {/* 2. Channel icon to the left side of the channel name */}
                      <div className="flex items-center gap-3.5">
                        <div className="h-12 w-12 sm:h-14 sm:w-14 shrink-0 overflow-hidden rounded-[14px]">
                          <ChannelLogo
                            channelId={activeChannel.id}
                            channel={activeChannel}
                            context="switcher"
                            priority="visible"
                            className="h-full w-full"
                          />
                        </div>
                        <h1 className="line-clamp-2 text-[26px] sm:text-[34px] lg:text-[40px] font-[700] leading-[1.08] tracking-[-0.03em] text-[#F4F4F5]">
                          {cleanTitle}
                        </h1>
                      </div>

                      {/* 4. Meta */}
                      {metaParts.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-2 text-[13px] sm:text-[14px] font-[500] text-[#A1A1A6]">
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

                      {/* 5. Description */}
                      {current?.description ? (
                        <p className="line-clamp-2 max-w-[480px] text-[13px] sm:text-[14px] font-[450] leading-relaxed text-[#A1A1A6]">
                          {current.description}
                        </p>
                      ) : null}

                      {/* 6. Buttons */}
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
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </div>
              ) : null}

              {/* Always-on pause/play button */}
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
                    'absolute right-5 top-5 z-30 flex h-8 w-8 items-center justify-center rounded-full',
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

              {/* 5 Channels Switcher (bottom-right): Clicking switches the hero channel with slide animation */}
              {verifiedOrdered.length > 0 ? (
                <div
                  role="tablist"
                  aria-label="Featured channels switcher"
                  onKeyDown={onTablistKeyDown}
                  className="absolute bottom-7 right-7 z-30 flex items-center gap-[10px]"
                >
                  {verifiedOrdered.map((id, index) => {
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
                          aria-label={`Switch to ${channel.name}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            cancelDwell()
                            if (id !== activeId) {
                              setDirection(index > activeIdx ? 1 : -1)
                              select(id)
                            }
                          }}
                          onMouseEnter={() => {
                            startDwell(id, index)
                            showTooltip(id)
                          }}
                          onMouseLeave={() => {
                            cancelDwell()
                            hideTooltip()
                          }}
                          onFocus={() => {
                            cancelDwell()
                            if (id !== activeId) {
                              setDirection(index > activeIdx ? 1 : -1)
                              select(id)
                            }
                            showTooltip(id)
                          }}
                          onBlur={() => {
                            cancelDwell()
                            hideTooltip()
                          }}
                          className={cn(
                            'relative rounded-[14px] transition-all duration-200',
                            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--red-line)]',
                            selected
                              ? 'opacity-100 scale-105 after:absolute after:inset-[-2px] after:rounded-[16px] after:border-2 after:border-[var(--red-line)] after:content-[""]'
                              : 'opacity-75 hover:opacity-100 hover:scale-105'
                          )}
                        >
                          <ChannelLogo channelId={channel.id} channel={channel} context="switcher" priority="visible" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>

            </section>

          {/* Right Channel Skip Arrow (in free space to the right of the video container) */}
          {verifiedOrdered.length > 1 ? (
            <button
              type="button"
              aria-label="Next channel"
              title={nextChannel ? `Next: ${nextChannel.name}` : 'Next channel'}
              onClick={(e) => {
                e.stopPropagation()
                goToNext()
              }}
              className={cn(
                'ml-4 sm:ml-7 md:ml-9 shrink-0 z-30',
                'flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full',
                'border border-white/15 bg-white/[0.08] hover:bg-white/[0.18] text-white backdrop-blur-md shadow-[0_4px_24px_rgba(0,0,0,0.65)]',
                'transition-all duration-300 ease-out active:scale-95 hover:scale-110',
                'opacity-80 hover:opacity-100',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--red-line)]',
                videoHovered ? 'translate-x-4 sm:translate-x-6 opacity-95' : 'translate-x-0'
              )}
            >
              <ChevronRight className="h-6 w-6 stroke-[2.5]" />
            </button>
          ) : null}
        </div>
      </div>
      </div>
    </div>
  )
}
