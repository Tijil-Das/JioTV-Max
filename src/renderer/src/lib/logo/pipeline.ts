/**
 * Addendum 3 — channel logo pipeline.
 *
 * Pure pixel routines shared by the Web Worker (OffscreenCanvas) and the Vitest
 * fixtures. No DOM access happens here, so every step is deterministic and can
 * be exercised headlessly.
 *
 * Tiers returned:
 *   asis      the original colours survive (possibly with lifted dark ink/rim)
 *   knockout  the whole mark was recoloured to #F2F2F4
 *   monogram  the asset is unusable; the UI must draw initials
 */

export type LogoPipelineTier = 'asis' | 'knockout' | 'monogram'

export type LogoPipelineFlag =
  | 'opaque'
  | 'alpha'
  | 'repaired'
  | 'badge'
  | 'light-badge'
  | 'knockout'
  | 'lifted-dark'
  | 'rim'
  | 'clamped'
  | 'upscale-capped'
  | 'luminance-reduced'
  | 'low-ink'
  | 'solid-slab'
  | 'too-small'
  | 'too-light'
  | 'decode-failed'

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
  forceTier?: 'asis' | 'knockout' | 'monogram'
  channelId?: string
}

export const PIPELINE_VERSION = 1
export const PLATE_COLOR = { r: 14, g: 14, b: 16 } // #0E0E10
const INK_ALPHA = 16 // alpha > 0.06
const OPAQUE_ALPHA_COVERAGE = 0.02
const KNOCKOUT_COLOR = { r: 242, g: 242, b: 244 } // #F2F2F4
const LIFT_COLOR = { r: 230, g: 230, b: 234 } // #E6E6EA

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

function hsvSaturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  return max === 0 ? 0 : (max - min) / max
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

function deltaE76(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number }
): number {
  const labA = rgbToLab(a.r, a.g, a.b)
  const labB = rgbToLab(b.r, b.g, b.b)
  return Math.sqrt((labA.l - labB.l) ** 2 + (labA.a - labB.a) ** 2 + (labA.b - labB.b) ** 2)
}

function alphaCoverageOf(image: RgbaImage): number {
  const { data } = image
  let transparent = 0
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) transparent += 1
  }
  return transparent / (image.width * image.height)
}

interface PatchColor {
  r: number
  g: number
  b: number
}

/** Median RGB of a square patch, sampled from the original pixels. */
function medianPatch(image: RgbaImage, cx: number, cy: number, size = 8): PatchColor {
  const half = Math.max(1, Math.floor(size / 2))
  const x0 = Math.max(0, Math.min(image.width - 1, cx - half))
  const y0 = Math.max(0, Math.min(image.height - 1, cy - half))
  const x1 = Math.max(0, Math.min(image.width, x0 + size))
  const y1 = Math.max(0, Math.min(image.height, y0 + size))
  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const idx = (y * image.width + x) * 4
      rs.push(image.data[idx])
      gs.push(image.data[idx + 1])
      bs.push(image.data[idx + 2])
    }
  }
  const median = (values: number[]): number => {
    if (values.length === 0) return 0
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
  }
  return { r: median(rs), g: median(gs), b: median(bs) }
}

interface KeySample {
  color: PatchColor
  agree: boolean
}

/**
 * Samples the four 8×8 corner patches plus the four edge midpoints. A key is
 * usable when every patch is within ΔE76 < 8 of the aggregate median.
 */
function sampleKeyColor(image: RgbaImage): KeySample {
  const { width, height } = image
  const patches = [
    medianPatch(image, 3, 3),
    medianPatch(image, width - 4, 3),
    medianPatch(image, 3, height - 4),
    medianPatch(image, width - 4, height - 4),
    medianPatch(image, Math.floor(width / 2), 3),
    medianPatch(image, Math.floor(width / 2), height - 4),
    medianPatch(image, 3, Math.floor(height / 2)),
    medianPatch(image, width - 4, Math.floor(height / 2))
  ]
  // Aggregate median of the eight patch medians.
  const med = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
  }
  const color = {
    r: med(patches.map((p) => p.r)),
    g: med(patches.map((p) => p.g)),
    b: med(patches.map((p) => p.b))
  }
  const agree = patches.every((patch) => deltaE76(patch, color) < 8)
  return { color, agree }
}

