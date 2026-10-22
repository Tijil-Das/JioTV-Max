import { describe, it, expect } from 'vitest'
import {
  isTokenOrAuthError,
  formatAuthExpirationReason,
  AUTH_ERROR_CODES,
  AUTH_HTTP_STATUSES
} from '../../src/shared/auth-errors'

describe('Auth and Token Error Recognition (Advanced & Foolproof)', () => {
  it('correctly identifies HTTP status codes', () => {
    expect(isTokenOrAuthError(401)).toBe(true)
    expect(isTokenOrAuthError(403)).toBe(true)
    expect(isTokenOrAuthError(419)).toBe(true)
    expect(isTokenOrAuthError(200)).toBe(false)
    expect(isTokenOrAuthError(404)).toBe(false)
    expect(isTokenOrAuthError(500)).toBe(false)
  })

  it('correctly identifies standard auth error codes', () => {
    for (const code of AUTH_ERROR_CODES) {
      expect(isTokenOrAuthError(code)).toBe(true)
      expect(isTokenOrAuthError(code.toLowerCase())).toBe(true)
      expect(isTokenOrAuthError({ code })).toBe(true)
    }
    expect(isTokenOrAuthError('NO_STREAM')).toBe(false)
    expect(isTokenOrAuthError('PLAYBACK_FAILED')).toBe(false)
    expect(isTokenOrAuthError('INVALID_PHONE')).toBe(false)
  })

  it('identifies status codes in error objects', () => {
    expect(isTokenOrAuthError({ status: 401 })).toBe(true)
    expect(isTokenOrAuthError({ status: 403 })).toBe(true)
    expect(isTokenOrAuthError({ httpStatus: 401 })).toBe(true)
    expect(isTokenOrAuthError({ httpStatus: 403 })).toBe(true)
    expect(isTokenOrAuthError({ statusCode: 401 })).toBe(true)
    expect(isTokenOrAuthError({ status: 500 })).toBe(false)
  })

  it('identifies various token expiration and auth error strings', () => {
    const errorStrings = [
      'Token Expired',
      'invalid token provided',
      'token is not valid',
      'Your session has expired. Please sign in again.',
      'Jio rejected the session. Please sign in again.',
      'Upstream error (401)',
      'Upstream error (403)',
      'Upstream manifest error (401)',
      'Widevine DRM error: 401',
      'Widevine license rejected (403)',
      'HTTP 401 Unauthorized',
      'Status code 403 Forbidden',
      'Please log in again to continue',
      'Sign-in again required',
      'User not authenticated',
      'JWT token expired'
    ]

    for (const str of errorStrings) {
      expect(isTokenOrAuthError(str)).toBe(true)
      expect(isTokenOrAuthError(new Error(str))).toBe(true)
      expect(isTokenOrAuthError({ message: str })).toBe(true)
      expect(isTokenOrAuthError({ error: str })).toBe(true)
    }
  })

  it('rejects unrelated error strings', () => {
    const safeStrings = [
      'Network timeout while fetching poster',
      'This demo channel has no stream attached.',
      'Channel not found in catalogue',
      'Could not parse EPG data',
      'Segment 1045 returned 404',
      'Video decoding failed'
    ]

    for (const str of safeStrings) {
      expect(isTokenOrAuthError(str)).toBe(false)
      expect(isTokenOrAuthError(new Error(str))).toBe(false)
    }
  })

  it('handles null, undefined, empty inputs safely without throwing', () => {
    expect(isTokenOrAuthError(null)).toBe(false)
    expect(isTokenOrAuthError(undefined)).toBe(false)
    expect(isTokenOrAuthError('')).toBe(false)
    expect(isTokenOrAuthError('   ')).toBe(false)
    expect(isTokenOrAuthError({})).toBe(false)
    expect(isTokenOrAuthError([])).toBe(false)
  })

  it('formats friendly auth expiration reason', () => {
    expect(formatAuthExpirationReason('Token Expired')).toContain('expired')
    expect(formatAuthExpirationReason('Upstream error (401)')).toContain('session')
    expect(formatAuthExpirationReason()).toContain('session has expired')
    expect(formatAuthExpirationReason('Sign in with your JioTV number to watch this channel.')).toBe(
      'Sign in with your JioTV number to watch this channel.'
    )
  })
})
