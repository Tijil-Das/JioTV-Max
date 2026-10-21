import { app, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'

/**
 * Encrypted-at-rest storage backed by Electron's OS keychain (DPAPI on Windows).
 *
 * Credentials and access tokens must never touch localStorage or logs. If the
 * OS keychain is unavailable we refuse to persist instead of writing plaintext.
 *
 * Electron 45 promotes the async safeStorage API; the sync calls are kept as a
 * fallback for older runtimes but are never used when async is available.
 */
export class SecureStore {
  private readonly file: string
  private memory: string | null = null

  constructor(fileName = 'credentials.bin') {
    this.file = path.join(app.getPath('userData'), fileName)
  }

  private async encryptionAvailable(): Promise<boolean> {
    if (typeof safeStorage.isAsyncEncryptionAvailable === 'function') {
      try {
        return await safeStorage.isAsyncEncryptionAvailable()
      } catch {
        return false
      }
    }
    return safeStorage.isEncryptionAvailable()
  }

  async read(): Promise<string | null> {
    if (this.memory !== null) return this.memory
    if (!(await this.encryptionAvailable())) return null
    try {
      const encrypted = await fs.readFile(this.file)
      if (typeof safeStorage.decryptStringAsync === 'function') {
        const { result } = await safeStorage.decryptStringAsync(encrypted)
        this.memory = result
      } else {
        this.memory = safeStorage.decryptString(encrypted)
      }
      return this.memory
    } catch {
      return null
    }
  }

  async write(value: string): Promise<boolean> {
    this.memory = value
    if (!(await this.encryptionAvailable())) return false
    try {
      const encrypted =
        typeof safeStorage.encryptStringAsync === 'function'
          ? await safeStorage.encryptStringAsync(value)
          : safeStorage.encryptString(value)
      await fs.mkdir(path.dirname(this.file), { recursive: true })
      await fs.writeFile(this.file, encrypted, { mode: 0o600 })
      return true
    } catch {
      return false
    }
  }

  async clear(): Promise<void> {
    this.memory = null
    try {
      await fs.unlink(this.file)
    } catch {
      // Already gone.
    }
  }
}
