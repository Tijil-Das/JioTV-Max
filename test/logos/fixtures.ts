import type { RgbaImage } from '../../src/renderer/src/lib/logo/pipeline'

export interface LogoFixture {
  name: string
  image: RgbaImage
  /** Optional override exercised by the pipeline. */
  forceTier?: 'asis' | 'knockout' | 'monogram'
  /** Tier we expect after processing. */
  expectedTier: 'asis' | 'knockout' | 'monogram'
  /** Flags the fixture intentionally exercises. */
  expectedFlags?: string[]
}

function createImage(width: number, height: number, color: [number, number, number], alpha = 255): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = color[0]
    data[i + 1] = color[1]
    data[i + 2] = color[2]
    data[i + 3] = alpha
  }
  return { data, width, height }
}

function setPixel(image: RgbaImage, x: number, y: number, color: [number, number, number], alpha = 255): void {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return
  const idx = (y * image.width + x) * 4
  image.data[idx] = color[0]
  image.data[idx + 1] = color[1]
  image.data[idx + 2] = color[2]
  image.data[idx + 3] = alpha
}

function roundedRect(
  image: RgbaImage,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: [number, number, number],
  alpha = 255
): void {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const dx = Math.max(x + radius - px, 0, px - (x + width - 1 - radius))
      const dy = Math.max(y + radius - py, 0, py - (y + height - 1 - radius))
      if (dx * dx + dy * dy <= radius * radius + 0.5) {
        setPixel(image, px, py, color, alpha)
      }
    }
  }
}

function circle(
  image: RgbaImage,
  cx: number,
  cy: number,
  radius: number,
  color: [number, number, number],
  alpha = 255
): void {
  const r2 = radius * radius
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) setPixel(image, x, y, color, alpha)
    }
  }
}

function ring(
  image: RgbaImage,
  cx: number,
  cy: number,
  radius: number,
  thickness: number,
  color: [number, number, number],
  alpha = 255
): void {
  const inner = (radius - thickness) ** 2
  const outer = radius * radius
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      const d = (x - cx) ** 2 + (y - cy) ** 2
      if (d >= inner && d <= outer) setPixel(image, x, y, color, alpha)
    }
  }
}

function bar(image: RgbaImage, x: number, y: number, width: number, height: number, color: [number, number, number]): void {
  roundedRect(image, x, y, width, height, Math.min(6, Math.floor(height / 3)), color)
}

/** Opaque white square with a dark rounded wordmark. */
function whiteBackground(): RgbaImage {
  const image = createImage(240, 120, [255, 255, 255])
  bar(image, 30, 32, 50, 56, [17, 17, 17])
  bar(image, 95, 32, 50, 56, [17, 17, 17])
  bar(image, 160, 32, 50, 56, [17, 17, 17])
  return image
}

/** Opaque black square with saturated artwork. */
function blackBackground(): RgbaImage {
  const image = createImage(240, 120, [0, 0, 0])
  circle(image, 62, 60, 34, [244, 63, 94])
  ring(image, 62, 60, 40, 4, [250, 204, 21])
  bar(image, 115, 38, 95, 18, [34, 211, 238])
  bar(image, 115, 66, 70, 16, [250, 204, 21])
  return image
}

/** Transparent canvas with full-colour artwork. */
function transparentColored(): RgbaImage {
  const image = createImage(220, 150, [0, 0, 0], 0)
  circle(image, 66, 75, 42, [244, 63, 94])
  bar(image, 118, 48, 76, 20, [34, 211, 238])
  bar(image, 118, 80, 58, 18, [250, 204, 21])
  return image
}

/** Transparent canvas with a dark monochrome wordmark. */
function transparentDarkMono(): RgbaImage {
  const image = createImage(240, 100, [0, 0, 0], 0)
  bar(image, 24, 24, 54, 52, [19, 19, 21])
  bar(image, 92, 24, 54, 52, [19, 19, 21])
  bar(image, 160, 24, 54, 52, [19, 19, 21])
  return image
}

