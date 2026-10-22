import { useCallback, useEffect, useRef, useState } from 'react'
import Hls, { ErrorDetails, ErrorTypes, Events as HlsEvents } from 'hls.js'
// @ts-ignore - shaka-player 4.14 compiled.d.ts is ambient namespace without module export
import shaka from 'shaka-player'
import type { StreamInfo } from '@shared/types'
import type { QualityPreference } from '@/store/useSettingsStore'

// Polyfill browser features for Shaka Player once at module load
if (typeof window !== 'undefined' && shaka?.polyfill) {
  shaka.polyfill.installAll()
}

export interface EngineLevel {
  index: number
  height: number
  bitrate: number
  label: string
}

/** Seekable window advertised by Shaka/HLS, in presentation seconds. */
export interface MediaSeekRange {
  start: number
  end: number
}

export interface UseMediaPlayerOptions {
  stream: StreamInfo | null
  /** Height requested by the user. 1080 by default per product spec. */
  initialQuality?: QualityPreference
  onError?: (message: string) => void
  /**
   * Called before each automatic reconnect attempt.
   * If the callback returns a new StreamInfo the engine will load that URL
   * instead of the existing one — use this to re-fetch a signed stream URL
   * so a stale CDN token never causes an infinite reconnect loop.
   */
  onReconnect?: () => Promise<StreamInfo | null>
  /**
   * Fired when a rewind lands outside Jio's time-shift window. The engine
   * automatically jumps back to live; use this for the user-facing toast.
   */
  onDvrGap?: () => void
}

// Backward compatibility alias
export type UseHlsPlayerOptions = UseMediaPlayerOptions

export interface UseMediaPlayerResult {
  videoRef: React.RefObject<HTMLVideoElement>
  levels: EngineLevel[]
  activeLevel: number | 'auto'
  setLevel: (level: number | 'auto') => void
  buffering: boolean
  reconnecting: boolean
  error: string | null
  retry: () => void
  ready: boolean
  engine: 'hls' | 'shaka' | 'native' | null
  /** Current DVR window; null until the engine has parsed a manifest. */
  seekRange: MediaSeekRange | null
  /** Jump to (a hair behind) the live edge. */
  goLive: () => void
  /** Seek within the DVR window, clamped to the current seek range. */
  seekTo: (time: number) => void
}

// Backward compatibility alias
export type UseHlsPlayerResult = UseMediaPlayerResult

function friendlyMediaError(detail?: string): string {
  if (detail && /drm|widevine|eme|key system|license/i.test(detail)) {
    return 'This channel uses Widevine DRM and Chromium could not open a compatible content decryption module. Use a Widevine-enabled Electron build to watch this channel.'
  }
  return detail || 'The stream could not be played.'
}

interface FormattedShakaError {
  message: string
  isFatalNetworkOrDrm: boolean
  isNetwork: boolean
  code: number
  httpStatus: number
}

function formatShakaError(error: unknown): FormattedShakaError {
  if (!error || typeof error !== 'object') {
    return {
      message: 'The stream could not be played.',
      isFatalNetworkOrDrm: false,
      isNetwork: false,
      code: 0,
      httpStatus: 0
    }
  }
  const err = error as { category?: number; code?: number; message?: string; data?: unknown[]; detail?: unknown }
  const target = (err.detail && typeof err.detail === 'object' ? err.detail : err) as {
    category?: number
    code?: number
    message?: string
    data?: unknown[]
  }

  const category = Number(target.category ?? 0)
  const code = Number(target.code ?? 0)

  // Shaka error categories: 1: NETWORK, 6: DRM
  const isNetwork = category === 1 || category === (shaka?.util?.Error?.Category?.NETWORK ?? 1)
  const isDrm = category === 6 || category === (shaka?.util?.Error?.Category?.DRM ?? 6)
  const isFatalNetworkOrDrm = isNetwork || isDrm

  // BAD_HTTP_STATUS (1001) / HTTP_ERROR (1002) carry the status in `data`.
  let httpStatus = 0
  if (Array.isArray(target.data)) {
    for (const item of target.data) {
      if (typeof item === 'number' && item >= 400 && item <= 599) {
        httpStatus = item
        break
      }
    }
  }

  let categoryName = ''
  if (isNetwork) categoryName = 'Network'
  else if (isDrm) categoryName = 'Widevine DRM'
  else if (category === 3) categoryName = 'Media'
  else if (category === 4) categoryName = 'Manifest'
  else if (category === 5) categoryName = 'Streaming'

  let desc = String(target.message || '')
  if (!httpStatus) {
    const statusMatch = desc.match(/\b(4\d{2}|5\d{2})\b/)
    if (statusMatch) httpStatus = Number(statusMatch[1])
  }
  if (code && !desc.includes(String(code))) {
    desc = desc ? `${desc} (Error ${code}${categoryName ? ', ' + categoryName : ''})` : `Error ${code} (${categoryName || 'Playback'})`
  }

  if (isDrm || /drm|widevine|eme|key system|license/i.test(desc)) {
    return {
      message: `Widevine DRM error: ${desc || 'Could not decrypt stream or obtain license.'}`,
      isFatalNetworkOrDrm: true,
      isNetwork,
      code,
      httpStatus
    }
  }

  if (isNetwork || /network|fetch|timeout|cors|403|404|connect/i.test(desc)) {
    return {
      message: `Network error: ${desc || 'Failed to reach stream segment or server.'}`,
      isFatalNetworkOrDrm: true,
      isNetwork: true,
      code,
      httpStatus
    }
  }

  return {
    message: desc || friendlyMediaError(desc),
    isFatalNetworkOrDrm,
    isNetwork,
    code,
    httpStatus
  }
}

