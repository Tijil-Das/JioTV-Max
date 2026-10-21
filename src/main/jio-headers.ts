/**
 * JioTV upstream request headers.
 *
 * These helpers are shared by the Jio service and the loopback media relay so
 * that every upstream call — JSON API or CDN media — is built the same way.
 *
 * Three details matter for live playback and are easy to get wrong:
 *
 *  1. The Android **player** agent (`plaYtv/...`) is required. The Jio CDN
 *     rejects the `okhttp/4.12.0` agent that the JSON APIs use.
 *  2. Media requests need a wildcard `Accept` header, not the
 *     `application/json` used by the catalogue and playback APIs.
 *  3. The Akamai session token is sent as a **Cookie** named `__hdnea__`.
 *     Carrying it only as a query parameter is not enough for some CDNs.
 */

/** Android player agent. Jio's CDN blocks the plain okhttp agent. */
export const PLAYER_UA = 'plaYtv/7.1.8 (Linux;Android 8.1.0) ExoPlayerLib/2.11.7'

/** Agent used for the JSON APIs (channels, EPG, playback). */
export const API_UA = 'okhttp/4.12.0'

/** Name of the Akamai session cookie that carries the signed CDN token. */
export const HDNEA_COOKIE = '__hdnea__'

/** Origin Jio's web player sends, mirrored so the CDN sees a browser. */
export const PLAYER_ORIGIN = 'https://www.jiotv.com'

/**
 * Extracts the Akamai `hdnea` token from a Jio stream URL.
 *
 * `__hdnea__` is the fresher spelling and wins when both are present.
 */
export function extractHdnea(url: string): string {
  if (!url) return ''
  try {
    const parsed = new URL(url)
    // `searchParams` already percent-decodes, so the value is used as-is.
    return parsed.searchParams.get(HDNEA_COOKIE) || parsed.searchParams.get('hdnea') || ''
  } catch {
    const match = url.match(/[?&](__hdnea__|hdnea)=([^&#]*)/)
    if (!match) return ''
    try {
      return decodeURIComponent(match[2])
    } catch {
      return match[2]
    }
  }
}

/** Builds the `Cookie` header value that carries the `__hdnea__` token. */
export function hdneaCookieHeader(token: string): string {
  const trimmed = token.trim()
  return trimmed ? `${HDNEA_COOKIE}=${trimmed}` : ''
}

/**
 * Returns a copy of `headers` whose `Cookie` header carries `token` as
 * `__hdnea__`. An existing `__hdnea__` entry is replaced rather than
 * duplicated, and any other cookies are preserved.
 */
export function withHdneaCookie(
  headers: Record<string, string>,
  token: string
): Record<string, string> {
  const trimmed = token.trim()
  if (!trimmed) return { ...headers }

  const result: Record<string, string> = {}
  let cookieKey = ''
  const cookies: string[] = []
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === 'cookie') {
      cookieKey = cookieKey || name
      for (const part of value.split(';')) {
        const entry = part.trim()
        if (!entry) continue
        if (entry.startsWith(`${HDNEA_COOKIE}=`)) continue
        cookies.push(entry)
      }
      continue
    }
    result[name] = value
  }

  cookies.push(`${HDNEA_COOKIE}=${trimmed}`)
  result[cookieKey || 'Cookie'] = cookies.join('; ')
  return result
}

export interface PlaybackHeaderOptions {
  /** Authenticated headers from the current Jio session. */
  authHeaders?: Record<string, string>
  /** Akamai token to send as the `__hdnea__` cookie. */
  hdnea?: string
}

/**
 * Builds the header set for a CDN media request.
 *
 * The authenticated session headers are reused for their identity fields
 * (`accessToken`, `crmid`, `deviceId`, …) but their `User-Agent` and
 * `Accept` are dropped: those describe the JSON API, and keeping them makes
 * the CDN answer `403` to the manifest.
 */
export function buildPlaybackHeaders(options: PlaybackHeaderOptions = {}): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(options.authHeaders ?? {})) {
    const lower = name.toLowerCase()
    // Drop JSON API headers and browser origin headers.
    // Jio's CDN and key endpoints reject requests carrying Origin/Referer with 403.
    if (lower === 'user-agent' || lower === 'accept' || lower === 'origin' || lower === 'referer') continue
    headers[name] = value
  }

  headers['User-Agent'] = PLAYER_UA

  const token = options.hdnea?.trim() ?? ''
  return token ? withHdneaCookie(headers, token) : headers
}

