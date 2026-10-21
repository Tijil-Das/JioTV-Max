/**
 * dev-wv.mjs — Launch electron-vite dev using the castLabs Electron binary.
 *
 * Uses ELECTRON_EXEC_PATH and ELECTRON_OVERRIDE_DIST_PATH to route electron-vite
 * and require('electron') to castLabs Electron directly without fragile path.txt patching.
 */

import { existsSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

// Locate the castLabs electron directory
const castlabsDir =
  process.argv[2] ||
  process.env.CASTLABS_ELECTRON_DIR ||
  'T:\\DevLibs\\castlabs-electron-33'

const castlabsExe = join(castlabsDir, 'electron.exe')

if (!existsSync(castlabsExe)) {
  console.error(`\n[dev-wv] castLabs electron.exe not found at:\n  ${castlabsExe}`)
  console.error('\n  Extract the castLabs zip so electron.exe sits directly in that folder.')
  console.error('  Download from: https://github.com/castlabs/electron-releases/releases\n')
  process.exit(1)
}

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
