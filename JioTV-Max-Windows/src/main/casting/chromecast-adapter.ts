import ChromecastAPI from 'chromecast-api'
import { DeviceAdapter } from './device-adapter'
import type { CastDevice, CastMediaInput, CastPlaybackSubstate, CastErrorCode } from '@shared/cast-types'
import { castLogger } from './logger'

// Type signatures based on verified chromecast-api node_modules
interface ChromecastDevice {
  name: string // e.g. "Chromecast-uuid._googlecast._tcp.local"
  friendlyName: string
  host: string
  client: any
  play(media: string | object, opts?: any, callback?: (err?: Error) => void): void
  pause(callback?: (err?: Error) => void): void
  resume(callback?: (err?: Error) => void): void
  stop(callback?: (err?: Error) => void): void
  seek(seconds: number, callback?: (err?: Error) => void): void
  seekTo(seconds: number, callback?: (err?: Error) => void): void
  setVolume(volume: number, callback?: (err?: Error) => void): void
  setVolumeMuted(muted: boolean, callback?: (err?: Error) => void): void
  close(callback?: () => void): void
  on(event: 'status', callback: (status: any) => void): void
  on(event: 'connected', callback: () => void): void
  on(event: 'finished', callback: () => void): void
  removeAllListeners(): void
}

export class ChromecastAdapter extends DeviceAdapter {
  readonly protocol = 'chromecast' as const
  private client: any = null
  private discoveredDevices = new Map<string, ChromecastDevice>()
  private activeDevice: ChromecastDevice | null = null

  async startDiscovery(): Promise<void> {
    castLogger.info('[ChromecastAdapter] Starting mDNS/SSDP discovery')
    if (this.client) {
      try {
        this.client.update()
        return
      } catch {
        this.client.destroy()
        this.client = null
      }
    }

    try {
      this.client = new ChromecastAPI()
      this.client.on('device', (device: ChromecastDevice) => {
        if (!device || !device.name) return
        const normalizedId = `gcast:${device.name.replace(/\._googlecast\._tcp\.local$/, '')}`
        this.discoveredDevices.set(normalizedId, device)

        const castDevice: CastDevice = {
          id: normalizedId,
          name: device.friendlyName || device.name,
          protocol: 'chromecast',
          host: device.host,
          model: 'Google Cast Device',
          lastSeen: Date.now()
        }

        castLogger.info(`[ChromecastAdapter] Found Cast device: ${castDevice.name} (${castDevice.host})`)
        this.emit('deviceFound', castDevice)
      })

      this.client.on('error', (err: any) => {
        castLogger.error('[ChromecastAdapter] Discovery client error:', err)
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      castLogger.error('[ChromecastAdapter] Failed to initialize ChromecastAPI:', err)
      this.emit('error', {
        code: 'discovery_failed',
        message: 'Could not initialize Google Cast discovery. Check your network or firewall.',
        details: msg
      })
    }
  }

  async stopDiscovery(): Promise<void> {
    castLogger.info('[ChromecastAdapter] Stopping discovery')
    if (this.client) {
      try {
        this.client.removeAllListeners()
        this.client.destroy()
      } catch (err) {
        castLogger.warn('[ChromecastAdapter] Error destroying client:', err)
      }
      this.client = null
    }
  }

  async connect(device: CastDevice): Promise<void> {
    castLogger.info(`[ChromecastAdapter] Connecting to device: ${device.name} (${device.id})`)
    const target = this.discoveredDevices.get(device.id)
    if (!target) {
      throw new Error(`Device ${device.id} is not in discovered Chromecast list`)
    }

    this.activeDevice = target

    // Attach status listener
    target.on('status', (status: any) => {
      this.handleDeviceStatus(status)
    })

    target.on('finished', () => {
      castLogger.info('[ChromecastAdapter] Media finished')
      this.emit('status', { substate: 'idle' })
    })

    // Verify basic reachability
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('connect_timeout'))
      }, 9000)

