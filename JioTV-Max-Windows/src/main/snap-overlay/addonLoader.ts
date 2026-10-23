import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export interface SnapOverlayAddon {
  attach(
    hwndBuffer: Buffer,
    x: number,
    y: number,
    width: number,
    height: number,
    callback: (event: string) => void
  ): bigint
  updateRect(childHwnd: bigint, x: number, y: number, width: number, height: number): boolean
  setVisible(childHwnd: bigint, visible: boolean): boolean
  bringToTop(childHwnd: bigint): boolean
  debugHitTest(childHwnd: bigint, screenX: number, screenY: number): number
  detach(childHwnd: bigint): boolean
}

let cachedAddon: SnapOverlayAddon | null = null
let hasAttemptedLoad = false

export function loadSnapAddon(): SnapOverlayAddon | null {
  if (hasAttemptedLoad) return cachedAddon
  hasAttemptedLoad = true

  if (process.platform !== 'win32') {
    return null
  }

  const candidatePaths: string[] = [
    // 1. Packaged location (asarUnpacked inside app.asar.unpacked)
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'build', 'Release', 'snap_overlay.node'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'src', 'native', 'snap-overlay', 'build', 'Release', 'snap_overlay.node'),
    // 2. Freshly built local binary directly from node-gyp output (dev mode priority)
    path.join(__dirname, '..', '..', 'src', 'native', 'snap-overlay', 'build', 'Release', 'snap_overlay.node'),
    path.join(app.getAppPath(), 'src', 'native', 'snap-overlay', 'build', 'Release', 'snap_overlay.node'),
    path.resolve('src/native/snap-overlay/build/Release/snap_overlay.node'),
    // 3. Fallback to distribution directory in build/Release
    path.join(__dirname, '..', '..', 'build', 'Release', 'snap_overlay.node'),
    path.join(app.getAppPath(), 'build', 'Release', 'snap_overlay.node'),
    path.resolve('build/Release/snap_overlay.node')
  ]

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const loaded = require(candidate) as SnapOverlayAddon
        if (typeof loaded?.attach === 'function') {
          console.log('[SnapOverlay] Successfully loaded native addon from:', candidate)
          cachedAddon = loaded
          return cachedAddon
        }
      } catch (err) {
        console.warn(`[SnapOverlay] Found candidate binary at ${candidate} but failed to require():`, err)
      }
    }
  }

  console.warn('[SnapOverlay] Native addon not available; falling back to standard HTML caption buttons.')
  return null
}
