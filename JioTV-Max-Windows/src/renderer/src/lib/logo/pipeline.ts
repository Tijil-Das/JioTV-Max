/**
 * Addendum 4 — channel logo pipeline (Pixel-Pure Icons Spec).
 *
 * The channel logo is the server's asset. We never repaint it.
 * ALLOWED, only these:
 * 1. Decode.
 * 2. Remove a solid near-white background, only if the image is fully opaque
 *    AND all four corners are near-white. Use a border-connected flood fill
 *    (ΔE76 < 6, 1px feather). Interior pixels are never touched, so white
 *    letters inside the logo survive.
 * 3. Trim fully transparent margins (alpha < 0.02).
 * 4. Uniform scaling (§3).
 * 5. Translation for optical centering.
 *
 * FORBIDDEN: any per-pixel color change inside the logo (knock-out, lift,
 * invert, tint, grayscale, rim/outline, halo, blend modes, CSS filters).
 */

export type LogoPipelineTier = 'asis' | 'monogram'

export type LogoPipelineFlag =
  | 'low-res'
  | 'low-contrast'
  | 'matted'
  | 'opaque-light'
  | 'monogram'

export interface RgbaImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface LogoBbox {
  x: number
  y: number
  width: number
  height: number
}

export interface LogoLayout {
  tileSize: number
  areaFactor: number
  width: number
  height: number
  widthRatio: number
  heightRatio: number
  areaRatio: number
  offsetX: number
  offsetY: number
  offsetXRatio: number
  offsetYRatio: number
  clamped: boolean
  upscaleCapped: boolean
}


export interface LogoPipelineResult {
  ok: boolean
  tier: LogoPipelineTier
  flags: LogoPipelineFlag[]
  reason?: string
  bbox: LogoBbox
  sourceWidth: number
  sourceHeight: number
  image?: RgbaImage
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

export interface LogoPipelineOptions {
  tileSize?: number
  areaFactor?: number
  forceTier?: 'asis' | 'monogram'
  channelId?: string
}

export const PIPELINE_VERSION = 6
export const PLATE_COLOR = { r: 14, g: 14, b: 16 } // #0E0E10
const WHITE_REF = { r: 255, g: 255, b: 255 }
const INK_ALPHA = 5 // alpha < 0.02 of 255 is <= 5

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

function srgbToLinear(channel: number): number {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance for sRGB channels. */
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

export function contrastRatio(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number }
): number {
  const la = relativeLuminance(a.r, a.g, a.b)
  const lb = relativeLuminance(b.r, b.g, b.b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

function rgbToLab(r: number, g: number, b: number): { l: number; a: number; b: number } {
  const rl = srgbToLinear(r)
  const gl = srgbToLinear(g)
  const bl = srgbToLinear(b)
  const x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / 0.95047
  const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175
  const z = (rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041) / 1.08883
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return { l: 116 * f(y) - 16, a: 500 * (f(x) - f(y)), b: 200 * (f(y) - f(z)) }
}

export function deltaE76(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number }
): number {
  const labA = rgbToLab(a.r, a.g, a.b)
  const labB = rgbToLab(b.r, b.g, b.b)
  return Math.sqrt((labA.l - labB.l) ** 2 + (labA.a - labB.a) ** 2 + (labA.b - labB.b) ** 2)
}

function isNearWhite(color: { r: number; g: number; b: number }): boolean {
  return deltaE76(color, WHITE_REF) < 6
}

function alphaCoverageOf(image: RgbaImage): number {
  const { data } = image
  let transparent = 0
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) transparent += 1
  }
  return transparent / (image.width * image.height)
}

function isFullyOpaque(image: RgbaImage): boolean {
  return alphaCoverageOf(image) < 0.005
}

function cornersNearWhite(image: RgbaImage): boolean {
  const { width, height, data } = image
  const corners = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: 0, y: height - 1 },
    { x: width - 1, y: height - 1 }
  ]
  return corners.every(({ x, y }) => {
    const idx = (y * width + x) * 4
    return isNearWhite({ r: data[idx], g: data[idx + 1], b: data[idx + 2] })
  })
}

/**
 * Step 2: Remove a solid near-white background using a border-connected flood
 * fill (ΔE76 < 6, 1px feather). Interior pixels are never touched, so white
 * letters inside the logo survive.
 */
