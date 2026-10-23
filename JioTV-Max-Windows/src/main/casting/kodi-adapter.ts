import http from 'node:http'
import { DeviceAdapter } from './device-adapter'
import type { CastDevice, CastMediaInput, CastPlaybackSubstate, CastErrorCode } from '@shared/cast-types'
import { getLanIpAddress } from './network-utils'
import { castLogger } from './logger'

export class KodiAdapter extends DeviceAdapter {
  readonly protocol = 'kodi' as const
  private activeDevice: CastDevice | null = null
  private discoveredDevices = new Map<string, CastDevice>()
  private searchInterval: NodeJS.Timeout | null = null
  private statusInterval: NodeJS.Timeout | null = null
  private activePlayerId: number | null = null

  async startDiscovery(): Promise<void> {
    castLogger.info('[KodiAdapter] Starting Kodi JSON-RPC discovery')
    this.stopDiscovery()

    // Immediate initial probe
    void this.probeKodiInstances()

    // Periodically re-probe while discovery is active
    this.searchInterval = setInterval(() => {
      void this.probeKodiInstances()
    }, 4000)
  }

  async stopDiscovery(): Promise<void> {
    castLogger.info('[KodiAdapter] Stopping Kodi discovery')
    if (this.searchInterval) {
      clearInterval(this.searchInterval)
      this.searchInterval = null
    }
  }

  private async probeKodiInstances(): Promise<void> {
    const lanIp = getLanIpAddress()
    const targetIps: string[] = ['127.0.0.1']
    if (lanIp && lanIp !== '127.0.0.1') {
      targetIps.push(lanIp)
    }

    // Common ports for Kodi remote control over HTTP
    const ports = [8080, 8088]

    for (const ip of targetIps) {
      for (const port of ports) {
        try {
          const pingRes = await this.jsonRpc(ip, port, 'JSONRPC.Ping', {}, 1500)
          if (pingRes === 'pong' || pingRes?.result === 'pong') {
            await this.registerKodiDevice(ip, port)
          }
        } catch {
          // Port not listening or not Kodi
        }
      }
    }
  }

  /**
   * Registers or updates a confirmed Kodi device
   */
  public async registerKodiDevice(host: string, port = 8080): Promise<void> {
    try {
      const props = await this.jsonRpc(host, port, 'Application.GetProperties', {
        properties: ['name', 'version', 'volume', 'muted']
      })
      const versionObj = props?.version
      const versionStr = versionObj ? `${versionObj.major}.${versionObj.minor}` : ''
      const isLocal = host === '127.0.0.1' || host === 'localhost'
      const friendlyName = isLocal ? 'Kodi (This PC)' : `Kodi (${host})`
      const id = `kodi:${host}:${port}`

      const device: CastDevice = {
        id,
        name: friendlyName,
        protocol: 'kodi',
        host,
        model: `Kodi Media Center ${versionStr}`.trim(),
        lastSeen: Date.now()
      }

      const existing = this.discoveredDevices.get(id)
      if (!existing) {
        this.discoveredDevices.set(id, device)
        castLogger.info(`[KodiAdapter] Discovered Kodi device: ${device.name} [v${versionStr}] (${host}:${port})`)
        this.emit('deviceFound', device)
      } else {
        existing.lastSeen = Date.now()
        this.discoveredDevices.set(id, existing)
      }
    } catch (err) {
      castLogger.warn(`[KodiAdapter] Failed to query Kodi properties on ${host}:${port}:`, err)
    }
  }

