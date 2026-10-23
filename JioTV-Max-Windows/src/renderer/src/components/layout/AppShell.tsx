import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

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

  return (
    <div className="relative flex h-full min-h-0 flex-1 overflow-hidden">
      {!isPlayer ? <Sidebar /> : null}
      <main
        ref={mainRef}
        id="app-scroll"
        className={cn(
          'relative min-w-0 flex-1',
          isPlayer ? 'overflow-hidden bg-black' : 'overflow-y-auto overscroll-contain'
        )}
      >
        {!isPlayer ? (
          <>
            <TopBar />
            <div className="relative">{children}</div>
          </>
        ) : (
          children
        )}
      </main>
    </div>
  )
}
