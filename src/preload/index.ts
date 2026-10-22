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
  StreamProbeStage1
} from '../shared/types'

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
    logout: (): Promise<void> => ipcRenderer.invoke(IPC.logout)
  },
  channels: {
    fetchAll: (): Promise<Result<ChannelFetchPayload>> => ipcRenderer.invoke(IPC.fetchChannels),
    getStream: (
      channelId: string,
      quality: 'auto' | 'high' | 'medium' | 'low'
    ): Promise<Result<StreamInfo>> => ipcRenderer.invoke(IPC.getStream, channelId, quality),
    getEpg: (channelId: string): Promise<Result<EpgEntry[]>> => ipcRenderer.invoke(IPC.getEpg, channelId)
  },
  secure: {
    saveToken: (token: string): Promise<boolean> => ipcRenderer.invoke(IPC.secureSave, token),
    loadToken: (): Promise<string | null> => ipcRenderer.invoke(IPC.secureLoad),
    clearToken: (): Promise<void> => ipcRenderer.invoke(IPC.secureClear)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type StreamDeckBridge = typeof api
