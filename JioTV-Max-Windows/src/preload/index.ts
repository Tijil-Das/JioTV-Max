import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type {
  AppInfo,
  AssetFetchPayload,
  AuthSession,
  ChannelFetchPayload,
  EpgEntry,
  OtpChallenge,
  Result,
  StreamInfo,
  StreamProbeStage1,
  SnapSupportStatus,
  SnapBounds,
  SnapButtonState
} from '../shared/types'
import type {
  CastDevice,
  CastStatePayload,
  CastErrorPayload,
  CastDiagnostics,
  StartCastParams,
  FallbackReceiverInfo,
  CastMediaInput,
  CastApiBridge
} from '../shared/cast-types'

/**
 * The only surface the renderer can touch. No Node.js primitives or raw IPC
 * objects are exposed; auth tokens returned by Jio never cross this bridge.
 */
const api = {
  isElectron: true as const,
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IPC.appInfo),
  toggleFullscreen: (): Promise<boolean> => ipcRenderer.invoke(IPC.toggleFullscreen),
  setFullscreen: (value: boolean): Promise<boolean> => ipcRenderer.invoke(IPC.setFullscreen, value),
  onFullscreenChange: (callback: (fullscreen: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, fullscreen: boolean) => callback(fullscreen)
    ipcRenderer.on(IPC.fullscreenChanged, listener)
    return () => ipcRenderer.removeListener(IPC.fullscreenChanged, listener)
  },
  minimize: (): Promise<void> => ipcRenderer.invoke(IPC.windowMinimize),
  maximize: (): Promise<boolean> => ipcRenderer.invoke(IPC.windowMaximize),
  close: (): Promise<void> => ipcRenderer.invoke(IPC.windowClose),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke(IPC.windowIsMaximized),
  onMaximizedChange: (callback: (maximized: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized)
    ipcRenderer.on(IPC.windowMaximizedChanged, listener)
    return () => ipcRenderer.removeListener(IPC.windowMaximizedChanged, listener)
  },
  setAlwaysOnTop: (value: boolean): Promise<boolean> => ipcRenderer.invoke(IPC.setAlwaysOnTop, value),
  setPlayerActive: (active: boolean): Promise<void> => ipcRenderer.invoke(IPC.setPlayerActive, active),
  assets: {
    fetch: (url: string): Promise<Result<AssetFetchPayload>> => ipcRenderer.invoke(IPC.assetFetch, url)
  },
  streams: {
    probeStage1: (url: string): Promise<StreamProbeStage1> =>
      ipcRenderer.invoke(IPC.probeStage1, url)
  },
  auth: {
    requestOtp: (phone: string): Promise<Result<OtpChallenge>> => ipcRenderer.invoke(IPC.requestOtp, phone),
    verifyOtp: (phone: string, otp: string): Promise<Result<AuthSession>> =>
      ipcRenderer.invoke(IPC.verifyOtp, phone, otp),
    restore: (): Promise<AuthSession | null> => ipcRenderer.invoke(IPC.restoreSession),
    logout: (): Promise<void> => ipcRenderer.invoke(IPC.logout),
    onExpired: (callback: (payload: { reason: string }) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: { reason: string }) => callback(payload)
      ipcRenderer.on(IPC.authExpired, listener)
      return () => ipcRenderer.removeListener(IPC.authExpired, listener)
    }
  },
  channels: {
    fetchAll: (): Promise<Result<ChannelFetchPayload>> => ipcRenderer.invoke(IPC.fetchChannels),
    getStream: (
      channelId: string,
      quality: 'auto' | 'high' | 'medium' | 'low'
    ): Promise<Result<StreamInfo>> => ipcRenderer.invoke(IPC.getStream, channelId, quality),
    getEpg: (channelId: string): Promise<Result<EpgEntry[]>> => ipcRenderer.invoke(IPC.getEpg, channelId),
    getFeatured: (): Promise<Result<Array<{ channelId: string; priority: number }>>> =>
      ipcRenderer.invoke(IPC.getFeatured)
  },
  secure: {
    saveToken: (token: string): Promise<boolean> => ipcRenderer.invoke(IPC.secureSave, token),
    loadToken: (): Promise<string | null> => ipcRenderer.invoke(IPC.secureLoad),
    clearToken: (): Promise<void> => ipcRenderer.invoke(IPC.secureClear)
  },
  snapLayout: {
    getSupportStatus: (): Promise<SnapSupportStatus> => ipcRenderer.invoke(IPC.snapGetSupport),
    updateBounds: (bounds: SnapBounds | null): void => ipcRenderer.send(IPC.snapUpdateBounds, bounds),
    onStateChange: (callback: (state: SnapButtonState) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: SnapButtonState) => callback(state)
      ipcRenderer.on(IPC.snapStateChanged, listener)
      return () => ipcRenderer.removeListener(IPC.snapStateChanged, listener)
    }
  }
}

