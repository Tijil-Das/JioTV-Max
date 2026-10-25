import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { RecordingRepository } from '../../src/main/recording/repository'
import { Validators } from '../../src/main/recording/validators'
import { NamingStorage } from '../../src/main/recording/naming-storage'
import { NotificationService } from '../../src/main/recording/notification-service'
import type { RecordingRecord } from '../../src/shared/recording-types'

describe('Recording System - Integration Flows', () => {
  let tempDir: string
  let dbPath: string
  let repo: RecordingRepository
  let notifier: NotificationService

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiotv-rec-integration-'))
    dbPath = path.join(tempDir, 'test-integration.db')
    repo = new RecordingRepository(dbPath)
    notifier = new NotificationService(repo, () => null)
  })

  afterEach(() => {
    repo.close()
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  it('runs complete lifecycle: scheduling -> validation -> parts recording -> finalization state', () => {
    const now = Date.now()
    const fromEpochMs = now + 60_000
    const toEpochMs = now + 3600_000

    // 1. Validation
    const validation = Validators.validateAll({
      channel: {
        id: 'star-sports-1',
        name: 'Star Sports 1 HD',
        isDrm: false,
        streamType: 'hls'
      },
      fromEpochMs,
      toEpochMs,
      filename: 'Star_Sports_1_Match.mp4',
      existingIntervals: [],
      freeSpaceBytes: 10 * 1024 * 1024 * 1024
    })

    expect(validation.valid).toBe(true)

    // 2. Schedule insertion
    const recId = 'rec_test_101'
    const rec: RecordingRecord = {
      id: recId,
      accountId: 'default_account',
      channelId: 'star-sports-1',
      channelName: 'Star Sports 1 HD',
      status: 'scheduled',
      plannedStartUtc: new Date(fromEpochMs).toISOString(),
      plannedEndUtc: new Date(toEpochMs).toISOString(),
      paddingMinutes: 0,
      quality: 'highest',
      folder: tempDir,
      isDefaultFolder: true,
      filename: 'Star_Sports_1_Match.mp4',
      sizeBytes: 0,
      durationSeconds: 0,
      isPartial: false,
      notified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    repo.insertRecording(rec)
    expect(repo.getRecording(recId)?.status).toBe('scheduled')

    // 3. Start Recording
    repo.transitionStatus(recId, 'recording', 'Recording started')
    expect(repo.getRecording(recId)?.status).toBe('recording')

    // 4. Track Parts (Part 0, Pause -> Part 1)
    const part0Id = repo.addPart({
      recordingId: recId,
      partIndex: 0,
      path: path.join(tempDir, 'part0.ts'),
      startUtc: new Date().toISOString(),
      bytes: 0,
      mode: 'copy'
    })
    repo.updatePart(part0Id, new Date().toISOString(), 15_000_000)

    repo.transitionStatus(recId, 'paused', 'Paused by user')
    repo.transitionStatus(recId, 'recording', 'Resumed by user')

    const part1Id = repo.addPart({
      recordingId: recId,
      partIndex: 1,
      path: path.join(tempDir, 'part1.ts'),
      startUtc: new Date().toISOString(),
      bytes: 0,
      mode: 'copy'
    })
    repo.updatePart(part1Id, new Date().toISOString(), 25_000_000)

    const parts = repo.getParts(recId)
    expect(parts.length).toBe(2)
    expect(parts.reduce((sum, p) => sum + p.bytes, 0)).toBe(40_000_000)

    // 5. Finalize
    repo.transitionStatus(recId, 'completed', 'Finalization completed', {
      finalPath: path.join(tempDir, 'Star_Sports_1_Match.mp4')
    })
    repo.updateRecordingFields(recId, {
      durationSeconds: 3540,
      sizeBytes: 40_000_000,
      finalPath: path.join(tempDir, 'Star_Sports_1_Match.mp4')
    })

    const finalRecord = repo.getRecording(recId)
    expect(finalRecord?.status).toBe('completed')
    expect(finalRecord?.durationSeconds).toBe(3540)
    expect(finalRecord?.sizeBytes).toBe(40_000_000)
  })

  it('rejects recording beyond 2 concurrent recordings', () => {
    const base = Date.now() + 100_000
    const existing = [
      {
        id: 'r1',
        channelId: 'ch1',
        channelName: 'Channel 1',
        startEpochMs: base,
        endEpochMs: base + 3600_000
      },
      {
        id: 'r2',
        channelId: 'ch2',
        channelName: 'Channel 2',
        startEpochMs: base,
        endEpochMs: base + 3600_000
      }
    ]

    const issues = Validators.validateConcurrency(
      {
        startEpochMs: base + 60_000,
        endEpochMs: base + 1800_000,
        channelId: 'ch3',
        channelName: 'Channel 3'
      },
      existing
    )

    const hasError = issues.some((i) => i.level === 'error')
    expect(hasError).toBe(true)
    expect(issues[0].message).toContain('Concurrency limit reached')
  })

  it('resolves naming conflicts when target file already exists on disk', () => {
    const targetFile = path.join(tempDir, 'India_vs_Pak.mp4')
    fs.writeFileSync(targetFile, 'existing video data')

    const conflict = NamingStorage.checkConflict(tempDir, 'India_vs_Pak.mp4')
    expect(conflict.hasConflict).toBe(true)
    expect(conflict.type).toBe('existing_file')
    expect(conflict.suggestedName).toBe('India_vs_Pak_conflict_1.mp4')
  })

  it('deduplicates in-app notifications and manages unread counts', () => {
    const n1 = notifier.notify({
      type: 'buffering_hint',
      title: 'Buffering detected',
      message: 'Network is slow',
      dedupeKey: 'buffering_hour_1'
    })

    // Second notification with same dedupeKey should be ignored
    const n2 = notifier.notify({
      type: 'buffering_hint',
      title: 'Buffering detected again',
      message: 'Network is still slow',
      dedupeKey: 'buffering_hour_1'
    })

    expect(n1).toBeTruthy()
    expect(n2).toBeNull()

    const unread = notifier.getUnreadCount()
    expect(unread).toBe(1)

    notifier.markAllRead()
    expect(notifier.getUnreadCount()).toBe(0)
  })

  it('produces diagnostic export with all parts, events, and metrics', () => {
    const recId = 'diag_test_rec'
    repo.insertRecording({
      id: recId,
      accountId: 'default_account',
      channelId: 'ch_news',
      channelName: 'News 24',
      status: 'completed',
      plannedStartUtc: new Date().toISOString(),
      plannedEndUtc: new Date().toISOString(),
      paddingMinutes: 0,
      quality: 'highest',
      folder: tempDir,
      isDefaultFolder: true,
      filename: 'news.mp4',
      sizeBytes: 1024,
      durationSeconds: 60,
      isPartial: false,
      notified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })

    repo.addEvent({
      recordingId: recId,
      type: 'start',
      message: 'Test session started',
      timestamp: new Date().toISOString()
    })

    const raw = repo.getDiagnostics(recId)
    const dump = JSON.parse(raw)
    expect(dump).not.toBeNull()
    expect(dump.recording.id).toBe(recId)
    expect(dump.events.length).toBeGreaterThanOrEqual(1)
  })

  it('updates end time with validation', () => {
    const recId = 'rec_edit_test'
    const now = Date.now()
    repo.insertRecording({
      id: recId,
      accountId: 'default_account',
      channelId: 'ch_edit',
      channelName: 'Channel Edit',
      status: 'scheduled',
      plannedStartUtc: new Date(now + 60_000).toISOString(),
      plannedEndUtc: new Date(now + 3600_000).toISOString(),
      paddingMinutes: 0,
      quality: 'highest',
      folder: tempDir,
      isDefaultFolder: true,
      filename: 'channel_edit.mp4',
      sizeBytes: 0,
      durationSeconds: 0,
      isPartial: false,
      notified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })

    const newEndMs = now + 7200_000
    repo.updateRecordingFields(recId, {
      plannedEndUtc: new Date(newEndMs).toISOString()
    })

    const updated = repo.getRecording(recId)
    expect(new Date(updated!.plannedEndUtc).getTime()).toBe(newEndMs)
  })

  it('renames a completed recording file and updates database record', () => {
    const recId = 'rec_rename_test'
    const initialPath = path.join(tempDir, 'initial_name.mp4')
    fs.writeFileSync(initialPath, 'video-data')

    repo.insertRecording({
      id: recId,
      accountId: 'default_account',
      channelId: 'ch_rename',
      channelName: 'Channel Rename',
      status: 'completed',
      plannedStartUtc: new Date().toISOString(),
      plannedEndUtc: new Date().toISOString(),
      paddingMinutes: 0,
      quality: 'highest',
      folder: tempDir,
      isDefaultFolder: true,
      filename: 'initial_name.mp4',
      finalPath: initialPath,
      sizeBytes: 10,
      durationSeconds: 5,
      isPartial: false,
      notified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })

    const newPath = path.join(tempDir, 'renamed_match.mp4')
    fs.renameSync(initialPath, newPath)
    repo.updateRecordingFields(recId, {
      filename: 'renamed_match.mp4',
      finalPath: newPath
    })

    const updated = repo.getRecording(recId)
    expect(updated?.filename).toBe('renamed_match.mp4')
    expect(updated?.finalPath).toBe(newPath)
    expect(fs.existsSync(newPath)).toBe(true)
  })
})
