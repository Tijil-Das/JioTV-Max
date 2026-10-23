import { BrowserWindow, ipcMain, type IpcMainInvokeEvent, type IpcMainEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type { SnapBounds, SnapButtonState, SnapSupportStatus } from '@shared/types'
import { isWindows11OrNewerBuild, validateSnapBounds } from './geometry'
import { loadSnapAddon, type SnapOverlayAddon } from './addonLoader'

export class SnapController {
  private static controllers = new Map<number, SnapController>()
  private static ipcRegistered = false

  private readonly win: BrowserWindow
  private readonly addon: SnapOverlayAddon | null = null
  private childHwnd: bigint | null = null
  private lastBounds: SnapBounds | null = null
  private isDisposed = false
  private currentState: SnapButtonState = 'idle'
  private readonly supported: boolean
  private readonly supportReason?: string

  private constructor(win: BrowserWindow) {
    this.win = win

    if (!isWindows11OrNewerBuild()) {
      this.supported = false
      this.supportReason = 'Windows 11 build 22000+ required'
      return
    }

    if (!win.isResizable() || !win.isMaximizable()) {
      this.supported = false
      this.supportReason = 'Window is not resizable or maximizable'
      return
    }

    this.addon = loadSnapAddon()
    if (!this.addon) {
      this.supported = false
      this.supportReason = 'Native snap overlay addon unavailable'
      return
    }

    this.supported = true
    this.initWindowListeners()
  }

  public static getOrCreate(win: BrowserWindow): SnapController {
    SnapController.ensureIpcHandlers()
    let controller = SnapController.controllers.get(win.id)
    if (!controller) {
      controller = new SnapController(win)
      SnapController.controllers.set(win.id, controller)
    }
    return controller
  }

  public static getByWindowId(id: number): SnapController | undefined {
    return SnapController.controllers.get(id)
  }

  private static ensureIpcHandlers(): void {
    if (SnapController.ipcRegistered) return
    SnapController.ipcRegistered = true

    ipcMain.handle(IPC.snapGetSupport, (event: IpcMainInvokeEvent): SnapSupportStatus => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return { supported: false, reason: 'No window found' }
      const controller = SnapController.controllers.get(win.id)
      if (!controller) return { supported: false, reason: 'Controller not found' }
      return controller.getSupportStatus()
    })

    ipcMain.on(IPC.snapUpdateBounds, (event: IpcMainEvent, rawBounds: unknown): void => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return
      // Security check: ensure sender frame matches window
      if (event.sender.isDestroyed() || win.isDestroyed()) return
      const controller = SnapController.controllers.get(win.id)
      if (!controller || !controller.isSupported()) return

      const validated = validateSnapBounds(rawBounds)
      controller.updateButtonBounds(validated)
    })
  }

  public isSupported(): boolean {
    return this.supported && this.addon !== null
  }

  public getSupportStatus(): SnapSupportStatus {
    return {
      supported: this.isSupported(),
      reason: this.supportReason
    }
  }

  private initWindowListeners(): void {
    if (this.win.isDestroyed()) return

    const onLayoutChange = (): void => {
      if (this.isDisposed || this.win.isDestroyed()) return
      this.reassertTop()
      this.requestRendererBounds()
    }

    // Window layout/geometry change events
    this.win.on('resize', onLayoutChange)
    this.win.on('maximize', onLayoutChange)
    this.win.on('unmaximize', onLayoutChange)

    // Window move end (drag finished or snapped into a zone)
    this.win.on('moved', () => {
      if (this.isDisposed || this.win.isDestroyed()) return
      this.reassertTop()
      this.requestRendererBounds()
    })

    // Reassert top of Z-order whenever window gains focus
    this.win.on('focus', () => {
      if (this.isDisposed || this.win.isDestroyed()) return
      this.reassertTop()
    })

    this.win.on('enter-full-screen', () => {
      this.setOverlayVisibility(false)
    })

    this.win.on('leave-full-screen', () => {
      this.setOverlayVisibility(true)
      onLayoutChange()
    })

    this.win.on('minimize', () => {
      this.setOverlayVisibility(false)
    })

    this.win.on('restore', () => {
      this.setOverlayVisibility(true)
      onLayoutChange()
    })

    this.win.webContents.on('did-finish-load', () => {
      if (this.isDisposed || this.win.isDestroyed()) return
      this.reassertTop()
      this.requestRendererBounds()
    })

    this.win.webContents.on('render-process-gone', () => {
      this.setOverlayVisibility(false)
    })

    this.win.once('closed', () => {
      this.dispose()
    })
  }

  public updateButtonBounds(bounds: SnapBounds | null): void {
    if (this.isDisposed || !this.isSupported() || !this.addon || this.win.isDestroyed()) {
      return
    }

    this.lastBounds = bounds

    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      this.setOverlayVisibility(false)
      return
    }

    if (this.childHwnd === null) {
      try {
        const hwndBuf = this.win.getNativeWindowHandle()
        this.childHwnd = this.addon.attach(
          hwndBuf,
          bounds.x,
          bounds.y,
          bounds.width,
          bounds.height,
          (event: string) => this.handleNativeEvent(event)
        )
      } catch (err) {
        console.warn('[SnapController] Failed to attach overlay child window:', err)
        this.childHwnd = null
      }
    } else {
      this.addon.updateRect(this.childHwnd, bounds.x, bounds.y, bounds.width, bounds.height)
      this.setOverlayVisibility(!this.win.isFullScreen() && !this.win.isMinimized())
    }
  }

  private reassertTop(): void {
    if (this.childHwnd === null || !this.addon || this.win.isDestroyed()) return
    if (this.win.isFullScreen() || this.win.isMinimized()) return
    try {
      this.addon.bringToTop(this.childHwnd)
    } catch {
      // non-fatal
    }
  }

  private requestRendererBounds(): void {
    if (this.win.isDestroyed() || this.isDisposed) return
    if (this.win.isFullScreen() || this.win.isMinimized()) return
    try {
      this.win.webContents.send(IPC.snapRequestBoundsUpdate)
    } catch {
      // non-fatal
    }
  }

  private setOverlayVisibility(visible: boolean): void {
    if (this.childHwnd === null || !this.addon) return
    try {
      this.addon.setVisible(this.childHwnd, visible)
    } catch {
      // non-fatal
    }
  }

  private handleNativeEvent(event: string): void {
    if (this.isDisposed || this.win.isDestroyed()) return

    switch (event) {
      case 'enter':
        this.sendState('hover')
        break
      case 'leave':
      case 'cancel':
        this.sendState('idle')
        break
      case 'down':
        this.sendState('pressed')
        break
      case 'click': {
        this.sendState('idle')
        this.toggleMaximize()
        break
      }
    }
  }

  private toggleMaximize(): void {
    if (this.win.isDestroyed()) return

    if (this.win.isFullScreen()) {
      this.win.setFullScreen(false)
      this.win.webContents.send(IPC.fullscreenChanged, false)
    }

    if (this.win.isMaximized()) {
      this.win.unmaximize()
      this.win.webContents.send(IPC.windowMaximizedChanged, false)
    } else {
      this.win.maximize()
      this.win.webContents.send(IPC.windowMaximizedChanged, true)
    }
  }

  private sendState(state: SnapButtonState): void {
    if (this.currentState === state) return
    this.currentState = state
    if (!this.win.isDestroyed()) {
      this.win.webContents.send(IPC.snapStateChanged, state)
    }
  }

  public debugHitTest(screenX: number, screenY: number): number {
    if (!this.addon || this.childHwnd === null) return -1
    return this.addon.debugHitTest(this.childHwnd, screenX, screenY)
  }

  public dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true

    if (this.childHwnd !== null && this.addon) {
      try {
        this.addon.detach(this.childHwnd)
      } catch {
        // non-fatal
      }
      this.childHwnd = null
    }

    SnapController.controllers.delete(this.win.id)
  }
}
