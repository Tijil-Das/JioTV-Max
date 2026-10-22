import { app, net } from 'electron'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { AssetFetchPayload, Result } from '@shared/types'

/**
 * Logo bytes are fetched in the main process so the renderer never taints a
 * canvas and `webSecurity` can stay on. Successful responses are cached on
 * disk under `userData/logo-cache`, keyed by sha1(url). Pipeline results live
 * in IndexedDB in the renderer.
 */

const MAX_BYTES = 8 * 1024 * 1024
const FETCH_TIMEOUT_MS = 10_000

function sha1(value: string): string {
  return createHash('sha1').update(value).digest('hex')
}

function extensionFor(mime: string, url: string): string {
  if (mime.includes('png')) return 'png'
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('svg')) return 'svg'
  if (mime.includes('gif')) return 'gif'
  const match = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(url)
  return match?.[1]?.toLowerCase() ?? 'bin'
}

function inferMime(url: string): string {
  const match = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(url)
  switch (match?.[1]?.toLowerCase()) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    case 'gif':
      return 'image/gif'
    default:
      return 'application/octet-stream'
  }
}

function decodeDataUrl(url: string): AssetFetchPayload | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url)
  if (!match) return null
  const mimeType = match[1] || 'application/octet-stream'
  const body = match[3] ?? ''
  const bytes = match[2]
    ? Buffer.from(body, 'base64')
    : Buffer.from(decodeURIComponent(body), 'utf8')
  return { bytes: new Uint8Array(bytes), mimeType, cached: false }
}

async function readCache(
  directory: string,
  key: string
): Promise<AssetFetchPayload | null> {
  try {
    const [bytes, metaRaw] = await Promise.all([
      fs.readFile(path.join(directory, `${key}.bin`)),
      fs.readFile(path.join(directory, `${key}.json`), 'utf8')
    ])
    const meta = JSON.parse(metaRaw) as { mimeType?: string }
    const copy = new Uint8Array(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    )
    return {
      bytes: copy,
      mimeType: meta.mimeType || 'application/octet-stream',
      cached: true
    }
  } catch {
    return null
  }
}

async function writeCache(
  directory: string,
  key: string,
  bytes: Uint8Array,
  mimeType: string
): Promise<void> {
  try {
    await fs.mkdir(directory, { recursive: true })
    await Promise.all([
      fs.writeFile(path.join(directory, `${key}.bin`), Buffer.from(bytes)),
      fs.writeFile(
        path.join(directory, `${key}.json`),
        JSON.stringify({ mimeType, savedAt: new Date().toISOString() })
      )
    ])
  } catch (error) {
    console.warn('[asset:fetch] cache write failed', error)
  }
}

export async function fetchAsset(url: string): Promise<Result<AssetFetchPayload>> {
  if (typeof url !== 'string' || url.length === 0) {
    return { ok: false, error: 'A logo URL is required.', code: 'INVALID_URL' }
  }
  if (url.startsWith('data:')) {
    const decoded = decodeDataUrl(url)
    return decoded
      ? { ok: true, data: decoded }
      : { ok: false, error: 'Malformed data URL.', code: 'INVALID_URL' }
  }
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: 'Only HTTP(S) logo URLs are supported.', code: 'INVALID_URL' }
  }

  const key = sha1(url)
  const directory = path.join(app.getPath('userData'), 'logo-cache')
  const cached = await readCache(directory, key)
  if (cached) return { ok: true, data: cached }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await net.fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
      }
    })
    if (!response.ok) {
      return {
        ok: false,
        error: `Logo request failed (${response.status}).`,
        code: 'HTTP_ERROR',
        retryable: response.status >= 500
      }
    }
    const length = Number(response.headers.get('content-length') ?? 0)
    if (length > MAX_BYTES) {
      return { ok: false, error: 'Logo is larger than 8 MB.', code: 'TOO_LARGE' }
    }
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength > MAX_BYTES) {
      return { ok: false, error: 'Logo is larger than 8 MB.', code: 'TOO_LARGE' }
    }
    if (buffer.byteLength === 0) {
      return { ok: false, error: 'Logo response was empty.', code: 'EMPTY' }
    }
    const mimeType = response.headers.get('content-type')?.split(';')[0] || inferMime(url)
    const payload: AssetFetchPayload = {
      bytes: new Uint8Array(buffer),
      mimeType,
      cached: false
    }
    await writeCache(directory, key, payload.bytes, mimeType)
    return { ok: true, data: payload }
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'Logo request timed out.'
        : error instanceof Error
          ? error.message
          : 'Logo request failed.'
    return { ok: false, error: message, code: 'NETWORK', retryable: true }
  } finally {
    clearTimeout(timer)
  }
}
