import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { PLAYER_UA, withHdneaCookie } from './jio-headers'

/**
 * A tiny loopback media relay.
 *
 * Jio's manifests and Widevine endpoints require Android-app request headers,
 * cookies and (often) no CORS. Rather than weakening the BrowserWindow with
 * `webSecurity: false`, we register a playback session and route only that
 * session's manifest, segments and license through 127.0.0.1. The server binds
 * to an ephemeral port and is reachable only from this machine.
 */

type RelayQuality = 'auto' | 'high' | 'medium' | 'low'

interface Session {
  id: string
  channelId: string
  manifestUrl: string
  licenseUrl?: string
  headers: Record<string, string>
  /** Effective base URL for relative DASH segments after manifest parsing. */
  segmentBase?: string
  /** Quality tier used to re-resolve the signed playback URL. */
  quality: RelayQuality
  /** Increments whenever Jio rotates a signed URL/cookie. */
  generation: number
  /** Coalesces concurrent 401/403 refreshes into one playback API call. */
  refreshPromise: Promise<boolean> | null
}

/** A registered playback session plus the URLs the renderer should use. */
export interface RelaySession {
  /** Opaque session id used to authenticate `/raw` requests. */
  id: string
  manifestUrl: string
  licenseUrl?: string
}

/** Fresh raw upstream stream returned by `JioService` for token refresh. */
export interface RelayUpstreamSource {
  manifestUrl: string
  headers?: Record<string, string>
  licenseUrl?: string
}

export type RelayStreamResolver = (
  channelId: string,
  quality: RelayQuality
) => Promise<RelayUpstreamSource | null>

interface CachedSegment {
  body: Buffer
  contentType: string
  contentRange?: string
  acceptRanges?: string
  storedAt: number
}

/**
 * DVR segments are immutable once published, so re-winding to a segment the
 * viewer just watched can be served from memory. This also protects short
 * re-winds from a CDN token that expired a few seconds ago.
 */
const SEGMENT_CACHE_TTL_MS = 2 * 60_000
const SEGMENT_CACHE_MAX_ENTRIES = 80
const SEGMENT_CACHE_MAX_BYTES = 64 * 1024 * 1024
const SEGMENT_CACHE_MAX_ITEM_BYTES = 16 * 1024 * 1024


const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
  'Access-Control-Max-Age': '86400'
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * Rewrites an upstream URL into a relay URL.
 *
 * The session id travels with the URL so that `/raw` can recover the
 * authenticated header set (player agent, session tokens, `__hdnea__` cookie)
 * that the CDN requires. Without it the relay would fetch the segment as an
 * anonymous client and Jio would answer `403`.
 */
function proxify(rawUrl: string, request: IncomingMessage, sessionId: string): string {
  const host = request.headers.host
  return `http://${host}/raw?u=${encodeURIComponent(rawUrl)}&s=${encodeURIComponent(sessionId)}`
}

/**
 * DASH manifests are rewritten so every network reference goes through the
 * relay. The original BaseURL becomes the relay's `/seg` route, which resolves
 * relative segment templates (including `$Number$` placeholders) at request
 * time. Non-templated absolute URLs are sent through `/raw`.
 */
function rewriteMpd(
  xml: string,
  manifestUrl: string,
  localBase: string,
  request: IncomingMessage,
  sessionId: string
): { xml: string; segmentBase: string } {
  const token = hlsToken(manifestUrl)
  const baseMatch = xml.match(/<BaseURL[^>]*>([\s\S]*?)<\/BaseURL>/i)
  const rawBase = baseMatch ? baseMatch[1].trim() : ''

  let segmentBase: string
  try {
    if (rawBase && /^https?:\/\//i.test(rawBase)) {
      segmentBase = rawBase
    } else if (rawBase) {
      segmentBase = new URL(rawBase, manifestUrl).href
    } else {
      segmentBase = new URL('.', manifestUrl).href
    }
  } catch {
    segmentBase = manifestUrl
  }

  if (!segmentBase.endsWith('/') && !segmentBase.includes('?') && !/\.[a-z0-9]+$/i.test(segmentBase)) {
    segmentBase += '/'
  }

  try {
    const manifestParsed = new URL(manifestUrl)
    const baseParsed = new URL(segmentBase)
    if (!baseParsed.search && manifestParsed.search) {
      baseParsed.search = manifestParsed.search
      segmentBase = baseParsed.href
    }
  } catch {
    // ignore
  }

  const host = request.headers.host || '127.0.0.1'
  const localManifestUrl = `http://${host}/stream/${sessionId}/manifest`
  const baseClean = segmentBase.split('?')[0].replace(/\/+$/, '')

  let output = xml

  // 1. Rewrite <Location> tags to local relay manifest URL so Shaka polls local relay for live manifest updates
  output = output.replace(/<Location[^>]*>[\s\S]*?<\/Location>/gi, `<Location>${localManifestUrl}</Location>`)

  // 2. Remove any original <BaseURL> tags (root or nested)
  output = output.replace(/<BaseURL[^>]*>[\s\S]*?<\/BaseURL>/gi, '')

  // 3. Inject local relay BaseURL right after <MPD>
  output = output.replace(/(<MPD\b[^>]*>)/i, `$1\n  <BaseURL>${localBase}</BaseURL>`)

  // 4. Rewrite any absolute URLs matching baseClean (including templated $Number$ segments)
  if (baseClean) {
    const baseEscaped = baseClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(baseEscaped + '(/[^"\'\\s>]*)?', 'gi')
    output = output.replace(pattern, (_full, rest) => {
      const cleanRest = rest ? rest.replace(/^\/+/, '') : ''
      return `${localBase}${cleanRest}`
    })
  }

  // 5. Rewrite any media/initialization attributes
  output = output.replace(
    /(media|initialization|sourceURL|href|index)="([^"]+)"/g,
    (full, attr: string, value: string) => {
      if (!value || value.startsWith('data:') || value.includes('127.0.0.1')) return full

      // Relative templates resolve against injected local BaseURL automatically
      if (value.includes('$') && !/^https?:/i.test(value)) {
        return full
      }

      // Absolute templated URLs (e.g. https://.../seg_$Number$.mp4)
      if (value.includes('$') && /^https?:/i.test(value)) {
        const lastSlash = value.lastIndexOf('/')
        const filename = lastSlash !== -1 ? value.slice(lastSlash + 1) : value
        return `${attr}="${localBase}${filename}"`
      }

      // Non-templated URLs: resolve and proxify
      let resolved: string
      try {
        resolved = /^https?:/i.test(value) ? value : new URL(value, segmentBase).href
      } catch {
        return full
      }
      if (!isHttpUrl(resolved)) return full
      if (token) resolved = withHlsToken(resolved, token)
      return `${attr}="${proxify(resolved, request, sessionId)}"`
    }
  )

  // 6. Extra safety net: prefix any remaining *.cdn.jio.com absolute URLs with localBase
  output = output.replace(/https?:\/\/[a-z0-9.-]*cdn\.jio\.com\/[^\s"'>]+/gi, (matchedUrl) => {
    if (matchedUrl.includes('127.0.0.1')) return matchedUrl
    return `${localBase}${matchedUrl}`
  })

  return { xml: output, segmentBase }
}