function applyColorToAlpha(image: RgbaImage, key: PatchColor): void {
  const { data } = image
  const k = { r: key.r, g: key.g, b: key.b }
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    const p = { r: data[i], g: data[i + 1], b: data[i + 2] }
    const channelAlpha = (pc: number, kc: number): number => {
      if (pc > kc) return kc < 255 ? (pc - kc) / (255 - kc) : 0
      return kc > 0 ? (kc - pc) / kc : 0
    }
    const alpha = Math.max(
      channelAlpha(p.r, k.r),
      channelAlpha(p.g, k.g),
      channelAlpha(p.b, k.b)
    )
    if (alpha <= 0.004) {
      data[i] = 0
      data[i + 1] = 0
      data[i + 2] = 0
      data[i + 3] = 0
      continue
    }
    data[i] = Math.round(Math.min(255, Math.max(0, k.r + (p.r - k.r) / alpha)))
    data[i + 1] = Math.round(Math.min(255, Math.max(0, k.g + (p.g - k.g) / alpha)))
    data[i + 2] = Math.round(Math.min(255, Math.max(0, k.b + (p.b - k.b) / alpha)))
    data[i + 3] = Math.round(clamp01(alpha) * 255)
  }
  featherAlpha(image)
}

/** One-pixel alpha feather after the colour-to-alpha repair. */
function featherAlpha(image: RgbaImage): void {
  const { width, height, data } = image
  const alpha = new Uint8ClampedArray(width * height)
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) alpha[p] = data[i + 3]

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x
      const a = alpha[p]
      if (a === 0 || a === 255) continue
      let total = a * 2
      let weight = 2
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          total += alpha[ny * width + nx]
          weight += 1
        }
      }
      data[p * 4 + 3] = Math.round(total / weight)
    }
  }
}

function clipRoundedCorners(image: RgbaImage, radiusRatio = 0.14): void {
  const { width, height, data } = image
  const radius = Math.max(1, Math.min(width, height) * radiusRatio)
  const r2 = radius * radius
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let cx = -1
      let cy = -1
      if (x < radius && y < radius) {
        cx = radius
        cy = radius
      } else if (x > width - 1 - radius && y < radius) {
        cx = width - 1 - radius
        cy = radius
      } else if (x < radius && y > height - 1 - radius) {
        cx = radius
        cy = height - 1 - radius
      } else if (x > width - 1 - radius && y > height - 1 - radius) {
        cx = width - 1 - radius
        cy = height - 1 - radius
      }
      if (cx < 0) continue
      const dist2 = (x - cx) ** 2 + (y - cy) ** 2
      if (dist2 > r2) {
        data[(y * width + x) * 4 + 3] = 0
      } else if (dist2 > (radius - 1) ** 2) {
        const coverage = Math.min(1, Math.max(0, radius - Math.sqrt(dist2)))
        data[(y * width + x) * 4 + 3] = Math.round(
          data[(y * width + x) * 4 + 3] * coverage
        )
      }
    }
  }
}

function meanImageLuminance(image: RgbaImage): number {
  const { data } = image
  let total = 0
  let count = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    total += relativeLuminance(data[i], data[i + 1], data[i + 2])
    count += 1
  }
  return count === 0 ? 0 : total / count
}

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
  centroidWeight: number
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
      if (lum < 0.22 && hsvSaturation(r, g, b) < 0.3) darkWeight += weight
      const lw = weight * (0.02 + lum)
      cx += x * lw
      cy += y * lw
      centroidWeight += lw
    }
  }

  const meanLuminance = alphaWeight > 0 ? lumWeight / alphaWeight : 0
  const variance = alphaWeight > 0 ? Math.max(0, lumSqWeight / alphaWeight - meanLuminance ** 2) : 0
  return {
    inkCoverage: inkPixels / area,
    meanLuminance,
    stdDev: Math.sqrt(variance),
    darkShare: alphaWeight > 0 ? darkWeight / alphaWeight : 0,
    centroidX: centroidWeight > 0 ? cx / centroidWeight : width / 2,
    centroidY: centroidWeight > 0 ? cy / centroidWeight : height / 2,
    centroidWeight
  }
}

function recolorAll(image: RgbaImage, color: PatchColor): void {
  const { data } = image
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    data[i] = color.r
    data[i + 1] = color.g
    data[i + 2] = color.b
  }
}

