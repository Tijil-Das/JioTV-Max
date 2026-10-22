import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Hls, { Events as HlsEvents, ErrorTypes } from 'hls.js'
// @ts-ignore - shaka-player ambient
import shaka from 'shaka-player'
import type { StreamInfo } from '@shared/types'
import { applyHeroLevelCaps, createHeroHls } from '@/services/streamProbe'

// Polyfill browser features for Shaka Player once at module load
if (typeof window !== 'undefined' && shaka?.polyfill) {
  shaka.polyfill.installAll()
}

/**
 * Addendum 3 §8 · two A/B video slots for the live hero.
 *
 * Supports both HLS (hls.js) and MPEG-DASH / Widevine DRM (shaka-player)
 * with muted live autoplay.
 */

interface UseHeroPlayerOptions {
  stream: StreamInfo | null
  channelId: string | null
  enabled: boolean
  paused: boolean
  onFailure: (channelId: string) => void
}

interface SlotState {
  hls: Hls | null
  shaka: shaka.Player | null
  url: string | null
  channelId: string | null
  frames: number
  firstFrame: boolean
  lastFrameAt: number
  stalledSince: number
  recoveryAttempted: boolean
  revealTimer: number | null
  listeners: AbortController
}

function emptySlot(): SlotState {
  return {
    hls: null,
    shaka: null,
    url: null,
    channelId: null,
    frames: 0,
    firstFrame: false,
    lastFrameAt: 0,
    stalledSince: 0,
    recoveryAttempted: false,
    revealTimer: null,
    listeners: new AbortController()
  }
}