/** HLS playlists: rewrite every media URI and key/map URI. */
function hlsToken(manifestUrl: string): string {
  try {
    const parsed = new URL(manifestUrl)
    return parsed.searchParams.get('__hdnea__') || parsed.searchParams.get('hdnea') || ''
  } catch {
    return ''
  }
}

/**
 * Replaces (rather than merely adds) the `__hdnea__` token.
 *
 * This matters on a retry: Shaka may request a segment URI that contains the
 * token from the *old* manifest. Adding a second token is a no-op, so the
 * request would keep failing with 403 until the replacement happens here.
 */
function withHlsToken(rawUrl: string, token: string): string {
  if (!token) return rawUrl
  try {
    const parsed = new URL(rawUrl)
    parsed.searchParams.delete('hdnea')
    parsed.searchParams.set('__hdnea__', token)
    return parsed.href
  } catch {
    return rawUrl
  }
}

/** Cache key ignores volatile signed-token parameters. */
function segmentCacheKey(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl)
    parsed.searchParams.delete('__hdnea__')
    parsed.searchParams.delete('hdnea')
    return parsed.href
  } catch {
    return rawUrl
  }
}

function rewriteHls(
  playlist: string,
  manifestUrl: string,
  request: IncomingMessage,
  sessionId: string
): string {
  const token = hlsToken(manifestUrl)
  const lines = playlist.split(/\r?\n/)
  const resolved = lines.map((line) => {
    const trimmed = line.trim()
    if (!trimmed) return line
    if (trimmed.startsWith('#')) {
      return line.replace(/URI="([^"]+)"/gi, (full, uri: string) => {
        const absolute = withHlsToken(new URL(uri, manifestUrl).href, token)
        if (!isHttpUrl(absolute)) return full
        return `URI="${proxify(absolute, request, sessionId)}"`
      })
    }
    const absolute = withHlsToken(new URL(trimmed, manifestUrl).href, token)
    return isHttpUrl(absolute) ? proxify(absolute, request, sessionId) : line
  })
  return resolved.join('\n')
}

async function fetchUpstream(
  target: string,
  headers: Record<string, string>,
  init?: { method?: string; body?: Buffer; range?: string }
): Promise<Response> {
  const requestHeaders: Record<string, string> = {
    'User-Agent': PLAYER_UA,
    ...headers
  }
  if (init?.range) requestHeaders.Range = init.range
  return fetch(target, {
    method: init?.method ?? 'GET',
    headers: requestHeaders,
    body: init?.body,
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000)
  })
}

function copyHeaders(from: Headers, to: ServerResponse): void {
  const allowed = [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'cache-control',
    'expires',
    'last-modified'
  ]
  for (const name of allowed) {
    const value = from.get(name)
    if (value) to.setHeader(name, value)
  }
}

const DEMO_CHANNEL_LOGOS: Record<string, string> = {
  '101': 'Star_Sports_1_HD.png',
  '102': 'Star_Sports_2.png',
  '103': 'Star_Sports_Select_1_HD.png',
  '104': 'Sony_Ten_1_HD.png',
  '105': 'Sony_Ten_2.png',
  '106': 'DD_Sports.png',
  '107': 'EuroSport_HD.png',
  '108': 'Sports_18_1_HD.png',
  '109': 'Star_Movies_HD.png',
  '110': 'Sony_Max.png',
  '111': 'Zee_Cinema_HD.png',
  '112': 'and_pictures.png',
  '113': 'Movies_Now_HD.png',
  '114': 'Star_Gold_HD.png',
  '115': 'Star_Plus_HD.png',
  '116': 'Zee_TV_HD.png',
  '117': 'Colors_HD.png',
  '118': 'Sony_SAB.png',
  '119': 'SET_HD.png',
  '120': 'and_TV_HD.png',
  '121': 'NDTV_24x7.png',
  '122': 'Aaj_Tak.png',
  '123': 'Republic_Bharat.png',
  '124': 'India_Today.png',
  '125': 'CNBC_TV18.png',
  '126': 'WION.png',
  '127': 'BBC_World_News.png',
  '128': 'Cartoon_Network_HD_Plus.png',
  '129': 'Pogo.png',
  '130': 'Nick_HD_Plus.png',
  '131': 'Disney_Channel.png',
  '132': 'Discovery_Kids.png',
  '133': 'Sun_TV_HD.png',
  '134': 'Asianet_HD.png',
  '135': 'Star_Vijay_HD.png',
  '136': 'Zee_Marathi.png',
  '137': 'Star_Jalsha_HD.png',
  '138': 'Gemini_TV_HD.png',
  // Common slug aliases
  'eurosport': 'EuroSport_HD.png',
  'eurosport-hd': 'EuroSport_HD.png',
  'sony-ten-3-hd': 'Sony_Ten_3_HD.png',
  'sony-ten-3': 'Sony_Ten_3_HD.png',
  '166': 'Sony_Ten_3_HD.png',
  'sony-sab': 'Sony_SAB.png',
  'colors-hd': 'Colors_HD.png',
  'aaj-tak': 'Aaj_Tak.png',
  'ndtv-24x7': 'NDTV_24x7.png'
}

