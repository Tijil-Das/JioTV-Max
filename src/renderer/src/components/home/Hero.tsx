import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import { Pause, Play } from 'lucide-react'
import type { StreamInfo } from '@shared/types'
import { cn } from '@/lib/cn'
import { highestQuality } from '@/lib/constants'
import { formatRange, getNowNext } from '@/lib/time'
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
import { QualityBadge } from '@/components/ui/LiveBadge'

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

  const onTablistKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const ids = verifiedOrdered
    if (ids.length === 0) return
    const index = activeId ? ids.indexOf(activeId) : -1
    let next = -1
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1 + ids.length) % ids.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + ids.length) % ids.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = ids.length - 1
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

  // ---- Render --------------------------------------------------------------
  const expanded = verifiedOrdered.length > 0
  const activeChannel = activeId ? channelById.get(activeId) ?? null : null
  const current = activeChannel ? getNowNext(epg[activeChannel.id] ?? [], now).current : null
  const quality = activeChannel ? highestQuality(activeChannel) : ''
  const artwork = current?.artworkUrl ?? ''

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
            className="relative h-[clamp(360px,40vw,460px)] w-full overflow-hidden bg-[#0A0A0B]"
          >
            {/* Static backdrop: real EPG artwork when present, else a quiet field */}
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

            {/* A/B video slots (max two hls instances, 400ms crossfade) */}
            <div className="absolute inset-0" aria-hidden>
              {[0, 1].map((slot) => (
                <video
                  key={slot}
                  ref={videoRefs[slot]}
                  muted
                  loop
                  autoPlay
                  playsInline
                  disablePictureInPicture
                  tabIndex={-1}
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{ opacity: opacity[slot], transition: 'opacity 400ms ease' }}
                />
              ))}
            </div>

            {/* Static brand mark while the preview is off or buffering */}
            {activeChannel && !previewOn ? (
              <div className="pointer-events-none absolute right-[calc(var(--gutter)+64px)] top-[68%] z-10 hidden -translate-y-1/2 lg:block">
                <ChannelLogo channel={activeChannel} size="hero" priority="visible" />
              </div>
            ) : null}

            {/* Scrims: top for the transparent bar, left → right, bottom fade */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-28"
              aria-hidden
              style={{
                background:
                  'linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.32) 55%, transparent 100%)'
              }}
            />
            <div
              className="pointer-events-none absolute inset-0"
              aria-hidden
              style={{
                background:
                  'linear-gradient(to right, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 42%, rgba(0,0,0,0.12) 72%, transparent 100%)'
              }}
            />
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-44"
              aria-hidden
              style={{
                background:
                  'linear-gradient(to top, #000000 0%, rgba(0,0,0,0.55) 45%, transparent 100%)'
              }}
            />

            {/* Content */}
            {activeChannel ? (
              <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col px-[var(--gutter)] pb-12 pt-6">
                <div className="max-w-[min(560px,58%)]">
                  <div className="flex items-center gap-2.5">
                    {activeChannel.isLive ? (
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--red)]"
                        aria-hidden
                      />
                    ) : null}
                    <span className="text-[11px] font-[600] uppercase tracking-[0.12em] text-[#A1A1A6]">
                      {activeChannel.name}
                    </span>
                    <QualityBadge quality={quality} />
                  </div>

                  <h1 className="mt-3 text-[40px] font-[700] leading-[1.04] tracking-[-0.03em] text-[#F4F4F5] xl:text-[46px]">
                    {current?.title ?? activeChannel.name}
                  </h1>

                  <p className="mt-2 text-[13px] font-[450] text-[#A1A1A6]">
                    {current
                      ? `${formatRange(current.start, current.end)} · ${activeChannel.language}`
                      : activeChannel.language}
                  </p>

                  {current?.description ? (
                    <p className="mt-3 line-clamp-2 max-w-[480px] text-[14px] font-[450] leading-relaxed text-[#A1A1A6]">
                      {current.description}
                    </p>
                  ) : null}

                  <div className="mt-7 flex items-center gap-3">
                    <Button
                      variant="primary"
                      size="lg"
                      icon={<Play className="h-4 w-4 fill-current" />}
                      onClick={() => watch(activeChannel.id)}
                    >
                      Watch
                    </Button>
                    {!previewOn ? (
                      <Button
                        variant="secondary"
                        size="lg"
                        icon={<Play className="h-4 w-4" />}
                        onClick={() => {
                          setOverridePlay(true)
                          setUserPaused(false)
                        }}
                      >
                        Play preview
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="lg"
                      onClick={() => navigate(`/guide?channel=${activeChannel.id}`)}
                    >
                      Guide
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Always-on 32px pause/play */}
            {activeChannel ? (
              <button
                type="button"
                title={previewOn ? 'Pause live preview' : 'Play live preview'}
                aria-label={previewOn ? 'Pause live preview' : 'Play live preview'}
                aria-pressed={previewOn}
                onClick={() => {
                  if (previewOn) {
                    setUserPaused(true)
                  } else {
                    setOverridePlay(true)
                    setUserPaused(false)
                  }
                }}
                className={cn(
                  'absolute right-[var(--gutter)] top-[76px] z-30 flex h-8 w-8 items-center justify-center rounded-full',
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

            {/* Switcher: up to 6 verified channels, tablist semantics */}
            {verifiedOrdered.length > 1 ? (
              <div
                role="tablist"
                aria-label="Verified featured channels"
                onKeyDown={onTablistKeyDown}
                className="absolute right-[var(--gutter)] top-[124px] z-30 flex items-center gap-2"
              >
                {verifiedOrdered.map((id) => {
                  const channel = channelById.get(id)
                  if (!channel) return null
                  const selected = id === activeId
                  return (
                    <button
                      key={id}
                      ref={(element) => {
                        chipRefs.current[id] = element
                      }}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      tabIndex={selected ? 0 : -1}
                      title={channel.name}
                      aria-label={`Show ${channel.name}`}
                      onClick={() => select(id)}
                      onMouseEnter={() => startDwell(id)}
                      onMouseLeave={cancelDwell}
                      onFocus={cancelDwell}
                      className={cn(
                        'relative rounded-[12px] transition-opacity duration-150',
                        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--red-line)]',
                        selected
                          ? 'opacity-100 after:absolute after:inset-[-3px] after:rounded-[14px] after:border after:border-[var(--red-line)] after:content-[""]'
                          : 'opacity-70 hover:opacity-100'
                      )}
                    >
                      <ChannelLogoCell channel={channel} />
                    </button>
                  )
                })}
              </div>
            ) : null}

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
