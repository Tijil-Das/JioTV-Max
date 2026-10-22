import { app, BrowserWindow, ipcMain, Menu, net, powerSaveBlocker, protocol, shell } from 'electron'
import { promises as fs, readdirSync, existsSync, readFileSync, cpSync } from 'node:fs'
import { join as pathJoin } from 'node:path'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { AppInfo, AuthSession, ChannelFetchPayload, Result } from '@shared/types'
import { IPC } from '@shared/ipc'
import { JioService } from './jio-service'
import { MediaRelay } from './media-relay'
import { SecureStore } from './secure-store'
import { WindowStateStore } from './window-state'

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

// Dev-only: the renderer receives its content from the Vite dev server, so the
// production CSP in the built index.html cannot apply. The warning is noise in
// that mode; packaged builds keep the strict policy.
if (!app.isPackaged) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
}

let mainWindow: BrowserWindow | null = null
let powerBlockerId: number | null = null
let quitting = false

const relay = new MediaRelay()
const windowStateStore = new WindowStateStore(app.getPath('userData'))
const rendererTokenStore = new SecureStore('renderer-token.bin')
let jio: JioService

// Diagnostic: print which electron binary is running so we know if castLabs is active.
console.log(`[Electron] execPath: ${process.execPath}`)

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
        console.log(`[CDM] Widevine CDM already present in userData (${existing[0]})`)
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
          console.log(`[CDM] Copying Widevine CDM v${cdmVersion} to: ${dest}`)
          cpSync(cdmSource, dest, { recursive: true })
          return
        }
      }
    } catch (err) {
      console.warn(`[CDM] Error checking ${root}:`, err)
    }
  }
}

// ---------------------------------------------------------------------------
// Widevine CDM Loader (Stock Electron fallback)
// ---------------------------------------------------------------------------
function tryLoadWidevineCdm(): void {
  if (process.platform !== 'win32') {
    console.log('[CDM] Non-Windows platform — skipping Chrome CDM loader.')
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
          console.log(`[CDM] Found Widevine CDM v${cdmVersion} (Chrome ${version}) at: ${cdmPath}`)
          app.commandLine.appendSwitch('widevine-cdm-path', cdmPath)
          app.commandLine.appendSwitch('widevine-cdm-version', cdmVersion)
          return
        }
      }
    } catch (err) {
      console.warn(`[CDM] Error scanning ${root}:`, err)
    }
  }

  console.warn(
    '[CDM] Widevine CDM not found in Chrome or Edge. ' +
    'DRM channels will show Error 6001. ' +
    'Install Google Chrome or switch to @castlabs/electron-releases.'
  )
}

if (hasCastLabsComponents) {
  console.log('[CDM] castLabs Electron detected (components API available).')
  ensureWidevineCdmInUserData(app.getPath('userData'))
} else {
  tryLoadWidevineCdm()
}


// Hardware video decode / autoplay are essential for a TV-like experience.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport')
app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', 'http://127.0.0.1,http://localhost')

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