export class MediaRelay {
  private server: Server | null = null
  private _port = 0
  /** Ephemeral loopback port the relay is listening on. */
  get port(): number { return this._port }
  private lastActiveSessionId: string | null = null
  private readonly sessions = new Map<string, Session>()
  private readonly segmentCache = new Map<string, CachedSegment>()
  private segmentCacheBytes = 0
  private streamResolver: RelayStreamResolver | null = null
  private onAuthExpiredCallback?: (reason: string) => void
  private readonly channelLogos = new Map<string, string>()
  private readonly normalizedLogoCache = new Map<string, Buffer>()
  private channelFetchingPromise: Promise<void> | null = null

  get running(): boolean {
    return this.server !== null
  }

  /** Lets `JioService` re-resolve a signed playback URL on 401/403. */
  setStreamResolver(resolver: RelayStreamResolver): void {
    this.streamResolver = resolver
  }

  /** Registers a callback fired when upstream auth rejects playback/tokens. */
  setAuthExpiredHandler(handler: (reason: string) => void): void {
    this.onAuthExpiredCallback = handler
  }

  /** Registers channel catalog entries so /logo/:channelId can look up original logos. */
  registerChannels(channels: Array<{ id: string | number; number?: number; name?: string; logoUrl?: string }>): void {
    for (const ch of channels) {
      if (ch.logoUrl) {
        const logo = ch.logoUrl.trim()
        const fullUrl = /^https?:\/\//i.test(logo)
          ? logo
          : `https://jiotv.catchup.cdn.jio.com/dare_images/images/${logo}`
        this.channelLogos.set(String(ch.id).toLowerCase(), fullUrl)
        if (ch.number) this.channelLogos.set(String(ch.number), fullUrl)
        if (ch.name) {
          const normName = ch.name.toLowerCase().trim()
          this.channelLogos.set(normName, fullUrl)
          this.channelLogos.set(normName.replace(/\s+/g, '-'), fullUrl)
        }
      }
    }
  }

  private async ensureChannelsLoaded(): Promise<void> {
    if (this.channelFetchingPromise) return this.channelFetchingPromise
    this.channelFetchingPromise = (async () => {
      try {
        const res = await fetch(
          'https://jiotvapi.cdn.jio.com/apis/v3.1/getMobileChannelList/get/?langId=6&os=android&devicetype=phone&usertype=JIO&version=315',
          {
            headers: {
              'User-Agent': 'okhttp/4.9.0',
              Accept: 'application/json'
            }
          }
        )
        if (!res.ok) return
        const json = (await res.json()) as {
          result?: Array<{
            channel_id?: number | string
            channel_name?: string
            logoUrl?: string
            channel_logo?: string
            logo?: string
          }>
        }
        if (Array.isArray(json?.result)) {
          for (const item of json.result) {
            const id = String(item.channel_id ?? '').trim()
            const logo = String(item.logoUrl ?? item.channel_logo ?? item.logo ?? '').trim()
            const name = String(item.channel_name ?? '').trim()
            if (id && logo) {
              const logoUrl = /^https?:\/\//i.test(logo)
                ? logo
                : `https://jiotv.catchup.cdn.jio.com/dare_images/images/${logo}`
              this.channelLogos.set(id.toLowerCase(), logoUrl)
              if (name) {
                const normName = name.toLowerCase().trim()
                this.channelLogos.set(normName, logoUrl)
                this.channelLogos.set(normName.replace(/\s+/g, '-'), logoUrl)
              }
            }
          }
        }
      } catch (err) {
        console.warn('[MediaRelay] Failed to auto-fetch Jio channel list for logos:', err)
      }
    })()
    return this.channelFetchingPromise
  }

