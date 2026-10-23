import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { FakeAutoUpdater, createTestUserDataDir, createComplexUserDataDir } from './mocks'

const fakeAutoUpdater = new FakeAutoUpdater()
let mockUserDataDir = ''
let isAppPackaged = true
let appVersion = '1.0.0'
const createdBrowserWindows: any[] = []
const ipcHandlers = new Map<string, Function>()
const ipcListeners = new Map<string, Function>()

class FakeBrowserWindow {
  public options: any
  public destroyed = false
  public loadFile = vi.fn().mockResolvedValue(undefined)
  public loadURL = vi.fn().mockResolvedValue(undefined)
  public close = vi.fn().mockImplementation(() => {
    this.destroyed = true
  })
  public isDestroyed = vi.fn().mockImplementation(() => this.destroyed)
  public webContents = {
    send: vi.fn()
  }

  constructor(options: any) {
    this.options = options
    createdBrowserWindows.push(this)
  }
}

vi.mock('electron', () => {
  return {
    app: {
      get isPackaged() {
        return isAppPackaged
      },
      getVersion: () => appVersion,
      getPath: (name: string) => {
        if (name === 'userData') return mockUserDataDir
        return mockUserDataDir
      },
      getAppPath: () => mockUserDataDir
    },
    BrowserWindow: FakeBrowserWindow,
    ipcMain: {
      handle: vi.fn((channel: string, handler: Function) => {
        ipcHandlers.set(channel, handler)
      }),
      on: vi.fn((channel: string, listener: Function) => {
        ipcListeners.set(channel, listener)
      }),
      removeHandler: vi.fn((channel: string) => {
        ipcHandlers.delete(channel)
      })
    }
  }
})

vi.mock('electron-updater', () => {
  return {
    default: {
      autoUpdater: fakeAutoUpdater
    },
    autoUpdater: fakeAutoUpdater
  }
})

const mockLog = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn()
}
vi.mock('electron-log', () => {
  return {
    default: mockLog,
    ...mockLog
  }
})

