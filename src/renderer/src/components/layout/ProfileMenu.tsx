import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Heart, LogOut, Settings, UserRound } from 'lucide-react'
import { cn } from '@/lib/cn'
import { popover } from '@/lib/motion'
import { useAuthStore } from '@/store/useAuthStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useUIStore } from '@/store/useUIStore'

/** Avatar menu — circular profile control, glass popover. */
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
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const displayName = user
    ? user.name && user.name !== 'Jio Viewer' && user.name !== 'Demo Viewer'
      ? user.name
      : 'Profile'
    : null

  return (
    <div ref={containerRef} className="relative no-drag">
      <button
        type="button"
        onClick={() => (user ? setOpen((v) => !v) : openLogin('Sign in to start watching.'))}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={displayName ?? 'Profile'}
        title={displayName ?? (status === 'authenticating' ? 'Connecting…' : 'Sign in')}
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-full border transition-all duration-[120ms]',
          open
            ? 'border-[rgba(255,255,255,0.24)] bg-white/[0.10] text-[#F4F4F5]'
            : 'border-[rgba(255,255,255,0.07)] bg-[#111113] text-[#A1A1A6] hover:border-[rgba(255,255,255,0.18)] hover:bg-[#18181B] hover:text-[#F4F4F5]'
        )}
      >
        <UserRound className="h-4 w-4" />
      </button>

      <AnimatePresence>
        {open && user ? (
          <div className="absolute left-1/2 top-[calc(100%+8px)] z-50 -translate-x-1/2">
            <motion.div
              role="menu"
              variants={popover}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="glass w-[240px] overflow-hidden rounded-[12px] p-2"
            >
            {/* User identity */}
            <div className="flex items-center gap-3 rounded-[8px] bg-white/[0.04] px-3 py-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#18181B] text-[#A1A1A6]">
                <UserRound className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-[600] text-[#F4F4F5]">{displayName}</p>
                <p className="truncate text-[12px] text-[#A1A1A6]">
                  +91 ••••• {user.phone.slice(-5)} · {user.mode === 'demo' ? 'Demo' : 'JioTV'}
                </p>
              </div>
            </div>

            <div className="mt-1.5 space-y-0.5">
              {[
                { icon: Heart, label: 'My List', action: () => { setOpen(false); navigate('/favorites') } },
                { icon: Settings, label: 'Settings', action: () => { setOpen(false); navigate('/settings') } }
              ].map(({ icon: Icon, label, action }) => (
                <button
                  key={label}
                  type="button"
                  role="menuitem"
                  onClick={action}
                  className="flex w-full items-center gap-3 rounded-[8px] px-3 py-2 text-left text-[13px] text-[#A1A1A6] transition-colors duration-[120ms] hover:bg-white/[0.06] hover:text-[#F4F4F5]"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}

              <div className="my-1.5 h-px bg-[rgba(255,255,255,0.07)]" />

              <button
                type="button"
                role="menuitem"
                onClick={async () => {
                  setOpen(false)
                  await signOut(mode)
                  pushToast({ title: 'Signed out', description: 'Demo mode stays available offline.', variant: 'info' })
                }}
                className="flex w-full items-center gap-3 rounded-[8px] px-3 py-2 text-left text-[13px] text-[#F87171] transition-colors duration-[120ms] hover:bg-[#F87171]/10"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
    </div>
  )
}
