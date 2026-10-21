import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Cpu,
  Database,
  Gauge,
  Info,
  Keyboard,
  LockKeyhole,
  LogOut,
  MonitorPlay,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  Wand2
} from 'lucide-react'
import type { AppInfo } from '@shared/types'
import { cn } from '@/lib/cn'
import { LANGUAGES, QUALITY_OPTIONS } from '@/lib/constants'
import { getBridge } from '@/services/api'
import { sha256Hex } from '@/lib/hash'
import { useAuthStore } from '@/store/useAuthStore'
import { useChannelStore } from '@/store/useChannelStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useSettingsStore, type QualityPreference } from '@/store/useSettingsStore'
import { useUIStore } from '@/store/useUIStore'
import { PageTransition } from '@/components/ui/StateView'
import { Button } from '@/components/ui/Button'
import { SegmentedControl, Toggle } from '@/components/ui/Controls'
import { PinDialog } from '@/components/settings/PinDialog'

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
    <section className={cn('glass rounded-panel p-6', className)}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-accent-glow">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[15px] font-semibold text-white">{title}</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-text-muted">{description}</p>
        </div>
      </div>
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  )
}

const selectClass =
  'h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-[13px] text-text-secondary outline-none transition-colors hover:border-white/20 focus:border-accent/50'

