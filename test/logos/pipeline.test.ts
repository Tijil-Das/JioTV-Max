import { describe, expect, it } from 'vitest'
import {
  cornerAlphas,
  inkContrastShare,
  isSolidSlab,
  runLogoPipeline,
  type RgbaImage
} from '../../src/renderer/src/lib/logo/pipeline'
import { logoFixtures } from './fixtures'

const TILE = 144
const TARGET_AREA_RATIO = 0.22

function processFixture(name: string) {
  const fixture = logoFixtures.find((item) => item.name === name)
  if (!fixture) throw new Error(`Missing fixture: ${name}`)
  return { fixture, result: runLogoPipeline(fixture.image, { tileSize: TILE, channelId: name }) }
}

describe('Addendum 3 · logo fixtures', () => {
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

  it.each(logoFixtures.filter((item) => item.expectedFlags))(
    '$name reports the expected pipeline flags',
    (fixture) => {
      const result = runLogoPipeline(fixture.image, { tileSize: TILE })
      for (const flag of fixture.expectedFlags ?? []) {
        expect(result.flags).toContain(flag)
      }
    }
  )

  it('repairs white and black opaque backgrounds to transparent corners', () => {
    for (const name of ['white-bg-opaque', 'black-bg-opaque']) {
      const { result } = processFixture(name)
      expect(result.image).toBeDefined()
      const corners = cornerAlphas(result.image!)
      expect(corners).toEqual([0, 0, 0, 0])
    }
  })

  it('reaches 3:1 contrast across at least 90% of ink (or uses the rim tier)', () => {
    for (const { name } of logoFixtures) {
      const { result } = processFixture(name)
      if (result.flags.includes('rim')) continue
      expect(inkContrastShare(result.image!), `${name} contrast share`).toBeGreaterThanOrEqual(0.9)
    }
  })

  it('lands within ±15% of the 0.22 tile-area target when not clamped', () => {
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

  it('clamps wide and tall fixtures inside the tile bounds', () => {
    for (const name of ['wordmark-6-1', 'tall-emblem']) {
      const { result } = processFixture(name)
      expect(result.normalized.clamped).toBe(true)
      expect(result.normalized.width).toBeLessThanOrEqual(TILE * 0.74 + 0.001)
      expect(result.normalized.height).toBeLessThanOrEqual(TILE * 0.62 + 0.001)
    }
  })

  it('rejects a solid pale slab to the monogram tier', () => {
    const width = 96
    const height = 96
    const data = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255
      data[i + 1] = 255
      data[i + 2] = 255
      data[i + 3] = 255
    }
    const slab: RgbaImage = { data, width, height }
    const result = runLogoPipeline(slab, { tileSize: TILE })
    expect(result.ok).toBe(false)
    expect(result.tier).toBe('monogram')
    expect(['solid-slab', 'too-light', 'low-ink']).toContain(result.flags.at(-1))
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
