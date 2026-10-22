/**
 * Centralized auth and token error recognition and normalization.
 *
 * Used across the main process (JioService, MediaRelay), IPC bridge,
 * and renderer (useMediaPlayer, channelService, AppShell, PlayerPage)
 * to guarantee that any token expiration or authorization rejection
 * triggers the login panel reliably and without false negatives.
 */

export const AUTH_ERROR_CODES = new Set([
  'AUTH_REQUIRED',
  'TOKEN_EXPIRED',
  'UNAUTHORIZED',
  'SESSION_EXPIRED',
  'INVALID_TOKEN',
  'TOKEN_INVALID',
  'REFRESH_TOKEN_EXPIRED',
  'AUTHENTICATION_FAILED',
  'AUTH_FAILED',
  'EXPIRED_TOKEN',
  'INVALID_CREDENTIALS',
  'NOT_AUTHENTICATED',
  'ERR_AUTH',
  'ERR_TOKEN'
])

export const AUTH_HTTP_STATUSES = new Set([401, 403, 419])

export const NON_AUTH_CODES = new Set([
  'NOT_ENTITLED',
  'NOT_SUBSCRIBED',
  'SUBSCRIPTION_REQUIRED',
  'PACK_REQUIRED',
  'GEO_BLOCKED',
  'CHANNEL_BLOCKED',
  'CONTENT_UNAVAILABLE',
  'NO_STREAM',
  'PLAYBACK_FAILED',
  'INVALID_PHONE',
  'NETWORK'
])

const SUBSCRIPTION_LOCK_REGEX =
  /(subscription|not\s*subscribed|not\s*available\s*on\s*your\s*jio|channel\s*pack|plan\s*upgrade|upgrade\s*your\s*plan|not\s*entitled)/i

const AUTH_MESSAGE_REGEX =
  /(token.*(expired|invalid|revoked|missing|rejected|failed|not\s*valid)|invalid.*token|session.*(expired|invalid|terminated|rejected|closed)|(re-?authenticate|login\s*again|sign-?in\s*again|please\s*(log\s*in|sign\s*in))|jwt.*expired|user.*not.*authenticated|auth.*required|rejected\s*the\s*session)/i

/**
 * Determines whether an arbitrary error, HTTP code, object, or message
 * represents an expired, invalid, or missing token / session.
 * Explicitly guards against subscription package locks and non-entitled channels.
 */
export function isTokenOrAuthError(input: unknown): boolean {
  if (input === null || input === undefined) return false

  if (typeof input === 'number') {
    return AUTH_HTTP_STATUSES.has(input)
  }

  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) return false
    const upper = trimmed.toUpperCase()
    if (NON_AUTH_CODES.has(upper)) return false
    if (AUTH_ERROR_CODES.has(upper)) return true
    if (SUBSCRIPTION_LOCK_REGEX.test(trimmed)) return false
    if (/\b(401|403|419)\b/.test(trimmed)) {
      // If mentions 403 Forbidden or 401 Unauthorized, verify it is not a subscription lock
      return true
    }
    return AUTH_MESSAGE_REGEX.test(trimmed)
  }

  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>

    // If explicitly marked as NOT_ENTITLED or subscription issue, do not treat as auth failure
    if (typeof obj.code === 'string') {
      const codeUpper = obj.code.toUpperCase()
      if (NON_AUTH_CODES.has(codeUpper)) return false
      if (AUTH_ERROR_CODES.has(codeUpper)) return true
    }

    // Check message strings for subscription locks before checking auth
    for (const key of ['message', 'error', 'description', 'errorMessage', 'detail', 'reason']) {
      const val = obj[key]
      if (typeof val === 'string' && SUBSCRIPTION_LOCK_REGEX.test(val)) {
        return false
      }
    }

    if (typeof obj.code === 'number' && AUTH_HTTP_STATUSES.has(obj.code)) {
      return true
    }

    // Check HTTP status fields
    if (typeof obj.status === 'number' && AUTH_HTTP_STATUSES.has(obj.status)) {
      return true
    }
    if (typeof obj.httpStatus === 'number' && AUTH_HTTP_STATUSES.has(obj.httpStatus)) {
      return true
    }
    if (typeof obj.statusCode === 'number' && AUTH_HTTP_STATUSES.has(obj.statusCode)) {
      return true
    }

    // Check message, error, or detail strings
    for (const key of ['message', 'error', 'description', 'errorMessage', 'detail', 'reason']) {
      const val = obj[key]
      if (typeof val === 'string' && isTokenOrAuthError(val)) {
        return true
      }
    }

    // Check nested response or cause
    if (obj.response && typeof obj.response === 'object') {
      if (isTokenOrAuthError(obj.response)) return true
    }
    if (obj.cause && typeof obj.cause === 'object') {
      if (isTokenOrAuthError(obj.cause)) return true
    }
  }

  return false
}

/**
 * Produces a clear, reassuring, user-friendly reason to show inside the login modal.
 */
export function formatAuthExpirationReason(raw?: unknown): string {
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const lower = raw.toLowerCase()
    if (lower.includes('expired')) {
      return 'Your JioTV session has expired. Please sign in again to continue watching.'
    }
    if (lower.includes('invalid') || lower.includes('unauthorized') || lower.includes('rejected')) {
      return 'Your JioTV credentials need to be renewed. Please sign in again.'
    }
    if (lower.includes('watch') || lower.includes('sign in')) {
      return raw.trim()
    }
  }
  return 'Your session has expired. Please sign in with your JioTV number to continue watching.'
}