/** Playback, account, appearance, parental and data controls. */
export function SettingsPage(): JSX.Element {
  const navigate = useNavigate()
  const mode = useSettingsStore((state) => state.mode)
  const setMode = useSettingsStore((state) => state.setMode)
  const defaultQuality = useSettingsStore((state) => state.defaultQuality)
  const setDefaultQuality = useSettingsStore((state) => state.setDefaultQuality)
  const language = useSettingsStore((state) => state.language)
  const setLanguage = useSettingsStore((state) => state.setLanguage)
  const reduceMotion = useSettingsStore((state) => state.reduceMotion)
  const setReduceMotion = useSettingsStore((state) => state.setReduceMotion)
  const autoplay = useSettingsStore((state) => state.autoplay)
  const setAutoplay = useSettingsStore((state) => state.setAutoplay)
  const alwaysOnTop = useSettingsStore((state) => state.alwaysOnTop)
  const setAlwaysOnTop = useSettingsStore((state) => state.setAlwaysOnTop)
  const parentalEnabled = useSettingsStore((state) => state.parentalEnabled)
  const parentalPinHash = useSettingsStore((state) => state.parentalPinHash)
  const setParental = useSettingsStore((state) => state.setParental)
  const recentSearches = useSettingsStore((state) => state.recentSearches)
  const clearRecentSearches = useSettingsStore((state) => state.clearRecentSearches)

  const user = useAuthStore((state) => state.user)
  const status = useAuthStore((state) => state.status)
  const signOut = useAuthStore((state) => state.signOut)
  const clearRecents = useChannelStore((state) => state.clearRecents)
  const clearFavorites = useChannelStore((state) => state.clearFavorites)
  const fetchCatalogue = useChannelStore((state) => state.fetchCatalogue)
  const setPlayerQuality = usePlayerStore((state) => state.setQuality)

  const openLogin = useUIStore((state) => state.openLogin)
  const pushToast = useUIStore((state) => state.pushToast)

  const [pinDialog, setPinDialog] = useState<'set' | 'verify' | null>(null)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    void getBridge()
      ?.getAppInfo()
      .then(setAppInfo)
      .catch(() => undefined)
  }, [])

  const bridge = getBridge()

  const changeMode = async (next: 'demo' | 'jio') => {
    if (next === mode) return
    if (next === 'jio' && status !== 'authenticated') {
      openLogin('Sign in with your JioTV number to switch to the live catalogue.')
      return
    }
    setMode(next)
    await fetchCatalogue(next, true)
    pushToast({
      title: next === 'demo' ? 'Demo mode' : 'JioTV mode',
      description:
        next === 'demo'
          ? 'Playing the bundled demo catalogue and sample streams.'
          : 'Loading your live JioTV catalogue.',
      variant: 'info'
    })
  }

  const changeQuality = (value: QualityPreference) => {
    setDefaultQuality(value)
    setPlayerQuality(value)
  }

  const shortcuts = [
    ['Space', 'Play or pause'],
    ['↑ / ↓', 'Previous or next channel'],
    ['← / →', 'Volume down or up'],
    ['F', 'Toggle fullscreen'],
    ['M', 'Mute or unmute'],
    ['C', 'Channel drawer'],
    ['Q', 'Quality menu'],
    ['Ctrl K', 'Search everything'],
    ['Esc', 'Back / exit fullscreen']
  ]

  return (
    <PageTransition>
      <div className="grid grid-cols-1 gap-6 px-8 pb-12 pt-[92px] xl:grid-cols-2">
        <Section
          icon={<MonitorPlay className="h-4 w-4" />}
          title="Playback"
          description="How StreamDeck opens channels and chooses a stream quality."
        >
          <div>
            <p className="mb-2 text-[12px] font-medium text-text-secondary">Catalogue source</p>
            <SegmentedControl
              ariaLabel="Catalogue source"
              value={mode}
              onChange={(value) => void changeMode(value)}
              options={[
                { value: 'demo', label: 'Demo catalogue' },
                { value: 'jio', label: 'JioTV account' }
              ]}
            />
            <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
              {mode === 'demo'
                ? 'Ships with a curated channel line-up and public HLS test streams. Works entirely offline.'
                : 'Loads the live JioTV catalogue and resolves protected streams through the desktop backend.'}
            </p>
          </div>

          <div>
            <label htmlFor="quality" className="mb-2 block text-[12px] font-medium text-text-secondary">
              Default quality
            </label>
            <select
              id="quality"
              value={String(defaultQuality)}
              onChange={(event) =>
                changeQuality(event.target.value === 'auto' ? 'auto' : Number(event.target.value))
              }
              className={selectClass}
            >
              {QUALITY_OPTIONS.map((option) => (
                <option key={option.label} value={String(option.value)}>
                  {option.label} — {option.note}
                </option>
              ))}
            </select>
            <p className="mt-2 text-[11px] text-text-muted">
              The player starts at this level when the stream offers it, then you can pin any level.
            </p>
          </div>

          <div>
            <label htmlFor="language" className="mb-2 block text-[12px] font-medium text-text-secondary">
              Preferred language
            </label>
            <select
              id="language"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              className={selectClass}
            >
              {LANGUAGES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <Toggle
            id="autoplay"
            checked={autoplay}
            onChange={setAutoplay}
            label="Autoplay when opening a channel"
            description="Start playback immediately instead of showing the paused frame. Buffering still never bypasses the DRM gate."
          />
        </Section>

        <Section
          icon={<UserRound className="h-4 w-4" />}
          title="Account"
          description="Sign in to unlock the full JioTV catalogue. Tokens stay encrypted on this device."
        >
          {user ? (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-gradient font-display text-[15px] font-bold text-white">
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-white">{user.name}</p>
                  <p className="truncate text-[11px] text-text-muted">
                    +91 ••••• {user.phone.slice(-5)} · {user.mode === 'demo' ? 'Demo account' : 'JioTV account'}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => navigate('/favorites')}>
                  Open My List
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  icon={<LogOut className="h-3.5 w-3.5" />}
                  onClick={async () => {
                    await signOut(mode)
                    pushToast({ title: 'Signed out', description: 'Demo mode remains available.', variant: 'info' })
                  }}
                >
                  Sign out
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
              <p className="text-[13px] font-medium text-white">No account linked</p>
              <p className="mt-1 text-[12px] leading-relaxed text-text-muted">
                {status === 'authenticating'
                  ? 'A sign-in attempt is in progress.'
                  : 'Sign in with a JioTV mobile number, or keep using the demo catalogue offline.'}
              </p>
              <Button
                variant="primary"
                className="mt-4"
                icon={<ShieldCheck className="h-4 w-4" />}
                onClick={() => openLogin('Connect your JioTV account to unlock every channel.')}
              >
                Sign in with JioTV
              </Button>
            </div>
          )}

          <div className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4 text-[11.5px] leading-relaxed text-text-muted">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-accent-alt" />
            Tokens are sealed with your operating system keystore (DPAPI on Windows). They are
            never written to localStorage, logs or crash reports.
          </div>
        </Section>

        <Section
          icon={<Wand2 className="h-4 w-4" />}
          title="Appearance & motion"
          description="Tune how lively the interface feels on this machine."
        >
          <Toggle
            id="reduce-motion"
            checked={reduceMotion}
            onChange={setReduceMotion}
            label="Reduce motion"
            description="Disables hero rotation, card lifts and spring transitions. Your system preference is respected either way."
          />
          <Toggle
            id="always-on-top"
            checked={alwaysOnTop}
            disabled={!bridge}
            onChange={async (value) => {
              setAlwaysOnTop(value)
              if (bridge) await bridge.setAlwaysOnTop(value)
              else
                pushToast({
                  title: 'Desktop only',
                  description: 'Always-on-top is available in the Electron app.',
                  variant: 'info'
                })
            }}
            label="Keep the window on top"
            description="Useful when watching a match while working. Uses the native Electron window level."
          />
        </Section>

        <Section
          icon={<LockKeyhole className="h-4 w-4" />}
          title="Parental controls"
          description="Require a PIN before opening channels in the Kids category. The PIN is stored only as a salted hash."
        >
          <Toggle
            id="parental"
            checked={parentalEnabled}
            onChange={(value) => setPinDialog(value ? 'set' : 'verify')}
            label="Kids category lock"
            description={
              parentalPinHash
                ? 'A PIN is configured on this device.'
                : 'No PIN configured yet — choose one to enable the lock.'
            }
          />
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-success" />
            Locked categories ask for the PIN before playback starts.
          </div>
        </Section>

        <Section
          icon={<Database className="h-4 w-4" />}
          title="Data & storage"
          description="Everything lives locally. Clear it whenever you like."
        >
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={() => {
                clearRecents()
                pushToast({ title: 'Viewing history cleared', variant: 'success' })
              }}
            >
              Clear viewing history
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={() => {
                clearFavorites()
                pushToast({ title: 'My List cleared', variant: 'success' })
              }}
            >
              Clear My List
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={recentSearches.length === 0}
              onClick={() => {
                clearRecentSearches()
                pushToast({ title: 'Recent searches cleared', variant: 'success' })
              }}
            >
              Clear recent searches
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={async () => {
                await fetchCatalogue(mode, true)
                pushToast({ title: 'Catalogue refreshed', variant: 'success' })
              }}
            >
              Refresh catalogue
            </Button>
          </div>
        </Section>

        <Section
          icon={<Keyboard className="h-4 w-4" />}
          title="Keyboard shortcuts"
          description="The player is fully drivable without a mouse."
        >
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {shortcuts.map(([keys, description]) => (
              <li
                key={keys}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2"
              >
                <span className="text-[12px] text-text-secondary">{description}</span>
                <kbd className="rounded-md border border-white/10 bg-white/[0.06] px-2 py-0.5 font-sans text-[10.5px] text-text-primary">
                  {keys}
                </kbd>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          icon={<Info className="h-4 w-4" />}
          title="About"
          description="Version and runtime details for support."
        >
          <dl className="space-y-1.5 text-[12px]">
            {[
              ['Application', `StreamDeck TV ${appInfo?.version ?? '1.0.0'}`],
              ['Runtime', appInfo ? `Electron ${appInfo.electron} · ${appInfo.platform}` : 'Browser preview'],
              [
                'Backend',
                bridge ? 'Electron bridge connected · loopback media relay' : 'Browser fallback · demo data'
              ],
              ['Playback', 'hls.js for HLS · shaka-player for DASH + Widevine'],
              ['Guide', 'JioTV EPG with deterministic offline fallback']
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-6 border-b border-white/[0.05] pb-1.5">
                <dt className="text-text-muted">{label}</dt>
                <dd className="text-right text-text-secondary">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <Cpu className="h-3.5 w-3.5" />
            Hardware decoding follows your GPU and codec support.
          </div>
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <Sparkles className="h-3.5 w-3.5" />
            Widevine playback requires an Electron build bundled with a CDM.
          </div>
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <Gauge className="h-3.5 w-3.5" />
            Media relay keeps manifests, segments and licence requests on loopback.
          </div>
        </Section>
      </div>

      <PinDialog
        open={pinDialog === 'set'}
        onClose={() => setPinDialog(null)}
        title="Set a parental PIN"
        description="You will be asked for it before kids channels start."
        requireConfirmation
        onSubmit={async (pin) => {
          const hash = await sha256Hex(`streamdeck:${pin}`)
          setParental(true, hash)
          pushToast({ title: 'Parental lock enabled', variant: 'success' })
          return null
        }}
      />
      <PinDialog
        open={pinDialog === 'verify'}
        onClose={() => setPinDialog(null)}
        title="Enter your PIN"
        description="Confirm your PIN to turn the lock off."
        onSubmit={async (pin) => {
          const hash = await sha256Hex(`streamdeck:${pin}`)
          if (!parentalPinHash || hash !== parentalPinHash) return 'Incorrect PIN.'
          setParental(false, '')
          pushToast({ title: 'Parental lock disabled', variant: 'success' })
          return null
        }}
      />
    </PageTransition>
  )
}
