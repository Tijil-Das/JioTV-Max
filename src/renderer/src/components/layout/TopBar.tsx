import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { SearchBox } from './SearchBox'
import { ProfileMenu } from './ProfileMenu'
import { WindowControls } from './WindowControls'

/**
 * 64px top bar. Transparent over the hero; glass at 80% + hairline when scrolled.
 * Integrated standard Windows window controls at the far right.
 * Drag region allows moving the window by dragging empty bar space.
 */
export function TopBar(): JSX.Element {
  const location = useLocation()
  const online = useOnline()
  const channels = useChannelStore((state) => state.channels)
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

        {/* Left: search bar */}
        <div className="no-drag flex items-center">
          <SearchBox />
        </div>

        {/* Middle: draggable empty spacer */}
        <div className="min-w-0 flex-1" />

        {/* Right: profile circle + window controls */}
        <div className="no-drag flex h-full shrink-0 items-center gap-3">
          <ProfileMenu />
          <WindowControls className="ml-1" />
        </div>
      </div>
    </div>
  )
}
