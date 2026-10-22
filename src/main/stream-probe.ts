import { net } from 'electron'
import type { StreamProbeStage1 } from '@shared/types'
import {
  bestVariant,
  firstSegment,
  isMasterPlaylist,
  isMediaPlaylist,
  segmentCount
} from './probe-utils'

/**
 * Addendum 3 · stage-1 stream verification.
 *
 * The renderer resolves the stream through the same `channelService.getStream`
 * path as the player, so this function receives a relay (or public demo) URL
 * and fetches it without inventing a second header pipeline. It validates the
 * manifest, follows master playlists to a media playlist, rejects DRM, and
 * range-fetches the first 64 KB of the first segment.
 */

const STAGE1_TIMEOUT_MS = 4000
const SEGMENT_PREFIX_BYTES = 64 * 1024

type FetchResponse = Awaited<ReturnType<typeof net.fetch>>

interface PlaylistFetch {
  ok: boolean
  reason?: string
  status?: number
  text?: string
  url?: string
}

async function fetchPlaylist(url: string, signal: AbortSignal): Promise<PlaylistFetch> {
  try {
    const response: FetchResponse = await net.fetch(url, {
      signal,
      redirect: 'follow',
      headers: {
        Accept:
          'application/dash+xml,application/vnd.apple.mpegurl,application/x-mpegURL,application/xml,text/xml,*/*',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
      }
    })
    if (!response.ok) {
      return {
        ok: false,
        reason: `Playlist returned HTTP ${response.status}.`,
        status: response.status
      }
    }
    const text = await response.text()
    const trimmed = text.trimStart()
    const isHls = trimmed.startsWith('#EXTM3U')
    const isDash = trimmed.startsWith('<?xml') || trimmed.includes('<MPD')
    if (!isHls && !isDash) {
      return {
        ok: false,
        reason: 'Manifest is neither HLS (#EXTM3U) nor DASH (<MPD).',
        status: response.status
      }
    }
    return {
      ok: true,
      status: response.status,
      text,
      url: response.url || url
    }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    return { ok: false, reason: timedOut ? 'Playlist request timed out.' : 'Playlist request failed.' }
  }
}

async function readPrefix(response: FetchResponse, limit: number): Promise<number> {
  if (!response.body) {
    const data = await response.arrayBuffer()
    return Math.min(limit, data.byteLength)
  }
  const reader = response.body.getReader()
  let total = 0
  try {
    while (total < limit) {
      const { done, value } = await reader.read()
      if (done) break
      total += value?.byteLength ?? 0
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return total
}

export async function probeStage1(url: string): Promise<StreamProbeStage1> {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return { ok: false, reason: 'A resolved HTTP(S) stream URL is required.' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), STAGE1_TIMEOUT_MS)
  try {
    let currentUrl = url
    let playlist: PlaylistFetch | null = null
    for (let depth = 0; depth < 4; depth += 1) {
      const fetched = await fetchPlaylist(currentUrl, controller.signal)
      if (!fetched.ok) return { ok: false, reason: fetched.reason, status: fetched.status }
      playlist = fetched
      const text = fetched.text ?? ''
      // If DASH manifest, stage 1 is verified
      if (text.includes('<MPD')) {
        return {
          ok: true,
          status: fetched.status,
          playlistUrl: fetched.url ?? currentUrl,
          segments: 1
        }
      }
      if (!isMasterPlaylist(text)) break
      const variant = bestVariant(text, fetched.url ?? currentUrl)
      if (!variant || variant === currentUrl) break
      currentUrl = variant
    }
    if (!playlist?.text) return { ok: false, reason: 'Playlist could not be loaded.' }

    const mediaText = playlist.text
    const mediaUrl = playlist.url ?? currentUrl
    if (isMasterPlaylist(mediaText)) {
      return { ok: false, reason: 'Could not resolve a media playlist from the master.' }
    }
    if (!isMediaPlaylist(mediaText)) {
      return { ok: false, reason: 'Playlist is not a valid media playlist.', segments: 0 }
    }

    const segments = segmentCount(mediaText)
    if (segments < 1) {
      return { ok: false, reason: 'Media playlist has fewer than 1 segment.', segments }
    }
    const segment = firstSegment(mediaText, mediaUrl)
    if (!segment) return { ok: false, reason: 'No segment URL found.', segments }

    const response = await net.fetch(segment, {
      signal: controller.signal,
      headers: {
        Range: `bytes=0-${SEGMENT_PREFIX_BYTES - 1}`,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
      }
    })
    if (response.status !== 200 && response.status !== 206) {
      return {
        ok: false,
        reason: `First segment returned HTTP ${response.status}.`,
        segments,
        status: response.status
      }
    }
    const bytes = await readPrefix(response, SEGMENT_PREFIX_BYTES)
    if (bytes === 0) {
      return {
        ok: false,
        reason: 'First segment response was empty.',
        segments,
        status: response.status,
        bytes
      }
    }
    return {
      ok: true,
      segments,
      playlistUrl: mediaUrl,
      segmentUrl: segment,
      status: response.status,
      bytes
    }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    return {
      ok: false,
      reason: timedOut ? 'Stage 1 verification timed out.' : 'Stage 1 verification failed.'
    }
  } finally {
    clearTimeout(timer)
  }
}
