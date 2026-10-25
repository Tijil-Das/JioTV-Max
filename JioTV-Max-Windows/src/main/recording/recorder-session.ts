import fs from 'node:fs'
import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { app } from 'electron'
import type { RecordingRepository } from './repository'
import type { RecordingRecord, RecordingStatus, OverlaySettings } from '../../shared/recording-types'
import { FFmpegResolver } from './ffmpeg-resolver'
import { SharedStreamFetcher } from './shared-stream-fetcher'

export interface RecorderSessionOptions {
  streamUrl: string
  overlaySettings?: OverlaySettings
  onStateChange?: (session: RecorderSession, from: RecordingStatus, to: RecordingStatus) => void
  onProgress?: (stats: { bytesWritten: number; elapsedSeconds: number; bitrateKbps: number }) => void
  onFinalizeReady?: (session: RecorderSession) => void
  onStallWarning?: (channelName: string) => void
  requestFreshStreamUrl?: () => Promise<string | null>
}

export class RecorderSession {
  readonly id: string
  readonly channelId: string
  readonly channelName: string
  private status: RecordingStatus = 'starting'
  private currentPartIndex = 0
  private currentPartPath = ''
  private currentPartStartTime = ''
  private ffmpegProcess: ChildProcess | null = null
  private workingDir: string
  private watchdogTimer: NodeJS.Timeout | null = null
  private diskCheckTimer: NodeJS.Timeout | null = null
  private lastWrittenBytes = 0
  private lastGrowthTime = Date.now()
  private elapsedSeconds = 0
  private elapsedTimer: NodeJS.Timeout | null = null
  private isDestroyed = false
  private streamUrl: string

  constructor(
    private readonly record: RecordingRecord,
    private readonly repo: RecordingRepository,
    private readonly options: RecorderSessionOptions
  ) {
    this.id = record.id
    this.channelId = record.channelId
    this.channelName = record.channelName
    this.streamUrl = options.streamUrl

    // Establish working directory on the same volume as output folder
    // Fall back to userData if folder is unavailable
    let baseFolder = record.folder
    try {
      if (!fs.existsSync(baseFolder)) {
        fs.mkdirSync(baseFolder, { recursive: true })
      }
    } catch {
      baseFolder = path.join(app.getPath('userData'), 'RecordingsFallback')
      fs.mkdirSync(baseFolder, { recursive: true })
    }

    this.workingDir = path.join(baseFolder, '.working', record.id)
    if (!fs.existsSync(this.workingDir)) {
      fs.mkdirSync(this.workingDir, { recursive: true })
    }
  }

  getStatus(): RecordingStatus {
    return this.status
  }

  getWorkingDir(): string {
    return this.workingDir
  }

  getRecord(): RecordingRecord {
    return this.record
  }

  getStatus(): RecordingStatus {
    return this.status
  }

  getElapsedSeconds(): number {
    return this.elapsedSeconds
  }

  getBytesWritten(): number {
    return this.getTotalBytesWritten()
  }

  getBitrateKbps(): number {
    const bytes = this.getTotalBytesWritten()
    return this.elapsedSeconds > 0 ? Math.round((bytes * 8) / (this.elapsedSeconds * 1000)) : 0
  }

  getPartCount(): number {
    return this.currentPartIndex + 1
  }

  async start(): Promise<void> {
    if (this.isDestroyed) return
    this.transition('recording', 'Recording started')
    this.repo.updateRecordingFields(this.id, {
      actualStartUtc: new Date().toISOString()
    })

    // Register with SharedStreamFetcher
    SharedStreamFetcher.getInstance().acquire(
      this.channelId,
      this.record.quality,
      `recorder_${this.id}`
    )

    this.startPart()
    this.startWatchdog()
    this.startDiskCheck()

    // 1-second elapsed counter
    this.elapsedTimer = setInterval(() => {
      if (this.status === 'recording') {
        this.elapsedSeconds++
        const currentBytes = this.getTotalBytesWritten()
        const bitrateKbps = this.elapsedSeconds > 0 ? Math.round((currentBytes * 8) / (this.elapsedSeconds * 1000)) : 0
        this.options.onProgress?.({
          bytesWritten: currentBytes,
          elapsedSeconds: this.elapsedSeconds,
          bitrateKbps
        })
      }
    }, 1000)
  }

