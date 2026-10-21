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
import { springSnappy, tween } from '@/lib/motion'
import { useAuthStore } from '@/store/useAuthStore'
import { useUIStore } from '@/store/useUIStore'
import { BrandMark } from '@/components/ui/BrandMark'

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
 * Icon rail that expands over the content on hover (76 → 220px).
 * The active indicator is a shared `layoutId` so it glides between items.
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
    <div className="relative z-40 w-[76px] shrink-0" onMouseLeave={() => setExpanded(false)}>
      <motion.nav
        aria-label="Primary"
        onMouseEnter={() => setExpanded(true)}
        animate={{ width: expanded ? 220 : 76 }}
        transition={springSnappy}
        className={cn(
          'absolute inset-y-0 left-0 flex flex-col overflow-hidden border-r border-white/[0.05]',
          'bg-[linear-gradient(to_right,rgba(12,12,17,.94),rgba(8,8,12,.82))] backdrop-blur-2xl',
          expanded && 'shadow-[24px_0_60px_-30px_rgba(0,0,0,.9)]'
        )}
      >
        <div className="flex h-[72px] items-center px-6">
          <Link to="/" aria-label="StreamDeck TV home" className="flex items-center gap-3">
            <BrandMark size={24} />
            <AnimatePresence>
              {expanded ? (
                <motion.span
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={tween(0.18)}
                  className="whitespace-nowrap font-display text-[14px] font-semibold text-text-primary"
                >
                  StreamDeck
                </motion.span>
              ) : null}
            </AnimatePresence>
          </Link>
        </div>

        <ul className="mt-2 flex flex-1 flex-col gap-1 px-3">
          {items.map((item) => {
            const Icon = icons[item.icon] ?? Clapperboard
            const active = isActive(location.pathname, item.to)
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group relative flex h-11 items-center rounded-xl px-3 transition-colors duration-200',
                    active ? 'text-white' : 'text-text-muted hover:text-text-secondary'
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId="sidebar-active"
                      transition={springSnappy}
                      className="absolute inset-0 rounded-xl border border-white/[0.08] bg-white/[0.07]"
                    />
                  ) : null}
                  <span
                    className={cn(
                      'relative flex h-6 w-6 items-center justify-center transition-transform duration-200',
                      active && 'text-accent-glow'
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.8} />
                  </span>
                  <AnimatePresence>
                    {expanded ? (
                      <motion.span
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -4 }}
                        transition={tween(0.16)}
                        className="ml-3 whitespace-nowrap text-[13px] font-medium"
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

        <div className="px-3 pb-5">
          <button
            type="button"
            onClick={() => openLogin('Sign in to sync your JioTV account.')}
            className="flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5 text-left transition-colors hover:bg-white/[0.07]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-gradient text-[11px] font-bold text-white">
              {user ? user.name.slice(0, 1).toUpperCase() : <UserRound className="h-4 w-4" />}
            </span>
            {expanded ? (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="min-w-0 flex-1"
              >
                <span className="block truncate text-[12px] font-medium text-text-primary">
                  {user ? user.name : 'Sign in'}
                </span>
                <span className="block truncate text-[10px] text-text-muted">
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
