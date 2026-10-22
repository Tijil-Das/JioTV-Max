import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeft,
  Keyboard,
  LockKeyhole,
  Play,
  Pause,
  Radio,
  RefreshCw,
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
import { formatBehindLive, formatRange, formatTimeLeft, getNowNext } from '@/lib/time'
import { ApiError, getBridge } from '@/services/api'
import { channelService } from '@/services/channelService'
import { streamProbe } from '@/services/streamProbe'
import { checkAndHandleAuthError } from '@/lib/authErrorHandler'
import { useMediaPlayer } from '@/hooks/useMediaPlayer'
import { useLiveEdge } from '@/hooks/useLiveEdge'
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
import { DvrSeekBar } from '@/components/player/DvrSeekBar'
import { QualityMenu } from '@/components/player/QualityMenu'
import { ShortcutsOverlay } from '@/components/player/ShortcutsOverlay'
import { SkipButton, type SkipButtonHandle } from '@/components/player/SkipButton'
import { SeekOverlay } from '@/components/player/SeekOverlay'
import { useDoubleTapSeek } from '@/hooks/useDoubleTapSeek'
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
  const location = useLocation()
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
  const pushToast = useUIStore((state) => state.pushToast)
  const lastBrowsePath = useUIStore((state) => state.lastBrowsePath)

  const channel = useMemo(
    () => channels.find((item) => item.id === channelId),
    [channelId, channels]
  )
  /** Stream handed off by the Home hero — same resolved URL the probe used. */
  const handoffStream = useMemo(() => {
    const state = location.state as { stream?: StreamInfo } | null
    return state?.stream ?? null
  }, [location.state])
  const programs = epg[channelId] ?? []
  const { current, next } = useMemo(() => getNowNext(programs, now), [programs, now])

  const [stream, setStream] = useState<StreamInfo | null>(null)
  const [streamLoading, setStreamLoading] = useState(true)
  const [streamError, setStreamError] = useState<StreamFailure | null>(null)
  const handoffConsumedRef = useRef(false)
  const [attempt, setAttempt] = useState(0)
  const [qualityOpen, setQualityOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [unlockedChannelId, setUnlockedChannelId] = useState<string | null>(null)
  const [showVolumeOsd, setShowVolumeOsd] = useState(false)
  const volumeOsdTimerRef = useRef<number | null>(null)

  const triggerVolumeOsd = useCallback(() => {
    setShowVolumeOsd(true)
    if (volumeOsdTimerRef.current) window.clearTimeout(volumeOsdTimerRef.current)
    volumeOsdTimerRef.current = window.setTimeout(() => {
      setShowVolumeOsd(false)
    }, 1500)
  }, [])

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

  const handleDvrGap = useCallback(() => {
    pushToast({
      title: 'This part of the broadcast is no longer available. Jumping to live.',
      variant: 'info',
      duration: 5000
    })
  }, [pushToast])

  const engine = useMediaPlayer({
    stream: locked ? null : stream,
    initialQuality: quality,
    onReconnect: mode === 'jio' ? resolveStream : undefined,
    onDvrGap: handleDvrGap
  })
  const { videoRef } = engine
  const liveEdge = useLiveEdge({
    videoRef,
    seekRange: engine.seekRange,
    goLive: engine.goLive,
    enabled: Boolean(stream?.isLive),
    ready: engine.ready
  })

  // ---- Hero handoff -------------------------------------------------------
  // The hero destroys its players before navigating; make sure any hidden
  // probe player is also gone the moment the player route mounts.
  useEffect(() => {
    streamProbe.destroyProbePlayers()
  }, [])

  // ---- Stream resolution -------------------------------------------------
  useEffect(() => {
    if (!channel || locked) {
      setStream(null)
      setStreamLoading(false)
      return
    }
    let cancelled = false
    setStream(null)
    setStreamError(null)

    // First attempt: reuse the hero's verified stream (identical relay URL).
    const handoff =
      !handoffConsumedRef.current &&
      attempt === 0 &&
      handoffStream?.channelId === channel.id
        ? handoffStream
        : null
    if (handoff) {
      handoffConsumedRef.current = true
      console.log(`[PlayerPage] Using hero handoff stream for ${channel.id}`)
      setStream(handoff)
      setStreamLoading(false)
      recordRecent(channel.id, 0)
      return () => {
        cancelled = true
      }
    }

    setStreamLoading(true)
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
        checkAndHandleAuthError(cause)
        const error = cause instanceof ApiError ? cause : null
        setStreamError({
          message: cause instanceof Error ? cause.message : 'The stream could not be resolved.',
          code: error?.code
        })
      })
    return () => {
      cancelled = true
    }
  }, [channel?.id, mode, attempt, locked, handoffStream])

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
    // Automatically always play in fullscreen
    if (bridge) {
      void bridge.setFullscreen(true).catch(() => undefined)
    }
    if (typeof document !== 'undefined' && !document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => undefined)
    }
    setFullscreen(true)

    const onDocumentFullscreen = (): void => {
      const isFs = Boolean(document.fullscreenElement)
      setFullscreen(isFs)
    }
    document.addEventListener('fullscreenchange', onDocumentFullscreen)
    const off = bridge?.onFullscreenChange((value) => {
      setFullscreen(value)
    })
    return () => {
      document.removeEventListener('fullscreenchange', onDocumentFullscreen)
      off?.()
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined)
      }
      void bridge?.setFullscreen(false).catch(() => undefined)
      setFullscreen(false)
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
  const menusOpen = qualityOpen || helpOpen || pinOpen
  const { idle, wake } = useIdle(3200, isPlaying && !menusOpen)
  const controlsVisible = !idle || !isPlaying || menusOpen

  useEffect(() => {
    setControlsVisible(controlsVisible)
  }, [controlsVisible, setControlsVisible])

  const togglePlay = useCallback(() => {
    wake()
    setPlaying(!isPlaying)
  }, [isPlaying, setPlaying, wake])

  // Tracks whether the viewer deliberately seeked backward into DVR history
  const userRewoundRef = useRef(false)

  // Reset rewind state when changing channels
  useEffect(() => {
    userRewoundRef.current = false
  }, [channelId])

  const handleSeek = useCallback(
    (target: number) => {
      wake()
      const range = engine.seekRange
      if (range && target >= range.end - 2) {
        userRewoundRef.current = false
        const media = videoRef.current
        if (media && media.playbackRate !== 1.0) media.playbackRate = 1.0
        engine.goLive()
      } else {
        userRewoundRef.current = true
        engine.seekTo(target)
      }
    },
    [engine, videoRef, wake]
  )

  const handleGoLive = useCallback(() => {
    wake()
    userRewoundRef.current = false
    const media = videoRef.current
    if (media && media.playbackRate !== 1.0) {
      media.playbackRate = 1.0
    }
    engine.goLive()
  }, [engine, videoRef, wake])

  const { handleContainerClick, triggerSkip, seekOverlay } = useDoubleTapSeek({
    videoRef,
    seekRange: engine.seekRange,
    onSingleClick: togglePlay,
    onCenterDoubleClick: () => {
      if (bridge) void bridge.setFullscreen(true).catch(() => undefined)
      if (typeof document !== 'undefined' && !document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => undefined)
      }
    },
    onSeekTo: (target) => {
      userRewoundRef.current = true
      engine.seekTo(target)
    },
    onGoLive: handleGoLive,
    secondsPerSkip: 5
  })

  const rewindButtonRef = useRef<SkipButtonHandle>(null)
  const forwardButtonRef = useRef<SkipButtonHandle>(null)

  const handleSkip = useCallback(
    (direction: 'forward' | 'backward') => {
      if (direction === 'forward') {
        forwardButtonRef.current?.triggerAnimation()
      } else {
        rewindButtonRef.current?.triggerAnimation()
      }
      triggerSkip(direction)
      wake()
    },
    [triggerSkip, wake]
  )

  const rewind5 = useCallback(() => handleSkip('backward'), [handleSkip])
  const forward5 = useCallback(() => handleSkip('forward'), [handleSkip])

  // Live synchronization and live-edge protection.
  // Avoids artificial 1.05x speedups that exhaust live buffers.
  useEffect(() => {
    const isLive = Boolean(stream?.isLive)
    if (!isLive) return

    const syncTick = () => {
      const media = videoRef.current
      const range = engine.seekRange
      if (!media || !range || !isPlaying || userRewoundRef.current) return

      // Ensure playbackRate stays 1.0
      if (media.playbackRate !== 1.0) {
        media.playbackRate = 1.0
      }

      const behind = Math.max(0, range.end - media.currentTime)
      // Only snap if viewer was live but somehow fell severely behind the rolling DVR window (> 30s)
      if (behind > 30) {
        engine.goLive()
      }
    }

    const timer = window.setInterval(syncTick, 2000)

    // Visibility / un-minimize handler:
    // If the window is restored from minimized, ensure playback is active
    const onVisibility = () => {
      const media = videoRef.current
      if (!media) return
      if (document.visibilityState === 'visible') {
        if (isPlaying && media.paused) {
          void media.play().catch(() => undefined)
        }
        if (!userRewoundRef.current) {
          const range = engine.seekRange
          const behind = range ? Math.max(0, range.end - media.currentTime) : 0
          if (behind > 25) {
            engine.goLive()
          }
        }
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onVisibility)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onVisibility)
    }
  }, [engine, isPlaying, stream?.isLive, videoRef])

  const ensureFullscreen = useCallback(async () => {
    try {
      if (bridge) {
        await bridge.setFullscreen(true).catch(() => undefined)
      }
      if (typeof document !== 'undefined' && !document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen().catch(() => undefined)
      }
      setFullscreen(true)
    } catch {
      // ignore
    }
  }, [bridge, setFullscreen])

  const handleBack = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined)
    }
    await bridge?.setFullscreen(false).catch(() => undefined)
    setFullscreen(false)
    const state = location.state as { from?: string } | null
    const from = state?.from
    const target =
      from && !from.startsWith('/watch')
        ? from
        : lastBrowsePath && !lastBrowsePath.startsWith('/watch')
          ? lastBrowsePath
          : '/'
    navigate(target, { replace: true })
  }, [bridge, lastBrowsePath, location.state, navigate, setFullscreen])

  const zap = useCallback(
    (direction: -1 | 1) => {
      if (channels.length < 2) return
      const index = channels.findIndex((item) => item.id === channelId)
      const nextChannel = channels[(index + direction + channels.length) % channels.length]
      if (nextChannel) navigate(`/watch/${nextChannel.id}`, { replace: true })
    },
    [channelId, channels, navigate]
  )

  const changeVolume = useCallback(
    (value: number) => {
      setVolume(value)
      triggerVolumeOsd()
      wake()
    },
    [setVolume, triggerVolumeOsd, wake]
  )

  const handleToggleMute = useCallback(() => {
    toggleMuted()
    triggerVolumeOsd()
    wake()
  }, [toggleMuted, triggerVolumeOsd, wake])

  // ---- Keyboard shortcuts ------------------------------------------------
  useHotkeys({
    ' ': (event) => {
      event.preventDefault()
      togglePlay()
    },
    j: () => handleSkip('backward'),
    l: () => handleSkip('forward'),
    '[': () => handleSkip('backward'),
    ']': () => handleSkip('forward'),
    ArrowUp: (event) => {
      event.preventDefault()
      changeVolume(Math.min(1, Number((volume + 0.05).toFixed(2))))
    },
    ArrowDown: (event) => {
      event.preventDefault()
      changeVolume(Math.max(0, Number((volume - 0.05).toFixed(2))))
    },
    ArrowLeft: (event) => {
      event.preventDefault()
      handleSkip('backward')
    },
    ArrowRight: (event) => {
      event.preventDefault()
      handleSkip('forward')
    },
    m: () => handleToggleMute(),
    f: () => void ensureFullscreen(),
    q: () => {
      setQualityOpen((value) => !value)
      wake()
    },
    '?': () => setHelpOpen((value) => !value),
    Escape: () => {
      if (qualityOpen || helpOpen) {
        setQualityOpen(false)
        setHelpOpen(false)
      } else {
        void handleBack()
      }
    }
  })

  // ---- Render helpers ----------------------------------------------------
  const fatalError: StreamFailure | null = streamError ?? (engine.error ? { message: engine.error } : null)
  const activeHeight =
    engine.activeHeight > 0
      ? engine.activeHeight
      : engine.activeLevel === 'auto'
        ? typeof quality === 'number'
          ? quality
          : videoRef.current?.videoHeight || 0
        : engine.levels[engine.activeLevel]?.height ?? (videoRef.current?.videoHeight || 0)
  const qualityLabel =
    engine.activeLevel === 'auto'
      ? 'Auto'
      : engine.levels[engine.activeLevel]?.height
        ? `${engine.levels[engine.activeLevel].height}p`
        : QUALITY_OPTIONS.find((option) => option.value === quality)?.label ?? 'Auto'

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
            <Button variant="primary" className="mt-6" onClick={() => void handleBack()}>
              Return to channels
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
      <div
        className="absolute inset-0 cursor-pointer"
        onClick={handleContainerClick}
      >
        <video
          ref={videoRef}
          playsInline
          autoPlay={autoplay}
          className="pointer-events-none absolute inset-0 h-full w-full bg-black object-contain"
        />
        <SeekOverlay {...seekOverlay} />
      </div>

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
                <ChannelLogo channel={channel} size="lg" />
              </span>
              <h2 className="mt-5 font-display text-[20px] font-semibold text-white">{channel.name}</h2>
              <p className="mt-1 text-[12px] text-text-secondary">
                {current
                  ? `${current.title}${channel.language ? ` · ${channel.language}` : ''}`
                  : channel.language}
              </p>
              {!fatalError ? (
                <div className="mt-6 flex items-center gap-3 text-[12px] text-text-secondary">
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
          'drag-region absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/95 via-black/65 to-transparent px-5 pb-16 pt-4 transition-opacity duration-300',
          controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      >
        <div className="flex items-start justify-between gap-6">
          <div className="no-drag flex min-w-0 flex-1 items-center gap-3">
            <IconButton
              label="Back"
              variant="glass"
              onClick={() => void handleBack()}
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
              <p className="mt-0.5 truncate text-[12px] text-white/70">
                {channel.number}
                {current ? ` · ${current.title}` : ''}
                {current ? ` · ${formatRange(current.start, current.end)}` : ''}
              </p>
            </div>
          </div>
        </div>
      </div>


      {/* Buffering: only the spinner itself (thicker stroke, no background circle or pill) */}
      <AnimatePresence>
        {isPlaying && (engine.buffering || engine.reconnecting) && !fatalError ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
          >
            <svg
              className="h-12 w-12 animate-spin text-[#E11D2E] drop-shadow-md"
              viewBox="0 0 48 48"
              fill="none"
              aria-label="Buffering"
            >
              <circle
                cx="24"
                cy="24"
                r="18"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeDasharray="34 79"
                strokeLinecap="round"
              />
            </svg>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Fatal error */}
      <AnimatePresence>
        {fatalError ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 px-6 backdrop-blur-md"
          >
            <div className="w-full max-w-[460px] rounded-[20px] border border-white/10 bg-[#121215]/95 p-8 text-center shadow-[0_24px_64px_rgba(0,0,0,0.85)]">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10 text-[var(--red)] shadow-[0_0_20px_rgba(225,29,46,0.2)]">
                <AlertTriangle className="h-7 w-7" />
              </span>
              <h2 className="mt-5 font-sans text-[20px] font-bold tracking-tight text-[#F4F4F5]">
                {fatalError.code === 'AUTH_REQUIRED' ? 'Sign in to watch' : 'Playback stopped'}
              </h2>
              <p className="mt-2 text-[14px] leading-relaxed text-[#A1A1A6]">
                {fatalError.message}
              </p>
              {stream?.note ? (
                <p className="mt-2 text-[12px] leading-relaxed text-[#71717A]">{stream.note}</p>
              ) : null}
              <div className="mt-7 flex items-center justify-center gap-3">
                <Button
                  variant="secondary"
                  className="min-w-[110px] rounded-[10px] px-5 py-2.5"
                  onClick={() => void handleBack()}
                >
                  Cancel
                </Button>
                {fatalError.code === 'AUTH_REQUIRED' || fatalError.code === 'TOKEN_EXPIRED' ? (
                  <Button
                    variant="primary"
                    className="min-w-[110px] rounded-[10px] px-5 py-2.5"
                    onClick={() => openLogin('Sign in with your JioTV number to watch this channel.')}
                  >
                    Sign in
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    className="min-w-[110px] rounded-[10px] px-5 py-2.5"
                    icon={<RefreshCw className="h-4 w-4" />}
                    onClick={() => {
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
              <Button variant="glass" onClick={() => void handleBack()}>
                Back home
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <PinDialog
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onCancel={() => void handleBack()}
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

        {/* DVR timeline: the thumbs maps to the manifest's seekable window. */}
        <div className="mb-5 flex items-center gap-3">
          <DvrSeekBar
            seekRange={engine.seekRange}
            currentTime={liveEdge.currentTime}
            behindLive={liveEdge.behindLive}
            atLiveEdge={liveEdge.atLiveEdge}
            isDelayed={liveEdge.isDelayed}
            isLive={Boolean(stream?.isLive)}
            onSeek={handleSeek}
            onGoLive={handleGoLive}
          />
        </div>

        <div className="relative flex min-h-[48px] items-center justify-between gap-6">
          <div className="pointer-events-none flex flex-1 items-center gap-3">
            <div className="pointer-events-auto flex items-center gap-3">
              <IconButton label={muted ? 'Unmute' : 'Mute'} size="sm" onClick={handleToggleMute} variant="glass">
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
                className="h-1 w-24 cursor-pointer appearance-none rounded-pill bg-white/15 accent-[#E11D2E]"
              />
            </div>
          </div>

          <div className="pointer-events-auto absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 sm:gap-1.5">
            <SkipButton
              ref={rewindButtonRef}
              direction="backward"
              seconds={5}
              onSkip={() => {
                triggerSkip('backward')
                wake()
              }}
            />

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                togglePlay()
              }}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-white text-neutral-900 shadow-[0_2px_14px_rgba(0,0,0,0.5)] border border-white/25 transition-all hover:bg-neutral-100 hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {isPlaying ? (
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
                  <rect x="5.25" y="2.5" width="5" height="19" rx="1.5" />
                  <rect x="13.75" y="2.5" width="5" height="19" rx="1.5" />
                </svg>
              ) : (
                <Play className="ml-0.5 h-6 w-6 fill-current" />
              )}
            </button>

            <SkipButton
              ref={forwardButtonRef}
              direction="forward"
              seconds={5}
              onSkip={() => {
                triggerSkip('forward')
                wake()
              }}
            />
          </div>

          <div className="pointer-events-none relative flex flex-1 items-center justify-end gap-2">
            <div className="pointer-events-auto relative">
              <button
                type="button"
                onClick={() => setQualityOpen((value) => !value)}
                aria-haspopup="menu"
                aria-label="Stream quality"
                aria-expanded={qualityOpen}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[12px] font-medium text-white/90 backdrop-blur-md transition-colors hover:border-white/20 hover:bg-white/[0.12]"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#E11D2E]" />
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
            </div>
          </div>
        </div>
      </div>

      {/* Persistent Go Live affordance when UI controls disappear due to inactivity */}
      {!controlsVisible && liveEdge.isDelayed && stream?.isLive ? (
        <div className="absolute bottom-6 right-6 z-30 flex items-center gap-2 transition-opacity duration-300">
          <span
            className="rounded-md border border-white/10 bg-[#141416]/90 px-2 py-1 font-mono text-[11.5px] font-medium tabular-nums text-zinc-300 backdrop-blur-md shadow-md"
            title={`${formatBehindLive(liveEdge.behindLive)} behind live`}
          >
            -{formatBehindLive(liveEdge.behindLive)}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleGoLive()
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/15 bg-[#1e1e22]/90 px-3 text-[12px] font-medium text-zinc-200 backdrop-blur-md shadow-lg transition-all hover:bg-[#28282e] hover:text-white hover:border-white/25 active:scale-95"
          >
            <Radio className="h-3.5 w-3.5 text-zinc-400" />
            Go Live
          </button>
        </div>
      ) : null}

      {/* Volume OSD HUD indicator */}
      <AnimatePresence>
        {showVolumeOsd ? (
          <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.15 }}
              className="flex min-w-[150px] flex-col items-center gap-2.5 rounded-2xl border border-white/15 bg-black/85 px-6 py-4 shadow-2xl backdrop-blur-xl"
            >
              <div className="flex items-center gap-3">
                {muted || volume === 0 ? (
                  <VolumeX className="h-6 w-6 text-white/70" />
                ) : volume < 0.5 ? (
                  <Volume1 className="h-6 w-6 text-white" />
                ) : (
                  <Volume2 className="h-6 w-6 text-white" />
                )}
                <span className="font-display text-2xl font-bold tracking-tight text-white tabular-nums">
                  {muted ? 'Muted' : `${Math.round(volume * 100)}%`}
                </span>
              </div>
              {/* Visual volume level bar */}
              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-[#E11D2E] transition-all duration-100 ease-out"
                  style={{ width: `${muted ? 0 : Math.round(volume * 100)}%` }}
                />
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <ShortcutsOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
