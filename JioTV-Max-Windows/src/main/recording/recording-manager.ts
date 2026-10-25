import path from 'node:path'
import fs from 'node:fs'
import { app, powerSaveBlocker, powerMonitor, shell, type BrowserWindow } from 'electron'
import { RecordingRepository } from './repository'
import { Scheduler } from './scheduler'
import { Finalizer } from './finalizer'
import { NotificationService } from './notification-service'
import { RecorderSession } from './recorder-session'
import { Validators } from './validators'
import { NamingStorage } from './naming-storage'
import { CapabilityProbe } from './capability-probe'
import type { JioService } from '../jio-service'
import type {
  RecordingRecord,
  RecordingPreferences,
  ValidationResult,
  ActiveRecordingStats,
  ConflictRecord,
  CaptureMode
} from '../../shared/recording-types'
import type { StreamInfo } from '../../shared/types'

export class RecordingManager {
  private static instance: RecordingManager | null = null
  private repo: RecordingRepository
  private scheduler: Scheduler
  private finalizer: Finalizer
  private notifier: NotificationService
  private activeSessions = new Map<string, RecorderSession>()
  private appSuspensionBlockerId: number | null = null
  private preferencesFile: string
  private preferences: RecordingPreferences
  private getMainWindow: () => BrowserWindow | null
  private jioService: JioService | null = null

  // Smart buffering hint tracking
  private recentPlayerStalls: number[] = []
  private lastBufferingHintAt = 0

  constructor(getMainWindow: () => BrowserWindow | null) {
    this.getMainWindow = getMainWindow
    const dbPath = path.join(app.getPath('userData'), 'recordings.db')
    this.repo = new RecordingRepository(dbPath)
    this.finalizer = new Finalizer(this.repo)
    this.notifier = new NotificationService(this.repo, getMainWindow)

    this.preferencesFile = path.join(app.getPath('userData'), 'recorder-preferences.json')
    this.preferences = this.loadPreferences()

    this.scheduler = new Scheduler(this.repo, {
      startRecording: async (id, opts) => {
        await this.startSession(id, opts?.catchUpNotice)
      },
      continueRecording: async (id, opts) => {
        await this.startSession(id, opts?.recoveryNotice)
      },
      finalizeRecording: async (id, opts) => {
        const rec = this.repo.getRecording(id)
        if (rec) {
          const workingDir = path.join(rec.folder, '.working', rec.id)
          this.finalizer.enqueue({
            recordingId: id,
            workingDir,
            onComplete: (ok) => {
              if (ok && opts?.recoveryNotice) {
                this.notifier.notify({
                  type: 'recovered',
                  title: 'Recording recovered',
                  message: opts.recoveryNotice
                })
              }
            }
          })
        }
      },
      notifyUser: (title, message, type) => {
        this.notifier.notify({
          type,
          title,
          message
        })
      }
    })

    // Listen to OS power events (wake from sleep)
    powerMonitor.on('resume', () => {
      this.scheduler.runCatchUp()
    })

    RecordingManager.instance = this
  }

  static getInstance(): RecordingManager | null {
    return RecordingManager.instance
  }

  setJioService(jio: JioService): void {
    this.jioService = jio
  }

  /**
   * Determine the capture mode for a channel based on stream info and available keys.
   *
   * - Clear HLS channels: 'stream-copy' (ffmpeg -c copy, lossless)
   * - DRM channels with a known KID:KEY: 'decryption-key' (ffmpeg -cenc_decryption_key)
   * - DRM channels without a key: 'surface-capture' (desktop player surface capture)
   */
  determineCaptureMode(streamInfo: StreamInfo, drmKey?: string): CaptureMode {
    if (!streamInfo.isDrm) return 'stream-copy'
    if (drmKey) return 'decryption-key'
    return 'surface-capture'
  }

  init(): void {
    this.scheduler.start()
    // Defer low-priority capability probe after startup
    setTimeout(() => {
      void CapabilityProbe.probe(this.repo).catch(() => {})
    }, 4000)
  }

  // -----------------------------------------------------------------
  // Preferences
  // -----------------------------------------------------------------

