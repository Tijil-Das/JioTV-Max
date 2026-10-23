import { app, BrowserWindow, ipcMain, Menu, net, powerSaveBlocker, protocol, shell } from 'electron'
import { promises as fs, readdirSync, existsSync, readFileSync, cpSync } from 'node:fs'
import { join as pathJoin } from 'node:path'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { AppInfo, AuthSession, ChannelFetchPayload, Result } from '@shared/types'
import { IPC } from '@shared/ipc'
import { JioService } from './jio-service'
import { MediaRelay } from './media-relay'
import { fetchAsset } from './asset-cache'
import { probeStage1 } from './stream-probe'
import { SecureStore } from './secure-store'
import { WindowStateStore } from './window-state'
import {
  initUpdater,
  applyPendingUpdateOnLaunch,
  closeInstallingPanel,
  isInstallingUpdate
} from './updater'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Must be called before app 'ready' - Crucial for EME / Widevine DRM
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
      allowServiceWorkers: true
    }
  }
])

// Hardware video decode, autoplay, and uninterrupted full-power background streaming.
// Prevent Chromium and Windows from throttling rendering, background timers, media pipelines,
// or lowering process/thread priority (e.g. EcoQoS / Efficiency Mode) when the window is minimized or occluded.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.commandLine.appendSwitch('disable-background-media-suspend')
app.commandLine.appendSwitch(
  'disable-features',
  [
    'CalculateNativeWinOcclusion',
    'IntensiveWakeUpThrottling',
    'QuickIntensiveWakeUpThrottlingAfterLoading',
    'ExpensiveBackgroundTimerThrottling',
    'ThrottleDisplayNoneAndVisibilityHiddenCrossOriginIframes',
    'BackgroundVideoTrackOptimization',
    'BackgroundVideoPauseOptimization',
    'UseEcoQoSForBackgroundProcess',
    'TimerThrottlingForBackgroundTabs'
  ].join(',')
)
app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', 'http://127.0.0.1,http://localhost')

// Dev-only: the renderer receives its content from the Vite dev server, so the
// production CSP in the built index.html cannot apply. The warning is noise in
// that mode; packaged builds keep the strict policy.
if (!app.isPackaged) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
}

let mainWindow: BrowserWindow | null = null
let appSuspensionBlockerId: number | null = null
let displaySleepBlockerId: number | null = null
let quitting = false

const relay = new MediaRelay()
const windowStateStore = new WindowStateStore(app.getPath('userData'))
const rendererTokenStore = new SecureStore('renderer-token.bin')
let jio: JioService

// Diagnostic: print which electron binary is running so we know if castLabs is active.
// console.log(`[Electron] execPath: ${process.execPath}`)

// castLabs Electron provides a 'components' module for Widevine CDM management.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const electronAny = require('electron') as any
const hasCastLabsComponents = Boolean(electronAny.components)

/**
 * For castLabs Electron: ensures the Widevine CDM component directory exists
 * in the application's userData folder by copying from local Chrome/Edge if needed.
 */
