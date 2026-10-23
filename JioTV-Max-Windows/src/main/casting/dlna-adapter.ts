import { Client as SsdpClient } from 'node-ssdp'
import MediaRendererClient from 'upnp-mediarenderer-client'
import http from 'node:http'
import { DeviceAdapter } from './device-adapter'
import type { CastDevice, CastMediaInput, CastPlaybackSubstate, CastErrorCode } from '@shared/cast-types'
import { getLanIpAddress } from './network-utils'
import { castLogger } from './logger'

interface DlnaDeviceRecord {
  id: string
  name: string
  host: string
  model: string
  location: string
  manufacturer?: string
}

export class DlnaAdapter extends DeviceAdapter {
  readonly protocol = 'dlna' as const
  private ssdp: SsdpClient | null = null
  private discoveredDevices = new Map<string, DlnaDeviceRecord>()
  private activeClient: any = null
  private activeDevice: DlnaDeviceRecord | null = null
  private positionPollingInterval: NodeJS.Timeout | null = null
  private searchInterval: NodeJS.Timeout | null = null

  async startDiscovery(): Promise<void> {
    castLogger.info('[DlnaAdapter] Starting SSDP MediaRenderer discovery')
    this.stopDiscovery()

    try {
      this.ssdp = new SsdpClient({
        // Handle EADDRINUSE gracefully on Windows by binding to random port if 1900 is occupied
        explicitSocketBind: false
      })

      this.ssdp.on('response', (headers: any, statusCode: number, rinfo: any) => {
        const locationUrl = headers.LOCATION || headers.location || headers.Location
        if (statusCode !== 200 || !locationUrl) return
        const host = rinfo?.address || new URL(locationUrl).hostname || 'unknown'
        this.fetchDeviceDescription(locationUrl, host)
      })

      // Also listen for unsolicited advertise-alive NOTIFY broadcasts from active TVs
      this.ssdp.on('advertise-alive', (headers: any, rinfo: any) => {
        const locationUrl = headers.LOCATION || headers.location || headers.Location
        if (!locationUrl) return
        const host = rinfo?.address || new URL(locationUrl).hostname || 'unknown'
        this.fetchDeviceDescription(locationUrl, host)
      })

      // Send initial SSDP M-SEARCH for MediaRenderer:1, AVTransport, and ssdp:all
      this.ssdp.search('urn:schemas-upnp-org:device:MediaRenderer:1')
      this.ssdp.search('urn:schemas-upnp-org:service:AVTransport:1')
      this.ssdp.search('ssdp:all')

      // Probe local renderers (such as Kodi or Windows Media Player on the same laptop)
      this.probeLocalRenderers()

      // Re-send M-SEARCH every 4 seconds while discovery is active
      this.searchInterval = setInterval(() => {
        try {
          this.ssdp?.search('urn:schemas-upnp-org:device:MediaRenderer:1')
          this.ssdp?.search('urn:schemas-upnp-org:service:AVTransport:1')
          this.probeLocalRenderers()
        } catch (err) {
          castLogger.warn('[DlnaAdapter] Re-search warning:', err)
        }
      }, 4000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      castLogger.error('[DlnaAdapter] Failed to initialize SSDP client:', err)
      this.emit('error', {
        code: 'discovery_failed',
        message: 'Could not search for DLNA TVs on your network.',
        details: msg
      })
    }
  }

  private probeLocalRenderers(): void {
    const lanIp = getLanIpAddress()
    // Port 1331 is Kodi's primary default UPnP/DLNA port; 1889/1080/1180/1280/1480 are other Kodi & DLNA ports
    const ports = [
      1331, 1431, 1531, 1631, 1731, 1889,
      1080, 1180, 1280, 1380, 1480, 1580, 1680, 1780,
      8080, 2869, 1900, 5000, 8200, 9090, 49152, 49153, 49154, 49155
    ]
    const ips: string[] = []
    if (lanIp && lanIp !== '127.0.0.1') ips.push(lanIp)
    ips.push('127.0.0.1')

    for (const ip of ips) {
      for (const port of ports) {
        this.fetchDeviceDescription(`http://${ip}:${port}/`, ip)
        this.fetchDeviceDescription(`http://${ip}:${port}/description.xml`, ip)
        this.fetchDeviceDescription(`http://${ip}:${port}/DeviceDescription.xml`, ip)
      }
    }
  }

  private fetchDeviceDescription(locationUrl: string, hostIp: string): void {
    http
      .get(locationUrl, { timeout: 3000 }, (res) => {
        if (res.statusCode !== 200) return
        let xml = ''
        res.on('data', (c) => (xml += c))
        res.on('end', () => {
          this.parseDeviceXml(xml, locationUrl, hostIp)
        })
      })
      .on('error', () => {
        // Device location unreachable or timed out
      })
  }

  private parseDeviceXml(xml: string, locationUrl: string, hostIp: string): void {
    try {
      const udnMatch = xml.match(/<UDN>([\s\S]*?)<\/UDN>/i)
      const nameMatch = xml.match(/<friendlyName>([\s\S]*?)<\/friendlyName>/i)
      const modelMatch = xml.match(/<modelName>([\s\S]*?)<\/modelName>/i)
      const manufacturerMatch = xml.match(/<manufacturer>([\s\S]*?)<\/manufacturer>/i)

      if (!nameMatch) return

      // Ensure device is an actual playable media renderer or player
      const isPlayable =
        xml.includes('MediaRenderer') ||
        xml.includes('AVTransport') ||
        xml.includes('RenderingControl') ||
        /kodi|vlc|player|tv|renderer/i.test(xml)
      if (!isPlayable) return

      const rawUdn = udnMatch ? udnMatch[1].trim() : ''
      const friendlyName = nameMatch[1].trim()
      const model = modelMatch ? modelMatch[1].trim() : 'Smart TV'
      const manufacturer = manufacturerMatch ? manufacturerMatch[1].trim() : ''

      const cleanUdn = rawUdn.replace(/^uuid:/i, '').replace(/[^a-zA-Z0-9-]/g, '')
      const id = `dlna:${cleanUdn || `${hostIp}:${friendlyName}`}`

      // If we already discovered this exact device under the real LAN IP, do not downgrade to 127.0.0.1
      const existing = this.discoveredDevices.get(id)
      if (existing && hostIp === '127.0.0.1' && existing.host !== '127.0.0.1') {
        return
      }

      const record: DlnaDeviceRecord = {
        id,
        name: friendlyName,
        host: hostIp,
        model,
        location: locationUrl,
        manufacturer
      }

      this.discoveredDevices.set(id, record)

      const castDevice: CastDevice = {
        id,
        name: friendlyName,
        protocol: 'dlna',
        host: hostIp,
        model: `${manufacturer ? `${manufacturer} ` : ''}${model}`,
        lastSeen: Date.now()
      }

      castLogger.info(`[DlnaAdapter] Discovered DLNA device: ${castDevice.name} (${castDevice.host}) [${locationUrl}]`)
      this.emit('deviceFound', castDevice)
    } catch (err) {
      castLogger.warn('[DlnaAdapter] Error parsing device XML description:', err)
    }
  }

  async stopDiscovery(): Promise<void> {
    castLogger.info('[DlnaAdapter] Stopping discovery')
    if (this.searchInterval) {
      clearInterval(this.searchInterval)
      this.searchInterval = null
    }

    if (this.ssdp) {
      try {
        this.ssdp.removeAllListeners()
        this.ssdp.stop()
      } catch (err) {
        castLogger.warn('[DlnaAdapter] Error stopping SSDP:', err)
      }
      this.ssdp = null
    }
  }

  async connect(device: CastDevice): Promise<void> {
    castLogger.info(`[DlnaAdapter] Connecting to DLNA device: ${device.name} (${device.id})`)
    const target = this.discoveredDevices.get(device.id)
    if (!target) {
      throw new Error(`Device ${device.id} is not in discovered DLNA registry`)
    }

    this.activeDevice = target

    return new Promise<void>((resolve, reject) => {
      try {
        const client = new MediaRendererClient(target.location)
        this.activeClient = client

        // Bind events
        client.on('status', (status: any) => {
          castLogger.debug('[DlnaAdapter] Status event:', status)
        })

        client.on('playing', () => {
          this.emit('status', { substate: 'playing' })
        })

        client.on('paused', () => {
          this.emit('status', { substate: 'paused' })
        })

        client.on('stopped', () => {
          this.emit('status', { substate: 'idle' })
        })

        client.on('loading', () => {
          this.emit('status', { substate: 'buffering' })
        })

        client.on('error', (err: any) => {
          castLogger.error('[DlnaAdapter] Client error:', err)
          this.emit('error', this.mapError(err))
        })

        resolve()
      } catch (err) {
        reject(err)
      }
    })
  }

  async load(media: CastMediaInput, streamUrl: string): Promise<void> {
    if (!this.activeClient || !this.activeDevice) {
      throw new Error('No DLNA TV connected')
    }

    castLogger.info(`[DlnaAdapter] Loading media on ${this.activeDevice.name}: ${castLogger.maskUrl(streamUrl)}`)

    // Brand-specific protocolInfo customization
    const manufacturer = (this.activeDevice.manufacturer || '').toLowerCase()
    let dlnaFeatures = '*'
    let contentType = media.contentType || (streamUrl.includes('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp4')

    // LG WebOS TVs and older Samsung TVs often require specific DLNA streaming profiles
    if (manufacturer.includes('lg')) {
      dlnaFeatures = 'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000'
      // Some LG models prefer video/mp4 or video/vnd.dlna.mpeg-tts for HLS
      if (contentType.includes('mpegurl')) {
        contentType = 'application/x-mpegURL'
      }
    } else if (manufacturer.includes('samsung')) {
      dlnaFeatures = 'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000'
    }

    const options: any = {
      autoplay: true,
      contentType,
      dlnaFeatures,
      metadata: {
        title: media.title,
        type: 'video',
        creator: 'JioTv Max',
        author: 'JioTv Max'
      }
    }

    return new Promise<void>((resolve, reject) => {
      this.activeClient.load(streamUrl, options, (err: any) => {
        if (err) {
          castLogger.error('[DlnaAdapter] Load failed:', err)
          const mapped = this.mapError(err)
          this.emit('error', mapped)
          reject(new Error(mapped.message))
        } else {
          castLogger.info('[DlnaAdapter] Successfully loaded stream on DLNA TV')
          this.startPositionPolling()
          resolve()
        }
      })
    })
  }

  private startPositionPolling(): void {
    this.stopPositionPolling()
    this.positionPollingInterval = setInterval(() => {
      if (!this.activeClient) return
      this.activeClient.getPosition((err: any, position: number) => {
        if (!err && typeof position === 'number') {
          this.emit('status', {
            substate: 'playing',
            currentTime: position
          })
        }
      })
    }, 2000)
  }

  private stopPositionPolling(): void {
    if (this.positionPollingInterval) {
      clearInterval(this.positionPollingInterval)
      this.positionPollingInterval = null
    }
  }

  private mapError(err: any): { code: CastErrorCode; message: string; details?: string } {
    const rawMsg = err?.message || String(err)
    if (rawMsg.includes('716') || rawMsg.includes('Resource not found')) {
      return {
        code: 'unsupported_format',
        message: 'The TV could not play this stream format.',
        details: rawMsg
      }
    }
    if (rawMsg.includes('ECONNREFUSED') || rawMsg.includes('EHOSTUNREACH')) {
      return {
        code: 'network_blocked',
        message: 'Could not connect to the TV. Check Wi-Fi and TV power state.',
        details: rawMsg
      }
    }
    if (rawMsg.includes('ETIMEDOUT')) {
      return {
        code: 'connect_timeout',
        message: 'TV connection timed out.',
        details: rawMsg
      }
    }
    return {
      code: 'unknown',
      message: 'Failed to stream to DLNA TV.',
      details: rawMsg
    }
  }

  async play(): Promise<void> {
    if (!this.activeClient) return
    return new Promise<void>((resolve, reject) => {
      this.activeClient.play((err: any) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async pause(): Promise<void> {
    if (!this.activeClient) return
    return new Promise<void>((resolve, reject) => {
      this.activeClient.pause((err: any) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async stop(): Promise<void> {
    this.stopPositionPolling()
    if (!this.activeClient) return
    return new Promise<void>((resolve) => {
      this.activeClient.stop(() => resolve())
    })
  }

  async seek(seconds: number): Promise<void> {
    if (!this.activeClient) return
    return new Promise<void>((resolve, reject) => {
      this.activeClient.seek(seconds, (err: any) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async setVolume(level: number): Promise<void> {
    if (!this.activeClient) return
    // UPnP MediaRenderer volume is 0 - 100 integer
    const upnpVolume = Math.round(Math.max(0, Math.min(1, level)) * 100)
    return new Promise<void>((resolve, reject) => {
      this.activeClient.setVolume(upnpVolume, (err: any) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async setMuted(muted: boolean): Promise<void> {
    if (!this.activeClient) return
    // Emulated via volume 0 or setVolume
    return this.setVolume(muted ? 0 : 0.8)
  }

  async disconnect(): Promise<void> {
    castLogger.info('[DlnaAdapter] Disconnecting DLNA session')
    this.stopPositionPolling()
    if (this.activeClient) {
      try {
        this.activeClient.removeAllListeners()
      } catch {}
      this.activeClient = null
    }
    this.activeDevice = null
  }
}
