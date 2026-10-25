import type { OverlaySettings } from './recording-types'

export class OverlayFilterBuilder {
  static buildDrawtextFilter(settings: OverlaySettings): string {
    const timePattern = settings.format === '12h' ? '%I\\:%M\\:%S %p' : '%H\\:%M\\:%S'
    const fullPattern = settings.showDate ? `%{localtime:%Y-%m-%d  ${timePattern}}` : `%{localtime:${timePattern}}`

    let fontSize = 32
    if (settings.size === 'small') fontSize = 24
    if (settings.size === 'large') fontSize = 44

    const opacity = Math.max(0.1, Math.min(1.0, settings.opacity ?? 0.85))
    const fontColor = `white@${opacity.toFixed(2)}`
    const boxColor = `black@${(opacity * 0.6).toFixed(2)}`

    // Safe clamped coordinates
    const clampedX = Math.max(2, Math.min(95, settings.xPercent))
    const clampedY = Math.max(2, Math.min(95, settings.yPercent))

    const xExpr = `(w*${clampedX / 100})`
    const yExpr = `(h*${clampedY / 100})`

    return `drawtext=text='${fullPattern}':fontcolor=${fontColor}:fontsize=${fontSize}:box=1:boxcolor=${boxColor}:boxborderw=6:x=${xExpr}:y=${yExpr}`
  }

  static snapCoordinates(xPercent: number, yPercent: number): { xPercent: number; yPercent: number; snapped: boolean } {
    const SNAP_THRESH = 3.0 // 3% snap threshold
    let nx = xPercent
    let ny = yPercent
    let snapped = false

    // X snaps: 5% (left), 50% (center), 90% (right)
    if (Math.abs(nx - 5) < SNAP_THRESH) {
      nx = 5
      snapped = true
    } else if (Math.abs(nx - 50) < SNAP_THRESH) {
      nx = 50
      snapped = true
    } else if (Math.abs(nx - 90) < SNAP_THRESH) {
      nx = 90
      snapped = true
    }

    // Y snaps: 5% (top), 50% (center), 90% (bottom)
    if (Math.abs(ny - 5) < SNAP_THRESH) {
      ny = 5
      snapped = true
    } else if (Math.abs(ny - 50) < SNAP_THRESH) {
      ny = 50
      snapped = true
    } else if (Math.abs(ny - 90) < SNAP_THRESH) {
      ny = 90
      snapped = true
    }

    return { xPercent: nx, yPercent: ny, snapped }
  }
}
