import { describe, it, expect } from 'vitest'
import { Scheduler } from '../../src/main/recording/scheduler'
import type { RecordingRecord } from '../../src/shared/recording-types'

describe('Scheduler Decision Table & Recovery', () => {
  const fakeNow = new Date('2026-10-25T14:30:00.000Z').getTime()

  const createRec = (partial: Partial<RecordingRecord>): RecordingRecord => ({
    id: partial.id || 'rec_1',
    accountId: 'acc_1',
    channelId: partial.channelId || '101',
    channelName: partial.channelName || 'Star Sports 1 HD',
    status: partial.status || 'scheduled',
    plannedStartUtc: partial.plannedStartUtc || '2026-10-25T14:00:00.000Z',
    plannedEndUtc: partial.plannedEndUtc || '2026-10-25T15:00:00.000Z',
    paddingMinutes: partial.paddingMinutes ?? 0,
    quality: 'highest',
    folder: 'C:\\Videos',
    isDefaultFolder: true,
    filename: 'test.mp4',
    sizeBytes: 0,
    durationSeconds: 0,
    overlayApplied: false,
    isPartial: false,
    notified: false,
    createdAt: '2026-10-25T13:00:00.000Z',
    updatedAt: '2026-10-25T13:00:00.000Z',
    ...partial
  })

  it('keeps scheduled recordings whose window has not started', () => {
    // Starts at 15:00 (now is 14:30)
    const futureRec = createRec({
      id: 'rec_future',
      plannedStartUtc: '2026-10-25T15:00:00.000Z',
      plannedEndUtc: '2026-10-25T16:00:00.000Z'
    })

    const actions = Scheduler.evaluateCatchUpActions([futureRec], fakeNow)
    expect(actions).toEqual([
      {
        recordingId: 'rec_future',
        action: 'keep_scheduled'
      }
    ])
  })

  it('starts catchup for recording whose window is in progress, with exact message', () => {
    // Planned 14:00 to 15:00 (now is 14:30, 30 min left)
    const inProgressRec = createRec({
      id: 'rec_in_prog',
      channelName: 'Colors HD',
      plannedStartUtc: '2026-10-25T14:00:00.000Z',
      plannedEndUtc: '2026-10-25T15:00:00.000Z'
    })

    const actions = Scheduler.evaluateCatchUpActions([inProgressRec], fakeNow)
    expect(actions.length).toBe(1)
    expect(actions[0].action).toBe('start_catchup')
    expect(actions[0].noticeMessage).toMatch(/Some part \(.* to .*\) of the recording for Colors HD could not be done because the app wasn’t running\./)
  })

  it('marks recording as missed if window passed or remaining duration < 1 min', () => {
    // Planned 13:00 to 14:00 (now is 14:30, completely passed)
    const passedRec = createRec({
      id: 'rec_passed',
      plannedStartUtc: '2026-10-25T13:00:00.000Z',
      plannedEndUtc: '2026-10-25T14:00:00.000Z'
    })

    // Planned 14:00 to 14:30:30 (only 30 seconds remaining)
    const almostPassedRec = createRec({
      id: 'rec_almost',
      plannedStartUtc: '2026-10-25T14:00:00.000Z',
      plannedEndUtc: '2026-10-25T14:30:30.000Z'
    })

    const actions = Scheduler.evaluateCatchUpActions([passedRec, almostPassedRec], fakeNow)
    expect(actions.length).toBe(2)
    expect(actions[0].action).toBe('mark_missed')
    expect(actions[1].action).toBe('mark_missed')
  })

  it('enforces concurrency limit of 2 during catchup, preferring earlier scheduled', () => {
    const rec1 = createRec({ id: 'rec_1', plannedStartUtc: '2026-10-25T14:00:00.000Z', plannedEndUtc: '2026-10-25T15:00:00.000Z' })
    const rec2 = createRec({ id: 'rec_2', plannedStartUtc: '2026-10-25T14:10:00.000Z', plannedEndUtc: '2026-10-25T15:00:00.000Z' })
    const rec3 = createRec({ id: 'rec_3', plannedStartUtc: '2026-10-25T14:20:00.000Z', plannedEndUtc: '2026-10-25T15:00:00.000Z' })

    const actions = Scheduler.evaluateCatchUpActions([rec3, rec1, rec2], fakeNow, 2)
    const started = actions.filter((a) => a.action === 'start_catchup')
    const missed = actions.filter((a) => a.action === 'mark_missed')

    expect(started.length).toBe(2)
    expect(started[0].recordingId).toBe('rec_1') // earliest
    expect(started[1].recordingId).toBe('rec_2') // second earliest
    expect(missed.length).toBe(1)
    expect(missed[0].recordingId).toBe('rec_3')
    expect(missed[0].reason).toContain('Concurrency limit')
  })

  it('handles crash recovery: continues if window open, finalizes if window passed', () => {
    // Stuck in recording, window still open (ends at 15:00, now 14:30)
    const openCrash = createRec({
      id: 'rec_crash_open',
      channelName: 'Zee TV',
      status: 'recording',
      plannedStartUtc: '2026-10-25T14:00:00.000Z',
      plannedEndUtc: '2026-10-25T15:00:00.000Z'
    })

    // Stuck in recording, window passed (ended at 14:00, now 14:30)
    const passedCrash = createRec({
      id: 'rec_crash_passed',
      channelName: 'NDTV 24x7',
      status: 'recording',
      plannedStartUtc: '2026-10-25T13:00:00.000Z',
      plannedEndUtc: '2026-10-25T14:00:00.000Z'
    })

    const actions = Scheduler.evaluateCatchUpActions([openCrash, passedCrash], fakeNow)
    expect(actions.length).toBe(2)
    expect(actions[0].action).toBe('continue_recovered')
    expect(actions[1].action).toBe('finalize_recovered')
    expect(actions[1].noticeMessage).toContain('NDTV 24x7 was recovered after an unexpected exit')
  })
})