  async connect(device: CastDevice): Promise<void> {
    castLogger.info(`[KodiAdapter] Connecting to ${device.name} (${device.host})`)
    const port = this.extractPort(device.id) || 8080

    try {
      const ping = await this.jsonRpc(device.host, port, 'JSONRPC.Ping', {}, 3000)
      if (ping !== 'pong' && ping?.result !== 'pong') {
        throw new Error('Kodi did not respond with pong')
      }
      this.activeDevice = device
      castLogger.info(`[KodiAdapter] Connected successfully to ${device.name}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      castLogger.error(`[KodiAdapter] Connect failed: ${msg}`)
      throw new Error(`Could not connect to Kodi on ${device.host}: ${msg}`)
    }
  }

  async load(media: CastMediaInput, streamUrl: string): Promise<void> {
    if (!this.activeDevice) {
      throw new Error('No Kodi device connected')
    }

    const port = this.extractPort(this.activeDevice.id) || 8080
    const isDrm = media.isDrm === true || media.contentType?.includes('dash') || streamUrl.includes('.mpd')

    castLogger.info(
      `[KodiAdapter] Loading ${isDrm ? 'DRM DASH' : 'HLS'} stream on ${this.activeDevice.name}: ${castLogger.maskUrl(
        streamUrl
      )}`
    )

    let openItem: any

    if (isDrm) {
      // In accordance with Kodi JSON-RPC Player.Open specification:
      // Pass manifest.mpd and point inputstream.adaptive to local StreamServer /license proxy
      const licenseUrl = streamUrl.replace(/\/manifest\.mpd(\?.*)?$/, '/license$1')
      openItem = {
        file: streamUrl,
        properties: {
          inputstream: 'inputstream.adaptive',
          'inputstream.adaptive.manifest_type': 'mpd',
          'inputstream.adaptive.license_type': 'com.widevine.alpha',
          'inputstream.adaptive.license_key': licenseUrl
        }
      }
    } else {
      // Direct file playback for clear HLS streams
      openItem = {
        file: streamUrl
      }
    }

    try {
      const res = await this.jsonRpc(this.activeDevice.host, port, 'Player.Open', {
        item: openItem
      })
      castLogger.info('[KodiAdapter] Player.Open response:', res)

      // Start polling playback state
      this.startStatusPolling(this.activeDevice.host, port)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      castLogger.error('[KodiAdapter] Player.Open failed:', err)
      this.emit('error', {
        code: 'unsupported_format',
        message: 'Kodi could not start playing this stream. Check if inputstream.adaptive is enabled in Kodi.',
        details: msg
      })
      throw new Error(`Kodi playback failed: ${msg}`)
    }
  }

  private startStatusPolling(host: string, port: number): void {
    this.stopStatusPolling()

    let activePlayerSeen = false

    this.statusInterval = setInterval(async () => {
      try {
        const players = await this.jsonRpc(host, port, 'Player.GetActivePlayers', {}, 2000)
        const playerList: any[] = Array.isArray(players) ? players : players?.result || []

        if (playerList.length > 0) {
          activePlayerSeen = true
          this.activePlayerId = playerList[0].playerid

          const props = await this.jsonRpc(
            host,
            port,
            'Player.GetProperties',
            {
              playerid: this.activePlayerId,
              properties: ['time', 'totaltime', 'speed', 'percentage']
            },
            2000
          )

          const result = props?.result || props
          const speed = typeof result?.speed === 'number' ? result.speed : 1
          const substate: CastPlaybackSubstate = speed > 0 ? 'playing' : 'paused'

          const curSeconds = result?.time
            ? (result.time.hours || 0) * 3600 + (result.time.minutes || 0) * 60 + (result.time.seconds || 0)
            : undefined

          const durSeconds = result?.totaltime
            ? (result.totaltime.hours || 0) * 3600 + (result.totaltime.minutes || 0) * 60 + (result.totaltime.seconds || 0)
            : undefined

          this.emit('status', {
            substate,
            currentTime: curSeconds,
            duration: durSeconds
          })
        } else if (activePlayerSeen) {
          // Playback stopped on Kodi
          activePlayerSeen = false
          this.activePlayerId = null
          this.emit('status', { substate: 'idle' })
        }
      } catch (err) {
        castLogger.debug('[KodiAdapter] Status polling tick error:', err)
      }
    }, 1500)
  }

  private stopStatusPolling(): void {
    if (this.statusInterval) {
      clearInterval(this.statusInterval)
      this.statusInterval = null
    }
    this.activePlayerId = null
  }

  async play(): Promise<void> {
    if (!this.activeDevice) return
    const port = this.extractPort(this.activeDevice.id) || 8080
    const playerId = this.activePlayerId ?? 1
    await this.jsonRpc(this.activeDevice.host, port, 'Player.PlayPause', {
      playerid: playerId,
      play: true
    })
  }

  async pause(): Promise<void> {
    if (!this.activeDevice) return
    const port = this.extractPort(this.activeDevice.id) || 8080
    const playerId = this.activePlayerId ?? 1
    await this.jsonRpc(this.activeDevice.host, port, 'Player.PlayPause', {
      playerid: playerId,
      play: false
    })
  }

  async stop(): Promise<void> {
    this.stopStatusPolling()
    if (!this.activeDevice) return
    const port = this.extractPort(this.activeDevice.id) || 8080
    const playerId = this.activePlayerId ?? 1
    try {
      await this.jsonRpc(this.activeDevice.host, port, 'Player.Stop', {
        playerid: playerId
      })
    } catch {}
  }

  async seek(seconds: number): Promise<void> {
    if (!this.activeDevice) return
    const port = this.extractPort(this.activeDevice.id) || 8080
    const playerId = this.activePlayerId ?? 1
    await this.jsonRpc(this.activeDevice.host, port, 'Player.Seek', {
      playerid: playerId,
      value: { seconds }
    })
  }

  async setVolume(level: number): Promise<void> {
    if (!this.activeDevice) return
    const port = this.extractPort(this.activeDevice.id) || 8080
    const volumePercent = Math.round(Math.max(0, Math.min(1, level)) * 100)
    await this.jsonRpc(this.activeDevice.host, port, 'Application.SetVolume', {
      volume: volumePercent
    })
  }

  async setMuted(muted: boolean): Promise<void> {
    if (!this.activeDevice) return
    const port = this.extractPort(this.activeDevice.id) || 8080
    await this.jsonRpc(this.activeDevice.host, port, 'Application.SetMute', {
      mute: muted
    })
  }

  async disconnect(): Promise<void> {
    castLogger.info('[KodiAdapter] Disconnecting Kodi session')
    this.stopStatusPolling()
    this.activeDevice = null
  }

  private extractPort(deviceId: string): number {
    const parts = deviceId.split(':')
    if (parts.length >= 3) {
      const p = parseInt(parts[2], 10)
      if (!isNaN(p) && p > 0) return p
    }
    return 8080
  }

  /**
   * Dispatches a JSON-RPC 2.0 command over HTTP to Kodi
   */
  private jsonRpc(host: string, port: number, method: string, params: any = {}, timeoutMs = 4000): Promise<any> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id: 1
      })

      const req = http.request(
        {
          hostname: host,
          port,
          path: '/jsonrpc',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          },
          timeout: timeoutMs
        },
        (res) => {
          let data = ''
          res.on('data', (c) => (data += c))
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data)
              if (parsed.error) {
                reject(new Error(parsed.error.message || `Kodi JSON-RPC error ${parsed.error.code}`))
              } else {
                resolve(parsed.result !== undefined ? parsed.result : parsed)
              }
            } catch (err) {
              reject(err)
            }
          })
        }
      )

      req.on('error', (err) => reject(err))
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Kodi JSON-RPC request timed out'))
      })

      req.write(payload)
      req.end()
    })
  }
}
