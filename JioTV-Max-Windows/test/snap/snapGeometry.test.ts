import { describe, it, expect } from 'vitest'
import {
  validateSnapBounds,
  cssToPhysicalRect,
  isWindows11OrNewerBuild
} from '../../src/main/snap-overlay/geometry'

describe('Snap Overlay Geometry and Validation', () => {
  describe('validateSnapBounds', () => {
    it('accepts valid button bounds and rounds floats to integers', () => {
      const valid = { x: 708.4, y: 0.2, width: 46.1, height: 35.9 }
      const result = validateSnapBounds(valid)
      expect(result).toEqual({ x: 708, y: 0, width: 46, height: 36 })
    })

    it('rejects null, undefined, and non-object inputs', () => {
      expect(validateSnapBounds(null)).toBeNull()
      expect(validateSnapBounds(undefined)).toBeNull()
      expect(validateSnapBounds('123')).toBeNull()
      expect(validateSnapBounds(12345)).toBeNull()
      expect(validateSnapBounds([])).toBeNull()
    })

    it('rejects non-finite, NaN, and string coordinate values', () => {
      expect(validateSnapBounds({ x: NaN, y: 0, width: 46, height: 36 })).toBeNull()
      expect(validateSnapBounds({ x: 10, y: Infinity, width: 46, height: 36 })).toBeNull()
      expect(validateSnapBounds({ x: 'bad', y: 0, width: 46, height: 36 })).toBeNull()
    })

    it('rejects non-positive and out-of-range dimensions', () => {
      expect(validateSnapBounds({ x: 10, y: 10, width: 0, height: 36 })).toBeNull()
      expect(validateSnapBounds({ x: 10, y: 10, width: -10, height: 36 })).toBeNull()
      expect(validateSnapBounds({ x: 10, y: 10, width: 46, height: -5 })).toBeNull()
      expect(validateSnapBounds({ x: 40000, y: 10, width: 46, height: 36 })).toBeNull()
      expect(validateSnapBounds({ x: 10, y: 10, width: 5000, height: 36 })).toBeNull()
    })
  })

  describe('cssToPhysicalRect', () => {
    const cssRect = { x: 200, y: 0, width: 46, height: 36 }

    it('accurately computes 100% scaling (1.0)', () => {
      expect(cssToPhysicalRect(cssRect, 1.0)).toEqual({
        x: 200,
        y: 0,
        width: 46,
        height: 36
      })
    })

    it('accurately computes 125% scaling (1.25)', () => {
      expect(cssToPhysicalRect(cssRect, 1.25)).toEqual({
        x: 250,
        y: 0,
        width: 58,
        height: 45
      })
    })

    it('accurately computes 150% scaling (1.5)', () => {
      expect(cssToPhysicalRect(cssRect, 1.5)).toEqual({
        x: 300,
        y: 0,
        width: 69,
        height: 54
      })
    })

    it('accurately computes 200% scaling (2.0)', () => {
      expect(cssToPhysicalRect(cssRect, 2.0)).toEqual({
        x: 400,
        y: 0,
        width: 92,
        height: 72
      })
    })

    it('clamps unexpected scaling values safely', () => {
      expect(cssToPhysicalRect(cssRect, 0)).toEqual({
        x: 200,
        y: 0,
        width: 46,
        height: 36
      })
    })
  })

  describe('isWindows11OrNewerBuild', () => {
    it('returns a boolean without throwing on any OS', () => {
      const res = isWindows11OrNewerBuild()
      expect(typeof res).toBe('boolean')
      if (process.platform === 'win32') {
        // Current test environment is Windows 11 build 26100/26200
        expect(res).toBe(true)
      } else {
        expect(res).toBe(false)
      }
    })
  })
})
