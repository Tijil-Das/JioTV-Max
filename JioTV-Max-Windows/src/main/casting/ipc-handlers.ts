import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  StartCastParams,
  CastDevice,
  CastStatePayload,
  CastDiagnostics,
  FallbackReceiverInfo,
  CastMediaInput
} from '@shared/cast-types'
import { CastManager } from './cast-manager'
import { castLogger } from './logger'

function isValidHttpUrl(urlString: unknown): boolean {
  if (typeof urlString !== 'string' || urlString.length > 2048) return false
  try {
    const parsed = new URL(urlString)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function sanitizeString(str: unknown, maxLen = 256): string {
  if (typeof str !== 'string') return ''
  return str.slice(0, maxLen).trim()
}

export function registerCastIpc(castManager: CastManager): void {
  // Discovery
  ipcMain.handle(IPC.castStartDiscovery, async (event: IpcMainInvokeEvent): Promise<boolean> => {
    castManager.setWebContents(event.sender)
    await castManager.startDiscovery()
    return true
  })

  ipcMain.handle(IPC.castStopDiscovery, async (): Promise<boolean> => {
    await castManager.stopDiscovery()
    return true
  })

  ipcMain.handle(IPC.castGetDevices, (): CastDevice[] => {
    return castManager.getDevices()
  })

  // Session start
  ipcMain.handle(
    IPC.castStart,
    async (event: IpcMainInvokeEvent, params: StartCastParams): Promise<boolean> => {
      castManager.setWebContents(event.sender)

      if (!params || typeof params !== 'object') {
        throw new Error('Invalid casting parameters')
      }

      const deviceId = sanitizeString(params.deviceId, 128)
      if (!deviceId) {
        throw new Error('Missing target deviceId')
      }

      const media = params.media
      if (!media || !isValidHttpUrl(media.url)) {
        throw new Error('Invalid media stream URL. Only HTTP and HTTPS URLs are permitted.')
      }

      const validatedMedia: CastMediaInput = {
        url: media.url,
        title: sanitizeString(media.title, 120) || 'Live Broadcast',
        imageUrl: isValidHttpUrl(media.imageUrl) ? media.imageUrl : undefined,
        isLive: Boolean(media.isLive),
        contentType: sanitizeString(media.contentType, 64) || undefined,
        isDecryptedRelay: Boolean(media.isDecryptedRelay),
        isDrm: Boolean(media.isDrm),
        licenseUrl: isValidHttpUrl(media.licenseUrl) ? media.licenseUrl : undefined,
        channelId: sanitizeString(media.channelId, 64) || undefined,
        headers:
          media.headers && typeof media.headers === 'object'
            ? Object.fromEntries(
                Object.entries(media.headers)
                  .filter(([k, v]) => typeof k === 'string' && typeof v === 'string')
                  .slice(0, 20)
              )
            : undefined
      }

      return castManager.startSession(deviceId, validatedMedia)
    }
  )

  ipcMain.handle(IPC.castStop, async (): Promise<boolean> => {
    return castManager.stopSession()
  })

  ipcMain.handle(IPC.castPause, async (): Promise<boolean> => {
    return castManager.pause()
  })

  ipcMain.handle(IPC.castResume, async (): Promise<boolean> => {
    return castManager.resume()
  })

  ipcMain.handle(IPC.castSeek, async (_event, seconds: unknown): Promise<boolean> => {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
      return false
    }
    return castManager.seek(Math.min(seconds, 86400 * 7))
  })

  ipcMain.handle(IPC.castSetVolume, async (_event, level: unknown): Promise<boolean> => {
    if (typeof level !== 'number' || !Number.isFinite(level)) {
      return false
    }
    return castManager.setVolume(Math.max(0, Math.min(1, level)))
  })

  ipcMain.handle(IPC.castSetMuted, async (_event, muted: unknown): Promise<boolean> => {
    return castManager.setMuted(Boolean(muted))
  })

  ipcMain.handle(IPC.castGetState, (): CastStatePayload => {
    return castManager.getStatePayload()
  })

  ipcMain.handle(IPC.castGetDiagnostics, (): CastDiagnostics => {
    return castManager.getDiagnostics()
  })

  ipcMain.handle(
    IPC.castGetFallbackInfo,
    async (_event, media: CastMediaInput): Promise<FallbackReceiverInfo | null> => {
      if (!media || !isValidHttpUrl(media.url)) return null
      const server = castManager.getStreamServer()
      if (!server) return null
      return server.generateFallbackReceiver(media)
    }
  )

  ipcMain.handle(IPC.castFeedLiveChunk, async (_event, token: unknown, chunk: unknown): Promise<boolean> => {
    const server = castManager.getStreamServer()
    if (!server) return false
    const tokenStr = typeof token === 'string' ? token : ''

    if (Buffer.isBuffer(chunk)) {
      server.feedChunk(chunk, tokenStr)
      return true
    } else if (chunk instanceof ArrayBuffer) {
      server.feedChunk(Buffer.from(chunk), tokenStr)
      return true
    } else if (ArrayBuffer.isView(chunk)) {
      server.feedChunk(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength), tokenStr)
      return true
    }
    return false
  })

  ipcMain.handle(IPC.castStartLiveRelay, async (_event, token: unknown, mimeType: unknown): Promise<boolean> => {
    const server = castManager.getStreamServer()
    if (!server) return false
    const tokenStr = typeof token === 'string' ? token : ''
    const mimeStr = typeof mimeType === 'string' ? mimeType : 'video/mp4'
    server.startLiveRelay(tokenStr, mimeStr)
    return true
  })

  ipcMain.handle(IPC.castStopLiveRelay, async (_event, token: unknown): Promise<boolean> => {
    const server = castManager.getStreamServer()
    if (!server) return false
    const tokenStr = typeof token === 'string' ? token : undefined
    server.stopLiveRelay(tokenStr)
    return true
  })

  ipcMain.handle(IPC.castGetAppWindowSource, async (): Promise<string | null> => {
    try {
      const { desktopCapturer } = await import('electron')
      const sources = await desktopCapturer.getSources({ types: ['window'] })
      const appWin = sources.find((s) => /jiotv/i.test(s.name)) || sources[0]
      return appWin ? appWin.id : null
    } catch (err) {
      castLogger.warn('[CastIPC] getAppWindowSource failed:', err)
      return null
    }
  })

  castLogger.info('[CastIPC] Registered all casting IPC handlers')
}