function removeNearWhiteBackground(image: RgbaImage): boolean {
  const { width, height, data } = image
  const visited = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let qHead = 0
  let qTail = 0

  const pushCoord = (x: number, y: number): void => {
    const idx = y * width + x
    if (visited[idx]) return
    const pIdx = idx * 4
    if (isNearWhite({ r: data[pIdx], g: data[pIdx + 1], b: data[pIdx + 2] })) {
      visited[idx] = 1
      queue[qTail++] = idx
    }
  }

  // Enqueue all outer boundary pixels that match near-white
  for (let x = 0; x < width; x += 1) {
    pushCoord(x, 0)
    pushCoord(x, height - 1)
  }
  for (let y = 1; y < height - 1; y += 1) {
    pushCoord(0, y)
    pushCoord(width - 1, y)
  }

  if (qTail === 0) return false

  // 4-connected BFS flood fill
  while (qHead < qTail) {
    const idx = queue[qHead++]
    const x = idx % width
    const y = Math.floor(idx / width)

    if (x > 0) pushCoord(x - 1, y)
    if (x < width - 1) pushCoord(x + 1, y)
    if (y > 0) pushCoord(x, y - 1)
    if (y < height - 1) pushCoord(x, y + 1)
  }

  // Clear visited background pixels with 1px feather at the perimeter
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x
      if (!visited[idx]) continue

      const hasUnvisitedNeighbor =
        (x > 0 && !visited[idx - 1]) ||
        (x < width - 1 && !visited[idx + 1]) ||
        (y > 0 && !visited[idx - width]) ||
        (y < height - 1 && !visited[idx + width])

      const pIdx = idx * 4
      if (hasUnvisitedNeighbor) {
        const dE = deltaE76(
          { r: data[pIdx], g: data[pIdx + 1], b: data[pIdx + 2] },
          WHITE_REF
        )
        const featherAlpha = Math.round(clamp01((dE - 4) / 2) * 64)
        data[pIdx + 3] = featherAlpha
      } else {
        data[pIdx + 3] = 0
      }
    }
  }

  return true
}

/** Step 3: Trim fully transparent margins (alpha < 0.02, i.e. alpha <= 5). */
function findInkBbox(image: RgbaImage): LogoBbox | null {
  const { width, height, data } = image
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > INK_ALPHA) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < minX || maxY < minY) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

function cropImage(image: RgbaImage, bbox: LogoBbox): RgbaImage {
  const data = new Uint8ClampedArray(bbox.width * bbox.height * 4)
  for (let y = 0; y < bbox.height; y += 1) {
    const sourceStart = ((bbox.y + y) * image.width + bbox.x) * 4
    const targetStart = y * bbox.width * 4
    data.set(image.data.subarray(sourceStart, sourceStart + bbox.width * 4), targetStart)
  }
  return { data, width: bbox.width, height: bbox.height }
}


interface InkStats {
  inkCoverage: number
  meanLuminance: number
  stdDev: number
  darkShare: number
  centroidX: number
  centroidY: number
}

function measureInk(image: RgbaImage): InkStats {
  const { width, height, data } = image
  const area = width * height
  let inkPixels = 0
  let alphaWeight = 0
  let darkWeight = 0
  let lumWeight = 0
  let lumSqWeight = 0
  let cx = 0
  let cy = 0
  let centroidWeight = 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4
      const a = data[idx + 3]
      if (a <= INK_ALPHA) continue
      inkPixels += 1
      const weight = a / 255
      alphaWeight += weight
      const r = data[idx]
      const g = data[idx + 1]
      const b = data[idx + 2]
      const lum = relativeLuminance(r, g, b)
      lumWeight += lum * weight
      lumSqWeight += lum * lum * weight
      if (lum < 0.22) darkWeight += weight
      const lw = weight * (0.02 + lum)
      cx += x * lw
      cy += y * lw
      centroidWeight += lw
    }
  }

  const meanLuminance = alphaWeight > 0 ? lumWeight / alphaWeight : 0
  const variance =
    alphaWeight > 0 ? Math.max(0, lumSqWeight / alphaWeight - meanLuminance ** 2) : 0
  return {
    inkCoverage: inkPixels / area,
    meanLuminance,
    stdDev: Math.sqrt(variance),
    darkShare: alphaWeight > 0 ? darkWeight / alphaWeight : 0,
    centroidX: centroidWeight > 0 ? cx / centroidWeight : width / 2,
    centroidY: centroidWeight > 0 ? cy / centroidWeight : height / 2
  }
}

function checkLowContrast(image: RgbaImage): boolean {
  const { data } = image
  let inkCount = 0
  let lowContrastCount = 0
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a <= INK_ALPHA) continue
    inkCount += 1
    const alpha = a / 255
    const r = data[i] * alpha + PLATE_COLOR.r * (1 - alpha)
    const g = data[i + 1] * alpha + PLATE_COLOR.g * (1 - alpha)
    const b = data[i + 2] * alpha + PLATE_COLOR.b * (1 - alpha)
    if (contrastRatio({ r, g, b }, PLATE_COLOR) < 2.0) lowContrastCount += 1
  }
  return inkCount > 0 && lowContrastCount / inkCount > 0.4
}

