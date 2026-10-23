import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2,
  LogOut,
  MonitorPlay,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UserRound
} from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useUIStore } from '@/store/useUIStore'
import { PageTransition } from '@/components/ui/StateView'
import { Button } from '@/components/ui/Button'
import { Toggle } from '@/components/ui/Controls'
import { getBridge } from '@/services/api'
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

  const [currentVersion, setCurrentVersion] = useState<string>('1.0.0')
  const [readyVersion, setReadyVersion] = useState<string | null>(null)
  const [checking, setChecking] = useState<boolean>(false)
  const [checkMessage, setCheckMessage] = useState<string | null>(null)

  useEffect(() => {
    // 1. Fetch current application version from main process bridge
    const bridge = getBridge()
    if (bridge) {
      bridge
        .getAppInfo()
        .then((info) => {
          if (info?.version) setCurrentVersion(info.version)
        })
        .catch(() => {})
    }

    // 2. Fetch updater state to check for already downloaded update
    if (window.updater) {
      window.updater
        .getState()
        .then((state) => {
          if (state?.readyVersion) {
            setReadyVersion(state.readyVersion)
          }
        })
        .catch(() => {})

      // 3. Listen for update completion while settings page is open
      window.updater.onReady((newVer) => {
        setReadyVersion(newVer)
        pushToast({
          title: `Update v${newVer} ready`,
          description: 'Restart JioTV Max to apply the update.',
          variant: 'info'
        })
      })
    }
  }, [pushToast])

  const handleCheckUpdates = async (): Promise<void> => {
    if (checking) return
    setChecking(true)
    setCheckMessage('Checking for updates…')

    try {
      if (window.updater?.check) {
        const res = await window.updater.check()
        if (res.status === 'ready' && res.readyVersion) {
          setReadyVersion(res.readyVersion)
          setCheckMessage(`Update v${res.readyVersion} is downloaded and ready to apply.`)
        } else if (res.status === 'update-available' && res.version) {
          setCheckMessage(`Update v${res.version} found! Downloading in the background…`)
        } else if (res.status === 'up-to-date') {
          setCheckMessage('You are on the latest version. JioTV Max is up to date.')
        } else if (res.status === 'dev-mode') {
          setCheckMessage('Development build: Auto-updater runs in packaged desktop releases.')
        } else if (res.error) {
          setCheckMessage(res.error)
        } else {
          setCheckMessage('You are on the latest version.')
        }
      } else {
        await new Promise((r) => setTimeout(r, 600))
        setCheckMessage('You are on the latest version.')
      }
    } catch {
      setCheckMessage('Unable to check for updates. Please check your network connection.')
    } finally {
      setChecking(false)
    }
  }


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
          <section className="rounded-[20px] border border-[rgba(255,255,255,0.08)] bg-[#0C0C0E] p-7 shadow-sm transition-all">
            {user ? (
              <>
                <div className="flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#1C1C20] text-[#F4F4F5]">
                    <UserRound className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-sans text-[16px] font-[650] text-[#F4F4F5]">
                      {user.name && user.name !== 'Jio Viewer' && user.name !== 'Demo Viewer'
                        ? user.name
                        : 'JioTV Subscriber'}
                    </h2>
                    <p className="mt-1 text-[13px] text-[#A1A1A6]">
                      +91 ••••• {user.phone.slice(-5)} · Active session
                    </p>
                  </div>
                </div>
                <div className="mt-6 flex flex-wrap items-center gap-3">
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
              </>
            ) : (
              <>
                <div className="flex items-start gap-3.5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[#141417] text-[#A1A1A6]">
                    <UserRound className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-sans text-[16px] font-[650] text-[#F4F4F5]">Account</h2>
                    <p className="mt-1 text-[13px] leading-relaxed text-[#A1A1A6]">
                      {status === 'authenticating'
                        ? 'A sign-in attempt is currently in progress.'
                        : 'Sign in with your registered JioTV mobile number to watch live television.'}
                    </p>
                  </div>
                </div>
                <div className="mt-6">
                  <Button
                    variant="primary"
                    icon={<ShieldCheck className="h-4 w-4" />}
                    onClick={() => openLogin('Connect your JioTV account to unlock live streams.')}
                  >
                    Sign in with JioTV
                  </Button>
                </div>
              </>
            )}
          </section>

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

          {/* ── App Updates ──────────────────────────────────────────────── */}
          <Section
            icon={<Sparkles className="h-5 w-5" />}
            title="App Updates"
            description="View current app version, check for new releases, and restart to apply updates."
            className="lg:col-span-2"
          >
            {/* Current Version & Check for Updates Card */}
            <div className="rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-[#141417] p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3.5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-white/10 bg-[#1C1C20] text-emerald-400">
                    <CheckCircle2 className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <p className="text-[15px] font-[650] text-[#F4F4F5]">
                        JioTV Max <span className="font-mono text-[13px] font-semibold text-white/90">v{currentVersion}</span>
                      </p>
                      <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                        {readyVersion ? 'Update Ready' : 'Current Release'}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-[#A1A1A6]">
                      {checkMessage ?? 'Automatic background updates are active. Background polling checks every 20 minutes.'}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<RefreshCw className={cn('h-3.5 w-3.5', checking && 'animate-spin')} />}
                    disabled={checking}
                    onClick={handleCheckUpdates}
                  >
                    {checking ? 'Checking…' : 'Check for updates'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Restart to Update Space */}
            <div className="rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-[#141417] p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3.5">
                  <span
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border transition-colors',
                      readyVersion
                        ? 'border-[var(--red)]/40 bg-[var(--red)]/15 text-[var(--red)]'
                        : 'border-white/10 bg-[#1C1C20] text-[#A1A1A6]'
                    )}
                  >
                    <RotateCcw className={cn('h-5 w-5', readyVersion && 'animate-pulse')} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <p className="text-[14px] font-[650] text-[#F4F4F5]">Restart to update</p>
                      {readyVersion ? (
                        <span className="rounded-full bg-[var(--red)]/20 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--red)]">
                          Update v{readyVersion} ready
                        </span>
                      ) : (
                        <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-[#71717A]">
                          No pending restart
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-[#A1A1A6]">
                      {readyVersion
                        ? `Update v${readyVersion} is downloaded and waiting. Restart now to complete the update.`
                        : 'When a background update completes downloading, this button activates to restart and apply it.'}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center">
                  <Button
                    variant={readyVersion ? 'primary' : 'secondary'}
                    size="sm"
                    icon={<RotateCcw className="h-3.5 w-3.5" />}
                    disabled={!readyVersion}
                    onClick={() => {
                      window.updater?.restart()
                    }}
                    className={cn(!readyVersion && 'cursor-not-allowed opacity-40')}
                  >
                    Restart to update
                  </Button>
                </div>
              </div>
            </div>
          </Section>


        </div>
      </div>
    </PageTransition>
  )
}
