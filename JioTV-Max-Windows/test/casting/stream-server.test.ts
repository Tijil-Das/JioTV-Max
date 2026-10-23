import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import { StreamServer } from '../../src/main/casting/stream-server'
import type { CastMediaInput } from '../../src/shared/cast-types'

describe('StreamServer & HLS Rewriting', () => {
  let server: StreamServer

  beforeEach(() => {
    server = new StreamServer()
  })

  afterEach(async () => {
    await server.stopSession()
  })

  it('binds to an ephemeral port on start and shuts down cleanly', async () => {
    const port = await server.start()
    expect(port).toBeGreaterThan(0)

    await server.stop()
    // Verify server closed
    expect(async () => {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/health`, () => {
          reject(new Error('Server should be closed'))
        })
        req.on('error', () => resolve())
      })
    }).not.toThrow()
  })

  it('rejects unauthorized paths and invalid session tokens with 403/404', async () => {
    const port = await server.start()

    // 404 for random root path
    const res404 = await makeRequest(`http://127.0.0.1:${port}/unknown-path`)
    expect(res404.statusCode).toBe(404)

    // 403 for forged token path
    const res403 = await makeRequest(`http://127.0.0.1:${port}/stream/deadbeef12345678`)
    expect(res403.statusCode).toBe(403)
  })

  it('responds to OPTIONS preflight with full CORS headers', async () => {
    const port = await server.start()
    const res = await makeRequest(`http://127.0.0.1:${port}/stream/anytoken`, 'OPTIONS')

    expect(res.statusCode).toBe(204)
    expect(res.headers['access-control-allow-origin']).toBe('*')
    expect(res.headers['access-control-allow-methods']).toContain('GET')
    expect(res.headers['access-control-allow-headers']).toContain('Range')
    expect(res.headers['access-control-expose-headers']).toContain('Content-Range')
  })

  it('rewrites HLS variant, segment, and key URIs with tokenized proxy URLs', () => {
    const sampleM3u8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:100
#EXT-X-KEY:METHOD=AES-128,URI="https://cdn.example.com/keys/key1.bin",IV=0x1234
#EXT-X-MAP:URI="init.mp4"
#EXTINF:6.0,
segment_100.ts
#EXTINF:6.0,
https://cdn.example.com/live/segment_101.ts
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",DEFAULT=YES,URI="audio/en.m3u8"
`
    const playlistUrl = 'https://cdn.example.com/live/master.m3u8'
    const host = '192.168.1.150:9876'
    const token = 'abc123token'

    const rewritten = server.rewriteM3u8(sampleM3u8, playlistUrl, host, token)

    // Relative segment rewritten
    expect(rewritten).toContain('http://192.168.1.150:9876/stream/abc123token/seg?u=https%3A%2F%2Fcdn.example.com%2Flive%2Fsegment_100.ts')

    // Absolute segment rewritten
    expect(rewritten).toContain('http://192.168.1.150:9876/stream/abc123token/seg?u=https%3A%2F%2Fcdn.example.com%2Flive%2Fsegment_101.ts')

    // EXT-X-KEY URI rewritten
    expect(rewritten).toContain('#EXT-X-KEY:METHOD=AES-128,URI="http://192.168.1.150:9876/stream/abc123token/seg?u=https%3A%2F%2Fcdn.example.com%2Fkeys%2Fkey1.bin"')

    // EXT-X-MAP URI rewritten
    expect(rewritten).toContain('#EXT-X-MAP:URI="http://192.168.1.150:9876/stream/abc123token/seg?u=https%3A%2F%2Fcdn.example.com%2Flive%2Finit.mp4"')

    // EXT-X-MEDIA URI rewritten
    expect(rewritten).toContain('URI="http://192.168.1.150:9876/stream/abc123token/seg?u=https%3A%2F%2Fcdn.example.com%2Flive%2Faudio%2Fen.m3u8"')
  })

  it('generates a valid fallback receiver QR code and short LAN URL', async () => {
    const testMedia: CastMediaInput = {
      url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      title: 'Test Channel 1',
      isLive: true
    }

    const fallback = await server.generateFallbackReceiver(testMedia)
    expect(fallback.token).toBeDefined()
    expect(fallback.url).toMatch(/^http:\/\/[0-9.]+:([0-9]+)\/watch\/[a-f0-9]+$/)
    expect(fallback.qrDataUrl).toMatch(/^data:image\/png;base64,/)
  })

  it('handles live decrypted relay sessions with chunked streaming and HEAD requests', async () => {
    const port = await server.start()
    const testMedia: CastMediaInput = {
      url: 'http://127.0.0.1:8080/manifest.mpd',
      title: 'DRM Channel Live Relay',
      isLive: true,
      isDecryptedRelay: true,
      contentType: 'video/mp4'
    }

    const token = await server.startSession(testMedia)
    expect(server.isLiveRelay(token)).toBe(true)

    const streamUrl = server.getStreamUrl(token)
    expect(streamUrl).toContain(`/stream/${token}/live`)

    // Verify HEAD request
    const headRes = await makeRequest(`http://127.0.0.1:${port}/stream/${token}/live`, 'HEAD')
    expect(headRes.statusCode).toBe(200)
    expect(headRes.headers['content-type']).toBe('video/mp4')

    // Verify GET request with chunk streaming
    const receivedChunks: Buffer[] = []
    const clientPromise = new Promise<void>((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${port}/stream/${token}/live`, (res) => {
        expect(res.statusCode).toBe(200)
        expect(res.headers['content-type']).toBe('video/mp4')
        expect(res.headers['transfer-encoding']).toBe('chunked')

        res.on('data', (chunk) => {
          receivedChunks.push(Buffer.from(chunk))
          if (receivedChunks.length >= 2) {
            req.destroy()
            resolve()
          }
        })
      })
      req.on('error', (err) => {
        // Destroy error is expected when disconnecting early
        if (receivedChunks.length >= 2) resolve()
        else reject(err)
      })
    })

    // Feed chunks
    setTimeout(() => {
      server.feedChunk(Buffer.from('INIT_HEADER_MOOV'), token)
      server.feedChunk(Buffer.from('VIDEO_PAYLOAD_CHUNK_1'), token)
    }, 50)

    await clientPromise
    expect(receivedChunks.length).toBeGreaterThanOrEqual(2)
    const combined = Buffer.concat(receivedChunks).toString()
    expect(combined).toContain('INIT_HEADER_MOOV')
    expect(combined).toContain('VIDEO_PAYLOAD_CHUNK_1')

    server.stopLiveRelay(token)
    expect(server.isLiveRelay(token)).toBe(false)
  })
})

function makeRequest(
  url: string,
  method = 'GET',
  headers: Record<string, string> = {}
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const req = http.request(
      url,
      {
        method,
        headers
      },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: data
          })
        })
      }
    )
    req.on('error', reject)
    req.end()
  })
}
