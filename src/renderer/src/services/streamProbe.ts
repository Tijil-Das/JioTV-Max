import Hls, { Events as HlsEvents, ErrorTypes } from 'hls.js'
import type { StreamInfo } from '@shared/types'
import { channelService } from './channelService'
import { getBridge } from './api'
import { useChannelStore } from '@/store/useChannelStore'
import { useSettingsStore } from '@/store/useSettingsStore'

/**
 * Addendum 3 §7 · stream verification for the live hero.
 *
 * Stage 1 (main process): manifest + first-segment range fetch.
 * Stage 2 (renderer, authoritative): hidden muted hls.js player must produce a
 * videoWidth and two frames with at least 0.4s of currentTime progress.
 *
 * The URL comes from the same `channelService.getStream` call the player makes,
 * so the relay session and header injection path are identical.
 */

const OK_TTL_MS = 5 * 60_000
const FAIL_TTL_MS = 10 * 60_000
const TOTAL_TIMEOUT_MS = 8000
const CONCURRENCY = 3
const SLATE_WIDTH = 32
const SLATE_HEIGHT = 18
const SLATE_MIN_LUMINANCE = 0.004

interface ProbeCacheEntry {
  ok: boolean
  expires: number
}

const cache = new Map<string, ProbeCacheEntry>()
const lastStreams = new Map<string, { stream: StreamInfo; at: number }>()

const activeProbes = new Map<string, () => void>()

export function createHeroHls(): Hls {
  return new Hls({
    enableWorker: true,
    lowLatencyMode: false,
    maxBufferLength: 8,
    maxMaxBufferLength: 12,
    backBufferLength: 5,
    capLevelToPlayerSize: false,
    startLevel: -1,
    abrEwmaDefaultEstimate: 2_000_000
  })
}

/** Caps ABR at 720p and starts at the lowest level at or above 360p. */
export function applyHeroLevelCaps(hls: Hls): void {
  const levels = hls.levels
  if (!levels || levels.length === 0) return
  const withHeight = levels
    .map((level, index) => ({ level, index }))
    .filter((item) => Number.isFinite(item.level.height) && item.level.height > 0)
  const candidates = withHeight.length > 0 ? withHeight : levels.map((level, index) => ({ level, index }))
  const capped = [...candidates].reverse().find((item) => (item.level.height || Infinity) <= 720)
  // If every level is above 720p, pin the lowest one rather than the highest.
  hls.autoLevelCapping = capped ? capped.index : candidates[0].index
  const lowest = candidates.find((item) => (item.level.height || 0) >= 360)
  hls.startLevel = lowest ? lowest.index : candidates[0].index
  if (hls.media) hls.startLoad(-1)
}

async function stage1(url: string): Promise<boolean> {
  const bridge = getBridge()
  if (bridge) {
    const result = await bridge.streams.probeStage1(url)
    if (!result.ok) console.warn('[streamProbe] stage 1 failed', result.reason)
    return result.ok
  }
  // Browser-preview fallback: the real check lives in the main process.
  try {
    const response = await fetch(url)
    const text = await response.text()
    return response.ok && (text.trimStart().startsWith('#EXTM3U') || text.includes('<MPD'))
  } catch {
    return false
  }
}

function readSlateLuminance(video: HTMLVideoElement): number | null {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = SLATE_WIDTH
    canvas.height = SLATE_HEIGHT
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null
    context.drawImage(video, 0, 0, SLATE_WIDTH, SLATE_HEIGHT)
    const data = context.getImageData(0, 0, SLATE_WIDTH, SLATE_HEIGHT).data
    let total = 0
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255
      const g = data[i + 1] / 255
      const b = data[i + 2] / 255
      total += 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    return total / (data.length / 4)
  } catch {
    // Cross-origin without CORS: the canvas is tainted, so skip the check.
    return null
  }
}

type RvfcVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number) => void) => number
}

