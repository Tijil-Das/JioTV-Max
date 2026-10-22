import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseDoubleTapSeekOptions {
  /** Ref to the HTML5 video element. */
  videoRef: React.RefObject<HTMLVideoElement>
  /** Active seekable DVR range from useMediaPlayer, if available. */
  seekRange?: { start: number; end: number } | null
  /** Action executed on single click (typically togglePlay). */
  onSingleClick: () => void
  /** Action executed on center double click (typically toggleFullscreen). */
  onCenterDoubleClick?: () => void
  /** Optional custom seek function (e.g. engine.seekTo). */
  onSeekTo?: (time: number) => void
  /** Optional jump to live edge function for live streams. */
  onGoLive?: () => void
  /** Seconds to seek per skip. Default 5. */
  secondsPerSkip?: number
  /** Window in ms to accumulate repeated skips (+5, +10, +15...). Default 800ms. */
  accumulationWindowMs?: number
  /** Delay in ms to wait for a second tap before treating as single click. Default 250ms. */
  singleClickDelayMs?: number
  /** Delay in ms before hiding the seek overlay after the last skip. Default 600ms. */
  overlayFadeOutMs?: number
}

export interface SeekOverlayState {
  active: boolean
  direction: 'forward' | 'backward' | null
  accumulatedSeconds: number
  pulseKey: number
}

export interface UseDoubleTapSeekResult {
  /** Click/tap handler to attach to the video overlay container. */
  handleContainerClick: (event: React.MouseEvent<HTMLElement>) => void
  /** Explicitly trigger a skip (from control-bar buttons or keyboard shortcuts). */
  triggerSkip: (direction: 'forward' | 'backward', customSeconds?: number) => void
  /** State to pass directly into <SeekOverlay />. */
  seekOverlay: SeekOverlayState
}

/**
 * YouTube-style double-tap seeking and skip accumulation hook.
 *
 * - Left third double-tap: seek backward.
 * - Right third double-tap: seek forward.
 * - Center click: single-click toggle play/pause.
 * - After first double-tap, rapid single taps within 800ms continue accumulating skips.
 * - Single click outside rapid multi-tap window is delayed by 250ms to distinguish taps.
 */
