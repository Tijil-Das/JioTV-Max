/**
 * dev-wv.mjs — Launch electron-vite dev using the castLabs Electron binary.
 *
 * Automatically downloads and configures castLabs Electron if missing.
 * Uses ELECTRON_EXEC_PATH and ELECTRON_OVERRIDE_DIST_PATH to route electron-vite
 * and require('electron') to castLabs Electron directly without fragile path.txt patching.
 */

import { existsSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { ensureCastlabsElectron, projectRoot } from './ensure-castlabs.mjs'

async function run() {
  // Automatically finds or downloads castLabs Electron
  const castlabsDir = await ensureCastlabsElectron()
  const castlabsExe = join(castlabsDir, 'electron.exe')

  // Ensure node_modules/electron/path.txt has standard 'electron.exe'
  // (in case any previous script modified it)
  const pathTxt = join(projectRoot, 'node_modules', 'electron', 'path.txt')
  if (existsSync(pathTxt)) {
    const current = readFileSync(pathTxt, 'utf-8').trim()
    if (current !== 'electron.exe') {
      writeFileSync(pathTxt, 'electron.exe')
    }
  }

  console.log(`\n[dev-wv] Using castLabs Widevine electron:`)
  console.log(`  Path : ${castlabsExe}`)
  console.log(`\n[dev-wv] Starting electron-vite dev...\n`)

  const child = spawn(
    'npx',
    ['electron-vite', 'dev'],
    {
      stdio: 'inherit',
      cwd: projectRoot,
      env: {
        ...process.env,
        ELECTRON_EXEC_PATH: castlabsExe,
        ELECTRON_OVERRIDE_DIST_PATH: castlabsDir
      },
      shell: true
    }
  )

  child.on('close', (code) => process.exit(code ?? 0))
  child.on('error', (err) => {
    console.error('[dev-wv] Failed to start electron-vite:', err.message)
    process.exit(1)
  })
}

run().catch((err) => {
  console.error('[dev-wv] Setup failed:', err.message)
  process.exit(1)
})