  private loadPreferences(): RecordingPreferences {
    const defaults: RecordingPreferences = {
      defaultFolder: NamingStorage.getDefaultRecordingsDir(),
      filenamePattern: '{channel}_{date}_{time}',
      quality: 'highest',
      paddingMinutes: 0,
      preventSleep: true,
      minimizeToTray: true,
      startWithWindows: false,
      timestampCardDefault: false,
      timestampCardOptions: {
        enabled: false,
        format: '12h',
        showDate: false,
        size: 'medium',
        opacity: 0.85,
        xPercent: 5,
        yPercent: 5
      }
    }

    try {
      if (fs.existsSync(this.preferencesFile)) {
        const data = JSON.parse(fs.readFileSync(this.preferencesFile, 'utf8')) as Partial<RecordingPreferences>
        return { ...defaults, ...data }
      }
    } catch {}
    return defaults
  }

  savePreferences(prefs: Partial<RecordingPreferences>): RecordingPreferences {
    this.preferences = { ...this.preferences, ...prefs }
    try {
      fs.writeFileSync(this.preferencesFile, JSON.stringify(this.preferences, null, 2), 'utf8')
    } catch {}

    if (typeof prefs.startWithWindows === 'boolean') {
      try {
        app.setLoginItemSettings({
          openAtLogin: prefs.startWithWindows,
          openAsHidden: true,
          args: ['--minimized']
        })
      } catch {}
    }

    this.broadcastRecordingsChanged()
    return this.preferences
  }

  getPreferences(): RecordingPreferences {
    return this.preferences
  }

  // -----------------------------------------------------------------
  // Scheduling & Session Lifecycle
  // -----------------------------------------------------------------

