/**
 * ensure-castlabs.mjs — Automatic discovery and downloading for castLabs Widevine Electron.
 *
 * Ensures that any developer or machine running `pnpm dev:wv` or `pnpm dist`
 * automatically gets castLabs Electron without requiring manual downloads or hardcoded paths.
 */

import { existsSync, mkdirSync, createWriteStream, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const projectRoot = join(__dirname, '..')

export const CASTLABS_VERSION = 'v33.3.2+wvcus'
export const DOWNLOAD_URL = `https://github.com/castlabs/electron-releases/releases/download/${CASTLABS_VERSION}/electron-${CASTLABS_VERSION}-win32-x64.zip`

/**
 * Searches for existing castLabs Electron installations in order of priority:
 * 1. CLI argument
 * 2. CASTLABS_ELECTRON_DIR environment variable
 * 3. Project-local .castlabs directory
 * 4. %LOCALAPPDATA%\castlabs
 * 5. Legacy workstation drive T:\DevLibs (if present)
 */
export function findCastlabsDir() {
  const candidates = [
    process.argv[2],
    process.env.CASTLABS_ELECTRON_DIR,
    join(projectRoot, '.castlabs', 'castlabs-electron-33'),
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'castlabs', 'castlabs-electron-33') : null,
    'T:\\DevLibs\\castlabs-electron-33'
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'electron.exe'))) {
      return candidate
    }
  }

  // Fallback target directory to auto-install into
  return (
    process.env.CASTLABS_ELECTRON_DIR ||
    join(projectRoot, '.castlabs', 'castlabs-electron-33')
  )
}

/**
 * Ensures castLabs Electron exists. If missing, automatically downloads and extracts it.
 */
export async function ensureCastlabsElectron(targetDir = findCastlabsDir()) {
  const exePath = join(targetDir, 'electron.exe')
  if (existsSync(exePath)) {
    return targetDir
  }

  console.log(`\n============================================================`)
  console.log(`[castLabs] Widevine Electron v33.3.2 was not found locally.`)
  console.log(`[castLabs] Target directory: ${targetDir}`)
  console.log(`[castLabs] Downloading castLabs Widevine Electron package...`)
  console.log(`[castLabs] Source: ${DOWNLOAD_URL}`)
  console.log(`============================================================\n`)

  mkdirSync(targetDir, { recursive: true })
  const zipPath = join(targetDir, 'download.zip')

  const res = await fetch(DOWNLOAD_URL, { redirect: 'follow' })
  if (!res.ok) {
    throw new Error(`Failed to download castLabs Electron: HTTP ${res.status} ${res.statusText}`)
  }

  const totalBytes = Number(res.headers.get('content-length')) || 0
  let receivedBytes = 0
  let lastPercent = -1

  const fileStream = createWriteStream(zipPath)
  const reader = res.body.getReader()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    fileStream.write(Buffer.from(value))
    receivedBytes += value.length

    if (totalBytes > 0) {
      const percent = Math.floor((receivedBytes / totalBytes) * 100)
      if (percent !== lastPercent && percent % 5 === 0) {
        lastPercent = percent
        const mb = (receivedBytes / (1024 * 1024)).toFixed(1)
        const totalMb = (totalBytes / (1024 * 1024)).toFixed(1)
        process.stdout.write(`\r[castLabs] Downloading: ${percent}% (${mb} MB / ${totalMb} MB)`)
      }
    }
  }

  await new Promise((resolve, reject) => {
    fileStream.end((err) => (err ? reject(err) : resolve()))
  })

  console.log(`\n\n[castLabs] Download complete. Extracting runtime files...`)

  let extracted = false
  const tarExe = 'C:\\Windows\\System32\\tar.exe'
  if (existsSync(tarExe)) {
    const tarResult = spawnSync(tarExe, ['-xf', zipPath, '-C', targetDir], { stdio: 'inherit' })
    if (tarResult.status === 0) extracted = true
  }

  if (!extracted) {
    console.log('[castLabs] Using PowerShell Expand-Archive...')
    const psCmd = `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${targetDir}' -Force`
    const psResult = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCmd], { stdio: 'inherit' })
    if (psResult.status !== 0) {
      throw new Error('Failed to extract castLabs zip archive.')
    }
  }

  try {
    rmSync(zipPath, { force: true })
  } catch {}

  if (!existsSync(join(targetDir, 'electron.exe'))) {
    throw new Error(`Extraction finished but electron.exe not found at ${join(targetDir, 'electron.exe')}`)
  }

  console.log(`[castLabs] Successfully installed castLabs Electron at:\n  ${targetDir}\n`)
  return targetDir
}
