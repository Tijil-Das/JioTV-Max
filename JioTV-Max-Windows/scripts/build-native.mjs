/**
 * build-native.mjs — Cross-platform compilation script for Snap Overlay native addon.
 *
 * Automatically compiles on Windows (x64 / arm64) using node-gyp and targets Electron headers.
 * Safely and silently skips on non-Windows platforms (macOS / Linux).
 */

import { existsSync, copyFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const projectRoot = resolve(import.meta.dirname, '..')
const nativeDir = join(projectRoot, 'src', 'native', 'snap-overlay')
const targetReleaseDir = join(projectRoot, 'build', 'Release')

if (process.platform !== 'win32') {
  console.log(`[build-native] Skipping Windows Snap Overlay addon on platform: ${process.platform}`)
  process.exit(0)
}

const arch = process.env.npm_config_arch || process.arch || 'x64'
console.log(`\n[build-native] Compiling Windows Snap Overlay N-API addon (${arch})...`)

const cmdScript = join(projectRoot, 'scripts', 'build-native.cmd')
const result = spawnSync('cmd.exe', ['/c', cmdScript, arch], {
  stdio: 'inherit',
  cwd: projectRoot
})

const builtBinary = join(nativeDir, 'build', 'Release', 'snap_overlay.node')
const dest = join(targetReleaseDir, 'snap_overlay.node')

if (result.status === 0 && existsSync(builtBinary)) {
  if (!existsSync(targetReleaseDir)) {
    mkdirSync(targetReleaseDir, { recursive: true })
  }
  copyFileSync(builtBinary, dest)
  console.log(`[build-native] Successfully copied snap_overlay.node to: ${dest}\n`)
  process.exit(0)
} else {
  // If a pre-built binary already exists in build/Release, keep using it
  if (existsSync(dest)) {
    console.log(`[build-native] Pre-built snap_overlay.node present at: ${dest}\n`)
    process.exit(0)
  }
  console.warn('\n[build-native] [WARNING] Native snap overlay build did not complete successfully.')
  console.warn('[build-native] The app will run using seamless pure-HTML fallback.\n')
  process.exit(0)
}
