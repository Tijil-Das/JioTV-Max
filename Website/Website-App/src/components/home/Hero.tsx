import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion'
import { ChevronLeft, ChevronRight, Pause, Play, X } from 'lucide-react'
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
import {
  SPECIMEN_CHANNELS,
  SPECIMEN_SHOW_TITLE,
  getSpecimenProgram
} from '@/lib/specimenChannels'
import { downloadLatestApp } from '@/lib/downloadApp'

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
  const [dismissHeroNotice, setDismissHeroNotice] = useState(false)
  const mouseTimerRef = useRef<number | null>(null)

  const onMouseMove = useCallback(() => {
    setMouseActive(true)
    if (mouseTimerRef.current) window.clearTimeout(mouseTimerRef.current)
    mouseTimerRef.current = window.setTimeout(() => setMouseActive(false), 3000)
  }, [])

  const sectionRef = useRef<HTMLElement>(null)
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  // Measure actual rendered width of the hero card to scale all overlay elements proportionally
  const [heroWidth, setHeroWidth] = useState(1100)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const update = (w: number) => {
      const rounded = Math.round(w)
      if (rounded > 0) {
        setHeroWidth((prev) => (Math.abs(prev - rounded) > 4 ? rounded : prev))
      }
    }
    update(el.offsetWidth)
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          update(entry.contentRect.width)
        }
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const heroScale = useMemo(() => {
    // 1100px is the reference desktop hero width (scale 1.0)
    // 440px is minimum hero width on desktop window (scale 0.58)
    if (heroWidth >= 440) {
      const clamped = Math.min(1100, heroWidth)
      return Number((0.58 + ((clamped - 440) / (1100 - 440)) * 0.42).toFixed(3))
    }
    const clampedMobile = Math.max(300, heroWidth)
    return Number((0.48 + ((clampedMobile - 300) / (440 - 300)) * 0.10).toFixed(3))
  }, [heroWidth])

  const channelById = useMemo(
    () => new Map(SPECIMEN_CHANNELS.map((channel) => [channel.id, channel])),
    []
  )

  const verifiedOrdered = useMemo(() => {
    return SPECIMEN_CHANNELS.map((c) => c.id)
  }, [])
  const verifiedKey = verifiedOrdered.join('|')

  // ---- Active channel: defaults to first specimen channel -----------
  useEffect(() => {
    if (!activeId || !verifiedOrdered.includes(activeId)) {
      setActiveId(verifiedOrdered[0] || 'ch-specimen-1')
    }
  }, [activeId, verifiedOrdered])

  const handleFailure = useCallback((_channelId: string) => {}, [])

  // ---- Resolve the URL for the active channel (unified HLS stream) ------
  useEffect(() => {
    if (!activeId) {
      setActiveStream(null)
      return
    }
    const curChannel = channelById.get(activeId) || SPECIMEN_CHANNELS[0]
    const streamInfo: StreamInfo = {
      channelId: curChannel.id,
      url: curChannel.streamUrl || '../assets/stream/playlist.m3u8',
      type: 'hls',
      isLive: true,
      isDrm: false,
      source: 'demo',
      note: 'Unified HLS stream'
    }
    streamProbe.setStreamHandoff(curChannel.id, streamInfo)
    setActiveStream(streamInfo)
  }, [activeId, channelById])

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
  const activeChannel = (activeId ? channelById.get(activeId) : null) ?? SPECIMEN_CHANNELS[0]
  const current = useMemo(() => getSpecimenProgram(activeChannel.id), [activeChannel.id])
  const quality = 'HD'
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

  const cleanTitle = SPECIMEN_SHOW_TITLE

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
      className="relative z-0 flex flex-col items-center justify-center pt-[64px] sm:pt-[72px] pb-6 sm:pb-8 px-2 sm:px-3 md:px-4 transition-[margin] duration-300 ease-out bg-[#0A0A0B] overflow-visible"
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
          <div className="relative mx-auto flex items-center justify-center w-full max-w-[1540px] px-2 sm:px-6 md:px-8 overflow-visible">
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
                style={{
                  width: `${Math.max(38, Math.round(52 * Math.max(0.75, heroScale)))}px`,
                  height: `${Math.max(38, Math.round(52 * Math.max(0.75, heroScale)))}px`,
                  transform: videoHovered
                    ? `translateX(-${Math.max(7, Math.round(18 * heroScale))}px)`
                    : 'translateX(0px)',
                  transition: 'transform 250ms ease-out, opacity 250ms ease-out, background-color 200ms ease'
                }}
                className={cn(
                  'mr-1.5 sm:mr-3 md:mr-5 shrink-0 z-30 hidden sm:flex',
                  'items-center justify-center rounded-full',
                  'border border-white/15 bg-white/[0.08] hover:bg-white/[0.22] text-white backdrop-blur-md shadow-[0_4px_24px_rgba(0,0,0,0.65)]',
                  'active:scale-95 hover:scale-110 hover:border-white/30',
                  'opacity-80 hover:opacity-100',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--red-line)]'
                )}
              >
                <ChevronLeft
                  style={{
                    width: `${Math.max(20, Math.round(26 * Math.max(0.75, heroScale)))}px`,
                    height: `${Math.max(20, Math.round(26 * Math.max(0.75, heroScale)))}px`
                  }}
                  className="stroke-[2.5]"
                />
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
                maxWidth: '1340px',
                aspectRatio: '16 / 9',
                borderRadius: `${Math.max(10, Math.round(24 * heroScale))}px`
              }}
              className="group/hero relative cursor-pointer select-none overflow-hidden bg-[#0A0A0B] shadow-[0_24px_64px_rgba(0,0,0,0.85)] ring-1 ring-white/[0.08] w-full sm:w-[min(calc(100%-clamp(88px,13vw,150px)),calc(72vh*16/9))]"
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

              {/* A/B video slots: noticeably darkened when idle, full brightness on hover */}
              <div className="absolute inset-0" aria-hidden>
                <div className="relative h-full w-full overflow-hidden transition-[filter] duration-500 brightness-[0.48] group-hover/hero:brightness-100">
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

              {/* Specimen Notice at top left of hero video */}
              {!dismissHeroNotice ? (
                <div className="pointer-events-auto absolute top-2.5 left-2.5 sm:top-4 sm:left-4 z-20 flex items-center gap-1.5 sm:gap-2 rounded-lg bg-black/75 px-2.5 py-1 sm:px-3 sm:py-1.5 backdrop-blur-md border border-white/10 text-[10.5px] sm:text-[12px] text-white/90 shadow-md max-w-[calc(100%-52px)] sm:max-w-md animate-in fade-in duration-200">
                  <span className="leading-snug">
                    This is just a specimen channel and video. Use the JioTV Max app to watch real JioTV channels.{' '}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        downloadLatestApp()
                      }}
                      className="inline font-bold text-white underline hover:text-white/80 transition-colors cursor-pointer"
                    >
                      Download App
                    </button>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDismissHeroNotice(true)
                    }}
                    className="shrink-0 rounded p-0.5 text-white/70 hover:text-white transition-colors cursor-pointer"
                    aria-label="Dismiss specimen notice"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}

              {/* Content with Side Scrolling Slide Animation */}
              {activeChannel ? (
                <div
                  className="absolute inset-x-0 bottom-0 z-20 flex flex-col"
                  style={{
                    paddingLeft: `${Math.max(14, Math.round(28 * heroScale))}px`,
                    paddingRight: `${Math.max(14, Math.round(28 * heroScale))}px`,
                    paddingBottom: `${Math.max(12, Math.round(26 * heroScale))}px`
                  }}
                >
                  <AnimatePresence custom={direction} mode="wait">
                    <motion.div
                      key={activeChannel.id}
                      custom={direction}
                      variants={slideVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      style={{
                        maxWidth: heroWidth < 500 ? 'calc(100% - 145px)' : `${Math.max(300, Math.round(540 * heroScale))}px`,
                        gap: `${Math.max(4, Math.round(10 * heroScale))}px`
                      }}
                      className="flex flex-col drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]"
                    >
                      {/* 1. Overline: LIVE NOW */}
                      <div className="flex items-center" style={{ gap: `${Math.max(5, Math.round(8 * heroScale))}px` }}>
                        <span
                          className="shrink-0 rounded-full bg-[var(--red)]"
                          style={{ width: `${Math.max(5, Math.round(6 * heroScale))}px`, height: `${Math.max(5, Math.round(6 * heroScale))}px` }}
                          aria-hidden
                        />
                        <span
                          className="font-[600] uppercase tracking-[0.12em] text-[#A1A1A6]"
                          style={{ fontSize: `${Math.max(9, Math.round(11 * heroScale))}px` }}
                        >
                          LIVE NOW
                        </span>
                        <span
                          className="font-sans font-[650] text-[#F4F4F5]"
                          style={{ fontSize: `${Math.max(10, Math.round(12 * heroScale))}px` }}
                        >
                          · {activeChannel.name}
                        </span>
                      </div>

                      {/* 2. Channel icon to the left side of the channel name */}
                      <div className="flex items-center" style={{ gap: `${Math.max(8, Math.round(14 * heroScale))}px` }}>
                        <div
                          className="shrink-0 overflow-hidden"
                          style={{
                            width: `${Math.max(32, Math.round(52 * heroScale))}px`,
                            height: `${Math.max(32, Math.round(52 * heroScale))}px`,
                            borderRadius: `${Math.max(7, Math.round(13 * heroScale))}px`
                          }}
                        >
                          <ChannelLogo
                            channelId={activeChannel.id}
                            channel={activeChannel}
                            context="switcher"
                            priority="visible"
                            className="h-full w-full"
                            style={{
                              width: '100%',
                              height: '100%',
                              padding: `${Math.max(4, Math.round(7 * heroScale))}px`,
                              borderRadius: `${Math.max(7, Math.round(13 * heroScale))}px`
                            }}
                          />
                        </div>
                        <h1
                          className="line-clamp-2 font-[700] leading-[1.08] tracking-[-0.03em] text-[#F4F4F5]"
                          style={{ fontSize: `${Math.max(17, Math.round(36 * heroScale))}px` }}
                        >
                          {cleanTitle}
                        </h1>
                      </div>

                      {/* 4. Meta & Description removed as requested */}

                      {/* 6. Buttons */}
                      <div style={{ marginTop: `${Math.max(3, Math.round(6 * heroScale))}px` }}>
                        <Button
                          variant="primary"
                          icon={
                            <Play
                              style={{
                                width: `${Math.max(11, Math.round(15 * heroScale))}px`,
                                height: `${Math.max(11, Math.round(15 * heroScale))}px`
                              }}
                              className="fill-current"
                            />
                          }
                          onClick={(e) => {
                            e.stopPropagation()
                            watch(activeChannel.id)
                          }}
                          style={{
                            height: `${Math.max(28, Math.round(42 * heroScale))}px`,
                            paddingLeft: `${Math.max(11, Math.round(18 * heroScale))}px`,
                            paddingRight: `${Math.max(11, Math.round(18 * heroScale))}px`,
                            fontSize: `${Math.max(11, Math.round(13.5 * heroScale))}px`,
                            borderRadius: `${Math.max(6, Math.round(8 * heroScale))}px`,
                            gap: `${Math.max(5, Math.round(7 * heroScale))}px`
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
                  style={{
                    top: `${Math.max(10, Math.round(18 * heroScale))}px`,
                    right: `${Math.max(10, Math.round(18 * heroScale))}px`,
                    width: `${Math.max(26, Math.round(32 * heroScale))}px`,
                    height: `${Math.max(26, Math.round(32 * heroScale))}px`
                  }}
                  className={cn(
                    'absolute z-30 flex items-center justify-center rounded-full',
                    'border border-[rgba(255,255,255,0.14)] bg-black/55 text-[#F4F4F5] backdrop-blur-sm',
                    'transition-colors duration-150 hover:bg-black/75',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--red-line)]'
                  )}
                >
                  {previewOn ? (
                    <Pause style={{ width: `${Math.max(11, Math.round(14 * heroScale))}px`, height: `${Math.max(11, Math.round(14 * heroScale))}px` }} className="fill-current" strokeWidth={0} />
                  ) : (
                    <Play style={{ width: `${Math.max(11, Math.round(14 * heroScale))}px`, height: `${Math.max(11, Math.round(14 * heroScale))}px` }} className="ml-[1px] fill-current" strokeWidth={0} />
                  )}
                </button>
              ) : null}

              {/* 5 Channels Switcher (bottom-right): Clicking switches the hero channel with slide animation */}
              {verifiedOrdered.length > 0 ? (
                <div
                  role="tablist"
                  aria-label="Featured channels switcher"
                  onKeyDown={onTablistKeyDown}
                  style={{
                    bottom: `${Math.max(12, Math.round(26 * heroScale))}px`,
                    right: `${Math.max(12, Math.round(26 * heroScale))}px`,
                    gap: `${Math.max(5, Math.round(9 * heroScale))}px`
                  }}
                  className="absolute z-30 flex items-center"
                >
                  {verifiedOrdered.map((id, index) => {
                    const channel = channelById.get(id)
                    if (!channel) return null
                    const selected = id === activeId
                    const chipSize = heroWidth < 500 ? Math.max(26, Math.round(52 * heroScale)) : Math.max(32, Math.round(52 * heroScale))
                    const chipPad = heroWidth < 500 ? Math.max(2, Math.round(7 * heroScale)) : Math.max(3, Math.round(7 * heroScale))
                    const chipRad = heroWidth < 500 ? Math.max(6, Math.round(12 * heroScale)) : Math.max(7, Math.round(12 * heroScale))
                    return (
                      <div key={id} className="relative">
                        {tooltipId === id ? (
                          <div
                            role="tooltip"
                            className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 -translate-x-1/2 whitespace-nowrap rounded-[8px] border border-[rgba(255,255,255,0.12)] bg-[#111113] px-2 py-0.5 text-[11px] font-[500] text-[#F4F4F5] shadow-lg"
                          >
                            {channel.name}
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
                          style={{
                            borderRadius: `${chipRad}px`
                          }}
                          className={cn(
                            'relative transition-all duration-200',
                            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--red-line)]',
                            selected
                              ? 'opacity-100 scale-105 after:absolute after:inset-[-2px] after:rounded-[inherit] after:border-2 after:border-[var(--red-line)] after:content-[""]'
                              : 'opacity-75 hover:opacity-100 hover:scale-105'
                          )}
                        >
                          <ChannelLogo
                            channelId={channel.id}
                            channel={channel}
                            context="switcher"
                            priority="visible"
                            style={{
                              width: `${chipSize}px`,
                              height: `${chipSize}px`,
                              padding: `${chipPad}px`,
                              borderRadius: `${chipRad}px`
                            }}
                          />
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
              style={{
                width: `${Math.max(38, Math.round(52 * Math.max(0.75, heroScale)))}px`,
                height: `${Math.max(38, Math.round(52 * Math.max(0.75, heroScale)))}px`,
                transform: videoHovered
                  ? `translateX(${Math.max(7, Math.round(18 * heroScale))}px)`
                  : 'translateX(0px)',
                transition: 'transform 250ms ease-out, opacity 250ms ease-out, background-color 200ms ease'
              }}
              className={cn(
                'ml-1.5 sm:ml-3 md:ml-5 shrink-0 z-30 hidden sm:flex',
                'items-center justify-center rounded-full',
                'border border-white/15 bg-white/[0.08] hover:bg-white/[0.22] text-white backdrop-blur-md shadow-[0_4px_24px_rgba(0,0,0,0.65)]',
                'active:scale-95 hover:scale-110 hover:border-white/30',
                'opacity-80 hover:opacity-100',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--red-line)]'
              )}
            >
              <ChevronRight
                style={{
                  width: `${Math.max(20, Math.round(26 * Math.max(0.75, heroScale)))}px`,
                  height: `${Math.max(20, Math.round(26 * Math.max(0.75, heroScale)))}px`
                }}
                className="stroke-[2.5]"
              />
            </button>
          ) : null}
        </div>
      </div>
      </div>
    </div>
  )
}