  private async resolveLogoTarget(channelId?: string, queryUrl?: string, queryFile?: string): Promise<string | null> {
    if (queryUrl) return queryUrl
    if (queryFile) return `https://jiotv.catchup.cdn.jio.com/dare_images/images/${queryFile}`
    if (!channelId) return null

    const cleanId = decodeURIComponent(channelId).trim()
    const lower = cleanId.toLowerCase()

    // 1. In-memory registered channels
    if (this.channelLogos.has(lower)) return this.channelLogos.get(lower)!
    if (cleanId.startsWith('ch-')) {
      const numPart = cleanId.slice(3)
      if (this.channelLogos.has(numPart)) return this.channelLogos.get(numPart)!
      if (DEMO_CHANNEL_LOGOS[numPart]) {
        return `https://jiotv.catchup.cdn.jio.com/dare_images/images/${DEMO_CHANNEL_LOGOS[numPart]}`
      }
    }

    // 2. Demo dictionary
    if (DEMO_CHANNEL_LOGOS[lower]) {
      return `https://jiotv.catchup.cdn.jio.com/dare_images/images/${DEMO_CHANNEL_LOGOS[lower]}`
    }
    if (DEMO_CHANNEL_LOGOS[cleanId]) {
      return `https://jiotv.catchup.cdn.jio.com/dare_images/images/${DEMO_CHANNEL_LOGOS[cleanId]}`
    }

    // 3. Direct filename or full URL passed as channelId
    if (/\.(png|jpe?g|webp|svg)$/i.test(cleanId) || /^https?:\/\//i.test(cleanId)) {
      return /^https?:\/\//i.test(cleanId)
        ? cleanId
        : `https://jiotv.catchup.cdn.jio.com/dare_images/images/${cleanId}`
    }

    // 4. Fetch catalogue if not loaded
    if (this.channelLogos.size === 0) {
      await this.ensureChannelsLoaded()
      if (this.channelLogos.has(lower)) return this.channelLogos.get(lower)!
      if (this.channelLogos.has(cleanId)) return this.channelLogos.get(cleanId)!
    }

    // 5. Intelligent title-cased fallback to Jio CDN filename
    const formatted = cleanId
      .replace(/^ch-/, '')
      .split(/[-_\s]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('_')
    return `https://jiotv.catchup.cdn.jio.com/dare_images/images/${formatted}.png`
  }

  async start(): Promise<void> {
    if (this.server) return
    this.server = createServer((req, res) => {
      void this.handle(req, res).catch((error: unknown) => {
        console.error('[MediaRelay] Uncaught handler error:', error)
        if (!res.headersSent) res.writeHead(502, CORS_HEADERS)
        res.end(error instanceof Error ? error.message : 'Relay error')
      })
    })
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(0, '127.0.0.1', () => {
        const address = this.server!.address()
        this._port = typeof address === 'object' && address ? address.port : 0
        console.log(`[MediaRelay] Server running on 127.0.0.1:${this._port}`)
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    this.sessions.clear()
    this.segmentCache.clear()
    this.segmentCacheBytes = 0
    this.lastActiveSessionId = null
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve()
      this.server.close(() => resolve())
      this.server = null
    })
  }

  /**
   * Creates a short-lived playback session and returns URLs the renderer can
   * hand to hls.js/shaka-player.
   */
  register(input: {
    channelId: string
    manifestUrl: string
    licenseUrl?: string
    headers?: Record<string, string>
    quality?: RelayQuality
  }): RelaySession {
    if (!this._port) throw new Error('Media relay is not running')
    const id = randomUUID()
    this.lastActiveSessionId = id
    this.sessions.set(id, {
      id,
      channelId: input.channelId,
      manifestUrl: input.manifestUrl,
      licenseUrl: input.licenseUrl,
      headers: input.headers ?? {},
      quality: input.quality ?? 'high',
      generation: 0,
      refreshPromise: null
    })
    console.log(`[MediaRelay] Registered session ${id} for channel ${input.channelId}`)
    const base = `http://127.0.0.1:${this._port}/stream/${id}`
    return {
      id,
      manifestUrl: `${base}/manifest`,
      licenseUrl: `${base}/license`
    }
  }

  /** Builds the upstream header set for the session's *current* token. */
  private buildUpstreamHeaders(session: Session | null): Record<string, string> {
    const headers: Record<string, string> = { ...(session?.headers ?? {}) }
    if (session?.channelId) {
      headers.channelId = session.channelId
    }
    if (!headers.srno) {
      headers.srno = '230203144000'
    }
    const token = session ? hlsToken(session.manifestUrl) : ''
    return token ? withHdneaCookie(headers, token) : headers
  }

  /**
   * Jio occasionally rotates `__hdnea__` in a `Set-Cookie` response header.
   * Persist it so every subsequent segment/license request uses the new token.
   */
  private captureRotatedToken(session: Session, upstream: Response): void {
    const setCookie = upstream.headers.get('set-cookie')
    if (!setCookie) return
    const match = setCookie.match(/__hdnea__=([^;]+)/)
    if (!match?.[1]) return

    let token = match[1].trim()
    try {
      token = decodeURIComponent(token)
    } catch {
      // Cookie values are usually not percent-encoded; keep the raw value.
    }
    if (!token || token === hlsToken(session.manifestUrl)) return

    console.log(`[MediaRelay] Upstream rotated __hdnea__ for ${session.channelId}`)
    session.headers = withHdneaCookie(session.headers, token)
    session.manifestUrl = withHlsToken(session.manifestUrl, token)
    if (session.licenseUrl) session.licenseUrl = withHlsToken(session.licenseUrl, token)
    session.generation += 1
  }

  /**
   * Asks `JioService` for a fresh playback URL after a 401/403.
   *
   * Concurrent segment requests that fail at the same moment share one
   * refresh promise. If a request started *before* another request refreshed
   * the session it simply retries instead of hitting the playback API again.
   */
  private async refreshSession(session: Session, seenGeneration: number): Promise<boolean> {
    if (session.generation > seenGeneration) return true
    if (!this.streamResolver) return false
    if (session.refreshPromise) return session.refreshPromise

    const generationAtStart = session.generation
    console.log(`[MediaRelay] Token expired for channel ${session.channelId}; refreshing signed URL…`)

    const promise = (async (): Promise<boolean> => {
      try {
        const fresh = await this.streamResolver!(session.channelId, session.quality)
        if (!fresh?.manifestUrl) {
          this.onAuthExpiredCallback?.('Streaming session expired. Please sign in again.')
          return false
        }
        // Another request already refreshed while this call was in flight.
        if (session.generation !== generationAtStart) return true

        const token = hlsToken(fresh.manifestUrl)
        session.manifestUrl = fresh.manifestUrl
        session.headers = token
          ? withHdneaCookie({ ...session.headers, ...(fresh.headers ?? {}) }, token)
          : { ...session.headers, ...(fresh.headers ?? {}) }
        const licenseUrl = fresh.licenseUrl ?? session.licenseUrl
        session.licenseUrl = licenseUrl && token ? withHlsToken(licenseUrl, token) : licenseUrl
        session.generation = generationAtStart + 1
        console.log(
          `[MediaRelay] Refreshed signed URL for ${session.channelId} (generation ${session.generation})`
        )
        return true
      } catch (error) {
        console.warn(`[MediaRelay] Token refresh failed for ${session.channelId}:`, error)
        this.onAuthExpiredCallback?.('Streaming session expired. Please sign in again.')
        return false
      }
    })()

    session.refreshPromise = promise
    try {
      return await promise
    } finally {
      if (session.refreshPromise === promise) session.refreshPromise = null
    }
  }

  /**
   * Fetches an upstream URL, and if the CDN answers 401/403 refreshes the
   * session token and retries the *exact same* request once.
   */
  private async fetchWithRefresh(
    session: Session | null,
    makeTarget: () => string,
    init?: { method?: string; body?: Buffer; range?: string }
  ): Promise<{ upstream: Response; target: string }> {
    const generation = session?.generation ?? 0
    let target = makeTarget()
    let upstream = await fetchUpstream(target, this.buildUpstreamHeaders(session), init)
    if (session) this.captureRotatedToken(session, upstream)

    if (
      session &&
      (upstream.status === 401 || upstream.status === 403) &&
      (await this.refreshSession(session, generation))
    ) {
      try {
        await upstream.body?.cancel()
      } catch {
        // The body was never consumed; failing to cancel only leaks a socket.
      }
      target = makeTarget()
      console.log(
        `[MediaRelay] Retrying ${target.slice(0, 100)}… with refreshed token (session ${session.channelId})`
      )
      upstream = await fetchUpstream(target, this.buildUpstreamHeaders(session), init)
      this.captureRotatedToken(session, upstream)
      console.log(`[MediaRelay] Retry upstream status: ${upstream.status}`)
    } else if (session && (upstream.status === 401 || upstream.status === 403)) {
      this.onAuthExpiredCallback?.('Streaming session expired. Please sign in again.')
    }

    return { upstream, target }
  }

  private readCachedSegment(key: string): CachedSegment | null {
    const cached = this.segmentCache.get(key)
    if (!cached) return null
    if (Date.now() - cached.storedAt > SEGMENT_CACHE_TTL_MS) {
      this.removeCachedSegment(key)
      return null
    }
    // Refresh LRU order.
    this.segmentCache.delete(key)
    this.segmentCache.set(key, cached)
    return cached
  }

  private rememberSegment(
    key: string,
    body: Buffer,
    contentType: string,
    acceptRanges?: string
  ): void {
    if (!key || body.byteLength === 0 || body.byteLength > SEGMENT_CACHE_MAX_ITEM_BYTES) return
    // Never cache manifests, playlists, licenses or text metadata as media.
    if (/mpegurl|dash\+xml|text\/|json|xml/i.test(contentType)) return

    this.removeCachedSegment(key)
    this.segmentCache.set(key, {
      body,
      contentType: contentType || 'application/octet-stream',
      acceptRanges: acceptRanges || 'bytes',
      storedAt: Date.now()
    })
    this.segmentCacheBytes += body.byteLength

    while (
      this.segmentCache.size > SEGMENT_CACHE_MAX_ENTRIES ||
      this.segmentCacheBytes > SEGMENT_CACHE_MAX_BYTES
    ) {
      const oldest = this.segmentCache.keys().next().value as string | undefined
      if (!oldest) break
      this.removeCachedSegment(oldest)
    }
  }

  private removeCachedSegment(key: string): void {
    const existing = this.segmentCache.get(key)
    if (!existing) return
    this.segmentCache.delete(key)
    this.segmentCacheBytes = Math.max(0, this.segmentCacheBytes - existing.body.byteLength)
  }

  private sendCachedSegment(res: ServerResponse, cached: CachedSegment): void {
    const headers: Record<string, string> = {
      ...CORS_HEADERS,
      'Content-Type': cached.contentType,
      'Content-Length': String(cached.body.byteLength),
      'Accept-Ranges': cached.acceptRanges ?? 'bytes',
      'Cache-Control': 'private, max-age=30'
    }
    if (cached.contentRange) headers['Content-Range'] = cached.contentRange
    res.writeHead(200, headers)
    res.end(cached.body)
  }

  /**
   * Looks up a playback session by id.
   *
   * `/raw` requests carry the id of the session that produced them, so the
   * relay can replay that session's authenticated headers against the CDN.
   */
  private resolveSession(id: string | null): Session | null {
    if (!id) return null
    return this.sessions.get(id) ?? null
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS)
      res.end()
      return
    }

