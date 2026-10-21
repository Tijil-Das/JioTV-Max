import { useCallback, useEffect, useRef, useState } from 'react'
import Hls, { ErrorDetails, ErrorTypes, Events as HlsEvents } from 'hls.js'
import type { StreamInfo } from '@shared/types'
import type { QualityPreference } from '@/store/useSettingsStore'

export interface EngineLevel {
  index: number
  height: number
  bitrate: number
  label: string
}

type ShakaNamespace = {
  polyfill: { installAll: () => void }
  Player: {
    isBrowserSupported: () => boolean
    new (video: HTMLVideoElement): ShakaPlayerInstance
  }
  net: { NetworkingEngine: { RequestType: { LICENSE: string } } }
}

interface ShakaPlayerInstance {
  configure: (config: Record<string, unknown>) => void
  load: (url: string) => Promise<void>
  destroy: () => Promise<void>
  getVariantTracks: () => Array<{ id: number; height: number; bandwidth: number; active?: boolean }>
  selectVariantTrack: (track: { id: number }, clearBuffer?: boolean) => void
  addEventListener: (type: string, listener: (event: { detail?: Record<string, unknown> }) => void) => void
  getNetworkingEngine: () => {
    registerRequestFilter: (
      filter: (type: string, request: { headers: Record<string, string> }) => void
    ) => void
  } | null
}

interface UseHlsPlayerOptions {
  stream: StreamInfo | null
  /** Height requested by the user. 1080 by default per product spec. */
  initialQuality?: QualityPreference
  onError?: (message: string) => void
}

