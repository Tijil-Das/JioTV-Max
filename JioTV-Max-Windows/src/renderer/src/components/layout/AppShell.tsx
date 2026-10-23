import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { CastButton } from '@/components/casting/CastButton'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { WindowControls } from './WindowControls'

/**
 * Persistent chrome around the routed pages.
 * The top 36px header hosts the window controls touching the absolute right top corner,
 * ensuring the scrollbar track finishes cleanly below the close button.
 */
export function AppShell({ children }: { children: React.ReactNode }): JSX.Element {
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const isPlayer = location.pathname.startsWith('/watch')
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    if (!isPlayer && mainRef.current) mainRef.current.scrollTop = 0
  }, [location.pathname, isPlayer])

  useEffect(() => {
    const element = document.getElementById('app-scroll')
    if (!element) return
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setScrolled(element.scrollTop > 16))
    }
    onScroll()
    element.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      element.removeEventListener('scroll', onScroll)
    }
  }, [location.pathname, isPlayer])

  return (
    <div className="relative flex h-full min-h-0 flex-1 overflow-hidden">
      {!isPlayer ? <Sidebar /> : null}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Caption header: touches absolute right top corner, stopping the scrollbar below */}
        {!isPlayer ? (
          <header
            className={cn(
              'drag-region relative z-40 flex h-[36px] shrink-0 items-center justify-end pr-0 transition-colors duration-200',
              scrolled
                ? 'border-b border-[rgba(255,255,255,0.07)] bg-[rgba(10,10,11,0.85)] backdrop-blur-[28px]'
                : 'border-b border-transparent bg-transparent'
            )}
          >
            <div className="no-drag flex h-full shrink-0 items-center">
              <CastButton scale={0.85} isCastable={true} className="mr-2" />
              <WindowControls />
            </div>
          </header>
        ) : null}

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
    </div>
  )
}
