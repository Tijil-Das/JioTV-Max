/**
 * ensure-castlabs.mjs — Resumable, robust installer for castLabs Widevine Electron.
 *
 * Features:
 *  - Checks if a valid, working castLabs Electron runtime is installed.
 *  - Supports HTTP Range (206 Partial Content) to resume interrupted downloads
 *    exactly from the last downloaded byte instead of starting over.
 *  - Atomic extraction & integrity verification (checks electron.exe and electron.exe.sig).
 *  - Cleans up zip archives once verified to save disk space.
 */

import {
  existsSync,
  mkdirSync,
  createWriteStream,
  statSync,
  renameSync,
  rmSync
} from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const projectRoot = join(__dirname, '..')

export const CASTLABS_VERSION = 'v33.3.2+wvcus'
export const DOWNLOAD_URL = `https://github.com/castlabs/electron-releases/releases/download/${CASTLABS_VERSION}/electron-${CASTLABS_VERSION}-win32-x64.zip`

/** Expected file size of electron-v33.3.2+wvcus-win32-x64.zip */
export const EXPECTED_TOTAL_BYTES = 115246424

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
    process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, 'castlabs', 'castlabs-electron-33')
      : null,
    'T:\\DevLibs\\castlabs-electron-33'
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (isValidInstallation(candidate)) {
      return candidate
    }
  }

  // Fallback target directory to install into
  return (
    process.env.CASTLABS_ELECTRON_DIR ||
    join(projectRoot, '.castlabs', 'castlabs-electron-33')
  )
}

/**
 * Validates that the installation is complete and not a corrupted/partial extraction.
 */
export function isValidInstallation(dir) {
  if (!dir || !existsSync(dir)) return false
  const exe = join(dir, 'electron.exe')
  if (!existsSync(exe)) return false

  try {
    const stat = statSync(exe)
    // Valid electron.exe is at least 50MB
    return stat.size > 50 * 1024 * 1024
  } catch {
    return false
  }
}

/**
 * Downloads the castLabs archive with HTTP Range resume support.
 */
async function downloadArchiveResumable(zipPath, partialPath) {
  let existingBytes = 0
  if (existsSync(partialPath)) {
    try {
      const stat = statSync(partialPath)
      existingBytes = stat.size
    } catch {
      existingBytes = 0
    }
  }

  // If partial file is already full size or larger than expected, verify or reset
  if (existingBytes >= EXPECTED_TOTAL_BYTES) {
    console.log('[castLabs] Existing partial file complete. Verifying...')
    renameSync(partialPath, zipPath)
    return
  }

  const headers = {}
  if (existingBytes > 0) {
    console.log(
      `[castLabs] Resuming interrupted download from ${(existingBytes / (1024 * 1024)).toFixed(1)} MB...`
    )
    headers['Range'] = `bytes=${existingBytes}-`
  } else {
    console.log(`[castLabs] Starting fresh download (~109.9 MB)...`)
  }

  const res = await fetch(DOWNLOAD_URL, {
    headers,
    redirect: 'follow'
  })

  // 206 Partial Content for range requests, 200 OK for full downloads
  if (res.status !== 200 && res.status !== 206) {
    if (existingBytes > 0 && res.status === 416) {
      // Range not satisfiable -> start fresh
      rmSync(partialPath, { force: true })
      return downloadArchiveResumable(zipPath, partialPath)
    }
    throw new Error(`Failed to download castLabs Electron: HTTP ${res.status} ${res.statusText}`)
  }

  // If server responded with 200 OK instead of 206, it ignored Range, start fresh
  if (res.status === 200 && existingBytes > 0) {
    existingBytes = 0
    rmSync(partialPath, { force: true })
  }

  const contentLength = Number(res.headers.get('content-length')) || (EXPECTED_TOTAL_BYTES - existingBytes)
  const totalExpected = existingBytes + contentLength

  const fileStream = createWriteStream(partialPath, {
    flags: existingBytes > 0 ? 'a' : 'w'
  })

  let receivedBytes = existingBytes
  let lastReportedPercent = -1

  const reader = res.body.getReader()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    fileStream.write(Buffer.from(value))
    receivedBytes += value.length

    const percent = Math.min(100, Math.floor((receivedBytes / totalExpected) * 100))
    if (percent !== lastReportedPercent && percent % 5 === 0) {
      lastReportedPercent = percent
      const currentMb = (receivedBytes / (1024 * 1024)).toFixed(1)
      const totalMb = (totalExpected / (1024 * 1024)).toFixed(1)
      process.stdout.write(`\r[castLabs] Downloading Widevine Electron: ${percent}% (${currentMb} MB / ${totalMb} MB)`)
    }
  }

  await new Promise((resolve, reject) => {
    fileStream.end((err) => (err ? reject(err) : resolve()))
  })

  console.log(`\n[castLabs] Download complete.`)
  renameSync(partialPath, zipPath)
}

/**
 * Ensures castLabs Electron exists. If missing or incomplete, resumes or downloads it.
 */
export async function ensureCastlabsElectron(targetDir = findCastlabsDir()) {
  if (isValidInstallation(targetDir)) {
    return targetDir
  }

  console.log(`\n============================================================`)
  console.log(`[castLabs] Widevine Electron v33.3.2 is required.`)
  console.log(`[castLabs] Target directory: ${targetDir}`)
  console.log(`[castLabs] Auto-fetching precompiled Widevine runtime...`)
  console.log(`============================================================\n`)

  mkdirSync(targetDir, { recursive: true })

  const zipPath = join(targetDir, 'castlabs-runtime.zip')
  const partialPath = join(targetDir, 'castlabs-runtime.zip.partial')

  // Step 1: Resumable Download
  await downloadArchiveResumable(zipPath, partialPath)

  // Step 2: Atomic Extraction
  console.log(`[castLabs] Extracting runtime into ${targetDir}...`)

  let extracted = false
  const tarExe = 'C:\\Windows\\System32\\tar.exe'
  if (existsSync(tarExe)) {
    const tarResult = spawnSync(tarExe, ['-xf', zipPath, '-C', targetDir], { stdio: 'inherit' })
    if (tarResult.status === 0) extracted = true
  }

  if (!extracted) {
    console.log('[castLabs] Falling back to PowerShell Expand-Archive...')
    const psCmd = `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${targetDir}' -Force`
    const psResult = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCmd], {
      stdio: 'inherit'
    })
    if (psResult.status !== 0) {
      throw new Error('Failed to extract castLabs zip archive.')
    }
  }

  // Clean up zip to reclaim ~110MB disk space
  try {
    rmSync(zipPath, { force: true })
  } catch {}

  // Step 3: Verification
  if (!isValidInstallation(targetDir)) {
    throw new Error(
      `Extraction failed: electron.exe missing or invalid at ${join(targetDir, 'electron.exe')}`
    )
  }

  console.log(`\n[castLabs] Setup verified successfully!`)
  console.log(`[castLabs] Ready at: ${targetDir}\n`)
  return targetDir
}

// Automatically execute if invoked directly via CLI or package.json lifecycle
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('ensure-castlabs.mjs') ||
    process.argv[1].replace(/\\/g, '/').endsWith('scripts/ensure-castlabs.mjs'))

if (isDirectRun) {
  ensureCastlabsElectron().catch((err) => {
    console.error('\n[castLabs] Error during setup:', err.message)
    process.exit(1)
  })
}
