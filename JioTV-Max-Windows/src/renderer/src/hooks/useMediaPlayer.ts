import { useCallback, useEffect, useRef, useState } from 'react'
import Hls, { ErrorDetails, ErrorTypes, Events as HlsEvents } from 'hls.js'
// @ts-ignore - shaka-player 4.14 compiled.d.ts is ambient namespace without module export
import shaka from 'shaka-player'
import type { StreamInfo } from '@shared/types'
import type { QualityPreference } from '@/store/useSettingsStore'
import { checkAndHandleAuthError } from '@/lib/authErrorHandler'

// Polyfill browser features and suppress internal log overhead for Shaka Player
if (typeof window !== 'undefined' && shaka) {
  if (shaka.polyfill) shaka.polyfill.installAll()
  if (shaka.log) shaka.log.setLevel(shaka.log.Level.NONE)
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
  activeHeight: number
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

/**
 * Picks the optimal variant track prioritizing:
 * 1. Maximum audio fidelity first (highest audioBandwidth) — never downgrade audio!
 * 2. Target height if specified, or highest available video resolution (1080p -> 720p)
 * 3. Highest video / total bandwidth
 */
function pickBestVariantTrack<T extends { height?: number; audioBandwidth?: number; bandwidth?: number }>(
  tracks: T[],
  targetHeight?: number
): T | null {
  if (!tracks || tracks.length === 0) return null

  // 1. Determine the maximum audio bandwidth available across all tracks to anchor audio fidelity
  const maxAudioBw = Math.max(...tracks.map((t) => t.audioBandwidth || 0), 0)

  // 2. Filter tracks matching the target height (if specified) or all with positive height
  const byHeightPool = targetHeight
    ? tracks.filter((t) => t.height === targetHeight)
    : tracks.filter((t) => (t.height ?? 0) > 0)

  const pool = byHeightPool.length > 0 ? byHeightPool : tracks

  // 3. Sort so highest audio and video quality win
  return (
    [...pool].sort((a, b) => {
      // Prioritize tracks with uncompressed/top audio (within 85% of max audio bandwidth)
      const aAudio = a.audioBandwidth || 0
      const bAudio = b.audioBandwidth || 0
      if (maxAudioBw > 0) {
        const aTopAudio = aAudio >= maxAudioBw * 0.85
        const bTopAudio = bAudio >= maxAudioBw * 0.85
        if (aTopAudio !== bTopAudio) return bTopAudio ? 1 : -1
      }
      if (bAudio !== aAudio) return bAudio - aAudio

      // Video height
      const aHeight = a.height || 0
      const bHeight = b.height || 0
      if (bHeight !== aHeight) return bHeight - aHeight

      // Video / total bandwidth
      return (b.bandwidth || 0) - (a.bandwidth || 0)
    })[0] ?? null
  )
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
  const [activeHeight, setActiveHeight] = useState<number>(0)
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
  const autoRecoveryTimerRef = useRef<number | null>(null)

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
      if (checkAndHandleAuthError(message)) {
        setReconnecting(false)
        setError(message)
        onError?.(message)
        return
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
      const msg = 'Maximum retry attempts reached (3/3). Could not load this channel.'
      // console.warn('[useMediaPlayer]', msg)
      setError(msg)
      setReconnecting(false)
      onError?.(msg)
      return
    }
    manualAttemptsRef.current += 1
    // console.log(`[useMediaPlayer] Manual retry attempt ${manualAttemptsRef.current}/3`)
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
      // console.log(`[useMediaPlayer] Reloading fresh stream at ${resumeAt.toFixed(2)}s after long pause`)

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
            bufferBehind: 15,
            bufferingGoal: 30,
            rebufferingGoal: 3,
            stallEnabled: true,
            stallThreshold: 6,
            stallSkip: 0,
            safeSeekEndOffset: 1.5
          }
        })
        await player.load(fresh.url, resumeAt, 'application/dash+xml')
        if (disposed) return
        syncSeekRange()
        setReady(true)
        clearBuffering()
        void video.play().catch((err: unknown) => {
          // console.warn('[useMediaPlayer] play() after pause-reload rejected:', err)
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

    let stallCountInAuto = 0
    let lastStallAt = 0

    const onPlaying = () => {
      // console.log('[useMediaPlayer] Video event: playing')
      clearBuffering()
      setReady(true)
      if (desiredRef.current === 'auto' && stallCountInAuto >= 2 && shakaRef.current) {
        if (autoRecoveryTimerRef.current) window.clearTimeout(autoRecoveryTimerRef.current)
        autoRecoveryTimerRef.current = window.setTimeout(() => {
          if (!disposed && desiredRef.current === 'auto' && shakaRef.current) {
            const p = shakaRef.current
            const currentTracks = p.getVariantTracks()
            const best = pickBestVariantTrack(currentTracks)
            if (best) {
              // console.log('[useMediaPlayer] Auto mode: network stabilized, restoring to highest resolution (1080p)')
              p.selectVariantTrack(best, false)
              if (best.height) setActiveHeight(best.height)
              stallCountInAuto = 0
            }
          }
        }, 40_000)
      }
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
      // console.log(
        // `[useMediaPlayer] Resumed after ${Math.round(pausedFor / 1000)}s paused; refreshing signed stream`
      // )
      void reconnect()
        .then((fresh) => {
          if (disposed || !fresh) return
          return reloadAfterLongPause(fresh, resumeAt)
        })
        .catch((error: unknown) => {
          // console.warn('[useMediaPlayer] Post-pause stream refresh failed:', error)
          // The old stream may still be playable thanks to the relay refresh.
          void video.play().catch(() => undefined)
        })
        .finally(() => {
          refreshingOnResumeRef.current = false
          if (!disposed) setReconnecting(false)
        })
    }
    const onWaiting = () => {
      // console.log('[useMediaPlayer] Video event: waiting')
      showBufferingSoon()
      if (desiredRef.current === 'auto' && shakaRef.current) {
        const now = performance.now()
        if (now - lastStallAt < 12_000) {
          stallCountInAuto++
        } else {
          stallCountInAuto = 1
        }
        lastStallAt = now

        // If repeated stalls occur within 12s on a weak connection, step down video to 720p while preserving uncompressed audio
        if (stallCountInAuto >= 2) {
          const p = shakaRef.current
          const currentTracks = p.getVariantTracks()
          const active = currentTracks.find((t: { active?: boolean }) => t.active)
          const currentHeight = active?.height || 1080
          if (currentHeight > 720) {
            // console.warn('[useMediaPlayer] Auto mode: repeated stalls detected, stepping down to 720p without degrading audio')
            const fallback = pickBestVariantTrack(currentTracks, 720)
            if (fallback) {
              p.selectVariantTrack(fallback, false)
              if (fallback.height) setActiveHeight(fallback.height)
            }
          }
        }
      }
    }
    const onStalled = () => {
      // console.log('[useMediaPlayer] Video event: stalled')
      showBufferingSoon()
    }
    const onCanPlay = () => {
      // console.log('[useMediaPlayer] Video event: canplay')
      clearBuffering()
      setReady(true)
    }
    const onLoadedData = () => {
      // console.log('[useMediaPlayer] Video event: loadeddata')
      clearBuffering()
      setReady(true)
    }
    const onPause = () => {
      // console.log('[useMediaPlayer] Video event: pause')
      pausedAtRef.current = Date.now()
      clearBuffering()
    }
    const onNativeError = () => {
      // console.error('[useMediaPlayer] Video event: native error', video.error)
      if (!stream) return
      fail('The video could not be decoded. Try another quality or channel.', false)
    }

    // Ensure micro-catchup speed adjustments sound natural without pitch distortion
    video.preservesPitch = true

    const onResize = () => {
      if (video.videoHeight > 0) setActiveHeight(video.videoHeight)
    }
    video.addEventListener('resize', onResize)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('play', onPlay)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('stalled', onStalled)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('loadeddata', onLoadedData)
    video.addEventListener('loadedmetadata', syncSeekRange)
    video.addEventListener('loadedmetadata', onResize)
    video.addEventListener('durationchange', syncSeekRange)
    video.addEventListener('progress', syncSeekRange)
    video.addEventListener('seeked', syncSeekRange)
    video.addEventListener('pause', onPause)
    video.addEventListener('error', onNativeError)

    // Shaka updates `seekRange()` as new live segments arrive; poll while the
    // timer runs so the DVR bar keeps up even without media events.
    const seekRangeTimer = window.setInterval(syncSeekRange, 1000)
    syncSeekRange()

    // Active video frame presentation watchdog:
    // Detects and automatically recovers when audio continues playing and advancing currentTime,
    // but video graphics/frames are frozen on a single image.
    let lastFramePresentedAt = performance.now()
    let lastMediaTime = video.currentTime
    let freezeConsecutiveCount = 0
    let rVfcId: number | null = null

    type VideoWithCallback = HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number
      cancelVideoFrameCallback?: (id: number) => void
    }
    const videoWithCallback = video as VideoWithCallback

    const onVideoFramePresented = () => {
      lastFramePresentedAt = performance.now()
      freezeConsecutiveCount = 0
      if (!disposed && typeof videoWithCallback.requestVideoFrameCallback === 'function') {
        rVfcId = videoWithCallback.requestVideoFrameCallback(onVideoFramePresented)
      }
    }

    if (typeof videoWithCallback.requestVideoFrameCallback === 'function') {
      rVfcId = videoWithCallback.requestVideoFrameCallback(onVideoFramePresented)
    }

    const onWatchdogVisibility = () => {
      // Whenever visibility changes (minimized, backgrounded, or restored),
      // reset watchdog timestamp and counter to prevent false freeze detection.
      lastFramePresentedAt = performance.now()
      freezeConsecutiveCount = 0
      if (document.visibilityState === 'visible') {
        if (!disposed && typeof videoWithCallback.requestVideoFrameCallback === 'function') {
          rVfcId = videoWithCallback.requestVideoFrameCallback(onVideoFramePresented)
        }
      }
    }
    document.addEventListener('visibilitychange', onWatchdogVisibility)

    const videoFreezeWatchdogTimer = window.setInterval(() => {
      if (disposed) return

      // Crucial: When the app is minimized, occluded, or backgrounded, Chromium intentionally
      // pauses requestVideoFrameCallback and stops presenting video frames to save GPU/power.
      // Audio and streaming continue smoothly. We MUST NOT treat this normal background behavior
      // as a frozen video graphics pipeline, which would otherwise trigger continuous destructive
      // seeks, retryStreaming(), and goLive() stalls in the background!
      if (document.hidden || document.visibilityState === 'hidden') {
        lastFramePresentedAt = performance.now()
        freezeConsecutiveCount = 0
        lastMediaTime = video.currentTime
        return
      }

      const currentMediaTime = video.currentTime
      const timeAdvanced = currentMediaTime - lastMediaTime
      lastMediaTime = currentMediaTime

      // Only evaluate when the video is expected to be playing and visible
      if (!video.paused && !video.ended && video.readyState >= 2) {
        // Timeline is moving (audio playback clock is advancing)
        if (timeAdvanced > 0.2) {
          const timeSinceFrame = performance.now() - lastFramePresentedAt
          // If no video frame has been presented for more than 3 seconds while visible
          if (timeSinceFrame > 3000) {
            freezeConsecutiveCount++
            // console.warn(
              // `[useMediaPlayer] Video graphics freeze detected: audio advanced ${timeAdvanced.toFixed(2)}s, but 0 video frames for ${(timeSinceFrame / 1000).toFixed(1)}s (tick ${freezeConsecutiveCount})`
            // )

            if (freezeConsecutiveCount === 1) {
              // Level 1: Micro-seek nudge to kick Chromium decoder out of the stalled decode state
              try {
                video.currentTime = video.currentTime + 0.02
              } catch (e) {
                // console.warn('[useMediaPlayer] Micro-seek nudge failed:', e)
              }
            } else if (freezeConsecutiveCount === 2) {
              // Level 2: Engine-level recovery
              if (hlsRef.current) {
                // console.warn('[useMediaPlayer] Recovering HLS from video freeze via recoverMediaError()')
                try {
                  hlsRef.current.recoverMediaError()
                } catch (e) {
                  // console.warn('[useMediaPlayer] hls.recoverMediaError failed:', e)
                }
              } else if (shakaRef.current) {
                // console.warn('[useMediaPlayer] Recovering Shaka from video freeze via retryStreaming()')
                try {
                  void shakaRef.current.retryStreaming()
                } catch (e) {
                  // console.warn('[useMediaPlayer] shaka.retryStreaming failed:', e)
                }
              }
            } else if (freezeConsecutiveCount >= 3) {
              // Level 3: Jump forward to live edge
              // console.warn('[useMediaPlayer] Video freeze persisted; jumping to live edge')
              goLive()
              freezeConsecutiveCount = 0
            }
            lastFramePresentedAt = performance.now()
          }
        }
      }
    }, 1000)

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
      // console.log('[useMediaPlayer] setupHls for URL:', activeStream.url)
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          // Keep an ample forward and back buffer so background/off-screen timer
          // throttling does not exhaust the buffer.
          backBufferLength: 90,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          maxBufferSize: 60 * 1000 * 1000,
          maxBufferHole: 0.8,
          highBufferWatchdogPeriod: 3,
          nudgeOffset: 0.15,
          nudgeMaxRetry: 10,
          maxStarvationDelay: 4,
          liveSyncDurationCount: 4,
          liveMaxLatencyDurationCount: 15,
          liveDurationInfinity: true,
          capLevelToPlayerSize: false,
          minAutoBitrate: 1_800_000,
          abrEwmaDefaultEstimate: 50_000_000,
          abrEwmaDefaultEstimateMax: 80_000_000,
          abrBandWidthFactor: 0.85,
          abrBandWidthUpFactor: 0.85,
          abrMaxWithRealBitrate: true
        })
        hlsRef.current = hls
        let mediaRecoveryAttempts = 0

        hls.on(HlsEvents.MANIFEST_LOADING, () => {
          // console.log('[useMediaPlayer] HlsEvent: MANIFEST_LOADING')
        })
        hls.on(HlsEvents.MANIFEST_LOADED, (_event, data) => {
          // console.log(`[useMediaPlayer] HlsEvent: MANIFEST_LOADED (${data.levels?.length ?? 0} levels)`)
        })
        hls.on(HlsEvents.MANIFEST_PARSED, () => {
          if (disposed) return
          const mapped: EngineLevel[] = hls.levels.map((level, index) => ({
            index,
            height: level.height ?? 0,
            bitrate: level.bitrate ?? 0,
            label: level.height ? `${level.height}p` : level.name || `Level ${index + 1}`
          }))
          // console.log('[useMediaPlayer] HlsEvent: MANIFEST_PARSED - hls.levels:', mapped)
          levelsRef.current = mapped
          setLevels(mapped)
          setReady(true)
          syncSeekRange()

          const heights = mapped.map((l) => l.height || 0).filter((h) => h > 0)
          const maxHeight = heights.length > 0 ? Math.max(...heights) : 0
          const targetFloor = maxHeight >= 720 ? 720 : maxHeight
          const eligibleFloors = mapped.filter((l) => (l.height || 0) >= targetFloor && (l.bitrate || 0) > 0)
          if (eligibleFloors.length > 0) {
            const minBitrate = Math.min(...eligibleFloors.map((l) => l.bitrate))
            hls.config.minAutoBitrate = minBitrate
          }

          const desired = desiredRef.current
          if (desired === 'auto' || typeof desired === 'number') {
            const maxAllowedHeight = typeof desired === 'number' ? desired : 1080
            const eligible = mapped.filter((l) => l.height > 0 && l.height <= maxAllowedHeight)
            const highestEligible = (eligible.length > 0 ? eligible : mapped).reduce(
              (prev, curr) => (curr.height > prev.height ? curr : prev),
              mapped[0]
            )
            if (highestEligible) {
              hls.autoLevelCapping = highestEligible.index
              hls.startLevel = highestEligible.index
              hls.nextLevel = highestEligible.index
              if (highestEligible.height) setActiveHeight(highestEligible.height)
            }
            if (desired === 'auto') {
              hls.autoLevelCapping = highestEligible.index
              hls.currentLevel = highestEligible.index
              setActiveLevel('auto')
            } else {
              const exact = mapped.find((l) => l.height === desired)
              if (exact) {
                hls.currentLevel = exact.index
                setActiveLevel(exact.index)
              } else {
                hls.currentLevel = highestEligible.index
                setActiveLevel('auto')
              }
            }
          }
          void media.play().catch((err: unknown) => {
            // console.warn('[useMediaPlayer] Autoplay play() rejected in MANIFEST_PARSED:', err)
            clearBuffering()
          })
        })

        hls.on(HlsEvents.FRAG_BUFFERED, () => {
          mediaRecoveryAttempts = 0
        })

        hls.on(HlsEvents.LEVEL_SWITCHING, (_event, data) => {
          if (disposed) return
          const levels = hls.levels || []
          const maxHeight = Math.max(...levels.map((l) => l.height || 0), 0)
          const targetFloor = maxHeight >= 720 ? 720 : maxHeight
          const eligibleIdxs = levels
            .map((l, idx) => ({ height: l.height || 0, idx }))
            .filter((l) => l.height >= targetFloor)
          if (eligibleIdxs.length > 0) {
            const minAllowedIdx = eligibleIdxs.reduce((min, curr) => (curr.idx < min.idx ? curr : min)).idx
            if (hls.autoLevelEnabled && data.level < minAllowedIdx) {
              // console.log(`[useMediaPlayer] Guarding HLS Auto quality: preventing drop below ${targetFloor}p (attempted ${data.level})`)
              hls.nextLevel = minAllowedIdx
            }
          }
        })

        hls.on(HlsEvents.LEVEL_SWITCHED, (_event, data) => {
          if (disposed) return
          // console.log(`[useMediaPlayer] HlsEvent: LEVEL_SWITCHED to ${data.level}`)
          setActiveLevel(hls.autoLevelEnabled ? 'auto' : data.level)
          const levelObj = hls.levels[data.level]
          if (levelObj?.height) setActiveHeight(levelObj.height)
        })

        hls.on(HlsEvents.ERROR, (_event, data) => {
          // console.warn(
            // '[useMediaPlayer] Hls error:',
            // data.type,
            // data.details,
            // 'fatal:',
            // data.fatal,
            // data.response?.code,
            // data.response?.text
          // )
          if (data.details === ErrorDetails.BUFFER_STALLED_ERROR) {
            // console.warn('[useMediaPlayer] Non-fatal buffer stalled error; nudging video...')
            if (media && !media.paused) {
              media.currentTime += 0.05
            }
          }
          if (disposed || !data.fatal) return
          const httpStatus = data.response?.code ?? 0
          if (
            checkAndHandleAuthError(httpStatus) ||
            checkAndHandleAuthError(data.response?.text) ||
            checkAndHandleAuthError(data.details)
          ) {
            fail('Your streaming session has expired. Please sign in again.', false)
            return
          }
          if (data.type === ErrorTypes.NETWORK_ERROR) {
            // A vanished fragment that is behind the live edge means the
            // broadcaster's time-shift window rolled over. Jump forward
            // instead of retrying a segment that no longer exists.
            const httpStatus = data.response?.code ?? 0
            const range = getLiveSeekRange()
            const behind = range ? range.end - media.currentTime : 0
            if ((httpStatus === 404 || httpStatus === 410) && behind > 3) {
              // console.warn('[useMediaPlayer] DVR segment expired; jumping to live')
              onDvrGapRef.current?.()
              goLive()
              return
            }
            if (localAttempts < 1) {
              localAttempts += 1
              // console.log('[useMediaPlayer] Fatal network error: attempting hls.startLoad()')
              showBufferingSoon()
              hls.startLoad()
              return
            }
            fail('The live stream could not be reached. Reconnecting…', true)
          } else if (data.type === ErrorTypes.MEDIA_ERROR) {
            if (mediaRecoveryAttempts < 3) {
              mediaRecoveryAttempts += 1
              // console.log(`[useMediaPlayer] Fatal media error: attempting hls.recoverMediaError() (attempt ${mediaRecoveryAttempts}/3)`)
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
        // console.log('[useMediaPlayer] Native HLS supported, loading:', activeStream.url)
        setEngine('native')
        media.src = activeStream.url
        setReady(true)
        void media.play().catch((err: unknown) => {
          // console.warn('[useMediaPlayer] Native play() rejected:', err)
          clearBuffering()
        })
      } else {
        // console.error('[useMediaPlayer] HLS playback is not supported on this system')
        fail('HLS playback is not supported on this system.', false)
      }
    }

    const setupShaka = async () => {
      if (!activeStream) return
      setEngine('shaka')
      // console.log('[useMediaPlayer] Setting up Shaka Player for URL:', activeStream.url)

      try {
        if (!shaka.Player.isBrowserSupported()) {
          // console.error('[useMediaPlayer] MPEG-DASH / DRM is not supported by browser/engine')
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
                // console.warn('[useMediaPlayer] Segment 403 error, count:', segmentFail403Count)
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
          // console.warn('[useMediaPlayer] Shaka error event (raw):', JSON.stringify(rawErr))
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
              // console.warn('[useMediaPlayer] Shaka DVR segment no longer available; jumping to live')
              onDvrGapRef.current?.()
              goLive()
              return
            }
          }

          if (
            checkAndHandleAuthError(formatted.httpStatus) ||
            checkAndHandleAuthError(formatted.message) ||
            checkAndHandleAuthError(error)
          ) {
            fail(formatted.message, false)
            return
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
          // console.log('[useMediaPlayer] Shaka adaptation switched track:', activeTrack?.height, activeTrack?.bandwidth)
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
              // console.log(`[useMediaPlayer] Widevine CDM probe: AVAILABLE (robustness="${robustness}") ✓`)
              break
            } catch {
              // console.log(`[useMediaPlayer] Widevine CDM probe: robustness="${robustness}" rejected, trying next…`)
            }
          }

          if (!cdmAvailable) {
            // console.error('[useMediaPlayer] Widevine CDM probe: ALL levels FAILED. CDM not loaded.')
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
          preferredAudioChannelCount: 2,
          abr: {
            enabled: false
          },
          streaming: {
            useNativeHlsForFairPlay: false,
            lowLatencyMode: false,
            // Precise DVR seeking: don't tolerate manifest timing drift.
            inaccurateManifestTolerance: 0,
            // Keep a generous forward buffer so background/minimized execution does not exhaust segments
            bufferBehind: activeStream.isDrm ? 15 : 20,
            bufferingGoal: activeStream.isDrm ? 30 : 45,
            rebufferingGoal: 3,
            stallEnabled: true,
            stallThreshold: 6,
            stallSkip: 0,
            // Leave a 1.5-second guard at the absolute live edge.
            safeSeekEndOffset: 1.5,
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

        player.addEventListener('adaptation', () => {
          if (disposed) return
          const tracks = player.getVariantTracks()
          const active = tracks.find((t: { active?: boolean }) => t.active)
          if (active?.height) {
            // console.log(`[useMediaPlayer] Shaka ABR switched to ${active.height}p (video: ${active.videoBandwidth}, audio: ${active.audioBandwidth})`)
            setActiveHeight(active.height)
          }
        })

        // console.log('[useMediaPlayer] Loading DASH stream:', activeStream.url)

        await player.load(activeStream.url, null, 'application/dash+xml')
        if (disposed) return

        // console.log('[useMediaPlayer] Shaka stream loaded successfully')
        setReady(true)
        clearBuffering()
        syncSeekRange()

        // Populate quality selector using player.getVariantTracks()
        const tracks = player.getVariantTracks()
        // console.log(`[useMediaPlayer] Shaka loaded with ${tracks.length} variant tracks`)

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
          player.configure({
            preferredAudioChannelCount: 2,
            abr: { enabled: false }
          })

          if (index === 'auto') {
            const best = pickBestVariantTrack(tracks)
            if (best) {
              player.selectVariantTrack(best, false)
              if (best.height) setActiveHeight(best.height)
            }
            setActiveLevel('auto')
            return
          }
          const target = mapped[index]
          if (!target) return
          const best = pickBestVariantTrack(tracks, target.height)
          if (best) {
            player.selectVariantTrack(best, true)
            if (best.height) setActiveHeight(best.height)
            setActiveLevel(index)
          }
        })

        void video.play().catch((err: unknown) => {
          // console.warn('[useMediaPlayer] Shaka play() rejected:', err)
          clearBuffering()
        })
      } catch (cause) {
        if (disposed) return
        // Shaka errors are objects — stringify so the full category/code/data is visible in logs.
        try {
          // console.error('[useMediaPlayer] Shaka setup failed:', JSON.stringify(cause))
        } catch {
          // console.error('[useMediaPlayer] Shaka setup failed (non-serializable):', cause)
        }
        const { message, isFatalNetworkOrDrm, httpStatus } = formatShakaError(cause)
        if (
          checkAndHandleAuthError(httpStatus) ||
          checkAndHandleAuthError(message) ||
          checkAndHandleAuthError(cause)
        ) {
          fail(message, false)
          return
        }
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
        window.clearInterval(videoFreezeWatchdogTimer)
        document.removeEventListener('visibilitychange', onWatchdogVisibility)
        if (rVfcId !== null && typeof videoWithCallback.cancelVideoFrameCallback === 'function') {
          videoWithCallback.cancelVideoFrameCallback(rVfcId)
        }
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
      window.clearInterval(videoFreezeWatchdogTimer)
      document.removeEventListener('visibilitychange', onWatchdogVisibility)
      if (rVfcId !== null && typeof videoWithCallback.cancelVideoFrameCallback === 'function') {
        videoWithCallback.cancelVideoFrameCallback(rVfcId)
      }
      if (retryTimer.current) clearTimeout(retryTimer.current)
      if (autoRecoveryTimerRef.current) window.clearTimeout(autoRecoveryTimerRef.current)
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
      const hls = hlsRef.current
      if (level === 'auto') {
        const levels = hls.levels || []
        const highestEligibleIdx = levels.reduce(
          (prev, curr, idx) => ((curr.height || 0) > (levels[prev]?.height || 0) ? idx : prev),
          0
        )
        hls.autoLevelCapping = highestEligibleIdx
        hls.currentLevel = highestEligibleIdx
        if (levels[highestEligibleIdx]?.height) {
          setActiveHeight(levels[highestEligibleIdx].height)
        }
        setActiveLevel('auto')
      } else {
        hls.currentLevel = level
        if (hls.levels[level]?.height) {
          setActiveHeight(hls.levels[level].height)
        }
        setActiveLevel(level)
      }
      return
    }

    const player = shakaRef.current
    if (!player) return
    player.configure({
      preferredAudioChannelCount: 2,
      abr: { enabled: false }
    })
    const tracks = player.getVariantTracks()

    if (level === 'auto') {
      const best = pickBestVariantTrack(tracks)
      if (best) {
        player.selectVariantTrack(best, false)
        if (best.height) setActiveHeight(best.height)
      }
      setActiveLevel('auto')
      return
    }

    const target = levelsRef.current[level]
    if (!target) return
    const best = pickBestVariantTrack(tracks, target.height)
    if (best) {
      player.selectVariantTrack(best, true)
      if (best.height) setActiveHeight(best.height)
    }
    setActiveLevel(level)
  }, [])

  return {
    videoRef,
    levels,
    activeLevel,
    activeHeight,
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