/**
 * Universal media playback hook for HLS (hls.js) and MPEG-DASH / Widevine DRM (shaka-player).
 *
 * It manages the video element lifecycle, manifests, DRM licensing requests, and
 * live adaptive bitrate tracks.
 */
export function useMediaPlayer({
  stream,
  initialQuality = 1080,
  onError,
  onReconnect,
  onDvrGap
}: UseMediaPlayerOptions): UseMediaPlayerResult {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const shakaRef = useRef<shaka.Player | null>(null)
  const desiredRef = useRef<QualityPreference>(initialQuality)
  const levelsRef = useRef<EngineLevel[]>([])
  const [levels, setLevels] = useState<EngineLevel[]>([])
  const [activeLevel, setActiveLevel] = useState<number | 'auto'>(
    initialQuality === 'auto' ? 'auto' : 0
  )
  const [buffering, setBuffering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [ready, setReady] = useState(false)
  const [engine, setEngine] = useState<'hls' | 'shaka' | 'native' | null>(null)
  const [seekRange, setSeekRange] = useState<MediaSeekRange | null>(null)
  const attemptRef = useRef(0)
  const autoAttemptsRef = useRef(0)
  const manualAttemptsRef = useRef(0)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bufferingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pausedAtRef = useRef<number | null>(null)
  const refreshingOnResumeRef = useRef(false)
  const seekRangeRef = useRef<MediaSeekRange | null>(null)

  // Stable ref so fail() can call the latest onReconnect without being a dep.
  const onReconnectRef = useRef(onReconnect)
  useEffect(() => {
    onReconnectRef.current = onReconnect
  }, [onReconnect])

  const onDvrGapRef = useRef(onDvrGap)
  useEffect(() => {
    onDvrGapRef.current = onDvrGap
  }, [onDvrGap])

  // Mutable ref-backed stream so onReconnect can swap it without restarting the effect.
  const pendingStreamRef = useRef<StreamInfo | null>(null)

  /**
   * Reads the DVR window from Shaka when available, and falls back to the
   * media element's seekable range (hls.js and native HLS both populate it).
   */
  const getLiveSeekRange = useCallback((): MediaSeekRange | null => {
    const player = shakaRef.current
    if (player) {
      try {
        const range = player.seekRange()
        if (
          range &&
          Number.isFinite(range.start) &&
          Number.isFinite(range.end) &&
          range.end > range.start
        ) {
          return { start: Math.max(0, range.start), end: range.end }
        }
      } catch {
        // The player can be between unload and destroy during a channel zap.
      }
    }

    const video = videoRef.current
    if (!video) return null
    const seekable = video.seekable
    if (seekable && seekable.length > 0) {
      const start = seekable.start(0)
      const end = seekable.end(seekable.length - 1)
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        return { start: Math.max(0, start), end }
      }
    }
    return null
  }, [])

  const syncSeekRange = useCallback(() => {
    const next = getLiveSeekRange()
    const previous = seekRangeRef.current
    if (!next) {
      if (previous) {
        seekRangeRef.current = null
        setSeekRange(null)
      }
      return
    }
    if (
      !previous ||
      Math.abs(previous.start - next.start) > 0.25 ||
      Math.abs(previous.end - next.end) > 0.25
    ) {
      seekRangeRef.current = next
      setSeekRange(next)
    }
  }, [getLiveSeekRange])

  /** Snap to the live edge, staying 0.5 s behind the absolute edge. */
  const goLive = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    let edge = 0
    const player = shakaRef.current
    if (player) {
      try {
        edge = player.seekRange().end
      } catch {
        // Fall through to the generic seekable range.
      }
    }
    if (!edge) {
      edge = getLiveSeekRange()?.end ?? 0
    }
    if (!edge || !Number.isFinite(edge)) return

    try {
      video.currentTime = Math.max(0, edge - 0.5)
    } catch {
      return
    }
    void video.play().catch(() => undefined)
    syncSeekRange()
  }, [getLiveSeekRange, syncSeekRange])

  /** Seek inside the DVR window; never allow a jump past the live edge. */
  const seekTo = useCallback(
    (time: number) => {
      const video = videoRef.current
      if (!video || !Number.isFinite(time)) return
      const range = getLiveSeekRange()
      let target = time
      if (range) {
        target = Math.min(Math.max(time, range.start), Math.max(range.start, range.end - 0.25))
      }
      try {
        video.currentTime = Math.max(0, target)
      } catch {
        // The media element may not have metadata yet.
      }
      syncSeekRange()
    },
    [getLiveSeekRange, syncSeekRange]
  )

  const fail = useCallback(
    (message: string, retryable = true) => {
      if (retryTimer.current) {
        clearTimeout(retryTimer.current)
        retryTimer.current = null
      }
      if (retryable && autoAttemptsRef.current < 3) {
        autoAttemptsRef.current += 1
        setReconnecting(true)
        setError(null)
        const delay = Math.min(8000, 900 * 2 ** (autoAttemptsRef.current - 1))
        retryTimer.current = setTimeout(() => {
          const cb = onReconnectRef.current
          if (cb) {
            cb()
              .then((fresh) => {
                if (fresh) pendingStreamRef.current = fresh
              })
              .catch(() => undefined)
              .finally(() => setReloadKey((key) => key + 1))
          } else {
            setReloadKey((key) => key + 1)
          }
        }, delay)
      } else {
        setReconnecting(false)
        setError(message)
        onError?.(message)
      }
    },
    [onError]
  )

  const retry = useCallback(() => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current)
      retryTimer.current = null
    }
    if (manualAttemptsRef.current >= 3) {
      const msg = 'Maximum retry attempts reached (3/3). Please choose another channel.'
      console.warn('[useMediaPlayer]', msg)
      setError(msg)
      setReconnecting(false)
      onError?.(msg)
      return
    }
    manualAttemptsRef.current += 1
    console.log(`[useMediaPlayer] Manual retry attempt ${manualAttemptsRef.current}/3`)
    autoAttemptsRef.current = 0
    attemptRef.current += 1
    setError(null)
    setReconnecting(true)
    const cb = onReconnectRef.current
    if (cb) {
      cb()
        .then((fresh) => {
          if (fresh) pendingStreamRef.current = fresh
        })
        .catch(() => undefined)
        .finally(() => setReloadKey((key) => key + 1))
    } else {
      setReloadKey((key) => key + 1)
    }
  }, [onError])

  // Reset the retry budget whenever the channel changes.
  useEffect(() => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current)
      retryTimer.current = null
    }
    manualAttemptsRef.current = 0
    autoAttemptsRef.current = 0
    setError(null)
    setReconnecting(false)
    setReady(false)
    setLevels([])
    setSeekRange(null)
    seekRangeRef.current = null
    pausedAtRef.current = null
    levelsRef.current = []
    desiredRef.current = initialQuality
    // Only run on the channel identity, not on quality changes or token regenerations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream?.channelId])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Use a fresh signed URL if onReconnect provided one, then clear the slot.
    const activeStream = pendingStreamRef.current ?? stream
    pendingStreamRef.current = null

    let disposed = false
    let localAttempts = attemptRef.current
    setBuffering(false)
    setError(null)

    const clearBuffering = () => {
      if (bufferingTimer.current) clearTimeout(bufferingTimer.current)
      bufferingTimer.current = null
      setBuffering(false)
    }
    const showBufferingSoon = () => {
      if (bufferingTimer.current) clearTimeout(bufferingTimer.current)
      bufferingTimer.current = setTimeout(() => setBuffering(true), 400)
    }

    /**
     * Failsafe for long pauses: Jio tokens can expire while the video element
     * is paused. Reload the freshly signed relay URL, then seek back to the
     * exact position the viewer paused at.
     */
    const reloadAfterLongPause = async (fresh: StreamInfo, resumeAt: number): Promise<void> => {
      if (disposed) return
      console.log(`[useMediaPlayer] Reloading fresh stream at ${resumeAt.toFixed(2)}s after long pause`)

      const player = shakaRef.current
      if (player) {
        const licenseUrl =
          fresh.drm?.licenseUrl || (fresh.url ? new URL('/license', fresh.url).href : '')
        player.configure({
          drm: { servers: licenseUrl ? { 'com.widevine.alpha': licenseUrl } : {} },
          manifest: { dash: { ignoreMinBufferTime: true, autoCorrectDrift: true } },
          streaming: {
            useNativeHlsForFairPlay: false,
            lowLatencyMode: false,
            inaccurateManifestTolerance: 0,
            rebufferingGoal: 2,
            bufferingGoal: 10
          }
        })
        await player.load(fresh.url, resumeAt, 'application/dash+xml')
        if (disposed) return
        syncSeekRange()
        setReady(true)
        clearBuffering()
        void video.play().catch((err: unknown) => {
          console.warn('[useMediaPlayer] play() after pause-reload rejected:', err)
        })
        return
      }

      const hls = hlsRef.current
      if (hls) {
        hls.once(HlsEvents.MANIFEST_PARSED, () => {
          if (disposed) return
          try {
            video.currentTime = resumeAt
          } catch {
            // The new playlist may no longer contain the old position.
          }
          void video.play().catch(() => undefined)
        })
        hls.loadSource(fresh.url)
        hls.startLoad()
        return
      }

      // Native HLS.
      const onMetadata = (): void => {
        if (disposed) return
        try {
          video.currentTime = resumeAt
        } catch {
          // Ignore invalid positions on a refreshed playlist.
        }
        void video.play().catch(() => undefined)
      }
      video.addEventListener('loadedmetadata', onMetadata, { once: true })
      video.src = fresh.url
      video.load()
    }

    const onPlaying = () => {
      console.log('[useMediaPlayer] Video event: playing')
      clearBuffering()
      setReady(true)
    }

    const onPlay = () => {
      const pausedAt = pausedAtRef.current
      pausedAtRef.current = null
      if (!pausedAt || refreshingOnResumeRef.current || disposed) return

      const pausedFor = Date.now() - pausedAt
      // Below a minute the relay/buffer handles resume transparently; beyond
      // that, proactively re-resolve the signed URL.
      if (pausedFor < 60_000) return

      const reconnect = onReconnectRef.current
      if (!reconnect) return

      const resumeAt = video.currentTime
      refreshingOnResumeRef.current = true
      setReconnecting(true)
      console.log(
        `[useMediaPlayer] Resumed after ${Math.round(pausedFor / 1000)}s paused; refreshing signed stream`
      )
      void reconnect()
        .then((fresh) => {
          if (disposed || !fresh) return
          return reloadAfterLongPause(fresh, resumeAt)
        })
        .catch((error: unknown) => {
          console.warn('[useMediaPlayer] Post-pause stream refresh failed:', error)
          // The old stream may still be playable thanks to the relay refresh.
          void video.play().catch(() => undefined)
        })
        .finally(() => {
          refreshingOnResumeRef.current = false
          if (!disposed) setReconnecting(false)
        })
    }
    const onWaiting = () => {
      console.log('[useMediaPlayer] Video event: waiting')
      showBufferingSoon()
    }
    const onStalled = () => {
      console.log('[useMediaPlayer] Video event: stalled')
      showBufferingSoon()
    }
    const onCanPlay = () => {
      console.log('[useMediaPlayer] Video event: canplay')
      clearBuffering()
      setReady(true)
    }
    const onLoadedData = () => {
      console.log('[useMediaPlayer] Video event: loadeddata')
      clearBuffering()
      setReady(true)
    }
    const onPause = () => {
      console.log('[useMediaPlayer] Video event: pause')
      pausedAtRef.current = Date.now()
      clearBuffering()
    }
    const onNativeError = () => {
      console.error('[useMediaPlayer] Video event: native error', video.error)
      if (!stream) return
      fail('The video could not be decoded. Try another quality or channel.', false)
    }

    video.addEventListener('playing', onPlaying)
    video.addEventListener('play', onPlay)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('stalled', onStalled)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('loadeddata', onLoadedData)
    video.addEventListener('loadedmetadata', syncSeekRange)
    video.addEventListener('durationchange', syncSeekRange)
    video.addEventListener('progress', syncSeekRange)
    video.addEventListener('seeked', syncSeekRange)
    video.addEventListener('pause', onPause)
    video.addEventListener('error', onNativeError)

    // Shaka updates `seekRange()` as new live segments arrive; poll while the
    // timer runs so the DVR bar keeps up even without media events.
    const seekRangeTimer = window.setInterval(syncSeekRange, 1000)
    syncSeekRange()

    const applyInitialHeight = (available: EngineLevel[], select: (index: number | 'auto') => void) => {
      const desired = desiredRef.current
      if (desired === 'auto' || available.length === 0) {
        setActiveLevel('auto')
        select('auto')
        return
      }
      const withHeight = available.filter((level) => level.height > 0)
      const pool = withHeight.length > 0 ? withHeight : available
      const closest = [...pool].sort(
        (a, b) => Math.abs((a.height || a.bitrate) - desired) - Math.abs((b.height || b.bitrate) - desired)
      )[0]
      if (closest) {
        setActiveLevel(closest.index)
        select(closest.index)
      } else {
        setActiveLevel('auto')
        select('auto')
      }
    }

    const setupHls = () => {
      const media = video
      if (!activeStream) return
      setEngine('hls')
      console.log('[useMediaPlayer] setupHls for URL:', activeStream.url)
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          // Keep a longer back buffer so pausing then rewinding does not have
          // to immediately re-fetch everything from the CDN.
          backBufferLength: 90,
          maxBufferLength: 30,
          capLevelToPlayerSize: false,
          startLevel: -1,
          abrEwmaDefaultEstimate: 5000000
        })
        hlsRef.current = hls
        let mediaRecoveryAttempts = 0

        hls.on(HlsEvents.MANIFEST_LOADING, () => {
          console.log('[useMediaPlayer] HlsEvent: MANIFEST_LOADING')
        })
        hls.on(HlsEvents.MANIFEST_LOADED, (_event, data) => {
          console.log(`[useMediaPlayer] HlsEvent: MANIFEST_LOADED (${data.levels?.length ?? 0} levels)`)
        })
        hls.on(HlsEvents.MANIFEST_PARSED, () => {
          if (disposed) return
          const mapped: EngineLevel[] = hls.levels.map((level, index) => ({
            index,
            height: level.height ?? 0,
            bitrate: level.bitrate ?? 0,
            label: level.height ? `${level.height}p` : level.name || `Level ${index + 1}`
          }))
          console.log('[useMediaPlayer] HlsEvent: MANIFEST_PARSED - hls.levels:', mapped)
          levelsRef.current = mapped
          setLevels(mapped)
          setReady(true)
          syncSeekRange()

          const desired = desiredRef.current
          if (desired === 'auto' || typeof desired === 'number') {
            const maxAllowedHeight = typeof desired === 'number' ? desired : 1080
            const eligible = mapped.filter((l) => l.height > 0 && l.height <= maxAllowedHeight)
            if (eligible.length > 0) {
              const highestEligible = eligible.reduce((prev, curr) => (curr.height > prev.height ? curr : prev))
              hls.autoLevelCapping = highestEligible.index
            }
            hls.currentLevel = -1
            setActiveLevel('auto')
          }
          void media.play().catch((err: unknown) => {
            console.warn('[useMediaPlayer] Autoplay play() rejected in MANIFEST_PARSED:', err)
            clearBuffering()
          })
        })

        hls.on(HlsEvents.LEVEL_SWITCHED, (_event, data) => {
          if (disposed) return
          console.log(`[useMediaPlayer] HlsEvent: LEVEL_SWITCHED to ${data.level}`)
          setActiveLevel(hls.autoLevelEnabled ? 'auto' : data.level)
        })

        hls.on(HlsEvents.ERROR, (_event, data) => {
          console.warn(
            '[useMediaPlayer] Hls error:',
            data.type,
            data.details,
            'fatal:',
            data.fatal,
            data.response?.code,
            data.response?.text
          )
          if (disposed || !data.fatal) return
          if (data.type === ErrorTypes.NETWORK_ERROR) {
            // A vanished fragment that is behind the live edge means the
            // broadcaster's time-shift window rolled over. Jump forward
            // instead of retrying a segment that no longer exists.
            const httpStatus = data.response?.code ?? 0
            const range = getLiveSeekRange()
            const behind = range ? range.end - media.currentTime : 0
            if ((httpStatus === 404 || httpStatus === 410) && behind > 3) {
              console.warn('[useMediaPlayer] DVR segment expired; jumping to live')
              onDvrGapRef.current?.()
              goLive()
              return
            }
            if (localAttempts < 1) {
              localAttempts += 1
              console.log('[useMediaPlayer] Fatal network error: attempting hls.startLoad()')
              showBufferingSoon()
              hls.startLoad()
              return
            }
            fail('The live stream could not be reached. Reconnecting…', true)
          } else if (data.type === ErrorTypes.MEDIA_ERROR) {
            if (mediaRecoveryAttempts < 1) {
              mediaRecoveryAttempts += 1
              console.log('[useMediaPlayer] Fatal media error: attempting hls.recoverMediaError()')
              hls.recoverMediaError()
              return
            }
            fail(
              data.details === ErrorDetails.BUFFER_APPEND_ERROR
                ? 'The stream buffer could not be decoded. Reconnecting…'
                : 'Playback stopped unexpectedly. Reconnecting…',
              true
            )
          } else {
            fail(friendlyMediaError(data.details), true)
          }
        })

        hls.attachMedia(media)
        hls.loadSource(activeStream.url)
      } else if (media.canPlayType('application/vnd.apple.mpegurl')) {
        console.log('[useMediaPlayer] Native HLS supported, loading:', activeStream.url)
        setEngine('native')
        media.src = activeStream.url
        setReady(true)
        void media.play().catch((err: unknown) => {
          console.warn('[useMediaPlayer] Native play() rejected:', err)
          clearBuffering()
        })
      } else {
        console.error('[useMediaPlayer] HLS playback is not supported on this system')
        fail('HLS playback is not supported on this system.', false)
      }
    }

    const setupShaka = async () => {
      if (!activeStream) return
      setEngine('shaka')
      console.log('[useMediaPlayer] Setting up Shaka Player for URL:', activeStream.url)

      try {
        if (!shaka.Player.isBrowserSupported()) {
          console.error('[useMediaPlayer] MPEG-DASH / DRM is not supported by browser/engine')
          fail('This system does not support MPEG-DASH playback.', false)
          return
        }

        // Shaka 4.14: initialize Player without a mediaElement, then attach separately.
        // Passing video directly to the constructor is deprecated and removed in v5.
        const player = new shaka.Player()
        await player.attach(video)
        shakaRef.current = player

        // Configure Widevine DRM — robustness levels are filled in after the CDM probe below.
        const licenseUrl =
          activeStream.drm?.licenseUrl ||
          (activeStream.url ? new URL('/license', activeStream.url).href : '')


        // Attach custom license headers (Origin, Referer, User-Agent, Authorization, ssotoken, channelId, srno)
        const networking = player.getNetworkingEngine()
        if (networking) {
          networking.registerRequestFilter((type: unknown, request: { headers: Record<string, string> }) => {
            if (type === shaka.net.NetworkingEngine.RequestType.LICENSE) {
              request.headers['Origin'] = 'https://www.jiotv.com'
              request.headers['Referer'] = 'https://www.jiotv.com/'
              request.headers['User-Agent'] =
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              if (activeStream.drm?.headers) {
                Object.assign(request.headers, activeStream.drm.headers)
              }
            }
          })

          // Response filter: count 403s on segments to detect expired HDNEA tokens.
          // After MAX_403_FAILURES consecutive failures, throw a Shaka error so
          // the error handler can surface a meaningful message and trigger reconnect.
          // Mirrors jiotv_go's player_drm.html response filter.
          let segmentFail403Count = 0
          const MAX_403_FAILURES = 2
          networking.registerResponseFilter((type: unknown, response: { status: number }) => {
            if (type === shaka.net.NetworkingEngine.RequestType.SEGMENT) {
              if (response.status === 403) {
                segmentFail403Count++
                console.warn('[useMediaPlayer] Segment 403 error, count:', segmentFail403Count)
                if (segmentFail403Count > MAX_403_FAILURES) {
                  throw new shaka.util.Error(
                    shaka.util.Error.Severity.CRITICAL,
                    shaka.util.Error.Category.NETWORK,
                    shaka.util.Error.Code.HTTP_ERROR,
                    'Too many 403 errors on segments — token may have expired'
                  )
                }
              }
            }
          })

          // Reset 403 counter on successful playback
          video.addEventListener('playing', () => { segmentFail403Count = 0 }, { once: false })
        }



        player.addEventListener('error', (event: unknown) => {
          if (disposed) return
          // Log full Shaka error structure so category/code are visible in both DevTools and
          // the main process console-message mirror.
          const rawErr = (event as { detail?: unknown }).detail ?? event
          console.warn('[useMediaPlayer] Shaka error event (raw):', JSON.stringify(rawErr))
          const formatted = formatShakaError(event)

          // Rewinding past timeShiftBufferDepth makes the CDN answer 404/410
          // for a segment Shaka still expected. Jump to live instead of
          // surfacing a fatal playback error.
          if (formatted.isNetwork) {
            const range = getLiveSeekRange()
            const behind = range ? range.end - video.currentTime : 0
            if (
              (formatted.httpStatus === 404 || formatted.httpStatus === 410) &&
              behind > 3
            ) {
              console.warn('[useMediaPlayer] Shaka DVR segment no longer available; jumping to live')
              onDvrGapRef.current?.()
              goLive()
              return
            }
          }

          // If Shaka Player throws a NETWORK (1) or DRM (6) error, do not automatically retry
          fail(formatted.message, !formatted.isFatalNetworkOrDrm)
        })

        player.addEventListener('buffering', (event: unknown) => {
          if (disposed) return
          const isBuffering = Boolean((event as { buffering?: boolean }).buffering)
          if (isBuffering) {
            showBufferingSoon()
          } else {
            clearBuffering()
          }
        })

        player.addEventListener('adaptation', () => {
          if (disposed) return
          const tracks = player.getVariantTracks()
          const activeTrack = tracks.find((t: { active?: boolean }) => t.active)
          console.log('[useMediaPlayer] Shaka adaptation switched track:', activeTrack?.height, activeTrack?.bandwidth)
        })

        // Probe Widevine CDM — try robustness levels from strict → permissive.
        // Whichever succeeds is then fed into the Shaka DRM config so the key
        // system negotiation uses a configuration Chromium's CDM actually accepts.
        let workingRobustness = ''
        if (activeStream.isDrm) {
          const robustnessLevels = ['SW_SECURE_CRYPTO', 'SW_SECURE_DECODE', '']
          let cdmAvailable = false

          for (const robustness of robustnessLevels) {
            try {
              await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [
                {
                  initDataTypes: ['cenc'],
                  videoCapabilities: [
                    { contentType: 'video/mp4; codecs="avc1.42E01E"', robustness }
                  ],
                  audioCapabilities: [
                    { contentType: 'audio/mp4; codecs="mp4a.40.2"', robustness }
                  ]
                }
              ])
              workingRobustness = robustness
              cdmAvailable = true
              console.log(`[useMediaPlayer] Widevine CDM probe: AVAILABLE (robustness="${robustness}") ✓`)
              break
            } catch {
              console.log(`[useMediaPlayer] Widevine CDM probe: robustness="${robustness}" rejected, trying next…`)
            }
          }

          if (!cdmAvailable) {
            console.error('[useMediaPlayer] Widevine CDM probe: ALL levels FAILED. CDM not loaded.')
            fail(
              'Widevine CDM could not be initialised. ' +
                'If Google Chrome is installed, restart the app — it loads Widevine from Chrome automatically. ' +
                'If this persists, switch to @castlabs/electron-releases for guaranteed Widevine support.',
              false
            )
            return
          }
        }

        // Build DRM config using the robustness level the CDM accepted.
        const drmConfig: Record<string, unknown> = {
          servers: licenseUrl ? { 'com.widevine.alpha': licenseUrl } : {},
          advanced: {
            'com.widevine.alpha': {
              // Shaka 4.14: robustness must be string[], not plain string.
              videoRobustness: workingRobustness ? [workingRobustness] : [],
              audioRobustness: workingRobustness ? [workingRobustness] : []
            }
          },
          // Debug: print raw Widevine challenge + response as base64.
          // Disable once DRM is confirmed working.
          logLicenseExchange: true
        }

        player.configure({
          drm: drmConfig,
          manifest: {
            dash: {
              // Shaka advertises and honours the MPD's timeShiftBufferDepth
              // window, which is what makes DVR scrubbing possible.
              ignoreMinBufferTime: true,
              autoCorrectDrift: true,
              // JioTV live MPDs have no UTCTiming element; point Shaka at the
              // relay's server clock so live-edge is computed from server time
              // instead of the client clock. A skewed client clock makes Shaka
              // fetch far more segments than needed while hunting for live edge.
              // Mirrors jiotv_go's clockSyncUri: "/dashtime".
              clockSyncUri: (() => { try { const u = new URL(activeStream.url); return `${u.protocol}//${u.host}/dashtime` } catch { return '' } })()
            }
          },
          abr: {
            enabled: true,
            defaultBandwidthEstimate: 5_000_000,
            restrictions: { maxHeight: 1080 }
          },
          streaming: {
            useNativeHlsForFairPlay: false,
            lowLatencyMode: false,
            // Precise DVR seeking: don't tolerate manifest timing drift.
            inaccurateManifestTolerance: 0,
            // JioTV premium streams use very short segments, so a large
            // buffering goal multiplies segment requests needed before playback
            // starts. Keep DRM buffer lean; HLS fallback uses original values.
            // Mirrors jiotv_go: bufferBehind: isDRM ? 2 : 5
            bufferBehind: activeStream.isDrm ? 2 : 5,
            bufferingGoal: activeStream.isDrm ? 6 : 30,
            rebufferingGoal: 2,
            // Leave a half-second guard at the absolute live edge.
            safeSeekEndOffset: 0.5,
            // Cap retries: each failed segment would otherwise multiply into
            // several requests with long backoff — turns a few expired HDNEA
            // tokens into hundreds of slow segment requests.
            // Mirrors jiotv_go: maxAttempts: 2, backoffFactor: 2, timeout: 30000
            retryParameters: {
              maxAttempts: 2,
              baseDelay: 500,
              backoffFactor: 2,
              timeout: 30_000
            }
          }
        })

        console.log('[useMediaPlayer] Loading DASH stream:', activeStream.url)

        await player.load(activeStream.url, null, 'application/dash+xml')
        if (disposed) return

        console.log('[useMediaPlayer] Shaka stream loaded successfully')
        setReady(true)
        clearBuffering()
        syncSeekRange()

        // Populate quality selector using player.getVariantTracks()
        const tracks = player.getVariantTracks()
        console.log(`[useMediaPlayer] Shaka loaded with ${tracks.length} variant tracks`)

        const byHeight = new Map<number, EngineLevel>()
        for (const track of tracks) {
          if (!track.height) continue
          const existing = byHeight.get(track.height)
          if (!existing) {
            byHeight.set(track.height, {
              index: 0,
              height: track.height,
              bitrate: track.bandwidth,
              label: `${track.height}p`
            })
          } else if (track.bandwidth > existing.bitrate) {
            existing.bitrate = track.bandwidth
          }
        }

        const mapped: EngineLevel[] = [...byHeight.values()]
          .sort((a, b) => b.height - a.height)
          .map((level, index) => ({ ...level, index }))

        levelsRef.current = mapped
        setLevels(mapped)

        applyInitialHeight(mapped, (index) => {
          if (index === 'auto') {
            player.configure({
              abr: {
                enabled: true,
                defaultBandwidthEstimate: 5000000,
                restrictions: { maxHeight: 1080 }
              }
            })
            return
          }
          const target = mapped[index]
          if (!target) return
          player.configure({ abr: { enabled: false } })
          const candidates = tracks.filter((track: { height?: number }) => track.height === target.height)
          const best = candidates.sort(
            (a: { bandwidth?: number }, b: { bandwidth?: number }) => (b.bandwidth ?? 0) - (a.bandwidth ?? 0)
          )[0]
          if (best) player.selectVariantTrack(best, true)
        })

        void video.play().catch((err: unknown) => {
          console.warn('[useMediaPlayer] Shaka play() rejected:', err)
          clearBuffering()
        })
      } catch (cause) {
        if (disposed) return
        // Shaka errors are objects — stringify so the full category/code/data is visible in logs.
        try {
          console.error('[useMediaPlayer] Shaka setup failed:', JSON.stringify(cause))
        } catch {
          console.error('[useMediaPlayer] Shaka setup failed (non-serializable):', cause)
        }
        const { message, isFatalNetworkOrDrm } = formatShakaError(cause)
        fail(message, !isFatalNetworkOrDrm)
      }
    }

    if (!activeStream) {
      video.pause()
      video.removeAttribute('src')
      setEngine(null)
      setBuffering(false)
      setReady(false)
      setSeekRange(null)
      seekRangeRef.current = null
      return () => {
        window.clearInterval(seekRangeTimer)
        video.removeEventListener('playing', onPlaying)
        video.removeEventListener('play', onPlay)
        video.removeEventListener('waiting', onWaiting)
        video.removeEventListener('stalled', onStalled)
        video.removeEventListener('canplay', onCanPlay)
        video.removeEventListener('loadeddata', onLoadedData)
        video.removeEventListener('loadedmetadata', syncSeekRange)
        video.removeEventListener('durationchange', syncSeekRange)
        video.removeEventListener('progress', syncSeekRange)
        video.removeEventListener('seeked', syncSeekRange)
        video.removeEventListener('pause', onPause)
        video.removeEventListener('error', onNativeError)
      }
    }

    // Detect stream type: MPEG-DASH / Widevine or HLS
    const isDash = activeStream.type === 'dash' || /\.mpd(?:[?#]|$)/i.test(activeStream.url)
    if (isDash) {
      void setupShaka()
    } else {
      setupHls()
    }

    return () => {
      disposed = true
      clearBuffering()
      window.clearInterval(seekRangeTimer)
      if (retryTimer.current) clearTimeout(retryTimer.current)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('stalled', onStalled)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('loadeddata', onLoadedData)
      video.removeEventListener('loadedmetadata', syncSeekRange)
      video.removeEventListener('durationchange', syncSeekRange)
      video.removeEventListener('progress', syncSeekRange)
      video.removeEventListener('seeked', syncSeekRange)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('error', onNativeError)
      hlsRef.current?.destroy()
      hlsRef.current = null
      if (shakaRef.current) {
        const player = shakaRef.current
        shakaRef.current = null
        void player.destroy().catch(() => undefined)
      }
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [stream, reloadKey, fail])

  const setLevel = useCallback((level: number | 'auto') => {
    desiredRef.current = level === 'auto' ? 'auto' : levelsRef.current[level]?.height ?? 0
    if (!hlsRef.current && !shakaRef.current) return

    if (hlsRef.current) {
      if (level === 'auto') {
        hlsRef.current.autoLevelCapping = -1
        hlsRef.current.currentLevel = -1
      } else {
        hlsRef.current.currentLevel = level
      }
      setActiveLevel(level)
      return
    }

    const player = shakaRef.current
    if (!player) return
    if (level === 'auto') {
      player.configure({
        abr: {
          enabled: true,
          defaultBandwidthEstimate: 5000000,
          restrictions: { maxHeight: 1080 }
        }
      })
      setActiveLevel('auto')
      return
    }

    const target = levelsRef.current[level]
    if (!target) return
    const tracks = player.getVariantTracks()
    const best = tracks
      .filter((track: { height?: number }) => track.height === target.height)
      .sort(
        (a: { bandwidth?: number }, b: { bandwidth?: number }) => (b.bandwidth ?? 0) - (a.bandwidth ?? 0)
      )[0]
    if (!best) return

    player.configure({ abr: { enabled: false } })
    player.selectVariantTrack(best, true)
    setActiveLevel(level)
  }, [])

  return {
    videoRef,
    levels,
    activeLevel,
    setLevel,
    buffering,
    reconnecting,
    error,
    retry,
    ready,
    engine,
    seekRange,
    goLive,
    seekTo
  }
}

// Backward compatibility export
export const useHlsPlayer = useMediaPlayer
