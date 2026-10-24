import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Tracks pointer/keyboard inactivity. When `enabled` is false (paused video,
 * open popover) the UI is kept awake and the idle flag is cleared.
 */
export function useIdle(timeoutMs = 3000, enabled = true): {
  idle: boolean
  wake: () => void
} {
  const [idle, setIdle] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const arm = useCallback(() => {
    clearTimer()
    if (!enabled) return
    timer.current = setTimeout(() => setIdle(true), timeoutMs)
  }, [clearTimer, enabled, timeoutMs])

  const wake = useCallback(() => {
    setIdle(false)
    arm()
  }, [arm])

  useEffect(() => {
    if (!enabled) {
      clearTimer()
      setIdle(false)
      return
    }
    wake()
    const events: Array<keyof WindowEventMap> = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']
    const handler = () => wake()
    events.forEach((event) => window.addEventListener(event, handler, { passive: true }))
    return () => {
      events.forEach((event) => window.removeEventListener(event, handler))
      clearTimer()
    }
  }, [clearTimer, enabled, wake])

  return { idle, wake }
}
