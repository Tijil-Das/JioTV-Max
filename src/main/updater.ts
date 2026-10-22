import { app, BrowserWindow, ipcMain } from 'electron'
import pkg from 'electron-updater'
const { autoUpdater } = pkg
import log from 'electron-log'
import semver from 'semver'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const POLL_MS = 20 * 60 * 1000
const FIRST_CHECK_DELAY_MS = 15 * 1000
const PANEL_PAINT_DELAY_MS = 1500
const CHECK_TIMEOUT_MS = 60 * 1000
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000

let busy = false // a check/download is in progress
let downloaded = false // an update is downloaded and waiting
let readyVersion: string | null = null
let installing = false // quitAndInstall has been triggered
let pollTimer: NodeJS.Timeout | null = null
let panel: BrowserWindow | null = null
let getMainWindow: () => BrowserWindow | null = () => null
let configured = false

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(label + ' timed out')), ms))
  ])

const pendingPath = (): string => path.join(app.getPath('userData'), 'pending-update.json')

function isStrictSemVer(v: unknown): v is string {
  if (typeof v !== 'string') return false
  if (v.startsWith('v') || v.startsWith('V')) return false
  return semver.valid(v) !== null && semver.clean(v) === v
}

function checkAndReadPending(): { version: string } | null {
  const p = pendingPath()
  if (!fs.existsSync(p)) return null
  try {
    const raw = fs.readFileSync(p, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed
  } catch {
    clearPending()
    return null
  }
}

function readPending(): { version: string } | null {
  return checkAndReadPending()
}

function writePending(version: string): void {
  try {
    fs.writeFileSync(pendingPath(), JSON.stringify({ version }))
  } catch (e) {
    log.error('Failed to write pending update file:', e)
  }
}

function clearPending(): void {
  try {
    fs.unlinkSync(pendingPath())
  } catch {
    // ignore if already deleted
  }
}

function configureUpdater(): void {
  if (configured) return
  configured = true
  autoUpdater.logger = log
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.autoRunAppAfterInstall = true
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
}

function resolveInstallingHtml(): string {
  const candidates = [
    path.join(__dirname, 'installing.html'),
    path.join(app.getAppPath(), 'out/main/installing.html'),
    path.join(app.getAppPath(), 'src/main/installing.html'),
    path.join(__dirname, '../../src/main/installing.html')
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return candidates[0]
}

function showInstallingPanel(): void {
  if (panel && !panel.isDestroyed()) return
  panel = new BrowserWindow({
    width: 420,
    height: 180,
    frame: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    show: true,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  const htmlPath = resolveInstallingHtml()
  panel.loadFile(htmlPath).catch((err) => {
    log.error('Failed to load installing.html via loadFile, falling back to data URL:', err)
    try {
      if (fs.existsSync(htmlPath)) {
        const content = fs.readFileSync(htmlPath, 'utf8')
        panel?.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(content))
        return
      }
    } catch {
      // ignore
    }
    panel?.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><title>Installing Updates</title>
<style>
:root{--bg:#0A0A0B;--fg:#F4F4F5;--sp:#E11D2E;--tk:rgba(255,255,255,0.1);--bd:rgba(255,255,255,0.08)}
@media(prefers-color-scheme:light){:root{--bg:#FFFFFF;--fg:#18181B;--sp:#E11D2E;--tk:rgba(0,0,0,0.08);--bd:rgba(0,0,0,0.08)}}
body{margin:0;width:100vw;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;user-select:none;gap:14px;border:1px solid var(--bd);border-radius:12px;box-sizing:border-box}
.status-row{display:flex;align-items:center;gap:10px}
.spinner{width:18px;height:18px;border:2.5px solid var(--tk);border-top-color:var(--sp);border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.text{font-size:13.5px;font-weight:500;letter-spacing:-0.01em}
</style>
</head>
<body>
<div class="status-row">
  <div class="spinner"></div>
  <div class="text">Installing updates, please wait…</div>
</div>
</body>
</html>`)
    )
  })
}

function closeInstallingPanel(): void {
  if (panel && !panel.isDestroyed()) panel.close()
  panel = null
}

// Case B. Returns true if an install was started (caller must NOT create the main window).
// If it returns false, the installing panel may still be open: the caller must create the main
// window FIRST and then call closeInstallingPanel() (see main.js notes).
async function applyPendingUpdateOnLaunch(): Promise<boolean> {
  if (!app.isPackaged) return false
  const pending = readPending()
  if (!pending) return false
  if (
    !pending ||
    typeof pending !== 'object' ||
    !isStrictSemVer(pending.version) ||
    semver.lte(pending.version, app.getVersion())
  ) {
    clearPending()
    return false
  }
  showInstallingPanel()
  try {
    configureUpdater()
    autoUpdater.autoDownload = false // we call downloadUpdate() explicitly here
    const result = await withTimeout(autoUpdater.checkForUpdates(), CHECK_TIMEOUT_MS, 'check')
    if (!result || !result.isUpdateAvailable) {
      clearPending()
      autoUpdater.autoDownload = true
      return false
    }
    await withTimeout(autoUpdater.downloadUpdate(), DOWNLOAD_TIMEOUT_MS, 'download')
    if (result.updateInfo?.version && result.updateInfo.version !== pending.version) {
      writePending(result.updateInfo.version)
    }
    await sleep(PANEL_PAINT_DELAY_MS)
    installing = true
    try {
      autoUpdater.quitAndInstall(false, true)
    } catch (quitErr) {
      installing = false
      autoUpdater.autoDownload = true
      throw quitErr
    }
    return true
  } catch (err) {
    log.error('Install-on-launch failed, starting app normally:', err)
    autoUpdater.autoDownload = true
    installing = false
    return false
  }
}

// Case A (also reusable).
async function installNow(): Promise<void> {
  if (installing) return
  installing = true
  showInstallingPanel()
  await sleep(PANEL_PAINT_DELAY_MS)
  autoUpdater.quitAndInstall(false, true)
}

async function checkNow(): Promise<void> {
  if (busy || downloaded || installing) return
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    busy = false
    log.error('Update check failed:', err)
  }
}

function initUpdater(getWin: () => BrowserWindow | null): void {
  if (!app.isPackaged) return
  getMainWindow = getWin
  configureUpdater()

  autoUpdater.on('update-available', () => {
    busy = true
  })
  autoUpdater.on('update-not-available', () => {
    busy = false
  })
  autoUpdater.on('error', (err) => {
    busy = false
    log.error('Updater error:', err)
  })
  autoUpdater.on('update-downloaded', (info) => {
    busy = false
    downloaded = true
    readyVersion = info.version
    writePending(info.version)
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('update:ready', info.version)
    }
  })

  ipcMain.handle('update:get-state', () => ({ readyVersion }))
  ipcMain.on('update:restart', () => {
    void installNow()
  })

  setTimeout(checkNow, FIRST_CHECK_DELAY_MS)
  pollTimer = setInterval(checkNow, POLL_MS)
}

function isInstallingUpdate(): boolean {
  return installing
}

function _resetStateForTests(): void {
  busy = false
  downloaded = false
  readyVersion = null
  installing = false
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (panel && !panel.isDestroyed()) {
    panel.close()
  }
  panel = null
  getMainWindow = () => null
  configured = false
}

export {
  initUpdater,
  applyPendingUpdateOnLaunch,
  closeInstallingPanel,
  isInstallingUpdate,
  installNow,
  checkNow,
  _resetStateForTests
}
