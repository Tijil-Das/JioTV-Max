import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, useReducedMotion } from 'framer-motion'
import { Route, Routes, useLocation } from 'react-router-dom'
import { useOnline } from '@/hooks/useOnline'
import { authService } from '@/services/authService'
import { getBridge } from '@/services/api'
import { useAuthStore } from '@/store/useAuthStore'
import { useChannelStore } from '@/store/useChannelStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useUIStore } from '@/store/useUIStore'
import { useRelayStore } from '@/store/useRelayStore'
import { AppShell } from '@/components/layout/AppShell'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { LoginModal } from '@/components/auth/LoginModal'
import { ToastViewport } from '@/components/ui/Toasts'
import { SplashScreen } from '@/components/ui/SplashScreen'
import { HomePage } from '@/pages/HomePage'
import { CategoryPage } from '@/pages/CategoryPage'
import { GuidePage } from '@/pages/GuidePage'
import { FavoritesPage } from '@/pages/FavoritesPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { PlayerPage } from '@/pages/PlayerPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

const titles: Record<string, string> = {
  '/': 'Home',
  '/guide': 'TV Guide',
  '/favorites': 'My List',
  '/settings': 'Settings'
}

/**
 * Application root: bootstrap effects, route table and global overlays.
 * On first launch the splash screen hides all chrome while we:
 *  1. Fetch appInfo (relay base URL)
 *  2. Restore any persisted Jio session
 *  3. Fetch the channel catalogue
 * Once those three steps complete the splash fades out. If no session exists
 * the login modal opens automatically.
 */
export default function App(): JSX.Element {
  const location = useLocation()
  const online = useOnline()
  const prefersReducedMotion = useReducedMotion()
  const reduceMotion = useSettingsStore((state) => state.reduceMotion)
  const mode = useSettingsStore((state) => state.mode)
  const alwaysOnTop = useSettingsStore((state) => state.alwaysOnTop)
  const fetchCatalogue = useChannelStore((state) => state.fetchCatalogue)
  const seedRecentsIfEmpty = useChannelStore((state) => state.seedRecentsIfEmpty)
  const setSession = useAuthStore((state) => state.setSession)
  const status = useAuthStore((state) => state.status)
  const pushToast = useUIStore((state) => state.pushToast)
  const openLogin = useUIStore((state) => state.openLogin)
  const setRelayBase = useRelayStore((state) => state.setRelayBase)

  /** True while the app is still bootstrapping (relay init + session + catalogue). */
  const [splashVisible, setSplashVisible] = useState(true)

  const restoredRef = useRef(false)
  const previousOnlineRef = useRef(online)

  // ── Bootstrap sequence ──────────────────────────────────────────────
  useEffect(() => {
    async function bootstrap(): Promise<void> {
      const bridge = getBridge()

      // Step 1: fetch relay base URL from appInfo
      if (bridge) {
        try {
          const info = await bridge.getAppInfo()
          if (info.relayBase) setRelayBase(info.relayBase)
        } catch {
          // non-fatal
        }
      }

      // Step 2: restore persisted session (JioTV mode only)
      let hasSession = status === 'authenticated'
      if (!hasSession && mode === 'jio' && !restoredRef.current) {
        restoredRef.current = true
        try {
          const session = await authService.restore('jio')
          if (session) {
            setSession(session)
            hasSession = true
          }
        } catch {
          // non-fatal — fall through to login prompt
        }
      }

      // Step 3: fetch channel catalogue
      try {
        await fetchCatalogue(mode)
      } catch {
        // non-fatal
      }

      // Step 4: show login if still unauthenticated in JioTV mode
      if (mode === 'jio' && !hasSession) {
        openLogin('Sign in with your JioTV number to start watching.')
      }

      // Minimum splash duration for a polished feel
      await new Promise<void>((r) => setTimeout(r, 800))
      setSplashVisible(false)
    }

    void bootstrap()
    seedRecentsIfEmpty()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Native window preferences ────────────────────────────────────────
  useEffect(() => {
    const bridge = getBridge()
    if (bridge) void bridge.setAlwaysOnTop(alwaysOnTop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Connectivity messaging ───────────────────────────────────────────
  useEffect(() => {
    if (previousOnlineRef.current && !online) {
      pushToast({
        title: 'You are offline',
        description: 'StreamDeck keeps the demo catalogue available while you reconnect.',
        variant: 'error',
        duration: 5000
      })
    } else if (!previousOnlineRef.current && online) {
      pushToast({
        title: 'Back online',
        description: 'Live channels will refresh in the background.',
        variant: 'success'
      })
    }
    previousOnlineRef.current = online
  }, [online, pushToast])

  // ── Browser F11 fallback ─────────────────────────────────────────────
  useEffect(() => {
    if (getBridge()) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'F11') {
        event.preventDefault()
        if (document.fullscreenElement) void document.exitFullscreen()
        else void document.documentElement.requestFullscreen().catch(() => undefined)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // ── Window title ─────────────────────────────────────────────────────
  useEffect(() => {
    const path = location.pathname
    const title = path.startsWith('/watch/')
      ? 'Watching'
      : path.startsWith('/category/')
        ? path.replace('/category/', '').replace(/^\w/, (c) => c.toUpperCase())
        : titles[path] ?? 'StreamDeck TV'
    document.title = `${title} · StreamDeck TV`
  }, [location.pathname])

  return (
    <MotionConfig reducedMotion={reduceMotion || prefersReducedMotion ? 'always' : 'user'}>
      <ErrorBoundary>
        {/* Splash covers everything until bootstrap finishes */}
        <SplashScreen visible={splashVisible} />

        <AppShell>
          <AnimatePresence mode="wait" initial={false}>
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={<HomePage />} />
              <Route path="/category/:category" element={<CategoryPage />} />
              <Route path="/guide" element={<GuidePage />} />
              <Route path="/favorites" element={<FavoritesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/watch/:channelId" element={<PlayerPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </AnimatePresence>
        </AppShell>
        <LoginModal />
        <ToastViewport />
      </ErrorBoundary>
    </MotionConfig>
  )
}
