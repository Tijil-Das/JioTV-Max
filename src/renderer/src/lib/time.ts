import type { Program } from '@shared/types'

/** All EPG maths lives here so cards, the guide and the player agree exactly. */

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const dayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long'
})

export function formatTime(value: string | Date): string {
  return timeFormatter.format(typeof value === 'string' ? new Date(value) : value)
}

export function formatRange(start: string | Date, end: string | Date): string {
  return `${formatTime(start)} – ${formatTime(end)}`
}

export function formatDayLabel(value: Date): string {
  return dayFormatter.format(value)
}

export function startOfLocalDay(value: Date): Date {
  const copy = new Date(value)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function addMinutes(value: Date, minutes: number): Date {
  return new Date(value.getTime() + minutes * 60_000)
}

export interface NowNext {
  current: Program | null
  next: Program | null
}

/** Finds the programme airing at `now` plus the one after it. */
export function getNowNext(programs: Program[], now: Date = new Date()): NowNext {
  const time = now.getTime()
  let current: Program | null = null
  let next: Program | null = null
  for (const program of programs) {
    const start = Date.parse(program.start)
    const end = Date.parse(program.end)
    if (start <= time && time < end) {
      current = program
    } else if (start > time && (!next || start < Date.parse(next.start))) {
      next = program
    }
  }
  return { current, next }
}

/** Percentage (0-100) of a programme that has elapsed at `now`. */
export function getProgress(program: Program, now: Date = new Date()): number {
  const start = Date.parse(program.start)
  const end = Date.parse(program.end)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  const ratio = (now.getTime() - start) / (end - start)
  return Math.min(100, Math.max(0, ratio * 100))
}

export function getMinutesLeft(end: string | Date, now: Date = new Date()): number {
  return Math.max(0, Math.round((Date.parse(String(end)) - now.getTime()) / 60_000))
}

export function formatTimeLeft(end: string | Date, now: Date = new Date()): string {
  const minutes = getMinutesLeft(end, now)
  if (minutes <= 0) return 'Ending now'
  if (minutes < 60) return `${minutes} min left`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} hr left` : `${hours} hr ${rest} min left`
}

export interface RulerTick {
  label: string
  minutes: number
}

/** Builds the time ruler used by the full EPG (30-minute resolution). */
export function buildRuler(
  dayStart: Date,
  hours = 24,
  stepMinutes = 30
): { ticks: RulerTick[]; totalMinutes: number } {
  const totalMinutes = hours * 60
  const ticks: RulerTick[] = []
  for (let minute = 0; minute <= totalMinutes; minute += stepMinutes) {
    ticks.push({ label: formatTime(addMinutes(dayStart, minute)), minutes: minute })
  }
  return { ticks, totalMinutes }
}

export interface BlockRect {
  offsetMinutes: number
  durationMinutes: number
}

/** Converts a programme to guide coordinates, clamped to the visible day. */
export function programBlockRect(program: Program, dayStart: Date, dayMinutes = 1440): BlockRect {
  const offsetMinutes = (Date.parse(program.start) - dayStart.getTime()) / 60_000
  const durationMinutes = (Date.parse(program.end) - Date.parse(program.start)) / 60_000
  return {
    offsetMinutes: Math.max(0, offsetMinutes),
    durationMinutes: Math.min(Math.max(0, durationMinutes), dayMinutes - Math.max(0, offsetMinutes))
  }
}

/** Minutes since local midnight — used for the "now" line. */
export function minutesSinceDayStart(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
}
