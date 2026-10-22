import type { Channel } from '@shared/types'
import type { LogoPipelineTier, LogoPipelineFlag, LogoBbox, LogoLayout } from './pipeline'
import { computeLogoLayout } from './pipeline'
import overridesJson from '@/logo-overrides.json'
import { getBridge } from '@/services/api'

/**
 * Addendum 3 · logo orchestration.
 *
 * - Bytes are fetched by the main process (`asset:fetch`) so canvases stay
 *   untainted and webSecurity remains enabled.
 * - Decoding/normalizing happens in a dedicated worker with OffscreenCanvas.
 * - Results are cached in IndexedDB keyed by sha1(url) + PIPELINE_VERSION.
 * - Visible tiles jump the queue; off-screen tiles are processed when idle.
 */

type LogoPriority = 'visible' | 'idle'

export interface LogoOverride {
  url?: string
  tier?: LogoPipelineTier
}

const overrides = overridesJson as Record<string, LogoOverride>

export interface LogoSpec {
  tier: LogoPipelineTier
  flags: LogoPipelineFlag[]
  bbox: LogoBbox
  sourceWidth: number
  sourceHeight: number
  imageWidth: number
  imageHeight: number
  alphaCoverage: number
  inkCoverage: number
  inkLuminance: number
  inkStdDev: number
  darkShare: number
  meanLuminance: number
  aspect: number
  centroidX: number
  centroidY: number
  normalized: LogoLayout
}

export interface ProcessedLogo {
  channelId: string
  url: string
  tier: LogoPipelineTier
  flags: LogoPipelineFlag[]
  spec: LogoSpec | null
  objectUrl: string | null
}

interface CachedRecord {
  key: string
  url: string
  tier: LogoPipelineTier
  flags: LogoPipelineFlag[]
  spec: LogoSpec | null
  blob: Blob | null
  savedAt: number
}

interface WorkerJob {
  id: number
  channelId: string
  bytes: ArrayBuffer
  mimeType: string
  forceTier?: LogoPipelineTier
  tileSize: number
  areaFactor: number
}

interface WorkerReply {
  id: number
  ok: boolean
  error?: string
  result?: LogoSpec
  blob?: Blob
}

const PIPELINE_VERSION = 5
const DB_NAME = 'jiotv-logo-pipeline'
const DB_VERSION = 3
const STORE = 'logos'
const TILE_SIZE = 144
const VISIBLE_CONCURRENCY = 2

const memory = new Map<string, ProcessedLogo>()
const pending = new Map<string, Promise<ProcessedLogo>>()
let databasePromise: Promise<IDBDatabase | null> | null = null

function openDatabase(): Promise<IDBDatabase | null> {
  if (databasePromise) return databasePromise
  databasePromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (event) => {
      const db = request.result
      if (event.oldVersion < 3 && db.objectStoreNames.contains(STORE)) {
        db.deleteObjectStore(STORE)
      }
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      console.warn('[logo] IndexedDB unavailable', request.error)
      resolve(null)
    }
  })
  return databasePromise
}

const LOGO_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000 // 6 hours

async function readRecord(key: string): Promise<CachedRecord | null> {
  const db = await openDatabase()
  if (!db) return null
  return new Promise((resolve) => {
    const transaction = db.transaction(STORE, 'readonly')
    const request = transaction.objectStore(STORE).get(key)
    request.onsuccess = () => {
      const record = request.result as CachedRecord | undefined
      if (!record) return resolve(null)
      if (record.savedAt && Date.now() - record.savedAt > LOGO_CACHE_MAX_AGE_MS) {
        return resolve(null) // expired entry, re-process
      }
      resolve(record)
    }
    request.onerror = () => resolve(null)
  })
}

async function writeRecord(record: CachedRecord): Promise<void> {
  const db = await openDatabase()
  if (!db) return
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE, 'readwrite')
    transaction.objectStore(STORE).put(record)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => resolve()
    transaction.onabort = () => resolve()
  })
}

async function sha1Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-1', bytes)
    return Array.from(new Uint8Array(digest))
      .map((part) => part.toString(16).padStart(2, '0'))
      .join('')
  }
  // Defensive fallback for exotic dev browsers. Electron always has subtle.
  let hash = 2166136261
  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function normaliseSource(raw: string): string {
  const value = raw.trim()
  if (!value) return ''
  if (/^(https?:|data:|file:|\/)/i.test(value)) return value
  if (value.startsWith('//')) return `https:${value}`
  return `https://jiotv.catchup.cdn.jio.com/dare_images/images/${encodeURIComponent(value)}`
}

