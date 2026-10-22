import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Clapperboard,
  Film,
  Heart,
  Home,
  LayoutGrid,
  Newspaper,
  Settings,
  Trophy,
  UserRound,
  type LucideIcon
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { GUIDE_NAV, NAV_ITEMS } from '@/lib/constants'
import { tween } from '@/lib/motion'
import { useAuthStore } from '@/store/useAuthStore'
import { useUIStore } from '@/store/useUIStore'
import appIcon from '@/assets/icons/app-icon-128.png'

const icons: Record<string, LucideIcon> = {
  home: Home,
  sports: Trophy,
  news: Newspaper,
  movies: Film,
  settings: Settings,
  heart: Heart,
  guide: LayoutGrid
}

function isActive(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/'
  return pathname === to || pathname.startsWith(`${to}/`)
}

/**
 * 72px icon rail. Expands to 220px on hover.
 * Active state: 2px red left bar + text-1. No filled background behind active icon.
 * Icons: 20px, 1.5px stroke, text-3 default → text-1 on hover.
 */
export function Sidebar(): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const status = useAuthStore((state) => state.status)
  const openLogin = useUIStore((state) => state.openLogin)

  const items = [
    ...NAV_ITEMS,
    { label: GUIDE_NAV.label, to: GUIDE_NAV.to, icon: 'guide' as const },
    { label: 'Settings', to: '/settings', icon: 'settings' as const }
  ]

  return (
    <div className="relative z-40 w-[72px] shrink-0" onMouseLeave={() => setExpanded(false)}>
      <motion.nav
        aria-label="Primary"
        onMouseEnter={() => setExpanded(true)}
        animate={{ width: expanded ? 220 : 72 }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
        className={cn(
          'absolute inset-y-0 left-0 flex flex-col overflow-hidden',
          'bg-[#0A0A0B] border-r border-[rgba(255,255,255,0.07)]'
        )}
      >
        {/* Logo area */}
        <div className="flex h-[64px] items-center px-[22px]">
          <Link to="/" aria-label="JioTv Max home" className="flex items-center gap-3">
            <img
              src={appIcon}
              alt=""
              className="h-7 w-7 shrink-0 rounded-[6px] object-contain drop-shadow-[0_2px_8px_rgba(157,12,165,0.3)]"
            />
            <AnimatePresence>
              {expanded ? (
                <motion.span
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={tween(0.15)}
                  className="whitespace-nowrap text-[14px] font-[700] tracking-tight text-[#F4F4F5]"
                >
                  JioTv <span className="text-[#B815C2]">Max</span>
                </motion.span>
              ) : null}
            </AnimatePresence>
          </Link>
        </div>

        {/* Nav items */}
        <ul className="mt-1 flex flex-1 flex-col gap-0.5 px-2">
          {items.map((item) => {
            const Icon = icons[item.icon] ?? Clapperboard
            const active = isActive(location.pathname, item.to)
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group relative flex h-10 items-center gap-3 rounded-[8px] px-3 transition-colors duration-[120ms]',
                    active
                      ? 'text-[#F4F4F5]'
                      : 'text-[#66666C] hover:text-[#F4F4F5] hover:bg-white/[0.05]'
                  )}
                >
                  {/* 2px red left bar when active — no filled background */}
                  {active ? (
                    <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-[#E11D2E]" />
                  ) : null}

                  <Icon
                    className="h-5 w-5 shrink-0"
                    strokeWidth={active ? 2 : 1.5}
                  />

                  <AnimatePresence>
                    {expanded ? (
                      <motion.span
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -4 }}
                        transition={tween(0.13)}
                        className="whitespace-nowrap text-[13px] font-[500]"
                      >
                        {item.label}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                  {!expanded ? <span className="sr-only">{item.label}</span> : null}
                </Link>
              </li>
            )
          })}
        </ul>

        {/* Profile row */}
        <div className="px-2 pb-4">
          <button
            type="button"
            onClick={() => openLogin('Sign in to sync your JioTV account.')}
            className={cn(
              'flex w-full items-center gap-3 rounded-[8px] px-3 py-2.5 text-left',
              'border border-[rgba(255,255,255,0.07)] bg-transparent',
              'hover:bg-white/[0.05] transition-colors duration-[120ms]'
            )}
          >
            {/* Avatar — monogram on neutral surface, no gradient */}
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[#18181B] text-[11px] font-[700] text-[#A1A1A6]">
              {user ? user.name.slice(0, 1).toUpperCase() : <UserRound className="h-4 w-4" />}
            </span>

            {expanded ? (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="min-w-0 flex-1"
              >
                <span className="block truncate text-[12px] font-[500] text-[#F4F4F5]">
                  {user ? user.name : 'Sign in'}
                </span>
                <span className="block truncate text-[11px] text-[#66666C]">
                  {user
                    ? `+91 ••••• ${user.phone.slice(-5)}`
                    : status === 'authenticating'
                      ? 'Connecting…'
                      : 'JioTV or demo account'}
                </span>
              </motion.span>
            ) : null}
          </button>
        </div>
      </motion.nav>
    </div>
  )
}