  private startPart(): void {
    if (this.isDestroyed || this.status === 'paused' || this.status === 'finalizing') return

    const ffmpegInfo = FFmpegResolver.getPaths()
    if (!ffmpegInfo.available) {
      this.fail('FFmpeg binary not available', ffmpegInfo.error)
      return
    }

    this.currentPartPath = path.join(this.workingDir, `part${this.currentPartIndex}.ts`)
    this.currentPartStartTime = new Date().toISOString()

    const partId = this.repo.addPart({
      recordingId: this.id,
      partIndex: this.currentPartIndex,
      path: this.currentPartPath,
      startUtc: this.currentPartStartTime,
      bytes: 0,
      mode: 'copy'
    })

    // Command line flags:
    // -i streamUrl -c copy -f mpegts -y partPath
    const args = [
      '-hide_banner',
      '-loglevel', 'warning',
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', this.streamUrl,
      '-c', 'copy',
      '-f', 'mpegts',
      '-y',
      this.currentPartPath
    ]

    try {
      this.ffmpegProcess = spawn(ffmpegInfo.ffmpegPath, args, {
        windowsHide: true,
        stdio: ['pipe', 'ignore', 'pipe']
      })
    } catch (err) {
      this.fail('Failed to spawn FFmpeg', err instanceof Error ? err.message : String(err))
      return
    }

    const pid = this.ffmpegProcess.pid
    this.lastGrowthTime = Date.now()

    this.ffmpegProcess.stderr?.on('data', (chunk) => {
      const msg = chunk.toString()
      if (msg.includes('401') || msg.includes('403') || msg.includes('Forbidden')) {
        void this.handleTokenExpired()
      }
    })

    this.ffmpegProcess.on('exit', (code, signal) => {
      // Record part size in DB
      let size = 0
      try {
        if (fs.existsSync(this.currentPartPath)) {
          size = fs.statSync(this.currentPartPath).size
        }
      } catch {}

      this.repo.updatePart(partId, new Date().toISOString(), size)
      this.ffmpegProcess = null

      if (this.status === 'recording') {
        // Unexpected exit while actively recording: start new part to recover
        this.currentPartIndex++
        this.repo.addEvent({
          recordingId: this.id,
          type: 'restart',
          message: `FFmpeg process ${pid} exited with code ${code ?? signal}; restarting next part`,
          timestamp: new Date().toISOString()
        })
        setTimeout(() => this.startPart(), 1000)
      }
    })
  }

  async pause(): Promise<void> {
    if (this.status !== 'recording') return
    this.transition('paused', 'Recording paused by user')
    this.stopCurrentProcess()
  }

  async resume(): Promise<void> {
    if (this.status !== 'paused') return
    this.transition('recording', 'Recording resumed by user')
    this.currentPartIndex++
    this.startPart()
  }

  async stop(endedEarly = false): Promise<void> {
    if (['finalizing', 'completed', 'failed', 'cancelled'].includes(this.status)) return

    this.transition('finalizing', endedEarly ? 'Recording ended early by user' : 'Recording completed planned duration')
    this.stopCurrentProcess()
    this.cleanupTimers()

    // Release from SharedStreamFetcher
    SharedStreamFetcher.getInstance().release(
      this.channelId,
      this.record.quality,
      `recorder_${this.id}`
    )

    this.options.onFinalizeReady?.(this)
  }

  async cancel(): Promise<void> {
    this.transition('cancelled', 'Recording cancelled')
    this.stopCurrentProcess()
    this.cleanupTimers()
    this.cleanupWorkingFiles()
    SharedStreamFetcher.getInstance().release(
      this.channelId,
      this.record.quality,
      `recorder_${this.id}`
    )
  }

  fail(reason: string, details?: string): void {
    this.transition('failed', reason, { details })
    this.repo.updateRecordingFields(this.id, { failureReason: `${reason}: ${details ?? ''}` })
    this.stopCurrentProcess()
    this.cleanupTimers()
    SharedStreamFetcher.getInstance().release(
      this.channelId,
      this.record.quality,
      `recorder_${this.id}`
    )
  }