  async scheduleRecording(input: {
    channelId: string
    channelName: string
    channelLogo?: string
    fromEpochMs: number
    toEpochMs: number
    paddingMinutes?: number
    folder?: string
    filename?: string
    quality?: 'highest' | 'balanced'
    overlaySettings?: Record<string, unknown>
    isRecordNow?: boolean
    isDrm?: boolean
    captureMode?: CaptureMode
    drmKey?: string
  }): Promise<{ ok: boolean; recordingId?: string; error?: string; validation?: ValidationResult }> {
    const session = this.jioService?.getSession()
    const accountId = (session as any)?.phone || session?.user?.subscriberId || 'default_user'
    const folder = input.folder || this.preferences.defaultFolder
    const padding = input.paddingMinutes ?? this.preferences.paddingMinutes
    const quality = input.quality || this.preferences.quality
    const filename = input.filename || NamingStorage.generateFilename(input.channelName, input.fromEpochMs, this.preferences.filenamePattern)

    // Run live validators
    const existing = this.getExistingIntervals()
    const validation = Validators.validateAll({
      channel: { id: input.channelId, name: input.channelName },
      fromEpochMs: input.fromEpochMs,
      toEpochMs: input.toEpochMs,
      paddingMinutes: padding,
      isRecordNow: input.isRecordNow,
      existingIntervals: existing,
      filename
    })

    if (!validation.valid) {
      return {
        ok: false,
        error: validation.errors[0]?.message || 'Validation failed',
        validation
      }
    }

    const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const rec: RecordingRecord = {
      id,
      accountId,
      channelId: input.channelId,
      channelName: input.channelName,
      channelLogo: input.channelLogo,
      status: input.isRecordNow ? 'starting' : 'scheduled',
      plannedStartUtc: new Date(input.fromEpochMs).toISOString(),
      plannedEndUtc: new Date(input.toEpochMs).toISOString(),
      paddingMinutes: padding,
      quality,
      folder,
      isDefaultFolder: folder === this.preferences.defaultFolder,
      filename,
      sizeBytes: 0,
      durationSeconds: 0,
      overlaySettings: input.overlaySettings ? JSON.stringify(input.overlaySettings) : undefined,
      overlayApplied: false,
      isPartial: false,
      notified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDrm: input.isDrm ? true : undefined,
      captureMode: input.captureMode ?? 'stream-copy',
      drmKey: input.drmKey ?? undefined
    }

    this.repo.insertRecording(rec)
    this.broadcastRecordingsChanged()

    if (input.isRecordNow) {
      await this.startSession(id)
    } else {
      this.scheduler.reschedule()
      this.notifier.notify({
        type: 'started',
        title: 'Recording scheduled',
        message: `${input.channelName} scheduled for ${new Date(input.fromEpochMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
      })
    }

    return { ok: true, recordingId: id, validation }
  }

  private async startSession(recordingId: string, notice?: string): Promise<void> {
    const rec = this.repo.getRecording(recordingId)
    if (!rec || this.activeSessions.has(recordingId)) return

    // Re-verify stream & plan before start
    let streamUrl = ''
    let streamInfo: StreamInfo | null = null
    if (this.jioService) {
      const streamRes = await this.jioService.getStream(rec.channelId, rec.quality === 'balanced' ? 'medium' : 'high')
      if (!streamRes.ok) {
        if (streamRes.code === 'NOT_ENTITLED') {
          this.repo.transitionStatus(recordingId, 'failed', 'Channel is not in user plan')
          this.repo.updateRecordingFields(recordingId, {
            isPartial: true,
            partialReasons: JSON.stringify(['plan_changed'])
          })
          this.notifier.notify({
            type: 'partial',
            title: 'Recording failed',
            message: `Recording for ${rec.channelName} stopped because channel is no longer entitled in your plan.`
          })
          return
        }
        // General stream fetch failure
        this.repo.transitionStatus(recordingId, 'reconnecting', `Waiting for stream: ${streamRes.error}`)
        return
      }
      streamUrl = streamRes.data.url
      streamInfo = streamRes.data
    }

    // Determine capture mode for this recording
    let captureMode: CaptureMode = 'stream-copy'
    let drmKey: string | undefined = undefined
    if (streamInfo?.isDrm) {
      captureMode = this.determineCaptureMode(streamInfo, rec.drmKey)
      drmKey = rec.drmKey
    }

    const session = new RecorderSession(rec, this.repo, {
      streamUrl,
      captureMode,
      drmKey,
      getMainWindow: this.getMainWindow,
      overlaySettings: rec.overlaySettings ? JSON.parse(rec.overlaySettings) : undefined,
      requestFreshStreamUrl: async () => {
        if (!this.jioService) return null
        const res = await this.jioService.getStream(rec.channelId, rec.quality === 'balanced' ? 'medium' : 'high')
        return res.ok ? res.data.url : null
      },
      onStateChange: () => {
        this.broadcastRecordingsChanged()
      },
      onFinalizeReady: (sess) => {
        this.activeSessions.delete(sess.id)
        this.updatePowerBlocker()
        this.broadcastRecordingsChanged()
        this.finalizer.enqueue({
          recordingId: sess.id,
          workingDir: sess.getWorkingDir(),
          onComplete: (ok, finalPath, err) => {
            this.broadcastRecordingsChanged()
            if (ok) {
              this.notifier.notify({
                type: 'finished',
                title: 'Recording completed',
                message: `Saved ${rec.channelName} to ${path.basename(finalPath || rec.filename)}.`
              })
            } else {
              this.notifier.notify({
                type: 'failed',
                title: 'Finalization needs attention',
                message: `Failed to finalize ${rec.channelName} (${err}). Working data preserved.`
              })
            }
          }
        })
      },
      onStallWarning: (channelName) => {
        this.checkBufferingHint(channelName)
      }
    })

    this.activeSessions.set(recordingId, session)
    this.updatePowerBlocker()
    await session.start()
    this.broadcastRecordingsChanged()

    if (notice) {
      this.notifier.notify({
        type: 'partial',
        title: 'Recording adjusted',
        message: notice
      })
    }
  }

  async pauseRecording(id: string): Promise<boolean> {
    const session = this.activeSessions.get(id)
    if (session) {
      await session.pause()
      this.broadcastRecordingsChanged()
      return true
    }
    return false
  }

  async resumeRecording(id: string): Promise<boolean> {
    const session = this.activeSessions.get(id)
    if (session) {
      await session.resume()
      this.broadcastRecordingsChanged()
      return true
    }
    return false
  }

  async stopRecording(id: string): Promise<boolean> {
    const session = this.activeSessions.get(id)
    if (session) {
      await session.stop(true)
      this.broadcastRecordingsChanged()
      return true
    }
    return false
  }

  async cancelRecording(id: string): Promise<boolean> {
    const session = this.activeSessions.get(id)
    if (session) {
      await session.cancel()
      this.activeSessions.delete(id)
      this.updatePowerBlocker()
      this.broadcastRecordingsChanged()
      return true
    }
    // Cancel scheduled
    const rec = this.repo.getRecording(id)
    if (rec && rec.status === 'scheduled') {
      this.repo.transitionStatus(id, 'cancelled', 'Cancelled by user')
      this.scheduler.reschedule()
      this.broadcastRecordingsChanged()
      return true
    }
    return false
  }

  async deleteRecording(id: string): Promise<boolean> {
    const rec = this.repo.getRecording(id)
    if (!rec) return false

    // Move final file to Recycle Bin if exists
    if (rec.finalPath && fs.existsSync(rec.finalPath)) {
      try {
        await shell.trashItem(rec.finalPath)
      } catch {
        try { fs.unlinkSync(rec.finalPath) } catch {}
      }
    }
    this.repo.deleteRecording(id)
    this.broadcastRecordingsChanged()
    return true
  }

  async retryFinalize(id: string): Promise<boolean> {
    const rec = this.repo.getRecording(id)
    if (!rec) return false
    const workingDir = path.join(rec.folder, '.working', rec.id)
    this.finalizer.enqueue({
      recordingId: id,
      workingDir,
      onComplete: (ok) => {
        this.broadcastRecordingsChanged()
        if (ok) {
          this.notifier.notify({
            type: 'finished',
            title: 'Finalization recovered',
            message: `Recording of ${rec.channelName} finalized successfully.`
          })
        }
      }
    })
    this.broadcastRecordingsChanged()
    return true
  }

  async updateEndTime(id: string, newEndEpochMs: number): Promise<{ ok: boolean; error?: string }> {
    const rec = this.repo.getRecording(id)
    if (!rec) return { ok: false, error: 'Recording not found' }
    if (!['scheduled', 'starting', 'recording', 'paused'].includes(rec.status)) {
      return { ok: false, error: 'Cannot edit end time for completed or cancelled recordings' }
    }

    const startEpochMs = new Date(rec.actualStartUtc || rec.plannedStartUtc).getTime()
    if (newEndEpochMs <= startEpochMs) {
      return { ok: false, error: 'End time must be after start time' }
    }

    const durationMin = Math.round((newEndEpochMs - startEpochMs) / 60000)
    if (durationMin < 1 || durationMin > 480) {
      return { ok: false, error: 'Duration must be between 1 minute and 8 hours' }
    }

    const otherIntervals = this.getExistingIntervals().filter((i) => i.id !== id)
    const paddingMs = rec.paddingMinutes * 60 * 1000
    const concIssues = Validators.validateConcurrency(
      {
        id,
        channelId: rec.channelId,
        channelName: rec.channelName,
        startEpochMs: startEpochMs - paddingMs,
        endEpochMs: newEndEpochMs + paddingMs
      },
      otherIntervals
    )

    const hasError = concIssues.some((issue) => issue.level === 'error')
    if (hasError) {
      return { ok: false, error: concIssues[0].message }
    }

    this.repo.updateRecordingFields(id, {
      plannedEndUtc: new Date(newEndEpochMs).toISOString()
    })
    this.scheduler.reschedule()
    this.broadcastRecordingsChanged()
    return { ok: true }
  }

  async renameRecording(id: string, newFilename: string): Promise<{ ok: boolean; error?: string }> {
    const rec = this.repo.getRecording(id)
    if (!rec) return { ok: false, error: 'Recording not found' }
    if (rec.status !== 'completed' || !rec.finalPath) {
      return { ok: false, error: 'Only completed recordings can be renamed' }
    }

    let clean = Validators.sanitizeFilename(newFilename)
    if (!clean.toLowerCase().endsWith('.mp4')) {
      clean = `${clean}.mp4`
    }

    const newPath = path.join(path.dirname(rec.finalPath), clean)
    if (fs.existsSync(newPath)) {
      return { ok: false, error: 'A file with that name already exists' }
    }

    try {
      if (fs.existsSync(rec.finalPath)) {
        fs.renameSync(rec.finalPath, newPath)
      }
      this.repo.updateRecordingFields(id, {
        filename: clean,
        finalPath: newPath
      })
      this.broadcastRecordingsChanged()
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Failed to rename file' }
    }
  }

  async playRecording(id: string): Promise<{ ok: boolean; error?: string }> {
    const rec = this.repo.getRecording(id)
    if (!rec || !rec.finalPath) return { ok: false, error: 'Recording file not found' }
    if (!fs.existsSync(rec.finalPath)) return { ok: false, error: 'File is missing from disk' }
    await shell.openPath(rec.finalPath)
    return { ok: true }
  }

  resolveConflict(conflictId: string, decision: ConflictRecord['decision']): void {
    this.repo.resolveConflict(conflictId, decision)
  }

  // -----------------------------------------------------------------
  // Power Management & Trailing
  // -----------------------------------------------------------------

  private updatePowerBlocker(): void {
    const hasActive = this.activeSessions.size > 0
    if (hasActive && this.preferences.preventSleep) {
      if (this.appSuspensionBlockerId === null) {
        this.appSuspensionBlockerId = powerSaveBlocker.start('prevent-app-suspension')
      }
    } else {
      if (this.appSuspensionBlockerId !== null) {
        if (powerSaveBlocker.isStarted(this.appSuspensionBlockerId)) {
          powerSaveBlocker.stop(this.appSuspensionBlockerId)
        }
        this.appSuspensionBlockerId = null
      }
    }
  }

  hasActiveOrImminentRecordings(): boolean {
    if (this.activeSessions.size > 0) return true
    const scheduled = this.repo.getRecordingsByStatus(['scheduled'])
    const now = Date.now()
    // Imminent if scheduled to start within 15 minutes
    return scheduled.some((s) => new Date(s.plannedStartUtc).getTime() - now < 15 * 60 * 1000)
  }

  // -----------------------------------------------------------------
  // Smart Buffering Hint
  // -----------------------------------------------------------------

  reportPlayerStall(): void {
    const now = Date.now()
    this.recentPlayerStalls.push(now)
    // Keep only stalls within last 60 seconds
    this.recentPlayerStalls = this.recentPlayerStalls.filter((t) => now - t <= 60_000)

    if (this.recentPlayerStalls.length >= 2 && this.activeSessions.size > 0) {
      if (now - this.lastBufferingHintAt > 30 * 60 * 1000) {
        this.lastBufferingHintAt = now
        this.notifier.notify({
          type: 'buffering_hint',
          title: 'Buffering detected',
          message: 'Recordings use network bandwidth in the background. Would you like to pause them?',
          dedupeKey: `buffering_hint_${Math.floor(now / (30 * 60 * 1000))}`
        })
      }
    }
  }

  private checkBufferingHint(channelName: string): void {
    this.reportPlayerStall()
  }

  pauseAll(): void {
    for (const session of this.activeSessions.values()) {
      void session.pause()
    }
  }

  // -----------------------------------------------------------------
  // Getters & Stats
  // -----------------------------------------------------------------

  private onTrayUpdate: (() => void) | null = null

  setTrayUpdater(fn: () => void): void {
    this.onTrayUpdate = fn
  }

  broadcastRecordingsChanged(): void {
    this.onTrayUpdate?.()
    const win = this.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('recording:recordings-changed')
    }
  }

  getActiveStats(): ActiveRecordingStats[] {
    const list: ActiveRecordingStats[] = []
    for (const session of this.activeSessions.values()) {
      list.push({
        id: session.id,
        channelName: session.channelName,
        status: session.getStatus(),
        elapsedSeconds: session.getElapsedSeconds(),
        sizeBytes: session.getBytesWritten(),
        bitrateKbps: session.getBitrateKbps(),
        partCount: session.getPartCount()
      })
    }
    return list
  }

  getAllRecordings(): RecordingRecord[] {
    const list = this.repo.getAllRecordings()
    // File missing detection on library access
    for (const rec of list) {
      if (rec.status === 'completed' && rec.finalPath) {
        if (!fs.existsSync(rec.finalPath)) {
          this.repo.transitionStatus(rec.id, 'needs_attention', 'Recorded file missing from disk')
          rec.status = 'needs_attention'
          rec.failureReason = 'File missing'
        }
      }
    }
    return list
  }

  getExistingIntervals() {
    const all = this.repo.getAllRecordings()
    return all
      .filter((r) => ['scheduled', 'starting', 'recording', 'paused'].includes(r.status))
      .map((r) => {
        const paddingMs = r.paddingMinutes * 60 * 1000
        return {
          id: r.id,
          channelId: r.channelId,
          channelName: r.channelName,
          startEpochMs: new Date(r.plannedStartUtc).getTime() - paddingMs,
          endEpochMs: new Date(r.plannedEndUtc).getTime() + paddingMs,
          status: r.status
        }
      })
  }

  destroy(): void {
    this.scheduler.stop()
    for (const session of this.activeSessions.values()) {
      session.destroy()
    }
    this.activeSessions.clear()
    this.updatePowerBlocker()
    this.repo.close()
  }
}
