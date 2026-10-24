import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { MobileNavBar } from './MobileNavBar'

/**
 * Persistent chrome around the routed pages. The player route takes over the
 * full frame: no sidebar, no top bar, just the video and player controls.
 */
export function AppShell({ children }: { children: React.ReactNode }): JSX.Element {
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const isPlayer = location.pathname.startsWith('/watch')

  useEffect(() => {
    if (!isPlayer && mainRef.current) mainRef.current.scrollTop = 0
  }, [location.pathname, isPlayer])

  // Scroll chaining: when app hits top/bottom or has no scroll, forward wheel delta to parent website
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (typeof window === 'undefined' || !window.parent || window.parent === window) return

      const el = document.getElementById('app-scroll')
      const normalizedDeltaY =
        e.deltaMode === 1
          ? e.deltaY * 33
          : e.deltaMode === 2
            ? e.deltaY * window.innerHeight
            : e.deltaY

      if (!el || isPlayer) {
        window.parent.postMessage({ type: 'JIOTV_PARENT_SCROLL', deltaY: normalizedDeltaY }, '*')
        return
      }

      const scrollingDown = normalizedDeltaY > 0
      const scrollingUp = normalizedDeltaY < 0
      const atTop = el.scrollTop <= 2
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 3

      if ((scrollingDown && atBottom) || (scrollingUp && atTop)) {
        window.parent.postMessage({ type: 'JIOTV_PARENT_SCROLL', deltaY: normalizedDeltaY }, '*')
      }
    }

    window.addEventListener('wheel', handleWheel, { passive: true })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [isPlayer])

  return (
    <div className="relative flex h-full min-h-0 flex-1 overflow-hidden">
      {!isPlayer ? (
        <div className="hidden sm:block shrink-0">
          <Sidebar />
        </div>
      ) : null}
      <main
        ref={mainRef}
        id="app-scroll"
        className={cn(
          'relative min-w-0 flex-1',
          isPlayer ? 'overflow-hidden bg-black' : 'overflow-y-auto overscroll-auto'
        )}
      >
        {!isPlayer ? (
          <>
            <TopBar />
            <div className="relative pb-[58px] sm:pb-0">{children}</div>
            <MobileNavBar />
          </>
        ) : (
          children
        )}
      </main>
    </div>
  )
}
