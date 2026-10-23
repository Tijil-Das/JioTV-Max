import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import https from 'node:https'
import { randomBytes } from 'node:crypto'
import { type Socket } from 'node:net'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import QRCode from 'qrcode'
import type { CastMediaInput, FallbackReceiverInfo } from '@shared/cast-types'
import { getLanIpAddress } from './network-utils'
import { castLogger } from './logger'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Accept, Accept-Encoding, User-Agent, Origin, Content-Type',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type',
  'Access-Control-Max-Age': '86400'
}

interface StreamSession {
  token: string
  media: CastMediaInput
  targetDeviceIp?: string
  createdAt: number
}

export interface LiveRelayState {
  mimeType: string
  initChunk: Buffer | null
  clients: Set<ServerResponse>
}

export class StreamServer {
  private server: http.Server | null = null
  private port = 0
  private readonly sockets = new Set<Socket>()
  private activeSession: StreamSession | null = null
  private hlsLibCache: string | null = null
  private readonly liveRelays = new Map<string, LiveRelayState>()

  constructor() {
    this.preloadHlsLib()
  }

  private preloadHlsLib(): void {
    const candidatePaths = [
      path.join(process.cwd(), 'node_modules/hls.js/dist/hls.min.js'),
      path.join(__dirname, '../../node_modules/hls.js/dist/hls.min.js'),
      path.join(__dirname, '../node_modules/hls.js/dist/hls.min.js')
    ]
    for (const p of candidatePaths) {
      if (existsSync(p)) {
        try {
          this.hlsLibCache = readFileSync(p, 'utf-8')
          break
        } catch {}
      }
    }
  }

