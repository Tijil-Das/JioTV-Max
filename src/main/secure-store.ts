import { app, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'

/**
 * Encrypted-at-rest storage backed by Electron's OS keychain (DPAPI on Windows).
 *
 * Credentials and access tokens must never touch localStorage or logs. If the
 * OS keychain is unavailable we refuse to persist instead of writing plaintext.
 */
export class SecureStore {
  private readonly file: string
  private memory: string | null = null

  constructor(fileName = 'credentials.bin') {
    this.file = path.join(app.getPath('userData'), fileName)
  }

  private get available(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  async read(): Promise<string | null> {
    if (this.memory !== null) return this.memory
    if (!this.available) return null
    try {
      const encrypted = await fs.readFile(this.file)
      this.memory = safeStorage.decryptString(encrypted)
      return this.memory
    } catch {
      return null
    }
  }

  async write(value: string): Promise<boolean> {
    this.memory = value
    if (!this.available) return false
    try {
      const encrypted = safeStorage.encryptString(value)
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