const updater = {
  getState: (): Promise<{ readyVersion: string | null }> =>
    ipcRenderer.invoke('update:get-state').catch(() => ({ readyVersion: null })),
  check: (): Promise<{ status: string; readyVersion?: string | null; version?: string; error?: string }> =>
    ipcRenderer.invoke('update:check').catch(() => ({
      status: 'dev-mode',
      error: 'Updates are enabled in packaged desktop builds'
    })),
  onReady: (cb: (version: string) => void) =>
    ipcRenderer.on('update:ready', (_e: Electron.IpcRendererEvent, version: string) => cb(version)),
  restart: (): void => {
    ipcRenderer.send('update:restart')
  }
}

const castApi: CastApiBridge = {
  startDiscovery: (): Promise<boolean> => ipcRenderer.invoke(IPC.castStartDiscovery),
  stopDiscovery: (): Promise<boolean> => ipcRenderer.invoke(IPC.castStopDiscovery),
  getDevices: (): Promise<CastDevice[]> => ipcRenderer.invoke(IPC.castGetDevices),
  start: (params: StartCastParams): Promise<boolean> => ipcRenderer.invoke(IPC.castStart, params),
  stop: (): Promise<boolean> => ipcRenderer.invoke(IPC.castStop),
  pause: (): Promise<boolean> => ipcRenderer.invoke(IPC.castPause),
  resume: (): Promise<boolean> => ipcRenderer.invoke(IPC.castResume),
  seek: (seconds: number): Promise<boolean> => ipcRenderer.invoke(IPC.castSeek, seconds),
  setVolume: (level: number): Promise<boolean> => ipcRenderer.invoke(IPC.castSetVolume, level),
  setMuted: (muted: boolean): Promise<boolean> => ipcRenderer.invoke(IPC.castSetMuted, muted),
  getState: (): Promise<CastStatePayload> => ipcRenderer.invoke(IPC.castGetState),
  getDiagnostics: (): Promise<CastDiagnostics> => ipcRenderer.invoke(IPC.castGetDiagnostics),
  getFallbackInfo: (media: CastMediaInput): Promise<FallbackReceiverInfo | null> =>
    ipcRenderer.invoke(IPC.castGetFallbackInfo, media),
  feedLiveChunk: (token: string, chunk: ArrayBuffer): Promise<boolean> =>
    ipcRenderer.invoke(IPC.castFeedLiveChunk, token, chunk),
  startLiveRelay: (token: string, mimeType: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.castStartLiveRelay, token, mimeType),
  stopLiveRelay: (token: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.castStopLiveRelay, token),
  getAppWindowSource: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC.castGetAppWindowSource),
  onDevicesUpdated: (callback: (devices: CastDevice[]) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, devices: CastDevice[]) => callback(devices)
    ipcRenderer.on(IPC.castDevicesUpdated, listener)
    return () => ipcRenderer.removeListener(IPC.castDevicesUpdated, listener)
  },
  onStateChanged: (callback: (state: CastStatePayload) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: CastStatePayload) => callback(state)
    ipcRenderer.on(IPC.castStateChanged, listener)
    return () => ipcRenderer.removeListener(IPC.castStateChanged, listener)
  },
  onError: (callback: (error: CastErrorPayload) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, error: CastErrorPayload) => callback(error)
    ipcRenderer.on(IPC.castError, listener)
    return () => ipcRenderer.removeListener(IPC.castError, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('updater', updater)
contextBridge.exposeInMainWorld('castApi', castApi)

export type StreamDeckBridge = typeof api
export type UpdaterBridgeType = typeof updater
export type CastBridgeType = typeof castApi

