/**
 * Central Server Clock for JioTv Max Web
 *
 * Requirements:
 * 1. Whenever the user opens the website, start the server time from 0 seconds.
 * 2. No user actions (pause, seek, tab change, channel change) can disturb this server time.
 *    Only closing the website tab / session resets it.
 * 3. Looping: when elapsed time exceeds the video duration (default 1606.94s, ~26m 47s),
 *    it loops smoothly back from 0 seconds without edge-case jumps or NaN.
 */

const SESSION_START_KEY = '__jiotv_server_session_start__'
export const DEFAULT_STREAM_DURATION = 1606.94

function resolveSessionStart(): number {
  if (typeof window === 'undefined') return Date.now()

  // 1. Try parent/top window if embedded in iframe
  try {
    const topObj = window.top || window.parent
    if (topObj && (topObj as any).__JIOTV_SERVER_START__) {
      const topStart = Number((topObj as any).__JIOTV_SERVER_START__)
      if (!isNaN(topStart) && topStart > 0) {
        return topStart
      }
    }
  } catch {
    // Cross-origin access blocked
  }

  // 2. Try window global
  try {
    if ((window as any).__JIOTV_SERVER_START__) {
      const winStart = Number((window as any).__JIOTV_SERVER_START__)
      if (!isNaN(winStart) && winStart > 0) return winStart
    }
  } catch {}

  // 3. Try sessionStorage (persists across iframe reloads, wiped when tab/browser closes)
  try {
    const stored = sessionStorage.getItem(SESSION_START_KEY)
    if (stored) {
      const parsed = Number(stored)
      if (!isNaN(parsed) && parsed > 0) {
        ;(window as any).__JIOTV_SERVER_START__ = parsed
        return parsed
      }
    }
  } catch {}

  // 4. Fresh website visit: start from 0 seconds right now
  const now = Date.now()
  try {
    ;(window as any).__JIOTV_SERVER_START__ = now
  } catch {}

  try {
    sessionStorage.setItem(SESSION_START_KEY, String(now))
  } catch {}

  try {
    const topObj = window.top || window.parent
    if (topObj && !(topObj as any).__JIOTV_SERVER_START__) {
      ;(topObj as any).__JIOTV_SERVER_START__ = now
    }
  } catch {}

  return now
}

let sessionStartTimestamp = resolveSessionStart()

export function getSessionStartTime(): number {
  return sessionStartTimestamp
}

/**
 * Returns current server time in seconds [0, duration), starting from 0s at site open.
 */
export function getServerTime(duration = DEFAULT_STREAM_DURATION): number {
  const dur = Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_STREAM_DURATION
  const elapsedSeconds = Math.max(0, (Date.now() - sessionStartTimestamp) / 1000)
  return elapsedSeconds % dur
}

/**
 * Returns total monotonic seconds since the site was opened.
 */
export function getTotalElapsedSeconds(): number {
  return Math.max(0, (Date.now() - sessionStartTimestamp) / 1000)
}