  public async start(): Promise<number> {
    if (this.server && this.port > 0) return this.port

    return new Promise<number>((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res))

      this.server.on('connection', (socket) => {
        this.sockets.add(socket)
        socket.on('close', () => this.sockets.delete(socket))
      })

      this.server.on('error', (err) => {
        castLogger.error('[StreamServer] Server error:', err)
        reject(err)
      })

      // Bind to 0.0.0.0 on random free port
      this.server.listen(0, '0.0.0.0', () => {
        const addr = this.server?.address()
        this.port = typeof addr === 'object' && addr ? addr.port : 0
        castLogger.info(`[StreamServer] Listening on 0.0.0.0:${this.port}`)
        resolve(this.port)
      })
    })
  }

  public async stop(): Promise<void> {
    this.activeSession = null
    for (const socket of this.sockets) {
      try {
        socket.destroy()
      } catch {}
    }
    this.sockets.clear()

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server?.close(() => resolve())
        this.server = null
      })
      this.port = 0
      castLogger.info('[StreamServer] Stopped and released port')
    }
  }

  public async startSession(media: CastMediaInput, targetDeviceIp?: string): Promise<string> {
    await this.start()
    const token = randomBytes(16).toString('hex')
    this.activeSession = {
      token,
      media,
      targetDeviceIp,
      createdAt: Date.now()
    }
    castLogger.info(`[StreamServer] Created session token: ${token} for media: "${media.title}"`)

    if (media.isDecryptedRelay) {
      this.startLiveRelay(token, media.contentType || 'video/mp4')
    }

    return token
  }

  public async stopSession(): Promise<void> {
    castLogger.info('[StreamServer] Ending active session')
    if (this.activeSession) {
      this.stopLiveRelay(this.activeSession.token)
    }
    this.activeSession = null
    await this.stop()
  }

  public startLiveRelay(token: string, mimeType = 'video/mp4'): void {
    castLogger.info(`[StreamServer] Starting live decrypted relay for token: ${token}, mimeType: ${mimeType}`)
    const existing = this.liveRelays.get(token)
    if (existing) {
      existing.mimeType = mimeType
      return
    }
    this.liveRelays.set(token, {
      mimeType,
      initChunk: null,
      clients: new Set()
    })
  }

  public feedChunk(chunk: Buffer, token?: string): void {
    const targetToken = token || this.activeSession?.token
    if (!targetToken) return
    const relay = this.liveRelays.get(targetToken)
    if (!relay) return

    // Save initChunk if not set yet (contains container header like ftyp/moov)
    if (!relay.initChunk && chunk.length > 0) {
      relay.initChunk = Buffer.from(chunk)
    }

    // Broadcast chunk to all connected TV clients
    for (const client of relay.clients) {
      try {
        client.write(chunk)
      } catch {
        relay.clients.delete(client)
      }
    }
  }

  public stopLiveRelay(token?: string): void {
    const targetToken = token || this.activeSession?.token
    if (!targetToken) {
      for (const [t] of this.liveRelays) {
        this.stopLiveRelay(t)
      }
      return
    }
    const relay = this.liveRelays.get(targetToken)
    if (relay) {
      castLogger.info(`[StreamServer] Stopping live decrypted relay for token: ${targetToken}`)
      for (const client of relay.clients) {
        try {
          client.end()
        } catch {}
      }
      relay.clients.clear()
      this.liveRelays.delete(targetToken)
    }
  }

  public isLiveRelay(token?: string): boolean {
    const targetToken = token || this.activeSession?.token
    return Boolean(targetToken && this.liveRelays.has(targetToken))
  }

  public getStreamUrl(token: string, targetDeviceIp?: string): string {
    const lanIp = getLanIpAddress(targetDeviceIp || this.activeSession?.targetDeviceIp)
    if (this.isLiveRelay(token)) {
      return `http://${lanIp}:${this.port}/stream/${token}/live`
    }
    return `http://${lanIp}:${this.port}/stream/${token}`
  }

  public async generateFallbackReceiver(media: CastMediaInput): Promise<FallbackReceiverInfo> {
    const token = await this.startSession(media)
    const lanIp = getLanIpAddress()
    const watchUrl = `http://${lanIp}:${this.port}/watch/${token}`
    const qrDataUrl = await QRCode.toDataURL(watchUrl, {
      margin: 1.5,
      width: 256,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    })
    return {
      url: watchUrl,
      qrDataUrl,
      token
    }
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    // Apply CORS headers to all responses
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      res.setHeader(k, v)
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const rawUrl = req.url || '/'
    let parsedUrl: URL
    try {
      parsedUrl = new URL(rawUrl, `http://${req.headers.host || '127.0.0.1'}`)
    } catch {
      res.writeHead(400)
      res.end('Bad Request')
      return
    }

    const pathname = parsedUrl.pathname

    // Serve bundled hls.js
    if (pathname === '/hls.min.js') {
      if (this.hlsLibCache) {
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'public, max-age=86400'
        })
        res.end(this.hlsLibCache)
      } else {
        res.writeHead(404)
        res.end('Not found')
      }
      return
    }

    // Verify tokenized route
    const streamMatch = pathname.match(/^\/stream\/([a-f0-9]+)(\/.*)?$/)
    const watchMatch = pathname.match(/^\/watch\/([a-f0-9]+)$/)

    if (watchMatch) {
      const token = watchMatch[1]
      if (!this.activeSession || this.activeSession.token !== token) {
        res.writeHead(403, { 'Content-Type': 'text/plain' })
        res.end('Casting session expired or invalid')
        return
      }
      this.serveWatchPage(res, token)
      return
    }

    if (streamMatch) {
      const token = streamMatch[1]
      const subpath = streamMatch[2] || ''

      if (!this.activeSession || this.activeSession.token !== token) {
        res.writeHead(403, { 'Content-Type': 'text/plain' })
        res.end('Forbidden: Invalid session token')
        return
      }

      // Live decrypted relay endpoint (/stream/:token/live or root /stream/:token when live relay is active)
      if (subpath === '/live' || (subpath === '' && this.isLiveRelay(token))) {
        this.handleLiveRelayStream(req, res, token)
        return
      }

      if (subpath === '/seg') {
        const upstreamUrl = parsedUrl.searchParams.get('u')
        if (!upstreamUrl) {
          res.writeHead(400)
          res.end('Missing upstream URL parameter')
          return
        }
        this.proxyMedia(req, res, upstreamUrl, token)
        return
      }

      // Root manifest request: /stream/:token
      this.proxyMedia(req, res, this.activeSession.media.url, token)
      return
    }

    // Default protection: reject all unknown paths
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  }

  private handleLiveRelayStream(
    req: IncomingMessage,
    res: ServerResponse,
    token: string
  ): void {
    let relay = this.liveRelays.get(token)
    if (!relay) {
      this.startLiveRelay(token, this.activeSession?.media.contentType || 'video/mp4')
      relay = this.liveRelays.get(token)!
    }

    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Type': relay.mimeType,
        'Accept-Ranges': 'none',
        'Cache-Control': 'no-cache, no-store',
        Connection: 'keep-alive'
      })
      res.end()
      return
    }

    res.writeHead(200, {
      'Content-Type': relay.mimeType,
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Connection: 'keep-alive',
      'X-Content-Type-Options': 'nosniff'
    })

    relay.clients.add(res)
    req.on('close', () => {
      relay?.clients.delete(res)
    })

    if (relay.initChunk) {
      try {
        res.write(relay.initChunk)
      } catch {}
    }
  }

  private proxyMedia(
    req: IncomingMessage,
    res: ServerResponse,
    upstreamUrl: string,
    token: string
  ): void {
    let targetParsed: URL
    try {
      targetParsed = new URL(upstreamUrl)
    } catch {
      res.writeHead(400)
      res.end('Invalid upstream URL')
      return
    }

    const client = targetParsed.protocol === 'https:' ? https : http
    const headers: Record<string, string> = {
      'User-Agent':
        this.activeSession?.media.headers?.['User-Agent'] ||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
      Accept: '*/*'
    }

    // Forward upstream session headers
    if (this.activeSession?.media.headers) {
      for (const [k, v] of Object.entries(this.activeSession.media.headers)) {
        if (!['host', 'connection', 'content-length'].includes(k.toLowerCase())) {
          headers[k] = v
        }
      }
    }

    // Forward Range header if requested by TV
    if (req.headers.range) {
      headers['Range'] = req.headers.range
    }

    const clientReq = client.request(
      upstreamUrl,
      {
        method: req.method,
        headers
      },
      (upstreamRes) => {
        const statusCode = upstreamRes.statusCode || 200
        const contentType = upstreamRes.headers['content-type'] || ''
        const isHls =
          contentType.includes('mpegurl') ||
          targetParsed.pathname.endsWith('.m3u8') ||
          upstreamUrl.includes('.m3u8')

        if (isHls && (statusCode === 200 || statusCode === 206)) {
          // Buffer playlist to rewrite URLs
          const chunks: Buffer[] = []
          upstreamRes.on('data', (c) => chunks.push(c))
          upstreamRes.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf-8')
            const host = req.headers.host || `127.0.0.1:${this.port}`
            const rewritten = this.rewriteM3u8(body, upstreamUrl, host, token)

            res.writeHead(200, {
              'Content-Type': 'application/vnd.apple.mpegurl',
              'Content-Length': Buffer.byteLength(rewritten),
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              Pragma: 'no-cache',
              Expires: '0'
            })
            res.end(rewritten)
          })
          return
        }

        // TS segments, fMP4, MP4 or binary chunks
        const responseHeaders: http.OutgoingHttpHeaders = {
          ...upstreamRes.headers
        }

        // Pass-through or correct Content-Type
        let fixedContentType = contentType
        if (targetParsed.pathname.endsWith('.ts')) {
          fixedContentType = 'video/mp2t'
        } else if (targetParsed.pathname.endsWith('.mp4') || targetParsed.pathname.endsWith('.m4s')) {
          fixedContentType = 'video/mp4'
        } else if (!fixedContentType || fixedContentType === 'application/octet-stream') {
          fixedContentType = 'video/mp2t'
        }
        responseHeaders['content-type'] = fixedContentType

        // Range support headers
        if (statusCode === 206) {
          responseHeaders['Accept-Ranges'] = 'bytes'
        }

        delete responseHeaders['transfer-encoding']
        res.writeHead(statusCode, responseHeaders)
        upstreamRes.pipe(res)
      }
    )

    clientReq.on('error', (err) => {
      castLogger.error('[StreamServer] Upstream fetch error:', err)
      if (!res.headersSent) {
        res.writeHead(502)
        res.end('Bad Gateway')
      }
    })

    clientReq.end()
  }

  /**
   * Rewrites an HLS playlist so relative and absolute segment URLs,
   * variant playlists, and key URIs route through the StreamServer.
   */
  public rewriteM3u8(playlist: string, playlistUrl: string, host: string, token: string): string {
    const lines = playlist.split(/\r?\n/)
    const output: string[] = []
    const proxyBase = `http://${host}/stream/${token}/seg?u=`

    for (let line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        output.push(line)
        continue
      }

      // Handle tags with URIs: #EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA
      if (trimmed.startsWith('#EXT-X-KEY:') || trimmed.startsWith('#EXT-X-MAP:') || trimmed.startsWith('#EXT-X-MEDIA:')) {
        line = line.replace(/URI="([^"]+)"/g, (_full, uriMatch: string) => {
          const resolved = this.resolveUrl(uriMatch, playlistUrl)
          return `URI="${proxyBase}${encodeURIComponent(resolved)}"`
        })
        output.push(line)
        continue
      }

      // Other comments and tags
      if (trimmed.startsWith('#')) {
        output.push(line)
        continue
      }

      // Segment or variant URI line
      const resolved = this.resolveUrl(trimmed, playlistUrl)
      output.push(`${proxyBase}${encodeURIComponent(resolved)}`)
    }

    return output.join('\n')
  }

  private resolveUrl(uri: string, baseUrl: string): string {
    try {
      if (/^https?:\/\//i.test(uri)) return uri
      return new URL(uri, baseUrl).href
    } catch {
      return uri
    }
  }

  private serveWatchPage(res: ServerResponse, token: string): void {
    const title = this.activeSession?.media.title || 'Live Stream'
    const isLive = this.isLiveRelay(token)
    const streamUrl = isLive ? `/stream/${token}/live` : `/stream/${token}`

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - JioTv Max Cast</title>
  <script src="/hls.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #09090b;
      color: #fafafa;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .header {
      width: 100%;
      max-width: 900px;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .brand {
      font-size: 1.1rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .badge {
      background: #e11d2e;
      color: white;
      font-size: 0.7rem;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .player-container {
      width: 100%;
      max-width: 900px;
      aspect-ratio: 16 / 9;
      background: #000;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.1);
      position: relative;
    }
    video {
      width: 100%;
      height: 100%;
      display: block;
      background: #000;
    }
    .footer {
      max-width: 900px;
      width: 100%;
      padding: 14px 20px;
      font-size: 0.85rem;
      color: #a1a1aa;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <span>${escapeHtml(title)}</span>
      <span class="badge">Live</span>
    </div>
  </div>
  <div class="player-container">
    <video id="player" controls autoplay playsinline></video>
  </div>
  <div class="footer">
    <span>JioTv Max Local Web Receiver</span>
    <span>Connected to laptop stream relay</span>
  </div>

  <script>
    const video = document.getElementById('player');
    const streamUrl = '${streamUrl}';
    const isLiveRelay = ${isLive ? 'true' : 'false'};

    if (isLiveRelay) {
      video.src = streamUrl;
      video.play().catch(function() {});
    } else if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true
      });
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, function() {
        video.play().catch(function() {});
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.addEventListener('loadedmetadata', function() {
        video.play().catch(function() {});
      });
    }
  </script>
</body>
</html>`

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache'
    })
    res.end(html)
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
