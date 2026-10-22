/**
 * pack.mjs — Cross-machine packaging script for JioTv Max.
 *
 * Ensures castLabs Electron is present and configures electron-builder dynamically
 * so packaging works smoothly on any drive or machine.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { ensureCastlabsElectron, projectRoot } from './ensure-castlabs.mjs'

const target = process.argv[2] || 'dir' // 'dir' or 'nsis'

async function run() {
  console.log(`\n[pack] Preparing castLabs Widevine Electron...`)
  const castlabsDir = await ensureCastlabsElectron()
  const sigFile = join(castlabsDir, 'electron.exe.sig')

  console.log(`[pack] Using electronDist: ${castlabsDir}`)

  // 1. Build bundles
  console.log(`\n[pack] Running pnpm build...`)
  const buildResult = spawnSync('pnpm', ['build'], { stdio: 'inherit', cwd: projectRoot, shell: true })
  if (buildResult.status !== 0) {
    process.exit(buildResult.status ?? 1)
  }

  // 2. Setup caches if available, otherwise fallback to default
  const env = { ...process.env }
  if (existsSync('T:\\DevLibs\\electron-builder-cache')) {
    env.ELECTRON_BUILDER_CACHE = 'T:\\DevLibs\\electron-builder-cache'
  }
  if (existsSync('T:\\DevLibs\\electron-cache')) {
    env.ELECTRON_CACHE = 'T:\\DevLibs\\electron-cache'
  }

  // 3. Build electron-builder arguments
  const builderArgs = [
    'electron-builder',
    '--win',
    target,
    `--config.electronDist=${castlabsDir}`
  ]

  console.log(`\n[pack] Running ${builderArgs.join(' ')}...\n`)
  const packResult = spawnSync('pnpm', ['exec', ...builderArgs], { stdio: 'inherit', cwd: projectRoot, env, shell: true })
  process.exit(packResult.status ?? 0)
}

run().catch((err) => {
  console.error('[pack] Failed:', err.message)
  process.exit(1)
})
