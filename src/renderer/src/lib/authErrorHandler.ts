import { isTokenOrAuthError, formatAuthExpirationReason } from '@shared/auth-errors'
import { useAuthStore } from '@/store/useAuthStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useUIStore } from '@/store/useUIStore'

let lastAuthTrigger = 0
const COOLDOWN_MS = 2000

/**
 * Handles token/session expiration cleanly and idempotently:
 * 1. Coalesces concurrent 401/auth errors to prevent toast/modal stuttering
 * 2. Pauses active media playback to prevent infinite retry storms
 * 3. Resets auth store to anonymous
 * 4. Pops open the login modal with a clear, descriptive reason
 * 5. Pushes an informative toast notification
 */
export function triggerAuthExpired(rawReason?: unknown): void {
  const now = Date.now()
  if (now - lastAuthTrigger < COOLDOWN_MS) {
    // Already handled within cooldown window
    return
  }
  lastAuthTrigger = now

  const reason = formatAuthExpirationReason(rawReason)

  // Pause playback to halt continuous segment requests
  try {
    usePlayerStore.getState().setPlaying(false)
  } catch {
    // Non-fatal
  }

  // Clear renderer auth store state
  try {
    useAuthStore.setState({ user: null, status: 'anonymous', lastError: reason })
  } catch {
    // Non-fatal
  }

  // Open the login panel with the reason
  try {
    useUIStore.getState().openLogin(reason)
  } catch {
    // Non-fatal
  }

  // Push an alert toast
  try {
    useUIStore.getState().pushToast({
      title: 'Session Expired',
      description: reason,
      variant: 'error',
      duration: 6000
    })
  } catch {
    // Non-fatal
  }
}

/**
 * Inspects any error (HTTP status, ApiError, Shaka error, HLS error, string or object)
 * and if it represents a token or auth failure, triggers the login modal and returns true.
 */
export function checkAndHandleAuthError(error: unknown, fallbackReason?: string): boolean {
  if (isTokenOrAuthError(error)) {
    triggerAuthExpired(error || fallbackReason)
    return true
  }
  return false
}