async function stage2(channelId: string, stream: StreamInfo, timeoutMs: number): Promise<boolean> {
  if (typeof document === 'undefined') return false
  if (!Hls.isSupported()) return false

  const video = document.createElement('video') as RvfcVideo
  video.muted = true
  video.autoplay = true
  video.playsInline = true
  video.setAttribute('aria-hidden', 'true')
  Object.assign(video.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '2px',
    height: '2px',
    opacity: '0',
    pointerEvents: 'none'
  } satisfies Partial<CSSStyleDeclaration>)
  document.body.appendChild(video)

  const hls = createHeroHls()
  let finished = false

  return await new Promise<boolean>((resolve) => {
    const deadline = setTimeout(() => finish(false), Math.max(1500, timeoutMs))

    const cleanup = (): void => {
      clearTimeout(deadline)
      try {
        hls.destroy()
      } catch {
        // already destroyed
      }
      video.removeAttribute('src')
      try {
        video.load()
      } catch {
        // ignore
      }
      video.remove()
    }

    const finish = (ok: boolean): void => {
      if (finished) return
      finished = true
      if (activeProbes.get(channelId) === cancel) activeProbes.delete(channelId)
      cleanup()
      resolve(ok)
    }

    const cancel = (): void => finish(false)
    activeProbes.set(channelId, cancel)

    hls.on(HlsEvents.MANIFEST_PARSED, () => {
      applyHeroLevelCaps(hls)
      void video.play().catch(() => finish(false))
    })
    hls.on(HlsEvents.ERROR, (_event, data) => {
      if (data.fatal) {
        if (data.type === ErrorTypes.NETWORK_ERROR) hls.startLoad()
        else finish(false)
      }
    })
    hls.on(HlsEvents.LEVEL_LOADED, () => {
      if (video.currentTime === 0 && typeof hls.liveSyncPosition === 'number') {
        video.currentTime = hls.liveSyncPosition
      }
    })

    let frames = 0
    let firstTime = -1
    let firstFrameAt = 0

    const evaluate = (): void => {
      if (finished) return
      if (video.videoWidth <= 0) return
      if (frames < 2 || firstTime < 0) return
      if (video.currentTime - firstTime < 0.4) {
        // Watchdog: if frames advance too slowly, fail within the deadline.
        if (firstFrameAt > 0 && performance.now() - firstFrameAt > 6000) finish(false)
        return
      }
      const luminance = readSlateLuminance(video)
      if (luminance !== null && luminance < SLATE_MIN_LUMINANCE) {
        finish(false)
        return
      }
      finish(true)
    }

    const onFrame = (): void => {
      if (finished) return
      frames += 1
      if (frames === 1) {
        firstTime = video.currentTime
        firstFrameAt = performance.now()
      }
      evaluate()
      schedule()
    }

    const schedule = (): void => {
      if (finished) return
      if (video.requestVideoFrameCallback) {
        video.requestVideoFrameCallback(onFrame)
      } else {
        video.addEventListener('timeupdate', onFrame, { once: true })
      }
    }
    schedule()

    hls.loadSource(stream.url)
    hls.attachMedia(video)
  })
}

async function resolveStream(channelId: string): Promise<StreamInfo | null> {
  const { channels } = useChannelStore.getState()
  const channel = channels.find((item) => item.id === channelId)
  if (!channel) return null
  const settings = useSettingsStore.getState()
  try {
    const stream = await channelService.getStream(channel, settings.mode, settings.defaultQuality)
    lastStreams.set(channelId, { stream, at: Date.now() })
    return stream
  } catch (error) {
    console.warn(`[streamProbe] resolve failed for ${channelId}`, error)
    return null
  }
}

async function verifyInternal(channelId: string, stream: StreamInfo | null): Promise<boolean> {
  const resolved = stream ?? (await resolveStream(channelId))
  if (!resolved) return false
  const stage1Ok = await stage1(resolved.url)
  if (!stage1Ok) return false
  // For standard non-DRM HLS streams, run stage2 video frame progress check
  if (resolved.type === 'hls' && !resolved.isDrm) {
    return await stage2(channelId, resolved, TOTAL_TIMEOUT_MS)
  }
  // DASH and DRM streams are verified via stage 1 manifest accessibility
  return true
}

function withTimeout<T>(promise: Promise<T>, ms: number, channelId: string): Promise<T | false> {
  return new Promise<T | false>((resolve) => {
    const timer = setTimeout(() => {
      activeProbes.get(channelId)?.()
      resolve(false)
    }, ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve(false)
      }
    )
  })
}

// ---------------------------------------------------------------------------
// Concurrency scheduler (3 at a time)
// ---------------------------------------------------------------------------

let running = 0
const waiting: Array<() => void> = []

function schedule<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = (): void => {
      running += 1
      task().then(resolve, reject).finally(() => {
        running -= 1
        const next = waiting.shift()
        if (next) next()
      })
    }
    if (running < CONCURRENCY) start()
    else waiting.push(start)
  })
}

export const streamProbe = {
  /** Cached verdict, if still fresh. */
  cached(channelId: string): boolean | undefined {
    const entry = cache.get(channelId)
    if (!entry) return undefined
    if (entry.expires < Date.now()) {
      cache.delete(channelId)
      return undefined
    }
    return entry.ok
  },

  async verify(channelId: string): Promise<boolean> {
    const cached = streamProbe.cached(channelId)
    if (cached !== undefined) return cached
    const result = await schedule(() => withTimeout(verifyInternal(channelId, null), TOTAL_TIMEOUT_MS, channelId))
    const ok = result === true
    cache.set(channelId, { ok, expires: Date.now() + (ok ? OK_TTL_MS : FAIL_TTL_MS) })
    return ok
  },

  /** Used by the watchdog and handoff failures. */
  markFailure(channelId: string): void {
    cache.set(channelId, { ok: false, expires: Date.now() + FAIL_TTL_MS })
    lastStreams.delete(channelId)
  },

  lastStream(channelId: string): StreamInfo | null {
    const entry = lastStreams.get(channelId)
    return entry ? entry.stream : null
  },

  setStreamHandoff(channelId: string, stream: StreamInfo): void {
    lastStreams.set(channelId, { stream, at: Date.now() })
  },

  /** Destroys every hidden probe player immediately (hero handoff). */
  destroyProbePlayers(): void {
    for (const cancel of [...activeProbes.values()]) cancel()
    activeProbes.clear()
  },

  clear(): void {
    cache.clear()
    lastStreams.clear()
  }
}