function liftDarkInk(image: RgbaImage): void {
  const { data } = image
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const lum = relativeLuminance(r, g, b)
    if (lum >= 0.22 || hsvSaturation(r, g, b) >= 0.3) continue
    const t = clamp01((0.22 - lum) / 0.22)
    const smooth = t * t * (3 - 2 * t)
    data[i] = Math.round(r + (LIFT_COLOR.r - r) * smooth)
    data[i + 1] = Math.round(g + (LIFT_COLOR.g - g) * smooth)
    data[i + 2] = Math.round(b + (LIFT_COLOR.b - b) * smooth)
  }
}

function addRim(image: RgbaImage): void {
  const { width, height, data } = image
  const alpha = new Uint8ClampedArray(width * height)
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) alpha[p] = data[i + 3]
  const blend = 0.22
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x
      if (alpha[p] <= INK_ALPHA) continue
      const left = x === 0 || alpha[p - 1] <= INK_ALPHA
      const right = x === width - 1 || alpha[p + 1] <= INK_ALPHA
      const up = y === 0 || alpha[p - width] <= INK_ALPHA
      const down = y === height - 1 || alpha[p + width] <= INK_ALPHA
      if (!left && !right && !up && !down) continue
      const idx = p * 4
      data[idx] = Math.round(data[idx] * (1 - blend) + 255 * blend)
      data[idx + 1] = Math.round(data[idx + 1] * (1 - blend) + 255 * blend)
      data[idx + 2] = Math.round(data[idx + 2] * (1 - blend) + 255 * blend)
      data[idx + 3] = Math.max(data[idx + 3], Math.round(0.22 * 255))
    }
  }
}

/**
 * Normalizes a cropped logo into the 1:1 tile. Width scales with
 * sqrt(aspect) so the bbox area lands on `areaFactor` of the tile while wide
 * wordmarks remain wide.
 */
