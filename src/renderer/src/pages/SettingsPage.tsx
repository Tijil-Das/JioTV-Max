import { useNavigate } from 'react-router-dom'
import {
  Keyboard,
  LogOut,
  MonitorPlay,
  ShieldCheck,
  UserRound
} from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useUIStore } from '@/store/useUIStore'
import { PageTransition } from '@/components/ui/StateView'
import { Button } from '@/components/ui/Button'
import { Toggle } from '@/components/ui/Controls'
import { cn } from '@/lib/cn'

function Section({
  icon,
  title,
  description,
  children,
  className
}: {
  icon: JSX.Element
  title: string
  description: string
  children: React.ReactNode
  className?: string
}): JSX.Element {
  return (
    <section
      className={cn(
        'rounded-[20px] border border-[rgba(255,255,255,0.08)] bg-[#0C0C0E] p-7 shadow-sm transition-all',
        className
      )}
    >
      <div className="flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[#141417] text-[#A1A1A6]">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="font-sans text-[16px] font-[650] text-[#F4F4F5]">{title}</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[#A1A1A6]">{description}</p>
        </div>
      </div>
      <div className="mt-6 space-y-6">{children}</div>
    </section>
  )
}

/** Account, home presentation, and keyboard settings. */
export function SettingsPage(): JSX.Element {
  const navigate = useNavigate()
  const showHero = useSettingsStore((state) => state.showHero)
  const setShowHero = useSettingsStore((state) => state.setShowHero)
  const setLivePreviewOnHome = useSettingsStore((state) => state.setLivePreviewOnHome)

  const user = useAuthStore((state) => state.user)
  const status = useAuthStore((state) => state.status)
  const signOut = useAuthStore((state) => state.signOut)

  const openLogin = useUIStore((state) => state.openLogin)
  const pushToast = useUIStore((state) => state.pushToast)

  const shortcuts = [
    ['Space', 'Play or pause'],
    ['↑ / ↓', 'Previous or next channel'],
    ['← / →', 'Volume down or up'],
    ['F', 'Toggle fullscreen'],
    ['M', 'Mute or unmute'],
    ['C', 'Channel drawer'],
    ['Q', 'Quality menu'],
    ['Ctrl K', 'Search channels and programs'],
    ['Esc', 'Back / exit fullscreen']
  ]

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl px-8 pb-16 pt-[96px]">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="font-sans text-[28px] font-bold tracking-tight text-[#F4F4F5]">
            Settings
          </h1>
          <p className="mt-1 text-[14px] text-[#A1A1A6]">
            Configure your JioTV streaming preferences and linked account.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-7 lg:grid-cols-2">
          {/* ── Account ──────────────────────────────────────────────────── */}
          <Section
            icon={<UserRound className="h-5 w-5" />}
            title="Account"
            description="Manage your linked JioTV account and session security."
          >
            {user ? (
              <div className="rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-[#141417] p-5">
                <div className="flex items-center gap-3.5">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-[#1C1C20] text-[#F4F4F5]">
                    <UserRound className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-[650] text-[#F4F4F5]">
                      {user.name && user.name !== 'Jio Viewer' && user.name !== 'Demo Viewer'
                        ? user.name
                        : 'JioTV Subscriber'}
                    </p>
                    <p className="truncate text-[12px] font-medium text-[#A1A1A6]">
                      +91 ••••• {user.phone.slice(-5)} · Active session
                    </p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Button variant="secondary" size="sm" onClick={() => navigate('/favorites')}>
                    Open My List
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<LogOut className="h-3.5 w-3.5" />}
                    onClick={async () => {
                      await signOut('jio')
                      pushToast({
                        title: 'Signed out',
                        description: 'Sign in again to continue watching live channels.',
                        variant: 'info'
                      })
                    }}
                  >
                    Sign out
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-[#141417] p-5">
                <p className="text-[14px] font-[600] text-[#F4F4F5]">No account linked</p>
                <p className="mt-1 text-[13px] leading-relaxed text-[#A1A1A6]">
                  {status === 'authenticating'
                    ? 'A sign-in attempt is currently in progress.'
                    : 'Sign in with your registered JioTV mobile number to watch live television.'}
                </p>
                <Button
                  variant="primary"
                  className="mt-5"
                  icon={<ShieldCheck className="h-4 w-4" />}
                  onClick={() => openLogin('Connect your JioTV account to unlock live streams.')}
                >
                  Sign in with JioTV
                </Button>
              </div>
            )}

          </Section>

          {/* ── Playback ─────────────────────────────────────────────────── */}
          <Section
            icon={<MonitorPlay className="h-5 w-5" />}
            title="Playback"
            description="Control home featured presentation and live stream preview."
          >
            <Toggle
              id="show-hero"
              checked={showHero}
              onChange={(enabled) => {
                setShowHero(enabled)
                setLivePreviewOnHome(enabled)
              }}
              label="Show Hero section"
              description="Display the featured marquee sports and news carousel with live muted streaming at the top of Home."
            />
          </Section>

          {/* ── Keyboard shortcuts ───────────────────────────────────────── */}
          <Section
            icon={<Keyboard className="h-5 w-5" />}
            title="Keyboard shortcuts"
            description="Quick reference for player and navigation hotkeys."
            className="lg:col-span-2"
          >
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shortcuts.map(([keys, description]) => (
                <li
                  key={keys}
                  className="flex items-center justify-between gap-3 rounded-[10px] border border-[rgba(255,255,255,0.06)] bg-[#141417] px-4 py-3"
                >
                  <span className="text-[13px] font-medium text-[#A1A1A6]">{description}</span>
                  <kbd className="rounded-[6px] border border-[rgba(255,255,255,0.1)] bg-[#1C1C20] px-2.5 py-1 font-mono text-[11px] font-semibold text-[#F4F4F5] shadow-inner">
                    {keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </PageTransition>
  )
}
