import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import https from 'node:https'
import { randomBytes } from 'node:crypto'
import { type Socket } from 'node:net'
import { readFileSync, existsSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import path from 'node:path'
import QRCode from 'qrcode'
import type { CastMediaInput, FallbackReceiverInfo } from '@shared/cast-types'
import { getLanIpAddress } from './network-utils'
import { castLogger } from './logger'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Accept, Accept-Encoding, User-Agent, Origin, Content-Type, Authorization, ssotoken, srno, channelid, channelId',
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

export class StreamServer extends EventEmitter {
  private server: http.Server | null = null
  private port = 0
  private readonly sockets = new Set<Socket>()
  private activeSession: StreamSession | null = null
  private hlsLibCache: string | null = null
  private shakaLibCache: string | null = null
  private readonly liveRelays = new Map<string, LiveRelayState>()

  constructor() {
    super()
    this.preloadHlsLib()
    this.preloadShakaLib()
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

  private preloadShakaLib(): void {
    const candidatePaths = [
      path.join(process.cwd(), 'node_modules/shaka-player/dist/shaka-player.compiled.js'),
      path.join(__dirname, '../../node_modules/shaka-player/dist/shaka-player.compiled.js'),
      path.join(__dirname, '../node_modules/shaka-player/dist/shaka-player.compiled.js')
    ]
    for (const p of candidatePaths) {
      if (existsSync(p)) {
        try {
          this.shakaLibCache = readFileSync(p, 'utf-8')
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
    castLogger.info(`[StreamServer] Created session token: ${token} for media: "${media.title}" (isDrm=${media.isDrm})`)

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

    if (!relay.initChunk && chunk.length > 0) {
      relay.initChunk = Buffer.from(chunk)
    }

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
      return `http://${lanIp}:${this.port}/stream/${token}/live.mp4`
    }
    const isDash =
      this.activeSession?.media.isDrm ||
      this.activeSession?.media.contentType?.includes('dash') ||
      Boolean(this.activeSession?.media.url && this.activeSession.media.url.includes('.mpd'))
    const suffix = isDash ? '/manifest.mpd' : '/playlist.m3u8'
    return `http://${lanIp}:${this.port}/stream/${token}${suffix}`
  }

  public getLicenseUrl(token: string, targetDeviceIp?: string): string {
    const lanIp = getLanIpAddress(targetDeviceIp || this.activeSession?.targetDeviceIp)
    return `http://${lanIp}:${this.port}/stream/${token}/license`
  }

  public async generateFallbackReceiver(media: CastMediaInput): Promise<FallbackReceiverInfo> {
    const token = await this.startSession(media)
    const lanIp = getLanIpAddress()
    const receiverUrl = `http://${lanIp}:${this.port}/receiver/${token}`
    const qrDataUrl = await QRCode.toDataURL(receiverUrl, {
      margin: 1.5,
      width: 256,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    })
    return {
      url: receiverUrl,
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

    // Serve bundled Shaka Player
    if (pathname === '/shaka-player.compiled.js') {
      if (this.shakaLibCache) {
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'public, max-age=86400'
        })
        res.end(this.shakaLibCache)
      } else {
        res.writeHead(404)
        res.end('Not found')
      }
      return
    }

    // Global /license route proxy
    if (pathname === '/license') {
      void this.handleLicenseProxy(req, res)
      return
    }

    // Standalone Web Receiver routes: /receiver, /receiver/:token, /watch/:token
    const receiverMatch = pathname.match(/^\/(?:receiver|watch)(?:\/([a-f0-9]+))?$/)
    if (receiverMatch) {
      const token = receiverMatch[1]
      this.serveReceiverPage(req, res, parsedUrl, token)
      return
    }

    // Tokenized streaming routes: /stream/:token/*
    const streamMatch = pathname.match(/^\/stream\/([a-f0-9]+)(\/.*)?$/)
    if (streamMatch) {
      const token = streamMatch[1]
      const subpath = streamMatch[2] || ''

      if (!this.activeSession || this.activeSession.token !== token) {
        res.writeHead(403, { 'Content-Type': 'text/plain' })
        res.end('Forbidden: Invalid session token')
        return
      }

      // License request: /stream/:token/license
      if (subpath === '/license') {
        void this.handleLicenseProxy(req, res, token)
        return
      }

      // Relay loopback route for rewritten DASH MPD segments & dashtime: /stream/:token/relay/:port/*
      if (subpath.startsWith('/relay/')) {
        const relayMatch = subpath.match(/^\/relay\/(\d+)(\/.*)?$/)
        if (relayMatch) {
          const targetPort = relayMatch[1]
          const targetPath = (relayMatch[2] || '') + (parsedUrl.search || '')
          const loopbackUrl = `http://127.0.0.1:${targetPort}${targetPath}`
          this.proxyMedia(req, res, loopbackUrl, token)
          return
        }
      }

      // Live decrypted relay endpoint (/stream/:token/live or /stream/:token/live.mp4)
      if (subpath === '/live' || subpath === '/live.mp4' || (subpath === '' && this.isLiveRelay(token))) {
        this.handleLiveRelayStream(req, res, token)
        return
      }

      // Segment proxy route: /stream/:token/seg?u=...
      if (subpath === '/seg' || subpath.startsWith('/seg')) {
        const upstreamUrl = parsedUrl.searchParams.get('u')
        if (!upstreamUrl) {
          res.writeHead(400)
          res.end('Missing upstream URL parameter')
          return
        }
        this.proxyMedia(req, res, upstreamUrl, token)
        return
      }

      // Root manifest request: /stream/:token, /stream/:token/playlist.m3u8, /stream/:token/manifest.mpd
      this.proxyMedia(req, res, this.activeSession.media.url, token)
      return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  }

  /**
   * Proxies Widevine license requests from Kodi's inputstream.adaptive or Shaka Player Web Receiver,
   * injecting necessary Jio authentication headers.
   */
  private async handleLicenseProxy(
    req: IncomingMessage,
    res: ServerResponse,
    token?: string
  ): Promise<void> {
    const session = token ? (this.activeSession?.token === token ? this.activeSession : null) : this.activeSession
    if (!session) {
      res.writeHead(403, { 'Content-Type': 'text/plain' })
      res.end('Forbidden: No active casting session for license')
      return
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // Read full binary challenge from request body
    const chunks: Buffer[] = []
    try {
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk))
      }
    } catch (readErr) {
      castLogger.error('[StreamServer] Error reading license challenge payload:', readErr)
      res.writeHead(400, { 'Content-Type': 'text/plain' })
      res.end('Bad Request')
      return
    }
    const challengeBody = Buffer.concat(chunks)

    // Determine target license URL
    let targetLicenseUrl = session.media.licenseUrl
    if (!targetLicenseUrl) {
      if (session.media.url.includes('/stream/') && (session.media.url.includes('/manifest') || session.media.url.includes('.mpd'))) {
        targetLicenseUrl = session.media.url.replace(/\/manifest(\.mpd)?$/, '/license')
      } else {
        targetLicenseUrl = 'https://tv.media.jio.com/proxy?provider=reliance'
      }
    }

    castLogger.info(
      `[StreamServer] Proxying Widevine license challenge (${challengeBody.length} bytes) to: ${targetLicenseUrl}`
    )

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/octet-stream',
        'User-Agent':
          session.media.headers?.['User-Agent'] ||
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Origin: 'https://www.jiotv.com',
        Referer: 'https://www.jiotv.com/',
        Accept: '*/*'
      }

      if (session.media.headers) {
        for (const [k, v] of Object.entries(session.media.headers)) {
          if (!['host', 'connection', 'content-length'].includes(k.toLowerCase())) {
            headers[k] = v
          }
        }
      }

      // Forward required Jio authentication headers
      if (headers.accessToken && !headers.Authorization) {
        headers.Authorization = `Bearer ${headers.accessToken}`
      }
      if (!headers.srno) {
        headers.srno = '230203144000'
      }
      if (session.media.channelId && !headers.channelid) {
        headers.channelid = session.media.channelId
        headers.channelId = session.media.channelId
      }

      const response = await fetch(targetLicenseUrl, {
        method: 'POST',
        headers,
        body: challengeBody
      })

      if (!response.ok) {
        castLogger.warn(`[StreamServer] Upstream license returned HTTP ${response.status}`)
        res.writeHead(response.status, { 'Content-Type': 'text/plain' })
        res.end(`Upstream license server error: ${response.status}`)
        return
      }

      const licenseBuf = Buffer.from(await response.arrayBuffer())
      castLogger.info(`[StreamServer] Successfully received Widevine license (${licenseBuf.length} bytes)`)

      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(licenseBuf.length),
        'Cache-Control': 'no-cache, no-store'
      })
      res.end(licenseBuf)
    } catch (err) {
      castLogger.error('[StreamServer] Failed to fetch license from upstream:', err)
      res.writeHead(502, { 'Content-Type': 'text/plain' })
      res.end('Bad Gateway')
    }
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
    this.emit('clientConnected', { token, clientIp: req.socket.remoteAddress })
    req.on('close', () => {
      relay?.clients.delete(res)
      this.emit('clientDisconnected', { token, clientIp: req.socket.remoteAddress })
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

    // Forward Range header if requested
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
        const isMpd =
          contentType.includes('dash') ||
          targetParsed.pathname.endsWith('.mpd') ||
          upstreamUrl.includes('.mpd')

        if (isHls && (statusCode === 200 || statusCode === 206)) {
          // Buffer HLS playlist to rewrite segment and key URLs
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

        if (isMpd && (statusCode === 200 || statusCode === 206)) {
          // Buffer DASH MPD and rewrite any loopback host (127.0.0.1 / localhost)
          // to route segments and dashtime through StreamServer's /relay endpoint
          const chunks: Buffer[] = []
          upstreamRes.on('data', (c) => chunks.push(c))
          upstreamRes.on('end', () => {
            let body = Buffer.concat(chunks).toString('utf-8')
            const host = req.headers.host || `127.0.0.1:${this.port}`

            const loopbackRegex = /https?:\/\/(?:127\.0\.0\.1|localhost):(\d+)/g
            body = body.replace(loopbackRegex, (_match, port) => {
              return `http://${host}/stream/${token}/relay/${port}`
            })

            res.writeHead(200, {
              'Content-Type': 'application/dash+xml',
              'Content-Length': Buffer.byteLength(body),
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              Pragma: 'no-cache',
              Expires: '0'
            })
            res.end(body)
          })
          return
        }

        // TS segments, fMP4, MP4 or binary chunks
        const responseHeaders: http.OutgoingHttpHeaders = {
          ...upstreamRes.headers
        }

        let fixedContentType = contentType
        if (targetParsed.pathname.endsWith('.ts')) {
          fixedContentType = 'video/mp2t'
        } else if (targetParsed.pathname.endsWith('.mp4') || targetParsed.pathname.endsWith('.m4s')) {
          fixedContentType = 'video/mp4'
        } else if (!fixedContentType || fixedContentType === 'application/octet-stream') {
          fixedContentType = 'video/mp2t'
        }
        responseHeaders['content-type'] = fixedContentType

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

  public rewriteM3u8(playlist: string, playlistUrl: string, host: string, token: string): string {
    const lines = playlist.split(/\r?\n/)
    const output: string[] = []

    for (let line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        output.push(line)
        continue
      }

      if (trimmed.startsWith('#EXT-X-KEY:') || trimmed.startsWith('#EXT-X-MAP:') || trimmed.startsWith('#EXT-X-MEDIA:')) {
        line = line.replace(/URI="([^"]+)"/g, (_full, uriMatch: string) => {
          const resolved = this.resolveUrl(uriMatch, playlistUrl)
          const ext = resolved.includes('.m3u8') ? '.m3u8' : '.ts'
          return `URI="http://${host}/stream/${token}/seg${ext}?u=${encodeURIComponent(resolved)}"`
        })
        output.push(line)
        continue
      }

      if (trimmed.startsWith('#')) {
        output.push(line)
        continue
      }

      const resolved = this.resolveUrl(trimmed, playlistUrl)
      const ext = resolved.includes('.m3u8') ? '.m3u8' : '.ts'
      output.push(`http://${host}/stream/${token}/seg${ext}?u=${encodeURIComponent(resolved)}`)
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

  /**
   * Serves the standalone Web Receiver HTML page for Smart TVs, Chromecast, and mobile browsers.
   * Utilizes Shaka Player with native Widevine DRM configuration.
   */
  private serveReceiverPage(
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl: URL,
    token?: string
  ): void {
    const host = req.headers.host || `127.0.0.1:${this.port}`
    const activeTok = token || this.activeSession?.token
    const title = this.activeSession?.media.title || 'Live Broadcast'
    const isLive = activeTok ? this.isLiveRelay(activeTok) : false

    let defaultStreamUrl = ''
    let defaultLicenseUrl = ''

    if (activeTok) {
      if (isLive) {
        defaultStreamUrl = `http://${host}/stream/${activeTok}/live.mp4`
      } else {
        const isDash =
          this.activeSession?.media.isDrm ||
          this.activeSession?.media.contentType?.includes('dash') ||
          Boolean(this.activeSession?.media.url && this.activeSession.media.url.includes('.mpd'))
        const suffix = isDash ? '/manifest.mpd' : '/playlist.m3u8'
        defaultStreamUrl = `http://${host}/stream/${activeTok}${suffix}`
        if (isDash) {
          defaultLicenseUrl = `http://${host}/stream/${activeTok}/license`
        }
      }
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - JioTV Max Web Receiver</title>
  <script src="/shaka-player.compiled.js"></script>
  <script src="/hls.min.js"></script>
  <script>
    if (typeof shaka === 'undefined') {
      document.write('<script src="https://cdnjs.cloudflare.com/ajax/libs/shaka-player/4.14.10/shaka-player.compiled.js"><\\/script>');
    }
  </script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background: #09090b;
      color: #fafafa;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      width: 100%;
      height: 100%;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .player-wrap {
      position: relative;
      width: 100vw;
      height: 100vh;
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    video {
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #000;
    }
    .hud {
      position: absolute;
      top: 24px;
      left: 28px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: rgba(0,0,0,0.65);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      padding: 10px 18px;
      border-radius: 9999px;
      border: 1px solid rgba(255,255,255,0.12);
      transition: opacity 0.5s ease;
      pointer-events: none;
      z-index: 10;
    }
    .hud.fade { opacity: 0; }
    .badge {
      background: #e11d2e;
      color: #fff;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .title {
      font-size: 1rem;
      font-weight: 600;
      color: #fff;
    }
    .status-msg {
      position: absolute;
      bottom: 24px;
      background: rgba(0,0,0,0.7);
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 0.85rem;
      color: #a1a1aa;
      pointer-events: none;
      transition: opacity 0.3s;
    }
  </style>
</head>
<body>
  <div class="player-wrap">
    <div class="hud" id="hud">
      <span class="badge">Live</span>
      <span class="title">${escapeHtml(title)}</span>
    </div>
    <video id="videoPlayer" controls autoplay playsinline></video>
    <div class="status-msg" id="statusMsg">Initializing player...</div>
  </div>

  <script>
    (function() {
      const video = document.getElementById('videoPlayer');
      const statusMsg = document.getElementById('statusMsg');
      const hud = document.getElementById('hud');

      const urlParams = new URLSearchParams(window.location.search);
      const mpdUrl = urlParams.get('mpdUrl') || '${defaultStreamUrl}';
      const licenseUrl = urlParams.get('licenseUrl') || '${defaultLicenseUrl}';

      setTimeout(function() {
        if (hud) hud.classList.add('fade');
      }, 5000);

      document.addEventListener('mousemove', function() {
        if (hud) hud.classList.remove('fade');
        clearTimeout(window._hudTimer);
        window._hudTimer = setTimeout(function() {
          if (hud) hud.classList.add('fade');
        }, 3000);
      });

      function setStatus(text) {
        if (!statusMsg) return;
        if (!text) {
          statusMsg.style.display = 'none';
        } else {
          statusMsg.style.display = 'block';
          statusMsg.textContent = text;
        }
      }

      async function initPlayer() {
        if (!mpdUrl) {
          setStatus('No active stream to play.');
          return;
        }

        // 1. Shaka Player (Native Widevine EME DASH & HLS)
        if (typeof shaka !== 'undefined') {
          shaka.polyfill.installAll();
          if (shaka.Player.isBrowserSupported()) {
            try {
              const player = new shaka.Player(video);
              player.addEventListener('error', function(event) {
                console.error('Shaka player error:', event.detail);
                setStatus('Playback error: ' + (event.detail.message || event.detail.code));
              });

              if (licenseUrl) {
                player.configure({
                  drm: {
                    servers: {
                      'com.widevine.alpha': licenseUrl
                    }
                  }
                });
              }

              setStatus('Loading stream via native Widevine EME...');
              await player.load(mpdUrl);
              setStatus('');
              video.play().catch(function() {});
              return;
            } catch (err) {
              console.warn('Shaka load failed, falling back:', err);
            }
          }
        }

        // 2. HLS.js fallback for clear HLS streams
        if (typeof Hls !== 'undefined' && Hls.isSupported() && (mpdUrl.includes('.m3u8') || !mpdUrl.includes('.mpd'))) {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
          hls.loadSource(mpdUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, function() {
            setStatus('');
            video.play().catch(function() {});
          });
          return;
        }

        // 3. Native browser video element fallback
        video.src = mpdUrl;
        video.addEventListener('loadedmetadata', function() {
          setStatus('');
          video.play().catch(function() {});
        });
      }

      initPlayer();
    })();
  </script>
</body>
</html>`

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store'
    })
    res.end(html)
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