export function computeLogoLayout(
  input: {
    width: number
    height: number
    nativeWidth: number
    nativeHeight: number
    meanLuminance: number
    centroidX: number
    centroidY: number
  },
  tileSize = 144,
  areaFactor = 0.22
): LogoLayout {
  const aspect = input.width / input.height
  const targetArea = areaFactor * tileSize * tileSize
  let width = Math.sqrt(targetArea) * Math.sqrt(aspect)
  let height = width / aspect
  let clamped = false
  let upscaleCapped = false

  const maxWidth = tileSize * 0.74
  const maxHeight = tileSize * 0.62

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

  const minSide = 28
  if (!clamped && Math.min(width, height) < minSide) {
    const scale = minSide / Math.min(width, height)
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

  const nativeCapWidth = input.nativeWidth * 1.5
  const nativeCapHeight = input.nativeHeight * 1.5
  if (width > nativeCapWidth || height > nativeCapHeight) {
    const scale = Math.min(nativeCapWidth / width, nativeCapHeight / height)
    width *= scale
    height *= scale
    upscaleCapped = true
    clamped = true
  }

  if (input.meanLuminance > 0.7) {
    width *= 0.94
    height *= 0.94
  }

  const dx = (input.width / 2 - input.centroidX) * (width / input.width)
  const dy = (input.height / 2 - input.centroidY) * (height / input.height)
  const maxOffset = tileSize * 0.06
  const offsetX = Math.max(-maxOffset, Math.min(maxOffset, dx))
  const offsetY = Math.max(-maxOffset, Math.min(maxOffset, dy))

  return {
    tileSize,
    areaFactor,
    width,
    height,
    widthRatio: width / tileSize,
    heightRatio: height / tileSize,
    areaRatio: (width * height) / (tileSize * tileSize),
    offsetX,
    offsetY,
    offsetXRatio: offsetX / tileSize,
    offsetYRatio: offsetY / tileSize,
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
  const areaFactor = options.areaFactor ?? 0.22
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
    return reject({ ...emptyBase, reason: 'override' }, 'monogram override', 'decode-failed')
  }
  if (image.width < 1 || image.height < 1) {
    return reject({ ...emptyBase, reason: 'empty' }, 'empty image', 'decode-failed')
  }

  const opaque = alphaCoverage < OPAQUE_ALPHA_COVERAGE
  let badgeMode = false
  if (opaque) {
    flags.push('opaque')
    const key = sampleKeyColor(image)
    if (key.agree) {
      applyColorToAlpha(image, key.color)
      flags.push('repaired')
    } else {
      // Full-bleed badge: keep the artwork, clip corners instead of running
      // colour-to-alpha (the white-square bug is explicitly avoided here).
      badgeMode = true
      flags.push('badge')
      const mean = meanImageLuminance(image)
      if (mean > 0.75) {
        return reject(
          { ...emptyBase, reason: 'light badge', meanLuminance: mean },
          'light badge',
          'light-badge'
        )
      }
      clipRoundedCorners(image)
    }
  } else {
    flags.push('alpha')
  }

  const bbox = findInkBbox(image)
  if (!bbox) {
    return reject({ ...emptyBase, reason: 'no ink' }, 'no ink', 'low-ink')
  }
  if (bbox.width < 16 || bbox.height < 16) {
    return reject(
      { ...emptyBase, bbox, reason: 'bbox under 16px' },
      'bbox under 16px',
      'too-small'
    )
  }

  const cropped = cropImage(image, bbox)
  const ink = measureInk(cropped)

  if (ink.inkCoverage < 0.015) {
    return reject(
      { ...emptyBase, bbox, inkCoverage: ink.inkCoverage, reason: 'ink under 1.5%' },
      'ink under 1.5%',
      'low-ink'
    )
  }
  if (!badgeMode && ink.inkCoverage > 0.85 && ink.stdDev < 0.06) {
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
      'solid-slab'
    )
  }

  let tier: LogoPipelineTier = 'asis'
  if (options.forceTier === 'knockout') {
    recolorAll(cropped, KNOCKOUT_COLOR)
    tier = 'knockout'
    flags.push('knockout')
  } else if (options.forceTier === 'asis') {
    // Keep the repaired pixels exactly as-is.
  } else if (!badgeMode) {
    const d = ink.darkShare
    if (d >= 0.9) {
      recolorAll(cropped, KNOCKOUT_COLOR)
      tier = 'knockout'
      flags.push('knockout')
    } else if (d >= 0.04 && d < 0.35) {
      liftDarkInk(cropped)
      flags.push('lifted-dark')
    } else if (d >= 0.35 && d < 0.9) {
      addRim(cropped)
      flags.push('rim')
    }
  }

  const processedInk = measureInk(cropped)
  if (processedInk.meanLuminance > 0.9 && processedInk.inkCoverage > 0.6) {
    return reject(
      {
        ...emptyBase,
        bbox,
        inkCoverage: processedInk.inkCoverage,
        inkLuminance: processedInk.meanLuminance,
        inkStdDev: processedInk.stdDev,
        darkShare: processedInk.darkShare,
        meanLuminance: processedInk.meanLuminance,
        reason: 'processed image too light'
      },
      'processed image too light',
      'too-light'
    )
  }

  const normalized = computeLogoLayout(
    {
      width: cropped.width,
      height: cropped.height,
      nativeWidth: cropped.width,
      nativeHeight: cropped.height,
      meanLuminance: processedInk.meanLuminance,
      centroidX: processedInk.centroidX,
      centroidY: processedInk.centroidY
    },
    tileSize,
    areaFactor
  )
  if (normalized.clamped) flags.push('clamped')
  if (normalized.upscaleCapped) flags.push('upscale-capped')
  if (processedInk.meanLuminance > 0.7) flags.push('luminance-reduced')

  return {
    ok: true,
    tier,
    flags,
    bbox,
    sourceWidth: source.width,
    sourceHeight: source.height,
    image: cropped,
    imageWidth: cropped.width,
    imageHeight: cropped.height,
    alphaCoverage,
    inkCoverage: processedInk.inkCoverage,
    inkLuminance: processedInk.meanLuminance,
    inkStdDev: processedInk.stdDev,
    darkShare: processedInk.darkShare,
    meanLuminance: processedInk.meanLuminance,
    aspect: cropped.width / cropped.height,
    centroidX: processedInk.centroidX,
    centroidY: processedInk.centroidY,
    normalized
  }
}

/** Solid slab predicate used by the fixture tests. */
export function isSolidSlab(result: LogoPipelineResult): boolean {
  return (
    result.ok &&
    result.inkCoverage > 0.85 &&
    result.inkStdDev < 0.06 &&
    !result.flags.includes('badge')
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
  threshold = 3
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
