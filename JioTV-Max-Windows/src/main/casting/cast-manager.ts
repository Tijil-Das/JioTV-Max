import { EventEmitter } from 'node:events'
import { app, powerMonitor, type WebContents } from 'electron'
import type {
  CastDevice,
  CastSessionState,
  CastPlaybackSubstate,
  CastMediaInput,
  CastStatePayload,
  CastErrorPayload,
  CastErrorCode,
  CastDiagnostics
} from '@shared/cast-types'
import { DeviceAdapter, type AdapterPlaybackStatus, type AdapterError } from './device-adapter'
import { castLogger } from './logger'
import { StreamServer } from './stream-server'

const DEVICE_TTL_MS = 60_000
const CONNECT_TIMEOUT_MS = 10_000
const PLAYBACK_START_TIMEOUT_MS = 15_000

export class CastManager extends EventEmitter {
  private static instance: CastManager | null = null

  private readonly adapters = new Map<CastDevice['protocol'], DeviceAdapter>()
  private readonly deviceRegistry = new Map<string, CastDevice>()
  private registryCleanupInterval: NodeJS.Timeout | null = null

  // Session state machine
  private _state: CastSessionState = 'idle'
  private _substate: CastPlaybackSubstate = 'idle'
  private activeDevice: CastDevice | null = null
  private activeAdapter: DeviceAdapter | null = null
  private activeMedia: CastMediaInput | null = null
  private activePosition = 0
  private activeDuration: number | undefined = undefined
  private activeVolume = 1
  private activeMuted = false
  private lastError: CastErrorPayload | null = null

  // Timers and reconnects
  private connectTimer: NodeJS.Timeout | null = null
  private playbackStartTimer: NodeJS.Timeout | null = null
  private reconnectAttempts = 0
  private readonly maxReconnectAttempts = 2
  private isReconnecting = false

  // Diagnostics state history
  private stateHistory: Array<{
    state: CastSessionState
    substate: CastPlaybackSubstate
    timestamp: number
  }> = []

  // Shared stream proxy server
  private streamServer: StreamServer | null = null
  private activeSessionToken: string | null = null

  // UI WebContents subscriber for IPC events
  private subscriberWebContents: WebContents | null = null

  constructor() {
    super()
    this.streamServer = new StreamServer()
    this.setupPowerMonitor()
  }

  public static getInstance(): CastManager {
    if (!CastManager.instance) {
      CastManager.instance = new CastManager()
    }
    return CastManager.instance
  }

  public setWebContents(contents: WebContents | null): void {
    this.subscriberWebContents = contents
  }

  public registerAdapter(adapter: DeviceAdapter): void {
    this.adapters.set(adapter.protocol, adapter)

    adapter.on('deviceFound', (device) => this.handleDeviceFound(device))
    adapter.on('deviceLost', (deviceId) => this.handleDeviceLost(deviceId))
    adapter.on('status', (status) => this.handleAdapterStatus(status))
    adapter.on('error', (err) => this.handleAdapterError(err))
    adapter.on('disconnected', (reason) => this.handleAdapterDisconnected(reason))

    castLogger.info(`[CastManager] Registered adapter for protocol: ${adapter.protocol}`)
  }

  public getAdapter(protocol: CastDevice['protocol']): DeviceAdapter | undefined {
    return this.adapters.get(protocol)
  }

  // ---- State Machine --------------------------------------------------------

  public get state(): CastSessionState {
    return this._state
  }

  public get substate(): CastPlaybackSubstate {
    return this._substate
  }

  private isAllowedTransition(from: CastSessionState, to: CastSessionState): boolean {
    const transitions: Record<CastSessionState, CastSessionState[]> = {
      idle: ['discovering', 'connecting', 'error'],
      discovering: ['idle', 'connecting', 'error'],
      connecting: ['loading', 'stopping', 'error', 'idle'],
      loading: ['casting', 'stopping', 'error', 'idle'],
      casting: ['loading', 'stopping', 'error', 'idle'],
      stopping: ['idle', 'error'],
      error: ['idle', 'discovering', 'connecting']
    }
    return transitions[from]?.includes(to) ?? false
  }