/** Dark filled badge with a coloured rim (rim tier). */
function darkFilledBadge(): RgbaImage {
  const image = createImage(200, 200, [0, 0, 0], 0)
  circle(image, 100, 100, 88, [35, 35, 41])
  ring(image, 100, 100, 88, 9, [250, 204, 21])
  ring(image, 100, 100, 52, 7, [244, 63, 94])
  bar(image, 72, 86, 56, 12, [34, 211, 238])
  bar(image, 82, 108, 36, 10, [244, 63, 94])
  return image
}

/** Gold emblem with thin dark lettering beside it (lift tier). */
function thinDarkTextGold(): RgbaImage {
  const image = createImage(240, 140, [0, 0, 0], 0)
  circle(image, 76, 70, 50, [250, 204, 21])
  bar(image, 140, 46, 74, 8, [20, 20, 22])
  bar(image, 140, 66, 62, 8, [20, 20, 22])
  bar(image, 140, 86, 70, 8, [20, 20, 22])
  return image
}

/** 6:1 wordmark; wide assets clamp. */
function wordmarkWide(): RgbaImage {
  const image = createImage(360, 60, [0, 0, 0], 0)
  const colours: Array<[number, number, number]> = [
    [244, 63, 94],
    [250, 204, 21],
    [34, 211, 238],
    [244, 63, 94],
    [250, 204, 21]
  ]
  for (let i = 0; i < 5; i += 1) {
    bar(image, 16 + i * 68, 14, 50, 32, colours[i])
  }
  return image
}

/** Tall emblem; tall assets clamp. */
function tallEmblem(): RgbaImage {
  const image = createImage(90, 250, [0, 0, 0], 0)
  roundedRect(image, 15, 12, 60, 200, 26, [244, 63, 94])
  circle(image, 45, 92, 26, [250, 204, 21])
  bar(image, 27, 150, 36, 10, [34, 211, 238])
  bar(image, 33, 168, 24, 8, [255, 255, 255])
  return image
}

/** Full-bleed coloured badge: corners disagree, so badge mode applies. */
function fullBleedColoredSquare(): RgbaImage {
  const image = createImage(200, 200, [0, 0, 0], 0)
  for (let y = 0; y < 200; y += 1) {
    for (let x = 0; x < 200; x += 1) {
      const top = y < 100
      const left = x < 100
      const colour: [number, number, number] = top
        ? left
          ? [244, 63, 94]
          : [250, 204, 21]
        : left
          ? [34, 211, 238]
          : [249, 115, 22]
      setPixel(image, x, y, colour)
    }
  }
  circle(image, 100, 100, 54, [255, 255, 255])
  circle(image, 100, 100, 40, [244, 63, 94])
  ring(image, 100, 100, 58, 5, [255, 255, 255])
  return image
}

export const logoFixtures: LogoFixture[] = [
  {
    name: 'white-bg-opaque',
    image: whiteBackground(),
    expectedTier: 'knockout',
    expectedFlags: ['opaque', 'repaired', 'knockout']
  },
  {
    name: 'black-bg-opaque',
    image: blackBackground(),
    expectedTier: 'asis',
    expectedFlags: ['opaque', 'repaired']
  },
  {
    name: 'transparent-colored',
    image: transparentColored(),
    expectedTier: 'asis',
    expectedFlags: ['alpha']
  },
  {
    name: 'transparent-dark-mono',
    image: transparentDarkMono(),
    expectedTier: 'knockout',
    expectedFlags: ['alpha', 'knockout']
  },
  {
    name: 'dark-filled-badge',
    image: darkFilledBadge(),
    expectedTier: 'asis',
    expectedFlags: ['rim']
  },
  {
    name: 'thin-dark-text-plus-gold-emblem',
    image: thinDarkTextGold(),
    expectedTier: 'asis',
    expectedFlags: ['lifted-dark']
  },
  {
    name: 'wordmark-6-1',
    image: wordmarkWide(),
    expectedTier: 'asis',
    expectedFlags: ['clamped']
  },
  {
    name: 'tall-emblem',
    image: tallEmblem(),
    expectedTier: 'asis',
    expectedFlags: ['clamped']
  },
  {
    name: 'full-bleed-colored-square',
    image: fullBleedColoredSquare(),
    expectedTier: 'asis',
    expectedFlags: ['badge']
  }
]