    const url = new URL(req.url ?? '/', `http://127.0.0.1:${this._port}`)
    const raw = url.pathname === '/raw'
    const streamMatch = url.pathname.match(/^\/stream\/([a-f0-9-]{36})\/(manifest|license)$/i)
    const segmentMatch = url.pathname.match(
      /^\/(?:stream\/([a-f0-9-]{36})\/seg|proxy-segment\/([a-f0-9-]{36})|proxy-segment)\/(.*)$/i
    )
    const directLicenseMatch = url.pathname.match(/^\/license(?:\/([a-f0-9-]{36}))?$/i)

    if (directLicenseMatch) {
      const id = directLicenseMatch[1] || url.searchParams.get('s') || this.lastActiveSessionId
      const session = this.resolveSession(id)
      if (!session) {
        console.warn(`[MediaRelay] Unknown license session: ${id}`)
        res.writeHead(404, CORS_HEADERS)
        res.end('Unknown license session')
        return
      }
      return this.handleLicense(req, res, session)
    }

    if (raw) {
      const target = url.searchParams.get('u')
      if (!target || !isHttpUrl(target)) {
        console.warn('[MediaRelay] /raw invalid target:', target)
        res.writeHead(400, CORS_HEADERS)
        res.end('Invalid target')
        return
      }
      const sessionId = url.searchParams.get('s')
      const session = this.resolveSession(sessionId)
      const isKey = /\.p?key(\?|$)/i.test(target) || target.includes('tv.media.jio.com')
      console.log(`[MediaRelay] /raw fetching: ${target.slice(0, 110)}... (session: ${sessionId ?? 'none'}, isKey: ${isKey})`)

      const range = typeof req.headers.range === 'string' ? req.headers.range : undefined
      const cacheKey = segmentCacheKey(target)

      // Rewinding replays immutable media already fetched once. Serving it
      // from memory avoids a second CDN call and masks short token expiry.
      if (!isKey && !range) {
        const cached = this.readCachedSegment(cacheKey)
        if (cached) {
          console.log(`[MediaRelay] /raw cache hit: ${target.slice(0, 90)}…`)
          this.sendCachedSegment(res, cached)
          return
        }
      }

      try {
        const { upstream, target: fetchTarget } = await this.fetchWithRefresh(
          session,
          () => {
            const token = session ? hlsToken(session.manifestUrl) : ''
            return token ? withHlsToken(target, token) : target
          },
          { range }
        )
        console.log(`[MediaRelay] /raw upstream status: ${upstream.status} for ${fetchTarget.slice(0, 80)}`)

        if (!upstream.ok) {
          console.warn(`[MediaRelay] /raw upstream error (${upstream.status}): ${fetchTarget}`)
          const isAuth = upstream.status === 401 || upstream.status === 403
          const statusToSend = isAuth ? 401 : upstream.status
          res.writeHead(statusToSend, {
            ...CORS_HEADERS,
            ...(isAuth ? { 'X-Auth-Required': '1', 'X-Token-Expired': '1' } : {})
          })
          res.end(`Upstream error (${upstream.status})`)
          return
        }

        if (isKey) {
          const buf = Buffer.from(await upstream.arrayBuffer())
          console.log(`[MediaRelay] AES-128 key successfully fetched! Length: ${buf.byteLength} bytes`)
          copyHeaders(upstream.headers, res)
          res.writeHead(200, CORS_HEADERS)
          res.end(buf)
          return
        }

        const contentType = upstream.headers.get('content-type') ?? ''
        if (contentType.includes('mpegurl') || /\.m3u8(\?|$)/i.test(fetchTarget)) {
          // Nested HLS playlists must be rewritten too, not passed through raw.
          const text = await upstream.text()
          res.writeHead(200, {
            ...CORS_HEADERS,
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Cache-Control': 'no-store'
          })
          res.end(rewriteHls(text, fetchTarget, req, session?.id ?? ''))
          return
        }

        const body = Buffer.from(await upstream.arrayBuffer())
        if (!range && upstream.status === 200) {
          this.rememberSegment(
            cacheKey,
            body,
            contentType,
            upstream.headers.get('accept-ranges') ?? undefined
          )
        }

        copyHeaders(upstream.headers, res)
        res.writeHead(upstream.status, CORS_HEADERS)
        res.end(body)
        return
      } catch (error) {
        console.warn(`[MediaRelay] /raw request failed: ${target.slice(0, 110)}`, error)
        if (!res.headersSent) res.writeHead(502, CORS_HEADERS)
        res.end('Upstream request failed')
        return
      }
    }