  private setState(newState: CastSessionState, substate: CastPlaybackSubstate = 'idle', error?: string): void {
    if (this._state === newState && this._substate === substate) return

    if (!this.isAllowedTransition(this._state, newState)) {
      castLogger.warn(`[CastManager] Invalid state transition from ${this._state} to ${newState} - forcing clean transition`)
    }

    const previous = `${this._state}:${this._substate}`
    this._state = newState
    this._substate = substate
    const current = `${newState}:${substate}`

    castLogger.info(`[CastManager] State transition: ${previous} -> ${current}`)

    this.stateHistory.push({
      state: newState,
      substate,
      timestamp: Date.now()
    })
    if (this.stateHistory.length > 50) this.stateHistory.shift()

    this.broadcastState(error)
  }

  public getStatePayload(error?: string): CastStatePayload {
    return {
      state: this._state,
      substate: this._substate,
      device: this.activeDevice,
      media: this.activeMedia,
      error: error || (this.lastError ? this.lastError.userMessage : null),
      position: this.activePosition,
      duration: this.activeDuration,
      volume: this.activeVolume,
      muted: this.activeMuted,
      token: this.activeSessionToken || undefined
    }
  }

  private broadcastState(error?: string): void {
    const payload = this.getStatePayload(error)
    this.emit('stateChanged', payload)
    if (this.subscriberWebContents && !this.subscriberWebContents.isDestroyed()) {
      try {
        this.subscriberWebContents.send('cast:state-changed', payload)
      } catch (err) {
        castLogger.error('[CastManager] Failed to send stateChanged IPC to renderer', err)
      }
    }
  }

  private broadcastError(code: CastErrorCode, userMessage: string, details?: string): void {
    const payload: CastErrorPayload = { code, userMessage, details }
    this.lastError = payload
    castLogger.error(`[CastManager] Broadcast error: [${code}] ${userMessage} (${details || ''})`)
    if (this.listenerCount('error') > 0) {
      this.emit('error', payload)
    }
    if (this.subscriberWebContents && !this.subscriberWebContents.isDestroyed()) {
      try {
        this.subscriberWebContents.send('cast:error', payload)
      } catch (err) {
        castLogger.error('[CastManager] Failed to send error IPC to renderer', err)
      }
    }
  }

  // ---- Device Discovery & Registry ------------------------------------------

  public async startDiscovery(): Promise<void> {
    castLogger.info('[CastManager] startDiscovery requested')
    if (this._state === 'idle') {
      this.setState('discovering', 'idle')
    }

    if (!this.registryCleanupInterval) {
      this.registryCleanupInterval = setInterval(() => this.cleanupExpiredDevices(), 10_000)
    }

    const promises: Promise<void>[] = []
    for (const [protocol, adapter] of this.adapters.entries()) {
      castLogger.info(`[CastManager] Starting discovery on adapter: ${protocol}`)
      promises.push(
        adapter.startDiscovery().catch((err) => {
          castLogger.error(`[CastManager] Adapter ${protocol} startDiscovery error:`, err)
        })
      )
    }
    await Promise.all(promises)
  }

  public async stopDiscovery(): Promise<void> {
    castLogger.info('[CastManager] stopDiscovery requested')
    if (this.registryCleanupInterval) {
      clearInterval(this.registryCleanupInterval)
      this.registryCleanupInterval = null
    }

    for (const [protocol, adapter] of this.adapters.entries()) {
      try {
        await adapter.stopDiscovery()
      } catch (err) {
        castLogger.error(`[CastManager] Adapter ${protocol} stopDiscovery error:`, err)
      }
    }

    if (this._state === 'discovering') {
      this.setState('idle', 'idle')
    }
  }

  public getDevices(): CastDevice[] {
    return Array.from(this.deviceRegistry.values())
  }

