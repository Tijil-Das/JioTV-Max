import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'

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

const PLAYER_UA = 'plaYtv/7.1.8 (Linux;Android 8.1.0) ExoPlayerLib/2.11.7'

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

function proxify(rawUrl: string, request: IncomingMessage): string {
  const host = request.headers.host
  return `http://${host}/raw?u=${encodeURIComponent(rawUrl)}`
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
  request: IncomingMessage
): { xml: string; segmentBase: string } {
  const baseMatch = xml.match(/<BaseURL[^>]*>([\s\S]*?)<\/BaseURL>/i)
  const segmentBase = baseMatch ? new URL(baseMatch[1].trim(), manifestUrl).href : manifestUrl
  let output = xml.replace(/<BaseURL[^>]*>[\s\S]*?<\/BaseURL>/gi, '')
  output = output.replace(/<Location[^>]*>[\s\S]*?<\/Location>/gi, '')
  output = output.replace(
    /(media|initialization|sourceURL|href|index)="([^"]+)"/g,
    (full, attr: string, value: string) => {
      if (!value || value.startsWith('data:') || value.includes('127.0.0.1')) return full
      // Leave relative templates alone: they resolve against the injected
      // local BaseURL, so DASH's own placeholder expansion stays intact.
      if (value.includes('$') && !/^https?:/i.test(value)) return full
      if (value.includes('$')) {
        // Absolute templated URLs are rare. Keep them intact rather than
        // corrupting the placeholders; if the CDN allows CORS they still play.
        return full
      }
      let resolved: string
      try {
        resolved = /^https?:/i.test(value) ? value : new URL(value, segmentBase).href
      } catch {
        return full
      }
      if (!isHttpUrl(resolved)) return full
      return `${attr}="${proxify(resolved, request)}"`
    }
  )
  // Inject the relay base immediately after the opening MPD tag.
  output = output.replace(/(<MPD\b[^>]*>)/i, `$1<BaseURL>${localBase}</BaseURL>`)
  return { xml: output, segmentBase }
}

