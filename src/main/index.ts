import { app, BrowserWindow, ipcMain, Menu, powerSaveBlocker, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AppInfo, AuthSession, ChannelFetchPayload, Result } from '@shared/types'
import { IPC } from '@shared/ipc'
import { JioService } from './jio-service'
import { MediaRelay } from './media-relay'
import { SecureStore } from './secure-store'
import { WindowStateStore } from './window-state'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let powerBlockerId: number | null = null
let quitting = false

const relay = new MediaRelay()
const windowStateStore = new WindowStateStore(app.getPath('userData'))
const rendererTokenStore = new SecureStore('renderer-token.bin')
let jio: JioService

// Hardware video decode / autoplay are essential for a TV-like experience.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport')

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
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#F5F5F7',
      height: 40
    },
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

  const persist = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const maximized = mainWindow.isMaximized()
    const bounds = maximized ? mainWindow.getNormalBounds() : mainWindow.getBounds()
    windowStateStore.saveBounds(bounds, maximized)
  }
  mainWindow.on('resize', persist)
  mainWindow.on('move', persist)
  mainWindow.on('close', persist)

  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send(IPC.fullscreenChanged, true)
  })
  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send(IPC.fullscreenChanged, false)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl && url.startsWith(devUrl)) return
    event.preventDefault()
  })

  // F11 is handled natively even when a child video element has focus.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11' && input.type === 'keyDown') {
      event.preventDefault()
      if (mainWindow?.isFullScreen()) mainWindow.setFullScreen(false)
      else mainWindow?.setFullScreen(true)
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function registerIpc(): void {
  ipcMain.handle(IPC.appInfo, (): AppInfo => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron
  }))

  ipcMain.handle(IPC.toggleFullscreen, (): boolean => {
    if (!mainWindow) return false
    const next = !mainWindow.isFullScreen()
    mainWindow.setFullScreen(next)
    return next
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