/**
 * Normalizes a cropped logo into the target box according to Addendum 4 §3.
 *
 * Target bbox area = area factor × box area, width ∝ aspect^0.5.
 * Clamped: width ≤ 0.80 × box width, height ≤ 0.66 × box height.
 * Shortest side ≥ 40px unless clamped.
 * Never upscale raster > 1.25x native size (flag low-res).
 * Optical scale: opaque meanLum > 0.75 scales ×0.88; ink meanLum > 0.7 scales ×0.94.
 * Optical translate: luminance-weighted ink centroid offset clamped to ±5%.
 */
export function computeLogoLayout(
  input: {
    width: number
    height: number
    nativeWidth: number
    nativeHeight: number
    meanLuminance: number
    isOpaque?: boolean
    centroidX: number
    centroidY: number
  },
  boxSize = 144,
  areaFactor = 0.30
): LogoLayout {
  const aspect = input.width / input.height
  const boxArea = boxSize * boxSize
  const targetArea = areaFactor * boxArea

  let width = Math.sqrt(targetArea) * Math.sqrt(aspect)
  let height = width / aspect
  let clamped = false
  let upscaleCapped = false

  const maxWidth = boxSize * 0.8
  const maxHeight = boxSize * 0.66

  if (width > maxWidth) {
    width = maxWidth
    height = width / aspect
    clamped = true
  }
  if (height > maxHeight) {
    height = maxHeight
    width = height * aspect
    clamped = true
  }

  // Shortest side at least 40px unless clamped
  const shortest = Math.min(width, height)
  if (!clamped && shortest < 40) {
    const scale = 40 / shortest
    width *= scale
    height *= scale
    if (width > maxWidth) {
      width = maxWidth
      height = width / aspect
      clamped = true
    }
    if (height > maxHeight) {
      height = maxHeight
      width = height * aspect
      clamped = true
    }
  }

  // Never upscale a raster more than 1.25x native size
  const maxNativeWidth = input.nativeWidth * 1.25
  const maxNativeHeight = input.nativeHeight * 1.25
  if (width > maxNativeWidth || height > maxNativeHeight) {
    const scale = Math.min(maxNativeWidth / width, maxNativeHeight / height)
    width *= scale
    height *= scale
    upscaleCapped = true
    clamped = true
  }

  // Optical corrections (scale and position only):
  if (input.isOpaque && input.meanLuminance > 0.75) {
    width *= 0.88
    height *= 0.88
  } else if (input.meanLuminance > 0.7) {
    width *= 0.94
    height *= 0.94
  }

  const dx = (input.width / 2 - input.centroidX) * (width / input.width)
  const dy = (input.height / 2 - input.centroidY) * (height / input.height)
  const maxOffset = boxSize * 0.05
  const offsetX = Math.max(-maxOffset, Math.min(maxOffset, dx))
  const offsetY = Math.max(-maxOffset, Math.min(maxOffset, dy))

  return {
    tileSize: boxSize,
    areaFactor,
    width,
    height,
    widthRatio: width / boxSize,
    heightRatio: height / boxSize,
    areaRatio: (width * height) / (boxSize * boxSize),
    offsetX,
    offsetY,
    offsetXRatio: offsetX / boxSize,
    offsetYRatio: offsetY / boxSize,
    clamped,
    upscaleCapped
  }
}

function reject(
  base: Omit<LogoPipelineResult, 'ok' | 'tier' | 'imageWidth' | 'imageHeight'>,
  reason: string,
  flag: LogoPipelineFlag
): LogoPipelineResult {
  return {
    ...base,
    ok: false,
    tier: 'monogram',
    reason,
    flags: [...base.flags, flag],
    imageWidth: 0,
    imageHeight: 0
  }
}

