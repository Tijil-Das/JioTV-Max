import { describe, expect, it } from 'vitest'
import { computePinfScale } from '../../src/renderer/src/hooks/useLogoScaling'

describe('Proportional Image Normalization Formula (PINF)', () => {
  it('keeps scale at 1.0 for a perfect 1:1 square aspect ratio', () => {
    const scale = computePinfScale(200, 200, 0.5)
    expect(scale).toBe(1.0)
  })

  it('calculates scale > 1.0 for wide logos (e.g. 16:9)', () => {
    // 16 / 9 ≈ 1.777, sqrt(1.777) ≈ 1.333, clamped to max 1.25
    const scale = computePinfScale(16, 9, 0.5)
    expect(scale).toBe(1.25)

    // Moderately wide: 1.44:1 => 1.44^0.5 = 1.2
    const modScale = computePinfScale(144, 100, 0.5)
    expect(modScale).toBeCloseTo(1.2, 2)
  })

  it('calculates scale < 1.0 for tall logos with badges (e.g. Sony Ten 3 Hindi)', () => {
    // 81 / 100 = 0.81, 0.81^0.5 = 0.90
    const scale = computePinfScale(81, 100, 0.5)
    expect(scale).toBeCloseTo(0.9, 2)

    // Very tall: 0.64 => 0.64^0.5 = 0.80, clamped to min 0.85
    const tallClamped = computePinfScale(64, 100, 0.5)
    expect(tallClamped).toBe(0.85)
  })

  it('respects custom minScale and maxScale bounds', () => {
    const scale = computePinfScale(200, 100, 0.5, 0.9, 1.15)
    expect(scale).toBe(1.15)

    // 50/100 = 0.5, sqrt(0.5) ≈ 0.707, clamped to minScale 0.75
    const smallScale = computePinfScale(50, 100, 0.5, 0.75, 1.3)
    expect(smallScale).toBe(0.75)
  })

  it('handles zero or missing dimensions gracefully', () => {
    expect(computePinfScale(0, 100)).toBe(1)
    expect(computePinfScale(100, 0)).toBe(1)
  })
})
