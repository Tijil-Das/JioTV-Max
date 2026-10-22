import { app } from 'electron'
import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type {
  AuthSession,
  Channel,
  ChannelCategory,
  EpgEntry,
  OtpChallenge,
  Result,
  StreamInfo
} from '@shared/types'
import { SecureStore } from './secure-store'
import type { MediaRelay } from './media-relay'
import { jioNumberPayload } from './jio-format'
import {
  API_UA,
  buildPlaybackHeaders,
  extractHdnea,
  withHlsToken
} from './jio-headers'
import { isTokenOrAuthError } from '../shared/auth-errors'

/**
 * JioTV backend.
 *
 * This is a TypeScript re-implementation of the flows documented in
 * JioTV-Go's `pkg/utils` (OTP login), `pkg/television` (channel catalogue,
 * playback API) and `internal/handlers/drm.go` (MPD + Widevine license).
 * We intentionally do not call the Go binary: every network call is made here
 * so credentials stay inside the Electron main process.
 */

const API = {
  loginSendOtp: 'https://jiotvapi.media.jio.com/userservice/apis/v1/loginotp/send',
  loginVerifyOtp: 'https://jiotvapi.media.jio.com/userservice/apis/v1/loginotp/verify',
  refreshAccessToken: 'https://auth.media.jio.com/tokenservice/apis/v1/refreshtoken?langId=6',
  channelsAuthed:
    'https://jiotv.data.cdn.jio.com/apis/v3.1/getMobileChannelList/get/?os=android&devicetype=phone&usertype=tvYR7NSNn7rymo3F',
  channelsPublic:
    'https://jiotvapi.cdn.jio.com/apis/v3.1/getMobileChannelList/get/?langId=6&os=android&devicetype=phone&usertype=JIO&version=315&langId=6',
  playback: 'https://jiotvapi.media.jio.com/playback/apis/v1.1/geturl?langId=6',
  epg: 'https://jiotv.data.cdn.jio.com/apis/v1.3/getepg/get',
  featured: 'https://tv.media.jio.com/apis/v1.6/getdata/featurednew'
} as const

const APP_KEY = 'NzNiMDhlYzQyNjJm'
const USER_GROUP = 'tvYR7NSNn7rymo3F'
const VERSION_CODE = '422'
/** Agent used for the JSON APIs (catalogue, EPG, playback). */
const USER_AGENT = API_UA

interface JioCredentials {
  accessToken: string
  refreshToken: string
  ssoToken: string
  crm: string
  uniqueId: string
  deviceId: string
}

interface StoredSession {
  credentials: JioCredentials
  phone: string
  name: string
  issuedAt: string
}

interface ResolvedUpstream {
  url: string
  type: 'hls' | 'dash'
  licenseUrl?: string
  isDrm: boolean
  headers: Record<string, string>
  hdnea: string
}

type JioQuality = 'auto' | 'high' | 'medium' | 'low'

interface PlaybackResponse {
  code?: number | string
  message?: string
  result?: string
  isDRM?: boolean
  keyUrl?: string
  key?: string
  license_url?: string
  licenseUrl?: string
  drm?: {
    license_url?: string
    licenseUrl?: string
    keyUrl?: string
    url?: string
    key?: string
  }
  bitrates?: Partial<Record<'auto' | 'high' | 'medium' | 'low', string>>
  m3u8?: Partial<Record<'auto' | 'high' | 'medium' | 'low', string>>
  mpd?: {
    result?: string
    key?: string
    keyUrl?: string
    license_url?: string
    licenseUrl?: string
    auto?: string
    high?: string
    medium?: string
    low?: string
    bitrates?: Partial<Record<'auto' | 'high' | 'medium' | 'low', string>>
  } | null
}

const CATEGORY_BY_ID: Record<number, ChannelCategory> = {
  5: 'entertainment',
  6: 'movies',
  7: 'kids',
  8: 'sports',
  9: 'entertainment',
  10: 'entertainment',
  12: 'news',
  13: 'entertainment',
  15: 'entertainment',
  16: 'news',
  17: 'entertainment',
  18: 'entertainment',
  19: 'regional'
}

const LANGUAGE_BY_ID: Record<number, string> = {
  1: 'Hindi',
  2: 'Marathi',
  3: 'Punjabi',
  4: 'Urdu',
  5: 'Bengali',
  6: 'English',
  7: 'Malayalam',
  8: 'Tamil',
  9: 'Gujarati',
  10: 'Odia',
  11: 'Telugu',
  12: 'Bhojpuri',
  13: 'Kannada',
  14: 'Assamese',
  15: 'Nepali',
  16: 'French',
  18: 'Other'
}