  private handleDeviceFound(device: CastDevice): void {
    // Deduplication strategy:
    // If an existing device shares the exact same host and friendly name,
    // prefer Chromecast protocol over DLNA.
    for (const [existingId, existing] of this.deviceRegistry.entries()) {
      if (existing.host === device.host && existing.name.toLowerCase() === device.name.toLowerCase()) {
        if (existing.protocol === 'chromecast' && device.protocol === 'dlna') {
          // Keep the existing chromecast entry and update its timestamp
          existing.lastSeen = Date.now()
          this.deviceRegistry.set(existingId, existing)
          return
        }
        if (existing.protocol === 'dlna' && device.protocol === 'chromecast') {
          // Replace dlna with chromecast
          this.deviceRegistry.delete(existingId)
        }
      }
    }

    this.deviceRegistry.set(device.id, {
      ...device,
      lastSeen: Date.now()
    })

    castLogger.info(`[CastManager] Device registry updated: ${device.name} [${device.protocol}] (${device.host})`)
    this.broadcastDevices()
  }

  private handleDeviceLost(deviceId: string): void {
    if (this.deviceRegistry.has(deviceId)) {
      const dev = this.deviceRegistry.get(deviceId)!
      this.deviceRegistry.delete(deviceId)
      castLogger.info(`[CastManager] Device lost: ${dev.name} (${deviceId})`)
      this.broadcastDevices()
    }

    if (this.activeDevice?.id === deviceId) {
      this.handleConnectionLost('Device reported lost on network')
    }
  }

  private cleanupExpiredDevices(): void {
    const now = Date.now()
    let changed = false
    for (const [id, dev] of this.deviceRegistry.entries()) {
      // Do not expire the actively casting device
      if (this.activeDevice?.id === id) continue

      if (now - dev.lastSeen > DEVICE_TTL_MS) {
        this.deviceRegistry.delete(id)
        changed = true
        castLogger.info(`[CastManager] Expired device ${dev.name} due to inactivity (${DEVICE_TTL_MS}ms)`)
      }
    }
    if (changed) {
      this.broadcastDevices()
    }
  }

  private broadcastDevices(): void {
    const list = this.getDevices()
    this.emit('devicesUpdated', list)
    if (this.subscriberWebContents && !this.subscriberWebContents.isDestroyed()) {
      try {
        this.subscriberWebContents.send('cast:devices-updated', list)
      } catch (err) {
        castLogger.error('[CastManager] Failed to broadcast devices-updated IPC', err)
      }
    }
  }

  // ---- Session Lifecycle ----------------------------------------------------

