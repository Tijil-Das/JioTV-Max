import { DeviceAdapter } from './device-adapter'
import type { CastDevice, CastMediaInput, CastPlaybackSubstate } from '@shared/cast-types'
import { castLogger } from './logger'

export interface MockDeviceConfig {
  id: string
  name: string
  model: string
  host: string
  behavior: 'normal' | 'slow_connect' | 'fail_connect' | 'flaky_disconnect' | 'unsupported_format'
}

export const DEFAULT_MOCK_DEVICES: MockDeviceConfig[] = [
  {
    id: 'mock:living-room',
    name: 'Mock Living Room TV',
    model: 'Mock Cast Ultra 4K',
    host: '192.168.1.101',
    behavior: 'normal'
  },
  {
    id: 'mock:bedroom',
    name: 'Mock Bedroom TV',
    model: 'Mock Android TV 12',
    host: '192.168.1.102',
    behavior: 'slow_connect'
  },
  {
    id: 'mock:broken',
    name: 'Mock Broken TV',
    model: 'Mock Smart TV Gen1',
    host: '192.168.1.103',
    behavior: 'fail_connect'
  },
  {
    id: 'mock:flaky',
    name: 'Mock Flaky TV',
    model: 'Mock UPnP Renderer',
    host: '192.168.1.104',
    behavior: 'flaky_disconnect'
  },
  {
    id: 'mock:unsupported',
    name: 'Mock Unsupported TV',
    model: 'Legacy Mock Box',
    host: '192.168.1.105',
    behavior: 'unsupported_format'
  }
]

export class MockAdapter extends DeviceAdapter {
  readonly protocol = 'mock' as const
  private activeDevice: CastDevice | null = null
  private activeConfig: MockDeviceConfig | null = null
  private discoveryTimers: NodeJS.Timeout[] = []
  private tickInterval: NodeJS.Timeout | null = null
  private flakyTimer: NodeJS.Timeout | null = null
  private currentTime = 0
  private currentVolume = 0.8
  private isMuted = false
  private currentSubstate: CastPlaybackSubstate = 'idle'
  private isLive = true

  constructor(private readonly mockConfigs: MockDeviceConfig[] = DEFAULT_MOCK_DEVICES) {
    super()
  }

  async startDiscovery(): Promise<void> {
    this.stopDiscovery()
    castLogger.info('[MockAdapter] Starting mock device discovery')

    // Incrementally discover devices with realistic network stagger (150ms - 900ms)
    this.mockConfigs.forEach((cfg, index) => {
      const timer = setTimeout(() => {
        const device: CastDevice = {
          id: cfg.id,
          name: cfg.name,
          protocol: 'mock',
          host: cfg.host,
          model: cfg.model,
          lastSeen: Date.now()
        }
        castLogger.info(`[MockAdapter] Discovered mock device: ${device.name} (${device.id})`)
        this.emit('deviceFound', device)
      }, 200 + index * 300)

      this.discoveryTimers.push(timer)
    })
  }

  async stopDiscovery(): Promise<void> {
    for (const t of this.discoveryTimers) {
      clearTimeout(t)
    }
    this.discoveryTimers = []
    castLogger.info('[MockAdapter] Stopped mock device discovery')
  }

  async connect(device: CastDevice): Promise<void> {
    castLogger.info(`[MockAdapter] Connecting to ${device.name} (${device.id})`)
    const config = this.mockConfigs.find((c) => c.id === device.id)
    if (!config) {
      throw new Error(`Device ${device.id} not found in mock configuration`)
    }

    this.activeDevice = device
    this.activeConfig = config

    if (config.behavior === 'fail_connect') {
      await new Promise((r) => setTimeout(r, 800))
      castLogger.error(`[MockAdapter] Connection refused by ${device.name}`)
      throw new Error(`Connection refused: Host ${device.host}:8009 unreachable`)
    }

    if (config.behavior === 'slow_connect') {
      castLogger.info(`[MockAdapter] Simulating slow connection for ${device.name} (6000ms)`)
      await new Promise((r) => setTimeout(r, 6000))
    } else {
      await new Promise((r) => setTimeout(r, 400))
    }

    castLogger.info(`[MockAdapter] Connected successfully to ${device.name}`)
  }

