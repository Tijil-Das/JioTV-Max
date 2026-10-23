import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CastManager } from '../../src/main/casting/cast-manager'
import type { CastDevice } from '../../src/shared/cast-types'

describe('Device Deduplication, Expiry, and Validation', () => {
  let manager: CastManager

  beforeEach(() => {
    manager = new CastManager()
  })

  afterEach(async () => {
    await manager.stopSession()
    await manager.stopDiscovery()
  })

  it('deduplicates devices sharing the same host and name, preferring Chromecast over DLNA', () => {
    const handleDeviceFound = (manager as any).handleDeviceFound.bind(manager)

    const dlnaDev: CastDevice = {
      id: 'dlna:samsung-uuid-1',
      name: 'Living Room TV',
      protocol: 'dlna',
      host: '192.168.1.55',
      model: 'Samsung QLED',
      lastSeen: Date.now()
    }

    handleDeviceFound(dlnaDev)
    expect(manager.getDevices().length).toBe(1)
    expect(manager.getDevices()[0].protocol).toBe('dlna')

    // Discover the same TV via Chromecast
    const chromecastDev: CastDevice = {
      id: 'gcast:chromecast-uuid-1',
      name: 'Living Room TV',
      protocol: 'chromecast',
      host: '192.168.1.55',
      model: 'Chromecast Built-in',
      lastSeen: Date.now()
    }

    handleDeviceFound(chromecastDev)
    // Should deduplicate and prefer chromecast
    const devices = manager.getDevices()
    expect(devices.length).toBe(1)
    expect(devices[0].protocol).toBe('chromecast')
    expect(devices[0].id).toBe('gcast:chromecast-uuid-1')
  })

  it('expires stale devices not seen for 60 seconds', () => {
    const handleDeviceFound = (manager as any).handleDeviceFound.bind(manager)
    const cleanupExpired = (manager as any).cleanupExpiredDevices.bind(manager)

    const devOld: CastDevice = {
      id: 'dlna:old-device',
      name: 'Old TV',
      protocol: 'dlna',
      host: '192.168.1.88',
      model: 'Old Model',
      lastSeen: Date.now() - 65_000 // 65 seconds ago
    }

    handleDeviceFound(devOld)
    // Manually set old lastSeen
    ;(manager as any).deviceRegistry.set(devOld.id, devOld)

    expect(manager.getDevices().length).toBe(1)

    // Trigger cleanup
    cleanupExpired()
    expect(manager.getDevices().length).toBe(0)
  })

  it('enforces allowed and disallowed state machine transitions', () => {
    const isAllowed = (manager as any).isAllowedTransition.bind(manager)

    // Allowed transitions
    expect(isAllowed('idle', 'discovering')).toBe(true)
    expect(isAllowed('idle', 'connecting')).toBe(true)
    expect(isAllowed('connecting', 'loading')).toBe(true)
    expect(isAllowed('loading', 'casting')).toBe(true)
    expect(isAllowed('casting', 'stopping')).toBe(true)
    expect(isAllowed('stopping', 'idle')).toBe(true)

    // Disallowed transitions
    expect(isAllowed('idle', 'casting')).toBe(false)
    expect(isAllowed('discovering', 'casting')).toBe(false)
    expect(isAllowed('stopping', 'casting')).toBe(false)
  })
})
