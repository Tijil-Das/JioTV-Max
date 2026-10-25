import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, useReducedMotion } from 'framer-motion'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useOnline } from '@/hooks/useOnline'
import { authService } from '@/services/authService'
import { getBridge } from '@/services/api'
import { popularityEngine } from '@/services/popularityEngine'
import { channelService } from '@/services/channelService'
import { streamProbe } from '@/services/streamProbe'
import { useAuthStore } from '@/store/useAuthStore'
import { useChannelStore } from '@/store/useChannelStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useUIStore } from '@/store/useUIStore'
import { triggerAuthExpired } from '@/lib/authErrorHandler'
import { useRelayStore } from '@/store/useRelayStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { AppShell } from '@/components/layout/AppShell'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { LoginModal } from '@/components/auth/LoginModal'
import { HowToUseModal } from '@/components/ui/HowToUseModal'
import { ToastViewport } from '@/components/ui/Toasts'
import { UpdateBanner } from '@/components/ui/UpdateBanner'
import { SplashScreen } from '@/components/ui/SplashScreen'
// import { initRecordingSubscriptions } from '@/store/useRecordingStore'
// import { RecordDialog } from '@/components/recording/RecordDialog'
// import { RecordingCentreModal } from '@/components/recording/RecordingCentreModal'
// import { DesktopCaptureProvider } from '@/components/recording/DesktopCaptureProvider'
import { HomePage } from '@/pages/HomePage'
import { CategoryPage } from '@/pages/CategoryPage'
import { FavoritesPage } from '@/pages/FavoritesPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { PlayerPage } from '@/pages/PlayerPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { DevLogosPage } from '@/pages/DevLogosPage'

