import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Keyboard } from 'lucide-react'
import { cn } from '@/lib/cn'
import { TitleBar } from './TitleBar'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { BrandMark } from '@/components/ui/BrandMark'

/**
 * Persistent chrome around the routed pages. The player route takes over the
 * full frame: no sidebar, no top bar, just the title strip and the video.
 */
export function AppShell({ children }: { children: React.ReactNode }): JSX.Element {
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const isPlayer = location.pathname.startsWith('/watch')

  useEffect(() => {
    if (!isPlayer && mainRef.current) mainRef.current.scrollTop = 0
  }, [location.pathname, isPlayer])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TitleBar />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
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
              <footer className="mt-8 flex items-center justify-between border-t border-white/[0.05] px-8 py-6 text-[11px] text-text-muted">
                <div className="flex items-center gap-2.5">
                  <BrandMark size={16} />
                  <span>StreamDeck TV · local-first, privacy-respecting playback</span>
                </div>
                <span className="flex items-center gap-1.5">
                  <Keyboard className="h-3.5 w-3.5" />
                  Press Space to play · ↑↓ to change channel · Ctrl K to search
                </span>
              </footer>
            </>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  )
}