const BRAND_COLORS: Record<ChannelCategory, string[]> = {
  sports: ['#2563EB', '#0EA5E9', '#16A34A', '#F97316'],
  news: ['#DC2626', '#B91C1C', '#0369A1', '#CA8A04'],
  movies: ['#7C3AED', '#DB2777', '#B45309', '#0F766E'],
  kids: ['#F59E0B', '#EC4899', '#8B5CF6', '#22C55E'],
  entertainment: ['#DB2777', '#7C3AED', '#E11D48', '#0EA5E9'],
  regional: ['#EA580C', '#16A34A', '#C026D3', '#0D9488']
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function hashCode(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function brandFor(name: string, category: ChannelCategory): string {
  const palette = BRAND_COLORS[category] ?? BRAND_COLORS.entertainment
  return palette[hashCode(name) % palette.length]
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '').slice(-10)
}

function maskPhone(phone: string): string {
  return `+91 ••••• ${phone.slice(-5)}`
}

function categorize(rawCategory: number, language: number, name: string): ChannelCategory {
  const direct = CATEGORY_BY_ID[rawCategory]
  if (direct) return direct
  const lower = name.toLowerCase()
  if (/sport|cricket|football|tennis|kabaddi|golf|olymp/i.test(lower)) return 'sports'
  if (/news|bharat|aaj tak|ndtv|republic|cnn|wion|world|business|cnbc/i.test(lower)) return 'news'
  if (/movie|cinema|max|pix|gold|film|hbo|star movies/i.test(lower)) return 'movies'
  if (/kids|pogo|cartoon|nick|disney|baby|chhota|toon/i.test(lower)) return 'kids'
  if (language > 0 && ![1, 6].includes(language)) return 'regional'
  return 'entertainment'
}

async function requestJson(
  url: string,
  init: RequestInit,
  { timeout = 18_000 }: { timeout?: number } = {}
): Promise<{ response: Response; body: unknown; text: string }> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) })
  const text = await response.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  return { response, body, text }
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>
    for (const key of ['message', 'error', 'description', 'errorMessage']) {
      if (typeof record[key] === 'string' && record[key]) return record[key] as string
    }
  }
  if (status === 401 || status === 403) return 'Jio rejected the session. Please sign in again.'
  if (status === 429) return 'Too many attempts. Please wait a moment and try again.'
  return `JioTV request failed (${status}).`
}

export class JioService {
  private readonly secure = new SecureStore('jio-session.bin')
  private readonly deviceFile: string
  private session: StoredSession | null = null
  private deviceId = ''
  private channelCache: { channels: Channel[]; at: number } | null = null
  private refreshing: Promise<boolean> | null = null
  private onSessionExpiredCallback?: (reason: string) => void

  setSessionExpiredHandler(handler: (reason: string) => void): void {
    this.onSessionExpiredCallback = handler
  }

  notifySessionExpired(reason: string): void {
    // console.warn(`[JioService] Session expired: ${reason}`)
    this.onSessionExpiredCallback?.(reason)
  }

  constructor(private readonly relay: MediaRelay) {
    this.deviceFile = path.join(app.getPath('userData'), 'device-id.json')

    // Listen to relay auth failures (e.g. license/manifest 401/403)
    this.relay.setAuthExpiredHandler((reason) => {
      void this.logout()
      this.notifySessionExpired(reason)
    })

    // The relay calls this when a CDN request answers 401/403 because the
    // short-lived `__hdnea__` token has expired. It must resolve a *raw*
    // upstream URL — registering another relay session here would recurse.
    this.relay.setStreamResolver(async (channelId, quality) => {
      const resolved = await this.resolveUpstreamStream(channelId, quality)
      if (!resolved.ok) {
        // console.warn(`[JioService] Relay token refresh failed for ${channelId}: ${resolved.error}`)
        if (isTokenOrAuthError(resolved.code) || isTokenOrAuthError(resolved.error)) {
          void this.logout()
          this.notifySessionExpired('Your streaming session has expired. Please sign in again.')
        }
        return null
      }
      return {
        manifestUrl: resolved.data.url,
        headers: resolved.data.headers,
        licenseUrl: resolved.data.licenseUrl
      }
    })
  }

