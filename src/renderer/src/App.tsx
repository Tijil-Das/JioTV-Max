import { useEffect, useRef } from 'react'
import { AnimatePresence, MotionConfig, useReducedMotion } from 'framer-motion'
import { Route, Routes, useLocation } from 'react-router-dom'
import { useOnline } from '@/hooks/useOnline'
import { authService } from '@/services/authService'
import { getBridge } from '@/services/api'
import { useAuthStore } from '@/store/useAuthStore'
import { useChannelStore } from '@/store/useChannelStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useUIStore } from '@/store/useUIStore'
import { AppShell } from '@/components/layout/AppShell'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { LoginModal } from '@/components/auth/LoginModal'
import { ToastViewport } from '@/components/ui/Toasts'
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
 * The shell (title bar, sidebar, top bar) persists across page transitions.
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

  const restoredRef = useRef(false)
  const previousOnlineRef = useRef(online)

  // Catalogue bootstrap and refresh when the source changes.
  useEffect(() => {
    void fetchCatalogue(mode)
  }, [fetchCatalogue, mode])

  useEffect(() => {
    seedRecentsIfEmpty()
  }, [seedRecentsIfEmpty])

  // Restore a persisted Jio session exactly once per launch.
  useEffect(() => {
    if (restoredRef.current || mode !== 'jio' || status === 'authenticated') return
    restoredRef.current = true
    void authService
      .restore('jio')
      .then((session) => {
        if (session) setSession(session)
      })
      .catch(() => undefined)
  }, [mode, setSession, status])

  // Native window preferences.
  useEffect(() => {
    const bridge = getBridge()
    if (bridge) void bridge.setAlwaysOnTop(alwaysOnTop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Connectivity messaging.
  useEffect(() => {
    if (previousOnlineRef.current && !online) {
      pushToast({
        title: 'You are offline',
        description: 'StreamDeck keeps the demo catalogue and guide available while you reconnect.',
        variant: 'error',
        duration: 5000
      })
    } else if (!previousOnlineRef.current && online) {
      pushToast({
        title: 'Back online',
        description: 'Live channels and EPG will refresh in the background.',
        variant: 'success'
      })
    }
    previousOnlineRef.current = online
  }, [online, pushToast])

  // Browser fallback for F11 when the Electron bridge is absent.
  useEffect(() => {
    if (getBridge()) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F11') {
        event.preventDefault()
        if (document.fullscreenElement) void document.exitFullscreen()
        else void document.documentElement.requestFullscreen().catch(() => undefined)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Window title mirrors the current page.
  useEffect(() => {
    const path = location.pathname
    const title = path.startsWith('/watch/')
      ? 'Watching'
      : path.startsWith('/category/')
        ? path.replace('/category/', '').replace(/^\w/, (char) => char.toUpperCase())
        : titles[path] ?? 'StreamDeck TV'
    document.title = `${title} · StreamDeck TV`
  }, [location.pathname])

  return (
    <MotionConfig reducedMotion={reduceMotion || prefersReducedMotion ? 'always' : 'user'}>
      <ErrorBoundary>
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
