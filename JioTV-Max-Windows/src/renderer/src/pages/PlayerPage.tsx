import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeft,
  Keyboard,
  LockKeyhole,
  Maximize,
  Minimize,
  Play,
  Pause,
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
import { WindowControls } from '@/components/layout/WindowControls'
import { CastButton } from '@/components/casting/CastButton'
import { CastDialog } from '@/components/casting/CastDialog'
import { CastingOverlay } from '@/components/casting/CastingOverlay'
import { CastFallbackModal } from '@/components/casting/CastFallbackModal'
import { useCastStore } from '@/components/casting/useCastStore'
import type { CastMediaInput } from '@shared/cast-types'
import appIcon from '@/assets/icons/app-icon-32.png'

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

  // Window size tracking for responsive player controls scaling
  const [windowSize, setWindowSize] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 720
  }))

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Responsive scale factor for player controls and overlays.
  // Fullscreen maintains 1.0 (current reference size).
  // When window shrinks toward minimum dimensions (480x320), scale clamps to MIN_SCALE (0.80),
  // which is close to full size while keeping interactive controls neatly clickable.
  const ctrlScale = useMemo(() => {
    if (isFullscreen) return 1.0
    const { width, height } = windowSize
    const refW = typeof window !== 'undefined' && window.screen?.width ? Math.max(1280, window.screen.width) : 1920
    const refH = typeof window !== 'undefined' && window.screen?.height ? Math.max(720, window.screen.height) : 1080
    const MIN_SCALE = 0.80
    const MAX_SCALE = 1.0
    const factorW = (width - 480) / (refW - 480)
    const factorH = (height - 320) / (refH - 320)
    const factor = Math.min(factorW, factorH)
    const calculated = MIN_SCALE + factor * (MAX_SCALE - MIN_SCALE)
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(calculated.toFixed(3))))
  }, [isFullscreen, windowSize])

  // Responsive scale factor specifically tailored for the center Volume OSD HUD indicator.
  // In fullscreen, maintains 1.0 reference scale.
  // In smaller windowed viewports, it scales down much more aggressively (down to 0.50)
  // so the center card never dominates or obscures the video in smaller app windows.
  const volumeOsdScale = useMemo(() => {
    if (isFullscreen) return 1.0
    const { width, height } = windowSize
    const refW = typeof window !== 'undefined' && window.screen?.width ? Math.max(1280, window.screen.width) : 1920
    const refH = typeof window !== 'undefined' && window.screen?.height ? Math.max(720, window.screen.height) : 1080
    const MIN_SCALE = 0.50
    const MAX_SCALE = 1.0
    const factorW = (width - 480) / (refW - 480)
    const factorH = (height - 320) / (refH - 320)
    const factor = Math.min(Math.max(0, factorW), Math.max(0, factorH))
    const calculated = MIN_SCALE + factor * (MAX_SCALE - MIN_SCALE)
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(calculated.toFixed(3))))
  }, [isFullscreen, windowSize])

  const locked = parentalEnabled && channel?.category === 'kids' && unlockedChannelId !== channelId

  const jioQualityKey = mode === 'jio' ? String(quality) : 'demo'

  // ---- Stream re-resolution for reconnects ------------------------------
  // Called by the engine before each automatic retry so it can load a fresh
  // signed URL (new hdnea token) instead of the stale relay session.
  const resolveStream = useCallback(async (): Promise<StreamInfo | null> => {
    if (!channel) return null
    // console.log('[PlayerPage] Reconnecting: resolving fresh stream for', channel.id)
    try {
      const res = await channelService.getStream(channel, mode, quality)
      // console.log('[PlayerPage] Fresh stream resolved successfully:', res)
      return res
    } catch (err) {
      // console.error('[PlayerPage] Fresh stream resolution failed:', err)
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

  // ---- Casting integration ------------------------------------------------
  const activeCastState = useCastStore((state) => state.activeState)
  const stopCast = useCastStore((state) => state.stopCast)
  const startCast = useCastStore((state) => state.startCast)
  const setFallbackModalOpen = useCastStore((state) => state.setFallbackModalOpen)
  const isCasting = activeCastState.state === 'casting' || activeCastState.state === 'loading'
  const prevIsCastingRef = useRef(false)

  const castMedia: CastMediaInput | null = useMemo(() => {
    if (!stream || !channel) return null
    return {
      url: stream.url,
      title: channel.name || 'Live Broadcast',
      imageUrl: channel.logoUrl,
      isLive: Boolean(stream.isLive),
      contentType: stream.type === 'hls' ? 'application/vnd.apple.mpegurl' : 'application/dash+xml',
      headers: stream.headers
    }
  }, [stream, channel])

  // Pause local playback when casting begins; resume at live edge when stopped
  useEffect(() => {
    if (isCasting && !prevIsCastingRef.current) {
      if (videoRef.current) {
        videoRef.current.pause()
      }
    } else if (!isCasting && prevIsCastingRef.current) {
      pushToast({
        title: activeCastState.device ? `Disconnected from ${activeCastState.device.name}` : 'Stopped casting',
        variant: 'info'
      })
      if (stream?.isLive) {
        liveEdge.goLive()
      }
      videoRef.current?.play().catch(() => {})
    }
    prevIsCastingRef.current = isCasting
  }, [isCasting, videoRef, liveEdge, stream?.isLive, pushToast, activeCastState.device])

  // If channel changes while actively casting, update the cast session on the same TV
  useEffect(() => {
    if (isCasting && castMedia && activeCastState.device) {
      void startCast(activeCastState.device.id, castMedia)
    }
  }, [channelId])

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
      // console.log(`[PlayerPage] Using hero handoff stream for ${channel.id}`)
      setStream(handoff)
      setStreamLoading(false)
      recordRecent(channel.id, 0)
      return () => {
        cancelled = true
      }
    }

    setStreamLoading(true)
    // console.log(`[PlayerPage] Fetching stream for ${channel.id} (${channel.name}), mode=${mode}, quality=${quality}`)
    channelService
      .getStream(channel, mode, quality)
      .then((result) => {
        if (cancelled) return
        // console.log(`[PlayerPage] Successfully resolved stream for ${channel.id}:`, result)
        setStream(result)
        setStreamLoading(false)
        recordRecent(channel.id, 0)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        // console.error(`[PlayerPage] Failed to resolve stream for ${channel.id}:`, cause)
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
    // Sync initial fullscreen state with bridge / document without forcing fullscreen
    const onDocumentFullscreen = (): void => {
      const isFs = Boolean(document.fullscreenElement)
      setFullscreen(isFs)
    }
    onDocumentFullscreen()

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
        // console.warn('[PlayerPage] media.play() was prevented/blocked:', err)
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

  const toggleFullscreen = useCallback(async () => {
    try {
      if (bridge) {
        const next = await bridge.toggleFullscreen()
        setFullscreen(next)
        return
      }
      if (typeof document !== 'undefined') {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen().catch(() => undefined)
          setFullscreen(true)
        } else {
          await document.exitFullscreen().catch(() => undefined)
          setFullscreen(false)
        }
      }
    } catch {
      // ignore
    }
  }, [bridge, setFullscreen])

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
    onSingleClick: () => {
      if (qualityOpen || helpOpen) {
        setQualityOpen(false)
        setHelpOpen(false)
        return
      }
      togglePlay()
    },
    onCenterDoubleClick: () => {
      void toggleFullscreen()
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
      // Only snap if viewer was live but somehow fell severely behind the rolling DVR window (> 120s)
      if (behind > 120) {
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
          if (behind > 120) {
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
    f: () => void toggleFullscreen(),
    q: () => {
      setQualityOpen((value) => !value)
      wake()
    },
    '?': () => setHelpOpen((value) => !value),
    Escape: () => {
      if (qualityOpen || helpOpen) {
        setQualityOpen(false)
        setHelpOpen(false)
      } else if (isFullscreen) {
        void toggleFullscreen()
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
  const isAutoQuality = engine.activeLevel === 'auto' || quality === 'auto'
  const qualityLabel = isAutoQuality
    ? activeHeight > 0
      ? `Auto (${activeHeight}p)`
      : 'Auto'
    : typeof engine.activeLevel === 'number' && engine.levels[engine.activeLevel]?.height
      ? `${engine.levels[engine.activeLevel].height}p`
      : typeof quality === 'number'
        ? `${quality}p`
        : 'Auto'

  const stageBackground = channel
    ? `radial-gradient(110% 120% at 70% 0%, ${hexToRgba(channel.brandColor, 0.42)} 0%, transparent 60%), linear-gradient(160deg, #0d0d14, #050507)`
    : 'linear-gradient(160deg, #0d0d14, #050507)'

  if (!channel) {
    return (
      <div className="flex h-full w-full flex-col bg-black">
        {!isFullscreen ? (
          <header className="drag-region relative z-30 flex h-[36px] shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#0A0A0B] pl-3 pr-0 select-none">
            <div className="no-drag flex items-center gap-2">
              <img src={appIcon} alt="" className="h-4 w-4 shrink-0 rounded-[3px] object-contain" />
              <span className="text-[12px] font-semibold tracking-wide text-[#F4F4F5]">
                JioTv <span className="text-[var(--red)]">Max</span>
              </span>
            </div>
            <div className="drag-region h-full flex-1" />
            <div className="no-drag flex h-full shrink-0 items-center">
              <WindowControls />
            </div>
          </header>
        ) : null}
        <div className="flex flex-1 items-center justify-center">
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
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative flex h-full w-full flex-col overflow-hidden bg-black select-none',
        !controlsVisible && 'player-idle'
      )}
      onPointerMove={wake}
      onPointerDown={wake}
    >
      {/* Windowed Top Bar */}
      {!isFullscreen ? (
        <header className="drag-region relative z-30 flex h-[36px] shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#0A0A0B] pl-3 pr-0 select-none">
          <div className="no-drag flex items-center gap-2">
            <img src={appIcon} alt="" className="h-4 w-4 shrink-0 rounded-[3px] object-contain" />
            <span className="text-[12px] font-semibold tracking-wide text-[#F4F4F5]">
              JioTv <span className="text-[var(--red)]">Max</span>
            </span>
          </div>

          <div className="drag-region h-full flex-1" />

          <div className="no-drag flex h-full shrink-0 items-center">
            <WindowControls />
          </div>
        </header>
      ) : null}

      {/* Video Stage Area */}
      <div className="relative flex-1 min-h-0 w-full overflow-hidden bg-black flex items-center justify-center">
        <div
          className="absolute inset-0 cursor-pointer flex items-center justify-center"
          onClick={(e) => {
            if (qualityOpen || helpOpen) {
              e.stopPropagation()
              setQualityOpen(false)
              setHelpOpen(false)
              return
            }
            handleContainerClick(e)
          }}
        >
          <video
            ref={videoRef}
            playsInline
            autoPlay={autoplay}
            className="pointer-events-none h-full w-full bg-black object-contain"
          />
          <SeekOverlay {...seekOverlay} />
        </div>

        {/* Casting remote overlay */}
        {isCasting ? (
          <CastingOverlay media={castMedia} onStop={() => void stopCast()} />
        ) : null}

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

      {/* Top player overlay (Back button + Channel details) */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/95 via-black/60 to-transparent px-5 pb-16 pt-4 transition-opacity duration-300',
          controlsVisible ? 'opacity-100' : 'opacity-0'
        )}
      >
        <div className="pointer-events-none flex items-start justify-between gap-6">
          <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-3">
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
          'pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/95 via-black/60 to-transparent transition-opacity duration-300',
          controlsVisible ? 'opacity-100' : 'opacity-0'
        )}
        style={{
          paddingLeft: `${Math.round(20 * ctrlScale)}px`,
          paddingRight: `${Math.round(20 * ctrlScale)}px`,
          paddingBottom: `${Math.round(20 * ctrlScale)}px`,
          paddingTop: `${Math.round(80 * ctrlScale)}px`
        }}
      >

        {/* DVR timeline: the thumbs maps to the manifest's seekable window. */}
        <div
          className="pointer-events-auto flex items-center"
          style={{
            marginBottom: `${Math.round(18 * ctrlScale)}px`,
            gap: `${Math.round(12 * ctrlScale)}px`
          }}
        >
          <DvrSeekBar
            seekRange={engine.seekRange}
            currentTime={liveEdge.currentTime}
            behindLive={liveEdge.behindLive}
            atLiveEdge={liveEdge.atLiveEdge}
            isDelayed={liveEdge.isDelayed}
            isLive={Boolean(stream?.isLive)}
            onSeek={handleSeek}
            onGoLive={handleGoLive}
            scale={ctrlScale}
          />
        </div>

        <div
          className="relative flex items-center justify-between"
          style={{
            minHeight: `${Math.round(48 * ctrlScale)}px`,
            gap: `${Math.round(20 * ctrlScale)}px`
          }}
        >
          <div className="pointer-events-none flex flex-1 items-center" style={{ gap: `${Math.round(12 * ctrlScale)}px` }}>
            <div className="pointer-events-auto flex items-center" style={{ gap: `${Math.round(10 * ctrlScale)}px` }}>
              <IconButton
                label={muted ? 'Unmute' : 'Mute'}
                size="sm"
                onClick={handleToggleMute}
                variant="glass"
                style={{
                  width: `${Math.round(32 * ctrlScale)}px`,
                  height: `${Math.round(32 * ctrlScale)}px`
                }}
              >
                {muted ? (
                  <VolumeX style={{ width: Math.round(16 * ctrlScale), height: Math.round(16 * ctrlScale) }} />
                ) : volume > 0.5 ? (
                  <Volume2 style={{ width: Math.round(16 * ctrlScale), height: Math.round(16 * ctrlScale) }} />
                ) : (
                  <Volume1 style={{ width: Math.round(16 * ctrlScale), height: Math.round(16 * ctrlScale) }} />
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
                className="h-1 cursor-pointer appearance-none rounded-pill bg-white/15 accent-[#E11D2E]"
                style={{
                  width: `${Math.round((windowSize.width < 640 ? 64 : 96) * ctrlScale)}px`
                }}
              />
            </div>
          </div>

          <div
            className="pointer-events-auto absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 flex items-center"
            style={{ gap: `${Math.round(6 * ctrlScale)}px` }}
          >
            <SkipButton
              ref={rewindButtonRef}
              direction="backward"
              seconds={5}
              onSkip={() => {
                triggerSkip('backward')
                wake()
              }}
              scale={ctrlScale}
            />

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                togglePlay()
              }}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="flex items-center justify-center rounded-full bg-white text-neutral-900 shadow-[0_2px_14px_rgba(0,0,0,0.5)] border border-white/25 transition-all hover:bg-neutral-100 hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              style={{
                width: `${Math.round(48 * ctrlScale)}px`,
                height: `${Math.round(48 * ctrlScale)}px`
              }}
            >
              {isPlaying ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  style={{
                    width: `${Math.round(24 * ctrlScale)}px`,
                    height: `${Math.round(24 * ctrlScale)}px`
                  }}
                  aria-hidden="true"
                >
                  <rect x="5.25" y="2.5" width="5" height="19" rx="1.5" />
                  <rect x="13.75" y="2.5" width="5" height="19" rx="1.5" />
                </svg>
              ) : (
                <Play
                  className="fill-current"
                  style={{
                    width: `${Math.round(24 * ctrlScale)}px`,
                    height: `${Math.round(24 * ctrlScale)}px`,
                    marginLeft: `${Math.round(2 * ctrlScale)}px`
                  }}
                />
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
              scale={ctrlScale}
            />
          </div>

          <div
            className="pointer-events-none relative flex flex-1 items-center justify-end"
            style={{ gap: `${Math.round(8 * ctrlScale)}px` }}
          >
            <div className="pointer-events-auto relative">
              <button
                type="button"
                onClick={() => setQualityOpen((value) => !value)}
                aria-haspopup="menu"
                aria-label="Stream quality"
                aria-expanded={qualityOpen}
                className="flex items-center rounded-lg border border-white/10 bg-white/[0.06] font-medium text-white/90 backdrop-blur-md transition-colors hover:border-white/20 hover:bg-white/[0.12]"
                style={{
                  gap: `${Math.round(6 * ctrlScale)}px`,
                  paddingLeft: `${Math.round(12 * ctrlScale)}px`,
                  paddingRight: `${Math.round(12 * ctrlScale)}px`,
                  paddingTop: `${Math.round(6 * ctrlScale)}px`,
                  paddingBottom: `${Math.round(6 * ctrlScale)}px`,
                  fontSize: `${(12 * ctrlScale).toFixed(1)}px`
                }}
              >
                <span
                  className="rounded-full bg-[#E11D2E]"
                  style={{
                    width: `${Math.round(6 * ctrlScale)}px`,
                    height: `${Math.round(6 * ctrlScale)}px`
                  }}
                />
                {qualityLabel}
              </button>
              <AnimatePresence>
                {qualityOpen ? (
                  <>
                    <div
                      className="fixed inset-0 z-40 bg-transparent"
                      onClick={(e) => {
                        e.stopPropagation()
                        setQualityOpen(false)
                      }}
                    />
                    <QualityMenu
                      levels={engine.levels}
                      activeLevel={isAutoQuality ? 'auto' : engine.activeLevel}
                      activeHeight={activeHeight}
                      onSelect={(level) => {
                        engine.setLevel(level)
                        setQuality(level === 'auto' ? 'auto' : engine.levels[level]?.height ?? quality)
                      }}
                      onClose={() => setQualityOpen(false)}
                    />
                  </>
                ) : null}
              </AnimatePresence>
            </div>

            <div className="pointer-events-auto flex items-center" style={{ gap: `${Math.round(4 * ctrlScale)}px` }}>
              <CastButton scale={ctrlScale} isCastable={Boolean(stream?.url)} />
              <button
                type="button"
                onClick={() => void toggleFullscreen()}
                title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
                aria-label={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
                className="flex items-center justify-center text-white/75 transition-colors hover:text-white active:scale-95"
                style={{
                  padding: `${Math.round(6 * ctrlScale)}px`
                }}
              >
                {isFullscreen ? (
                  <Minimize style={{ width: Math.round(20 * ctrlScale), height: Math.round(20 * ctrlScale) }} />
                ) : (
                  <Maximize style={{ width: Math.round(20 * ctrlScale), height: Math.round(20 * ctrlScale) }} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Persistent Go Live affordance when UI controls disappear due to inactivity */}
      {!controlsVisible && liveEdge.isDelayed && stream?.isLive ? (
        <div
          className="absolute z-30 flex items-center transition-opacity duration-300"
          style={{
            bottom: `${Math.round(24 * ctrlScale)}px`,
            right: `${Math.round(24 * ctrlScale)}px`,
            gap: `${Math.round(7 * ctrlScale)}px`
          }}
        >
          <span
            className="inline-flex items-center justify-center rounded-md border border-white/10 bg-[#18181b]/90 font-mono font-medium tabular-nums text-zinc-300 shadow-sm backdrop-blur-md"
            style={{
              height: `${Math.round(31 * ctrlScale)}px`,
              paddingLeft: `${Math.round(10 * ctrlScale)}px`,
              paddingRight: `${Math.round(10 * ctrlScale)}px`,
              fontSize: `${(12.5 * ctrlScale).toFixed(1)}px`
            }}
            title={`${formatBehindLive(liveEdge.behindLive)} behind live`}
          >
            {formatBehindLive(liveEdge.behindLive)}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleGoLive()
            }}
            className="inline-flex items-center justify-center rounded-md border border-white/12 bg-[#222226]/90 font-semibold text-zinc-200 tracking-wide backdrop-blur-md shadow-sm transition-all hover:bg-[#2c2c32] hover:text-white hover:border-white/25 active:scale-95"
            style={{
              height: `${Math.round(31 * ctrlScale)}px`,
              paddingLeft: `${Math.round(14 * ctrlScale)}px`,
              paddingRight: `${Math.round(14 * ctrlScale)}px`,
              fontSize: `${(13 * ctrlScale).toFixed(1)}px`
            }}
          >
            Go Live
          </button>
        </div>
      ) : null}

      {/* Volume OSD HUD indicator */}
      <AnimatePresence>
        {showVolumeOsd ? (
          <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.88 * volumeOsdScale }}
              animate={{ opacity: 1, scale: volumeOsdScale }}
              exit={{ opacity: 0, scale: 0.92 * volumeOsdScale }}
              transition={{ duration: 0.15 }}
              style={{ transformOrigin: 'center center' }}
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

      {/* Close Video Stage Area */}
      </div>

      <ShortcutsOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />

      <CastDialog
        media={castMedia}
        onOpenFallback={() => setFallbackModalOpen(true)}
      />
      <CastFallbackModal media={castMedia} />
    </div>
  )
}
