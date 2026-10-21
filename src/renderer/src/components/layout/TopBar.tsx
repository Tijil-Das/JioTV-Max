import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { CATEGORY_META, PAGE_TITLES } from '@/lib/constants'
import { useChannelStore } from '@/store/useChannelStore'
import { useOnline } from '@/hooks/useOnline'
import { SearchBox } from './SearchBox'
import { ProfileMenu } from './ProfileMenu'

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * Sticky top bar. Transparent over the hero at rest, glass once the page
 * scrolls. It is pulled over the content with a negative margin so the home
 * hero can bleed underneath it.
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

  const { title, subtitle } = useMemo(() => {
    const path = location.pathname
    if (path === '/') {
      return {
        title: greeting(new Date().getHours()),
        subtitle: online
          ? `${channels.length} channels · live now`
          : 'Offline · demo catalogue cached'
      }
    }
    if (path.startsWith('/category/')) {
      const category = path.replace('/category/', '') as keyof typeof CATEGORY_META
      const meta = CATEGORY_META[category]
      return { title: meta?.label ?? 'Channels', subtitle: meta?.description ?? 'Browse live channels' }
    }
    if (path.startsWith('/guide')) return { title: 'TV Guide', subtitle: 'Everything on air for the next 24 hours' }
    if (path.startsWith('/favorites')) return { title: 'My List', subtitle: 'Channels you keep coming back to' }
    if (path.startsWith('/settings')) return { title: 'Settings', subtitle: 'Playback, account and appearance' }
    return { title: PAGE_TITLES[path] ?? 'StreamDeck TV', subtitle: 'Live television, beautifully staged.' }
  }, [channels.length, location.pathname, online])

  return (
    <div className="sticky top-0 z-30 -mb-[72px] h-[72px]">
      <div
        className={cn(
          'flex h-full items-center justify-between gap-6 px-8 transition-all duration-300',
          scrolled
            ? 'border-b border-white/[0.055] bg-[rgba(9,9,13,.72)] backdrop-blur-2xl'
            : 'border-b border-transparent bg-transparent'
        )}
      >
        <div className="min-w-0">
          <h1 className="truncate font-display text-[20px] font-semibold tracking-tight text-text-primary">
            {title}
          </h1>
          <p className="mt-0.5 truncate text-[12px] text-text-muted">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <SearchBox />
          <ProfileMenu />
        </div>
      </div>
    </div>
  )
}