async function createWindow(): Promise<void> {
  const state = await windowStateStore.load()
  const supportsMaterial = process.platform === 'win32' && isWindows11OrNewer()

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 1100,
    minHeight: 680,
    show: false,
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
      spellcheck: false
    }
  })

  if (state.maximized) mainWindow.maximize()
  Menu.setApplicationMenu(null)

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Mirror renderer console → main process terminal so Shaka DRM logs are visible
  // without needing DevTools open. Remove once DRM is confirmed working.
  //
  // Electron ≤34 uses positional args: (event, level, message, line, sourceId)
  // Electron 35+  passes a single params object: { level, message, line, sourceId }
  // We handle both by checking whether the first arg has a .message property.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mainWindow.webContents.on('console-message', (...args: any[]) => {
    let level: number, message: string, line: number, sourceId: string
    const first = args[0] as Record<string, unknown>
    if (first && typeof first.message === 'string') {
      // Electron 35+ single-object API
      level = (first.level as number) ?? 0
      message = first.message as string
      line = (first.line as number) ?? 0
      sourceId = (first.sourceId as string) ?? ''
    } else {
      // Electron ≤34 positional API: args = [event, level, message, line, sourceId]
      level = typeof args[1] === 'number' ? args[1] : 0
      message = typeof args[2] === 'string' ? args[2] : ''
      line = typeof args[3] === 'number' ? args[3] : 0
      sourceId = typeof args[4] === 'string' ? args[4] : ''
    }
    const source = sourceId ? sourceId.split('/').pop() : 'renderer'
    const prefix = level === 3 ? '[renderer:error]' : level === 2 ? '[renderer:warn]' : '[renderer]'
    if (/shaka|drm|widevine|eme|license|mediaplayer|6001|6007|1001|1002|cdm|probe/i.test(message)) {
      console.log(`${prefix} (${source}:${line}) ${message}`)
    }
  })

  const persist = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const maximized = mainWindow.isMaximized()
    const bounds = maximized ? mainWindow.getNormalBounds() : mainWindow.getBounds()
    windowStateStore.saveBounds(bounds, maximized)
  }
  mainWindow.on('resize', persist)
  mainWindow.on('move', persist)
  mainWindow.on('close', persist)

  const sendFullscreen = (val: boolean): void => {
    mainWindow?.webContents.send(IPC.fullscreenChanged, val)
  }
  mainWindow.on('enter-full-screen', () => sendFullscreen(true))
  mainWindow.on('leave-full-screen', () => sendFullscreen(false))
  mainWindow.on('enter-html-full-screen', () => sendFullscreen(true))
  mainWindow.on('leave-html-full-screen', () => sendFullscreen(false))

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send(IPC.windowMaximizedChanged, true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send(IPC.windowMaximizedChanged, false)
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

  // F11 is handled natively even when a child video element has focus.
  mainWindow.webContents.on('before-input-event', (event, input) => {
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

  if (process.env.STREAMDECK_CAPTURE) {
    console.log('[capture] harness enabled')
    void runCaptureHarness(mainWindow)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/**
 * Development-only visual check.
 *
 * Set `STREAMDECK_CAPTURE` to a comma-separated list of routes (for example
 * `/ ,/guide,/settings,/watch/ch-101`). The harness walks each route, writes a
 * PNG into `STREAMDECK_CAPTURE_DIR` (defaults to the temp folder) and prints
 * every renderer console message to the terminal before quitting. It never
 * runs unless the variable is set, so packaged builds are unaffected.
 */
async function runCaptureHarness(window: BrowserWindow): Promise<void> {
  const routes = (process.env.STREAMDECK_CAPTURE ?? '/')
    .split(',')
    .map((route) => route.trim())
    .filter(Boolean)
  const outDir = process.env.STREAMDECK_CAPTURE_DIR ?? app.getPath('temp')
  const logFile = path.join(outDir, 'streamdeck-capture.log')
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  const log = (message: string) => {
    console.log(message)
    void fs.appendFile(logFile, `${new Date().toISOString()} ${message}\n`).catch(() => undefined)
  }

  process.on('unhandledRejection', (reason) => {
    log(`[capture:unhandledRejection] ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}`)
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  window.webContents.on('console-message', (...args: any[]) => {
    const msg = typeof args[2] === 'string' ? args[2] : args[0]?.message ?? ''
    const lvl = typeof args[1] === 'number' ? args[1] : args[0]?.level ?? 0
    log(`[renderer:${lvl}] ${msg}`)
  })

  // Keep animations and the compositor alive even if another window covers
  // the app; otherwise route transitions stall in occluded windows.
  window.webContents.setBackgroundThrottling(false)
  window.setAlwaysOnTop(true)
  window.show()
  window.focus()

  log(`[capture] starting; loading=${window.webContents.isLoading()}; routes=${routes.join(' ')}`)
  await wait(4000)
  log('[capture] warm-up complete')

  for (const [index, entry] of routes.entries()) {
    // Syntax: "route" or "route@<javascript>" to exercise an overlay.
    const separator = entry.indexOf('@')
    const route = separator === -1 ? entry : entry.slice(0, separator)
    const action = separator === -1 ? null : entry.slice(separator + 1)
    const base = route === '/' ? 'home' : route.replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '')
    const name = action ? `${base}-${index}` : base
    try {
      log(`[capture] visiting ${route}`)
      // A full load per route resets stores and overlays, so each screenshot
      // reflects a cold start exactly like a user opening the app.
      await window.loadURL(`app://bundle/index.html?capture=${Date.now()}#${route}`)
      log(`[capture] navigated to ${route}`)
      await wait(2600)
      if (action) {
        await window.webContents.executeJavaScript(action)
        await wait(1400)
      }
      let image
      try {
        image = await window.webContents.capturePage()
      } catch {
        await wait(800)
        image = await window.webContents.capturePage()
      }
      const file = path.join(outDir, `streamdeck-${name}.png`)
      await fs.writeFile(file, image.toPNG())
      log(`[capture] ${entry} -> ${file}`)
    } catch (error) {
      log(`[capture] ${entry} failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  log('[capture] finished')
  app.quit()
  // Safety net: never leave a headless capture run alive.
  setTimeout(() => app.exit(0), 2500)
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

  ipcMain.handle(IPC.windowMinimize, (): void => {
    mainWindow?.minimize()
  })

  ipcMain.handle(IPC.windowMaximize, (): boolean => {
    if (!mainWindow) return false
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
    return mainWindow?.isMaximized() ?? false
  })

  ipcMain.handle(IPC.setAlwaysOnTop, (_event, value: boolean): boolean => {
    if (!mainWindow) return false
    mainWindow.setAlwaysOnTop(Boolean(value), 'floating')
    return mainWindow.isAlwaysOnTop()
  })

  ipcMain.handle(IPC.setPlayerActive, (_event, active: boolean): void => {
    if (active && powerBlockerId === null) {
      powerBlockerId = powerSaveBlocker.start('prevent-display-sleep')
    } else if (!active && powerBlockerId !== null) {
      if (powerSaveBlocker.isStarted(powerBlockerId)) powerSaveBlocker.stop(powerBlockerId)
      powerBlockerId = null
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

  ipcMain.handle(IPC.secureSave, async (_event, token: string) => {
    if (typeof token !== 'string' || token.length > 20_000) return false
    return rendererTokenStore.write(token)
  })
  ipcMain.handle(IPC.secureLoad, async () => rendererTokenStore.read())
  ipcMain.handle(IPC.secureClear, async () => rendererTokenStore.clear())
}

app.whenReady().then(async () => {
  if (hasCastLabsComponents) {
    try {
      console.log('[CDM] Waiting for castLabs components.whenReady()...')
      await electronAny.components.whenReady()
      console.log('[CDM] castLabs components ready! Status:', JSON.stringify(electronAny.components.status()))
    } catch (err) {
      console.warn('[CDM] castLabs components.whenReady warning:', err)
    }
  }

  // Serve the React application over the secure app:// protocol
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url)
    // Strip the virtual 'bundle' host prefix from the URL path.
    // app://bundle/index.html  → pathname = /bundle/index.html → strip to index.html
    // app://bundle/assets/foo  → strip to assets/foo
    const withoutBundle = pathname.replace(/^\/+bundle\/+/, '').replace(/^\/+/, '')
    const relative = !withoutBundle || withoutBundle === '/' ? 'index.html' : withoutBundle
    const targetFile = path.normalize(path.join(__dirname, '../renderer', relative))
    return net.fetch(pathToFileURL(targetFile).toString())
  })
  app.setAppUserModelId('tv.streamdeck.app')
  await relay.start()
  jio = new JioService(relay)
  await jio.init()
  registerIpc()
  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('before-quit', () => {
  quitting = true
  void relay.stop()
})

app.on('window-all-closed', () => {
  if (!quitting && process.platform !== 'darwin') app.quit()
})
