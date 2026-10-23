import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import { StreamServer } from '../../src/main/casting/stream-server'
import type { CastMediaInput } from '../../src/shared/cast-types'

describe('Fallback Web Receiver', () => {
  let server: StreamServer

  beforeEach(() => {
    server = new StreamServer()
  })

  afterEach(async () => {
    await server.stopSession()
  })

  it('serves the web receiver HTML5 page with embedded hls.js loader', async () => {
    const testMedia: CastMediaInput = {
      url: 'https://cdn.example.com/live/sample.m3u8',
      title: 'Star Sports 1 HD',
      isLive: true
    }

    const fallback = await server.generateFallbackReceiver(testMedia)
    expect(fallback.token).toBeDefined()
    expect(fallback.url).toContain('/watch/')

    const res = await makeRequest(fallback.url)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.body).toContain('Star Sports 1 HD')
    expect(res.body).toContain('<video id="player"')
    expect(res.body).toContain('Hls.isSupported()')
  })

  it('serves the local bundled hls.min.js without external CDN dependency', async () => {
    const port = await server.start()
    const res = await makeRequest(`http://127.0.0.1:${port}/hls.min.js`)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/javascript')
    expect(res.body.length).toBeGreaterThan(1000)
  })

  it('expires web receiver access when session terminates', async () => {
    const testMedia: CastMediaInput = {
      url: 'https://cdn.example.com/live/sample.m3u8',
      title: 'Zee Cinema',
      isLive: true
    }

    const fallback = await server.generateFallbackReceiver(testMedia)
    const validRes = await makeRequest(fallback.url)
    expect(validRes.statusCode).toBe(200)

    // Stop session
    await server.stopSession()

    // Subsequent access is rejected or fails to connect
    await expect(makeRequest(fallback.url)).rejects.toThrow()
  })
})

function makeRequest(
  url: string
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body: data
        })
      })
    })
    req.on('error', reject)
  })
}
