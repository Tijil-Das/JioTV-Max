import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { vi } from 'vitest'

export interface FakeUpdateInfo {
  version: string
  files?: Array<{ url: string; size?: number }>
  releaseDate?: string
}

export interface FakeCheckResult {
  updateInfo: FakeUpdateInfo
  isUpdateAvailable?: boolean
}

export class FakeAutoUpdater extends EventEmitter {
  public logger: any = null
  public autoDownload = true
  public autoInstallOnAppQuit = false
  public autoRunAppAfterInstall = true
  public allowPrerelease = false
  public allowDowngrade = false

  public checkForUpdates = vi.fn<() => Promise<FakeCheckResult | null>>().mockResolvedValue({
    updateInfo: { version: '1.0.1' },
    isUpdateAvailable: true
  })

  public downloadUpdate = vi.fn<() => Promise<string[]>>().mockResolvedValue(['downloaded'])

  public quitAndInstall = vi.fn<(isSilent?: boolean, isForceRunAfter?: boolean) => void>()

  public reset(): void {
    this.removeAllListeners()
    this.autoDownload = true
    this.autoInstallOnAppQuit = false
    this.autoRunAppAfterInstall = true
    this.allowPrerelease = false
    this.allowDowngrade = false
    this.logger = null
    this.checkForUpdates.mockReset().mockResolvedValue({
      updateInfo: { version: '1.0.1' },
      isUpdateAvailable: true
    })
    this.downloadUpdate.mockReset().mockResolvedValue(['downloaded'])
    this.quitAndInstall.mockReset()
  }
}

export function createTestUserDataDir(nameSuffix = 'standard'): string {
  const base = path.join(os.tmpdir(), `jiotv-max-test-${nameSuffix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
  fs.mkdirSync(base, { recursive: true })
  return base
}

export function createComplexUserDataDir(): string {
  // Path with spaces and non-ASCII Unicode characters (testing Windows localized paths like Spanish/Chinese/Accented)
  const base = path.join(os.tmpdir(), `JioTv Max 測試 ñáü ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
  fs.mkdirSync(base, { recursive: true })
  return base
}