  public async startSession(deviceId: string, media: CastMediaInput): Promise<boolean> {
    castLogger.info(`[CastManager] startSession requested for deviceId: ${deviceId}, media: "${media.title}"`)

    const targetDevice = this.deviceRegistry.get(deviceId)
    if (!targetDevice) {
      castLogger.error(`[CastManager] Device ID ${deviceId} not found in registry`)
      this.broadcastError('unknown', 'Target device not found. Please scan again.')
      return false
    }

    // Single active session rule: cleanly stop any previous session first
    if (this.activeDevice && (this._state === 'casting' || this._state === 'connecting' || this._state === 'loading')) {
      if (this.activeDevice.id === targetDevice.id) {
        // Changing channel on the same device!
        return this.switchChannel(media)
      }
      castLogger.info('[CastManager] Stopping existing session to switch to new device')
      await this.stopSession()
    }

    const adapter = this.adapters.get(targetDevice.protocol)
    if (!adapter) {
      castLogger.error(`[CastManager] No adapter available for protocol ${targetDevice.protocol}`)
      this.broadcastError('unknown', `Casting via ${targetDevice.protocol} is not supported on this platform.`)
      return false
    }

    this.activeDevice = targetDevice
    this.activeAdapter = adapter
    this.activeMedia = media
    this.reconnectAttempts = 0
    this.isReconnecting = false
    this.lastError = null

    this.setState('connecting', 'idle')

    // Timeout: 10 seconds to connect
    const connectStartTime = Date.now()
    const connectPromise = (async () => {
      await adapter.connect(targetDevice)
    })()

    try {
      await this.withTimeout(connectPromise, CONNECT_TIMEOUT_MS, 'connect_timeout')
      castLogger.info(`[CastManager] Connected to ${targetDevice.name} in ${Date.now() - connectStartTime}ms`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      castLogger.error(`[CastManager] Connect failed to ${targetDevice.name}: ${msg}`)
      const code: CastErrorCode = msg.includes('connect_timeout') ? 'connect_timeout' : 'network_blocked'
      const userMsg =
        code === 'connect_timeout'
          ? `Connection to ${targetDevice.name} timed out. Ensure it is powered on and on the same Wi-Fi.`
          : `Couldn't connect to ${targetDevice.name}. Try again or check your Windows Firewall.`
      this.broadcastError(code, userMsg, msg)
      await this.cleanupSession()
      this.setState('error', 'idle', userMsg)
      return false
    }

    // State = loading
    this.setState('loading', 'buffering')

    // Resolve stream URL (direct or proxied)
    let streamUrlToCast = media.url
    try {
      const needsProxy = this.checkNeedsProxy(media)
      if (needsProxy) {
        castLogger.info('[CastManager] Stream requires local proxy server')
        if (!this.streamServer) this.streamServer = new StreamServer()
        const sessionToken = await this.streamServer.startSession(media, targetDevice.host)
        this.activeSessionToken = sessionToken
        streamUrlToCast = this.streamServer.getStreamUrl(sessionToken, targetDevice.host)
        castLogger.info(`[CastManager] Proxied stream URL: ${castLogger.maskUrl(streamUrlToCast)}`)
      } else {
        castLogger.info(`[CastManager] Direct stream URL to TV: ${castLogger.maskUrl(streamUrlToCast)}`)
      }
    } catch (err) {
      castLogger.error('[CastManager] Failed to prepare stream URL', err)
      this.broadcastError('stream_error', 'Could not prepare the video stream for casting.')
      await this.cleanupSession()
      this.setState('error', 'idle')
      return false
    }

    // Load media on device
    try {
      await adapter.load(media, streamUrlToCast)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      castLogger.error(`[CastManager] adapter.load failed: ${msg}`)
      if (this._state !== 'error') {
        this.broadcastError('unsupported_format', 'Could not play this stream on the selected device.', msg)
        await this.cleanupSession()
        this.setState('error', 'idle')
      }
      return false
    }

    // Wait for first "playing" status with timeout of 15 seconds
    const playbackStartPromise = new Promise<void>((resolve, reject) => {
      const onStatusCheck = (status: AdapterPlaybackStatus) => {
        if (status.substate === 'playing') {
          cleanupListener()
          resolve()
        }
      }
      const cleanupListener = () => {
        adapter.removeListener('status', onStatusCheck)
      }
      adapter.on('status', onStatusCheck)

      this.playbackStartTimer = setTimeout(() => {
        cleanupListener()
        reject(new Error('playback_not_started'))
      }, PLAYBACK_START_TIMEOUT_MS)
    })

    try {
      await playbackStartPromise
      if (this.playbackStartTimer) {
        clearTimeout(this.playbackStartTimer)
        this.playbackStartTimer = null
      }
      this.setState('casting', 'playing')
      castLogger.info(`[CastManager] Playback started successfully on ${targetDevice.name}`)
      return true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      castLogger.error(`[CastManager] Playback did not start in time on ${targetDevice.name}: ${msg}`)
      this.broadcastError(
        'playback_not_started',
        `Playback didn't start on ${targetDevice.name}. The TV may not support this stream or is busy.`
      )
      await this.cleanupSession()
      this.setState('error', 'idle')
      return false
    }
  }

  /**
   * Channel switching while casting on the same device.
   */
  public async switchChannel(newMedia: CastMediaInput): Promise<boolean> {
    if (!this.activeAdapter || !this.activeDevice) return false
    castLogger.info(`[CastManager] Switching channel to "${newMedia.title}" on ${this.activeDevice.name}`)

    this.activeMedia = newMedia
    this.setState('loading', 'buffering')

    try {
      // Re-resolve or update stream
      let streamUrlToCast = newMedia.url
      if (this.checkNeedsProxy(newMedia)) {
        if (!this.streamServer) this.streamServer = new StreamServer()
        const sessionToken = await this.streamServer.startSession(newMedia, this.activeDevice.host)
        streamUrlToCast = this.streamServer.getStreamUrl(sessionToken, this.activeDevice.host)
      }

      await this.activeAdapter.load(newMedia, streamUrlToCast)
      this.setState('casting', 'playing')
      return true
    } catch (err) {
      castLogger.error('[CastManager] Failed to switch channel while casting', err)
      this.broadcastError('stream_error', `Could not switch to ${newMedia.title} on your TV.`)
      return false
    }
  }

  public async stopSession(): Promise<boolean> {
    castLogger.info('[CastManager] stopSession requested')
    this.setState('stopping', 'idle')

    if (this.activeAdapter) {
      try {
        await this.activeAdapter.stop()
      } catch (err) {
        castLogger.warn('[CastManager] Error calling adapter.stop() during shutdown', err)
      }
      try {
        await this.activeAdapter.disconnect()
      } catch (err) {
        castLogger.warn('[CastManager] Error calling adapter.disconnect() during shutdown', err)
      }
    }

    await this.cleanupSession()
    this.setState('idle', 'idle')
    return true
  }

  private async cleanupSession(): Promise<void> {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer)
      this.connectTimer = null
    }
    if (this.playbackStartTimer) {
      clearTimeout(this.playbackStartTimer)
      this.playbackStartTimer = null
    }

