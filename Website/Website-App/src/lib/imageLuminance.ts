/**
 * Programmatic Dark Logo Detection & Dynamic Contrast
 *
 * Analyzes an image's pixel luminance using an offscreen canvas to detect
 * pure black or very dark channel logos (e.g., Eurosport HD, TEST5 HD, Yahoo! Finance).
 * Results are cached in-memory per URL so scrolling and re-renders don't re-analyze.
 */

const luminanceCache = new Map<string, boolean>()

/**
 * Calculates whether an image is predominantly dark based on relative luminance.
 *
 * @param imageUrl URL or object URL of the logo image
 * @param threshold Luminance threshold between 0-255 (default 50)
 * @returns Promise<boolean> true if average luminance of non-transparent pixels is below threshold
 */
export async function isImageDark(imageUrl: string, threshold = 50): Promise<boolean> {
  if (!imageUrl || typeof imageUrl !== 'string') return false

  const cached = luminanceCache.get(imageUrl)
  if (cached !== undefined) return cached

  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      try {
        const width = 32
        const height = 32
        let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null

        if (typeof OffscreenCanvas !== 'undefined') {
          const canvas = new OffscreenCanvas(width, height)
          ctx = canvas.getContext('2d')
        } else {
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          ctx = canvas.getContext('2d')
        }

        if (!ctx) {
          luminanceCache.set(imageUrl, false)
          resolve(false)
          return
        }

        ctx.drawImage(img, 0, 0, width, height)
        const imgData = ctx.getImageData(0, 0, width, height)
        const data = imgData.data

        let totalLuminance = 0
        let validPixels = 0

        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3]
          // Ignore transparent / near-transparent pixels
          if (alpha < 20) continue

          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]

          // ITU-R BT.709 relative luminance formula
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
          totalLuminance += lum
          validPixels += 1
        }

        // If image is completely transparent or has no visible pixels, consider it not dark
        if (validPixels === 0) {
          luminanceCache.set(imageUrl, false)
          resolve(false)
          return
        }

        const avgLuminance = totalLuminance / validPixels
        const dark = avgLuminance < threshold
        luminanceCache.set(imageUrl, dark)
        resolve(dark)
      } catch {
        luminanceCache.set(imageUrl, false)
        resolve(false)
      }
    }

    img.onerror = () => {
      luminanceCache.set(imageUrl, false)
      resolve(false)
    }

    img.src = imageUrl
  })
}
