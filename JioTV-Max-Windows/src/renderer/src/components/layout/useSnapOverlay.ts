import { useEffect, useRef, useState } from 'react'
import { getBridge } from '@/services/api'
import type { SnapBounds, SnapButtonState } from '@shared/types'

export interface UseSnapOverlayReturn {
  isOverlayMode: boolean
  buttonState: SnapButtonState
  dataHover: string | undefined
  dataPressed: string | undefined
}

export function useSnapOverlay(
  buttonRef: React.RefObject<HTMLButtonElement | null>,
  maximized?: boolean
): UseSnapOverlayReturn {
  const [isOverlayMode, setIsOverlayMode] = useState(false)
  const [buttonState, setButtonState] = useState<SnapButtonState>('idle')
  const lastBoundsRef = useRef<SnapBounds | null>(null)
  const scheduleUpdateRef = useRef<(() => void) | null>(null)
  const bridge = getBridge()

  // 1. Check if snap layout overlay is supported on this platform / window
  useEffect(() => {
    if (!bridge?.snapLayout) {
      setIsOverlayMode(false)
      return
    }

    let isMounted = true
    void bridge.snapLayout
      .getSupportStatus()
      .then((status) => {
        if (isMounted) {
          setIsOverlayMode(Boolean(status?.supported))
        }
      })
      .catch(() => {
        if (isMounted) setIsOverlayMode(false)
      })

    return () => {
      isMounted = false
    }
  }, [bridge])

  // 2. Subscribe to native mouse events forwarded from the child HWND
  useEffect(() => {
    if (!bridge?.snapLayout || !isOverlayMode) {
      setButtonState('idle')
      return
    }

    const unsubscribe = bridge.snapLayout.onStateChange((state) => {
      setButtonState(state)
    })

    return () => {
      unsubscribe()
    }
  }, [bridge, isOverlayMode])

  // 3. Monitor button geometry and report bounds changes reliably across window moves, snaps, and resizes
  useEffect(() => {
    if (!bridge?.snapLayout || !isOverlayMode) return

    let rafId = 0
    let timers: number[] = []

    const sendBounds = (): void => {
      const el = buttonRef.current
      if (!el || !bridge?.snapLayout) return

      const rect = el.getBoundingClientRect()
      // If hidden, detached, or collapsed to 0 dimensions
      if (rect.width <= 0 || rect.height <= 0) {
        if (lastBoundsRef.current !== null) {
          lastBoundsRef.current = null
          bridge.snapLayout.updateBounds(null)
        }
        return
      }

      // Convert CSS getBoundingClientRect to physical client pixels using window.devicePixelRatio.
      // This accurately includes display scale (DPI) and browser zoomFactor with exact boundaries.
      const scale = window.devicePixelRatio || 1.0
      const left = Math.round(rect.left * scale)
      const top = Math.round(rect.top * scale)
      const width = Math.round(rect.right * scale) - left
      const height = Math.round(rect.bottom * scale) - top

      const nextBounds: SnapBounds = {
        x: left,
        y: top,
        width,
        height
      }

      // Only dispatch across IPC if integer pixel geometry has actually changed
      if (
        lastBoundsRef.current &&
        lastBoundsRef.current.x === nextBounds.x &&
        lastBoundsRef.current.y === nextBounds.y &&
        lastBoundsRef.current.width === nextBounds.width &&
        lastBoundsRef.current.height === nextBounds.height
      ) {
        return
      }

      lastBoundsRef.current = nextBounds
      bridge.snapLayout.updateBounds(nextBounds)
    }

    const scheduleUpdate = (): void => {
      cancelAnimationFrame(rafId)
      timers.forEach((t) => clearTimeout(t))
      timers = []

      // Immediate measurement on the next animation frame
      rafId = requestAnimationFrame(sendBounds)

      // In Windows 11, snapping, maximizing, and window restoring animate over ~150ms.
      // Scheduling follow-up checks ensures the settled final position is guaranteed to be captured.
      timers.push(window.setTimeout(sendBounds, 50))
      timers.push(window.setTimeout(sendBounds, 150))
      timers.push(window.setTimeout(sendBounds, 300))
    }

    scheduleUpdateRef.current = scheduleUpdate

    // Measure initially
    scheduleUpdate()

    // Observe documentElement resize: this fires whenever the viewport/window resizes or snaps
    const observer = new ResizeObserver(() => {
      scheduleUpdate()
    })
    if (document.documentElement) {
      observer.observe(document.documentElement)
    }
    if (buttonRef.current) {
      observer.observe(buttonRef.current)
    }

    // Listen for window resize
    window.addEventListener('resize', scheduleUpdate, { passive: true })

    // Listen for requests from the main process (e.g. window moved or restored)
    const offRequest = bridge.snapLayout.onRequestBoundsUpdate?.(scheduleUpdate)

    // Listen for maximize / restore changes directly
    const offMax = bridge.onMaximizedChange?.(() => {
      scheduleUpdate()
    })
    const offFs = bridge.onFullscreenChange?.(() => {
      scheduleUpdate()
    })

    // Listen for display scaling (DPI) changes
    let mql: MediaQueryList | null = null
    const onDpiChange = (): void => {
      scheduleUpdate()
      updateDpiListener()
    }
    const updateDpiListener = (): void => {
      mql?.removeEventListener('change', onDpiChange)
      mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      mql.addEventListener('change', onDpiChange)
    }
    updateDpiListener()

    return () => {
      scheduleUpdateRef.current = null
      cancelAnimationFrame(rafId)
      timers.forEach((t) => clearTimeout(t))
      timers = []
      observer.disconnect()
      window.removeEventListener('resize', scheduleUpdate)
      mql?.removeEventListener('change', onDpiChange)
      offRequest?.()
      offMax?.()
      offFs?.()
      if (bridge?.snapLayout) {
        lastBoundsRef.current = null
        bridge.snapLayout.updateBounds(null)
      }
    }
  }, [bridge, isOverlayMode, buttonRef])

  // 4. Trigger bounds recalculation when maximized state prop changes without tearing down the overlay
  useEffect(() => {
    scheduleUpdateRef.current?.()
  }, [maximized])

  return {
    isOverlayMode,
    buttonState,
    dataHover: buttonState === 'hover' ? 'true' : undefined,
    dataPressed: buttonState === 'pressed' ? 'true' : undefined
  }
}
