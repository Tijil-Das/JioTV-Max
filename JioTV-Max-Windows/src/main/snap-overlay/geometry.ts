import os from 'node:os'
import type { SnapBounds } from '@shared/types'

/**
 * Validates untrusted IPC payload representing button bounds.
 * Ensures the payload is an object with valid, finite, sane coordinates.
 */
export function validateSnapBounds(payload: unknown): SnapBounds | null {
  if (!payload || typeof payload !== 'object') return null
  const obj = payload as Record<string, unknown>

  const x = Number(obj.x)
  const y = Number(obj.y)
  const width = Number(obj.width)
  const height = Number(obj.height)

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null
  }

  // Bounds sanity check: reasonable window dimensions
  if (x < -500 || x > 30000) return null
  if (y < -500 || y > 30000) return null
  if (width <= 0 || width > 2000) return null
  if (height <= 0 || height > 1000) return null

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height)
  }
}

/**
 * Converts CSS logical client-area coordinates to physical client coordinates
 * based on the display scaling factor (DPI).
 *
 * In Electron on Windows with titleBarStyle: 'hidden', getBoundingClientRect()
 * returns CSS viewport pixels relative to client area (0,0).
 * Win32 child window positioning requires physical pixels.
 */
export function cssToPhysicalRect(rect: SnapBounds, scaleFactor: number): SnapBounds {
  const sf = Math.max(0.25, Math.min(8.0, scaleFactor || 1.0))
  return {
    x: Math.round(rect.x * sf),
    y: Math.round(rect.y * sf),
    width: Math.round(rect.width * sf),
    height: Math.round(rect.height * sf)
  }
}

/**
 * Checks whether the current operating system is Windows 11 (build 22000 or higher).
 * Snap Layouts flyout on HTMAXBUTTON was introduced in Windows 11 (build 22000).
 */
export function isWindows11OrNewerBuild(): boolean {
  if (process.platform !== 'win32') return false
  try {
    const release = os.release() // e.g. "10.0.22000" or "10.0.26100"
    const parts = release.split('.')
    if (parts.length >= 3) {
      const build = parseInt(parts[2], 10)
      return build >= 22000
    }
    return false
  } catch {
    return false
  }
}
