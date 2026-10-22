import { useEffect, useState } from 'react'

export type LogoProcessingTier = 'as-is' | 'white-knockout' | 'neutral-halo'

export interface LogoBbox {
  x: number
  y: number
  width: number
  height: number
}

export interface CachedLogoMetrics {
  src: string
  /** Processed image source (data URL for white knockout or cleaned asset; original src for as-is) */
  processedSrc: string
  /** Chosen processing tier per Addendum 2 Section 2 */
  tier: LogoProcessingTier
  bbox: LogoBbox
  nativeWidth: number
  nativeHeight: number
  /** Mean luminance of alpha > 0.5 pixels (0 to 1) */
  luminance: number
  /** Mean HSV saturation of alpha > 0.5 pixels (0 to 1) */
  saturation: number
  /** Alpha-weighted density inside bounding box (0 to 1) */
  density: number
  /** Visual mass center offset relative to bbox center, in percent of bbox width (-15 to +15) */
  shiftXPercent: number
  /** Visual mass center offset relative to bbox center, in percent of bbox height (-15 to +15) */
  shiftYPercent: number
  /** Normalized logo box width percentage (56% of plate width per Section 1) */
  widthPercent: number
  /** Normalized logo box height percentage (38% of plate height per Section 1) */
  heightPercent: number
  /** Aspect ratio: bbox.width / bbox.height */
  aspect: number
  /** Flagged if opaque background removal failed */
  failed?: boolean
  timestamp: number
}

// In-memory cache for fast synchronous access
const memoryCache = new Map<string, CachedLogoMetrics>()
const pendingPromises = new Map<string, Promise<CachedLogoMetrics | null>>()

const DB_NAME = 'jiotv_logo_metrics_v3'
const STORE_NAME = 'metrics'

let dbPromise: Promise<IDBDatabase | null> | null = null

function getDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.resolve(null)
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1)
        req.onupgradeneeded = () => {
          const db = req.result
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'src' })
          }
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
  }
  return dbPromise
}

async function loadFromIDB(src: string): Promise<CachedLogoMetrics | null> {
  try {
    const db = await getDB()
    if (!db) return null
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const req = store.get(src)
        req.onsuccess = () => resolve(req.result ?? null)
        req.onerror = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
  } catch {
    return null
  }
}

async function saveToIDB(metrics: CachedLogoMetrics): Promise<void> {
  try {
    const db = await getDB()
    if (!db) return
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put(metrics)
  } catch {
    // Ignore IDB write failures (e.g. quota, private mode)
  }
}

/** Color distance helper */
function colorDist(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number
): number {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2)
}

/**
 * Removes solid near-white or near-black rectangle backgrounds via edge flood fill.
 * If removal fails or leaves empty content, returns false.
 */
function removeSolidBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number
): boolean {
  if (width < 8 || height < 8) return false

  // Sample 4 corners
  const corners = [
    0, // top-left
    (width - 1) * 4, // top-right
    (height - 1) * width * 4, // bottom-left
    ((height - 1) * width + (width - 1)) * 4 // bottom-right
  ]

  // All 4 corners must be opaque
  for (const idx of corners) {
    if (data[idx + 3] < 240) return false
  }

  const c0 = { r: data[corners[0]], g: data[corners[0] + 1], b: data[corners[0] + 2] }
  const c1 = { r: data[corners[1]], g: data[corners[1] + 1], b: data[corners[1] + 2] }
  const c2 = { r: data[corners[2]], g: data[corners[2] + 1], b: data[corners[2] + 2] }
  const c3 = { r: data[corners[3]], g: data[corners[3] + 1], b: data[corners[3] + 2] }

  // Check if all 4 corners are nearly identical
  const tolerance = 24
  if (
    colorDist(c0.r, c0.g, c0.b, c1.r, c1.g, c1.b) > tolerance ||
    colorDist(c0.r, c0.g, c0.b, c2.r, c2.g, c2.b) > tolerance ||
    colorDist(c0.r, c0.g, c0.b, c3.r, c3.g, c3.b) > tolerance
  ) {
    return false
  }

  const bgR = Math.round((c0.r + c1.r + c2.r + c3.r) / 4)
  const bgG = Math.round((c0.g + c1.g + c2.g + c3.g) / 4)
  const bgB = Math.round((c0.b + c1.b + c2.b + c3.b) / 4)

  // Must be near-white (> 220) or near-black (< 35)
  const isNearWhite = bgR > 220 && bgG > 220 && bgB > 220
  const isNearBlack = bgR < 35 && bgG < 35 && bgB < 35
  if (!isNearWhite && !isNearBlack) return false

  // Edge flood-fill with tolerance & 1px feathering
  const visited = new Uint8Array(width * height)
  const queue: number[] = []

  // Push all perimeter pixels
  for (let x = 0; x < width; x++) {
    queue.push(x, 0)
    queue.push(x, height - 1)
  }
  for (let y = 1; y < height - 1; y++) {
    queue.push(0, y)
    queue.push(width - 1, y)
  }

  let head = 0
  const matchTolerance = 30
  const featherTolerance = matchTolerance + 16

  while (head < queue.length) {
    const px = queue[head++]
    const py = queue[head++]
    const pIdx = py * width + px
    if (visited[pIdx]) continue
    visited[pIdx] = 1

    const dIdx = pIdx * 4
    const r = data[dIdx]
    const g = data[dIdx + 1]
    const b = data[dIdx + 2]
    const d = colorDist(r, g, b, bgR, bgG, bgB)

    if (d <= matchTolerance) {
      data[dIdx + 3] = 0 // completely transparent
      // expand to 4 neighbors
      if (px > 0 && !visited[pIdx - 1]) queue.push(px - 1, py)
      if (px < width - 1 && !visited[pIdx + 1]) queue.push(px + 1, py)
      if (py > 0 && !visited[pIdx - width]) queue.push(px, py - 1)
      if (py < height - 1 && !visited[pIdx + width]) queue.push(px, py + 1)
    } else if (d <= featherTolerance) {
      // 1px feather edge transition
      const featherFactor = (d - matchTolerance) / (featherTolerance - matchTolerance)
      data[dIdx + 3] = Math.round(data[dIdx + 3] * featherFactor)
    }
  }

  return true
}