    if (segmentMatch) {
      const segId = segmentMatch[1] || segmentMatch[2] || url.searchParams.get('s') || this.lastActiveSessionId
      const rest = segmentMatch[3]
      const session = this.resolveSession(segId)
      if (!session) {
        console.warn(`[MediaRelay] Unknown segment session: ${segId}`)
        res.writeHead(404, CORS_HEADERS)
        res.end('Unknown segment session')
        return
      }
      this.lastActiveSessionId = session.id

      // Re-resolved on every retry so a refreshed manifest URL contributes
      // its new query parameters/token.
      const buildSegmentTarget = (): string => {
        let rawRest = rest
        if (/^https?:\/+[^\/]/i.test(rawRest)) {
          rawRest = rawRest.replace(/^(https?):\/+([^\/])/, '$1://$2')
        }

        let target: string
        if (/^https?:\/\//i.test(rawRest)) {
          target = rawRest
        } else if (rawRest.startsWith('bpk-tv/') || rawRest.startsWith('/bpk-tv/')) {
          const base = session.segmentBase || new URL('.', session.manifestUrl).href
          const cdnOrigin = new URL(base).origin
          target = new URL(rawRest.replace(/^\/+/, ''), cdnOrigin + '/').href
        } else {
          const base = session.segmentBase || new URL('.', session.manifestUrl).href
          target = new URL(rawRest, base).href
        }

        // Preserve query params from incoming request and from session.manifestUrl
        try {
          const targetUrl = new URL(target)
          if (url.search) {
            for (const [k, v] of url.searchParams.entries()) {
              if (!targetUrl.searchParams.has(k)) targetUrl.searchParams.set(k, v)
            }
          }
          const manifestParsed = new URL(session.manifestUrl)
          for (const [k, v] of manifestParsed.searchParams.entries()) {
            if (!targetUrl.searchParams.has(k)) targetUrl.searchParams.set(k, v)
          }
          target = targetUrl.href
        } catch {
          // ignore
        }
        return target
      }

      const targetWithToken = (): string => {
        const target = buildSegmentTarget()
        const token = hlsToken(session.manifestUrl)
        return token ? withHlsToken(target, token) : target
      }

      const requestedTarget = targetWithToken()
      if (!isHttpUrl(requestedTarget)) {
        console.warn(`[MediaRelay] Invalid segment target: ${requestedTarget}`)
        res.writeHead(400, CORS_HEADERS)
        res.end('Invalid segment')
        return
      }

      const range = typeof req.headers.range === 'string' ? req.headers.range : undefined
      const cacheKey = segmentCacheKey(requestedTarget)
      if (!range) {
        const cached = this.readCachedSegment(cacheKey)
        if (cached) {
          console.log(`[MediaRelay] /seg cache hit: ${cacheKey.slice(0, 100)}…`)
          this.sendCachedSegment(res, cached)
          return
        }
      }

      console.log(`[MediaRelay] /seg fetching: ${requestedTarget.slice(0, 110)}...`)
      try {
        // Never reject a past segment just because it is behind the live
        // edge — Jio's CDN keeps the window advertised by timeShiftBufferDepth.
        const { upstream, target } = await this.fetchWithRefresh(
          session,
          targetWithToken,
          { range }
        )
        console.log(`[MediaRelay] /seg upstream status: ${upstream.status}`)

        if (!upstream.ok) {
          console.warn(`[MediaRelay] /seg upstream error (${upstream.status}): ${target}`)
          const isAuth = upstream.status === 401 || upstream.status === 403
          const statusToSend = isAuth ? 401 : upstream.status
          res.writeHead(statusToSend, {
            ...CORS_HEADERS,
            ...(isAuth ? { 'X-Auth-Required': '1', 'X-Token-Expired': '1' } : {})
          })
          res.end(`Upstream error (${upstream.status})`)
          return
        }

        const body = Buffer.from(await upstream.arrayBuffer())
        if (!range && upstream.status === 200) {
          this.rememberSegment(
            cacheKey,
            body,
            upstream.headers.get('content-type') ?? '',
            upstream.headers.get('accept-ranges') ?? undefined
          )
        }

        copyHeaders(upstream.headers, res)
        res.writeHead(upstream.status, CORS_HEADERS)
        res.end(body)
        return
      } catch (error) {
        console.warn(`[MediaRelay] /seg request failed: ${requestedTarget.slice(0, 110)}`, error)
        if (!res.headersSent) res.writeHead(502, CORS_HEADERS)
        res.end('Upstream request failed')
        return
      }
    }

    // /dashtime — used by Shaka's clockSyncUri to sync the live edge from
    // server time rather than the (potentially skewed) client clock.
    // Mirrors jiotv_go's /dashtime endpoint exactly.
    if (url.pathname === '/dashtime') {
      const now = new Date().toISOString()
      res.writeHead(200, {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache',
        'Date': new Date().toUTCString()
      })
      res.end(JSON.stringify({ time: now }))
      return
    }