  async load(media: CastMediaInput, streamUrl: string): Promise<void> {
    if (!this.activeConfig || !this.activeDevice) {
      throw new Error('No device connected')
    }

    castLogger.info(`[MockAdapter] Loading media: "${media.title}", URL: ${castLogger.maskUrl(streamUrl)}`)

    if (this.activeConfig.behavior === 'unsupported_format') {
      await new Promise((r) => setTimeout(r, 600))
      if (this.listenerCount('error') > 0) {
        this.emit('error', {
          code: 'unsupported_format',
          message: 'The receiving device does not support this stream format.',
          details: `TV returned error 702 for ${media.contentType || 'application/vnd.apple.mpegurl'}`
        })
      }
      throw new Error('Unsupported media format')
    }

    this.isLive = media.isLive
    this.currentTime = 0
    this.currentSubstate = 'buffering'
    this.emit('status', {
      substate: 'buffering',
      currentTime: 0,
      duration: this.isLive ? undefined : 3600,
      volume: this.currentVolume,
      muted: this.isMuted
    })

    // Simulate buffering delay
    await new Promise((r) => setTimeout(r, 1000))

    this.currentSubstate = 'playing'
    this.emit('status', {
      substate: 'playing',
      currentTime: 0,
      duration: this.isLive ? undefined : 3600,
      volume: this.currentVolume,
      muted: this.isMuted
    })

    this.startTicking()

    // Handle flaky disconnect
    if (this.activeConfig.behavior === 'flaky_disconnect') {
      castLogger.info('[MockAdapter] Flaky TV scheduled to drop connection in 20 seconds')
      this.flakyTimer = setTimeout(() => {
        castLogger.warn('[MockAdapter] Flaky TV unexpectedly disconnected!')
        this.stopTicking()
        this.emit('disconnected', 'Network socket reset by mock device')
      }, 20_000)
    }
  }

  private startTicking(): void {
    this.stopTicking()
    this.tickInterval = setInterval(() => {
      if (this.currentSubstate === 'playing') {
        this.currentTime += 1
        this.emit('status', {
          substate: 'playing',
          currentTime: this.currentTime,
          duration: this.isLive ? undefined : 3600,
          volume: this.currentVolume,
          muted: this.isMuted
        })
      }
    }, 1000)
  }

  private stopTicking(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval)
      this.tickInterval = null
    }
    if (this.flakyTimer) {
      clearTimeout(this.flakyTimer)
      this.flakyTimer = null
    }
  }

  async play(): Promise<void> {
    castLogger.info('[MockAdapter] Play command received')
    this.currentSubstate = 'playing'
    this.emit('status', {
      substate: 'playing',
      currentTime: this.currentTime,
      duration: this.isLive ? undefined : 3600,
      volume: this.currentVolume,
      muted: this.isMuted
    })
  }

  async pause(): Promise<void> {
    castLogger.info('[MockAdapter] Pause command received')
    this.currentSubstate = 'paused'
    this.emit('status', {
      substate: 'paused',
      currentTime: this.currentTime,
      duration: this.isLive ? undefined : 3600,
      volume: this.currentVolume,
      muted: this.isMuted
    })
  }

  async stop(): Promise<void> {
    castLogger.info('[MockAdapter] Stop command received')
    this.stopTicking()
    this.currentSubstate = 'idle'
    this.emit('status', {
      substate: 'idle',
      currentTime: this.currentTime,
      duration: this.isLive ? undefined : 3600,
      volume: this.currentVolume,
      muted: this.isMuted
    })
  }

  async seek(seconds: number): Promise<void> {
    castLogger.info(`[MockAdapter] Seek to ${seconds}s`)
    this.currentTime = Math.max(0, seconds)
    this.emit('status', {
      substate: this.currentSubstate,
      currentTime: this.currentTime,
      duration: this.isLive ? undefined : 3600,
      volume: this.currentVolume,
      muted: this.isMuted
    })
  }

  async setVolume(level: number): Promise<void> {
    this.currentVolume = Math.max(0, Math.min(1, level))
    castLogger.info(`[MockAdapter] Volume changed to ${this.currentVolume.toFixed(2)}`)
    this.emit('status', {
      substate: this.currentSubstate,
      currentTime: this.currentTime,
      duration: this.isLive ? undefined : 3600,
      volume: this.currentVolume,
      muted: this.isMuted
    })
  }

  async setMuted(muted: boolean): Promise<void> {
    this.isMuted = muted
    castLogger.info(`[MockAdapter] Mute changed to ${this.isMuted}`)
    this.emit('status', {
      substate: this.currentSubstate,
      currentTime: this.currentTime,
      duration: this.isLive ? undefined : 3600,
      volume: this.currentVolume,
      muted: this.isMuted
    })
  }

  async disconnect(): Promise<void> {
    castLogger.info('[MockAdapter] Disconnecting mock device')
    this.stopTicking()
    this.activeDevice = null
    this.activeConfig = null
    this.currentSubstate = 'idle'
  }
}