/** HLS playlists: rewrite every media URI and key/map URI. */
function rewriteHls(playlist: string, manifestUrl: string, request: IncomingMessage): string {
  const lines = playlist.split(/\r?\n/)
  const resolved = lines.map((line) => {
    const trimmed = line.trim()
    if (!trimmed) return line
    if (trimmed.startsWith('#')) {
      return line.replace(/URI="([^"]+)"/, (full, uri: string) => {
        if (!isHttpUrl(new URL(uri, manifestUrl).href)) return full
        return `URI="${proxify(new URL(uri, manifestUrl).href, request)}"`
      })
    }
    const absolute = new URL(trimmed, manifestUrl).href
    return isHttpUrl(absolute) ? proxify(absolute, request) : line
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
  private readonly sessions = new Map<string, Session>()

  get running(): boolean {
    return this.server !== null
  }

  async start(): Promise<void> {
    if (this.server) return
    this.server = createServer((req, res) => {
      void this.handle(req, res).catch((error: unknown) => {
        if (!res.headersSent) res.writeHead(502, CORS_HEADERS)
        res.end(error instanceof Error ? error.message : 'Relay error')
      })
    })
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(0, '127.0.0.1', () => {
        const address = this.server!.address()
        this.port = typeof address === 'object' && address ? address.port : 0
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    this.sessions.clear()
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
  }): { manifestUrl: string; licenseUrl?: string } {
    if (!this.port) throw new Error('Media relay is not running')
    const id = randomUUID()
    this.sessions.set(id, {
      channelId: input.channelId,
      manifestUrl: input.manifestUrl,
      licenseUrl: input.licenseUrl,
      headers: input.headers ?? {}
    })
    const base = `http://127.0.0.1:${this.port}/stream/${id}`
    return {
      manifestUrl: `${base}/manifest`,
      licenseUrl: input.licenseUrl ? `${base}/license` : undefined
    }
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS)
      res.end()
      return
    }

    const url = new URL(req.url ?? '/', `http://127.0.0.1:${this.port}`)
    const streamMatch = url.pathname.match(/^\/stream\/([a-f0-9-]{36})\/(manifest|license)$/i)
    const segmentMatch = url.pathname.match(/^\/stream\/([a-f0-9-]{36})\/seg\/(.*)$/i)
    const raw = url.pathname === '/raw'

    if (raw) {
      const target = url.searchParams.get('u')
      if (!target || !isHttpUrl(target)) {
        res.writeHead(400, CORS_HEADERS)
        res.end('Invalid target')
        return
      }
      const range = typeof req.headers.range === 'string' ? req.headers.range : undefined
      const upstream = await fetchUpstream(target, {}, { range })
      const contentType = upstream.headers.get('content-type') ?? ''
      if (contentType.includes('mpegurl') || /\.m3u8(\?|$)/i.test(target)) {
        // Nested HLS playlists must be rewritten too, not passed through raw.
        const text = await upstream.text()
        res.writeHead(200, {
          ...CORS_HEADERS,
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-store'
        })
        res.end(rewriteHls(text, target, req))
        return
      }
      copyHeaders(upstream.headers, res)
      res.writeHead(upstream.status, CORS_HEADERS)
      res.end(Buffer.from(await upstream.arrayBuffer()))
      return
    }

    if (segmentMatch) {
      const [, segId, rest] = segmentMatch
      const session = this.sessions.get(segId)
      if (!session?.segmentBase) {
        res.writeHead(404, CORS_HEADERS)
        res.end('Unknown segment session')
        return
      }
      const target = new URL(rest + url.search, session.segmentBase).href
      if (!isHttpUrl(target)) {
        res.writeHead(400, CORS_HEADERS)
        res.end('Invalid segment')
        return
      }
      const range = typeof req.headers.range === 'string' ? req.headers.range : undefined
      const upstream = await fetchUpstream(target, session.headers, { range })
      copyHeaders(upstream.headers, res)
      res.writeHead(upstream.status, CORS_HEADERS)
      res.end(Buffer.from(await upstream.arrayBuffer()))
      return
    }

    if (!streamMatch) {
      res.writeHead(404, CORS_HEADERS)
      res.end('Not found')
      return
    }

    const [, id, action] = streamMatch
    const session = this.sessions.get(id)
    if (!session) {
      res.writeHead(404, CORS_HEADERS)
      res.end('Unknown playback session')
      return
    }

    if (action === 'manifest') {
      const upstream = await fetchUpstream(session.manifestUrl, session.headers)
      if (!upstream.ok) {
        res.writeHead(upstream.status, CORS_HEADERS)
        res.end(`Upstream manifest error (${upstream.status})`)
        return
      }
      const contentType = upstream.headers.get('content-type') ?? ''
      const text = await upstream.text()
      const isMpd =
        contentType.includes('dash') || text.trimStart().startsWith('<?xml') || text.includes('<MPD')
      let rewritten: string
      if (isMpd) {
        const localBase = `http://${req.headers.host}/stream/${id}/seg/`
        const result = rewriteMpd(text, session.manifestUrl, localBase, req)
        session.segmentBase = result.segmentBase
        rewritten = result.xml
      } else {
        rewritten = rewriteHls(text, session.manifestUrl, req)
      }
      res.writeHead(200, {
        ...CORS_HEADERS,
        'Content-Type': isMpd ? 'application/dash+xml' : 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-store'
      })
      res.end(rewritten)
      return
    }

    // Widevine license: forward the raw challenge and mirror the response.
    if (!session.licenseUrl) {
      res.writeHead(404, CORS_HEADERS)
      res.end('No license endpoint for this channel')
      return
    }
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    const body = Buffer.concat(chunks)

    // Jio license endpoints expect cookies seeded by a HEAD to the channel URL.
    const licenseHeaders: Record<string, string> = {
      ...session.headers,
      'Content-Type': 'application/octet-stream'
    }
    try {
      const head = await fetch(session.manifestUrl, {
        method: 'HEAD',
        headers: { 'User-Agent': PLAYER_UA, ...session.headers },
        redirect: 'follow',
        signal: AbortSignal.timeout(8_000)
      })
      const cookie = head.headers.get('set-cookie')
      if (cookie) licenseHeaders.Cookie = cookie.split(';')[0]
    } catch {
      // A HEAD failure is non-fatal; some CDNs reject HEAD.
    }

    const upstream = await fetch(session.licenseUrl, {
      method: 'POST',
      headers: licenseHeaders,
      body,
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000)
    })
    copyHeaders(upstream.headers, res)
    res.writeHead(upstream.status, CORS_HEADERS)
    res.end(Buffer.from(await upstream.arrayBuffer()))
  }
}