/**
 * Measures the image pixels on a canvas to compute:
 * 1. Opaque background removal (solid near-white/near-black edge fill)
 * 2. Mean luminance L (0-1) and mean saturation S (0-1) on pixels with alpha > 0.5
 * 3. Processing tier:
 *    - L >= 0.30: as-is
 *    - L < 0.30 & S < 0.25: white knockout (#F4F4F5 @ 94% opacity)
 *    - L < 0.30 & S >= 0.25: neutral halo (70% circle, blurred 24px)
 * 4. Bounding box cropping, visual mass centering, and density compensation
 */
function measureLogoImage(src: string): Promise<CachedLogoMetrics | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'

    const cleanup = () => {
      img.onload = null
      img.onerror = null
    }

    img.onload = () => {
      cleanup()
      try {
        const nativeWidth = img.naturalWidth || 120
        const nativeHeight = img.naturalHeight || 120

        const canvas = document.createElement('canvas')
        canvas.width = nativeWidth
        canvas.height = nativeHeight
        const ctx = canvas.getContext('2d', { willReadFrequently: true })

        if (!ctx) {
          resolve(null)
          return
        }

        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, nativeWidth, nativeHeight)
        const data = imageData.data

        // 1. Opaque background removal first
        const bgRemoved = removeSolidBackground(data, nativeWidth, nativeHeight)

        // 2. Scan for true content bounding box (alpha > 127, i.e. alpha > 0.5)
        const alphaThreshold = 127
        let minX = nativeWidth
        let minY = nativeHeight
        let maxX = -1
        let maxY = -1

        for (let y = 0; y < nativeHeight; y++) {
          for (let x = 0; x < nativeWidth; x++) {
            const a = data[(y * nativeWidth + x) * 4 + 3]
            if (a > alphaThreshold) {
              if (x < minX) minX = x
              if (x > maxX) maxX = x
              if (y < minY) minY = y
              if (y > maxY) maxY = y
            }
          }
        }

        // If background removal left empty or asset has no pixels with alpha > 0.5
        if (maxX < minX || maxY < minY) {
          if (bgRemoved) {
            console.warn(`[StreamDeck] Channel asset background removal failed for: ${src}`)
          }
          const fallback: CachedLogoMetrics = {
            src,
            processedSrc: src,
            tier: 'as-is',
            bbox: { x: 0, y: 0, width: nativeWidth, height: nativeHeight },
            nativeWidth,
            nativeHeight,
            luminance: 0.5,
            saturation: 0,
            density: 0.35,
            shiftXPercent: 0,
            shiftYPercent: 0,
            widthPercent: 56,
            heightPercent: 38,
            aspect: nativeWidth / nativeHeight,
            failed: true,
            timestamp: Date.now()
          }
          resolve(fallback)
          return
        }

        const cropWidth = maxX - minX + 1
        const cropHeight = maxY - minY + 1
        const bbox: LogoBbox = { x: minX, y: minY, width: cropWidth, height: cropHeight }

        // 3. Compute mean luminance L and mean saturation S on alpha > 0.5 pixels
        let totalAlpha = 0
        let weightedX = 0
        let weightedY = 0
        let weightedLum = 0
        let weightedSat = 0
        let filledCount = 0

        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const idx = (y * nativeWidth + x) * 4
            const a = data[idx + 3]
            if (a > alphaThreshold) {
              filledCount++
              const weight = a / 255
              totalAlpha += weight
              weightedX += x * weight
              weightedY += y * weight

              // Relative luminance (sRGB standard Rec. 709)
              const r = data[idx] / 255
              const g = data[idx + 1] / 255
              const b = data[idx + 2] / 255
              const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
              weightedLum += lum * weight

              // HSV Saturation: (max - min) / max
              const maxC = Math.max(r, g, b)
              const minC = Math.min(r, g, b)
              const sat = maxC === 0 ? 0 : (maxC - minC) / maxC
              weightedSat += sat * weight
            }
          }
        }

        const luminance = totalAlpha > 0 ? weightedLum / totalAlpha : 0.5
        const saturation = totalAlpha > 0 ? weightedSat / totalAlpha : 0

        // 4. Processing tier selection per Addendum 2 Section 2
        let tier: LogoProcessingTier = 'as-is'
        if (luminance < 0.3) {
          if (saturation < 0.25) {
            tier = 'white-knockout'
          } else {
            tier = 'neutral-halo'
          }
        }

        // Apply white knockout if tier 2: fill with #F4F4F5 at 94% opacity
        let processedSrc = src
        if (tier === 'white-knockout') {
          for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
              const idx = (y * nativeWidth + x) * 4
              const a = data[idx + 3]
              if (a > 0) {
                data[idx] = 244 // #F4
                data[idx + 1] = 244 // #F4
                data[idx + 2] = 245 // #F5
                data[idx + 3] = Math.round(a * 0.94) // 94% opacity
              }
            }
          }
          ctx.putImageData(imageData, 0, 0)
          processedSrc = canvas.toDataURL('image/png')
        } else if (bgRemoved) {
          // If background was removed, export cleaned image
          ctx.putImageData(imageData, 0, 0)
          processedSrc = canvas.toDataURL('image/png')
        }

        // Visual mass centering
        const bboxCenterX = minX + cropWidth / 2
        const bboxCenterY = minY + cropHeight / 2
        const visualCenterX = totalAlpha > 0 ? weightedX / totalAlpha : bboxCenterX
        const visualCenterY = totalAlpha > 0 ? weightedY / totalAlpha : bboxCenterY

        const dx = bboxCenterX - visualCenterX
        const dy = bboxCenterY - visualCenterY
        const shiftXPercent = Math.max(-15, Math.min(15, (dx / cropWidth) * 100))
        const shiftYPercent = Math.max(-15, Math.min(15, (dy / cropHeight) * 100))

        const density = filledCount / (cropWidth * cropHeight)
        const aspect = cropWidth / cropHeight

        // Frame parameters per Section 1: Logo box is 56% width by 38% height
        const metrics: CachedLogoMetrics = {
          src,
          processedSrc,
          tier,
          bbox,
          nativeWidth,
          nativeHeight,
          luminance,
          saturation,
          density,
          shiftXPercent,
          shiftYPercent,
          widthPercent: 56,
          heightPercent: 38,
          aspect,
          timestamp: Date.now()
        }

        resolve(metrics)
      } catch {
        resolve(null)
      }
    }

    img.onerror = () => {
      cleanup()
      resolve(null)
    }

    img.src = src
  })
}

