import { useCallback, useEffect, useState } from 'react'
import type { MediaSeekRange } from './useMediaPlayer'
import { formatBehindLive } from '@/lib/time'

/**
 * Hysteresis thresholds for live-edge detection:
 * - Enter delayed state when >= 20 seconds behind live edge.
 * - Exit delayed state (return to live) only when caught up to <= 6 seconds behind live edge.
 * This 14-second deadband prevents saw-tooth segment manifest updates (which jump by 2-6s)
 * from repeatedly flipping the "Go Live" affordance on and off.
 */
export const LIVE_EDGE_ENTER_DELAYED_SECONDS = 20
export const LIVE_EDGE_EXIT_DELAYED_SECONDS = 6
export const LIVE_EDGE_THRESHOLD_SECONDS = LIVE_EDGE_ENTER_DELAYED_SECONDS

export interface UseLiveEdgeOptions {
  videoRef: React.RefObject<HTMLVideoElement>
  /** DVR window from `useMediaPlayer`. */
  seekRange: MediaSeekRange | null
  /** Jump to the live edge (provided by `useMediaPlayer`). */
  goLive: () => void
  /** Only show LIVE/behind-live state for live streams. */
  enabled?: boolean
  /** Avoid showing a large negative offset before the first frame. */
  ready?: boolean
}

export interface UseLiveEdgeResult {
  /** Current playback position in the media timeline. */
  currentTime: number
  /** Seconds between the live edge and the current position. */
  behindLive: number
  /** True when playing at (or within threshold of) the live edge. */
  atLiveEdge: boolean
  /** True when viewer is delayed behind live edge with hysteresis applied. */
  isDelayed: boolean
  /** "LIVE" or a "-MM:SS" timecode. */
  label: string
  /** True when the manifest exposes a usable DVR window. */
  hasDvrWindow: boolean
  goLive: () => void
}

/**
 * Tracks how far the viewer is behind the live edge.
 *
 * Shaka's `seekRange()` and the media element's `seekable` range both express
 * the DVR window in presentation seconds, so the same maths works for DASH
 * (Shaka) and HLS (hls.js).
 */
export function useLiveEdge({
  videoRef,
  seekRange,
  goLive,
  enabled = true,
  ready = true
}: UseLiveEdgeOptions): UseLiveEdgeResult {
  const [currentTime, setCurrentTime] = useState(0)
  const [isDelayed, setIsDelayed] = useState(false)

  const update = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    const next = Number.isFinite(video.currentTime) ? video.currentTime : 0
    setCurrentTime((previous) => (Math.abs(previous - next) > 0.05 ? next : previous))
  }, [videoRef])

  // Re-evaluate when the live edge moves (this happens every second while
  // paused too, which is exactly what makes the offset grow).
  useEffect(() => {
    update()
  }, [seekRange?.start, seekRange?.end, update])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const events = [
      'timeupdate',
      'seeking',
      'seeked',
      'play',
      'pause',
      'loadedmetadata',
      'progress',
      'waiting'
    ] as const
    for (const event of events) video.addEventListener(event, update)

    // `timeupdate` is only emitted ~4×/second. The interval keeps the offset
    // and seek bar smooth while a live manifest advances.
    const timer = window.setInterval(update, 500)
    update()
    return () => {
      window.clearInterval(timer)
      for (const event of events) video.removeEventListener(event, update)
    }
  }, [update, videoRef])

  const hasDvrWindow = Boolean(
    enabled && seekRange && Number.isFinite(seekRange.start) && seekRange.end - seekRange.start > 1
  )
  const behindLive =
    enabled && seekRange ? Math.max(0, seekRange.end - currentTime) : 0

  // Hysteresis state machine to prevent periodic chunk updates from oscillating isDelayed
  useEffect(() => {
    if (!enabled || !ready) {
      setIsDelayed(false)
      return
    }
    if (!isDelayed) {
      if (behindLive >= LIVE_EDGE_ENTER_DELAYED_SECONDS) {
        setIsDelayed(true)
      }
    } else {
      if (behindLive <= LIVE_EDGE_EXIT_DELAYED_SECONDS) {
        setIsDelayed(false)
      }
    }
  }, [behindLive, isDelayed, enabled, ready])

  const atLiveEdge = !isDelayed
  const label = atLiveEdge ? 'LIVE' : formatBehindLive(behindLive)

  const handleGoLive = useCallback(() => {
    setIsDelayed(false)
    goLive()
  }, [goLive])

  return {
    currentTime,
    behindLive,
    atLiveEdge,
    isDelayed,
    label,
    hasDvrWindow,
    goLive: handleGoLive
  }
}
