import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeft,
  CircleHelp,
  Keyboard,
  ListVideo,
  LockKeyhole,
  Maximize,
  Minimize,
  PictureInPicture2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX
} from 'lucide-react'
import type { StreamInfo } from '@shared/types'
import { cn } from '@/lib/cn'
import { hexToRgba, initials } from '@/lib/color'
import { QUALITY_OPTIONS } from '@/lib/constants'
import { sha256Hex } from '@/lib/hash'
import { formatRange, formatTimeLeft, getNowNext, getProgress } from '@/lib/time'
import { ApiError, getBridge } from '@/services/api'
import { channelService } from '@/services/channelService'
import { useMediaPlayer } from '@/hooks/useMediaPlayer'
import { useHotkeys } from '@/hooks/useDebounce'
import { useIdle } from '@/hooks/useIdle'
import { useNow } from '@/hooks/useNow'
import { useChannelStore } from '@/store/useChannelStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useUIStore } from '@/store/useUIStore'
import { Button, IconButton } from '@/components/ui/Button'
import { ChannelLogo } from '@/components/ui/ChannelLogo'
import { LiveBadge } from '@/components/ui/LiveBadge'
import { ChannelDrawer } from '@/components/player/ChannelDrawer'
import { QualityMenu } from '@/components/player/QualityMenu'
import { ShortcutsOverlay } from '@/components/player/ShortcutsOverlay'
import { PinDialog } from '@/components/settings/PinDialog'

interface StreamFailure {
  message: string
  code?: string
}

/**
 * Full-bleed player.
 *
 * Owns: stream resolution, engine selection (hls.js / shaka-player), channel
 * zapping, quality pinning, fullscreen, volume, parental gate and the
 * auto-hiding control layer. Playback resources never enter global state.
 */
