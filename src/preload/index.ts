import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { AppInfo, AuthSession, ChannelFetchPayload, EpgEntry, OtpChallenge, Result, StreamInfo } from '../shared/types'

/**
 * The only surface the renderer can touch. No Node.js primitives or raw IPC
 * objects are exposed; auth tokens returned by Jio never cross this bridge.
 */
const api = {
  isElectron: true as const,
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IPC.appInfo),
  toggleFullscreen: (): Promise<boolean> => ipcRenderer.invoke(IPC.toggleFullscreen),
  onFullscreenChange: (callback: (fullscreen: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, fullscreen: boolean) => callback(fullscreen)
    ipcRenderer.on(IPC.fullscreenChanged, listener)
    return () => ipcRenderer.removeListener(IPC.fullscreenChanged, listener)
  },
  setAlwaysOnTop: (value: boolean): Promise<boolean> => ipcRenderer.invoke(IPC.setAlwaysOnTop, value),
  setPlayerActive: (active: boolean): Promise<void> => ipcRenderer.invoke(IPC.setPlayerActive, active),
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