/**
 * Retrieves metrics from memory cache, IndexedDB, or computes them via canvas.
 */
export async function getOrMeasureLogoMetrics(src: string): Promise<CachedLogoMetrics | null> {
  if (!src) return null

  // 1. In-memory check
  const cached = memoryCache.get(src)
  if (cached) return cached

  // 2. Pending measurement check (deduplicate simultaneous requests)
  if (pendingPromises.has(src)) {
    return pendingPromises.get(src)!
  }

  const promise = (async () => {
    // 3. IndexedDB check
    const idbResult = await loadFromIDB(src)
    if (idbResult) {
      memoryCache.set(src, idbResult)
      pendingPromises.delete(src)
      return idbResult
    }

    // 4. Measure via canvas
    const fresh = await measureLogoImage(src)
    if (fresh) {
      memoryCache.set(src, fresh)
      void saveToIDB(fresh)
    }
    pendingPromises.delete(src)
    return fresh
  })()

  pendingPromises.set(src, promise)
  return promise
}

/**
 * Synchronous memory cache check for immediate rendering without layout jumps.
 */
export function getLogoMetricsSync(src?: string): CachedLogoMetrics | undefined {
  if (!src) return undefined
  return memoryCache.get(src)
}

/**
 * React hook to access normalized logo metrics.
 * Caches in IndexedDB and memory.
 */
export function useLogoMetrics(src?: string): {
  metrics: CachedLogoMetrics | null
  loading: boolean
  error: boolean
} {
  const [metrics, setMetrics] = useState<CachedLogoMetrics | null>(
    () => getLogoMetricsSync(src) ?? null
  )
  const [loading, setLoading] = useState<boolean>(() => Boolean(src && !getLogoMetricsSync(src)))
  const [error, setError] = useState<boolean>(false)

  useEffect(() => {
    if (!src) {
      setMetrics(null)
      setLoading(false)
      setError(false)
      return
    }

    const sync = getLogoMetricsSync(src)
    if (sync) {
      setMetrics(sync)
      setLoading(false)
      setError(false)
      return
    }

    let active = true
    setLoading(true)
    setError(false)

    getOrMeasureLogoMetrics(src)
      .then((res) => {
        if (!active) return
        if (res && !res.failed) {
          setMetrics(res)
          setError(false)
        } else {
          setError(true)
        }
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        setError(true)
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [src])

  return { metrics, loading, error }
}
