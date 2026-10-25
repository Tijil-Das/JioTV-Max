import { app, ipcMain, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { RecordingRepository } from './repository'
import type { RecordingRecord, CaptureMode } from '../../shared/recording-types'

/**
 * DesktopCaptureSession coordinates surface/desktop capture for DRM (Widevine) channels.
 *
 * Because desktop Widevine runs at L3 (software-level) without HDCP memory blacking,
 * the decrypted A/V can be captured directly from the Electron player window surface.
 *
 * Architecture:
 *   Main process: DesktopCaptureSession owns the recording lifecycle (part files, watchdog,
 *   pause/resume/stop). It sends IPC to the renderer to start/stop a MediaRecorder that
 *   captures the player window via desktopCapturer + getUserMedia(chromeMediaSource).
 *   Renderer: receives start/stop IPC, captures the window stream, records via MediaRecorder,
 *   and sends recorded chunks back to the main process via IPC.
 *   Main process: writes incoming chunks to .webm part files in the working directory.
 *
 * The part files are then finalized by the existing Finalizer (concat → MP4).
 */

export interface DesktopCaptureSessionOptions {
  streamUrl: string // DASH MPD URL (for reference/diagnostics)
  licenseUrl?: string // Widevine license URL (for reference/diagnostics)
  onStateChange?: (session: DesktopCaptureSession, from: string, to: string) => void
  onProgress?: (stats: { bytesWritten: number; elapsedSeconds: number }) => void
  onFinalizeReady?: (session: DesktopCaptureSession) => void
  onChunk?: (chunk: Buffer) => void // renderer → main: recorded media chunk
}

export class DesktopCaptureSession {
  readonly id: string
  readonly channelId: string
  readonly channelName: string
  private status: string = 'starting'
  private currentPartIndex = 0
  private currentPartPath = ''
  private currentPartStartTime = ''
  private workingDir: string
  private elapsedSeconds = 0
  private elapsedTimer: NodeJS.Timeout | null = null
  private isDestroyed = false
  private partWriteStream: fs.WriteStream | null = null
  private pendingChunkBuffers: Buffer[] = []
  private flushTimer: NodeJS.Timeout | null = null

  private readonly record: RecordingRecord
  private readonly repo: RecordingRepository
  private readonly options: DesktopCaptureSessionOptions
  private readonly getMainWindow: () => BrowserWindow | null

  constructor(
    record: RecordingRecord,
    repo: RecordingRepository,
    options: DesktopCaptureSessionOptions,
    getMainWindow: () => BrowserWindow | null
  ) {
    this.record = record
    this.repo = repo
    this.options = options
    this.getMainWindow = getMainWindow
    this.id = record.id
    this.channelId = record.channelId
    this.channelName = record.channelName

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

    // Register IPC handler for chunks from renderer
    ipcMain.on(`desktop-capture:chunk:${this.id}`, (_event, chunk: Buffer) => {
      this.handleChunk(chunk)
    })
  }

  getStatus(): string {
    return this.status
  }

  getWorkingDir(): string {
    return this.workingDir
  }

  getRecord(): RecordingRecord {
    return this.record
  }

  getElapsedSeconds(): number {
    return this.elapsedSeconds
  }

  getPartCount(): number {
    return this.currentPartIndex + 1
  }

  /**
   * Called by the renderer to request the list of capturable window sources.
   * Returns desktopCapturer sources so the renderer can pick the player window.
   */
  static async requestWindowSources(): Promise<Array<{ id: string; name: string; thumbnail: string }>> {
    const { desktopCapturer } = await import('electron')
    const sources = await desktopCapturer.getSources({ types: ['window'] })
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL()
    }))
  }

  async start(): Promise<void> {
    if (this.isDestroyed) return
    this.transition('recording', 'Surface capture started')
    this.repo.updateRecordingFields(this.id, {
      actualStartUtc: new Date().toISOString()
    })

    this.startPart()
    this.startElapsedTimer()

    // Notify renderer to begin surface capture of the player window
    const win = this.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('desktop-capture:start', {
        recordingId: this.id,
        channelId: this.channelId,
        channelName: this.channelName
      })
    }
  }

  private startPart(): void {
    if (this.isDestroyed || this.status === 'paused' || this.status === 'finalizing') return

    this.currentPartPath = path.join(this.workingDir, `part${this.currentPartIndex}.webm`)
    this.currentPartStartTime = new Date().toISOString()

    this.repo.addPart({
      recordingId: this.id,
      partIndex: this.currentPartIndex,
      path: this.currentPartPath,
      startUtc: this.currentPartStartTime,
      bytes: 0,
      mode: 'surface'
    })

    // Open write stream for this part
    try {
      this.partWriteStream = fs.createWriteStream(this.currentPartPath)
    } catch (err) {
      this.fail('Failed to open part write stream', err instanceof Error ? err.message : String(err))
      return
    }

    this.pendingChunkBuffers = []
    this.scheduleFlush()
  }

  /**
   * Receives a media chunk from the renderer (MediaRecorder dataavailable).
   * Buffers and flushes to disk periodically.
   */
  private handleChunk(chunk: Buffer): void {
    if (!this.partWriteStream || this.status !== 'recording') return
    this.pendingChunkBuffers.push(chunk)
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
    }
    this.flushTimer = setInterval(() => {
      this.flushChunks()
    }, 500) // flush every 500ms
  }

  private flushChunks(): void {
    if (!this.partWriteStream || this.pendingChunkBuffers.length === 0) return
    const data = Buffer.concat(this.pendingChunkBuffers)
    this.pendingChunkBuffers = []
    try {
      this.partWriteStream.write(data)
    } catch {}
  }

  private startElapsedTimer(): void {
    this.elapsedTimer = setInterval(() => {
      if (this.status === 'recording') {
        this.elapsedSeconds++
        this.options.onProgress?.({
          bytesWritten: this.getTotalBytesWritten(),
          elapsedSeconds: this.elapsedSeconds
        })
      }
    }, 1000)
  }

  async pause(): Promise<void> {
    if (this.status !== 'recording') return
    this.transition('paused', 'Surface capture paused')
    this.flushChunks()
    if (this.partWriteStream) {
      try { this.partWriteStream.end() } catch {}
      this.partWriteStream = null
    }
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }

    // Tell renderer to pause capture
    const win = this.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('desktop-capture:pause', { recordingId: this.id })
    }
  }

  async resume(): Promise<void> {
    if (this.status !== 'paused') return
    this.transition('recording', 'Surface capture resumed')
    this.currentPartIndex++
    this.startPart()

    const win = this.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('desktop-capture:resume', { recordingId: this.id })
    }
  }

  async stop(endedEarly = false): Promise<void> {
    if (['finalizing', 'completed', 'failed', 'cancelled'].includes(this.status)) return

    this.transition('finalizing', endedEarly ? 'Surface capture ended early' : 'Surface capture completed')
    this.flushChunks()
    if (this.partWriteStream) {
      try { this.partWriteStream.end() } catch {}
      this.partWriteStream = null
    }
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer)
      this.elapsedTimer = null
    }

    // Tell renderer to stop capture
    const win = this.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('desktop-capture:stop', { recordingId: this.id })
    }

    this.options.onFinalizeReady?.(this)
  }

  async cancel(): Promise<void> {
    this.transition('cancelled', 'Surface capture cancelled')
    this.flushChunks()
    if (this.partWriteStream) {
      try { this.partWriteStream.end() } catch {}
      this.partWriteStream = null
    }
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer)
      this.elapsedTimer = null
    }
    this.cleanupWorkingFiles()

    const win = this.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('desktop-capture:stop', { recordingId: this.id })
    }
  }

  fail(reason: string, details?: string): void {
    this.transition('failed', reason, { details })
    this.repo.updateRecordingFields(this.id, { failureReason: `${reason}: ${details ?? ''}` })
    this.flushChunks()
    if (this.partWriteStream) {
      try { this.partWriteStream.end() } catch {}
      this.partWriteStream = null
    }
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer)
      this.elapsedTimer = null
    }
  }

  private getTotalBytesWritten(): number {
    let total = 0
    try {
      if (fs.existsSync(this.workingDir)) {
        const files = fs.readdirSync(this.workingDir)
        for (const f of files) {
          if (f.endsWith('.webm')) {
            total += fs.statSync(path.join(this.workingDir, f)).size
          }
        }
      }
    } catch {}
    return total
  }

  private transition(to: string, message: string, meta?: Record<string, unknown>): void {
    const from = this.status
    this.status = to
    this.repo.transitionStatus(this.id, to as any, message, meta)
    this.options.onStateChange?.(this, from, to)
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
    if (this.partWriteStream) {
      try { this.partWriteStream.end() } catch {}
    }
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
    }
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer)
    }
    // Remove IPC listener
    try {
      ipcMain.removeAllListeners(`desktop-capture:chunk:${this.id}`)
    } catch {}
  }
}