    if (this.streamServer) {
      await this.streamServer.stopSession()
    }
    this.activeSessionToken = null

    this.activeDevice = null
    this.activeAdapter = null
    this.activeMedia = null
    this.activePosition = 0
    this.activeDuration = undefined
    this.reconnectAttempts = 0
    this.isReconnecting = false
  }

  // ---- Playback Controls ----------------------------------------------------

  public async pause(): Promise<boolean> {
    if (!this.activeAdapter || this._state !== 'casting') return false
    castLogger.info('[CastManager] pause command')
    try {
      await this.activeAdapter.pause()
      this.setState('casting', 'paused')
      return true
    } catch (err) {
      castLogger.error('[CastManager] Pause failed', err)
      return false
    }
  }

  public async resume(): Promise<boolean> {
    if (!this.activeAdapter || this._state !== 'casting') return false
    castLogger.info('[CastManager] resume command')
    try {
      await this.activeAdapter.play()
      this.setState('casting', 'playing')
      return true
    } catch (err) {
      castLogger.error('[CastManager] Resume failed', err)
      return false
    }
  }

  public async seek(seconds: number): Promise<boolean> {
    if (!this.activeAdapter || this._state !== 'casting') return false
    if (this.activeMedia?.isLive) {
      castLogger.warn('[CastManager] Seek ignored for live stream')
      return false
    }
    castLogger.info(`[CastManager] seek command: ${seconds}s`)
    try {
      await this.activeAdapter.seek(seconds)
      return true
    } catch (err) {
      castLogger.error('[CastManager] Seek failed', err)
      return false
    }
  }

  public async setVolume(level: number): Promise<boolean> {
    if (!this.activeAdapter || this._state !== 'casting') return false
    const clamped = Math.max(0, Math.min(1, level))
    this.activeVolume = clamped
    try {
      await this.activeAdapter.setVolume(clamped)
      return true
    } catch (err) {
      castLogger.error('[CastManager] Set volume failed', err)
      return false
    }
  }

  public async setMuted(muted: boolean): Promise<boolean> {
    if (!this.activeAdapter || this._state !== 'casting') return false
    this.activeMuted = muted
    try {
      await this.activeAdapter.setMuted(muted)
      return true
    } catch (err) {
      castLogger.error('[CastManager] Set muted failed', err)
      return false
    }
  }

  // ---- Adapter Event Handlers -----------------------------------------------

  private handleAdapterStatus(status: AdapterPlaybackStatus): void {
    if (this._state !== 'casting' && this._state !== 'loading') return

    if (status.substate && status.substate !== this._substate) {
      castLogger.info(`[CastManager] Substate changed to: ${status.substate}`)
      this._substate = status.substate
    }

    if (typeof status.currentTime === 'number') {
      this.activePosition = status.currentTime
    }
    if (typeof status.duration === 'number') {
      this.activeDuration = status.duration
    }
    if (typeof status.volume === 'number') {
      this.activeVolume = status.volume
    }
    if (typeof status.muted === 'boolean') {
      this.activeMuted = status.muted
    }

    this.broadcastState()
  }

  private handleAdapterError(err: AdapterError): void {
    castLogger.error(`[CastManager] Received adapter error: [${err.code}] ${err.message}`)
    this.broadcastError(err.code, err.message, err.details)
    this.setState('error', 'idle', err.message)
  }

  private handleAdapterDisconnected(reason?: string): void {
    castLogger.warn(`[CastManager] Adapter disconnected event received: ${reason || 'Unknown reason'}`)
    if (this._state === 'casting' || this._state === 'loading') {
      this.handleConnectionLost(reason || 'Device disconnected unexpectedly')
    }
  }

  private async handleConnectionLost(reason: string): Promise<void> {
    if (this.isReconnecting) return
    this.isReconnecting = true

    if (this.reconnectAttempts < this.maxReconnectAttempts && this.activeDevice && this.activeMedia) {
      this.reconnectAttempts++
      castLogger.info(
        `[CastManager] Attempting automatic reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} in 2000ms...`
      )
      this.setState('connecting', 'buffering')

      await new Promise((r) => setTimeout(r, 2000))
      if (!this.activeDevice || !this.activeMedia) return

      try {
        await this.activeAdapter?.connect(this.activeDevice)
        this.isReconnecting = false
        this.setState('casting', 'playing')
        castLogger.info('[CastManager] Automatic reconnect succeeded!')
        return
      } catch (err) {
        castLogger.warn(`[CastManager] Reconnect attempt ${this.reconnectAttempts} failed`, err)
      }
    }

    this.isReconnecting = false
    const name = this.activeDevice?.name || 'TV'
    const errorMsg = `Connection to ${name} was lost.`
    this.broadcastError('device_lost', errorMsg, reason)
    await this.cleanupSession()
    this.setState('idle', 'idle', errorMsg)
  }

  // ---- Power & Window Lifecycle ---------------------------------------------

  private setupPowerMonitor(): void {
    try {
      if (powerMonitor?.on) {
        powerMonitor.on('suspend', () => {
          castLogger.info('[CastManager] System suspending - cleanly stopping cast session')
          void this.stopSession()
        })
        powerMonitor.on('resume', () => {
          castLogger.info('[CastManager] System resumed - re-evaluating discovery')
          void this.startDiscovery()
        })
      }
    } catch {
      // Ignore if powerMonitor is not initialized
    }

    try {
      if (app?.on) {
        app.on('before-quit', () => {
          castLogger.info('[CastManager] App quitting - terminating cast session and stream server')
          void this.stopSession()
        })
      }
    } catch {
      // Ignore if app is not initialized
    }
  }

  // ---- Helper Utilities -----------------------------------------------------

  private checkNeedsProxy(media: CastMediaInput): boolean {
    // 0. If media is an in-app decrypted live relay, it must be proxied through StreamServer
    if (media.isDecryptedRelay) return true

    // 1. If media has custom headers or cookies, it must be proxied
    if (media.headers && Object.keys(media.headers).length > 0) return true

    // 2. If it's a loopback URL (127.0.0.1 or localhost), it MUST be proxied so TV can reach it
    if (media.url.includes('127.0.0.1') || media.url.includes('localhost')) return true

    // 3. If stream contains signed tokens bound to viewer session or IP
    if (media.url.includes('__hdnea__') || media.url.includes('hdnea')) return true

    return false
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, errorCode: CastErrorCode): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(errorCode))
      }, ms)
      promise
        .then((res) => {
          clearTimeout(timer)
          resolve(res)
        })
        .catch((err) => {
          clearTimeout(timer)
          reject(err)
        })
    })
  }

  public getDiagnostics(errorCode?: CastErrorCode): CastDiagnostics {
    return {
      appVersion: app?.getVersion ? app.getVersion() : '1.0.3',
      osVersion: `${process.platform} ${process.arch}`,
      deviceModel: this.activeDevice?.model ?? null,
      deviceProtocol: this.activeDevice?.protocol ?? null,
      stateHistory: [...this.stateHistory],
      lastLogs: castLogger.getRecentLogs(50),
      errorCode: errorCode || this.lastError?.code
    }
  }

  public getStreamServer(): StreamServer | null {
    return this.streamServer
  }
}