export interface UseHlsPlayerResult {
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

const shakaPromise = (): Promise<ShakaNamespace> =>
  import('shaka-player').then((module) => {
    const namespace = (module as unknown as { default?: ShakaNamespace }).default ?? (module as unknown as ShakaNamespace)
    return namespace
  })

function friendlyMediaError(detail?: string): string {
  if (detail && /drm|widevine|eme|key system|license/i.test(detail)) {
    return 'This channel uses Widevine DRM and Chromium could not open a compatible content decryption module. Use a Widevine-enabled Electron build to watch this channel.'
  }
  return detail || 'The stream could not be played.'
}

/**
 * Playback engine for both HLS (hls.js) and MPEG-DASH/Widevine (shaka-player).
 *
 * The hook owns the media element, levels and transient errors. It never stores
 * the hls/shaka instance in Zustand — those are imperative resources tied to a
 * single <video> element and belong in refs.
 */
export function useHlsPlayer({
  stream,
  initialQuality = 1080,
  onError
}: UseHlsPlayerOptions): UseHlsPlayerResult {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const shakaRef = useRef<ShakaPlayerInstance | null>(null)
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
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bufferingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fail = useCallback(
    (message: string, retryable = true) => {
      if (retryable && autoAttemptsRef.current < 3) {
        autoAttemptsRef.current += 1
        setReconnecting(true)
        setError(null)
        retryTimer.current = setTimeout(
          () => setReloadKey((key) => key + 1),
          Math.min(8000, 900 * 2 ** (autoAttemptsRef.current - 1))
        )
      } else {
        setReconnecting(false)
        setError(message)
        onError?.(message)
      }
    },
    [onError]
  )

  const retry = useCallback(() => {
    autoAttemptsRef.current = 0
    attemptRef.current += 1
    setError(null)
    setReconnecting(false)
    setReloadKey((key) => key + 1)
  }, [])

  // Reset the retry budget whenever the channel changes.
  useEffect(() => {
    autoAttemptsRef.current = 0
    setError(null)
    setReconnecting(false)
    setReady(false)
    setLevels([])
    levelsRef.current = []
    desiredRef.current = initialQuality
    // Only run on the stream identity, not on quality changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream?.url])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

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
      clearBuffering()
      setReady(true)
    }
    const onWaiting = () => showBufferingSoon()
    const onCanPlay = () => clearBuffering()
    const onNativeError = () => {
      if (!stream) return
      fail('The video could not be decoded. Try another quality or channel.')
    }
    video.addEventListener('playing', onPlaying)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('stalled', onWaiting)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('error', onNativeError)

    const applyInitialHeight = (available: EngineLevel[], select: (index: number | 'auto') => void) => {
      const desired = desiredRef.current
      if (desired === 'auto' || available.length === 0) {
        setActiveLevel('auto')
        select('auto')
        return
      }
      const closest = [...available]
        .filter((level) => level.height > 0)
        .sort((a, b) => Math.abs(a.height - desired) - Math.abs(b.height - desired))[0]
      if (closest) {
        setActiveLevel(closest.index)
        select(closest.index)
      }
    }

    const setupHls = () => {
      const media = video
      if (!stream) return
      setEngine('hls')
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 30,
          maxBufferLength: 30,
          capLevelToPlayerSize: true,
          startLevel: -1
        })
        hlsRef.current = hls
        let mediaRecoveryAttempts = 0

        hls.on(HlsEvents.MANIFEST_PARSED, () => {
          if (disposed) return
          const mapped: EngineLevel[] = hls.levels.map((level, index) => ({
            index,
            height: level.height ?? 0,
            bitrate: level.bitrate ?? 0,
            label: level.height ? `${level.height}p` : level.name || `Level ${index + 1}`
          }))
          levelsRef.current = mapped
          setLevels(mapped)
          setReady(true)
          applyInitialHeight(mapped, (index) => {
            if (index === 'auto') {
              hls.currentLevel = -1
            } else {
              hls.currentLevel = index
            }
          })
          void media.play().catch(() => undefined)
        })

        hls.on(HlsEvents.LEVEL_SWITCHED, (_event, data) => {
          if (disposed) return
          setActiveLevel(hls.autoLevelEnabled ? 'auto' : data.level)
        })

        hls.on(HlsEvents.ERROR, (_event, data) => {
          if (disposed || !data.fatal) return
          if (data.type === ErrorTypes.NETWORK_ERROR) {
            if (localAttempts < 1) {
              localAttempts += 1
              showBufferingSoon()
              hls.startLoad()
              return
            }
            fail('The live stream could not be reached. Reconnecting…', true)
          } else if (data.type === ErrorTypes.MEDIA_ERROR) {
            if (mediaRecoveryAttempts < 1) {
              mediaRecoveryAttempts += 1
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
        hls.loadSource(stream.url)
      } else if (media.canPlayType('application/vnd.apple.mpegurl')) {
        setEngine('native')
        media.src = stream.url
        setReady(true)
        void media.play().catch(() => undefined)
      } else {
        fail('HLS playback is not supported on this system.', false)
      }
    }

    const setupShaka = async () => {
      if (!stream) return
      setEngine('shaka')
      try {
        const shaka = await shakaPromise()
        if (disposed) return
        if (!shaka.Player.isBrowserSupported()) {
          fail('This system does not support MPEG-DASH playback.', false)
          return
        }
        shaka.polyfill.installAll()
        const player = new shaka.Player(video)
        shakaRef.current = player
        player.configure({
          drm: {
            servers: stream.drm?.licenseUrl ? { 'com.widevine.alpha': stream.drm.licenseUrl } : {},
            advanced: {
              'com.widevine.alpha': {
                videoRobustness: 'SW_SECURE_CRYPTO',
                audioRobustness: 'SW_SECURE_CRYPTO'
              }
            }
          },
          manifest: { dash: { ignoreMinBufferTime: true } },
          streaming: {
            bufferingGoal: 20,
            rebufferingGoal: 2,
            retryParameters: { maxAttempts: 3, baseDelay: 500, backoffFactor: 2, timeout: 20_000 }
          }
        })
        const networking = player.getNetworkingEngine()
        if (networking && stream.drm?.headers) {
          const headers = stream.drm.headers
          networking.registerRequestFilter((type, request) => {
            if (type === shaka.net.NetworkingEngine.RequestType.LICENSE) {
              Object.assign(request.headers, headers)
            }
          })
        }
        player.addEventListener('error', (event) => {
          if (disposed) return
          const detail = event.detail ?? {}
          const message = friendlyMediaError(
            typeof detail.message === 'string' ? detail.message : JSON.stringify(detail)
          )
          const retryable = !/drm|widevine|eme|key system|license/i.test(message)
          fail(message, retryable)
        })
        await player.load(stream.url)
        if (disposed) return
        const tracks = player.getVariantTracks()
        const byHeight = new Map<number, EngineLevel>()
        tracks.forEach((track, index) => {
          if (!track.height) return
          const existing = byHeight.get(track.height)
          if (!existing) {
            byHeight.set(track.height, {
              index,
              height: track.height,
              bitrate: track.bandwidth,
              label: `${track.height}p`
            })
          } else if (track.bandwidth > existing.bitrate) {
            existing.bitrate = track.bandwidth
          }
        })
        const mapped = [...byHeight.values()]
          .sort((a, b) => b.height - a.height)
          .map((level, index) => ({ ...level, index }))
        levelsRef.current = mapped
        setLevels(mapped)
        setReady(true)
        applyInitialHeight(mapped, (index) => {
          if (index === 'auto') {
            player.configure({ abr: { enabled: true } })
            return
          }
          const target = mapped[index]
          if (!target) return
          player.configure({ abr: { enabled: false } })
          const candidates = tracks.filter((track) => track.height === target.height)
          const best = candidates.sort((a, b) => b.bandwidth - a.bandwidth)[0]
          if (best) player.selectVariantTrack(best, true)
        })
        void video.play().catch(() => undefined)
      } catch (cause) {
        if (disposed) return
        const message = cause instanceof Error ? cause.message : ''
        fail(friendlyMediaError(message), !/drm|widevine|eme|key system/i.test(message))
      }
    }

    if (!stream) {
      video.pause()
      video.removeAttribute('src')
      setEngine(null)
      setBuffering(false)
      setReady(false)
      return () => {
        video.removeEventListener('playing', onPlaying)
        video.removeEventListener('waiting', onWaiting)
        video.removeEventListener('stalled', onWaiting)
        video.removeEventListener('canplay', onCanPlay)
        video.removeEventListener('error', onNativeError)
      }
    }

    if (stream.type === 'dash') void setupShaka()
    else setupHls()

    return () => {
      disposed = true
      clearBuffering()
      if (retryTimer.current) clearTimeout(retryTimer.current)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('stalled', onWaiting)
      video.removeEventListener('canplay', onCanPlay)
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
      hlsRef.current.currentLevel = level === 'auto' ? -1 : level
      setActiveLevel(level)
      return
    }
    const player = shakaRef.current
    if (!player) return
    if (level === 'auto') {
      player.configure({ abr: { enabled: true } })
      setActiveLevel('auto')
      return
    }
    const target = levelsRef.current[level]
    if (!target) return
    const tracks = player.getVariantTracks()
    const best = tracks
      .filter((track) => track.height === target.height)
      .sort((a, b) => b.bandwidth - a.bandwidth)[0]
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
