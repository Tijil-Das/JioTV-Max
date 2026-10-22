import { useEffect, useState } from 'react'

export interface LogoBbox {
  x: number
  y: number
  width: number
  height: number
}

export interface CachedLogoMetrics {
  src: string
  bbox: LogoBbox
  nativeWidth: number
  nativeHeight: number
  /** Mean luminance of alpha-bearing pixels (0 to 1) */
  luminance: number
  /** Alpha-weighted density inside bounding box (0 to 1) */
  density: number
  /** True when logo is dark / low contrast (luminance < 0.28) */
  useLightPlate: boolean
  /** Visual mass center offset relative to bbox center, in percent of bbox width (-15 to +15) */
  shiftXPercent: number
  /** Visual mass center offset relative to bbox center, in percent of bbox height (-15 to +15) */
  shiftYPercent: number
  /** Normalized width percent of plate (40% to 68%) */
  widthPercent: number
  /** Aspect ratio: bbox.width / bbox.height */
  aspect: number
  timestamp: number
}

// In-memory cache for fast synchronous access
const memoryCache = new Map<string, CachedLogoMetrics>()
const pendingPromises = new Map<string, Promise<CachedLogoMetrics | null>>()

const DB_NAME = 'jiotv_logo_metrics_v2'
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

/**
 * Measures the image pixels on a canvas to compute:
 * - Content bounding box (crops transparent/empty padding)
 * - Mean luminance (alpha-weighted)
 * - Density inside bbox (reference 0.35)
 * - Visual center of mass offset
 * - Aspect-normalized scale factor (equalizes wide wordmarks vs tall emblems)
 * - Irradiation compensation for bright logos
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
        let canvas: HTMLCanvasElement | OffscreenCanvas
        let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null

        if (typeof OffscreenCanvas !== 'undefined') {
          canvas = new OffscreenCanvas(nativeWidth, nativeHeight)
          ctx = canvas.getContext('2d', { willReadFrequently: true })
        } else {
          canvas = document.createElement('canvas')
          canvas.width = nativeWidth
          canvas.height = nativeHeight
          ctx = canvas.getContext('2d', { willReadFrequently: true })
        }

        if (!ctx) {
          resolve(null)
          return
        }

        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, nativeWidth, nativeHeight)
        const data = imageData.data

        // 1. Scan for true bounding box (crop empty/transparent padding)
        let minX = nativeWidth
        let minY = nativeHeight
        let maxX = -1
        let maxY = -1

        const alphaThreshold = 10

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

        if (maxX < minX || maxY < minY) {
          const fallback: CachedLogoMetrics = {
            src,
            bbox: { x: 0, y: 0, width: nativeWidth, height: nativeHeight },
            nativeWidth,
            nativeHeight,
            luminance: 0.5,
            density: 0.35,
            useLightPlate: false,
            shiftXPercent: 0,
            shiftYPercent: 0,
            widthPercent: 54,
            aspect: nativeWidth / nativeHeight,
            timestamp: Date.now()
          }
          resolve(fallback)
          return
        }

        const cropWidth = maxX - minX + 1
        const cropHeight = maxY - minY + 1
        const bbox: LogoBbox = { x: minX, y: minY, width: cropWidth, height: cropHeight }

        // 2. Mean luminance, density & visual center of mass inside bbox
        let totalAlpha = 0
        let weightedX = 0
        let weightedY = 0
        let weightedLum = 0
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
            }
          }
        }

        const bboxCenterX = minX + cropWidth / 2
        const bboxCenterY = minY + cropHeight / 2
        const visualCenterX = totalAlpha > 0 ? weightedX / totalAlpha : bboxCenterX
        const visualCenterY = totalAlpha > 0 ? weightedY / totalAlpha : bboxCenterY

        // Centering offset: translate visual mass center to container center
        const dx = bboxCenterX - visualCenterX
        const dy = bboxCenterY - visualCenterY
        const shiftXPercent = Math.max(-15, Math.min(15, (dx / cropWidth) * 100))
        const shiftYPercent = Math.max(-15, Math.min(15, (dy / cropHeight) * 100))

        const luminance = totalAlpha > 0 ? weightedLum / totalAlpha : 0.5
        const density = filledCount / (cropWidth * cropHeight)

        // Contrast handling: dark / low-contrast logos switch to light plate (#E9E9EC)
        const useLightPlate = luminance < 0.28

        // Aspect ratio normalization:
        // Reference frame: 64% of tile width x 34% of tile height (ratio ~2.51)
        const aspect = cropWidth / cropHeight
        const baseWidthPercent =
          aspect >= 2.5 ? 64 : 64 * Math.pow(Math.max(0.6, aspect) / 2.5, 0.38)

        // Density compensation: reference density 0.35
        const densityComp = Math.pow(0.35 / Math.max(0.18, Math.min(0.8, density)), 0.16)

        // Light-on-dark irradiation: bright logos on dark plate appear larger
        const irradiationComp = !useLightPlate && luminance > 0.65 ? 0.93 : 1.0

        let widthPercent = baseWidthPercent * densityComp * irradiationComp
        // Clamped strictly between 40% and 68% of plate width
        widthPercent = Math.max(40, Math.min(68, Math.round(widthPercent * 10) / 10))

        const metrics: CachedLogoMetrics = {
          src,
          bbox,
          nativeWidth,
          nativeHeight,
          luminance,
          density,
          useLightPlate,
          shiftXPercent,
          shiftYPercent,
          widthPercent,
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
  const [metrics, setMetrics] = useState<CachedLogoMetrics | null>(() => getLogoMetricsSync(src) ?? null)
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
        if (res) {
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
