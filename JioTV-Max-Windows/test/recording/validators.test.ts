import { describe, it, expect } from 'vitest'
import { Validators, type ExistingRecordingInterval } from '../../src/main/recording/validators'

describe('Validators', () => {
  const fakeNow = new Date('2026-10-25T14:00:00.000Z').getTime()

  describe('Channel validation', () => {
    it('blocks null channel', () => {
      const issues = Validators.validateChannel(null)
      expect(issues.some((i) => i.message.includes('does not exist'))).toBe(true)
    })

    it('blocks DRM/DASH channels', () => {
      const issues = Validators.validateChannel({ id: '104', name: 'Sony Sports', isDrm: true })
      expect(issues.some((i) => i.message.includes('DRM-protected'))).toBe(true)
    })

    it('blocks channels not in user plan', () => {
      const issues = Validators.validateChannel({ id: '101', name: 'Star Sports 1' }, false)
      expect(issues.some((i) => i.message.includes('not available in your JioTV plan'))).toBe(true)
    })

    it('allows valid clear HLS channel in user plan', () => {
      const issues = Validators.validateChannel({ id: '101', name: 'Star Sports 1', isDrm: false, type: 'hls' }, true)
      expect(issues.length).toBe(0)
    })
  })

  describe('Time window validation', () => {
    it('requires start to be at least 30s in the future for scheduled', () => {
      const { issues } = Validators.validateTimeWindow({
        fromEpochMs: fakeNow + 10_000, // only 10s ahead
        toEpochMs: fakeNow + 600_000,
        nowEpochMs: fakeNow
      })
      expect(issues.some((i) => i.message.includes('at least 30 seconds'))).toBe(true)
    })

    it('permits immediate start for record-now', () => {
      const { issues } = Validators.validateTimeWindow({
        fromEpochMs: fakeNow,
        toEpochMs: fakeNow + 600_000,
        isRecordNow: true,
        nowEpochMs: fakeNow
      })
      expect(issues.length).toBe(0)
    })

    it('enforces min duration of 1 minute and max 8 hours', () => {
      // 30 seconds duration -> error
      const shortRes = Validators.validateTimeWindow({
        fromEpochMs: fakeNow + 60_000,
        toEpochMs: fakeNow + 90_000,
        nowEpochMs: fakeNow
      })
      expect(shortRes.issues.some((i) => i.message.includes('at least 1 minute'))).toBe(true)

      // 9 hours duration -> error
      const longRes = Validators.validateTimeWindow({
        fromEpochMs: fakeNow + 60_000,
        toEpochMs: fakeNow + 60_000 + 9 * 3600 * 1000,
        nowEpochMs: fakeNow
      })
      expect(longRes.issues.some((i) => i.message.includes('cannot exceed 8 hours'))).toBe(true)
    })

    it('identifies midnight crossing', () => {
      // 11:30 PM to 12:30 AM next day
      const from = new Date('2026-10-25T23:30:00').getTime()
      const to = new Date('2026-10-26T00:30:00').getTime()
      const res = Validators.validateTimeWindow({
        fromEpochMs: from,
        toEpochMs: to,
        nowEpochMs: from - 60_000
      })
      expect(res.endsTomorrowText).toBeDefined()
      expect(res.endsTomorrowText).toContain('Ends tomorrow')
    })
  })

  describe('Concurrency validation', () => {
    // Channel A: 14:00 to 15:00
    // Channel B: 14:30 to 15:30
    const existing: ExistingRecordingInterval[] = [
      {
        id: 'rec_a',
        channelId: '101',
        channelName: 'Star Sports 1',
        startEpochMs: fakeNow,
        endEpochMs: fakeNow + 3600 * 1000,
        status: 'recording'
      },
      {
        id: 'rec_b',
        channelId: '102',
        channelName: 'Star Sports 2',
        startEpochMs: fakeNow + 1800 * 1000,
        endEpochMs: fakeNow + 5400 * 1000,
        status: 'scheduled'
      }
    ]

    it('blocks same channel self-overlap', () => {
      const issues = Validators.validateConcurrency(
        {
          channelId: '101',
          channelName: 'Star Sports 1',
          startEpochMs: fakeNow + 1000,
          endEpochMs: fakeNow + 2000 * 1000
        },
        existing
      )
      expect(issues.some((i) => i.message.includes('overlaps an existing recording for Star Sports 1'))).toBe(true)
    })

    it('allows back-to-back recordings on the same channel (half-open [start, end))', () => {
      // Ends exactly when target starts: existing ends at 15:00, target starts at 15:00
      const issues = Validators.validateConcurrency(
        {
          channelId: '101',
          channelName: 'Star Sports 1',
          startEpochMs: fakeNow + 3600 * 1000,
          endEpochMs: fakeNow + 7200 * 1000
        },
        existing
      )
      // At 15:00, rec_a is already finished ([14:00, 15:00)), so rec_a does NOT overlap
      expect(issues.some((i) => i.channelId === '101')).toBe(false)
    })

    it('blocks when concurrency would exceed 2 simultaneous recordings', () => {
      // At 14:45, both rec_a and rec_b are running. A 3rd recording on Channel C overlaps!
      const issues = Validators.validateConcurrency(
        {
          channelId: '103',
          channelName: 'Star Sports Select 1',
          startEpochMs: fakeNow + 2000 * 1000,
          endEpochMs: fakeNow + 3000 * 1000
        },
        existing
      )
      expect(issues.some((i) => i.message.includes('Concurrency limit reached'))).toBe(true)
      expect(issues[0].message).toContain('Star Sports 1 and Star Sports 2')
    })
  })

  describe('Filename sanitization', () => {
    it('sanitizes illegal Windows characters and reserved names', () => {
      expect(Validators.sanitizeFilename('Star:Sports*1?.ts')).toBe('Star_Sports_1_.mp4')
      expect(Validators.sanitizeFilename('CON.mp4')).toBe('CON_rec.mp4')
      expect(Validators.sanitizeFilename('AUX.mkv')).toBe('AUX_rec.mp4')
      expect(Validators.sanitizeFilename('my recording...  ')).toBe('my recording.mp4')
    })
  })

  describe('Disk space validation', () => {
    it('calculates estimate with 1.2 multiplier and headroom', () => {
      // 1 hour at 5 Mbps: 5,000,000 / 8 * 3600 = 2,250,000,000 bytes (~2.25 GB)
      // * 1.2 = 2,700,000,000 bytes + 52,428,800 headroom = ~2.75 GB
      const est = Validators.estimateDiskBytes(3600, 5_000_000)
      expect(est).toBeGreaterThan(2_500_000_000)
    })

    it('blocks when free space is below estimate', () => {
      const issues = Validators.validateDiskSpace(2_000_000_000, 1_000_000_000)
      expect(issues.some((i) => i.level === 'error' && i.message.includes('Insufficient free disk space'))).toBe(true)
    })

    it('warns when free space is between 1.0x and 1.5x estimate', () => {
      const issues = Validators.validateDiskSpace(2_000_000_000, 2_500_000_000)
      expect(issues.some((i) => i.level === 'warning' && i.message.includes('less than 1.5x'))).toBe(true)
    })
  })
})
