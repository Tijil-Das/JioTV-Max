import { EventEmitter } from 'node:events'
import type { CastDevice, CastMediaInput, CastPlaybackSubstate, CastErrorCode } from '@shared/cast-types'

export interface AdapterPlaybackStatus {
  substate: CastPlaybackSubstate
  currentTime?: number
  duration?: number
  volume?: number
  muted?: boolean
}

export interface AdapterError {
  code: CastErrorCode
  message: string
  details?: string
}

export declare interface DeviceAdapter {
  on(event: 'deviceFound', listener: (device: CastDevice) => void): this
  on(event: 'deviceLost', listener: (deviceId: string) => void): this
  on(event: 'status', listener: (status: AdapterPlaybackStatus) => void): this
  on(event: 'error', listener: (error: AdapterError) => void): this
  on(event: 'disconnected', listener: (reason?: string) => void): this
  emit(event: 'deviceFound', device: CastDevice): boolean
  emit(event: 'deviceLost', deviceId: string): boolean
  emit(event: 'status', status: AdapterPlaybackStatus): boolean
  emit(event: 'error', error: AdapterError): boolean
  emit(event: 'disconnected', reason?: string): boolean
}

export abstract class DeviceAdapter extends EventEmitter {
  abstract readonly protocol: CastDevice['protocol']

  /**
   * Starts discovery on the local network.
   */
  abstract startDiscovery(): Promise<void>

  /**
   * Stops discovery and releases listening sockets/resources.
   */
  abstract stopDiscovery(): Promise<void>

  /**
   * Connects to the specified target device.
   */
  abstract connect(device: CastDevice): Promise<void>

  /**
   * Loads media on the connected device and begins playback.
   */
  abstract load(media: CastMediaInput, streamUrl: string): Promise<void>

  /**
   * Resumes playback.
   */
  abstract play(): Promise<void>

  /**
   * Pauses playback.
   */
  abstract pause(): Promise<void>

  /**
   * Stops playback.
   */
  abstract stop(): Promise<void>

  /**
   * Seeks to a specific position (seconds).
   */
  abstract seek(seconds: number): Promise<void>

  /**
   * Sets volume level between 0 and 1.
   */
  abstract setVolume(level: number): Promise<void>

  /**
   * Sets mute state.
   */
  abstract setMuted(muted: boolean): Promise<void>

  /**
   * Disconnects from the currently connected device and cleans up resources.
   */
  abstract disconnect(): Promise<void>
}