export function getLogoOverride(channelId: string): LogoOverride | undefined {
  return overrides[channelId]
}

export function resolveLogoUrl(channel: Pick<Channel, 'id' | 'logoUrl'>): string {
  const override = overrides[channel.id]
  return normaliseSource(override?.url ?? channel.logoUrl)
}

function recordToLogo(
  channelId: string,
  url: string,
  record: Pick<CachedRecord, 'tier' | 'flags' | 'spec' | 'blob'>
): ProcessedLogo {
  return {
    channelId,
    url,
    tier: record.tier,
    flags: record.flags ?? [],
    spec: record.spec ?? null,
    objectUrl: record.blob ? URL.createObjectURL(record.blob) : null
  }
}

function monogram(channelId: string, url: string): ProcessedLogo {
  return {
    channelId,
    url,
    tier: 'monogram',
    flags: [],
    spec: null,
    objectUrl: null
  }
}

// ---------------------------------------------------------------------------
// Worker request queue
// ---------------------------------------------------------------------------

class LogoWorkerQueue {
  private worker: Worker | null = null
  private sequence = 0
  private active = 0
  private high: Array<{ job: WorkerJob; resolve: (reply: WorkerReply) => void }> = []
  private low: Array<{ job: WorkerJob; resolve: (reply: WorkerReply) => void }> = []
  private idleScheduled = false
  private readonly replies = new Map<number, (reply: WorkerReply) => void>()

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    this.worker = new Worker(new URL('../../workers/logoWorker.ts', import.meta.url), {
      type: 'module'
    })
    this.worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data
      const resolve = this.replies.get(reply.id)
      if (resolve) {
        this.replies.delete(reply.id)
        resolve(reply)
      }
      this.active = Math.max(0, this.active - 1)
      this.pump()
    }
    this.worker.onerror = (event) => {
      console.warn('[logo] worker error', event.message)
    }
    return this.worker
  }

  enqueue(
    job: Omit<WorkerJob, 'id'>,
    priority: LogoPriority
  ): Promise<WorkerReply> {
    const id = (this.sequence += 1)
    const request = { ...job, id }
    return new Promise((resolve) => {
      const entry = { job: request, resolve }
      if (priority === 'visible') this.high.push(entry)
      else this.low.push(entry)
      this.pump()
    })
  }

  private pump(): void {
    if (this.active >= VISIBLE_CONCURRENCY) return
    const entry = this.high.shift() ?? null
    if (entry) {
      this.run(entry)
      return
    }
    if (this.low.length === 0) return
    if (this.idleScheduled) return
    this.idleScheduled = true
    const schedule = (): void => {
      this.idleScheduled = false
      const next = this.low.shift()
      if (next) this.run(next)
      if (this.low.length > 0) this.pump()
    }
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(schedule, { timeout: 1200 })
    } else {
      setTimeout(schedule, 80)
    }
  }

  private run(entry: { job: WorkerJob; resolve: (reply: WorkerReply) => void }): void {
    this.active += 1
    const worker = this.ensureWorker()
    this.replies.set(entry.job.id, entry.resolve)
    worker.postMessage(entry.job, [entry.job.bytes])
  }
}

const queue = new LogoWorkerQueue()