const titles: Record<string, string> = {
  '/': 'Home',
  '/guide': 'TV Guide',
  '/favorites': 'My List',
  '/settings': 'Settings',
  '/dev/logos': 'Logo audit'
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
  const setMode = useSettingsStore((state) => state.setMode)
  const alwaysOnTop = useSettingsStore((state) => state.alwaysOnTop)
  const fetchCatalogue = useChannelStore((state) => state.fetchCatalogue)
  const user = useAuthStore((state) => state.user)
  const setSession = useAuthStore((state) => state.setSession)
  const status = useAuthStore((state) => state.status)
  const pushToast = useUIStore((state) => state.pushToast)
  const openLogin = useUIStore((state) => state.openLogin)
  const openHowToUse = useUIStore((state) => state.openHowToUse)
  const setRelayBase = useRelayStore((state) => state.setRelayBase)

  /** True while the app is still bootstrapping (relay init + session + catalogue). */
  const [splashVisible, setSplashVisible] = useState(true)

  const restoredRef = useRef(false)
  const previousOnlineRef = useRef(online)

  // ── Bootstrap sequence ──────────────────────────────────────────────
  useEffect(() => {
    async function bootstrap(): Promise<void> {
      // Increment app open counter on each launch
      useSettingsStore.getState().incrementOpenCount()

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

      // Step 2: restore persisted Jio session if present in main process
      let hasValidSession = false
      if (bridge) {
        try {
          const session = await authService.restore('jio')
          if (session?.user) {
            setSession(session)
            setMode('jio')
            hasValidSession = true
          } else {
            // Main process has no valid session in secure store; clear renderer stale state
            useAuthStore.setState({ user: null, status: 'anonymous', lastError: null })
          }
        } catch {
          useAuthStore.setState({ user: null, status: 'anonymous', lastError: null })
        }
      } else {
        hasValidSession = status === 'authenticated' && user?.mode === 'jio'
      }

      // Step 3: fetch channel catalogue
      const catalogueMode = hasValidSession ? 'jio' : (mode === 'jio' ? 'jio' : 'demo')
      try {
        await fetchCatalogue(catalogueMode)
      } catch {
        if (!hasValidSession) {
          try {
            await fetchCatalogue('demo')
          } catch {
            // non-fatal
          }
        }
      }

      // Step 3b: If hero is enabled, preload the active hero stream during splash screen
      const currentSettings = useSettingsStore.getState()
      if (currentSettings.showHero && currentSettings.livePreviewOnHome) {
        try {
          const channels = useChannelStore.getState().channels
          const epg = useChannelStore.getState().epg
          const ranked = popularityEngine.rankChannels(channels, epg, {
            allowedLanguages: ['English', 'Hindi'],
            topN: 15
          })
          for (const candidate of ranked) {
            try {
              const stream = await channelService.getStream(
                candidate.channel,
                catalogueMode,
                currentSettings.defaultQuality
              )
              if (stream) {
                streamProbe.setStreamHandoff(candidate.channel.id, stream)
                break
              }
            } catch {
              // Not entitled / not in user's plan or stream failed
              streamProbe.markFailure(candidate.channel.id)
            }
          }
        } catch (err) {
          // console.warn('[bootstrap] hero preloading error', err)
        }
      }

      // Minimum splash duration for a polished feel
      await new Promise<void>((r) => setTimeout(r, 600))
      setSplashVisible(false)

      const { hasClearedHowToUse, openCount } = useSettingsStore.getState()

      // If user has a valid active session or has launched before, mark onboarding as cleared
      if (hasValidSession || openCount > 1) {
        if (!hasClearedHowToUse) {
          useSettingsStore.getState().setHasClearedHowToUse(true)
        }
      } else if (!hasClearedHowToUse) {
        // Brand-new users with no session see the "How to Use" info panel first
        setTimeout(() => {
          openHowToUse()
        }, 120)
      } else {
        // Step 4: if not authenticated with a JioTV account, pop the login panel automatically
        setTimeout(() => {
          openLogin('Sign in with your JioTV number to start watching.')
        }, 120)
      }
    }

    void bootstrap()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Recording subscriptions ──────────────────────────────────────────
  // useEffect(() => {
  //   const offRecording = initRecordingSubscriptions()
  //   return () => offRecording()
  // }, [])

  // ── Session & token expiration listener ──────────────────────────────
  useEffect(() => {
    const bridge = getBridge()
    if (!bridge?.auth?.onExpired) return
    const unsubscribe = bridge.auth.onExpired(({ reason }) => {
      // console.warn('[App] Main process reported auth expiration:', reason)
      triggerAuthExpired(reason)
    })
    return unsubscribe
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
        description: 'Please check your internet connection to continue streaming.',
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

  // ── Global fullscreen state sync ─────────────────────────────────────
  useEffect(() => {
    const onFullscreen = () => {
      usePlayerStore.getState().setFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', onFullscreen)
    const off = getBridge()?.onFullscreenChange((fs) => {
      usePlayerStore.getState().setFullscreen(fs)
    })
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen)
      off?.()
    }
  }, [])

  // ── Route leave watcher: exit fullscreen when leaving player ─────────
  useEffect(() => {
    if (!location.pathname.startsWith('/watch')) {
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined)
      }
      void getBridge()?.setFullscreen(false).catch(() => undefined)
      usePlayerStore.getState().setFullscreen(false)
    }
  }, [location.pathname])

  // ── Track last non-watch route for player back navigation ────────────
  useEffect(() => {
    if (!location.pathname.startsWith('/watch')) {
      const fullPath = location.pathname + location.search
      useUIStore.getState().setLastBrowsePath(fullPath)
    }
  }, [location.pathname, location.search])

  // ── Window title ─────────────────────────────────────────────────────
  useEffect(() => {
    const path = location.pathname
    const title = path.startsWith('/watch/')
      ? 'Watching'
      : path.startsWith('/category/')
        ? path.replace('/category/', '').replace(/^\w/, (c) => c.toUpperCase())
        : titles[path] ?? 'JioTv Max'
    document.title = `${title} · JioTv Max`
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
              <Route path="/guide" element={<Navigate to="/" replace />} />
              <Route path="/favorites" element={<FavoritesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              {import.meta.env.DEV ? (
                <Route path="/dev/logos" element={<DevLogosPage />} />
              ) : null}
              <Route path="/watch/:channelId" element={<PlayerPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </AnimatePresence>
        </AppShell>
        <HowToUseModal />
        <LoginModal />
        {/* <RecordDialog /> */}
        {/* <RecordingCentreModal /> */}
        <ToastViewport />
        <UpdateBanner />
        {/* <DesktopCaptureProvider /> */}
      </ErrorBoundary>
    </MotionConfig>
  )
}
