import { useSyncExternalStore } from 'react'

/**
 * A single shared clock for every EPG timestamp in the app.
 * 100 cards must not create 100 intervals, so all subscribers share one timer.
 */
let current = new Date()
const subscribers = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

function startClock(): void {
  if (timer) return
  timer = setInterval(() => {
    current = new Date()
    subscribers.forEach((notify) => notify())
  }, 15_000)
}

function stopClock(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify)
  if (subscribers.size === 1) startClock()
  return () => {
    subscribers.delete(notify)
    if (subscribers.size === 0) stopClock()
  }
}

function getSnapshot(): Date {
  return current
}

export function useNow(): Date {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
