import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Calculates perceived brightness from #RRGGBB or #RGB hex
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

describe('Addendum 2 Section 0: Plate Brightness & Dark Surface Rule', () => {
  const MAX_ALLOWED_HEX = '#1C1C20'
  const maxAllowedBrightness = hexBrightness(MAX_ALLOWED_HEX)

  it('verifies plate rest (#0C0C0E) is strictly darker than #1C1C20', () => {
    const restBrightness = hexBrightness('#0C0C0E')
    expect(restBrightness).toBeLessThan(maxAllowedBrightness)
  })

  it('verifies plate hover (#151518) is strictly darker than #1C1C20', () => {
    const hoverBrightness = hexBrightness('#151518')
    expect(hoverBrightness).toBeLessThan(maxAllowedBrightness)
  })

  it('verifies surface-3 (#18181B) is strictly darker than #1C1C20', () => {
    const surface3Brightness = hexBrightness('#18181B')
    expect(surface3Brightness).toBeLessThan(maxAllowedBrightness)
  })

  it('ensures no light-plate tokens or light backgrounds exist in globals.css', () => {
    const cssPath = resolve(__dirname, '../styles/globals.css')
    const cssContent = readFileSync(cssPath, 'utf-8')

    // Must not contain any light-plate tokens or #E9E9EC in variables
    expect(cssContent).not.toContain('--light-plate:')
    expect(cssContent).not.toContain('--light-plate-hover:')
    expect(cssContent).not.toContain('#E9E9EC')

    // Must define dark plate rest #0C0C0E and hover #151518
    expect(cssContent).toContain('--plate-rest:         #0C0C0E;')
    expect(cssContent).toContain('--plate-hover:        #151518;')
  })

  it('ensures ChannelCard and ChannelLogoCell containers never use light backgrounds', () => {
    const cardPath = resolve(__dirname, '../components/home/ChannelCard.tsx')
    const cardContent = readFileSync(cardPath, 'utf-8')

    // ChannelCard must use #0C0C0E rest and #151518 hover
    expect(cardContent).toContain('bg-[#0C0C0E]')
    expect(cardContent).toContain('group-hover:bg-[#151518]')
    expect(cardContent).not.toContain('bg-[#E9E9EC]')
    expect(cardContent).not.toContain('useLightPlate')

    const logoPath = resolve(__dirname, '../components/ui/ChannelLogo.tsx')
    const logoContent = readFileSync(logoPath, 'utf-8')

    // ChannelLogoCell must use #0C0C0E
    expect(logoContent).toContain('bg-[#0C0C0E]')
    expect(logoContent).not.toContain('bg-[#E9E9EC]')
    expect(logoContent).not.toContain('useLightPlate')
  })
})

describe('Addendum 2 Section 2: Processing Tiers Classification', () => {
  function classifyTier(
    luminance: number,
    saturation: number
  ): 'as-is' | 'white-knockout' | 'neutral-halo' {
    if (luminance >= 0.3) return 'as-is'
    if (saturation < 0.25) return 'white-knockout'
    return 'neutral-halo'
  }

  it('classifies bright/normal colored logos (L >= 0.30) as as-is', () => {
    expect(classifyTier(0.65, 0.8)).toBe('as-is')
    expect(classifyTier(0.35, 0.1)).toBe('as-is')
    expect(classifyTier(0.3, 0.0)).toBe('as-is')
  })

  it('classifies dark monochrome logos (L < 0.30 & S < 0.25) as white-knockout', () => {
    // Black wordmarks, dark grey emblems
    expect(classifyTier(0.12, 0.05)).toBe('white-knockout')
    expect(classifyTier(0.25, 0.15)).toBe('white-knockout')
    expect(classifyTier(0.05, 0.0)).toBe('white-knockout')
  })

  it('classifies dark colored logos (L < 0.30 & S >= 0.25) as neutral-halo', () => {
    // Navy, deep purple, dark red badges
    expect(classifyTier(0.18, 0.75)).toBe('neutral-halo')
    expect(classifyTier(0.28, 0.5)).toBe('neutral-halo')
    expect(classifyTier(0.1, 0.4)).toBe('neutral-halo')
  })
})
