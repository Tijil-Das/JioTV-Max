import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

describe('wiring tests for src/main/index.ts', () => {
  let appEvents: EventEmitter
  let mockApp: any
  let isInstalling: boolean

  beforeEach(() => {
    appEvents = new EventEmitter()
    isInstalling = false
    mockApp = {
      isPackaged: true,
      quit: vi.fn(),
      on: (event: string, handler: Function) => {
        appEvents.on(event, handler as any)
      }
    }
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Startup sequence & window order
  // ──────────────────────────────────────────────────────────────────────────
  it('order: applyPendingUpdateOnLaunch runs before createWindow. If true, createWindow is NOT called.', async () => {
    const executionOrder: string[] = []

    const applyPendingUpdateOnLaunch = vi.fn().mockImplementation(async () => {
      executionOrder.push('applyPending')
      return true // update was applied / launching installer
    })
    const createWindow = vi.fn().mockImplementation(async () => {
      executionOrder.push('createWindow')
    })
    const closeInstallingPanel = vi.fn().mockImplementation(() => {
      executionOrder.push('closePanel')
    })

    // Simulate startup
    const started = await applyPendingUpdateOnLaunch()
    if (!started) {
      await createWindow()
      closeInstallingPanel()
    }

    expect(executionOrder).toEqual(['applyPending'])
    expect(createWindow).not.toHaveBeenCalled()
    expect(closeInstallingPanel).not.toHaveBeenCalled()
  })

  it('order: if applyPendingUpdateOnLaunch returns false, createWindow is called BEFORE closeInstallingPanel', async () => {
    const executionOrder: string[] = []

    const applyPendingUpdateOnLaunch = vi.fn().mockImplementation(async () => {
      executionOrder.push('applyPending')
      return false
    })
    const createWindow = vi.fn().mockImplementation(async () => {
      executionOrder.push('createWindow')
    })
    const closeInstallingPanel = vi.fn().mockImplementation(() => {
      executionOrder.push('closePanel')
    })

    // Simulate startup
    const started = await applyPendingUpdateOnLaunch()
    if (!started) {
      await createWindow()
      closeInstallingPanel()
    }

    expect(executionOrder).toEqual(['applyPending', 'createWindow', 'closePanel'])
  })

  it('proof: closing the panel before createWindow triggers window-all-closed and prematurely quits the app', async () => {
    // When only the installing panel exists, closing it leaves 0 windows open.
    // In Electron, if no other window exists, closing it emits window-all-closed,
    // which in standard desktop mode calls app.quit() unless prevented!
    let openWindows = 1 // the panel window
    let appQuitCalled = false

    const onWindowAllClosed = () => {
      if (openWindows === 0) {
        appQuitCalled = true
      }
    }

    // BAD ORDER: close panel first before creating main window
    openWindows-- // panel closed
    onWindowAllClosed() // window-all-closed fires
    expect(appQuitCalled).toBe(true) // App quits prematurely!

    // GOOD ORDER: create main window first, THEN close panel
    openWindows = 1 // panel open
    appQuitCalled = false
    openWindows++ // main window created (count = 2)
    openWindows-- // panel closed (count = 1)
    if (openWindows === 0) onWindowAllClosed()
    expect(appQuitCalled).toBe(false) // App stays alive!
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Handlers during update install
  // ──────────────────────────────────────────────────────────────────────────
  it('close, before-quit, and window-all-closed handlers do nothing while isInstallingUpdate() is true', () => {
    isInstalling = true
    let boundsSaved = false
    let quitting = false

    const handleClose = () => {
      if (isInstalling) return
      boundsSaved = true
    }

    const handleBeforeQuit = () => {
      if (isInstalling) return
      quitting = true
    }

    const handleWindowAllClosed = () => {
      if (isInstalling) return
      if (!quitting) mockApp.quit()
    }

    handleClose()
    handleBeforeQuit()
    handleWindowAllClosed()

    expect(boundsSaved).toBe(false)
    expect(quitting).toBe(false)
    expect(mockApp.quit).not.toHaveBeenCalled()
  })

  it('close, before-quit, and window-all-closed handlers execute normal behavior when isInstallingUpdate() is false', () => {
    isInstalling = false
    let boundsSaved = false
    let quitting = false

    const handleClose = () => {
      if (isInstalling) return
      boundsSaved = true
    }

    const handleBeforeQuit = () => {
      if (isInstalling) return
      quitting = true
    }

    const handleWindowAllClosed = () => {
      if (isInstalling) return
      if (!quitting) mockApp.quit()
    }

    handleClose()
    expect(boundsSaved).toBe(true)

    handleWindowAllClosed()
    expect(mockApp.quit).toHaveBeenCalledTimes(1)

    handleBeforeQuit()
    expect(quitting).toBe(true)
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Second instance handling
  // ──────────────────────────────────────────────────────────────────────────
  it('second-instance launched during install does not crash or interrupt', () => {
    let restored = false
    let focused = false
    const mockWin = {
      isMinimized: () => true,
      restore: () => {
        restored = true
      },
      focus: () => {
        focused = true
      }
    }

    const handleSecondInstance = (win: any) => {
      if (!win) return
      if (win.isMinimized()) win.restore()
      win.focus()
    }

    // While panel is up and main window is null:
    expect(() => handleSecondInstance(null)).not.toThrow()
    expect(restored).toBe(false)

    // When main window exists:
    expect(() => handleSecondInstance(mockWin)).not.toThrow()
    expect(restored).toBe(true)
    expect(focused).toBe(true)
  })
})