function ensureWidevineCdmInUserData(userDataDir: string): void {
  if (process.platform !== 'win32') return
  const targetBase = pathJoin(userDataDir, 'WidevineCdm')
  try {
    if (existsSync(targetBase)) {
      const existing = readdirSync(targetBase).filter((d) =>
        existsSync(pathJoin(targetBase, d, '_platform_specific', 'win_x64', 'widevinecdm.dll'))
      )
      if (existing.length > 0) {
        // console.log(`[CDM] Widevine CDM already present in userData (${existing[0]})`)
        return
      }
    }
  } catch {
    /* proceed to search and copy */
  }

  const localAppData = process.env.LOCALAPPDATA ?? ''
  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files'
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'

  const searchRoots = [
    pathJoin(programFiles, 'Google', 'Chrome', 'Application'),
    pathJoin(programFilesX86, 'Google', 'Chrome', 'Application'),
    pathJoin(localAppData, 'Google', 'Chrome', 'Application'),
    pathJoin(programFiles, 'Microsoft', 'Edge', 'Application'),
    pathJoin(programFilesX86, 'Microsoft', 'Edge', 'Application'),
    pathJoin(localAppData, 'Microsoft', 'Edge', 'Application'),
    'T:\\DevLibs\\hibbiki\\Chrome-bin'
  ]

  for (const root of searchRoots) {
    if (!root || !existsSync(root)) continue
    try {
      const versionDirs = readdirSync(root).filter((d) => /^\d+\.\d+\.\d+\.\d+$/.test(d))
      for (const version of versionDirs) {
        const cdmSource = pathJoin(root, version, 'WidevineCdm')
        const dllPath = pathJoin(cdmSource, '_platform_specific', 'win_x64', 'widevinecdm.dll')
        if (existsSync(dllPath)) {
          let cdmVersion = version
          const manifestPath = pathJoin(cdmSource, 'manifest.json')
          if (existsSync(manifestPath)) {
            try {
              const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { version?: string }
              if (manifest.version) cdmVersion = manifest.version
            } catch {
              /* fallback */
            }
          }
          const dest = pathJoin(targetBase, cdmVersion)
          // console.log(`[CDM] Copying Widevine CDM v${cdmVersion} to: ${dest}`)
          cpSync(cdmSource, dest, { recursive: true })
          return
        }
      }
    } catch (err) {
      // console.warn(`[CDM] Error checking ${root}:`, err)
    }
  }
}

// ---------------------------------------------------------------------------
// Widevine CDM Loader (Stock Electron fallback)
// ---------------------------------------------------------------------------
function tryLoadWidevineCdm(): void {
  if (process.platform !== 'win32') {
    // console.log('[CDM] Non-Windows platform — skipping Chrome CDM loader.')
    return
  }

  const localAppData = process.env.LOCALAPPDATA ?? ''
  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files'
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'

  const searchRoots = [
    pathJoin(programFiles, 'Google', 'Chrome', 'Application'),
    pathJoin(programFilesX86, 'Google', 'Chrome', 'Application'),
    pathJoin(localAppData, 'Google', 'Chrome', 'Application'),
    pathJoin(programFiles, 'Microsoft', 'Edge', 'Application'),
    pathJoin(programFilesX86, 'Microsoft', 'Edge', 'Application'),
    pathJoin(localAppData, 'Microsoft', 'Edge', 'Application'),
    'T:\\DevLibs\\hibbiki\\Chrome-bin'
  ]

  for (const root of searchRoots) {
    if (!root || !existsSync(root)) continue
    try {
      const versionDirs = readdirSync(root)
        .filter((d) => /^\d+\.\d+\.\d+\.\d+$/.test(d))
        .sort((a, b) => {
          const ap = a.split('.').map(Number)
          const bp = b.split('.').map(Number)
          for (let i = 0; i < 4; i++) {
            if ((ap[i] ?? 0) !== (bp[i] ?? 0)) return (bp[i] ?? 0) - (ap[i] ?? 0)
          }
          return 0
        })

      for (const version of versionDirs) {
        const cdmPath = pathJoin(
          root,
          version,
          'WidevineCdm',
          '_platform_specific',
          'win_x64',
          'widevinecdm.dll'
        )
        if (existsSync(cdmPath)) {
          let cdmVersion = version
          const manifestPath = pathJoin(root, version, 'WidevineCdm', 'manifest.json')
          if (existsSync(manifestPath)) {
            try {
              const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { version?: string }
              if (manifest.version) cdmVersion = manifest.version
            } catch {
              /* fallback */
            }
          }
          // console.log(`[CDM] Found Widevine CDM v${cdmVersion} (Chrome ${version}) at: ${cdmPath}`)
          app.commandLine.appendSwitch('widevine-cdm-path', cdmPath)
          app.commandLine.appendSwitch('widevine-cdm-version', cdmVersion)
          return
        }
      }
    } catch (err) {
      // console.warn(`[CDM] Error scanning ${root}:`, err)
    }
  }

  // console.warn(
    // '[CDM] Widevine CDM not found in Chrome or Edge. ' +
    // 'DRM channels will show Error 6001. ' +
    // 'Install Google Chrome or switch to @castlabs/electron-releases.'
  // )
}