  private stopCurrentProcess(): void {
    if (!this.ffmpegProcess) return
    const proc = this.ffmpegProcess
    this.ffmpegProcess = null

    try {
      // Graceful stop: send 'q' to stdin
      proc.stdin?.write('q\n')
      proc.stdin?.end()
    } catch {}

    const forceKillTimer = setTimeout(() => {
      try {
        if (!proc.killed) proc.kill('SIGKILL')
      } catch {}
    }, 2500)

    proc.once('exit', () => {
      clearTimeout(forceKillTimer)
    })
  }

  private async handleTokenExpired(): Promise<void> {
    if (this.status !== 'recording') return
    this.transition('reconnecting', 'CDN token expired; refreshing stream URL')

    try {
      if (this.options.requestFreshStreamUrl) {
        const fresh = await this.options.requestFreshStreamUrl()
        if (fresh) {
          this.streamUrl = fresh
          this.transition('recording', 'Refreshed stream URL; resuming next part')
          this.stopCurrentProcess()
          this.currentPartIndex++
          this.startPart()
          return
        }
      }
    } catch {}

    // Retry after backoff
    setTimeout(() => {
      if (this.status === 'reconnecting') {
        void this.handleTokenExpired()
      }
    }, 5000)
  }

  private startWatchdog(): void {
    this.watchdogTimer = setInterval(() => {
      if (this.status !== 'recording') return
      try {
        if (fs.existsSync(this.currentPartPath)) {
          const size = fs.statSync(this.currentPartPath).size
          if (size > this.lastWrittenBytes) {
            this.lastWrittenBytes = size
            this.lastGrowthTime = Date.now()
          } else if (Date.now() - this.lastGrowthTime > 20_000) {
            // Output has not grown for 20s
            this.repo.addEvent({
              recordingId: this.id,
              type: 'restart',
              message: 'Output stall detected (no data written for 20s); restarting part',
              timestamp: new Date().toISOString()
            })
            this.options.onStallWarning?.(this.channelName)
            this.stopCurrentProcess()
            this.currentPartIndex++
            this.startPart()
          }
        }
      } catch {}
    }, 5000)
  }

  private startDiskCheck(): void {
    this.diskCheckTimer = setInterval(async () => {
      try {
        const folder = this.record.folder
        if (typeof fs.statfs === 'function') {
          fs.statfs(folder, (err, stats) => {
            if (!err && stats) {
              const freeBytes = stats.bfree * stats.bsize
              const criticalThreshold = 500 * 1024 * 1024 // 500 MB
              if (freeBytes < criticalThreshold) {
                this.repo.updateRecordingFields(this.id, {
                  isPartial: true,
                  partialReasons: JSON.stringify(['disk_space'])
                })
                void this.stop(true)
              }
            }
          })
        }
      } catch {}
    }, 30_000)
  }

  private getTotalBytesWritten(): number {
    let total = 0
    try {
      if (fs.existsSync(this.workingDir)) {
        const files = fs.readdirSync(this.workingDir)
        for (const f of files) {
          if (f.endsWith('.ts')) {
            total += fs.statSync(path.join(this.workingDir, f)).size
          }
        }
      }
    } catch {}
    return total
  }

  private transition(to: RecordingStatus, message: string, meta?: Record<string, unknown>): void {
    const from = this.status
    this.status = to
    this.repo.transitionStatus(this.id, to, message, meta)
    this.options.onStateChange?.(this, from, to)
  }

  private cleanupTimers(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer)
      this.watchdogTimer = null
    }
    if (this.diskCheckTimer) {
      clearInterval(this.diskCheckTimer)
      this.diskCheckTimer = null
    }
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer)
      this.elapsedTimer = null
    }
  }

  private cleanupWorkingFiles(): void {
    try {
      if (fs.existsSync(this.workingDir)) {
        fs.rmSync(this.workingDir, { recursive: true, force: true })
      }
    } catch {}
  }

  destroy(): void {
    this.isDestroyed = true
    this.stopCurrentProcess()
    this.cleanupTimers()
  }
}