export function useDoubleTapSeek({
  videoRef,
  seekRange,
  onSingleClick,
  onCenterDoubleClick,
  onSeekTo,
  onGoLive,
  secondsPerSkip = 5,
  accumulationWindowMs = 800,
  singleClickDelayMs = 250,
  overlayFadeOutMs = 600
}: UseDoubleTapSeekOptions): UseDoubleTapSeekResult {
  const [seekOverlay, setSeekOverlay] = useState<SeekOverlayState>({
    active: false,
    direction: null,
    accumulatedSeconds: secondsPerSkip,
    pulseKey: 0
  })

  const overlayTimerRef = useRef<number | null>(null)
  const multiTapWindowTimerRef = useRef<number | null>(null)
  const singleClickTimerRef = useRef<number | null>(null)

  const lastTapTimeRef = useRef<number>(0)
  const lastTapZoneRef = useRef<'backward' | 'forward' | 'center' | null>(null)
  const isMultiTapActiveRef = useRef(false)
  const multiTapDirectionRef = useRef<'backward' | 'forward' | null>(null)

  const accumulatedSecondsRef = useRef(secondsPerSkip)
  const currentDirectionRef = useRef<'backward' | 'forward' | null>(null)
  const lastSkipTimestampRef = useRef<number>(0)

  // Clean up all pending timers on unmount
  useEffect(() => {
    return () => {
      if (overlayTimerRef.current) window.clearTimeout(overlayTimerRef.current)
      if (multiTapWindowTimerRef.current) window.clearTimeout(multiTapWindowTimerRef.current)
      if (singleClickTimerRef.current) window.clearTimeout(singleClickTimerRef.current)
    }
  }, [])

  /** Executes the actual media time adjustment with DVR/duration clamping. */
  const executeSeek = useCallback(
    (direction: 'forward' | 'backward', seconds: number) => {
      const media = videoRef.current
      if (!media) return
      const cur = media.currentTime || 0
      const delta = direction === 'forward' ? seconds : -seconds
      const target = cur + delta

      if (seekRange) {
        const minTime = seekRange.start + 0.5
        const maxTime = seekRange.end - 0.5
        // Forward jump beyond live threshold snaps directly to live
        if (direction === 'forward' && target >= maxTime) {
          if (onGoLive) {
            onGoLive()
            return
          }
        }
        const clamped = Math.max(minTime, Math.min(target, maxTime))
        if (onSeekTo) {
          onSeekTo(clamped)
        } else {
          try {
            media.currentTime = clamped
          } catch {
            // Ignore if metadata loading
          }
        }
      } else {
        const duration = Number.isFinite(media.duration) ? media.duration : 0
        const maxLimit = duration > 0 ? duration : Math.max(cur, target)
        const clamped = Math.max(0, Math.min(target, maxLimit))
        if (onSeekTo) {
          onSeekTo(clamped)
        } else {
          try {
            media.currentTime = clamped
          } catch {
            // Ignore if metadata loading
          }
        }
      }
    },
    [onGoLive, onSeekTo, seekRange, videoRef]
  )

  /** Trigger skip animation + accumulation + media seek. */
  const triggerSkip = useCallback(
    (direction: 'forward' | 'backward', customSeconds = secondsPerSkip) => {
      const now = performance.now()
      const timeSinceLast = now - lastSkipTimestampRef.current
      lastSkipTimestampRef.current = now

      // Accumulate if consecutive skips happen within accumulation window in same direction
      if (
        currentDirectionRef.current === direction &&
        timeSinceLast < accumulationWindowMs &&
        accumulatedSecondsRef.current > 0
      ) {
        accumulatedSecondsRef.current += customSeconds
      } else {
        accumulatedSecondsRef.current = customSeconds
        currentDirectionRef.current = direction
      }

      const total = accumulatedSecondsRef.current

      // Perform the actual seek increment
      executeSeek(direction, customSeconds)

      // Retrigger overlay & chevron pulses
      setSeekOverlay((prev) => ({
        active: true,
        direction,
        accumulatedSeconds: total,
        pulseKey: prev.pulseKey + 1
      }))

      // Keep multi-tap mode alive for rapid repeated taps
      isMultiTapActiveRef.current = true
      multiTapDirectionRef.current = direction
      if (multiTapWindowTimerRef.current) window.clearTimeout(multiTapWindowTimerRef.current)
      multiTapWindowTimerRef.current = window.setTimeout(() => {
        isMultiTapActiveRef.current = false
        multiTapDirectionRef.current = null
      }, accumulationWindowMs)

      // Schedule overlay fade-out
      if (overlayTimerRef.current) window.clearTimeout(overlayTimerRef.current)
      overlayTimerRef.current = window.setTimeout(() => {
        setSeekOverlay((prev) => ({ ...prev, active: false }))
        currentDirectionRef.current = null
        accumulatedSecondsRef.current = secondsPerSkip
      }, overlayFadeOutMs)
    },
    [accumulationWindowMs, executeSeek, overlayFadeOutMs, secondsPerSkip]
  )

  /** Container click handler with 3-zone gesture resolution. */
  const handleContainerClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      // Don't intercept clicks on interactive buttons, inputs, sliders or links
      const target = event.target as HTMLElement | null
      if (
        target?.closest('button') ||
        target?.closest('input') ||
        target?.closest('a') ||
        target?.closest('[role="button"]') ||
        target?.closest('[role="menu"]') ||
        target?.closest('[role="dialog"]')
      ) {
        return
      }

      const rect = event.currentTarget.getBoundingClientRect()
      if (rect.width === 0) return
      const xRatio = (event.clientX - rect.left) / rect.width

      // Resolve gesture zone
      let zone: 'backward' | 'forward' | 'center' = 'center'
      if (xRatio < 0.35) {
        zone = 'backward'
      } else if (xRatio > 0.65) {
        zone = 'forward'
      }

      // Center zone: handle single-click (play/pause) and center double-click (fullscreen)
      if (zone === 'center') {
        const now = performance.now()
        const timeSinceLastTap = now - lastTapTimeRef.current
        isMultiTapActiveRef.current = false

        if (timeSinceLastTap < singleClickDelayMs && lastTapZoneRef.current === 'center') {
          // Center double click detected
          if (singleClickTimerRef.current) {
            window.clearTimeout(singleClickTimerRef.current)
            singleClickTimerRef.current = null
          }
          lastTapTimeRef.current = 0
          lastTapZoneRef.current = null
          if (onCenterDoubleClick) {
            onCenterDoubleClick()
          } else {
            onSingleClick()
          }
        } else {
          lastTapTimeRef.current = now
          lastTapZoneRef.current = 'center'
          if (singleClickTimerRef.current) window.clearTimeout(singleClickTimerRef.current)
          singleClickTimerRef.current = window.setTimeout(() => {
            singleClickTimerRef.current = null
            lastTapZoneRef.current = null
            onSingleClick()
          }, singleClickDelayMs)
        }
        return
      }

      // If already in rapid multi-tap skipping mode in the same zone, tap immediately skips again
      if (isMultiTapActiveRef.current && multiTapDirectionRef.current === zone) {
        if (singleClickTimerRef.current) {
          window.clearTimeout(singleClickTimerRef.current)
          singleClickTimerRef.current = null
        }
        triggerSkip(zone)
        return
      }

      const now = performance.now()
      const timeSinceLastTap = now - lastTapTimeRef.current

      // Check for double-tap (second tap within 250ms in same zone)
      if (timeSinceLastTap < singleClickDelayMs && lastTapZoneRef.current === zone) {
        // Double-tap detected: cancel pending single-click action
        if (singleClickTimerRef.current) {
          window.clearTimeout(singleClickTimerRef.current)
          singleClickTimerRef.current = null
        }
        lastTapTimeRef.current = 0
        lastTapZoneRef.current = null
        triggerSkip(zone)
      } else {
        // First tap: schedule single-click action after delay
        lastTapTimeRef.current = now
        lastTapZoneRef.current = zone

        if (singleClickTimerRef.current) window.clearTimeout(singleClickTimerRef.current)
        singleClickTimerRef.current = window.setTimeout(() => {
          singleClickTimerRef.current = null
          lastTapZoneRef.current = null
          onSingleClick()
        }, singleClickDelayMs)
      }
    },
    [onCenterDoubleClick, onSingleClick, singleClickDelayMs, triggerSkip]
  )

  return {
    handleContainerClick,
    triggerSkip,
    seekOverlay
  }
}
