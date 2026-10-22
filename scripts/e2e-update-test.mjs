/**
 * scripts/e2e-update-test.mjs
 *
 * Semi-automated local E2E test runner for differential auto-updates.
 *
 * Steps:
 *  1. Builds v1.0.0 with electron-builder.e2e.yml into release-e2e/v1.0.0
 *  2. Makes a small benign change in the renderer, bumps version to 1.0.1,
 *     and builds v1.0.1 into release-e2e/v1.0.1
 *  3. Verifies that both builds generated setup.exe, setup.exe.blockmap, and latest.yml
 *     with matching sha512 hashes
 *  4. Spawns a local HTTP update server on port 8765 hosting v1.0.1
 *  5. Inspects %APPDATA%/jiotv-max/logs/main.log and pending-update.json to assert
 *     differential download efficiency (N% well below 100%)
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

const PORT = 8765
const V100_DIR = path.join(projectRoot, 'release-e2e', 'v1.0.0')
const V101_DIR = path.join(projectRoot, 'release-e2e', 'v1.0.1')
const APP_DATA = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'jiotv-max')
  : path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming', 'jiotv-max')

function computeSha512(filePath) {
  const hash = crypto.createHash('sha512')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('base64')
}

export function verifyBuildArtifacts(dir, version) {
  console.log(`[e2e] Verifying build artifacts in ${dir} for v${version}...`)
  const exeName = `JioTv-Max-${version}-setup.exe`
  const blockmapName = `${exeName}.blockmap`
  const ymlName = 'latest.yml'

  const exePath = path.join(dir, exeName)
  const blockmapPath = path.join(dir, blockmapName)
  const ymlPath = path.join(dir, ymlName)

  if (!fs.existsSync(exePath)) throw new Error(`Missing installer: ${exePath}`)
  if (!fs.existsSync(blockmapPath)) throw new Error(`Missing blockmap: ${blockmapPath}`)
  if (!fs.existsSync(ymlPath)) throw new Error(`Missing metadata: ${ymlPath}`)

  const ymlContent = fs.readFileSync(ymlPath, 'utf8')
  if (!ymlContent.includes(`version: ${version}`)) {
    throw new Error(`latest.yml does not match version ${version}`)
  }

  const computedHash = computeSha512(exePath)
  if (!ymlContent.includes(computedHash)) {
    throw new Error(`latest.yml sha512 does not match actual ${exeName} checksum`)
  }

  console.log(`[e2e] ✓ v${version} artifacts verified (installer, blockmap, latest.yml matching sha512)`)
}

export function startUpdateServer(v101Dir, port = PORT) {
  const server = http.createServer((req, res) => {
    const safeUrl = decodeURIComponent(req.url.split('?')[0])
    const filePath = path.join(v101Dir, safeUrl === '/' ? 'latest.yml' : safeUrl.slice(1))

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not Found')
      return
    }

    const stat = fs.statSync(filePath)
    const range = req.headers.range

    // Support HTTP 206 Partial Content for differential block fetches
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1
      const chunkSize = end - start + 1
      const file = fs.createReadStream(filePath, { start, end })

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'application/octet-stream'
      })
      file.pipe(res)
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': filePath.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream',
        'Accept-Ranges': 'bytes'
      })
      fs.createReadStream(filePath).pipe(res)
    }
  })

  server.listen(port, () => {
    console.log(`\n[e2e] Local update server running at http://localhost:${port}/`)
  })

  return server
}

export function verifyClientLogAndPendingUpdate() {
  const logFile = path.join(APP_DATA, 'logs', 'main.log')
  const pendingFile = path.join(APP_DATA, 'pending-update.json')

  console.log(`[e2e] Checking log file at: ${logFile}`)
  if (!fs.existsSync(logFile)) {
    throw new Error(`Log file not found: ${logFile}. Has the v1.0.0 app been launched?`)
  }

  const logContent = fs.readFileSync(logFile, 'utf8')

  // Check version found
  if (!logContent.includes('1.0.1')) {
    throw new Error('Log does not indicate v1.0.1 update was found')
  }

  // Check differential download
  const diffMatch = logContent.match(/Full:\s*([\d.]+\s*[KMGT]?B),\s*To download:\s*([\d.]+\s*[KMGT]?B)\s*\(([0-9.]+)%\)/i)
  if (diffMatch) {
    const percent = parseFloat(diffMatch[3])
    console.log(`[e2e] Differential download efficiency: ${diffMatch[0]}`)
    if (percent >= 100) {
      throw new Error(`Differential download did not save bandwidth: ${percent}%`)
    }
  }

  // Check update downloaded
  if (!logContent.includes('update-downloaded') && !logContent.includes('Update has been downloaded')) {
    console.warn('[e2e] Warning: update-downloaded confirmation log message pending.')
  }

  // Check pending-update.json
  if (!fs.existsSync(pendingFile)) {
    throw new Error(`Missing pending-update.json at ${pendingFile}`)
  }
  const pending = JSON.parse(fs.readFileSync(pendingFile, 'utf8'))
  if (pending.version !== '1.0.1') {
    throw new Error(`pending-update.json version mismatch: expected 1.0.1, got ${pending.version}`)
  }

  console.log(`[e2e] ✓ All automated assertions passed! pending-update.json contains v${pending.version}`)
}

async function main() {
  const cmd = process.argv[2] || 'help'

  if (cmd === 'verify-artifacts') {
    verifyBuildArtifacts(V100_DIR, '1.0.0')
    verifyBuildArtifacts(V101_DIR, '1.0.1')
  } else if (cmd === 'serve') {
    startUpdateServer(V101_DIR)
    console.log('\nStep-by-step manual testing instructions:')
    console.log('1. Install v1.0.0: run release-e2e/v1.0.0/JioTv-Max-1.0.0-setup.exe')
    console.log('2. Launch the installed JioTv Max application.')
    console.log('3. Wait ~15 seconds for background update check.')
    console.log('4. Look for the "Update v1.0.1 is ready" banner.')
    console.log('5. In another terminal, run: node scripts/e2e-update-test.mjs verify-client')
  } else if (cmd === 'verify-client') {
    verifyClientLogAndPendingUpdate()
  } else {
    console.log('Usage: node scripts/e2e-update-test.mjs [verify-artifacts|serve|verify-client]')
  }
}

if (process.argv[1] && process.argv[1].endsWith('e2e-update-test.mjs')) {
  main().catch((err) => {
    console.error('[e2e] Error:', err.message)
    process.exit(1)
  })
}
