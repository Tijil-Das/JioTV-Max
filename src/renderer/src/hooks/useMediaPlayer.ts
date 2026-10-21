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
}

// Backward compatibility alias
export type UseHlsPlayerResult = UseMediaPlayerResult

function friendlyMediaError(detail?: string): string {
  if (detail && /drm|widevine|eme|key system|license/i.test(detail)) {
    return 'This channel uses Widevine DRM and Chromium could not open a compatible content decryption module. Use a Widevine-enabled Electron build to watch this channel.'
  }
  return detail || 'The stream could not be played.'
}

function formatShakaError(error: unknown): { message: string; isFatalNetworkOrDrm: boolean } {
  if (!error || typeof error !== 'object') {
    return { message: 'The stream could not be played.', isFatalNetworkOrDrm: false }
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

  let categoryName = ''
  if (isNetwork) categoryName = 'Network'
  else if (isDrm) categoryName = 'Widevine DRM'
  else if (category === 3) categoryName = 'Media'
  else if (category === 4) categoryName = 'Manifest'
  else if (category === 5) categoryName = 'Streaming'

  let desc = String(target.message || '')
  if (code && !desc.includes(String(code))) {
    desc = desc ? `${desc} (Error ${code}${categoryName ? ', ' + categoryName : ''})` : `Error ${code} (${categoryName || 'Playback'})`
  }

  if (isDrm || /drm|widevine|eme|key system|license/i.test(desc)) {
    return {
      message: `Widevine DRM error: ${desc || 'Could not decrypt stream or obtain license.'}`,
      isFatalNetworkOrDrm: true
    }
  }

  if (isNetwork || /network|fetch|timeout|cors|403|404|connect/i.test(desc)) {
    return {
      message: `Network error: ${desc || 'Failed to reach stream segment or server.'}`,
      isFatalNetworkOrDrm: true
    }
  }

  return {
    message: desc || friendlyMediaError(desc),
    isFatalNetworkOrDrm
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
  onReconnect
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
  const attemptRef = useRef(0)
  const autoAttemptsRef = useRef(0)
  const manualAttemptsRef = useRef(0)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bufferingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Stable ref so fail() can call the latest onReconnect without being a dep.
  const onReconnectRef = useRef(onReconnect)
  useEffect(() => {
    onReconnectRef.current = onReconnect
  }, [onReconnect])

  // Mutable ref-backed stream so onReconnect can swap it without restarting the effect.
  const pendingStreamRef = useRef<StreamInfo | null>(null)

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

    const onPlaying = () => {
      console.log('[useMediaPlayer] Video event: playing')
      clearBuffering()
      setReady(true)
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
      clearBuffering()
    }
    const onNativeError = () => {
      console.error('[useMediaPlayer] Video event: native error', video.error)
      if (!stream) return
      fail('The video could not be decoded. Try another quality or channel.', false)
    }

    video.addEventListener('playing', onPlaying)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('stalled', onStalled)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('loadeddata', onLoadedData)
    video.addEventListener('pause', onPause)
    video.addEventListener('error', onNativeError)

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
          backBufferLength: 30,
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
        }

        player.addEventListener('error', (event: unknown) => {
          if (disposed) return
          // Log full Shaka error structure so category/code are visible in both DevTools and
          // the main process console-message mirror.
          const rawErr = (event as { detail?: unknown }).detail ?? event
          console.warn('[useMediaPlayer] Shaka error event (raw):', JSON.stringify(rawErr))
          const { message, isFatalNetworkOrDrm } = formatShakaError(event)
          // If Shaka Player throws a NETWORK (1) or DRM (6) error, do not automatically retry
          fail(message, !isFatalNetworkOrDrm)
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
          manifest: { dash: { ignoreMinBufferTime: true } },
          abr: {
            enabled: true,
            defaultBandwidthEstimate: 5_000_000,
            restrictions: { maxHeight: 1080 }
          },
          streaming: {
            bufferingGoal: 10,
            rebufferingGoal: 2,
            retryParameters: {
              maxAttempts: 3,
              baseDelay: 500,
              backoffFactor: 2,
              timeout: 20_000
            }
          }
        })

        console.log('[useMediaPlayer] Loading DASH stream:', activeStream.url)

        await player.load(activeStream.url, null, 'application/dash+xml')
        if (disposed) return

        console.log('[useMediaPlayer] Shaka stream loaded successfully')
        setReady(true)
        clearBuffering()

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
      return () => {
        video.removeEventListener('playing', onPlaying)
        video.removeEventListener('waiting', onWaiting)
        video.removeEventListener('stalled', onStalled)
        video.removeEventListener('canplay', onCanPlay)
        video.removeEventListener('loadeddata', onLoadedData)
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
      if (retryTimer.current) clearTimeout(retryTimer.current)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('stalled', onStalled)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('loadeddata', onLoadedData)
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
    engine
  }
}

// Backward compatibility export
export const useHlsPlayer = useMediaPlayer
