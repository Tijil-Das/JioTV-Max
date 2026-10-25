import path from 'node:path'
import type { ValidationIssue, ValidationResult } from '../../shared/recording-types'

const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
])

export interface TimeWindowParams {
  fromEpochMs: number
  toEpochMs: number
  isRecordNow?: boolean
  nowEpochMs?: number
  paddingMinutes?: number
}

export interface ExistingRecordingInterval {
  id: string
  channelId: string
  channelName: string
  startEpochMs: number // including padding
  endEpochMs: number // including padding
  status: string
}

export class Validators {
  /**
   * Channel Validator
   */
  static validateChannel(channel: { id: string; name: string; isDrm?: boolean; type?: string } | null, isPlanEntitled = true): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    if (!channel) {
      issues.push({
        field: 'channel',
        level: 'error',
        message: 'Channel does not exist.'
      })
      return issues
    }

    if (!isPlanEntitled) {
      issues.push({
        field: 'channel',
        level: 'error',
        message: 'This channel is not available in your JioTV plan.'
      })
    }

    return issues
  }

  /**
   * Time Window Validator
   */
  static validateTimeWindow(params: TimeWindowParams): {
    issues: ValidationIssue[]
    endsTomorrowText?: string
  } {
    const issues: ValidationIssue[] = []
    const now = params.nowEpochMs ?? Date.now()
    const { fromEpochMs, toEpochMs, isRecordNow } = params

    const minFromFutureMs = 28_000 // ~30 seconds with 2s clock drift tolerance
    const maxFutureMs = 7 * 24 * 3600 * 1000 // 7 days

    if (!isRecordNow) {
      if (fromEpochMs < now + minFromFutureMs) {
        issues.push({
          field: 'from',
          level: 'error',
          message: 'Start time must be at least 30 seconds in the future.'
        })
      }
      if (fromEpochMs > now + maxFutureMs) {
        issues.push({
          field: 'from',
          level: 'error',
          message: 'Start time cannot be scheduled more than 7 days ahead.'
        })
      }
    }

    if (toEpochMs <= fromEpochMs) {
      issues.push({
        field: 'to',
        level: 'error',
        message: 'End time must be after start time.'
      })
    } else {
      const durationMs = toEpochMs - fromEpochMs
      const minDurationMs = 60 * 1000 // 1 minute
      const maxDurationMs = 8 * 3600 * 1000 // 8 hours

      if (durationMs < minDurationMs) {
        issues.push({
          field: 'to',
          level: 'error',
          message: 'Recording duration must be at least 1 minute.'
        })
      }
      if (durationMs > maxDurationMs) {
        issues.push({
          field: 'to',
          level: 'error',
          message: 'Recording duration cannot exceed 8 hours.'
        })
      }
    }

    let endsTomorrowText: string | undefined
    if (toEpochMs > fromEpochMs) {
      const fromDate = new Date(fromEpochMs)
      const toDate = new Date(toEpochMs)
      if (fromDate.toLocaleDateString() !== toDate.toLocaleDateString()) {
        const timeStr = toDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        const diffDays = Math.round((toDate.getTime() - fromDate.getTime()) / (24 * 3600 * 1000))
        endsTomorrowText = diffDays > 1 ? `Ends in ${diffDays} days, ${timeStr}` : `Ends tomorrow, ${timeStr}`
      }
    }

    return { issues, endsTomorrowText }
  }

  /**
   * Concurrency Validator
   * Half-open intervals: [start, end)
   * Limit: At most 2 channels at any second.
   * Same channel cannot overlap itself.
   */
  static validateConcurrency(
    target: { id?: string; channelId: string; channelName: string; startEpochMs: number; endEpochMs: number },
    existing: ExistingRecordingInterval[]
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    // 1. Same channel cannot overlap itself
    for (const item of existing) {
      if (target.id && item.id === target.id) continue
      if (item.channelId === target.channelId) {
        // Half-open [A_start, A_end) overlaps [B_start, B_end) if A_start < B_end && B_start < A_end
        if (target.startEpochMs < item.endEpochMs && item.startEpochMs < target.endEpochMs) {
          issues.push({
            field: 'concurrency',
            level: 'error',
            message: `Recording overlaps an existing recording for ${item.channelName}.`
          })
          return issues
        }
      }
    }

    // 2. Concurrency limit of 2 across all channels
    // Collect all critical time points within the target interval
    const timePoints = new Set<number>()
    timePoints.add(target.startEpochMs)
    for (const item of existing) {
      if (target.id && item.id === target.id) continue
      if (item.startEpochMs >= target.startEpochMs && item.startEpochMs < target.endEpochMs) {
        timePoints.add(item.startEpochMs)
      }
    }

    for (const t of timePoints) {
      // Find all existing intervals active at time t: start <= t < end
      const active = existing.filter(
        (item) => (!target.id || item.id !== target.id) && item.startEpochMs <= t && t < item.endEpochMs
      )

      if (active.length >= 2) {
        const names = [...new Set(active.map((a) => a.channelName))].join(' and ')
        issues.push({
          field: 'concurrency',
          level: 'error',
          message: `Concurrency limit reached (maximum 2 channels). Conflicts with ${names}.`
        })
        break
      }
    }

    return issues
  }

  /**
   * Sanitize Windows filename
   */
  static sanitizeFilename(raw: unknown): string {
    const rawStr =
      typeof raw === 'string'
        ? raw
        : raw && typeof raw === 'object' && 'filename' in raw && typeof (raw as any).filename === 'string'
          ? (raw as any).filename
          : String(raw ?? '')
    let name = rawStr.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    name = name.trim().replace(/[. ]+$/, '')

    const ext = path.extname(name)
    let base = ext ? path.basename(name, ext) : name

    if (WINDOWS_RESERVED_NAMES.has(base.toUpperCase())) {
      base = `${base}_rec`
    }

    if (!base) {
      base = 'recording'
    }

    return `${base}.mp4`
  }

  /**
   * Disk Space Estimation & Validation
   */
  static estimateDiskBytes(durationSeconds: number, bitrateBps = 5_000_000): number {
    const rawBytes = (bitrateBps / 8) * durationSeconds
    const withMultiplier = rawBytes * 1.2
    const headroomBytes = 50 * 1024 * 1024 // 50 MB safety margin
    return Math.round(withMultiplier + headroomBytes)
  }

  static validateDiskSpace(
    estimateBytes: number,
    freeSpaceBytes: number,
    totalScheduledEstimateBytes = 0
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    if (freeSpaceBytes < estimateBytes) {
      const freeMb = Math.round(freeSpaceBytes / (1024 * 1024))
      const reqMb = Math.round(estimateBytes / (1024 * 1024))
      issues.push({
        field: 'file',
        level: 'error',
        message: `Insufficient free disk space (${freeMb} MB free, ~${reqMb} MB required).`
      })
      return issues
    }

    if (freeSpaceBytes < estimateBytes * 1.5) {
      issues.push({
        field: 'file',
        level: 'warning',
        message: 'Low disk space warning: free disk space is less than 1.5x the recording estimate.'
      })
    }

    if (freeSpaceBytes < totalScheduledEstimateBytes + estimateBytes) {
      issues.push({
        field: 'file',
        level: 'warning',
        message: 'Total space for all scheduled recordings may exceed current free disk space.'
      })
    }

    return issues
  }

  /**
   * Complete Schedule Validator Aggregator
   */
  static validateAll(input: {
    channel: { id: string; name: string; isDrm?: boolean; type?: string } | null
    isPlanEntitled?: boolean
    fromEpochMs?: number
    toEpochMs?: number
    paddingMinutes?: number
    isRecordNow?: boolean
    nowEpochMs?: number
    timeWindow?: {
      fromEpochMs?: number
      toEpochMs?: number
      isRecordNow?: boolean
      nowEpochMs?: number
    }
    existingIntervals: ExistingRecordingInterval[]
    targetId?: string
    filename: string | { filename?: string }
    freeSpaceBytes?: number
    totalScheduledEstimateBytes?: number
    bitrateBps?: number
  }): ValidationResult {
    const errors: ValidationIssue[] = []
    const warnings: ValidationIssue[] = []

    const fromEpochMs = input.fromEpochMs ?? input.timeWindow?.fromEpochMs ?? 0
    const toEpochMs = input.toEpochMs ?? input.timeWindow?.toEpochMs ?? 0
    const isRecordNow = input.isRecordNow ?? input.timeWindow?.isRecordNow ?? false
    const nowEpochMs = input.nowEpochMs ?? input.timeWindow?.nowEpochMs
    const paddingMinutes = input.paddingMinutes ?? 0
    const rawFilename = input.filename
    const filenameStr =
      typeof rawFilename === 'string'
        ? rawFilename
        : rawFilename && typeof rawFilename === 'object' && 'filename' in rawFilename && typeof rawFilename.filename === 'string'
          ? rawFilename.filename
          : ''

    // 1. Channel
    const channelIssues = this.validateChannel(input.channel, input.isPlanEntitled ?? true)
    for (const issue of channelIssues) {
      if (issue.level === 'error') errors.push(issue)
      else warnings.push(issue)
    }

    // 2. Time Window
    const { issues: timeIssues, endsTomorrowText } = this.validateTimeWindow({
      fromEpochMs,
      toEpochMs,
      isRecordNow,
      nowEpochMs
    })
    for (const issue of timeIssues) {
      if (issue.level === 'error') errors.push(issue)
      else warnings.push(issue)
    }

    // 3. Concurrency
    if (input.channel && toEpochMs > fromEpochMs) {
      const paddingMs = paddingMinutes * 60 * 1000
      const concIssues = this.validateConcurrency(
        {
          id: input.targetId,
          channelId: input.channel.id,
          channelName: input.channel.name,
          startEpochMs: fromEpochMs - paddingMs,
          endEpochMs: toEpochMs + paddingMs
        },
        input.existingIntervals
      )
      for (const issue of concIssues) {
        if (issue.level === 'error') errors.push(issue)
        else warnings.push(issue)
      }
    }

    // 4. Filename
    const sanitized = this.sanitizeFilename(filenameStr)
    if (filenameStr && sanitized !== filenameStr) {
      warnings.push({
        field: 'name',
        level: 'warning',
        message: `Filename will be sanitized to "${sanitized}".`,
        suggestedFix: sanitized
      })
    }

    // 5. Disk Space
    const durationSeconds = Math.max(0, Math.round((toEpochMs - fromEpochMs) / 1000))
    const diskEstimateBytes = this.estimateDiskBytes(durationSeconds, input.bitrateBps)
    if (typeof input.freeSpaceBytes === 'number') {
      const diskIssues = this.validateDiskSpace(
        diskEstimateBytes,
        input.freeSpaceBytes,
        input.totalScheduledEstimateBytes ?? 0
      )
      for (const issue of diskIssues) {
        if (issue.level === 'error') errors.push(issue)
        else warnings.push(issue)
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      diskEstimateBytes,
      endsTomorrowText
    }
  }
}