export function PlayerPage(): JSX.Element {
  const { channelId = '' } = useParams<{ channelId: string }>()
  const navigate = useNavigate()
  const bridge = getBridge()
  const now = useNow()

  const channels = useChannelStore((state) => state.channels)
  const epg = useChannelStore((state) => state.epg)
  const catalogueLoading = useChannelStore((state) => state.loading)
  const recordRecent = useChannelStore((state) => state.recordRecent)

  const mode = useSettingsStore((state) => state.mode)
  const autoplay = useSettingsStore((state) => state.autoplay)
  const parentalEnabled = useSettingsStore((state) => state.parentalEnabled)
  const parentalPinHash = useSettingsStore((state) => state.parentalPinHash)

  const quality = usePlayerStore((state) => state.quality)
  const setQuality = usePlayerStore((state) => state.setQuality)
  const isPlaying = usePlayerStore((state) => state.isPlaying)
  const setPlaying = usePlayerStore((state) => state.setPlaying)
  const volume = usePlayerStore((state) => state.volume)
  const setVolume = usePlayerStore((state) => state.setVolume)
  const muted = usePlayerStore((state) => state.muted)
  const toggleMuted = usePlayerStore((state) => state.toggleMuted)
  const isFullscreen = usePlayerStore((state) => state.isFullscreen)
  const setFullscreen = usePlayerStore((state) => state.setFullscreen)
  const setControlsVisible = usePlayerStore((state) => state.setControlsVisible)
  const setBuffering = usePlayerStore((state) => state.setBuffering)
  const setCurrentChannel = usePlayerStore((state) => state.setCurrentChannel)
  const setEngine = usePlayerStore((state) => state.setEngine)

  const openLogin = useUIStore((state) => state.openLogin)

  const channel = useMemo(
    () => channels.find((item) => item.id === channelId),
    [channelId, channels]
  )
  const programs = epg[channelId] ?? []
  const { current, next } = useMemo(() => getNowNext(programs, now), [programs, now])

  const [stream, setStream] = useState<StreamInfo | null>(null)
  const [streamLoading, setStreamLoading] = useState(true)
  const [streamError, setStreamError] = useState<StreamFailure | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [qualityOpen, setQualityOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [unlockedChannelId, setUnlockedChannelId] = useState<string | null>(null)

  const locked = parentalEnabled && channel?.category === 'kids' && unlockedChannelId !== channelId

  const jioQualityKey = mode === 'jio' ? String(quality) : 'demo'

  // ---- Stream re-resolution for reconnects ------------------------------
  // Called by the engine before each automatic retry so it can load a fresh
  // signed URL (new hdnea token) instead of the stale relay session.
  const resolveStream = useCallback(async (): Promise<StreamInfo | null> => {
    if (!channel) return null
    console.log('[PlayerPage] Reconnecting: resolving fresh stream for', channel.id)
    try {
      const res = await channelService.getStream(channel, mode, quality)
      console.log('[PlayerPage] Fresh stream resolved successfully:', res)
      return res
    } catch (err) {
      console.error('[PlayerPage] Fresh stream resolution failed:', err)
      return null
    }
  }, [channel, mode, quality])

  const engine = useMediaPlayer({
    stream: locked ? null : stream,
    initialQuality: quality,
    onReconnect: mode === 'jio' ? resolveStream : undefined
  })
  const { videoRef } = engine

  // ---- Stream resolution -------------------------------------------------
  useEffect(() => {
    if (!channel || locked) {
      setStream(null)
      setStreamLoading(false)
      return
    }
    let cancelled = false
    setStream(null)
    setStreamLoading(true)
    setStreamError(null)
    console.log(`[PlayerPage] Fetching stream for ${channel.id} (${channel.name}), mode=${mode}, quality=${quality}`)
    channelService
      .getStream(channel, mode, quality)
      .then((result) => {
        if (cancelled) return
        console.log(`[PlayerPage] Successfully resolved stream for ${channel.id}:`, result)
        setStream(result)
        setStreamLoading(false)
        recordRecent(channel.id, 0)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        console.error(`[PlayerPage] Failed to resolve stream for ${channel.id}:`, cause)
        setStreamLoading(false)
        const error = cause instanceof ApiError ? cause : null
        setStreamError({
          message: cause instanceof Error ? cause.message : 'The stream could not be resolved.',
          code: error?.code
        })
      })
    return () => {
      cancelled = true
    }
  }, [channel?.id, mode, attempt, locked])

  // ---- Store/player synchronisation -------------------------------------
  useEffect(() => {
    setCurrentChannel(channelId)
    if (autoplay) {
      setPlaying(true)
    }
    return () => {
      setCurrentChannel(null)
      setControlsVisible(true)
      setBuffering(false)
    }
  }, [channelId, autoplay, setBuffering, setControlsVisible, setCurrentChannel, setPlaying])

  useEffect(() => {
    setEngine(stream?.type ?? null)
  }, [stream, setEngine])

  useEffect(() => {
    setBuffering(engine.buffering)
  }, [engine.buffering, setBuffering])

  useEffect(() => {
    if (!bridge) return
    void bridge.setPlayerActive(true)
    return () => {
      void bridge.setPlayerActive(false)
    }
  }, [bridge])

  useEffect(() => {
    if (!bridge) return
    const off = bridge.onFullscreenChange((value) => setFullscreen(value))
    const onDocumentFullscreen = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onDocumentFullscreen)
    return () => {
      off()
      document.removeEventListener('fullscreenchange', onDocumentFullscreen)
    }
  }, [bridge, setFullscreen])

  useEffect(() => {
    const media = videoRef.current
    if (!media) return
    if (isPlaying) {
      void media.play().catch((err: unknown) => {
        console.warn('[PlayerPage] media.play() was prevented/blocked:', err)
        setPlaying(false)
      })
    } else {
      media.pause()
    }
  }, [isPlaying, stream, videoRef, setPlaying])

  useEffect(() => {
    const media = videoRef.current
    if (!media) return
    media.volume = volume
    media.muted = muted
  }, [muted, volume, stream, videoRef])

  useEffect(() => {
    if (!autoplay && engine.ready && isPlaying) setPlaying(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, engine.ready])

  useEffect(() => {
    const media = videoRef.current
    if (!media) return
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    media.addEventListener('play', onPlay)
    media.addEventListener('pause', onPause)
    return () => {
      media.removeEventListener('play', onPlay)
      media.removeEventListener('pause', onPause)
    }
  }, [setPlaying, stream, videoRef])

  useEffect(() => {
    setPinOpen(false)
    setUnlockedChannelId(null)
  }, [channelId])

  // ---- Interaction helpers ----------------------------------------------
  const menusOpen = drawerOpen || qualityOpen || helpOpen || pinOpen
  const { idle, wake } = useIdle(3200, isPlaying && !menusOpen)
  const controlsVisible = !idle || !isPlaying || menusOpen

  useEffect(() => {
    setControlsVisible(controlsVisible)
  }, [controlsVisible, setControlsVisible])

  const togglePlay = useCallback(() => {
    wake()
    setPlaying(!isPlaying)
  }, [isPlaying, setPlaying, wake])

  const toggleFullscreen = useCallback(async () => {
    if (bridge) {
      await bridge.toggleFullscreen()
      return
    }
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen().catch(() => undefined)
  }, [bridge])

  const togglePip = useCallback(async () => {
    const media = videoRef.current
    if (!media) return
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture().catch(() => undefined)
    } else if (document.pictureInPictureEnabled && media.requestPictureInPicture) {
      await media.requestPictureInPicture().catch(() => undefined)
    }
  }, [videoRef])

  const zap = useCallback(
    (direction: -1 | 1) => {
      if (channels.length < 2) return
      const index = channels.findIndex((item) => item.id === channelId)
      const nextChannel = channels[(index + direction + channels.length) % channels.length]
      if (nextChannel) navigate(`/watch/${nextChannel.id}`)
    },
    [channelId, channels, navigate]
  )

  const changeVolume = useCallback(
    (value: number) => {
      setVolume(value)
      wake()
    },
    [setVolume, wake]
  )

  // ---- Keyboard shortcuts ------------------------------------------------
  useHotkeys({
    ' ': (event) => {
      event.preventDefault()
      togglePlay()
    },
    ArrowUp: (event) => {
      event.preventDefault()
      zap(-1)
    },
    ArrowDown: (event) => {
      event.preventDefault()
      zap(1)
    },
    ArrowLeft: (event) => {
      event.preventDefault()
      changeVolume(Math.max(0, Number((volume - 0.05).toFixed(2))))
    },
    ArrowRight: (event) => {
      event.preventDefault()
      changeVolume(Math.min(1, Number((volume + 0.05).toFixed(2))))
    },
    m: () => toggleMuted(),
    f: () => void toggleFullscreen(),
    c: () => {
      setDrawerOpen((value) => !value)
      wake()
    },
    q: () => {
      setQualityOpen((value) => !value)
      wake()
    },
    p: () => void togglePip(),
    '?': () => setHelpOpen((value) => !value),
    Escape: () => {
      if (qualityOpen || drawerOpen || helpOpen) {
        setQualityOpen(false)
        setDrawerOpen(false)
        setHelpOpen(false)
      } else if (isFullscreen) {
        void toggleFullscreen()
      } else {
        navigate(-1)
      }
    }
  })

  // ---- Render helpers ----------------------------------------------------
  const fatalError: StreamFailure | null = streamError ?? (engine.error ? { message: engine.error } : null)
  const activeHeight =
    engine.activeLevel === 'auto'
      ? quality === 'auto'
        ? 0
        : Number(quality)
      : engine.levels[engine.activeLevel]?.height ?? 0
  const qualityLabel =
    engine.activeLevel === 'auto'
      ? 'Auto'
      : engine.levels[engine.activeLevel]?.height
        ? `${engine.levels[engine.activeLevel].height}p`
        : QUALITY_OPTIONS.find((option) => option.value === quality)?.label ?? 'Auto'

  const liveProgress = current ? getProgress(current, now) : 0

  const stageBackground = channel
    ? `radial-gradient(110% 120% at 70% 0%, ${hexToRgba(channel.brandColor, 0.42)} 0%, transparent 60%), linear-gradient(160deg, #0d0d14, #050507)`
    : 'linear-gradient(160deg, #0d0d14, #050507)'

  if (!channel) {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <div className="glass max-w-md rounded-panel p-8 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-warning" />
          <h1 className="mt-4 font-display text-[18px] font-semibold text-white">
            {catalogueLoading ? 'Loading channel…' : 'Channel unavailable'}
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
            {catalogueLoading
              ? 'Fetching the catalogue so playback can start.'
              : 'This channel is not part of the current catalogue. It may have moved between packages.'}
          </p>
          {!catalogueLoading ? (
            <Button variant="primary" className="mt-6" onClick={() => navigate('/')}>
              Back to home
            </Button>
          ) : (
            <div className="mx-auto mt-6 h-1 w-40 overflow-hidden rounded-pill bg-white/10">
              <div className="h-full w-1/2 animate-pulse rounded-pill bg-accent-gradient" />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn('relative flex h-full w-full overflow-hidden bg-black', !controlsVisible && 'player-idle')}
      onPointerMove={wake}
      onPointerDown={wake}
    >
      <video
        ref={videoRef}
        playsInline
        autoPlay={autoplay}
        onClick={togglePlay}
        onDoubleClick={() => void toggleFullscreen()}
        className="absolute inset-0 h-full w-full bg-black object-contain"
      />

      {/* Channel artwork shows through until the first frame is decoded. */}
      <AnimatePresence>
        {(!engine.ready || streamLoading) && !fatalError ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: stageBackground }}
          >
            <span className="pointer-events-none absolute right-10 top-1/2 hidden -translate-y-1/2 font-display text-[220px] font-extrabold leading-none text-white/[0.05] lg:block">
              {initials(channel.name)}
            </span>
            <div className="relative flex flex-col items-center text-center">
              <span className="flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-black/30 backdrop-blur-md">
                <ChannelLogo channel={channel} size="lg" glow />
              </span>
              <h2 className="mt-5 font-display text-[20px] font-semibold text-white">{channel.name}</h2>
              <p className="mt-1 text-[12px] text-text-secondary">
                {current?.title ?? 'Live programming'} · {channel.language}
              </p>
              {!fatalError ? (
                <div className="mt-6 flex items-center gap-3 text-[12px] text-text-muted">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-accent-glow" />
                  {streamLoading
                    ? 'Resolving stream…'
                    : engine.reconnecting
                      ? 'Reconnecting…'
                      : 'Tuning in…'}
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Top overlay */}
      <div
        className={cn(
          'absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/85 via-black/35 to-transparent px-5 pb-16 pt-4 transition-opacity duration-300',
          controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      >
        <div className="flex items-start justify-between gap-6">
          <div className="flex min-w-0 items-center gap-3">
            <IconButton
              label="Back"
              variant="glass"
              onClick={() => navigate(-1)}
              className="h-9 w-9 rounded-xl"
            >
              <ArrowLeft className="h-4 w-4" />
            </IconButton>
            <ChannelLogo channel={channel} size="sm" />
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-white">
                <span className="truncate">{channel.name}</span>
                <LiveBadge />
              </p>
              <p className="mt-0.5 truncate text-[11.5px] text-white/60">
                {channel.number} · {current ? current.title : 'Live programming'}
                {current ? ` · ${formatRange(current.start, current.end)}` : ''}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {stream?.isDrm ? (
              <span className="rounded-pill border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200">
                Widevine
              </span>
            ) : null}
            {stream ? (
              <span className="rounded-pill border border-white/10 bg-black/35 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70 backdrop-blur-md">
                {stream.type === 'dash' ? 'DASH' : 'HLS'} · {qualityLabel}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Central play affordance while paused */}
      <AnimatePresence>
        {!isPlaying && engine.ready && !fatalError ? (
          <motion.button
            type="button"
            aria-label="Play"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            onClick={togglePlay}
            className="absolute left-1/2 top-1/2 z-20 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur-md transition-transform hover:scale-105"
          >
            <Play className="ml-1 h-8 w-8 fill-current" />
          </motion.button>
        ) : null}
      </AnimatePresence>

      {/* Buffering chip */}
      <AnimatePresence>
        {isPlaying && (engine.buffering || engine.reconnecting) && !fatalError ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute left-1/2 top-[86px] z-20 flex -translate-x-1/2 items-center gap-2.5 rounded-pill border border-white/10 bg-black/60 px-4 py-2 text-[12px] text-white/85 backdrop-blur-md"
          >
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-accent-glow" />
            {engine.reconnecting ? 'Reconnecting…' : 'Buffering…'}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Fatal error */}
      <AnimatePresence>
        {fatalError ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm"
          >
            <div className="glass-strong w-full max-w-[520px] rounded-panel p-7 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-danger/25 bg-danger/10 text-danger">
                <AlertTriangle className="h-6 w-6" />
              </span>
              <h2 className="mt-5 font-display text-[19px] font-semibold text-white">
                {fatalError.code === 'AUTH_REQUIRED' ? 'Sign in to watch' : 'Playback stopped'}
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">{fatalError.message}</p>
              {stream?.note ? (
                <p className="mt-2 text-[11.5px] leading-relaxed text-text-muted">{stream.note}</p>
              ) : null}
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                {fatalError.code === 'AUTH_REQUIRED' ? (
                  <Button
                    variant="primary"
                    onClick={() => openLogin('Sign in with your JioTV number to watch this channel.')}
                  >
                    Sign in
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    icon={<ListVideo className="h-4 w-4" />}
                    onClick={() => {
                      // Re-fetch a fresh signed URL before retrying so a stale
                      // hdnea token doesn't immediately fail again.
                      if (mode === 'jio') {
                        resolveStream().then((fresh) => {
                          if (fresh) setStream(fresh)
                          setAttempt((value) => value + 1)
                          engine.retry()
                        }).catch(() => {
                          setAttempt((value) => value + 1)
                          engine.retry()
                        })
                      } else {
                        setAttempt((value) => value + 1)
                        engine.retry()
                      }
                    }}
                  >
                    Retry
                  </Button>
                )}
                <Button variant="glass" onClick={() => setDrawerOpen(true)}>
                  Choose another channel
                </Button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Parental lock screen */}
      {locked ? (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center px-6"
          style={{ background: stageBackground }}
        >
          <div className="glass-strong max-w-[440px] rounded-panel p-8 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-warning/25 bg-warning/10 text-warning">
              <LockKeyhole className="h-6 w-6" />
            </span>
            <h1 className="mt-5 font-display text-[19px] font-semibold text-white">
              Kids category is locked
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
              A parental PIN is required before {channel.name} can start playing.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Button
                variant="primary"
                icon={<Keyboard className="h-4 w-4" />}
                onClick={() => setPinOpen(true)}
              >
                Enter PIN
              </Button>
              <Button variant="glass" onClick={() => navigate('/')}>
                Back home
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <PinDialog
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onCancel={() => navigate(-1)}
        title="Kids category"
        description={`Enter the PIN to watch ${channel.name}.`}
        onSubmit={async (pin) => {
          const hash = await sha256Hex(`streamdeck:${pin}`)
          if (!parentalPinHash || hash !== parentalPinHash) return 'Incorrect PIN.'
          setUnlockedChannelId(channelId)
          setPinOpen(false)
          return null
        }}
      />

      {/* Bottom control layer */}
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/95 via-black/60 to-transparent px-5 pb-5 pt-24 transition-opacity duration-300',
          controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      >
        <div className="mb-3 flex items-end justify-between gap-6">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-white">
              {current?.title ?? channel.name}
            </p>
            <p className="mt-0.5 truncate text-[11.5px] text-white/55">
              {current ? formatRange(current.start, current.end) : 'Live'}
              {current ? ` · ${formatTimeLeft(current.end, now)}` : ''}
            </p>
          </div>
          {next ? (
            <p className="hidden shrink-0 text-right text-[11.5px] text-white/50 md:block">
              Next · <span className="text-white/75">{next.title}</span> at {formatRange(next.start, next.end)}
            </p>
          ) : null}
        </div>

        {/* Live timeline */}
        <div className="mb-5 flex items-center gap-3">
          <div className="relative h-[5px] flex-1 rounded-pill bg-white/12">
            <div
              className="absolute inset-y-0 left-0 rounded-pill bg-accent-gradient transition-[width] duration-700 ease-premium"
              style={{ width: `${liveProgress}%` }}
            />
            <div
              className="absolute top-1/2 h-[13px] w-[13px] -translate-y-1/2 rounded-full border-2 border-white bg-accent shadow-[0_0_12px_rgba(124,92,255,.9)] transition-[left] duration-700 ease-premium"
              style={{ left: `calc(${liveProgress}% - 6px)` }}
            />
          </div>
          <span className="shrink-0 rounded-pill bg-live px-2 py-[3px] text-[9px] font-bold uppercase tracking-[0.14em] text-white">
            Live
          </span>
        </div>

        <div className="flex items-center justify-between gap-6">
          <div className="flex flex-1 items-center gap-3">
            <IconButton label={muted ? 'Unmute' : 'Mute'} size="sm" onClick={toggleMuted} variant="glass">
              {muted ? (
                <VolumeX className="h-4 w-4" />
              ) : volume > 0.5 ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <Volume1 className="h-4 w-4" />
              )}
            </IconButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(event) => changeVolume(Number(event.target.value))}
              aria-label="Volume"
              className="h-1 w-24 cursor-pointer appearance-none rounded-pill bg-white/15 accent-[#7C5CFF]"
            />
          </div>

          <div className="flex items-center gap-3">
            <IconButton label="Previous channel" size="sm" variant="glass" onClick={() => zap(-1)}>
              <SkipBack className="h-4 w-4" />
            </IconButton>
            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-black shadow-[0_10px_30px_-8px_rgba(255,255,255,.5)] transition-transform hover:scale-105"
            >
              {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
            </button>
            <IconButton label="Next channel" size="sm" variant="glass" onClick={() => zap(1)}>
              <SkipForward className="h-4 w-4" />
            </IconButton>
          </div>

          <div className="relative flex flex-1 items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setQualityOpen((value) => !value)}
              aria-haspopup="menu"
              aria-label="Stream quality"
              aria-expanded={qualityOpen}
              className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-[11.5px] font-medium text-white/85 backdrop-blur-md transition-colors hover:bg-white/[0.12]"
            >
              {qualityLabel}
            </button>
            <AnimatePresence>
              {qualityOpen ? (
                <QualityMenu
                  levels={engine.levels}
                  activeLevel={engine.activeLevel}
                  activeHeight={activeHeight}
                  onSelect={(level) => {
                    engine.setLevel(level)
                    setQuality(level === 'auto' ? 'auto' : engine.levels[level]?.height ?? quality)
                  }}
                  onClose={() => setQualityOpen(false)}
                />
              ) : null}
            </AnimatePresence>
            <IconButton
              label="Channel list"
              size="sm"
              variant="glass"
              onClick={() => setDrawerOpen(true)}
            >
              <ListVideo className="h-4 w-4" />
            </IconButton>
            <IconButton label="Picture in picture" size="sm" variant="glass" onClick={() => void togglePip()}>
              <PictureInPicture2 className="h-4 w-4" />
            </IconButton>
            <IconButton
              label="Keyboard shortcuts"
              size="sm"
              variant="glass"
              onClick={() => setHelpOpen(true)}
            >
              <CircleHelp className="h-4 w-4" />
            </IconButton>
            <IconButton
              label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              size="sm"
              variant="glass"
              onClick={() => void toggleFullscreen()}
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </IconButton>
          </div>
        </div>
      </div>

      <ChannelDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        channels={channels}
        epg={epg}
        currentChannelId={channelId}
        onSelect={(nextId) => {
          setDrawerOpen(false)
          if (nextId !== channelId) navigate(`/watch/${nextId}`)
        }}
      />
      <ShortcutsOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
