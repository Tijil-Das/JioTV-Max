import { DeviceAdapter } from './device-adapter'
import type { CastDevice, CastMediaInput } from '@shared/cast-types'

/**
 * Phase C: AirPlay adapter stub placeholder.
 * TODO: Implement AirPlay protocol using node-airplay or raop-rtsp when AirPlay support is enabled.
 */
export class AirPlayAdapter extends DeviceAdapter {
  readonly protocol = 'airplay' as const

  async startDiscovery(): Promise<void> {
    // Phase C: mDNS search for _airplay._tcp and _raop._tcp
  }

  async stopDiscovery(): Promise<void> {
    // Phase C: stop mDNS search
  }

  async connect(_device: CastDevice): Promise<void> {
    throw new Error('AirPlay casting is not implemented yet (Phase C placeholder).')
  }

  async load(_media: CastMediaInput, _streamUrl: string): Promise<void> {
    throw new Error('AirPlay casting is not implemented yet.')
  }

  async play(): Promise<void> {
    throw new Error('AirPlay casting is not implemented yet.')
  }

  async pause(): Promise<void> {
    throw new Error('AirPlay casting is not implemented yet.')
  }

  async stop(): Promise<void> {
    throw new Error('AirPlay casting is not implemented yet.')
  }

  async seek(_seconds: number): Promise<void> {
    throw new Error('AirPlay casting is not implemented yet.')
  }

  async setVolume(_level: number): Promise<void> {
    throw new Error('AirPlay casting is not implemented yet.')
  }

  async setMuted(_muted: boolean): Promise<void> {
    throw new Error('AirPlay casting is not implemented yet.')
  }

  async disconnect(): Promise<void> {
    // No-op
  }
}