if (hasCastLabsComponents) {
  // console.log('[CDM] castLabs Electron detected (components API available).')
  ensureWidevineCdmInUserData(app.getPath('userData'))
} else {
  tryLoadWidevineCdm()
}



const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

function isWindows11OrNewer(): boolean {
  if (process.platform !== 'win32') return false
  return Number(process.getSystemVersion().split('.')[0]) >= 10 && Number(process.getSystemVersion().split('.')[2] ?? 0) >= 22000
}

function getAppIconPath(): string {
  const isWin = process.platform === 'win32'
  const primary = isWin ? 'icon.ico' : 'icon.png'
  const fallback = isWin ? 'icon.png' : 'icon.ico'

  const candidates = [
    path.join(app.getAppPath(), 'build', primary),
    path.join(__dirname, '../../build', primary),
    path.join(process.resourcesPath, 'build', primary),
    path.join(process.resourcesPath, primary),
    path.join(app.getAppPath(), 'build', fallback),
    path.join(__dirname, '../../build', fallback)
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return path.join(__dirname, '../../build', primary)
}

async function createWindow(): Promise<void> {
  const state = await windowStateStore.load()
  const supportsMaterial = process.platform === 'win32' && isWindows11OrNewer()

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 480,
    minHeight: 320,
    show: false,
    title: 'JioTv Max',
    icon: getAppIconPath(),
    backgroundColor: supportsMaterial ? '#00000000' : '#050507',
    ...(supportsMaterial ? { backgroundMaterial: 'acrylic' as const } : {}),
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      spellcheck: false,
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
      devTools: false
    }
  })

  if (state.maximized) mainWindow.maximize()
  mainWindow.webContents.setBackgroundThrottling(false)
  Menu.setApplicationMenu(null)

  mainWindow.webContents.on('devtools-opened', () => {
    mainWindow?.webContents.closeDevTools()
  })

  mainWindow.webContents.on('context-menu', (event) => {
    event.preventDefault()
  })

  // Route any relative /logo/* requests directly to local MediaRelay
  mainWindow.webContents.session.webRequest.onBeforeRequest(
    { urls: ['http://localhost:*/*/logo/*', 'http://127.0.0.1:*/*/logo/*', 'http://localhost:*/logo/*', 'http://127.0.0.1:*/logo/*', 'app://*/logo/*'] },
    (details, callback) => {
      try {
        const u = new URL(details.url)
        if (u.pathname.startsWith('/logo')) {
          callback({ redirectURL: `http://127.0.0.1:${relay.port}${u.pathname}${u.search}` })
          return
        }
      } catch {
        // ignore
      }
      callback({})
    }
  )

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  const persist = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const maximized = mainWindow.isMaximized()
    const bounds = maximized ? mainWindow.getNormalBounds() : mainWindow.getBounds()
    windowStateStore.saveBounds(bounds, maximized)
  }
  mainWindow.on('resize', persist)
  mainWindow.on('move', persist)
  mainWindow.on('close', () => {
    if (isInstallingUpdate()) return
    persist()
  })

  const sendFullscreen = (val: boolean): void => {
    mainWindow?.webContents.send(IPC.fullscreenChanged, val)
  }
  mainWindow.on('enter-full-screen', () => {
    sendFullscreen(true)
    mainWindow?.webContents.send(IPC.windowMaximizedChanged, true)
  })
  mainWindow.on('leave-full-screen', () => {
    sendFullscreen(false)
    mainWindow?.webContents.send(IPC.windowMaximizedChanged, mainWindow?.isMaximized() ?? false)
  })
  mainWindow.on('enter-html-full-screen', () => {
    sendFullscreen(true)
    mainWindow?.webContents.send(IPC.windowMaximizedChanged, true)
  })
  mainWindow.on('leave-html-full-screen', () => {
    sendFullscreen(false)
    mainWindow?.webContents.send(IPC.windowMaximizedChanged, mainWindow?.isMaximized() ?? false)
  })

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send(IPC.windowMaximizedChanged, true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send(IPC.windowMaximizedChanged, false)
  })
  mainWindow.on('restore', () => {
    mainWindow?.webContents.invalidate()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl && url.startsWith(devUrl)) return
    if (url.startsWith('app://')) return
    event.preventDefault()
  })

  // Suppress DevTools, inspection shortcuts, and native reload; handle F11 fullscreen.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const key = input.key.toLowerCase()
    const ctrlOrMeta = input.control || input.meta
    if (
      key === 'f12' ||
      (ctrlOrMeta && input.shift && (key === 'i' || key === 'j' || key === 'c')) ||
      (ctrlOrMeta && key === 'u')
    ) {
      event.preventDefault()
      return
    }
    if (input.key === 'F11' && input.type === 'keyDown') {
      event.preventDefault()
      const next = !mainWindow?.isFullScreen()
      mainWindow?.setFullScreen(next)
      sendFullscreen(next)
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await mainWindow.loadURL('app://bundle/index.html')
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function registerIpc(): void {
  ipcMain.handle(IPC.appInfo, (): AppInfo => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    relayBase: `http://127.0.0.1:${relay.port}`
  }))

  ipcMain.handle(IPC.toggleFullscreen, (): boolean => {
    if (!mainWindow) return false
    const next = !mainWindow.isFullScreen()
    mainWindow.setFullScreen(next)
    mainWindow.webContents.send(IPC.fullscreenChanged, next)
    return next
  })

  ipcMain.handle(IPC.setFullscreen, (_event, value: boolean): boolean => {
    if (!mainWindow) return false
    const target = Boolean(value)
    mainWindow.setFullScreen(target)
    mainWindow.webContents.send(IPC.fullscreenChanged, target)
    return target
  })

  ipcMain.handle(IPC.windowMinimize, (): void => {
    mainWindow?.minimize()
  })

  ipcMain.handle(IPC.windowMaximize, (): boolean => {
    if (!mainWindow) return false
    if (mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false)
      mainWindow.webContents.send(IPC.fullscreenChanged, false)
      mainWindow.webContents.send(IPC.windowMaximizedChanged, mainWindow.isMaximized())
      return mainWindow.isMaximized()
    }
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
      return false
    } else {
      mainWindow.maximize()
      return true
    }
  })

  ipcMain.handle(IPC.windowClose, (): void => {
    mainWindow?.close()
  })

  ipcMain.handle(IPC.windowIsMaximized, (): boolean => {
    return Boolean(mainWindow?.isMaximized() || mainWindow?.isFullScreen())
  })

  ipcMain.handle(IPC.setAlwaysOnTop, (_event, value: boolean): boolean => {
    if (!mainWindow) return false
    mainWindow.setAlwaysOnTop(Boolean(value), 'floating')
    return mainWindow.isAlwaysOnTop()
  })

  ipcMain.handle(IPC.setPlayerActive, (_event, active: boolean): void => {
    if (active) {
      if (appSuspensionBlockerId === null) {
        // Prevent Windows OS from suspending network, timer threads or process execution when minimized
        appSuspensionBlockerId = powerSaveBlocker.start('prevent-app-suspension')
      }
      if (displaySleepBlockerId === null) {
        displaySleepBlockerId = powerSaveBlocker.start('prevent-display-sleep')
      }
    } else {
      if (appSuspensionBlockerId !== null) {
        if (powerSaveBlocker.isStarted(appSuspensionBlockerId)) powerSaveBlocker.stop(appSuspensionBlockerId)
        appSuspensionBlockerId = null
      }
      if (displaySleepBlockerId !== null) {
        if (powerSaveBlocker.isStarted(displaySleepBlockerId)) powerSaveBlocker.stop(displaySleepBlockerId)
        displaySleepBlockerId = null
      }
    }
  })

  ipcMain.handle(IPC.requestOtp, async (_event, phone: string) => jio.requestOtp(phone))
  ipcMain.handle(IPC.verifyOtp, async (_event, phone: string, otp: string) => jio.verifyOtp(phone, otp))
  ipcMain.handle(IPC.restoreSession, async (): Promise<AuthSession | null> => {
    if (!jio.hasSession()) return null
    return jio.getSession()
  })
  ipcMain.handle(IPC.logout, async () => jio.logout())

  ipcMain.handle(IPC.fetchChannels, async (): Promise<Result<ChannelFetchPayload>> => {
    const result = await jio.fetchChannels()
    if (!result.ok) return result
    return {
      ok: true,
      data: {
        channels: result.data,
        source: 'jio',
        fetchedAt: new Date().toISOString()
      }
    }
  })

  ipcMain.handle(IPC.getStream, async (_event, channelId: string, quality: 'auto' | 'high' | 'medium' | 'low') =>
    jio.getStream(channelId, quality)
  )
  ipcMain.handle(IPC.getEpg, async (_event, channelId: string) => jio.fetchEpg(channelId))
  ipcMain.handle(IPC.getFeatured, async () => jio.fetchFeatured())

  // Addendum 3 · logo bytes through the privileged main process. Keeping this
  // out of the renderer preserves webSecurity and keeps canvases untainted.
  ipcMain.handle(IPC.assetFetch, async (_event, url: string) => fetchAsset(url))

  // Stage 1 of live-hero verification. The URL is the same resolved relay URL
  // the player consumes; no second token/header path is introduced.
  ipcMain.handle(IPC.probeStage1, async (_event, url: string) => probeStage1(url))

  ipcMain.handle(IPC.secureSave, async (_event, token: string) => {
    if (typeof token !== 'string' || token.length > 20_000) return false
    return rendererTokenStore.write(token)
  })
  ipcMain.handle(IPC.secureLoad, async () => rendererTokenStore.read())
  ipcMain.handle(IPC.secureClear, async () => rendererTokenStore.clear())
}

