import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Heart, LogOut, Settings, UserRound } from 'lucide-react'
import { cn } from '@/lib/cn'
import { popover } from '@/lib/motion'
import { useAuthStore } from '@/store/useAuthStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useUIStore } from '@/store/useUIStore'

/** Avatar menu — single profile control, glass popover, no gradient avatar. */
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

  const initials = user?.name?.slice(0, 1).toUpperCase() ?? null

  return (
    <div ref={containerRef} className="relative no-drag">
      <button
        type="button"
        onClick={() => (user ? setOpen((v) => !v) : openLogin('Sign in to start watching.'))}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'flex h-10 items-center gap-2 rounded-[8px] border px-2.5 transition-colors duration-[120ms]',
          open
            ? 'border-[rgba(255,255,255,0.14)] bg-white/[0.07]'
            : 'border-[rgba(255,255,255,0.07)] bg-transparent hover:border-[rgba(255,255,255,0.14)] hover:bg-white/[0.05]'
        )}
      >
        {/* Avatar — neutral monogram on surface-3, no gradient */}
        <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-[#18181B] text-[11px] font-[700] text-[#A1A1A6]">
          {initials ?? <UserRound className="h-3.5 w-3.5" />}
        </span>
        <span className="hidden max-w-[100px] truncate text-[13px] font-[500] text-[#A1A1A6] lg:block">
          {user ? user.name : status === 'authenticating' ? 'Connecting…' : 'Sign in'}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-[#66666C] transition-transform duration-[120ms]', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && user ? (
          <motion.div
            role="menu"
            variants={popover}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="glass absolute right-0 top-[calc(100%+8px)] z-50 w-[240px] overflow-hidden rounded-[12px] p-2"
          >
            {/* User identity — no gradient avatar */}
            <div className="flex items-center gap-3 rounded-[8px] bg-white/[0.04] px-3 py-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-[#18181B] text-[14px] font-[700] text-[#A1A1A6]">
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-[600] text-[#F4F4F5]">{user.name}</p>
                <p className="truncate text-[11px] text-[#66666C]">
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
        ) : null}
      </AnimatePresence>
    </div>
  )
}