export function runLogoPipeline(
  source: RgbaImage,
  options: LogoPipelineOptions = {}
): LogoPipelineResult {
  const tileSize = options.tileSize ?? 144
  const areaFactor = options.areaFactor ?? 0.3
  const image: RgbaImage = {
    data: new Uint8ClampedArray(source.data),
    width: source.width,
    height: source.height
  }
  const flags: LogoPipelineFlag[] = []
  const alphaCoverage = alphaCoverageOf(image)

  const emptyBase = {
    flags,
    bbox: { x: 0, y: 0, width: image.width, height: image.height },
    sourceWidth: image.width,
    sourceHeight: image.height,
    alphaCoverage,
    inkCoverage: 0,
    inkLuminance: 0,
    inkStdDev: 0,
    darkShare: 0,
    meanLuminance: 0,
    aspect: image.width / image.height,
    centroidX: image.width / 2,
    centroidY: image.height / 2,
    normalized: computeLogoLayout(
      {
        width: image.width,
        height: image.height,
        nativeWidth: image.width,
        nativeHeight: image.height,
        meanLuminance: 0,
        centroidX: image.width / 2,
        centroidY: image.height / 2
      },
      tileSize,
      areaFactor
    )
  }

  if (options.forceTier === 'monogram') {
    return reject({ ...emptyBase, reason: 'override' }, 'monogram override', 'monogram')
  }
  if (image.width < 1 || image.height < 1) {
    return reject({ ...emptyBase, reason: 'empty' }, 'empty image', 'monogram')
  }

  const opaque = isFullyOpaque(image)
  let matted = false

  // Step 2: Remove solid near-white background ONLY if fully opaque AND all 4 corners near-white
  if (opaque && cornersNearWhite(image)) {
    matted = removeNearWhiteBackground(image)
    if (matted) flags.push('matted')
  }

  // Step 3: Trim fully transparent margins (alpha < 0.02)
  const bbox = findInkBbox(image)
  if (!bbox) {
    return reject({ ...emptyBase, reason: 'no ink' }, 'no ink', 'monogram')
  }
  if (bbox.width < 16 || bbox.height < 16) {
    return reject(
      { ...emptyBase, bbox, reason: 'bbox under 16px' },
      'bbox under 16px',
      'monogram'
    )
  }

  // Crop byte-for-byte
  const cropped = cropImage(image, bbox)
  const ink = measureInk(cropped)

  if (ink.inkCoverage < 0.015) {
    return reject(
      { ...emptyBase, bbox, inkCoverage: ink.inkCoverage, reason: 'ink under 1.5%' },
      'ink under 1.5%',
      'monogram'
    )
  }

  // Check solid slab (plain uniform background with no discernible logo)
  if (!matted && opaque && ink.inkCoverage > 0.95 && ink.stdDev < 0.03) {
    return reject(
      {
        ...emptyBase,
        bbox,
        inkCoverage: ink.inkCoverage,
        inkLuminance: ink.meanLuminance,
        inkStdDev: ink.stdDev,
        darkShare: ink.darkShare,
        meanLuminance: ink.meanLuminance,
        reason: 'solid slab'
      },
      'solid slab',
      'monogram'
    )
  }

  // Contrast check (§1): Low contrast is flagged, NOT repaired
  if (checkLowContrast(cropped)) {
    flags.push('low-contrast')
  }

  // Opaque glare check (§3)
  if (opaque && !matted && ink.meanLuminance > 0.75) {
    flags.push('opaque-light')
  }

  const normalized = computeLogoLayout(
    {
      width: cropped.width,
      height: cropped.height,
      nativeWidth: cropped.width,
      nativeHeight: cropped.height,
      meanLuminance: ink.meanLuminance,
      isOpaque: opaque && !matted,
      centroidX: ink.centroidX,
      centroidY: ink.centroidY
    },
    tileSize,
    areaFactor
  )

  if (normalized.upscaleCapped) flags.push('low-res')

  return {
    ok: true,
    tier: 'asis',
    flags,
    bbox,
    sourceWidth: source.width,
    sourceHeight: source.height,
    image: cropped,
    imageWidth: cropped.width,
    imageHeight: cropped.height,
    alphaCoverage,
    inkCoverage: ink.inkCoverage,
    inkLuminance: ink.meanLuminance,
    inkStdDev: ink.stdDev,
    darkShare: ink.darkShare,
    meanLuminance: ink.meanLuminance,
    aspect: cropped.width / cropped.height,
    centroidX: ink.centroidX,
    centroidY: ink.centroidY,
    normalized
  }
}

/** Solid slab predicate used by the fixture tests. */
export function isSolidSlab(result: LogoPipelineResult): boolean {
  return (
    result.ok &&
    result.inkCoverage > 0.95 &&
    result.inkStdDev < 0.03
  )
}

/** Returns the alpha values at the four corners of the processed crop. */
export function cornerAlphas(image: RgbaImage): [number, number, number, number] {
  const { width, height, data } = image
  const at = (x: number, y: number): number => data[(y * width + x) * 4 + 3]
  return [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)]
}

/**
 * Share of ink area (alpha > 0.5) whose alpha-composited colour reaches
 * `threshold` against the plate.
 */
export function inkContrastShare(
  image: RgbaImage,
  plate = PLATE_COLOR,
  threshold = 2
): number {
  const { data } = image
  let total = 0
  let pass = 0
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255
    if (alpha <= 0.5) continue
    total += 1
    const r = data[i] * alpha + plate.r * (1 - alpha)
    const g = data[i + 1] * alpha + plate.g * (1 - alpha)
    const b = data[i + 2] * alpha + plate.b * (1 - alpha)
    if (contrastRatio({ r, g, b }, plate) >= threshold) pass += 1
  }
  return total === 0 ? 0 : pass / total
}
