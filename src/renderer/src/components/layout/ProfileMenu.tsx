import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Heart, LogOut, Settings, UserRound } from 'lucide-react'
import { cn } from '@/lib/cn'
import { popover, tween } from '@/lib/motion'
import { useAuthStore } from '@/store/useAuthStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useUIStore } from '@/store/useUIStore'

/** Avatar menu with account state, My List, Settings and sign-out. */
export function ProfileMenu(): JSX.Element {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const status = useAuthStore((state) => state.status)
  const signOut = useAuthStore((state) => state.signOut)
  const mode = useSettingsStore((state) => state.mode)
  const openLogin = useUIStore((state) => state.openLogin)
  const pushToast = useUIStore((state) => state.pushToast)

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const initials = user?.name?.slice(0, 1).toUpperCase() ?? null

  return (
    <div ref={containerRef} className="relative no-drag">
      <button
        type="button"
        onClick={() => (user ? setOpen((value) => !value) : openLogin('Sign in to start watching.'))}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'flex h-11 items-center gap-2 rounded-2xl border px-2.5 transition-colors duration-200',
          open ? 'border-white/20 bg-white/[0.08]' : 'border-white/[0.07] bg-white/[0.035] hover:border-white/15'
        )}
      >
        <span
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold text-white',
            user ? 'bg-accent-gradient' : 'bg-white/[0.08] text-text-secondary'
          )}
        >
          {initials ?? <UserRound className="h-3.5 w-3.5" />}
        </span>
        <span className="hidden max-w-[110px] truncate text-[12px] font-medium text-text-secondary lg:block">
          {user ? user.name : status === 'authenticating' ? 'Connecting…' : 'Sign in'}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-text-muted transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && user ? (
          <motion.div
            role="menu"
            variants={popover}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="glass-strong absolute right-0 top-[calc(100%+10px)] z-50 w-[260px] overflow-hidden rounded-panel p-2"
          >
            <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-gradient font-display text-[14px] font-bold text-white">
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-text-primary">{user.name}</p>
                <p className="truncate text-[11px] text-text-muted">
                  +91 ••••• {user.phone.slice(-5)} · {user.mode === 'demo' ? 'Demo' : 'JioTV'}
                </p>
              </div>
            </div>

            <div className="mt-1.5 space-y-0.5">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  navigate('/favorites')
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <Heart className="h-4 w-4" />
                My List
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  navigate('/settings')
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <Settings className="h-4 w-4" />
                Settings
              </button>
              <div className="my-1 h-px bg-white/[0.06]" />
              <button
                type="button"
                role="menuitem"
                onClick={async () => {
                  setOpen(false)
                  await signOut(mode)
                  pushToast({ title: 'Signed out', description: 'Demo mode stays available offline.', variant: 'info' })
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] text-danger transition-colors hover:bg-danger/10"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>

            <div className="mt-1 border-t border-white/[0.06] px-3 pt-2.5">
              <p className="text-[10px] text-text-muted">
                StreamDeck TV · {mode === 'demo' ? 'Demo catalogue' : 'JioTV account'}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
