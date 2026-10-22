import { describe, expect, it } from 'vitest'

/**
 * Addendum 3 §10 · WCAG contrast for every text/background token pair.
 * All text tokens must clear 4.5:1; the number chip must clear 7:1.
 */

function channel(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16)
  ]
}

function linear(value: number): number {
  const channelValue = value / 255
  return channelValue <= 0.04045
    ? channelValue / 12.92
    : ((channelValue + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const [r, g, b] = channel(hex)
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground)
  const b = luminance(background)
  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Alpha-composites a hex foreground over a hex background. */
function blend(foreground: string, alpha: number, background: string): string {
  const [fr, fg, fb] = channel(foreground)
  const [br, bg, bb] = channel(background)
  const mix = (front: number, back: number): number => Math.round(front * alpha + back * (1 - alpha))
  return `#${[mix(fr, br), mix(fg, bg), mix(fb, bb)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`
}

const TEXT_1 = '#F4F4F5'
const TEXT_2 = '#A1A1A6'
const TEXT_3 = '#8A8A91'
const RED = '#E11D2E'
const BACKGROUNDS = ['#000000', '#0A0A0B', '#0E0E10', '#111113', '#151518', '#18181B']

describe('Addendum 3 §10 · legibility tokens', () => {
  for (const background of BACKGROUNDS) {
    it(`keeps text-1 (${TEXT_1}) at ≥4.5:1 on ${background}`, () => {
      expect(contrast(TEXT_1, background)).toBeGreaterThanOrEqual(4.5)
    })

    it(`keeps text-2 (${TEXT_2}) at ≥4.5:1 on ${background}`, () => {
      expect(contrast(TEXT_2, background)).toBeGreaterThanOrEqual(4.5)
    })

    it(`keeps text-3 (${TEXT_3}) at ≥4.5:1 on ${background}`, () => {
      expect(contrast(TEXT_3, background)).toBeGreaterThanOrEqual(4.5)
    })
  }

  it('keeps the number chip at ≥7:1 (white 10% over #0E0E10)', () => {
    const chipBackground = blend('#FFFFFF', 0.1, '#0E0E10')
    expect(contrast(TEXT_1, chipBackground)).toBeGreaterThanOrEqual(7)
  })

  it('keeps white LIVE text on the red badge at ≥4.5:1', () => {
    expect(contrast('#FFFFFF', RED)).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps red accents visible on the black canvas at ≥3:1', () => {
    expect(contrast(RED, '#000000')).toBeGreaterThanOrEqual(3)
  })
})
