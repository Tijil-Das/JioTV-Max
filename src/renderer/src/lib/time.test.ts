import { describe, expect, it } from 'vitest'
import type { Program } from '@shared/types'
import {
  buildRuler,
  formatRange,
  formatTimeLeft,
  getMinutesLeft,
  getNowNext,
  getProgress,
  minutesSinceDayStart,
  programBlockRect,
  startOfLocalDay
} from './time'

const day = (hour: number, minute = 0) => {
  const date = new Date(2026, 9, 21, hour, minute, 0, 0)
  return date
}

const program = (id: string, startHour: number, endHour: number): Program => ({
  id,
  channelId: 'ch-1',
  title: `Show ${id}`,
  description: '',
  start: day(startHour).toISOString(),
  end: day(endHour).toISOString(),
  genre: 'Drama'
})

describe('EPG helpers', () => {
  const programs = [program('a', 8, 9), program('b', 9, 10), program('c', 10, 12)]

  it('finds the current and next programme', () => {
    const { current, next } = getNowNext(programs, day(9, 42))
    expect(current?.id).toBe('b')
    expect(next?.id).toBe('c')
  })

  it('returns nulls outside the schedule', () => {
    const { current, next } = getNowNext(programs, day(3, 0))
    expect(current).toBeNull()
    expect(next?.id).toBe('a')
  })

  it('computes clamped progress', () => {
    expect(getProgress(program('x', 8, 9), day(8, 30))).toBeCloseTo(50, 5)
    expect(getProgress(program('x', 8, 9), day(10, 0))).toBe(100)
    expect(getProgress(program('x', 8, 9), day(6, 0))).toBe(0)
  })

  it('formats the remaining time', () => {
    expect(getMinutesLeft(program('x', 8, 9).end, day(8, 18))).toBe(42)
    expect(formatTimeLeft(program('x', 8, 9).end, day(8, 18))).toBe('42 min left')
    expect(formatTimeLeft(program('x', 8, 12).end, day(8, 18))).toBe('3 hr 42 min left')
  })

  it('builds a half-hour ruler across a day', () => {
    const { ticks, totalMinutes } = buildRuler(startOfLocalDay(day(0)), 24)
    expect(totalMinutes).toBe(1440)
    expect(ticks).toHaveLength(49)
    expect(ticks[1].minutes).toBe(30)
  })

  it('converts programmes to guide coordinates', () => {
    const rect = programBlockRect(program('y', 9, 10), startOfLocalDay(day(0)))
    expect(rect.offsetMinutes).toBe(540)
    expect(rect.durationMinutes).toBe(60)
  })

  it('reports minutes since midnight', () => {
    expect(minutesSinceDayStart(day(13, 30))).toBeCloseTo(810, 5)
  })

  it('formats ranges in local time', () => {
    expect(formatRange(program('z', 20, 21).start, program('z', 20, 21).end)).toContain('–')
  })
})
