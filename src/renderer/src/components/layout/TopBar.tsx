import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { APP_NAME, CATEGORY_META, PAGE_TITLES } from '@/lib/constants'
import { useChannelStore } from '@/store/useChannelStore'
import { useOnline } from '@/hooks/useOnline'
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

  // Only show the page title — no subtitles under row titles
  const title = useMemo(() => {
    const path = location.pathname
    if (path === '/') return ''  // Home: no top bar title, hero speaks for itself
    if (path.startsWith('/category/')) {
      const category = path.replace('/category/', '') as keyof typeof CATEGORY_META
      return CATEGORY_META[category]?.label ?? 'Channels'
    }
    if (path.startsWith('/guide')) return 'TV Guide'
    if (path.startsWith('/favorites')) return 'My List'
    if (path.startsWith('/settings')) return 'Settings'
    return PAGE_TITLES[path] ?? APP_NAME
  }, [location.pathname])

  const isHome = location.pathname === '/'

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
        {/* Left: page title (if not home) + search bar */}
        <div className="no-drag flex items-center gap-5">
          {!isHome && title ? (
            <h1 className="min-w-0 truncate text-[20px] font-[600] tracking-[-0.01em] text-[#F4F4F5]">
              {title}
            </h1>
          ) : null}
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
