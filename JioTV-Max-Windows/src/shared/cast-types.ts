/**
 * Unified casting type definitions and IPC contracts.
 */

export type CastProtocol = 'chromecast' | 'dlna' | 'airplay' | 'mock'

export type CastDevice = {
  id: string
  name: string
  protocol: CastProtocol
  host: string
  model: string | null
  lastSeen: number
}

export type CastSessionState =
  | 'idle'
  | 'discovering'
  | 'connecting'
  | 'loading'
  | 'casting'
  | 'stopping'
  | 'error'

export type CastPlaybackSubstate = 'playing' | 'paused' | 'buffering' | 'idle'

export interface CastMediaInput {
  url: string
  title: string
  imageUrl?: string
  isLive: boolean
  contentType?: string
  headers?: Record<string, string>
  isDecryptedRelay?: boolean
  isDrm?: boolean
}

export interface CastStatePayload {
  state: CastSessionState
  substate: CastPlaybackSubstate
  device: CastDevice | null
  media?: CastMediaInput | null
  error?: string | null
  position?: number
  duration?: number
  volume?: number
  muted?: boolean
  token?: string
}

export type CastErrorCode =
  | 'connect_timeout'
  | 'playback_not_started'
  | 'unsupported_format'
  | 'device_lost'
  | 'discovery_failed'
  | 'network_blocked'
  | 'stream_error'
  | 'device_busy'
  | 'unknown'

export interface CastErrorPayload {
  code: CastErrorCode
  userMessage: string
  details?: string
}

export interface CastDiagnostics {
  appVersion: string
  osVersion: string
  deviceModel: string | null
  deviceProtocol: CastProtocol | null
  stateHistory: Array<{ state: CastSessionState; substate: CastPlaybackSubstate; timestamp: number }>
  lastLogs: string[]
  errorCode?: CastErrorCode
}

export interface FallbackReceiverInfo {
  url: string
  qrDataUrl: string
  token: string
}

export interface StartCastParams {
  deviceId: string
  media: CastMediaInput
}

/**
 * window.castApi exposed via contextBridge in preload
 */
export interface CastApiBridge {
  startDiscovery: () => Promise<boolean>
  stopDiscovery: () => Promise<boolean>
  getDevices: () => Promise<CastDevice[]>
  start: (params: StartCastParams) => Promise<boolean>
  stop: () => Promise<boolean>
  pause: () => Promise<boolean>
  resume: () => Promise<boolean>
  seek: (seconds: number) => Promise<boolean>
  setVolume: (level: number) => Promise<boolean>
  setMuted: (muted: boolean) => Promise<boolean>
  getState: () => Promise<CastStatePayload>
  getDiagnostics: () => Promise<CastDiagnostics>
  getFallbackInfo: (media: CastMediaInput) => Promise<FallbackReceiverInfo | null>
  feedLiveChunk: (token: string, chunk: ArrayBuffer) => Promise<boolean>
  startLiveRelay: (token: string, mimeType: string) => Promise<boolean>
  stopLiveRelay: (token: string) => Promise<boolean>
  getAppWindowSource: () => Promise<string | null>
  onDevicesUpdated: (callback: (devices: CastDevice[]) => void) => () => void
  onStateChanged: (callback: (state: CastStatePayload) => void) => () => void
  onError: (callback: (error: CastErrorPayload) => void) => () => void
}
