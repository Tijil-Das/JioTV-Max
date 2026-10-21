import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { PLAYER_UA, withHdneaCookie, extractHdnea } from './jio-headers'

/**
 * A tiny loopback media relay.
 *
 * Jio's manifests and Widevine endpoints require Android-app request headers,
 * cookies and (often) no CORS. Rather than weakening the BrowserWindow with
 * `webSecurity: false`, we register a playback session and route only that
 * session's manifest, segments and license through 127.0.0.1. The server binds
 * to an ephemeral port and is reachable only from this machine.
 */

interface Session {
  channelId: string
  manifestUrl: string
  licenseUrl?: string
  headers: Record<string, string>
  /** Effective base URL for relative DASH segments after manifest parsing. */
  segmentBase?: string
}

/** A registered playback session plus the URLs the renderer should use. */
export interface RelaySession {
  /** Opaque session id used to authenticate `/raw` requests. */
  id: string
  manifestUrl: string
  licenseUrl?: string
}


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

function withHlsToken(rawUrl: string, token: string): string {
  if (!token) return rawUrl
  try {
    const parsed = new URL(rawUrl)
    if (!parsed.searchParams.has('__hdnea__') && !parsed.searchParams.has('hdnea')) {
      parsed.searchParams.set('__hdnea__', token)
    }
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

export class MediaRelay {
  private server: Server | null = null
  private port = 0
  private lastActiveSessionId: string | null = null
  private readonly sessions = new Map<string, Session>()

  get running(): boolean {
    return this.server !== null
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
        this.port = typeof address === 'object' && address ? address.port : 0
        console.log(`[MediaRelay] Server running on 127.0.0.1:${this.port}`)
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    this.sessions.clear()
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
  }): RelaySession {
    if (!this.port) throw new Error('Media relay is not running')
    const id = randomUUID()
    this.lastActiveSessionId = id
    this.sessions.set(id, {
      channelId: input.channelId,
      manifestUrl: input.manifestUrl,
      licenseUrl: input.licenseUrl,
      headers: input.headers ?? {}
    })
    console.log(`[MediaRelay] Registered session ${id} for channel ${input.channelId}`)
    const base = `http://127.0.0.1:${this.port}/stream/${id}`
    return {
      id,
      manifestUrl: `${base}/manifest`,
      licenseUrl: `${base}/license`
    }
  }

  /**
   * Looks up a playback session by id.
   *
   * `/raw` requests carry the id of the session that produced them, so the
   * relay can replay that session's authenticated headers against the CDN.
   */
  private resolveSession(id: string | null): (Session & { id: string }) | null {
    if (!id) return null
    const session = this.sessions.get(id)
    return session ? { ...session, id } : null
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS)
      res.end()
      return
    }

    const url = new URL(req.url ?? '/', `http://127.0.0.1:${this.port}`)
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

      const upstreamHeaders: Record<string, string> = {
        ...(session?.headers ?? {})
      }
      if (session?.channelId) {
        upstreamHeaders.channelId = session.channelId
      }
      if (!upstreamHeaders.srno) {
        upstreamHeaders.srno = '230203144000'
      }

      const token = session ? hlsToken(session.manifestUrl) : ''
      let fetchTarget = target
      if (token) {
        fetchTarget = withHlsToken(fetchTarget, token)
        Object.assign(upstreamHeaders, withHdneaCookie(upstreamHeaders, token))
      }

      const upstream = await fetchUpstream(fetchTarget, upstreamHeaders, {
        range: typeof req.headers.range === 'string' ? req.headers.range : undefined
      })
      console.log(`[MediaRelay] /raw upstream status: ${upstream.status} for ${fetchTarget.slice(0, 80)}`)

      // Capture upstream rotated __hdnea__ cookie if present
      const setCookie = upstream.headers.get('set-cookie')
      if (setCookie && session) {
        const match = setCookie.match(/__hdnea__=([^;]+)/)
        if (match) {
          console.log(`[MediaRelay] Upstream updated __hdnea__ cookie: ${match[1].slice(0, 30)}...`)
          session.headers = withHdneaCookie(session.headers, match[1])
          session.manifestUrl = withHlsToken(session.manifestUrl, match[1])
        }
      }

      if (!upstream.ok) {
        console.warn(`[MediaRelay] /raw upstream error (${upstream.status}): ${fetchTarget}`)
        const statusToSend = (upstream.status === 401 || upstream.status === 403) ? 502 : upstream.status
        res.writeHead(statusToSend, CORS_HEADERS)
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

      copyHeaders(upstream.headers, res)
      res.writeHead(upstream.status, CORS_HEADERS)
      res.end(Buffer.from(await upstream.arrayBuffer()))
      return
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

      if (!isHttpUrl(target)) {
        console.warn(`[MediaRelay] Invalid segment target: ${target}`)
        res.writeHead(400, CORS_HEADERS)
        res.end('Invalid segment')
        return
      }
      const token = hlsToken(session.manifestUrl)
      if (token) {
        target = withHlsToken(target, token)
      }
      console.log(`[MediaRelay] /seg fetching: ${target.slice(0, 110)}...`)
      const range = typeof req.headers.range === 'string' ? req.headers.range : undefined
      const upstreamHeaders: Record<string, string> = {
        ...session.headers
      }
      if (session.channelId) {
        upstreamHeaders.channelId = session.channelId
      }
      if (!upstreamHeaders.srno) {
        upstreamHeaders.srno = '230203144000'
      }
      if (token) {
        Object.assign(upstreamHeaders, withHdneaCookie(upstreamHeaders, token))
      }
      const upstream = await fetchUpstream(target, upstreamHeaders, { range })
      console.log(`[MediaRelay] /seg upstream status: ${upstream.status}`)

      const setCookie = upstream.headers.get('set-cookie')
      if (setCookie) {
        const match = setCookie.match(/__hdnea__=([^;]+)/)
        if (match) {
          session.headers = withHdneaCookie(session.headers, match[1])
          session.manifestUrl = withHlsToken(session.manifestUrl, match[1])
        }
      }

      if (!upstream.ok) {
        console.warn(`[MediaRelay] /seg upstream error (${upstream.status}): ${target}`)
        const statusToSend = (upstream.status === 401 || upstream.status === 403) ? 502 : upstream.status
        res.writeHead(statusToSend, CORS_HEADERS)
        res.end(`Upstream error (${upstream.status})`)
        return
      }

      copyHeaders(upstream.headers, res)
      res.writeHead(upstream.status, CORS_HEADERS)
      res.end(Buffer.from(await upstream.arrayBuffer()))
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
      return this.handleLicense(req, res, { ...session, id })
    }

    if (action === 'manifest') {
      console.log(`[MediaRelay] /manifest fetching upstream: ${session.manifestUrl.slice(0, 110)}...`)
      this.lastActiveSessionId = id
      const upstream = await fetchUpstream(session.manifestUrl, session.headers)
      console.log(`[MediaRelay] /manifest upstream status: ${upstream.status} (${upstream.headers.get('content-type')})`)

      const setCookie = upstream.headers.get('set-cookie')
      if (setCookie) {
        const match = setCookie.match(/__hdnea__=([^;]+)/)
        if (match) {
          console.log(`[MediaRelay] Manifest rotated __hdnea__ cookie: ${match[1].slice(0, 30)}...`)
          session.headers = withHdneaCookie(session.headers, match[1])
          session.manifestUrl = withHlsToken(session.manifestUrl, match[1])
        }
      }

      if (!upstream.ok) {
        console.warn(`[MediaRelay] Upstream manifest error: ${upstream.status}`)
        const statusToSend = (upstream.status === 401 || upstream.status === 403) ? 502 : upstream.status
        res.writeHead(statusToSend, CORS_HEADERS)
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
    session: Session & { id: string }
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

    const upstream = await fetch(targetLicenseUrl, {
      method: 'POST',
      headers: licenseHeaders,
      body,
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000)
    })

    console.log(`[MediaRelay] /license upstream status: ${upstream.status}`)

    if (!upstream.ok) {
      try {
        const textPreview = await upstream.clone().text()
        console.warn(`[MediaRelay] /license upstream error body (HTTP ${upstream.status}):`, textPreview.slice(0, 500))
      } catch {
        /* ignore */
      }
    }

    copyHeaders(upstream.headers, res)
    res.writeHead(upstream.status, CORS_HEADERS)
    res.end(Buffer.from(await upstream.arrayBuffer()))
  }
}