export function useHeroPlayer({
  stream,
  channelId,
  enabled,
  paused,
  onFailure
}: UseHeroPlayerOptions): {
  videoRefs: [React.RefObject<HTMLVideoElement>, React.RefObject<HTMLVideoElement>]
  opacity: [number, number]
  destroyAll: () => void
} {
  const videoARef = useRef<HTMLVideoElement>(null)
  const videoBRef = useRef<HTMLVideoElement>(null)
  // Stable tuple: the load effect depends on the callback identities below.
  const videoRefs = useMemo<
    [React.RefObject<HTMLVideoElement>, React.RefObject<HTMLVideoElement>]
  >(() => [videoARef, videoBRef], [])
  const slotsRef = useRef<[SlotState, SlotState]>([emptySlot(), emptySlot()])
  const activeSlotRef = useRef(0)
  const everPlayedRef = useRef(false)
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const [opacity, setOpacity] = useState<[number, number]>([0, 0])
  const onFailureRef = useRef(onFailure)
  onFailureRef.current = onFailure

  const destroySlot = useCallback((index: number): void => {
    const slot = slotsRef.current[index]
    slot.listeners.abort()
    if (slot.revealTimer !== null) window.clearTimeout(slot.revealTimer)
    if (slot.shaka) {
      try {
        void slot.shaka.destroy()
      } catch {
        // already destroyed
      }
    }
    if (slot.hls) {
      try {
        slot.hls.destroy()
      } catch {
        // already destroyed
      }
    }
    slotsRef.current[index] = emptySlot()
    const video = videoRefs[index].current
    if (video) {
      video.removeAttribute('src')
      try {
        video.load()
      } catch {
        // ignore
      }
    }
    const other = index === 0 ? 1 : 0
    if (
      index === activeSlotRef.current &&
      slotsRef.current[other].hls === null &&
      slotsRef.current[other].shaka === null
    ) {
      setOpacity([0, 0])
    }
  }, [videoRefs])

  const destroyAll = useCallback((): void => {
    destroySlot(0)
    destroySlot(1)
    activeSlotRef.current = 0
    everPlayedRef.current = false
    setOpacity([0, 0])
  }, [destroySlot])

  const seekLive = useCallback((index: number): void => {
    const slot = slotsRef.current[index]
    const video = videoRefs[index].current
    if (!slot.hls || !video) return
    const position = slot.hls.liveSyncPosition
    if (typeof position === 'number' && Number.isFinite(position)) {
      try {
        video.currentTime = position
      } catch {
        // ignore
      }
    }
  }, [videoRefs])

  const playSlot = useCallback((index: number): void => {
    const video = videoRefs[index].current
    if (!video) return
    void video.play().catch(() => {
      // Autoplay policy violation: leave the slot paused; the watchdog retries.
    })
  }, [videoRefs])

  const loadSlot = useCallback(
    (index: number, incoming: StreamInfo, incomingChannelId: string): void => {
      const video = videoRefs[index].current
      if (!video) return
      destroySlot(index)
      const slot = slotsRef.current[index]
      slot.url = incoming.url
      slot.channelId = incomingChannelId
      video.muted = true

      const trackFrame = (): void => {
        // Ignore callbacks from a slot that was torn down mid-flight.
        if (slotsRef.current[index] !== slot) return
        slot.frames += 1
        slot.lastFrameAt = performance.now()
        slot.stalledSince = 0
        if (!slot.firstFrame) {
          slot.firstFrame = true
          const outgoing = index === 0 ? 1 : 0
          activeSlotRef.current = index
          setOpacity(index === 0 ? [1, 0] : [0, 1])
          everPlayedRef.current = true
          destroySlot(outgoing)
        }
        if (video.requestVideoFrameCallback) {
          video.requestVideoFrameCallback(() => trackFrame())
        } else {
          video.addEventListener('timeupdate', () => trackFrame(), { once: true })
        }
      }

      video.addEventListener('waiting', () => {
        if (slotsRef.current[index] !== slot) return
        slot.stalledSince = performance.now()
      }, { signal: slot.listeners.signal })
      video.addEventListener('playing', () => {
        if (slotsRef.current[index] !== slot) return
        slot.stalledSince = 0
        slot.lastFrameAt = performance.now()
      }, { signal: slot.listeners.signal })

      const isDash = incoming.type === 'dash' || /\.mpd(?:[?#]|$)/i.test(incoming.url)

      if (isDash && typeof shaka !== 'undefined' && shaka.Player?.isBrowserSupported?.()) {
        const player = new shaka.Player()
        slot.shaka = player

        void (async () => {
          try {
            await player.attach(video)
            video.muted = true

            const licenseUrl =
              incoming.drm?.licenseUrl ||
              (incoming.url ? new URL('/license', incoming.url).href : '')

            const networking = player.getNetworkingEngine()
            if (networking) {
              networking.registerRequestFilter(
                (type: unknown, request: { headers: Record<string, string> }) => {
                  if (type === shaka.net.NetworkingEngine.RequestType.LICENSE) {
                    request.headers['Origin'] = 'https://www.jiotv.com'
                    request.headers['Referer'] = 'https://www.jiotv.com/'
                    request.headers['User-Agent'] =
                      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    if (incoming.drm?.headers) {
                      Object.assign(request.headers, incoming.drm.headers)
                    }
                  }
                }
              )
            }

            const clockSyncUri = (() => {
              try {
                const u = new URL(incoming.url)
                return `${u.protocol}//${u.host}/dashtime`
              } catch {
                return ''
              }
            })()

            player.configure({
              drm: {
                servers: licenseUrl ? { 'com.widevine.alpha': licenseUrl } : {},
                advanced: {
                  'com.widevine.alpha': {
                    videoRobustness: ['SW_SECURE_CRYPTO'],
                    audioRobustness: ['SW_SECURE_CRYPTO']
                  }
                }
              },
              manifest: {
                dash: {
                  ignoreMinBufferTime: true,
                  autoCorrectDrift: true,
                  clockSyncUri
                }
              },
              abr: {
                enabled: true,
                restrictions: { maxHeight: 720 }
              },
              streaming: {
                bufferingGoal: incoming.isDrm ? 6 : 12,
                bufferBehind: incoming.isDrm ? 2 : 5
              }
            })

            player.addEventListener('error', (event: unknown) => {
              console.warn('[useHeroPlayer] Shaka error event:', event)
              if (slotsRef.current[index] !== slot) return
              destroySlot(index)
            })

            const onReady = (): void => {
              trackFrame()
            }
            video.addEventListener('playing', onReady, { once: true, signal: slot.listeners.signal })
            video.addEventListener('timeupdate', onReady, { once: true, signal: slot.listeners.signal })

            await player.load(incoming.url, null, 'application/dash+xml')
            if (slotsRef.current[index] !== slot) return
            video.muted = true
            if (!pausedRef.current) playSlot(index)
          } catch (err) {
            console.warn('[useHeroPlayer] Shaka stream load failed:', err)
            if (slotsRef.current[index] !== slot) return
            destroySlot(index)
          }
        })()
      } else {
        const hls = createHeroHls()
        slot.hls = hls

        hls.on(HlsEvents.MANIFEST_PARSED, () => {
          applyHeroLevelCaps(hls)
          if (!pausedRef.current) playSlot(index)
        })
        hls.on(HlsEvents.LEVEL_LOADED, () => {
          if (video.currentTime === 0) seekLive(index)
        })
        hls.on(HlsEvents.ERROR, (_event, data) => {
          if (!data.fatal) return
          if (data.type === ErrorTypes.MEDIA_ERROR && !slot.recoveryAttempted) {
            slot.recoveryAttempted = true
            try {
              hls.recoverMediaError()
              return
            } catch {
              // fall through to failure
            }
          console.warn('[useHeroPlayer] HLS fatal error:', data)
          destroySlot(index)
        })
        hls.on(HlsEvents.FRAG_BUFFERED, () => {
          slot.stalledSince = 0
        })

        hls.loadSource(incoming.url)
        hls.attachMedia(video)
        if (video.requestVideoFrameCallback) {
          video.requestVideoFrameCallback(() => trackFrame())
        } else {
          video.addEventListener('timeupdate', function loop() {
            trackFrame()
            video.addEventListener('timeupdate', loop, { once: true })
          })
        }
      }
    },
    [destroySlot, playSlot, seekLive, videoRefs]
  )

  // Load/switch streams.
  useEffect(() => {
    if (!enabled || !stream || !channelId) {
      destroyAll()
      return
    }
    const existingOther = slotsRef.current.findIndex(
      (slot) => slot.url === stream.url && (slot.hls || slot.shaka)
    )
    if (existingOther >= 0) {
      // Already buffered in the other slot: crossfade back without a new stream.
      const outgoing = existingOther === 0 ? 1 : 0
      activeSlotRef.current = existingOther
      setOpacity(existingOther === 0 ? [1, 0] : [0, 1])
      const timer = window.setTimeout(() => destroySlot(outgoing), 400)
      return () => window.clearTimeout(timer)
    }
    const outgoing = activeSlotRef.current
    const incoming = outgoing === 0 ? 1 : 0
    destroySlot(outgoing)
    setOpacity([0, 0])
    loadSlot(incoming, stream, channelId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream?.url, channelId, enabled, destroyAll, loadSlot, destroySlot])

  // Pause/resume without tearing the stream down.
  useEffect(() => {
    for (const video of videoRefs) {
      if (!video.current) continue
      if (paused) video.current.pause()
    }
    if (!paused && enabled) {
      const index = activeSlotRef.current
      seekLive(index)
      playSlot(index)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, enabled])

  // Runtime watchdog: stall recovery (non-destructive)
  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(() => {
      if (document.hidden || paused) return
      const index = activeSlotRef.current
      const slot = slotsRef.current[index]
      const video = videoRefs[index].current
      if ((!slot.hls && !slot.shaka) || !video || !channelId) return
      const now = performance.now()
      if (slot.stalledSince > 0 && now - slot.stalledSince > 8000) {
        destroySlot(index)
        return
      }
      if (slot.firstFrame && slot.lastFrameAt > 0 && now - slot.lastFrameAt > 10000) {
        destroySlot(index)
      }
    }, 1000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, paused, channelId, destroySlot])

  // Lifecycle: stop everything when the window is hidden or the route leaves.
  useEffect(() => {
    const onVisibility = (): void => {
      if (document.hidden) {
        for (const video of videoRefs) video.current?.pause()
      } else if (enabled && !paused) {
        const index = activeSlotRef.current
        seekLive(index)
        playSlot(index)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, paused])

  useEffect(() => () => destroyAll(), [destroyAll])

  return { videoRefs, opacity, destroyAll }
}
