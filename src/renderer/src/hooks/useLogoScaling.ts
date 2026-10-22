import { useState, useEffect } from 'react'

const aspectCache = new Map<string, number>()

/**
 * Computes PINF scale multiplier: (width / height) ** scaleFactor, clamped [minScale, maxScale].
 */
export function computePinfScale(
  width: number,
  height: number,
  scaleFactor = 0.5,
  minScale = 0.85,
  maxScale = 1.25
): number {
  if (!width || !height) return 1
  const aspectRatio = width / height
  const rawScale = Math.pow(aspectRatio, scaleFactor)
  return Math.max(minScale, Math.min(maxScale, rawScale))
}

/**
 * Proportional Image Normalization Formula (PINF) Hook.
 * Dynamically calculates a transform: scale() for each logo based on its intrinsic aspect ratio,
 * ensuring all logos have uniform optical weight.
 */
export function useLogoScaling(
  src?: string | null,
  scaleFactor = 0.5,
  minScale = 0.85,
  maxScale = 1.25
): number {
  const [scale, setScale] = useState<number>(() => {
    if (!src) return 1
    const cached = aspectCache.get(src)
    if (cached !== undefined) {
      return computePinfScale(cached, 1, scaleFactor, minScale, maxScale)
    }
    return 1
  })

  useEffect(() => {
    if (!src) return
    const cached = aspectCache.get(src)
    if (cached !== undefined) {
      setScale(computePinfScale(cached, 1, scaleFactor, minScale, maxScale))
      return
    }

    if (typeof Image === 'undefined') return

    const img = new Image()
    img.src = src
    img.onload = () => {
      const naturalWidth = img.naturalWidth || 1
      const naturalHeight = img.naturalHeight || 1
      const aspectRatio = naturalWidth / naturalHeight
      aspectCache.set(src, aspectRatio)
      const calculated = computePinfScale(aspectRatio, 1, scaleFactor, minScale, maxScale)
      setScale(calculated)
    }
  }, [src, scaleFactor, minScale, maxScale])

  return scale
}