    // /logo or /logo/:channelId — proxy Jio's channel logo CDN images and normalize with sharp
    // to a uniform 256x256 square canvas with transparent padding.
    const logoMatch = url.pathname.match(/^\/logo(?:\/([^/?#]+))?$/)
    if (logoMatch) {
      const channelId = logoMatch[1] ? decodeURIComponent(logoMatch[1]) : ''
      const queryUrl = url.searchParams.get('url') || ''
      const queryFile = url.searchParams.get('file') || ''

      const target = await this.resolveLogoTarget(channelId, queryUrl, queryFile)

      if (!target) {
        res.writeHead(400, CORS_HEADERS)
        res.end('Missing channelId, url, or file param')
        return
      }

      // Check in-memory cache for fast sub-millisecond delivery
      const cached = this.normalizedLogoCache.get(target)
      if (cached) {
        res.writeHead(200, {
          ...CORS_HEADERS,
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=604800, immutable',
          'Content-Length': String(cached.length)
        })
        res.end(cached)
        return
      }

      try {
        const upstream = await fetch(target, {
          headers: {
            'User-Agent': 'okhttp/4.9.0',
            'Accept': 'image/webp,image/png,image/*,*/*',
            'Referer': 'https://jiotv.com/'
          }
        })
        if (!upstream.ok) {
          res.writeHead(upstream.status, CORS_HEADERS)
          res.end('Logo not found')
          return
        }

        const originalBuffer = Buffer.from(await upstream.arrayBuffer())
        let finalBuffer = originalBuffer
        let contentType = 'image/png'

        try {
          finalBuffer = await sharp(originalBuffer)
            .trim()
            .resize(240, 240, {
              fit: 'contain',
              background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .extend({
              top: 8,
              bottom: 8,
              left: 8,
              right: 8,
              background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .png()
            .toBuffer()
        } catch (normErr) {
          console.warn('[MediaRelay] sharp normalization skipped/failed:', normErr)
          contentType = upstream.headers.get('content-type') || 'image/png'
        }

        if (this.normalizedLogoCache.size < 2000) {
          this.normalizedLogoCache.set(target, finalBuffer)
          if (channelId) {
            this.normalizedLogoCache.set(channelId.toLowerCase(), finalBuffer)
          }
        }

        res.writeHead(200, {
          ...CORS_HEADERS,
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=604800, immutable',
          'Content-Length': String(finalBuffer.length)
        })
        res.end(finalBuffer)
      } catch (err) {
        res.writeHead(502, CORS_HEADERS)
        res.end('Logo fetch failed')
      }
      return
    }

    if (!streamMatch) {
      console.warn(`[MediaRelay] Not found: ${url.pathname}`)
      res.writeHead(404, CORS_HEADERS)
      res.end('Not found')
      return
    }

    const [, id, action] = streamMatch
    const session = this.sessions.get(id)
    if (!session) {
      console.warn(`[MediaRelay] Unknown playback session: ${id}`)
      res.writeHead(404, CORS_HEADERS)
      res.end('Unknown playback session')
      return
    }

    if (action === 'license') {
      return this.handleLicense(req, res, session)
    }

    if (action === 'manifest') {
      console.log(`[MediaRelay] /manifest fetching upstream: ${session.manifestUrl.slice(0, 110)}...`)
      this.lastActiveSessionId = id
      let upstream: Response
      try {
        const result = await this.fetchWithRefresh(session, () => session.manifestUrl)
        upstream = result.upstream
      } catch (error) {
        console.warn(`[MediaRelay] /manifest request failed for ${session.channelId}`, error)
        if (!res.headersSent) res.writeHead(502, CORS_HEADERS)
        res.end('Upstream manifest request failed')
        return
      }
      console.log(`[MediaRelay] /manifest upstream status: ${upstream.status} (${upstream.headers.get('content-type')})`)

      if (!upstream.ok) {
        console.warn(`[MediaRelay] Upstream manifest error: ${upstream.status}`)
        const isAuth = upstream.status === 401 || upstream.status === 403
        const statusToSend = isAuth ? 401 : upstream.status
        res.writeHead(statusToSend, {
          ...CORS_HEADERS,
          ...(isAuth ? { 'X-Auth-Required': '1', 'X-Token-Expired': '1' } : {})
        })
        res.end(`Upstream manifest error (${upstream.status})`)
        return
      }
      const contentType = upstream.headers.get('content-type') ?? ''
      const text = await upstream.text()
      const isMpd =
        contentType.includes('dash') || text.trimStart().startsWith('<?xml') || text.includes('<MPD')
      let rewritten: string
      if (isMpd) {
        const localBase = `http://${req.headers.host}/proxy-segment/${id}/`
        const result = rewriteMpd(text, session.manifestUrl, localBase, req, id)
        session.segmentBase = result.segmentBase
        rewritten = result.xml
      } else {
        rewritten = rewriteHls(text, session.manifestUrl, req, id)
      }
      res.writeHead(200, {
        ...CORS_HEADERS,
        'Content-Type': isMpd ? 'application/dash+xml' : 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-store'
      })
      res.end(rewritten)
      return
    }
  }

  /**
   * Proxies Widevine license requests: forwards the raw challenge, attaches required
   * authentication tokens, strips browser CORS headers, and mirrors response bytes.
   */
  private async handleLicense(
    req: IncomingMessage,
    res: ServerResponse,
    session: Session
  ): Promise<void> {
    if (!session.licenseUrl) {
      session.licenseUrl = 'https://tv.media.jio.com/proxy?provider=reliance'
    }
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    const body = Buffer.concat(chunks)

    let targetLicenseUrl = session.licenseUrl
    const token = hlsToken(session.manifestUrl)
    if (token) {
      targetLicenseUrl = withHlsToken(targetLicenseUrl, token)
    }

    // Build license headers with case-insensitive normalization so conflicting casings are avoided
    const licenseHeaders: Record<string, string> = {}
    const setHeader = (name: string, value: string): void => {
      const lower = name.toLowerCase()
      for (const k of Object.keys(licenseHeaders)) {
        if (k.toLowerCase() === lower) delete licenseHeaders[k]
      }
      licenseHeaders[name] = value
    }

    // 1. Start with session headers (credentials, device info, etc.)
    for (const [k, v] of Object.entries(session.headers)) {
      setHeader(k, v)
    }

    // 2. Forward headers sent by client / Shaka Player (excluding hop-by-hop & loopback host)
    for (const [k, v] of Object.entries(req.headers)) {
      const lower = k.toLowerCase()
      if (['host', 'connection', 'content-length', 'accept-encoding'].includes(lower)) continue
      if (lower.startsWith('sec-fetch-') || lower.startsWith('sec-ch-ua')) continue
      if (typeof v === 'string') {
        setHeader(k, v)
      }
    }

    // 3. Ensure required JioTV / Widevine headers are properly set
    setHeader('Content-Type', 'application/octet-stream')

    // Origin and Referer: must point to JioTV web player domain.
    // If incoming origin/referer was localhost/127.0.0.1 or missing, sanitize to official Jio domain.
    const incomingOrigin = req.headers['origin'] as string | undefined
    if (incomingOrigin && incomingOrigin.startsWith('https://www.jiotv.com')) {
      setHeader('Origin', incomingOrigin)
    } else {
      setHeader('Origin', 'https://www.jiotv.com')
    }

    const incomingReferer = req.headers['referer'] as string | undefined
    if (incomingReferer && incomingReferer.startsWith('https://www.jiotv.com')) {
      setHeader('Referer', incomingReferer)
    } else {
      setHeader('Referer', 'https://www.jiotv.com/')
    }

    // User-Agent: prefer browser UA sent by Shaka / client or fallback to standard Chrome UA
    const clientUa = (req.headers['user-agent'] as string | undefined) || (session.headers['User-Agent'] as string | undefined)
    if (clientUa && !clientUa.includes('plaYtv') && !clientUa.includes('ExoPlayer')) {
      setHeader('User-Agent', clientUa)
    } else {
      setHeader(
        'User-Agent',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      )
    }

    // Ensure authorization & session tokens are present
    if (session.headers.accessToken) {
      setHeader('Authorization', `Bearer ${session.headers.accessToken}`)
      setHeader('accesstoken', session.headers.accessToken)
    }
    if (session.headers.ssotoken) {
      setHeader('ssotoken', session.headers.ssotoken)
    }
    if (session.channelId) {
      setHeader('channelid', session.channelId)
      setHeader('channelId', session.channelId)
    }
    if (session.headers.crmid) {
      setHeader('crmid', session.headers.crmid)
      setHeader('subscriberId', session.headers.crmid)
    }
    if (session.headers.deviceId) {
      setHeader('deviceId', session.headers.deviceId)
    }
    if (session.headers.uniqueId) {
      setHeader('uniqueId', session.headers.uniqueId)
    }
    setHeader('appName', 'RJIL_JioTV')
    setHeader('os', 'android')
    setHeader('devicetype', 'phone')
    setHeader('versionCode', '422')
    setHeader('usergroup', 'tvYR7NSNn7rymo3F')
    setHeader('osVersion', '13')
    setHeader('srno', session.headers.srno || new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14))

    // Attach __hdnea__ cookie if token is present
    if (token) {
      const withCookie = withHdneaCookie(licenseHeaders, token)
      for (const [k, v] of Object.entries(withCookie)) {
        setHeader(k, v)
      }
    }

    // Query manifest HEAD for CDN session cookies (like JioTV-Go does)
    try {
      const head = await fetch(session.manifestUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': licenseHeaders['User-Agent'] || PLAYER_UA,
          ...session.headers
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(8_000)
      })
      const cookie = head.headers.get('set-cookie')
      if (cookie) {
        const headCookie = cookie.split(';')[0]
        const currentCookie = licenseHeaders['Cookie'] || licenseHeaders['cookie'] || ''
        setHeader('Cookie', currentCookie ? `${currentCookie}; ${headCookie}` : headCookie)
      }
    } catch {
      // Non-fatal if CDN rejects HEAD
    }

    console.log(`[MediaRelay] /license requesting upstream: ${targetLicenseUrl}`)
    console.log('[MediaRelay] License request headers:', JSON.stringify(licenseHeaders, null, 2))

    const licenseGeneration = session.generation
    let upstream = await fetch(targetLicenseUrl, {
      method: 'POST',
      headers: licenseHeaders,
      body,
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000)
    })

    // A paused player can hold an old license URL/token long enough for it to
    // expire. Refresh once and replay the identical challenge bytes.
    if (
      (upstream.status === 401 || upstream.status === 403) &&
      (await this.refreshSession(session, licenseGeneration))
    ) {
      const freshToken = hlsToken(session.manifestUrl)
      if (freshToken) {
        const refreshedCookies = withHdneaCookie(licenseHeaders, freshToken)
        const cookie = refreshedCookies.Cookie || refreshedCookies.cookie
        if (cookie) setHeader('Cookie', cookie)
      }
      if (session.headers.accessToken) {
        setHeader('Authorization', `Bearer ${session.headers.accessToken}`)
        setHeader('accesstoken', session.headers.accessToken)
      }
      if (session.headers.ssotoken) setHeader('ssotoken', session.headers.ssotoken)

      targetLicenseUrl = session.licenseUrl || targetLicenseUrl
      if (freshToken) targetLicenseUrl = withHlsToken(targetLicenseUrl, freshToken)
      console.log(`[MediaRelay] Retrying license request with refreshed token: ${targetLicenseUrl}`)
      upstream = await fetch(targetLicenseUrl, {
        method: 'POST',
        headers: licenseHeaders,
        body,
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000)
      })
    }

    console.log(`[MediaRelay] /license upstream status: ${upstream.status}`)

    if (!upstream.ok) {
      if (upstream.status === 401 || upstream.status === 403) {
        this.onAuthExpiredCallback?.('DRM license authorization failed. Please sign in again.')
      }
      try {
        const textPreview = await upstream.clone().text()
        console.warn(`[MediaRelay] /license upstream error body (HTTP ${upstream.status}):`, textPreview.slice(0, 500))
      } catch {
        /* ignore */
      }
    }

    copyHeaders(upstream.headers, res)
    const isAuth = upstream.status === 401 || upstream.status === 403
    const licenseStatus = isAuth ? 401 : upstream.status
    res.writeHead(licenseStatus, {
      ...CORS_HEADERS,
      ...(isAuth ? { 'X-Auth-Required': '1', 'X-Token-Expired': '1' } : {})
    })
    res.end(Buffer.from(await upstream.arrayBuffer()))
  }
}
