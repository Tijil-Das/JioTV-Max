import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { SearchBox } from './SearchBox'

/**
 * Top bar for search and navigation.
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
      frame = requestAnimationFrame(() => setScrolled(element.scrollTop > 16))
    }
    onScroll()
    element.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      element.removeEventListener('scroll', onScroll)
    }
  }, [location.pathname])

  return (
    <div className="drag-region sticky top-0 z-30 -mb-[56px] h-[56px]">
      <div
        className={cn(
          'flex h-full items-center justify-between gap-6 pl-12 pr-6 transition-all duration-300',
          scrolled
            ? 'border-b border-[rgba(255,255,255,0.07)] bg-[rgba(10,10,11,0.80)] backdrop-blur-[28px]'
            : 'border-b border-transparent bg-transparent'
        )}
      >
        {/* Left: search bar */}
        <div className="no-drag flex items-center">
          <SearchBox />
        </div>

        {/* Middle/Right: draggable empty spacer */}
        <div className="min-w-0 flex-1" />
      </div>
    </div>
  )
}
