import { app } from 'electron'
import { existsSync, mkdirSync, statSync, renameSync, unlinkSync, appendFileSync } from 'node:fs'
import path from 'node:path'

/**
 * CastLogger handles rotating file logging and diagnostic telemetry
 * for cast sessions. Caps log size (up to 5 files x 1MB) and strictly
 * masks sensitive query parameters and authentication credentials.
 */
class CastLogger {
  private logDir: string
  private baseLogFile: string
  private readonly maxFileSize = 1024 * 1024 // 1 MB
  private readonly maxFiles = 5
  private readonly memoryRingBuffer: string[] = []
  private readonly maxMemoryLogs = 100

  constructor() {
    try {
      const userData = app?.getPath ? app.getPath('userData') : process.cwd()
      this.logDir = path.join(userData, 'logs')
      if (!existsSync(this.logDir)) {
        mkdirSync(this.logDir, { recursive: true })
      }
      this.baseLogFile = path.join(this.logDir, 'cast.log')
    } catch {
      this.logDir = process.cwd()
      this.baseLogFile = path.join(this.logDir, 'cast.log')
    }
  }

  /**
   * Masks any query strings or sensitive credentials from URLs.
   */
  public maskUrl(rawUrl: string): string {
    if (!rawUrl || typeof rawUrl !== 'string') return ''
    try {
      const parsed = new URL(rawUrl)
      if (parsed.search) {
        parsed.search = '?__masked_query__'
      }
      return parsed.toString()
    } catch {
      // If not a full URL, mask any potential token parameter patterns
      return rawUrl.replace(/([?&])(token|hdnea|__hdnea__|auth|key|sso|sig)=[^&]+/gi, '$1$2=REDACTED')
    }
  }

  private rotateIfNeeded(): void {
    try {
      if (!existsSync(this.baseLogFile)) return
      const stats = statSync(this.baseLogFile)
      if (stats.size < this.maxFileSize) return

      // Rotate: cast.4.log -> cast.5.log (delete if exceeds maxFiles), etc.
      for (let i = this.maxFiles - 1; i >= 1; i--) {
        const currentFile = path.join(this.logDir, `cast.${i}.log`)
        const nextFile = path.join(this.logDir, `cast.${i + 1}.log`)
        if (existsSync(currentFile)) {
          if (i === this.maxFiles - 1) {
            try { unlinkSync(currentFile) } catch {}
          } else {
            try { renameSync(currentFile, nextFile) } catch {}
          }
        }
      }

      renameSync(this.baseLogFile, path.join(this.logDir, 'cast.1.log'))
    } catch (err) {
      // Ignore rotation errors
    }
  }

  private write(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, meta?: unknown): void {
    const timestamp = new Date().toISOString()
    let metaStr = ''
    if (meta !== undefined) {
      try {
        if (meta instanceof Error) {
          metaStr = ` | Error: ${meta.message} | Stack: ${meta.stack}`
        } else {
          metaStr = ` | Data: ${JSON.stringify(meta)}`
        }
      } catch {
        metaStr = ' | [Unserializable data]'
      }
    }

    const line = `[${timestamp}] [${level}] ${message}${metaStr}`

    // Memory buffer
    this.memoryRingBuffer.push(line)
    if (this.memoryRingBuffer.length > this.maxMemoryLogs) {
      this.memoryRingBuffer.shift()
    }

    // Write to disk
    try {
      this.rotateIfNeeded()
      appendFileSync(this.baseLogFile, line + '\n', 'utf-8')
    } catch {
      // Fallback
    }

    // In dev mode also output to console for convenience
    if (process.env.NODE_ENV !== 'production' && process.env.CAST_DEBUG === '1') {
      console.log(`[CastLogger] ${line}`)
    }
  }

  public info(message: string, meta?: unknown): void {
    this.write('INFO', message, meta)
  }

  public warn(message: string, meta?: unknown): void {
    this.write('WARN', message, meta)
  }

  public error(message: string, meta?: unknown): void {
    this.write('ERROR', message, meta)
  }

  public debug(message: string, meta?: unknown): void {
    this.write('DEBUG', message, meta)
  }

  public getRecentLogs(count = 50): string[] {
    return this.memoryRingBuffer.slice(-count)
  }
}

export const castLogger = new CastLogger()
