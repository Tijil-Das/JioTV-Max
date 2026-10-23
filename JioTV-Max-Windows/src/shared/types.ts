/**
 * Types shared by the Electron main process, preload bridge and React renderer.
 * Keeping these in one place guarantees that IPC payloads stay in sync.
 */

export type ChannelCategory =
  | 'sports'
  | 'news'
  | 'movies'
  | 'kids'
  | 'entertainment'
  | 'regional'

export type ChannelQuality = 'SD' | 'HD' | '4K'

export interface Channel {
  id: string
  number: number
  name: string
  logoUrl: string
  /** Brand tint used for cards, hero art and fallback avatars. */
  brandColor: string
  category: ChannelCategory
  language: string
  isLive: boolean
  quality: ChannelQuality[]
  /** Present for demo channels; real streams are resolved just-in-time. */
  streamUrl?: string
  isPremium: boolean
  source: 'demo' | 'jio'
  description?: string
  /** Optional popularity signals supplied by the channel API. */
  isFeatured?: boolean
  trending?: boolean
  rank?: number
  viewers?: number
  popularity?: number
}

export interface Program {
  id: string
  channelId: string
  title: string
  description: string
  /** ISO-8601 timestamps, rendered in the user's local timezone. */
  start: string
  end: string
  genre: string
  rating?: string
  artworkUrl?: string
}

export type PlaybackType = 'hls' | 'dash'

export interface WidevineInfo {
  licenseUrl: string
  headers?: Record<string, string>
}

export interface StreamInfo {
  channelId: string
  url: string
  type: PlaybackType
  isLive: boolean
  isDrm: boolean
  drm?: WidevineInfo
  headers?: Record<string, string>
  /** Short human-readable context shown in the player error card. */
  note?: string
  source: 'demo' | 'jio'
}

export type AuthMode = 'demo' | 'jio'

export interface AuthUser {
  id: string
  phone: string
  name: string
  mode: AuthMode
}

export interface AuthSession {
  user: AuthUser
  /** Never a token — Jio tokens remain inside the main process. */
  issuedAt: string
}

export interface OtpChallenge {
  sent: boolean
  /** Masked number echoed back by the backend, e.g. +91 ••••• 43210. */
  maskedPhone: string
  /** Present only in demo mode and when explicitly exposed by the backend. */
  demoCode?: string
  expiresInSeconds: number
}

export interface EpgEntry {
  startEpoch: number
  endEpoch: number
  channelId: string
  title: string
  description: string
  category: string
  thumbnail?: string
}

export interface AppInfo {
  version: string
  platform: string
  electron: string
  /** Base URL of the local media relay, e.g. "http://127.0.0.1:52100" */
  relayBase: string
}

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; retryable?: boolean }

export interface ChannelFetchPayload {
  channels: Channel[]
  source: 'demo' | 'jio'
  fetchedAt: string
}

export interface PlayerActivity {
  active: boolean
}

export interface AssetFetchPayload {
  bytes: Uint8Array
  mimeType: string
  /** True when the bytes came from the on-disk logo cache. */
  cached: boolean
}

export interface StreamProbeStage1 {
  ok: boolean
  reason?: string
  /** Number of media segments found in the playlist. */
  segments?: number
  /** Final media-playlist URL after following a master playlist. */
  playlistUrl?: string
  /** First segment URL that was range-fetched. */
  segmentUrl?: string
  status?: number
  bytes?: number
}

/** Channels available on the preload bridge. */
export interface StreamDeckApi {
  isElectron: true
  getAppInfo(): Promise<AppInfo>
  toggleFullscreen(): Promise<boolean>
  setFullscreen(value: boolean): Promise<boolean>
  onFullscreenChange(callback: (fullscreen: boolean) => void): () => void
  minimize(): Promise<void>
  maximize(): Promise<boolean>
  close(): Promise<void>
  isMaximized(): Promise<boolean>
  onMaximizedChange(callback: (maximized: boolean) => void): () => void
  setAlwaysOnTop(value: boolean): Promise<boolean>
  setPlayerActive(active: boolean): Promise<void>
  assets: {
    fetch(url: string): Promise<Result<AssetFetchPayload>>
  }
  streams: {
    /** Main-process playlist/segment verification used by the live hero. */
    probeStage1(url: string): Promise<StreamProbeStage1>
  }
  auth: {
    requestOtp(phone: string): Promise<Result<OtpChallenge>>
    verifyOtp(phone: string, otp: string): Promise<Result<AuthSession>>
    restore(): Promise<AuthSession | null>
    logout(): Promise<void>
    onExpired(callback: (payload: { reason: string }) => void): () => void
  }
  channels: {
    fetchAll(): Promise<Result<ChannelFetchPayload>>
    getStream(channelId: string, quality: 'auto' | 'high' | 'medium' | 'low'): Promise<Result<StreamInfo>>
    getEpg(channelId: string): Promise<Result<EpgEntry[]>>
    getFeatured?(): Promise<Result<Array<{ channelId: string; priority: number }>>>
  }
  secure: {
    saveToken(token: string): Promise<boolean>
    loadToken(): Promise<string | null>
    clearToken(): Promise<void>
  }
  snapLayout: SnapBridge
}

export interface SnapSupportStatus {
  supported: boolean
  reason?: string
}

export interface SnapBounds {
  x: number
  y: number
  width: number
  height: number
}

export type SnapButtonState = 'idle' | 'hover' | 'pressed'

export interface SnapBridge {
  getSupportStatus(): Promise<SnapSupportStatus>
  updateBounds(bounds: SnapBounds | null): void
  onStateChange(callback: (state: SnapButtonState) => void): () => void
  onRequestBoundsUpdate?(callback: () => void): () => void
}

export interface UpdaterBridge {
  getState(): Promise<{ readyVersion: string | null }>
  check(): Promise<{ status: string; readyVersion?: string | null; version?: string; error?: string }>
  onReady(cb: (version: string) => void): void
  restart(): void
}

