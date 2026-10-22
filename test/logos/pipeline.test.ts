import { describe, expect, it } from 'vitest'
import {
  cornerAlphas,
  isSolidSlab,
  runLogoPipeline,
  type RgbaImage
} from '../../src/renderer/src/lib/logo/pipeline'
import { logoFixtures } from './fixtures'

const TILE = 144
const TARGET_AREA_RATIO = 0.3

function processFixture(name: string) {
  const fixture = logoFixtures.find((item) => item.name === name)
  if (!fixture) throw new Error(`Missing fixture: ${name}`)
  return { fixture, result: runLogoPipeline(fixture.image, { tileSize: TILE, channelId: name }) }
}

describe('Addendum 4 §0 & §10 · Pixel-pure logo pipeline', () => {
  it.each(logoFixtures)('$name produces a usable logo', (fixture) => {
    const result = runLogoPipeline(fixture.image, { tileSize: TILE, channelId: fixture.name })
    expect(result.ok).toBe(true)
    expect(result.tier).toBe(fixture.expectedTier)
    expect(result.image).toBeDefined()
    expect(result.imageWidth).toBeGreaterThanOrEqual(16)
    expect(result.imageHeight).toBeGreaterThanOrEqual(16)
  })

  it.each(logoFixtures)('$name is not a solid slab', (fixture) => {
    const result = runLogoPipeline(fixture.image, { tileSize: TILE })
    expect(isSolidSlab(result)).toBe(false)
  })

  it.each(logoFixtures.filter((item) => item.expectedFlags?.length))(
    '$name reports the expected pipeline flags',
    (fixture) => {
      const result = runLogoPipeline(fixture.image, { tileSize: TILE })
      for (const flag of fixture.expectedFlags ?? []) {
        expect(result.flags).toContain(flag)
      }
    }
  )

  /**
   * Blocking CI test (§0):
   * Run the pipeline at scale 1 on every fixture. Every pixel not removed
   * by step 2 must be byte-identical to the source.
   */
  it.each(logoFixtures)(
    '$name: every pixel not removed by step 2 is byte-identical to the source',
    (fixture) => {
      const result = runLogoPipeline(fixture.image, { tileSize: TILE })
      expect(result.ok).toBe(true)
      const cropped = result.image!
      const bbox = result.bbox
      const src = fixture.image

      const mismatches: string[] = []
      for (let y = 0; y < cropped.height; y += 1) {
        for (let x = 0; x < cropped.width; x += 1) {
          const croppedIdx = (y * cropped.width + x) * 4
          const srcX = bbox.x + x
          const srcY = bbox.y + y
          const srcIdx = (srcY * src.width + srcX) * 4

          // If the pixel was not cleared by step 2 background removal
          if (cropped.data[croppedIdx + 3] > 0) {
            if (
              cropped.data[croppedIdx] !== src.data[srcIdx] ||
              cropped.data[croppedIdx + 1] !== src.data[srcIdx + 1] ||
              cropped.data[croppedIdx + 2] !== src.data[srcIdx + 2]
            ) {
              mismatches.push(`Mismatch at (${x},${y})`)
              if (mismatches.length > 5) break
            }
          }
        }
        if (mismatches.length > 5) break
      }
      expect(mismatches).toEqual([])
    },
    15000
  )

  it(
    'Sony Sports-style dark badge renders byte-identically to source',
    () => {
      const { fixture, result } = processFixture('dark-filled-badge')
      expect(result.image).toBeDefined()
      expect(result.flags).not.toContain('rim')
      expect(result.flags).not.toContain('knockout')
      expect(result.flags).not.toContain('lifted-dark')

      const cropped = result.image!
      const bbox = result.bbox
      const mismatches: string[] = []
      for (let y = 0; y < cropped.height; y += 1) {
        for (let x = 0; x < cropped.width; x += 1) {
          const cIdx = (y * cropped.width + x) * 4
          const sIdx = ((bbox.y + y) * fixture.image.width + (bbox.x + x)) * 4
          if (
            cropped.data[cIdx] !== fixture.image.data[sIdx] ||
            cropped.data[cIdx + 1] !== fixture.image.data[sIdx + 1] ||
            cropped.data[cIdx + 2] !== fixture.image.data[sIdx + 2] ||
            cropped.data[cIdx + 3] !== fixture.image.data[sIdx + 3]
          ) {
            mismatches.push(`Mismatch at (${x},${y})`)
            if (mismatches.length > 5) break
          }
        }
        if (mismatches.length > 5) break
      }
      expect(mismatches).toEqual([])
    },
    15000
  )

  it('removes near-white opaque backgrounds with transparent corners while preserving interior text', () => {
    const { fixture, result } = processFixture('white-bg-opaque')
    expect(result.image).toBeDefined()
    expect(result.flags).toContain('matted')
    const corners = cornerAlphas(result.image!)
    expect(corners).toEqual([0, 0, 0, 0])

    // Interior wordmark bars [17, 17, 17, 255] are intact and byte-identical
    const cropped = result.image!
    const bbox = result.bbox
    const sampleX = 40 - bbox.x
    const sampleY = 45 - bbox.y
    const cIdx = (sampleY * cropped.width + sampleX) * 4
    const sIdx = (45 * fixture.image.width + 40) * 4
    expect(cropped.data[cIdx]).toBe(fixture.image.data[sIdx])
    expect(cropped.data[cIdx + 1]).toBe(fixture.image.data[sIdx + 1])
    expect(cropped.data[cIdx + 2]).toBe(fixture.image.data[sIdx + 2])
    expect(cropped.data[cIdx + 3]).toBe(255)
  })

  it('lands within ±15% of the 0.30 tile-area target when not clamped', () => {
    for (const { name } of logoFixtures) {
      const { result } = processFixture(name)
      if (result.normalized.clamped || result.normalized.upscaleCapped) continue
      expect(result.normalized.areaRatio, `${name} area`).toBeGreaterThanOrEqual(
        TARGET_AREA_RATIO * 0.85
      )
      expect(result.normalized.areaRatio, `${name} area`).toBeLessThanOrEqual(
        TARGET_AREA_RATIO * 1.15
      )
    }
  })

  it('clamps wide and tall fixtures inside the tile bounds (width <= 0.80, height <= 0.66)', () => {
    for (const name of ['wordmark-6-1', 'tall-emblem']) {
      const { result } = processFixture(name)
      expect(result.normalized.clamped).toBe(true)
      expect(result.normalized.width).toBeLessThanOrEqual(TILE * 0.8 + 0.001)
      expect(result.normalized.height).toBeLessThanOrEqual(TILE * 0.66 + 0.001)
    }
  })

  it('rejects a solid pale slab to the monogram tier', () => {
    const width = 96
    const height = 96
    const data = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 200
      data[i + 1] = 200
      data[i + 2] = 200
      data[i + 3] = 255
    }
    const slab: RgbaImage = { data, width, height }
    const result = runLogoPipeline(slab, { tileSize: TILE })
    expect(result.ok).toBe(false)
    expect(result.tier).toBe('monogram')
  })

  it('honours a monogram override without touching pixels', () => {
    const { result } = processFixture('white-bg-opaque')
    const forced = runLogoPipeline(
      logoFixtures.find((item) => item.name === 'white-bg-opaque')!.image,
      { forceTier: 'monogram' }
    )
    expect(result.ok).toBe(true)
    expect(forced.ok).toBe(false)
    expect(forced.tier).toBe('monogram')
    expect(forced.image).toBeUndefined()
  })
})