async function fetchBytes(url: string): Promise<{ bytes: ArrayBuffer; mimeType: string } | null> {
  if (/^(data:|\/)/i.test(url)) {
    try {
      const response = await fetch(url)
      if (!response.ok && !url.startsWith('data:')) return null
      return { bytes: await response.arrayBuffer(), mimeType: response.headers.get('content-type') ?? 'image/png' }
    } catch {
      return null
    }
  }
  const bridge = getBridge()
  if (bridge) {
    const result = await bridge.assets.fetch(url)
    if (!result.ok) {
      console.warn('[logo] asset fetch failed', url, result.error)
      return null
    }
    const raw = result.data.bytes
    let arrayBuffer: ArrayBuffer
    if (raw instanceof Uint8Array) {
      arrayBuffer = raw.buffer.slice(
        raw.byteOffset,
        raw.byteOffset + raw.byteLength
      ) as ArrayBuffer
    } else if (
      raw &&
      typeof raw === 'object' &&
      'buffer' in raw &&
      (raw as { buffer: unknown }).buffer instanceof ArrayBuffer
    ) {
      const u8 = new Uint8Array(
        (raw as { buffer: ArrayBuffer }).buffer,
        (raw as { byteOffset?: number }).byteOffset ?? 0,
        (raw as { byteLength?: number }).byteLength
      )
      arrayBuffer = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
    } else if (raw && Array.isArray((raw as { data?: unknown }).data)) {
      arrayBuffer = new Uint8Array((raw as { data: number[] }).data).buffer
    } else {
      console.warn('[logo] unrecognized bytes payload type', raw)
      return null
    }
    return {
      bytes: arrayBuffer,
      mimeType: result.data.mimeType
    }
  }
  // Browser-only preview fallback. CSP still restricts remote images outside
  // Electron, but this keeps `dev:web` useful for UI work.
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    return { bytes: await response.arrayBuffer(), mimeType: response.headers.get('content-type') ?? '' }
  } catch {
    return null
  }
}

async function processLogo(
  channel: Pick<Channel, 'id' | 'logoUrl'>,
  priority: LogoPriority
): Promise<ProcessedLogo> {
  const override = getLogoOverride(channel.id)
  const url = resolveLogoUrl(channel)
  if (!url) return monogram(channel.id, '')
  if (override?.tier === 'monogram') return monogram(channel.id, url)

  const key = `${await sha1Hex(url)}:${PIPELINE_VERSION}${override?.tier ? `:${override.tier}` : ''}`
  const cached = memory.get(key)
  if (cached) return cached

  const record = await readRecord(key)
  if (record) {
    const logo = recordToLogo(channel.id, url, record)
    memory.set(key, logo)
    return logo
  }

  const fetched = await fetchBytes(url)
  if (!fetched) {
    const failed = monogram(channel.id, url)
    memory.set(key, failed)
    return failed
  }
  const reply = await queue.enqueue(
    {
      channelId: channel.id,
      bytes: fetched.bytes,
      mimeType: fetched.mimeType,
      forceTier: override?.tier,
      tileSize: TILE_SIZE,
      areaFactor: 0.22
    },
    priority
  )

  if (!reply.result || !reply.ok || !reply.blob) {
    const rejected = monogram(channel.id, url)
    memory.set(key, rejected)
    if (reply.result && reply.result.tier === 'monogram') {
      const failureRecord: CachedRecord = {
        key,
        url,
        tier: 'monogram',
        flags: reply.result?.flags ?? [],
        spec: reply.result ?? null,
        blob: null,
        savedAt: Date.now()
      }
      await writeRecord(failureRecord)
    }
    return rejected
  }

  const stored: CachedRecord = {
    key,
    url,
    tier: reply.result.tier,
    flags: reply.result.flags,
    spec: reply.result,
    blob: reply.blob,
    savedAt: Date.now()
  }
  const logo = recordToLogo(channel.id, url, stored)
  memory.set(key, logo)
  await writeRecord(stored)
  return logo
}

export function getProcessedLogo(
  channel: Pick<Channel, 'id' | 'logoUrl'>,
  priority: LogoPriority = 'idle'
): Promise<ProcessedLogo> {
  const url = resolveLogoUrl(channel)
  const override = getLogoOverride(channel.id)
  const identity = `${channel.id}|${url}|${override?.tier ?? ''}`
  const existing = pending.get(identity)
  if (existing) return existing
  const promise = processLogo(channel, priority).finally(() => pending.delete(identity))
  pending.set(identity, promise)
  return promise
}

export function getLogoBox(spec: LogoSpec, areaFactor: number, tileSize = TILE_SIZE): LogoLayout {
  if (areaFactor === spec.normalized.areaFactor && tileSize === spec.normalized.tileSize) {
    return spec.normalized
  }
  return computeLogoLayout(
    {
      width: spec.imageWidth,
      height: spec.imageHeight,
      nativeWidth: spec.imageWidth,
      nativeHeight: spec.imageHeight,
      meanLuminance: spec.meanLuminance,
      centroidX: spec.centroidX,
      centroidY: spec.centroidY
    },
    tileSize,
    areaFactor
  )
}

export function clearLogoCache(): void {
  for (const logo of memory.values()) {
    if (logo.objectUrl) URL.revokeObjectURL(logo.objectUrl)
  }
  memory.clear()
}