      // Chromecast connects when play is issued, or via receiver status
      if (typeof (target as any)._tryConnect === 'function') {
        ;(target as any)._tryConnect((err: any) => {
          clearTimeout(timeout)
          if (err) {
            reject(this.mapError(err))
          } else {
            resolve()
          }
        })
      } else {
        clearTimeout(timeout)
        resolve()
      }
    })
  }

  async load(media: CastMediaInput, streamUrl: string): Promise<void> {
    if (!this.activeDevice) {
      throw new Error('No Chromecast device connected')
    }

    castLogger.info(
      `[ChromecastAdapter] Loading stream on ${this.activeDevice.friendlyName}: ${castLogger.maskUrl(streamUrl)}`
    )

    const isDrm = media.isDrm === true || streamUrl.includes('.mpd') || media.contentType?.includes('dash')
    const licenseUrl = isDrm ? streamUrl.replace(/\/manifest\.mpd(\?.*)?$/, '/license$1') : undefined

    const mediaObject: any = {
      url: streamUrl,
      contentType: isDrm
        ? 'application/dash+xml'
        : media.contentType || (streamUrl.includes('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp4'),
      streamType: media.isLive ? 'LIVE' : 'BUFFERED',
      cover: {
        title: media.title,
        url: media.imageUrl || ''
      },
      customData: isDrm && licenseUrl
        ? {
            drm: {
              licenseUrl,
              protectionSystem: 'widevine'
            }
          }
        : undefined
    }

    return new Promise<void>((resolve, reject) => {
      this.activeDevice!.play(mediaObject, (err?: Error) => {
        if (err) {
          castLogger.error('[ChromecastAdapter] Play failed:', err)
          const mapped = this.mapError(err)
          this.emit('error', mapped)
          reject(new Error(mapped.message))
        } else {
          castLogger.info('[ChromecastAdapter] Media play initiated successfully')
          resolve()
        }
      })
    })
  }

  private handleDeviceStatus(status: any): void {
    if (!status) return

    let substate: CastPlaybackSubstate = 'idle'
    const playerState = status.playerState?.toUpperCase()

    if (playerState === 'PLAYING') {
      substate = 'playing'
    } else if (playerState === 'PAUSED') {
      substate = 'paused'
    } else if (playerState === 'BUFFERING') {
      substate = 'buffering'
    } else if (playerState === 'IDLE') {
      substate = 'idle'
    }

    const volumeLevel = typeof status.volume?.level === 'number' ? status.volume.level : undefined
    const isMuted = typeof status.volume?.muted === 'boolean' ? status.volume.muted : undefined
    const currentTime = typeof status.currentTime === 'number' ? status.currentTime : undefined
    const duration = typeof status.media?.duration === 'number' ? status.media.duration : undefined

    this.emit('status', {
      substate,
      currentTime,
      duration,
      volume: volumeLevel,
      muted: isMuted
    })
  }

  private mapError(err: any): { code: CastErrorCode; message: string; details?: string } {
    const rawMsg = err?.message || String(err)
    if (rawMsg.includes('connect_timeout') || rawMsg.includes('ETIMEDOUT')) {
      return {
        code: 'connect_timeout',
        message: 'Could not connect to the Chromecast device before timeout.',
        details: rawMsg
      }
    }
    if (rawMsg.includes('ECONNREFUSED')) {
      return {
        code: 'network_blocked',
        message: 'Connection was refused by the Chromecast. Ensure it is powered on and accessible.',
        details: rawMsg
      }
    }
    if (rawMsg.includes('LOAD_FAILED') || rawMsg.includes('MEDIA_ERROR')) {
      return {
        code: 'unsupported_format',
        message: 'The Chromecast could not decode this media format.',
        details: rawMsg
      }
    }
    return {
      code: 'unknown',
      message: 'An error occurred while communicating with the Chromecast.',
      details: rawMsg
    }
  }

  async play(): Promise<void> {
    if (!this.activeDevice) return
    return new Promise<void>((resolve, reject) => {
      this.activeDevice!.resume((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async pause(): Promise<void> {
    if (!this.activeDevice) return
    return new Promise<void>((resolve, reject) => {
      this.activeDevice!.pause((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async stop(): Promise<void> {
    if (!this.activeDevice) return
    return new Promise<void>((resolve) => {
      this.activeDevice!.stop(() => resolve())
    })
  }

  async seek(seconds: number): Promise<void> {
    if (!this.activeDevice) return
    return new Promise<void>((resolve, reject) => {
      this.activeDevice!.seekTo(seconds, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async setVolume(level: number): Promise<void> {
    if (!this.activeDevice) return
    const clamped = Math.max(0, Math.min(1, level))
    return new Promise<void>((resolve, reject) => {
      this.activeDevice!.setVolume(clamped, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async setMuted(muted: boolean): Promise<void> {
    if (!this.activeDevice) return
    return new Promise<void>((resolve, reject) => {
      this.activeDevice!.setVolumeMuted(muted, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async disconnect(): Promise<void> {
    castLogger.info('[ChromecastAdapter] Disconnecting active Chromecast session')
    if (this.activeDevice) {
      try {
        this.activeDevice.removeAllListeners()
        this.activeDevice.close()
      } catch (err) {
        castLogger.warn('[ChromecastAdapter] Error closing device connection:', err)
      }
      this.activeDevice = null
    }
  }
}
