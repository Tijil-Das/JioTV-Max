import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Hls, { Events as HlsEvents, ErrorTypes } from 'hls.js'
import type { StreamInfo } from '@shared/types'
import { applyHeroLevelCaps, createHeroHls } from '@/services/streamProbe'

/**
 * Addendum 3 §8 · two A/B video slots for the live hero.
 *
 * Only two hls.js instances can exist at once. A new stream loads into the
 * idle slot; once it has painted, the slots crossfade for 400ms and the
 * outgoing instance is destroyed. The watchdog removes a channel after a
 * stall, a frame-progress gap, or an unrecoverable fatal error.
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
    if (index === activeSlotRef.current && slotsRef.current[other].hls === null) {
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
      const hls = createHeroHls()
      slot.hls = hls

      const trackFrame = (): void => {
        // Ignore callbacks from a slot that was torn down mid-flight.
        if (slotsRef.current[index] !== slot) return
        slot.frames += 1
        slot.lastFrameAt = performance.now()
        slot.stalledSince = 0
        if (!slot.firstFrame) {
          slot.firstFrame = true
          const outgoing = index === 0 ? 1 : 0
          const outgoingLoaded = slotsRef.current[outgoing].hls !== null
          activeSlotRef.current = index
          setOpacity(index === 0 ? [1, outgoingLoaded ? 1 : 0] : [outgoingLoaded ? 1 : 0, 1])
          const duration = everPlayedRef.current ? 400 : 500
          everPlayedRef.current = true
          slot.revealTimer = window.setTimeout(() => {
            slot.revealTimer = null
            setOpacity(index === 0 ? [1, 0] : [0, 1])
            if (outgoingLoaded) destroySlot(outgoing)
          }, duration)
        }
        if (video.requestVideoFrameCallback) {
          video.requestVideoFrameCallback(() => trackFrame())
        } else {
          video.addEventListener('timeupdate', () => trackFrame(), { once: true })
        }
      }

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
        }
        destroySlot(index)
        onFailureRef.current(incomingChannelId)
      })
      hls.on(HlsEvents.FRAG_BUFFERED, () => {
        slot.stalledSince = 0
      })

      video.addEventListener('waiting', () => {
        if (slotsRef.current[index] !== slot) return
        slot.stalledSince = performance.now()
      }, { signal: slot.listeners.signal })
      video.addEventListener('playing', () => {
        if (slotsRef.current[index] !== slot) return
        slot.stalledSince = 0
        slot.lastFrameAt = performance.now()
      }, { signal: slot.listeners.signal })

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
    },
    [destroySlot, playSlot, seekLive, videoRefs]
  )

  // Load/switch streams.
  useEffect(() => {
    if (!enabled || !stream || !channelId) {
      destroyAll()
      return
    }
    const existingOther = slotsRef.current.findIndex((slot) => slot.url === stream.url && slot.hls)
    if (existingOther >= 0) {
      // Already buffered in the other slot: crossfade back without a new stream.
      const outgoing = existingOther === 0 ? 1 : 0
      activeSlotRef.current = existingOther
      setOpacity(existingOther === 0 ? [1, 0] : [0, 1])
      const timer = window.setTimeout(() => destroySlot(outgoing), 400)
      return () => window.clearTimeout(timer)
    }
    const incoming = activeSlotRef.current === 0 ? 1 : 0
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

  // Runtime watchdog: stall >4s, frame gap >5s, or hidden until failure.
  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(() => {
      if (document.hidden || paused) return
      const index = activeSlotRef.current
      const slot = slotsRef.current[index]
      const video = videoRefs[index].current
      if (!slot.hls || !video || !channelId) return
      const now = performance.now()
      if (slot.stalledSince > 0 && now - slot.stalledSince > 4000) {
        destroySlot(index)
        onFailureRef.current(slot.channelId ?? channelId)
        return
      }
      if (slot.firstFrame && slot.lastFrameAt > 0 && now - slot.lastFrameAt > 5000) {
        destroySlot(index)
        onFailureRef.current(slot.channelId ?? channelId)
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
