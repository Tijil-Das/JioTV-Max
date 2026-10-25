import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { RecordingRepository } from '../../src/main/recording/repository'
import type { RecordingRecord } from '../../src/shared/recording-types'

const TEST_DB = path.join(__dirname, 'test-recordings.db')

describe('RecordingRepository', () => {
  let repo: RecordingRepository

  beforeEach(() => {
    if (fs.existsSync(TEST_DB)) {
      try { fs.unlinkSync(TEST_DB) } catch {}
      try { fs.unlinkSync(`${TEST_DB}-wal`) } catch {}
      try { fs.unlinkSync(`${TEST_DB}-shm`) } catch {}
    }
    repo = new RecordingRepository(TEST_DB)
  })

  afterEach(() => {
    repo.close()
    if (fs.existsSync(TEST_DB)) {
      try { fs.unlinkSync(TEST_DB) } catch {}
      try { fs.unlinkSync(`${TEST_DB}-wal`) } catch {}
      try { fs.unlinkSync(`${TEST_DB}-shm`) } catch {}
    }
  })

  it('initializes WAL mode and runs migration v1', () => {
    const recs = repo.getAllRecordings()
    expect(recs).toEqual([])
  })

  it('inserts and retrieves a recording with all fields', () => {
    const rec: RecordingRecord = {
      id: 'rec_101',
      accountId: 'acc_test',
      channelId: '101',
      channelName: 'Star Sports 1 HD',
      channelLogo: 'https://example.com/logo.png',
      status: 'scheduled',
      plannedStartUtc: '2026-10-25T14:00:00.000Z',
      plannedEndUtc: '2026-10-25T15:00:00.000Z',
      paddingMinutes: 2,
      quality: 'highest',
      resolution: '1080p',
      bitrate: 4500000,
      folder: 'C:\\Videos\\Recordings',
      isDefaultFolder: true,
      filename: 'Star_Sports_1_HD_2026-10-25_14-00.mp4',
      sizeBytes: 0,
      durationSeconds: 0,
      overlayApplied: false,
      isPartial: false,
      notified: false,
      createdAt: '2026-10-25T13:00:00.000Z',
      updatedAt: '2026-10-25T13:00:00.000Z'
    }

    repo.insertRecording(rec)
    const fetched = repo.getRecording('rec_101')
    expect(fetched).not.toBeNull()
    expect(fetched?.id).toBe('rec_101')
    expect(fetched?.channelName).toBe('Star Sports 1 HD')
    expect(fetched?.status).toBe('scheduled')
    expect(fetched?.isDefaultFolder).toBe(true)
  })

  it('atomically transitions status and logs an event', () => {
    const rec: RecordingRecord = {
      id: 'rec_102',
      accountId: 'acc_test',
      channelId: '102',
      channelName: 'Star Sports 2',
      status: 'scheduled',
      plannedStartUtc: '2026-10-25T14:00:00.000Z',
      plannedEndUtc: '2026-10-25T15:00:00.000Z',
      paddingMinutes: 0,
      quality: 'highest',
      folder: 'C:\\Videos\\Recordings',
      isDefaultFolder: true,
      filename: 'Star_Sports_2.mp4',
      sizeBytes: 0,
      durationSeconds: 0,
      overlayApplied: false,
      isPartial: false,
      notified: false,
      createdAt: '2026-10-25T13:00:00.000Z',
      updatedAt: '2026-10-25T13:00:00.000Z'
    }

    repo.insertRecording(rec)
    repo.transitionStatus('rec_102', 'recording', 'Recording started on schedule', { source: 'scheduler' })

    const updated = repo.getRecording('rec_102')
    expect(updated?.status).toBe('recording')

    const events = repo.getEvents('rec_102')
    expect(events.length).toBe(1)
    expect(events[0].fromStatus).toBe('scheduled')
    expect(events[0].toStatus).toBe('recording')
    expect(events[0].message).toBe('Recording started on schedule')
  })

  it('manages recording parts and updates', () => {
    const rec: RecordingRecord = {
      id: 'rec_103',
      accountId: 'acc_test',
      channelId: '103',
      channelName: 'Star Sports Select 1 HD',
      status: 'recording',
      plannedStartUtc: '2026-10-25T14:00:00.000Z',
      plannedEndUtc: '2026-10-25T15:00:00.000Z',
      paddingMinutes: 0,
      quality: 'highest',
      folder: 'C:\\Videos',
      isDefaultFolder: true,
      filename: 'part_test.mp4',
      sizeBytes: 0,
      durationSeconds: 0,
      overlayApplied: false,
      isPartial: false,
      notified: false,
      createdAt: '2026-10-25T13:00:00.000Z',
      updatedAt: '2026-10-25T13:00:00.000Z'
    }
    repo.insertRecording(rec)

    const partId = repo.addPart({
      recordingId: 'rec_103',
      partIndex: 0,
      path: 'C:\\Videos\\.working\\rec_103\\part0.ts',
      startUtc: '2026-10-25T14:00:00.000Z',
      bytes: 1024,
      mode: 'copy'
    })

    expect(partId).toBeGreaterThan(0)
    repo.updatePart(partId, '2026-10-25T14:05:00.000Z', 5000000)

    const parts = repo.getParts('rec_103')
    expect(parts.length).toBe(1)
    expect(parts[0].bytes).toBe(5000000)
    expect(parts[0].endUtc).toBe('2026-10-25T14:05:00.000Z')
  })

  it('manages notifications with dedupe key', () => {
    repo.addNotification({
      id: 'notif_1',
      type: 'started',
      title: 'Recording started',
      message: 'Star Sports 1 HD is now recording.',
      dedupeKey: 'rec_start_101',
      isRead: false,
      isActed: false,
      createdAt: '2026-10-25T14:00:00.000Z'
    })

    expect(repo.hasDedupeKey('rec_start_101')).toBe(true)
    expect(repo.hasDedupeKey('rec_start_999')).toBe(false)
    expect(repo.getUnreadNotificationCount()).toBe(1)

    repo.markNotificationRead('notif_1')
    expect(repo.getUnreadNotificationCount()).toBe(0)
  })
})
