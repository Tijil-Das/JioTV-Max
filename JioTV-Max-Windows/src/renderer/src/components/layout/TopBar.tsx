import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { SearchBox } from './SearchBox'
import { WindowControls } from './WindowControls'

/**
 * 64px top bar. Transparent over the hero; glass at 80% + hairline when scrolled.
 * Integrated standard Windows window controls at the far right.
 * Drag region allows moving the window by dragging empty bar space.
 */
export function TopBar(): JSX.Element {
  const location = useLocation()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const element = document.getElementById('app-scroll')
    if (!element) return
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setScrolled(element.scrollTop > 28))
    }
    onScroll()
    element.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      element.removeEventListener('scroll', onScroll)
    }
  }, [location.pathname])

  return (
    <div className="drag-region sticky top-0 z-30 -mb-[64px] h-[64px]">
      <div
        className={cn(
          'flex h-full items-center justify-between gap-6 pl-12 pr-0 transition-all duration-300',
          scrolled
            ? 'border-b border-[rgba(255,255,255,0.07)] bg-[rgba(10,10,11,0.80)] backdrop-blur-[28px]'
            : 'border-b border-transparent bg-transparent'
        )}
      >
        {/* Left: search bar */}
        <div className="no-drag flex items-center">
          <SearchBox />
        </div>

        {/* Middle: draggable empty spacer */}
        <div className="min-w-0 flex-1" />

        {/* Right: window controls */}
        <div className="no-drag flex h-full shrink-0 items-center">
          <WindowControls className="self-start" />
        </div>
      </div>
    </div>
  )
}
