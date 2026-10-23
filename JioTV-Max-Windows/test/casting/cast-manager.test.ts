import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CastManager } from '../../src/main/casting/cast-manager'
import { MockAdapter, DEFAULT_MOCK_DEVICES } from '../../src/main/casting/mock-adapter'
import type { CastMediaInput } from '../../src/shared/cast-types'

describe('CastManager + MockAdapter Integration & State Machine', () => {
  let manager: CastManager
  let mockAdapter: MockAdapter

  beforeEach(() => {
    manager = new CastManager()
    mockAdapter = new MockAdapter(DEFAULT_MOCK_DEVICES)
    manager.registerAdapter(mockAdapter)
  })

  afterEach(async () => {
    await manager.stopSession()
    await manager.stopDiscovery()
  })

  it('starts discovery, populates devices, and handles deduplication', async () => {
    await manager.startDiscovery()

    // Wait for mock staggered discovery
    await new Promise((r) => setTimeout(r, 1800))

    const devices = manager.getDevices()
    expect(devices.length).toBe(DEFAULT_MOCK_DEVICES.length)

    const livingRoom = devices.find((d) => d.id === 'mock:living-room')
    expect(livingRoom).toBeDefined()
    expect(livingRoom?.name).toBe('Mock Living Room TV')
    expect(livingRoom?.protocol).toBe('mock')
  })

  it('successfully transitions from idle -> connecting -> loading -> casting', async () => {
    await manager.startDiscovery()
    await new Promise((r) => setTimeout(r, 600))

    const testMedia: CastMediaInput = {
      url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      title: 'Test Live Stream',
      isLive: true
    }

    const startSuccess = await manager.startSession('mock:living-room', testMedia)
    expect(startSuccess).toBe(true)
    expect(manager.state).toBe('casting')
    expect(manager.substate).toBe('playing')
  })

  it('handles connection failure on Mock Broken TV and enters error state', async () => {
    await manager.startDiscovery()
    await new Promise((r) => setTimeout(r, 1200))

    const testMedia: CastMediaInput = {
      url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      title: 'Broken TV Test',
      isLive: true
    }

    let emittedError: any = null
    manager.on('error', (e) => {
      emittedError = e
    })

    const startSuccess = await manager.startSession('mock:broken', testMedia)
    expect(startSuccess).toBe(false)
    expect(manager.state).toBe('error')
    expect(emittedError?.code).toBe('network_blocked')
  })

  it('handles unsupported format on Mock Unsupported TV and reports error', async () => {
    await manager.startDiscovery()
    await new Promise((r) => setTimeout(r, 1500))

    const testMedia: CastMediaInput = {
      url: 'rtsp://unsupported-feed.example.com/raw',
      title: 'Unsupported Feed',
      isLive: true,
      contentType: 'video/rtsp'
    }

    let emittedError: any = null
    manager.on('error', (e) => {
      emittedError = e
    })

    const startSuccess = await manager.startSession('mock:unsupported', testMedia)
    expect(startSuccess).toBe(false)
    expect(manager.state).toBe('error')
    expect(emittedError?.code).toBe('unsupported_format')
  })

  it('handles remote controls: pause, resume, volume, mute', async () => {
    await manager.startDiscovery()
    await new Promise((r) => setTimeout(r, 600))

    const testMedia: CastMediaInput = {
      url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      title: 'Remote Control Test',
      isLive: true
    }

    await manager.startSession('mock:living-room', testMedia)
    expect(manager.state).toBe('casting')

    // Pause
    await manager.pause()
    expect(manager.substate).toBe('paused')

    // Resume
    await manager.resume()
    expect(manager.substate).toBe('playing')

    // Volume
    await manager.setVolume(0.45)
    expect(manager.getStatePayload().volume).toBe(0.45)

    // Mute
    await manager.setMuted(true)
    expect(manager.getStatePayload().muted).toBe(true)

    // Stop session
    await manager.stopSession()
    expect(manager.state).toBe('idle')
  })

  it('switches channel seamlessly on the same connected device', async () => {
    await manager.startDiscovery()
    await new Promise((r) => setTimeout(r, 600))

    const channel1: CastMediaInput = {
      url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      title: 'Channel 1',
      isLive: true
    }

    await manager.startSession('mock:living-room', channel1)
    expect(manager.getStatePayload().media?.title).toBe('Channel 1')

    const channel2: CastMediaInput = {
      url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      title: 'Channel 2',
      isLive: true
    }

    const switched = await manager.switchChannel(channel2)
    expect(switched).toBe(true)
    expect(manager.getStatePayload().media?.title).toBe('Channel 2')
    expect(manager.state).toBe('casting')
  })

  it('generates diagnostic export bundle with masked queries', async () => {
    await manager.startDiscovery()
    await new Promise((r) => setTimeout(r, 600))

    const diag = manager.getDiagnostics()
    expect(diag.appVersion).toBeDefined()
    expect(diag.osVersion).toBeDefined()
    expect(Array.isArray(diag.lastLogs)).toBe(true)
    expect(Array.isArray(diag.stateHistory)).toBe(true)
  })

  it('correctly sets up local proxy and exposes token for isDecryptedRelay media', async () => {
    await manager.startDiscovery()
    await new Promise((r) => setTimeout(r, 600))

    const drmMedia: CastMediaInput = {
      url: 'http://127.0.0.1:8080/manifest.mpd',
      title: 'Decrypted DRM Channel',
      isLive: true,
      isDecryptedRelay: true
    }

    const started = await manager.startSession('mock:living-room', drmMedia)
    expect(started).toBe(true)
    const state = manager.getStatePayload()
    expect(state.state).toBe('casting')
    expect(state.token).toBeDefined()
    expect(typeof state.token).toBe('string')
    expect(state.token!.length).toBeGreaterThan(0)
  })
})
