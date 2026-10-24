import { Link, useLocation } from 'react-router-dom'
import { Film, Heart, Home, Settings, Trophy, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

interface NavTab {
  label: string
  to: string
  icon: LucideIcon
}

const TABS: NavTab[] = [
  { label: 'Home', to: '/', icon: Home },
  { label: 'Sports', to: '/category/sports', icon: Trophy },
  { label: 'Movies', to: '/category/movies', icon: Film },
  { label: 'My List', to: '/favorites', icon: Heart },
  { label: 'Settings', to: '/settings', icon: Settings }
]

function isActive(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/'
  return pathname === to || pathname.startsWith(`${to}/`)
}

export function MobileNavBar(): JSX.Element {
  const location = useLocation()

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-0 inset-x-0 z-40 sm:hidden flex h-[54px] items-center justify-around border-t border-[rgba(255,255,255,0.08)] bg-[#0A0A0B]/95 px-2 backdrop-blur-xl shadow-[0_-8px_24px_rgba(0,0,0,0.85)]"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon
        const active = isActive(location.pathname, tab.to)

        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={cn(
              'relative flex flex-1 flex-col items-center justify-center py-1 transition-colors duration-150',
              active ? 'text-[#F4F4F5]' : 'text-[#8A8A91] hover:text-[#A1A1A6]'
            )}
          >
            {active && (
              <span className="absolute top-0 h-[2px] w-6 rounded-full bg-[#E11D2E]" />
            )}
            <Icon
              className={cn(
                'h-5 w-5 transition-transform duration-150',
                active ? 'scale-105 text-[#E11D2E]' : 'text-[#8A8A91]'
              )}
              strokeWidth={active ? 2.2 : 1.8}
            />
            <span
              className={cn(
                'mt-1 text-[10px] tracking-tight leading-none',
                active ? 'font-[650] text-[#F4F4F5]' : 'font-[450] text-[#8A8A91]'
              )}
            >
              {tab.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