describe('updater module unit tests', () => {
  let updaterModule: typeof import('../../src/main/updater')

  beforeEach(async () => {
    vi.useFakeTimers()
    isAppPackaged = true
    appVersion = '1.0.0'
    mockUserDataDir = createTestUserDataDir()
    fakeAutoUpdater.reset()
    createdBrowserWindows.length = 0
    ipcHandlers.clear()
    ipcListeners.clear()
    mockLog.error.mockReset()

    vi.resetModules()
    updaterModule = await import('../../src/main/updater')
    updaterModule._resetStateForTests()
  })

  afterEach(() => {
    updaterModule._resetStateForTests()
    vi.clearAllTimers()
    vi.useRealTimers()
    try {
      if (fs.existsSync(mockUserDataDir)) {
        fs.rmSync(mockUserDataDir, { recursive: true, force: true })
      }
    } catch {}
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Gating
  // ──────────────────────────────────────────────────────────────────────────
  describe('Gating', () => {
    it('app.isPackaged = false: initUpdater registers safe dev handlers but no auto-updater listeners or timers', async () => {
      isAppPackaged = false
      const getWin = () => null

      updaterModule.initUpdater(getWin)

      expect(ipcHandlers.has('update:get-state')).toBe(true)
      expect(ipcHandlers.has('update:check')).toBe(true)
      const checkResult = await ipcHandlers.get('update:check')!()
      expect(checkResult).toEqual({
        status: 'dev-mode',
        error: 'Updates are enabled in packaged desktop builds'
      })

      expect(fakeAutoUpdater.listenerCount('update-available')).toBe(0)
      expect(fakeAutoUpdater.listenerCount('update-downloaded')).toBe(0)

      // Advance timers 24 hours: no check should ever run
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)
      expect(fakeAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
    })

    it('app.isPackaged = false: applyPendingUpdateOnLaunch returns false and touches nothing', async () => {
      isAppPackaged = false
      const pendingFile = path.join(mockUserDataDir, 'pending-update.json')
      fs.writeFileSync(pendingFile, JSON.stringify({ version: '1.0.1' }))

      const result = await updaterModule.applyPendingUpdateOnLaunch()
      expect(result).toBe(false)
      expect(fakeAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
      expect(fakeAutoUpdater.quitAndInstall).not.toHaveBeenCalled()
      expect(createdBrowserWindows.length).toBe(0)
      expect(fs.existsSync(pendingFile)).toBe(true) // Not touched
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Configuration
  // ──────────────────────────────────────────────────────────────────────────
  describe('Configuration', () => {
    it('after init: autoDownload, autoInstallOnAppQuit, allowPrerelease, allowDowngrade, autoRunAppAfterInstall and logger are set', () => {
      updaterModule.initUpdater(() => null)

      expect(fakeAutoUpdater.autoDownload).toBe(true)
      expect(fakeAutoUpdater.autoInstallOnAppQuit).toBe(false)
      expect(fakeAutoUpdater.allowPrerelease).toBe(false)
      expect(fakeAutoUpdater.allowDowngrade).toBe(false)
      expect(fakeAutoUpdater.autoRunAppAfterInstall).toBe(true)
      expect(fakeAutoUpdater.logger).toBe(mockLog)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Polling
  // ──────────────────────────────────────────────────────────────────────────
  describe('Polling', () => {
    it('checks at exactly 15 s, then at 20 min intervals; asserts exact call counts after 1h and 24h', async () => {
      updaterModule.initUpdater(() => null)

      // At 14.9s: 0 checks
      await vi.advanceTimersByTimeAsync(14_900)
      expect(fakeAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(0)

      // At exactly 15.0s: 1st check
      await vi.advanceTimersByTimeAsync(100)
      expect(fakeAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)

      // Advance to 1 hour mark (15s + 20m + 20m + 20m): exactly 4 checks total
      await vi.advanceTimersByTimeAsync(20 * 60 * 1000)
      expect(fakeAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(2)

      await vi.advanceTimersByTimeAsync(20 * 60 * 1000)
      expect(fakeAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(3)

      await vi.advanceTimersByTimeAsync(20 * 60 * 1000)
      expect(fakeAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(4)

      // Advance rest of 24 hours: 24h has 24 * 3 = 72 intervals of 20 min + initial check = 73 checks
      // We already advanced 60 min (3 intervals of 20m)
      const remainingMinutes = 23 * 60
      await vi.advanceTimersByTimeAsync(remainingMinutes * 60 * 1000)
      expect(fakeAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1 + 72)
    })

    it('no overlapping checks: while check is pending (update-available fired), timer ticks do not call checkForUpdates again', async () => {
      updaterModule.initUpdater(() => null)

      await vi.advanceTimersByTimeAsync(15_000)
      expect(fakeAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)

      // Simulates update-available received (download is downloading in background)
      fakeAutoUpdater.emit('update-available')

      // Advance 20 minutes: busy flag must prevent another check
      await vi.advanceTimersByTimeAsync(20 * 60 * 1000)
      expect(fakeAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)

      // Advance another 20 minutes
      await vi.advanceTimersByTimeAsync(20 * 60 * 1000)
      expect(fakeAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)

      // Now error or not-available fires: busy flag resets
      fakeAutoUpdater.emit('update-not-available')

      // Next tick triggers check
      await vi.advanceTimersByTimeAsync(20 * 60 * 1000)
      expect(fakeAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(2)
    })

    it('error resets the busy guard so the next tick checks again', async () => {
      updaterModule.initUpdater(() => null)

      await vi.advanceTimersByTimeAsync(15_000)
      fakeAutoUpdater.emit('update-available')

      // Error occurs during download
      fakeAutoUpdater.emit('error', new Error('Network timeout'))
      expect(mockLog.error).toHaveBeenCalled()

      // Next tick runs normally
      await vi.advanceTimersByTimeAsync(20 * 60 * 1000)
      expect(fakeAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(2)
    })

    it('checkForUpdates rejecting is caught without unhandled rejection and polling continues on next tick', async () => {
      fakeAutoUpdater.checkForUpdates.mockRejectedValueOnce(new Error('GitHub 503 Service Unavailable'))
      updaterModule.initUpdater(() => null)

      // Trigger 1st check
      await vi.advanceTimersByTimeAsync(15_000)
      expect(fakeAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
      expect(mockLog.error).toHaveBeenCalled()

      // Polling continues on next tick
      fakeAutoUpdater.checkForUpdates.mockResolvedValueOnce({
        updateInfo: { version: '1.0.0' },
        isUpdateAvailable: false
      })
      await vi.advanceTimersByTimeAsync(20 * 60 * 1000)
      expect(fakeAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(2)
    })

    it('polling continues after 10 consecutive failures', async () => {
      fakeAutoUpdater.checkForUpdates.mockRejectedValue(new Error('Persistent DNS outage'))
      updaterModule.initUpdater(() => null)

      await vi.advanceTimersByTimeAsync(15_000)
      for (let i = 1; i <= 10; i++) {
        await vi.advanceTimersByTimeAsync(20 * 60 * 1000)
      }
      expect(fakeAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(11)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Download complete
  // ──────────────────────────────────────────────────────────────────────────
  describe('Download complete', () => {
    it('writes pending-update.json with {"version": "x.y.z"}, notifies renderer, and clears polling', async () => {
      const mockWin = new FakeBrowserWindow({})
      updaterModule.initUpdater(() => mockWin as any)

      await vi.advanceTimersByTimeAsync(15_000)
      expect(fakeAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)

      // Simulate download finished
      fakeAutoUpdater.emit('update-downloaded', { version: '1.0.1' })

      // Check pending file
      const pendingFile = path.join(mockUserDataDir, 'pending-update.json')
      expect(fs.existsSync(pendingFile)).toBe(true)
      const data = JSON.parse(fs.readFileSync(pendingFile, 'utf8'))
      expect(data).toEqual({ version: '1.0.1' })

      // Check renderer notified
      expect(mockWin.webContents.send).toHaveBeenCalledWith('update:ready', '1.0.1')

      // Check polling interval is cleared: no more checks after 24 hours and 0 active timers
      expect(vi.getTimerCount()).toBe(0)
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)
      expect(fakeAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
    })

    it('does not throw when main window is null or destroyed on update-downloaded', () => {
      const mockWin = new FakeBrowserWindow({})
      mockWin.destroyed = true
      updaterModule.initUpdater(() => mockWin as any)

      expect(() => {
        fakeAutoUpdater.emit('update-downloaded', { version: '1.0.1' })
      }).not.toThrow()
    })

    it('update:get-state returns null readyVersion before download and { readyVersion } after', async () => {
      updaterModule.initUpdater(() => null)

      const getStateHandler = ipcHandlers.get('update:get-state')
      expect(getStateHandler).toBeDefined()

      const before = await getStateHandler!()
      expect(before).toEqual({ readyVersion: null })

      fakeAutoUpdater.emit('update-downloaded', { version: '1.2.3' })

      const after = await getStateHandler!()
      expect(after).toEqual({ readyVersion: '1.2.3' })
    })

    it('update-downloaded firing twice does not break anything', () => {
      const mockWin = new FakeBrowserWindow({})
      updaterModule.initUpdater(() => mockWin as any)

      fakeAutoUpdater.emit('update-downloaded', { version: '1.0.1' })
      fakeAutoUpdater.emit('update-downloaded', { version: '1.0.1' })

      expect(mockWin.webContents.send).toHaveBeenCalledTimes(2)
      const pendingFile = path.join(mockUserDataDir, 'pending-update.json')
      expect(JSON.parse(fs.readFileSync(pendingFile, 'utf8'))).toEqual({ version: '1.0.1' })
    })

    it('pending-file write failure logs error but does not crash and renderer is still notified', () => {
      const mockWin = new FakeBrowserWindow({})
      updaterModule.initUpdater(() => mockWin as any)

      const realWrite = fs.writeFileSync
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
        throw new Error('EACCES: permission denied')
      })

      try {
        expect(() => {
          fakeAutoUpdater.emit('update-downloaded', { version: '1.0.1' })
        }).not.toThrow()
        expect(mockLog.error).toHaveBeenCalled()
        expect(mockWin.webContents.send).toHaveBeenCalledWith('update:ready', '1.0.1')
      } finally {
        fs.writeFileSync = realWrite
      }
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Case A (Restart)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Case A (Restart)', () => {
    it('update:restart shows panel, waits 1.5s, then calls quitAndInstall(false, true)', async () => {
      updaterModule.initUpdater(() => null)
      const restartHandler = ipcListeners.get('update:restart')
      expect(restartHandler).toBeDefined()

      // Trigger restart
      restartHandler!()

      expect(createdBrowserWindows.length).toBe(1)
      expect(updaterModule.isInstallingUpdate()).toBe(true)

      // Before 1.5 s: quitAndInstall must NOT be called
      await vi.advanceTimersByTimeAsync(1499)
      expect(fakeAutoUpdater.quitAndInstall).not.toHaveBeenCalled()

      // At 1.5 s: quitAndInstall called with (false, true)
      await vi.advanceTimersByTimeAsync(1)
      expect(fakeAutoUpdater.quitAndInstall).toHaveBeenCalledTimes(1)
      expect(fakeAutoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true)
    })

    it('double or triple clicks on Restart creates panel once and calls quitAndInstall once', async () => {
      updaterModule.initUpdater(() => null)
      const restartHandler = ipcListeners.get('update:restart')!

      restartHandler()
      restartHandler()
      restartHandler()

      expect(createdBrowserWindows.length).toBe(1)

      await vi.advanceTimersByTimeAsync(2000)
      expect(fakeAutoUpdater.quitAndInstall).toHaveBeenCalledTimes(1)
    })

    it('while installing is true, poll ticks do nothing', async () => {
      updaterModule.initUpdater(() => null)
      const restartHandler = ipcListeners.get('update:restart')!
      restartHandler()

      expect(updaterModule.isInstallingUpdate()).toBe(true)

      await vi.advanceTimersByTimeAsync(20 * 60 * 1000)
      expect(fakeAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Case B (Launch with pending update)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Case B (Launch with pending update)', () => {
    it('no pending file: returns false immediately, no panel, no updater calls', async () => {
      const result = await updaterModule.applyPendingUpdateOnLaunch()
      expect(result).toBe(false)
      expect(createdBrowserWindows.length).toBe(0)
      expect(fakeAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
    })

    it.each([
      ['corrupt JSON', '{invalid-json'],
      ['empty file', ''],
      ['JSON without version', JSON.stringify({ other: 'value' })],
      ['version as number', JSON.stringify({ version: 123 })],
      ['version with leading v', JSON.stringify({ version: 'v1.0.1' })],
      ['garbage version string', JSON.stringify({ version: 'garbage' })]
    ])('invalid pending file (%s): deleted and returns false without showing panel', async (_, content) => {
      const pendingFile = path.join(mockUserDataDir, 'pending-update.json')
      fs.writeFileSync(pendingFile, content)

      const result = await updaterModule.applyPendingUpdateOnLaunch()
      expect(result).toBe(false)
      expect(fs.existsSync(pendingFile)).toBe(false)
      expect(createdBrowserWindows.length).toBe(0)
      expect(fakeAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
    })

    it('version <= app.getVersion(): deletes file and returns false', async () => {
      appVersion = '1.0.1'
      const pendingFile = path.join(mockUserDataDir, 'pending-update.json')
      fs.writeFileSync(pendingFile, JSON.stringify({ version: '1.0.1' }))

      const result = await updaterModule.applyPendingUpdateOnLaunch()
      expect(result).toBe(false)
      expect(fs.existsSync(pendingFile)).toBe(false)
      expect(createdBrowserWindows.length).toBe(0)
    })

    it('valid newer version: panel shown BEFORE check, checkForUpdates -> downloadUpdate -> 1.5s -> quitAndInstall(false, true)', async () => {
      appVersion = '1.0.0'
      const pendingFile = path.join(mockUserDataDir, 'pending-update.json')
      fs.writeFileSync(pendingFile, JSON.stringify({ version: '1.0.1' }))

      const promise = updaterModule.applyPendingUpdateOnLaunch()

      // Panel is shown immediately before checking starts
      expect(createdBrowserWindows.length).toBe(1)
      expect(fakeAutoUpdater.autoDownload).toBe(false)

      await vi.advanceTimersByTimeAsync(1500)
      const result = await promise

      expect(result).toBe(true)
      expect(fakeAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
      expect(fakeAutoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)
      expect(fakeAutoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true)
    })

    it('pre-release semver edge cases: 1.0.1-beta.1 vs installed 1.0.1', async () => {
      // Installed release 1.0.1, pending is prerelease 1.0.1-beta.1: lte is true, must clear and return false
      appVersion = '1.0.1'
      const pendingFile = path.join(mockUserDataDir, 'pending-update.json')
      fs.writeFileSync(pendingFile, JSON.stringify({ version: '1.0.1-beta.1' }))

      const result = await updaterModule.applyPendingUpdateOnLaunch()
      expect(result).toBe(false)
      expect(fs.existsSync(pendingFile)).toBe(false)
    })

    it('pre-release semver edge cases: installed 1.0.1-beta.1 vs pending 1.0.1', async () => {
      // Installed prerelease 1.0.1-beta.1, pending is full release 1.0.1: proceeds with update
      appVersion = '1.0.1-beta.1'
      const pendingFile = path.join(mockUserDataDir, 'pending-update.json')
      fs.writeFileSync(pendingFile, JSON.stringify({ version: '1.0.1' }))

      fakeAutoUpdater.checkForUpdates.mockResolvedValueOnce({
        updateInfo: { version: '1.0.1' },
        isUpdateAvailable: true
      })

      const promise = updaterModule.applyPendingUpdateOnLaunch()
      await vi.advanceTimersByTimeAsync(1500)
      const result = await promise
      expect(result).toBe(true)
      expect(fakeAutoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true)
    })

    it('release pulled (isUpdateAvailable: false): deletes file and returns false', async () => {
      const pendingFile = path.join(mockUserDataDir, 'pending-update.json')
      fs.writeFileSync(pendingFile, JSON.stringify({ version: '1.0.1' }))

      fakeAutoUpdater.checkForUpdates.mockResolvedValueOnce({
        updateInfo: { version: '1.0.0' },
        isUpdateAvailable: false
      })

      const result = await updaterModule.applyPendingUpdateOnLaunch()
      expect(result).toBe(false)
      expect(fs.existsSync(pendingFile)).toBe(false)
      expect(fakeAutoUpdater.autoDownload).toBe(true)
    })

    it('latest release is newer than pending (pending 1.0.1, GitHub has 1.0.2): installs and pending file is updated', async () => {
      const pendingFile = path.join(mockUserDataDir, 'pending-update.json')
      fs.writeFileSync(pendingFile, JSON.stringify({ version: '1.0.1' }))

      fakeAutoUpdater.checkForUpdates.mockResolvedValueOnce({
        updateInfo: { version: '1.0.2' },
        isUpdateAvailable: true
      })

      const promise = updaterModule.applyPendingUpdateOnLaunch()
      await vi.advanceTimersByTimeAsync(1500)
      const result = await promise

      expect(result).toBe(true)
      const updated = JSON.parse(fs.readFileSync(pendingFile, 'utf8'))
      expect(updated.version).toBe('1.0.2')
      expect(fakeAutoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true)
    })

    it('checkForUpdates rejects: returns false, file kept, no throw, autoDownload restored', async () => {
      const pendingFile = path.join(mockUserDataDir, 'pending-update.json')
      fs.writeFileSync(pendingFile, JSON.stringify({ version: '1.0.1' }))

      fakeAutoUpdater.checkForUpdates.mockRejectedValueOnce(new Error('GitHub 500 Server Error'))

      const result = await updaterModule.applyPendingUpdateOnLaunch()
      expect(result).toBe(false)
      expect(fs.existsSync(pendingFile)).toBe(true)
      expect(fakeAutoUpdater.autoDownload).toBe(true)
      expect(mockLog.error).toHaveBeenCalled()
    })

    it('checkForUpdates times out after 60s: returns false, file kept', async () => {
      const pendingFile = path.join(mockUserDataDir, 'pending-update.json')
      fs.writeFileSync(pendingFile, JSON.stringify({ version: '1.0.1' }))

      fakeAutoUpdater.checkForUpdates.mockReturnValue(new Promise(() => {})) // hangs

      const promise = updaterModule.applyPendingUpdateOnLaunch()
      await vi.advanceTimersByTimeAsync(60_000)
      const result = await promise

      expect(result).toBe(false)
      expect(fs.existsSync(pendingFile)).toBe(true)
      expect(fakeAutoUpdater.autoDownload).toBe(true)
    })

    it('downloadUpdate rejects: returns false, file kept', async () => {
      const pendingFile = path.join(mockUserDataDir, 'pending-update.json')
      fs.writeFileSync(pendingFile, JSON.stringify({ version: '1.0.1' }))

      fakeAutoUpdater.downloadUpdate.mockRejectedValueOnce(new Error('Download truncated'))

      const result = await updaterModule.applyPendingUpdateOnLaunch()
      expect(result).toBe(false)
      expect(fs.existsSync(pendingFile)).toBe(true)
      expect(fakeAutoUpdater.autoDownload).toBe(true)
    })

    it('downloadUpdate times out after 10 min: returns false, file kept', async () => {
      const pendingFile = path.join(mockUserDataDir, 'pending-update.json')
      fs.writeFileSync(pendingFile, JSON.stringify({ version: '1.0.1' }))

      fakeAutoUpdater.downloadUpdate.mockReturnValue(new Promise(() => {})) // hangs

      const promise = updaterModule.applyPendingUpdateOnLaunch()
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
      const result = await promise

      expect(result).toBe(false)
      expect(fs.existsSync(pendingFile)).toBe(true)
      expect(fakeAutoUpdater.autoDownload).toBe(true)
    })

    it('quitAndInstall throws: returns false, installing reset to false', async () => {
      const pendingFile = path.join(mockUserDataDir, 'pending-update.json')
      fs.writeFileSync(pendingFile, JSON.stringify({ version: '1.0.1' }))

      fakeAutoUpdater.quitAndInstall.mockImplementationOnce(() => {
        throw new Error('EPERM: cannot execute installer')
      })

      const promise = updaterModule.applyPendingUpdateOnLaunch()
      await vi.advanceTimersByTimeAsync(1500)
      const result = await promise

      expect(result).toBe(false)
      expect(updaterModule.isInstallingUpdate()).toBe(false)
      expect(fakeAutoUpdater.autoDownload).toBe(true)
    })

    it('works cleanly when userData directory path contains spaces and non-ASCII Unicode characters', async () => {
      mockUserDataDir = createComplexUserDataDir()
      const pendingFile = path.join(mockUserDataDir, 'pending-update.json')
      fs.writeFileSync(pendingFile, JSON.stringify({ version: '1.0.1' }))

      const promise = updaterModule.applyPendingUpdateOnLaunch()
      await vi.advanceTimersByTimeAsync(1500)
      const result = await promise

      expect(result).toBe(true)
      expect(fakeAutoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Panel
  // ──────────────────────────────────────────────────────────────────────────
  describe('Panel window', () => {
    it('creates BrowserWindow with required options: 420x180, frame:false, resizable:false, alwaysOnTop:true, nodeIntegration:false, contextIsolation:true', async () => {
      const pendingFile = path.join(mockUserDataDir, 'pending-update.json')
      fs.writeFileSync(pendingFile, JSON.stringify({ version: '1.0.1' }))

      const promise = updaterModule.applyPendingUpdateOnLaunch()
      expect(createdBrowserWindows.length).toBe(1)
      const panel = createdBrowserWindows[0]

      expect(panel.options.width).toBe(420)
      expect(panel.options.height).toBe(180)
      expect(panel.options.frame).toBe(false)
      expect(panel.options.resizable).toBe(false)
      expect(panel.options.alwaysOnTop).toBe(true)
      expect(panel.options.webPreferences.nodeIntegration).toBe(false)
      expect(panel.options.webPreferences.contextIsolation).toBe(true)

      await vi.advanceTimersByTimeAsync(1500)
      await promise
    })

    it('calling showInstallingPanel twice creates only one window', async () => {
      const pendingFile = path.join(mockUserDataDir, 'pending-update.json')
      fs.writeFileSync(pendingFile, JSON.stringify({ version: '1.0.1' }))

      const p1 = updaterModule.applyPendingUpdateOnLaunch()
      const p2 = updaterModule.applyPendingUpdateOnLaunch()

      expect(createdBrowserWindows.length).toBe(1)
      await vi.advanceTimersByTimeAsync(1500)
      await p1
      await p2
    })

    it('closeInstallingPanel with no panel or already destroyed panel does not throw', () => {
      expect(() => updaterModule.closeInstallingPanel()).not.toThrow()
    })

    it('installing.html contains exact text "Installing updates, please wait…" and prefers-color-scheme rule', () => {
      const htmlPath = path.resolve(__dirname, '../../src/main/installing.html')
      expect(fs.existsSync(htmlPath)).toBe(true)
      const content = fs.readFileSync(htmlPath, 'utf8')
      expect(content).toContain('Installing updates, please wait…')
      expect(content).toContain('prefers-color-scheme')
    })
  })
})
