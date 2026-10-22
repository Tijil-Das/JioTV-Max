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
import { QUALITY_OPTIONS } from '@/lib/constants'
import { getBridge } from '@/services/api'
import { useAuthStore } from '@/store/useAuthStore'
import { useChannelStore } from '@/store/useChannelStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useSettingsStore, type QualityPreference } from '@/store/useSettingsStore'
import { useUIStore } from '@/store/useUIStore'
import { PageTransition } from '@/components/ui/StateView'
import { Button } from '@/components/ui/Button'
import { SegmentedControl, Toggle } from '@/components/ui/Controls'

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
    <section className={cn('rounded-[16px] border border-[rgba(255,255,255,0.07)] bg-[#0A0A0B] p-6', className)}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-[rgba(255,255,255,0.07)] bg-[#111113] text-[#A1A1A6]">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="font-sans text-[15px] font-[600] text-[#F4F4F5]">{title}</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-[#66666C]">{description}</p>
        </div>
      </div>
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  )
}

const selectClass =
  'h-11 w-full rounded-[8px] border border-[rgba(255,255,255,0.07)] bg-[#111113] px-3 text-[13px] text-[#A1A1A6] outline-none transition-colors duration-[120ms] hover:border-[rgba(255,255,255,0.14)] focus:border-[rgba(225,29,46,0.55)]'

