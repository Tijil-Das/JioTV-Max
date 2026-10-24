import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Addendum 3 §3 supersedes the Addendum 2 plate values. These tests guard the
 * dark-plate and legibility tokens that replaced them.
 */
function hexBrightness(hex: string): number {
  const clean = hex.replace('#', '').trim()
  let r = 0
  let g = 0
  let b = 0
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16)
    g = parseInt(clean[1] + clean[1], 16)
    b = parseInt(clean[2] + clean[2], 16)
  } else if (clean.length === 6) {
    r = parseInt(clean.substring(0, 2), 16)
    g = parseInt(clean.substring(2, 4), 16)
    b = parseInt(clean.substring(4, 6), 16)
  } else {
    throw new Error(`Invalid hex: ${hex}`)
  }
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

describe('Addendum 3 §3: Plate brightness & legibility tokens', () => {
  const MAX_ALLOWED_HEX = '#1C1C20'
  const maxAllowedBrightness = hexBrightness(MAX_ALLOWED_HEX)

  it('keeps plate rest (#0E0E10) strictly darker than #1C1C20', () => {
    expect(hexBrightness('#0E0E10')).toBeLessThan(maxAllowedBrightness)
  })

  it('keeps plate hover (#151518) strictly darker than #1C1C20', () => {
    expect(hexBrightness('#151518')).toBeLessThan(maxAllowedBrightness)
  })

  it('keeps surface-3 (#18181B) strictly darker than #1C1C20', () => {
    expect(hexBrightness('#18181B')).toBeLessThan(maxAllowedBrightness)
  })

  it('defines the new plate and text tokens in globals.css', () => {
    const cssContent = readFileSync(resolve(__dirname, '../styles/globals.css'), 'utf-8')

    expect(cssContent).not.toContain('--light-plate:')
    expect(cssContent).not.toContain('#E9E9EC')
    expect(cssContent).not.toContain('#66666C')
    expect(cssContent).toContain('--plate-rest:         #0E0E10;')
    expect(cssContent).toContain('--plate-hover:        #151518;')
    expect(cssContent).toContain('--text-3: #8A8A91;')
    expect(cssContent).toContain('--gutter:          48px;')
  })

  it('uses the dark plate recipe in ChannelCard and ChannelLogoCell', () => {
    const cardContent = readFileSync(
      resolve(__dirname, '../components/home/ChannelCard.tsx'),
      'utf-8'
    )
    expect(cardContent).toContain('bg-[#0E0E10]')
    expect(cardContent).toContain('group-hover:bg-[#151518]')
    expect(cardContent).not.toContain('bg-[#E9E9EC]')
    expect(cardContent).not.toContain('useLightPlate')

    const logoContent = readFileSync(
      resolve(__dirname, '../components/ui/ChannelLogo.tsx'),
      'utf-8'
    )
    expect(logoContent).toContain('bg-[#0E0E10]')
    expect(logoContent).toContain('h-14 w-14')
    expect(logoContent).toContain('rounded-[12px]')
    expect(logoContent).not.toContain('bg-[#E9E9EC]')
    expect(logoContent).not.toContain('useLightPlate')
  })
})
