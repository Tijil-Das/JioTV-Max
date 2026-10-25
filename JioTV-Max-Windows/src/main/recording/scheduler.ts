import type { RecordingRepository } from './repository'
import type { RecordingRecord, RecordingStatus } from '../../shared/recording-types'

export interface CatchUpAction {
  recordingId: string
  action: 'start_catchup' | 'continue_recovered' | 'finalize_recovered' | 'mark_missed' | 'keep_scheduled'
  missedFromUtc?: string
  missedToUtc?: string
  noticeMessage?: string
  reason?: string
}

export interface SchedulerCallbacks {
  startRecording: (recordingId: string, options?: { catchUpNotice?: string }) => Promise<void>
  continueRecording: (recordingId: string, options?: { recoveryNotice?: string }) => Promise<void>
  finalizeRecording: (recordingId: string, options?: { recoveryNotice?: string }) => Promise<void>
  notifyUser: (title: string, message: string, type: 'recovered' | 'partial' | 'missed') => void
  onConcurrencyLimitExceeded?: (recordingId: string, reason: string) => void
}

export class Scheduler {
  private timer: NodeJS.Timeout | null = null
  private running = false
  private lastWallClock = Date.now()
  private clockCheckInterval: NodeJS.Timeout | null = null

  constructor(
    private readonly repo: RecordingRepository,
    private readonly callbacks: SchedulerCallbacks
  ) {}

  start(): void {
    if (this.running) return
    this.running = true
    this.lastWallClock = Date.now()

    // Monitor for system clock changes / sleep resumes
    this.clockCheckInterval = setInterval(() => {
      const now = Date.now()
      const delta = Math.abs(now - this.lastWallClock - 5000)
      if (delta > 15_000) {
        // Significant clock jump detected (e.g. system wake from sleep or time sync)
        this.runCatchUp()
      }
      this.lastWallClock = now
    }, 5000)

    this.runCatchUp()
  }

  stop(): void {
    this.running = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.clockCheckInterval) {
      clearInterval(this.clockCheckInterval)
      this.clockCheckInterval = null
    }
  }

  /**
   * Evaluates the catch-up and crash recovery decision table for a list of recordings.
   * Can be tested deterministically with a fake clock.
   */
  static evaluateCatchUpActions(
    recordings: RecordingRecord[],
    nowEpochMs: number,
    concurrencyLimit = 2
  ): CatchUpAction[] {
    const actions: CatchUpAction[] = []
    const toStartCandidates: RecordingRecord[] = []

    for (const rec of recordings) {
      const paddingMs = rec.paddingMinutes * 60 * 1000
      const startMs = new Date(rec.plannedStartUtc).getTime() - paddingMs
      const endMs = new Date(rec.plannedEndUtc).getTime() + paddingMs

      // 1. Crash recovery for interrupted/stuck recordings
      if (['starting', 'recording', 'paused', 'finalizing'].includes(rec.status)) {
        if (endMs - nowEpochMs >= 60_000) {
          actions.push({
            recordingId: rec.id,
            action: 'continue_recovered',
            recoveryNotice: `Recording of ${rec.channelName} was recovered after an unexpected exit.`
          } as CatchUpAction & { recoveryNotice: string })
        } else {
          actions.push({
            recordingId: rec.id,
            action: 'finalize_recovered',
            noticeMessage: `Recording of ${rec.channelName} was recovered after an unexpected exit.`
          })
        }
        continue
      }

      // 2. Scheduled recordings catch-up
      if (rec.status === 'scheduled') {
        if (nowEpochMs < startMs) {
          actions.push({
            recordingId: rec.id,
            action: 'keep_scheduled'
          })
        } else if (endMs - nowEpochMs >= 60_000) {
          // Window in progress
          toStartCandidates.push(rec)
        } else {
          // Window passed or remaining time under 1 min
          actions.push({
            recordingId: rec.id,
            action: 'mark_missed',
            reason: 'Window passed or remaining time under 1 minute'
          })
        }
      }
    }

    // Sort candidates by earliest planned start
    toStartCandidates.sort(
      (a, b) => new Date(a.plannedStartUtc).getTime() - new Date(b.plannedStartUtc).getTime()
    )

    let startedCount = 0
    for (const cand of toStartCandidates) {
      if (startedCount < concurrencyLimit) {
        startedCount++
        const fromDate = new Date(cand.plannedStartUtc)
        const nowDate = new Date(nowEpochMs)
        const fromStr = fromDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        const nowStr = nowDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

        actions.push({
          recordingId: cand.id,
          action: 'start_catchup',
          missedFromUtc: cand.plannedStartUtc,
          missedToUtc: nowDate.toISOString(),
          noticeMessage: `Some part (${fromStr} to ${nowStr}) of the recording for ${cand.channelName} could not be done because the app wasn’t running.`
        })
      } else {
        actions.push({
          recordingId: cand.id,
          action: 'mark_missed',
          reason: 'Concurrency limit reached (maximum 2 channels)'
        })
      }
    }

    return actions
  }

  runCatchUp(): void {
    const now = Date.now()
    const all = this.repo.getAllRecordings()
    const actions = Scheduler.evaluateCatchUpActions(all, now)

    for (const act of actions) {
      if (act.action === 'mark_missed') {
        const rec = this.repo.getRecording(act.recordingId)
        if (rec && rec.status !== 'missed') {
          this.repo.transitionStatus(act.recordingId, 'missed', act.reason || 'Missed recording')
          this.repo.updateRecordingFields(act.recordingId, {
            missedReason: act.reason,
            notified: true
          })
          if (!rec.notified) {
            this.callbacks.notifyUser('Missed recording', `Recording for ${rec.channelName} was missed (${act.reason}).`, 'missed')
          }
        }
      } else if (act.action === 'finalize_recovered') {
        void this.callbacks.finalizeRecording(act.recordingId, {
          recoveryNotice: act.noticeMessage
        })
      } else if (act.action === 'continue_recovered') {
        void this.callbacks.continueRecording(act.recordingId, {
          recoveryNotice: act.noticeMessage
        })
      } else if (act.action === 'start_catchup') {
        void this.callbacks.startRecording(act.recordingId, {
          catchUpNotice: act.noticeMessage
        })
      }
    }

    this.reschedule()
  }

  reschedule(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    const scheduled = this.repo.getRecordingsByStatus(['scheduled'])
    if (scheduled.length === 0) return

    const now = Date.now()
    let earliestStartMs = Infinity
    let earliestId: string | null = null

    for (const s of scheduled) {
      const paddingMs = s.paddingMinutes * 60 * 1000
      const startMs = new Date(s.plannedStartUtc).getTime() - paddingMs
      if (startMs < earliestStartMs) {
        earliestStartMs = startMs
        earliestId = s.id
      }
    }

    if (earliestId === null) return

    const delayMs = Math.max(0, earliestStartMs - now)
    // Node.js setTimeout 32-bit signed int max is ~24.8 days (2147483647 ms)
    const clampedDelay = Math.min(delayMs, 2_147_483_647)

    this.timer = setTimeout(() => {
      this.timer = null
      this.runCatchUp()
    }, clampedDelay)
  }
}