/** Playback, account, appearance, data and keyboard settings. */
export function SettingsPage(): JSX.Element {
  const navigate = useNavigate()
  const mode = useSettingsStore((state) => state.mode)
  const setMode = useSettingsStore((state) => state.setMode)
  const defaultQuality = useSettingsStore((state) => state.defaultQuality)
  const setDefaultQuality = useSettingsStore((state) => state.setDefaultQuality)
  const reduceMotion = useSettingsStore((state) => state.reduceMotion)
  const setReduceMotion = useSettingsStore((state) => state.setReduceMotion)
  const autoplay = useSettingsStore((state) => state.autoplay)
  const setAutoplay = useSettingsStore((state) => state.setAutoplay)
  const alwaysOnTop = useSettingsStore((state) => state.alwaysOnTop)
  const setAlwaysOnTop = useSettingsStore((state) => state.setAlwaysOnTop)
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

  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    void getBridge()
      ?.getAppInfo()
      .then(setAppInfo)
      .catch(() => undefined)
  }, [])

  const bridge = getBridge()

  const changeMode = async (next: 'demo' | 'jio'): Promise<void> => {
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
          ? 'Playing the bundled demo catalogue.'
          : 'Loading your live JioTV catalogue.',
      variant: 'info'
    })
  }

  const changeQuality = (value: QualityPreference): void => {
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
        {/* ── Playback ─────────────────────────────────────────────────── */}
        <Section
          icon={<MonitorPlay className="h-4 w-4" />}
          title="Playback"
          description="How StreamDeck opens channels and chooses a stream quality."
        >
          <div>
            <p className="mb-2 text-[12px] font-[500] text-[#A1A1A6]">Catalogue source</p>
            <SegmentedControl
              ariaLabel="Catalogue source"
              value={mode}
              onChange={(value) => void changeMode(value)}
              options={[
                { value: 'demo', label: 'Demo catalogue' },
                { value: 'jio', label: 'JioTV account' }
              ]}
            />
            <p className="mt-2 text-[11px] leading-relaxed text-[#66666C]">
              {mode === 'demo'
                ? 'Ships with a curated demo channel line-up. Works entirely offline.'
                : 'Loads your live JioTV catalogue with real-time streams.'}
            </p>
          </div>

          <div>
            <label htmlFor="quality" className="mb-2 block text-[12px] font-[500] text-[#A1A1A6]">
              Default quality
            </label>
            <select
              id="quality"
              value={String(defaultQuality)}
              onChange={(e) =>
                changeQuality(e.target.value === 'auto' ? 'auto' : Number(e.target.value))
              }
              className={selectClass}
            >
              {QUALITY_OPTIONS.map((option) => (
                <option key={option.label} value={String(option.value)}>
                  {option.label} — {option.note}
                </option>
              ))}
            </select>
            <p className="mt-2 text-[11px] text-[#66666C]">
              The player starts at this level when the stream offers it.
            </p>
          </div>

          <Toggle
            id="autoplay"
            checked={autoplay}
            onChange={setAutoplay}
            label="Autoplay when opening a channel"
            description="Start playback immediately instead of showing the paused frame."
          />
        </Section>

        {/* ── Account ──────────────────────────────────────────────────── */}
        <Section
          icon={<UserRound className="h-4 w-4" />}
          title="Account"
          description="Sign in to unlock the full JioTV catalogue. Tokens stay encrypted on this device."
        >
          {user ? (
            <div className="rounded-[12px] border border-[rgba(255,255,255,0.07)] bg-[#111113] p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-[#18181B] text-[15px] font-[700] text-[#A1A1A6]">
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-[600] text-[#F4F4F5]">{user.name}</p>
                  <p className="truncate text-[11px] text-[#66666C]">
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
            <div className="rounded-[12px] border border-[rgba(255,255,255,0.07)] bg-[#111113] p-4">
              <p className="text-[13px] font-[500] text-[#F4F4F5]">No account linked</p>
              <p className="mt-1 text-[12px] leading-relaxed text-[#66666C]">
                {status === 'authenticating'
                  ? 'A sign-in attempt is in progress.'
                  : 'Sign in with a JioTV mobile number to access live channels.'}
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

          <div className="flex items-start gap-3 rounded-[12px] border border-[rgba(255,255,255,0.07)] bg-[#111113] p-4 text-[11.5px] leading-relaxed text-[#66666C]">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[#A1A1A6]" />
            Tokens are sealed with your OS keystore (DPAPI on Windows). Never written to localStorage or logs.
          </div>
        </Section>

        {/* ── Appearance ───────────────────────────────────────────────── */}
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
            description="Disables hero rotation, card lifts and spring transitions. System preference is respected either way."
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

        {/* ── Data & storage ───────────────────────────────────────────── */}
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

        {/* ── Keyboard shortcuts ───────────────────────────────────────── */}
        <Section
          icon={<Keyboard className="h-4 w-4" />}
          title="Keyboard shortcuts"
          description="The player is fully drivable without a mouse."
        >
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {shortcuts.map(([keys, description]) => (
              <li
                key={keys}
                className="flex items-center justify-between gap-3 rounded-[8px] border border-[rgba(255,255,255,0.07)] bg-[#111113] px-3 py-2"
              >
                <span className="text-[12px] text-[#A1A1A6]">{description}</span>
                <kbd className="rounded-[6px] border border-[rgba(255,255,255,0.07)] bg-[#18181B] px-2 py-0.5 font-sans text-[10.5px] text-[#F4F4F5]">
                  {keys}
                </kbd>
              </li>
            ))}
          </ul>
        </Section>

        {/* ── About ────────────────────────────────────────────────────── */}
        <Section
          icon={<Info className="h-4 w-4" />}
          title="About"
          description="Version and runtime details for support."
        >
          <dl className="space-y-1.5 text-[12px]">
            {[
              ['Application', `StreamDeck TV ${appInfo?.version ?? '1.0.0'}`],
              ['Runtime', appInfo ? `Electron ${appInfo.electron} · ${appInfo.platform}` : 'Browser preview'],
              ['Backend', bridge ? 'Electron bridge · loopback media relay' : 'Browser fallback · demo data'],
              ['Relay', appInfo?.relayBase ?? '—'],
              ['Playback', 'shaka-player for DASH + Widevine · hls.js for HLS'],
              ['Guide', 'JioTV EPG with deterministic offline fallback']
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-6 border-b border-[rgba(255,255,255,0.05)] pb-1.5">
                <dt className="text-[#66666C]">{label}</dt>
                <dd className="text-right text-[#A1A1A6]">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex items-center gap-2 text-[11px] text-[#66666C]">
            <Cpu className="h-3.5 w-3.5" />
            Hardware decoding follows your GPU and codec support.
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[#66666C]">
            <Sparkles className="h-3.5 w-3.5" />
            Widevine playback requires an Electron build bundled with a CDM.
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[#66666C]">
            <Gauge className="h-3.5 w-3.5" />
            Media relay keeps manifests, segments and licence requests on loopback.
          </div>
        </Section>
      </div>
    </PageTransition>
  )
}