app.whenReady().then(async () => {
  const started = await applyPendingUpdateOnLaunch()
  if (started) return // app is quitting to install; do not create the main window

  if (hasCastLabsComponents) {
    try {
      // console.log('[CDM] Waiting for castLabs components.whenReady()...')
      await electronAny.components.whenReady()
      // console.log('[CDM] castLabs components ready! Status:', JSON.stringify(electronAny.components.status()))
    } catch (err) {
      // console.warn('[CDM] castLabs components.whenReady warning:', err)
    }
  }

  // Serve the React application over the secure app:// protocol
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url)
    // Strip the virtual 'bundle' host prefix from the URL path.
    // app://bundle/index.html  → pathname = /bundle/index.html → strip to index.html
    // app://bundle/assets/foo  → strip to assets/foo
    const withoutBundle = pathname.replace(/^\/+bundle\/+/, '').replace(/^\/+/, '')
    if (withoutBundle === 'logo' || withoutBundle.startsWith('logo/') || withoutBundle.startsWith('logo?')) {
      const search = new URL(request.url).search
      return net.fetch(`http://127.0.0.1:${relay.port}/${withoutBundle}${search}`)
    }
    const relative = !withoutBundle || withoutBundle === '/' ? 'index.html' : withoutBundle
    const targetFile = path.normalize(path.join(__dirname, '../renderer', relative))
    return net.fetch(pathToFileURL(targetFile).toString())
  })
  app.setAppUserModelId('tv.jiotvmax.app')
  await relay.start()
  jio = new JioService(relay)
  jio.setSessionExpiredHandler((reason) => {
    // console.warn('[Main] Emitting authExpired to renderer:', reason)
    mainWindow?.webContents.send(IPC.authExpired, { reason })
  })
  await jio.init()
  registerIpc()
  initUpdater(() => mainWindow)
  await createWindow()
  closeInstallingPanel()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('before-quit', () => {
  if (isInstallingUpdate()) return
  quitting = true
  if (appSuspensionBlockerId !== null && powerSaveBlocker.isStarted(appSuspensionBlockerId)) {
    powerSaveBlocker.stop(appSuspensionBlockerId)
    appSuspensionBlockerId = null
  }
  if (displaySleepBlockerId !== null && powerSaveBlocker.isStarted(displaySleepBlockerId)) {
    powerSaveBlocker.stop(displaySleepBlockerId)
    displaySleepBlockerId = null
  }
  void relay.stop()
})

app.on('window-all-closed', () => {
  if (isInstallingUpdate()) return
  if (!quitting && process.platform !== 'darwin') app.quit()
})