  async init(): Promise<void> {
    await this.loadDeviceId()
    const raw = await this.secure.read()
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as StoredSession
        if (parsed?.credentials?.accessToken) this.session = parsed
      } catch {
        await this.secure.clear()
      }
    }
  }

  private async loadDeviceId(): Promise<void> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.deviceFile, 'utf8')) as { id?: string }
      if (parsed.id && parsed.id.length >= 12) {
        this.deviceId = parsed.id
        return
      }
    } catch {
      // Generate below.
    }
    this.deviceId = randomBytes(8).toString('hex')
    try {
      await fs.mkdir(path.dirname(this.deviceFile), { recursive: true })
      await fs.writeFile(this.deviceFile, JSON.stringify({ id: this.deviceId }), 'utf8')
    } catch {
      // A lost device id only means a fresh login challenge next launch.
    }
  }

  private async persist(): Promise<void> {
    if (!this.session) return
    await this.secure.write(JSON.stringify(this.session))
  }

  hasSession(): boolean {
    return Boolean(this.session?.credentials.accessToken)
  }

  getSession(): AuthSession | null {
    if (!this.session) return null
    return {
      user: {
        id: this.session.credentials.crm || this.session.phone,
        phone: this.session.phone,
        name: this.session.name === 'Jio Viewer' ? 'Profile' : this.session.name || 'Profile',
        mode: 'jio'
      },
      issuedAt: this.session.issuedAt
    }
  }

  async requestOtp(phoneInput: string): Promise<Result<OtpChallenge>> {
    const phone = normalizePhone(phoneInput)
    if (!/^[6-9]\d{9}$/.test(phone)) {
      return { ok: false, error: 'Enter a valid 10-digit Indian mobile number.', code: 'INVALID_PHONE' }
    }
    const number = jioNumberPayload(phone)
    try {
      const { response, body, text } = await requestJson(API.loginSendOtp, {
        method: 'POST',
        headers: {
          appname: 'RJIL_JioTV',
          os: 'android',
          devicetype: 'phone',
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ number })
      })
      if (response.status !== 204 && !response.ok) {
        return {
          ok: false,
          error: errorMessage(body, response.status) || text.slice(0, 160),
          retryable: response.status >= 500
        }
      }
      return {
        ok: true,
        data: { sent: true, maskedPhone: maskPhone(phone), expiresInSeconds: 30 }
      }
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error && error.name === 'TimeoutError'
            ? 'JioTV did not respond in time. Check your connection and try again.'
            : 'Could not reach JioTV. Check your internet connection.',
        code: 'NETWORK',
        retryable: true
      }
    }
  }

  async verifyOtp(phoneInput: string, otp: string): Promise<Result<AuthSession>> {
    const phone = normalizePhone(phoneInput)
    if (!/^\d{6}$/.test(otp)) {
      return { ok: false, error: 'Enter the 6-digit code.', code: 'INVALID_OTP' }
    }
    const payload = {
      number: jioNumberPayload(phone),
      otp,
      deviceInfo: {
        consumptionDeviceName: 'SM-G930F',
        info: {
          type: 'android',
          platform: { name: 'SM-G930F' },
          androidId: this.deviceId
        }
      }
    }
    try {
      const { response, body } = await requestJson(API.loginVerifyOtp, {
        method: 'POST',
        headers: {
          appname: 'RJIL_JioTV',
          os: 'android',
          devicetype: 'phone',
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })
      const parsed = (body ?? {}) as Record<string, unknown>
      if (!response.ok) {
        return {
          ok: false,
          error: errorMessage(body, response.status),
          code: 'OTP_FAILED',
          retryable: response.status >= 500
        }
      }
      const authToken = typeof parsed.authToken === 'string' ? parsed.authToken : ''
      if (!authToken) {
        return { ok: false, error: 'Incorrect code. Please try again.', code: 'OTP_REJECTED' }
      }
      const sessionAttributes = (parsed.sessionAttributes ?? {}) as Record<string, unknown>
      const user = (sessionAttributes.user ?? {}) as Record<string, unknown>
      this.session = {
        credentials: {
          accessToken: authToken,
          refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : '',
          ssoToken: typeof parsed.ssoToken === 'string' ? parsed.ssoToken : '',
          crm: typeof user.subscriberId === 'string' ? user.subscriberId : '',
          uniqueId: typeof user.unique === 'string' ? user.unique : '',
          deviceId: this.deviceId
        },
        phone,
        name: 'Profile',
        issuedAt: new Date().toISOString()
      }
      await this.persist()
      this.channelCache = null
      return { ok: true, data: this.getSession()! }
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error && error.name === 'TimeoutError'
            ? 'Verification timed out. Please try again.'
            : 'Could not reach JioTV. Check your internet connection.',
        code: 'NETWORK',
        retryable: true
      }
    }
  }

  async logout(): Promise<void> {
    this.session = null
    this.channelCache = null
    await this.secure.clear()
  }

  /**
   * Access tokens are short-lived JWTs. Decode `exp` locally and refresh a few
   * minutes early, mirroring JioTV-Go's proactive token refresh.
   */
  private tokenExpiresSoon(): boolean {
    const token = this.session?.credentials.accessToken
    if (!token) return true
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as {
        exp?: number
      }
      if (!payload.exp) return false
      return payload.exp * 1000 - Date.now() < 5 * 60 * 1000
    } catch {
      return false
    }
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (!this.session?.credentials.refreshToken) return false
    if (this.refreshing) return this.refreshing
    this.refreshing = (async () => {
      try {
        const { response, body } = await requestJson(API.refreshAccessToken, {
          method: 'POST',
          headers: {
            devicetype: 'phone',
            versionCode: VERSION_CODE,
            os: 'android',
            'Content-Type': 'application/json; charset=utf-8',
            'User-Agent': USER_AGENT,
            accessToken: this.session!.credentials.accessToken
          },
          body: JSON.stringify({
            appName: 'RJIL_JioTV',
            deviceId: this.deviceId,
            refreshToken: this.session!.credentials.refreshToken
          })
        })
        if (!response.ok) {
          // console.warn(`[JioService] refreshAccessToken HTTP ${response.status}`)
          if (
            response.status === 400 ||
            response.status === 401 ||
            response.status === 403 ||
            response.status === 410
          ) {
            // console.warn('[JioService] Refresh token rejected or expired. Terminating session.')
            await this.logout()
            this.notifySessionExpired('Your JioTV session has expired. Please sign in again.')
          }
          return false
        }
        const parsed = (body ?? {}) as Record<string, unknown>
        if (typeof parsed.authToken !== 'string' || !parsed.authToken) {
          // console.warn('[JioService] refreshAccessToken did not return an authToken')
          await this.logout()
          this.notifySessionExpired('Your JioTV session is invalid. Please sign in again.')
          return false
        }
        this.session!.credentials.accessToken = parsed.authToken
        await this.persist()
        return true
      } catch (err) {
        // console.warn('[JioService] refreshAccessToken network error:', err)
        return false
      } finally {
        this.refreshing = null
      }
    })()
    return this.refreshing
  }

  private async ensureFreshToken(): Promise<void> {
    if (this.tokenExpiresSoon()) await this.refreshAccessToken()
  }

  private authenticatedHeaders(): Record<string, string> {
    const credentials = this.session?.credentials
    if (!credentials) return {}
    return {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      devicetype: 'phone',
      os: 'android',
      versionCode: VERSION_CODE,
      appkey: APP_KEY,
      lbcookie: '1',
      usertype: 'JIO',
      usergroup: USER_GROUP,
      languageId: '6',
      isott: 'false',
      accessToken: credentials.accessToken,
      ssotoken: credentials.ssoToken,
      crmid: credentials.crm,
      subscriberId: credentials.crm,
      userId: credentials.crm,
      uniqueId: credentials.uniqueId,
      deviceId: this.deviceId
    }
  }

  async fetchChannels(): Promise<Result<Channel[]>> {
    if (this.channelCache && Date.now() - this.channelCache.at < 5 * 60_000) {
      return { ok: true, data: this.channelCache.channels }
    }

    const attempts: Array<{ url: string; headers: Record<string, string> }> = []
    if (this.session) {
      await this.ensureFreshToken()
      attempts.push({ url: API.channelsAuthed, headers: this.authenticatedHeaders() })
    }
    attempts.push({
      url: API.channelsPublic,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        devicetype: 'phone',
        os: 'android',
        appkey: APP_KEY,
        lbcookie: '1',
        usertype: 'JIO'
      }
    })

    let lastError = 'Could not load the JioTV channel catalogue.'
    for (const attempt of attempts) {
      try {
        const { response, body } = await requestJson(attempt.url, { headers: attempt.headers })
        if (!response.ok) {
          if (attempt.url === API.channelsAuthed && (response.status === 401 || response.status === 403)) {
            // console.warn('[JioService] Authed channels endpoint rejected session. Attempting refresh.')
            const refreshed = await this.refreshAccessToken()
            if (!refreshed) {
              await this.logout()
              this.notifySessionExpired('Your JioTV session expired. Please sign in again.')
            }
          }
          lastError = errorMessage(body, response.status)
          continue
        }
        const parsed = (body ?? {}) as { result?: unknown[]; message?: string }
        if (!Array.isArray(parsed.result) || parsed.result.length === 0) {
          lastError = parsed.message || 'JioTV returned an empty channel list.'
          continue
        }
        const channels = parsed.result
          .map((item, index) => this.normalizeChannel(item as Record<string, unknown>, index))
          .filter((channel): channel is Channel => channel !== null)
        if (channels.length === 0) {
          lastError = 'JioTV returned channels in an unknown format.'
          continue
        }
        this.channelCache = { channels, at: Date.now() }
        this.relay.registerChannels(channels)
        return { ok: true, data: channels }
      } catch (error) {
        lastError =
          error instanceof Error && error.name === 'TimeoutError'
            ? 'JioTV did not respond. Check your connection.'
            : 'Could not reach the JioTV catalogue.'
      }
    }
    return { ok: false, error: lastError, retryable: true }
  }

  private normalizeChannel(raw: Record<string, unknown>, index: number): Channel | null {
    const id = String(raw.channel_id ?? raw.channelId ?? raw.id ?? '').trim()
    const name = String(raw.channel_name ?? raw.channelName ?? raw.name ?? '').trim()
    if (!id || !name) return null
    const languageId = Number(raw.channelLanguageId ?? raw.languageId ?? 0)
    const categoryId = Number(raw.channelCategoryId ?? raw.categoryId ?? 0)
    const language = LANGUAGE_BY_ID[languageId] ?? 'Other'
    const category = categorize(categoryId, languageId, name)
    const numericId = Number(id)
    const isHD = Boolean(raw.isHD ?? raw.isHd ?? /hd|4k/i.test(name))
    const is4k = /4k|uhd/i.test(name)
    const businessType = String(raw.business_type ?? raw.businessType ?? '').toLowerCase()
    return {
      id,
      number: Number.isFinite(numericId) && numericId > 0 ? numericId : index + 101,
      name,
      logoUrl: String(raw.logoUrl ?? raw.channel_logo ?? raw.logo ?? ''),
      brandColor: brandFor(name, category),
      category,
      language,
      isLive: raw.isLive !== false,
      quality: is4k ? ['4K', 'HD'] : isHD ? ['HD'] : ['SD'],
      isPremium:
        businessType === 'premium' ||
        raw.is_premium === true ||
        raw.requiresSubscription === true,
      source: 'jio',
      description: `${name} — live ${category} from the JioTV catalogue.`
    }
  }

  /**
   * Scans every URL in a playback response for an Akamai `hdnea` token.
   *
   * Jio sometimes attaches the token to a single quality tier only, so the
   * stream we picked may not carry it even though the response does.
   */
  private findHdnea(response: PlaybackResponse): string {
    const candidates: string[] = [
      response.result ?? '',
      ...Object.values(response.m3u8 ?? {}),
      ...Object.values(response.bitrates ?? {}),
      response.mpd?.result ?? '',
      ...Object.values(response.mpd?.bitrates ?? {}),
      response.mpd?.auto ?? '',
      response.mpd?.high ?? '',
      response.mpd?.medium ?? '',
      response.mpd?.low ?? ''
    ]
    for (const candidate of candidates) {
      const token = extractHdnea(candidate)
      if (token) return token
    }
    return ''
  }

  private selectQuality(
    quality: 'auto' | 'high' | 'medium' | 'low',
    autoUrl?: string,
    highUrl?: string,
    mediumUrl?: string,
    lowUrl?: string
  ): string {
    switch (quality) {
      case 'high':
        return highUrl || ''
      case 'medium':
        return mediumUrl || ''
      case 'low':
        return lowUrl || ''
      default:
        // On desktop, 'auto' mode requires the uncompressed master stream (highUrl)
        // with full-fidelity 128k/192k audio and all resolution tiers.
        // Jio's autoUrl is a low-bitrate mobile transcode with heavily compressed 32/64k audio.
        return highUrl || autoUrl || ''
    }
  }

  /** Strictly mirrors JioTV-Go's selectBestLiveHLSURL in internal/handlers/handlers.go */
  private selectBestLiveHLSURL(
    response: PlaybackResponse,
    quality: 'auto' | 'high' | 'medium' | 'low'
  ): string {
    const bits = response.bitrates ?? {}
    const m3u8 = response.m3u8 ?? {}
    const auto = bits.auto || m3u8.auto
    const high = bits.high || m3u8.high
    const med = bits.medium || m3u8.medium
    const low = bits.low || m3u8.low

    // 1. Try requested quality first (from JioTV-Go internalUtils.SelectQuality)
    const selected = this.selectQuality(quality, auto, high, med, low)
    if (selected) return selected

    // 2. Try candidate fallback order: high, auto, medium, low
    for (const candidate of [high, auto, med, low]) {
      if (candidate) return candidate
    }

    // 3. Playable HLS in result
    if (response.result && !/\.mpd(?:[?#]|$)/i.test(response.result)) {
      return response.result
    }

    // 4. Safety fallback when MPD block contains an HLS URL
    if (response.mpd?.result && /\.m3u8(?:[?#]|$)/i.test(response.mpd.result)) {
      return response.mpd.result
    }

    return ''
  }

  /** Strictly mirrors JioTV-Go's selectBestLiveMPDURL in internal/handlers/handlers.go */
  private selectBestLiveMPDURL(
    response: PlaybackResponse,
    quality: 'auto' | 'high' | 'medium' | 'low'
  ): string {
    const mpdBits = response.mpd?.bitrates ?? {}
    const auto = mpdBits.auto
    const high = mpdBits.high
    const med = mpdBits.medium
    const low = mpdBits.low

    // 1. Try requested quality first
    const selected = this.selectQuality(quality, auto, high, med, low)
    if (selected) return selected

    // 2. Try candidate fallback order: high, auto, medium, low
    for (const candidate of [high, auto, med, low]) {
      if (candidate) return candidate
    }

    // 3. Fallback to mpd.result
    return response.mpd?.result || ''
  }

  private pickStreamUrl(
    response: PlaybackResponse,
    quality: 'auto' | 'high' | 'medium' | 'low'
  ): {
    url: string
    type: 'hls' | 'dash'
    licenseUrl?: string
    isDrm: boolean
  } {
    // Step 3: Handle Sony and DRM channels.
    // If mpd object is present and contains a valid URL, use DASH (MPEG-DASH with Widevine).
    const mpdUrl = this.selectBestLiveMPDURL(response, quality)
    if (mpdUrl) {
      const rawDrm = (response.drm ?? {}) as Record<string, unknown>
      const provider =
        String(
          (response as Record<string, unknown>).provider ||
          rawDrm.provider ||
          (response.mpd as Record<string, unknown> | undefined)?.provider ||
          ''
        ).trim() || 'reliance'

      let licenseUrl = String(
        response.license_url ||
        response.licenseUrl ||
        rawDrm.license_url ||
        rawDrm.licenseUrl ||
        rawDrm.keyUrl ||
        rawDrm.url ||
        response.mpd?.license_url ||
        response.mpd?.licenseUrl ||
        response.mpd?.key ||
        (response.mpd as Record<string, unknown> | undefined)?.keyUrl ||
        response.keyUrl ||
        (response as Record<string, unknown>).key ||
        ''
      ).trim()

      if (!licenseUrl && mpdUrl) {
        licenseUrl = `https://tv.media.jio.com/proxy?provider=${encodeURIComponent(provider)}`
      }

      return {
        url: mpdUrl,
        type: 'dash',
        licenseUrl: licenseUrl || undefined,
        isDrm: Boolean(licenseUrl || response.isDRM || response.mpd)
      }
    }

    // Step 1: Replicate JioTV-Go's HLS stream selection (do not modify CDN URLs).
    const hlsUrl = this.selectBestLiveHLSURL(response, quality)
    if (hlsUrl) {
      return {
        url: hlsUrl,
        type: 'hls',
        isDrm: false
      }
    }

    return { url: '', type: 'hls', isDrm: false }
  }

  /**
   * Calls the Jio playback API and resolves the raw upstream stream.
   *
   * This deliberately does NOT create a relay session: it is shared by
   * `getStream` (which registers one) and by the relay's 401/403 token-refresh
   * callback, which must update an existing session in place.
   */
  private async resolveUpstreamStream(
    channelId: string,
    quality: JioQuality
  ): Promise<Result<ResolvedUpstream>> {
    // console.log(`[JioService] Resolving upstream stream for channelId=${channelId}, quality=${quality}`)
    if (!this.session) {
      // console.warn('[JioService] getStream failed: AUTH_REQUIRED (no session)')
      return {
        ok: false,
        error: 'Sign in with your JioTV number to watch live channels.',
        code: 'AUTH_REQUIRED'
      }
    }
    await this.ensureFreshToken()
    const body = new URLSearchParams({
      channel_id: channelId,
      stream_type: 'Seek',
      begin: new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'),
      srno: new Date().toISOString().slice(0, 10).replace(/-/g, '')
    }).toString()

    const requestOnce = async (): Promise<{ response: Response; body: unknown }> => {
      const headers: Record<string, string> = {
        ...this.authenticatedHeaders(),
        'Content-Type': 'application/x-www-form-urlencoded',
        appName: 'RJIL_JioTV',
        channelId,
        'User-Agent': USER_AGENT
      }
      delete headers.appkey
      return requestJson(API.playback, {
        method: 'POST',
        headers,
        body
      })
    }

    try {
      let { response, body: parsedBody } = await requestOnce()
      if ((response.status === 401 || response.status === 403) && (await this.refreshAccessToken())) {
        // console.log('[JioService] Playback token refreshed after 401/403, retrying requestOnce')
        // ;({ response, body: parsedBody } = await requestOnce())
      }
      const parsed = (parsedBody ?? {}) as PlaybackResponse
      // console.log(`[JioService] Playback API response status: ${response.status}, code: ${parsed.code ?? 'none'}`)

      // 1. Check for subscription pack locks first before treating as an account-level auth failure
      const isSubscriptionLock =
        (parsed.code && parsed.code !== 200 && parsed.code !== '200' && !parsed.result && !parsed.mpd) ||
        parsed.code === 'NOT_ENTITLED' ||
        /subscription|not\s*subscribed|not\s*available\s*on\s*your\s*jio|channel\s*pack|plan\s*upgrade/i.test(
          String(parsed.message || '')
        )

      if (isSubscriptionLock) {
        // console.warn(`[JioService] Channel subscription lock (code ${parsed.code}): ${parsed.message}`)
        return {
          ok: false,
          error: parsed.message || 'This channel is not available on your Jio account.',
          code: 'NOT_ENTITLED'
        }
      }

      // 2. Only treat as account-level session failure if status is 401/419 or message explicitly indicates token expiration
      const isAuthFailure =
        response.status === 401 ||
        response.status === 419 ||
        parsed.code === 401 ||
        parsed.code === 419 ||
        isTokenOrAuthError(parsed.message) ||
        isTokenOrAuthError(errorMessage(parsedBody, response.status))

      if (isAuthFailure) {
        // console.warn(`[JioService] Playback API rejected token (HTTP ${response.status}, code ${parsed.code}): ${parsed.message}`)
        await this.logout()
        const reason = 'Your JioTV session has expired. Please sign in again.'
        this.notifySessionExpired(reason)
        return {
          ok: false,
          error: reason,
          code: 'TOKEN_EXPIRED'
        }
      }

      if (!response.ok) {
        // console.warn(`[JioService] Playback API returned HTTP ${response.status}:`, parsedBody)
        return {
          ok: false,
          error: errorMessage(parsedBody, response.status),
          code: 'PLAYBACK_FAILED',
          retryable: response.status >= 500
        }
      }

      const selected = this.pickStreamUrl(parsed, quality)
      // console.log(`[JioService] Picked stream: url=${selected.url ? selected.url.slice(0, 90) + '...' : '(none)'}, type=${selected.type}, isDrm=${selected.isDrm}`)
      if (!selected.url) {
        // console.warn('[JioService] No playable stream found in response')
        return {
          ok: false,
          error: parsed.message || 'JioTV did not return a playable stream for this channel.',
          code: 'NO_STREAM'
        }
      }

      // Jio rotates its signed `hdnea` CDN token. It may only be attached to
      // one quality tier, so look through every URL the API returned and keep
      // the token that goes with the stream we picked.
      const hdnea = extractHdnea(selected.url) || this.findHdnea(parsed)
      // console.log(`[JioService] hdnea token found: ${hdnea ? 'yes' : 'no'}`)

      // The CDN requires the Android *player* agent and `Accept: */*`.
      // `authenticatedHeaders()` carries `okhttp/4.12.0` + `application/json`
      // for the JSON APIs, so it must not be spread over the top of these.
      const manifestHeaders = buildPlaybackHeaders({
        authHeaders: {
          ...this.authenticatedHeaders(),
          channelId,
          srno: '230203144000'
        },
        hdnea
      })

      let licenseUrl = selected.licenseUrl
      if (licenseUrl && hdnea) {
        licenseUrl = withHlsToken(licenseUrl, hdnea)
      }

      return {
        ok: true,
        data: {
          url: selected.url,
          type: selected.type,
          licenseUrl,
          isDrm: selected.isDrm,
          headers: manifestHeaders,
          hdnea
        }
      }
    } catch (error) {
      // console.error('[JioService] resolveUpstreamStream caught error:', error)
      await sleep(150)
      return {
        ok: false,
        error:
          error instanceof Error && error.name === 'TimeoutError'
            ? 'The stream took too long to respond.'
            : 'Could not start this channel. Please try again.',
        code: 'NETWORK',
        retryable: true
      }
    }
  }

  async getStream(
    channelId: string,
    quality: JioQuality = 'high'
  ): Promise<Result<StreamInfo>> {
    // console.log(`[JioService] getStream requested for channelId=${channelId}, quality=${quality}`)
    const resolved = await this.resolveUpstreamStream(channelId, quality)
    if (!resolved.ok) return resolved

    const source = resolved.data
    const relaySession = this.relay.register({
      channelId,
      manifestUrl: source.url,
      licenseUrl: source.licenseUrl,
      headers: source.headers,
      quality
    })

    return {
      ok: true,
      data: {
        channelId,
        url: relaySession.manifestUrl,
        type: source.type,
        isLive: true,
        isDrm: source.isDrm,
        drm:
          (source.isDrm || source.type === 'dash') && relaySession.licenseUrl
            ? {
                licenseUrl: relaySession.licenseUrl,
                headers: {
                  Authorization: `Bearer ${this.session!.credentials.accessToken}`,
                  ssotoken: this.session!.credentials.ssoToken,
                  channelId,
                  srno: '230203144000'
                }
              }
            : undefined,
        note: source.hdnea
          ? 'Jio signed stream · relayed through StreamDeck'
          : 'Jio stream · relayed through StreamDeck',
        source: 'jio'
      }
    }
  }

  async fetchEpg(channelId: string): Promise<Result<EpgEntry[]>> {
    const headers: Record<string, string> = {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      devicetype: 'phone',
      os: 'android',
      appkey: APP_KEY,
      ...(this.session ? this.authenticatedHeaders() : {})
    }
    const offsets = [0, -1, 1]
    let lastError = 'EPG is not available for this channel.'
    for (const offset of offsets) {
      try {
        const url = `${API.epg}?offset=${offset}&channel_id=${encodeURIComponent(channelId)}`
        const { response, body } = await requestJson(url, { headers })
        if (!response.ok) {
          lastError = errorMessage(body, response.status)
          continue
        }
        const parsed = (body ?? {}) as { epg?: Array<Record<string, unknown>> }
        if (!Array.isArray(parsed.epg) || parsed.epg.length === 0) continue
        const entries: EpgEntry[] = parsed.epg
          .map((entry) => ({
            startEpoch: Number(entry.startEpoch ?? 0),
            endEpoch: Number(entry.endEpoch ?? 0),
            channelId: String(entry.channel_id ?? channelId),
            title: String(entry.showname ?? entry.title ?? 'Untitled'),
            description: String(entry.description ?? ''),
            category: String(entry.showCategory ?? ''),
            thumbnail: typeof entry.episodeThumbnail === 'string' ? entry.episodeThumbnail : undefined
          }))
          .filter((entry) => entry.startEpoch > 0 && entry.endEpoch > entry.startEpoch)
        if (entries.length > 0) return { ok: true, data: entries }
      } catch (error) {
        lastError =
          error instanceof Error && error.name === 'TimeoutError'
            ? 'EPG request timed out.'
            : 'Could not load EPG.'
      }
    }
    return { ok: false, error: lastError, retryable: true }
  }

  async fetchFeatured(): Promise<Result<Array<{ channelId: string; priority: number }>>> {
    const headers = {
      'User-Agent': 'okhttp/4.2.2',
      usergroup: USER_GROUP,
      os: 'android',
      devicetype: 'phone',
      versionCode: '226',
      Accept: 'application/json'
    }
    const results: Array<{ channelId: string; priority: number }> = []
    const langIds = ['6', '1']
    for (const langId of langIds) {
      try {
        const url = `${API.featured}?start=0&limit=30&langId=${langId}`
        const { response, body } = await requestJson(url, { headers }, { timeout: 6000 })
        if (!response.ok) continue
        const parsed = (body ?? {}) as {
          featuredNewData?: Array<{ data?: Array<{ channel_id?: number | string; showStatus?: string }> }>
        }
        if (Array.isArray(parsed.featuredNewData)) {
          let priority = 100
          for (const section of parsed.featuredNewData) {
            for (const item of section.data ?? []) {
              if (item.channel_id) {
                const channelId = String(item.channel_id)
                if (!results.some((r) => r.channelId === channelId)) {
                  results.push({ channelId, priority: priority-- })
                }
              }
            }
          }
        }
      } catch {
        // Fall back gracefully
      }
    }
    return { ok: true, data: results }
  }
}
