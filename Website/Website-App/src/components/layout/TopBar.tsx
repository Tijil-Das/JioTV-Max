import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { SearchBox } from './SearchBox'

/**
 * 64px top bar. Transparent over the hero; glass at 80% + hairline when scrolled.
 * Horizontally center-aligned search bar.
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
    <div className="sticky top-0 z-30 -mb-[64px] h-[64px] pointer-events-none">
      <div
        className={cn(
          'flex h-full items-center justify-center px-3 sm:px-6 transition-all duration-300',
          scrolled
            ? 'border-b border-[rgba(255,255,255,0.07)] bg-[rgba(10,10,11,0.80)] backdrop-blur-[28px]'
            : 'border-b border-transparent bg-transparent'
        )}
      >
        {/* Horizontally centered search bar */}
        <div className="pointer-events-auto flex items-center justify-center w-full max-w-[500px]">
          <SearchBox />
        </div>
      </div>
    </div>
  )
}
