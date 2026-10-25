import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const projectRoot = path.resolve(import.meta.dirname, '..')
const binDir = path.join(projectRoot, 'build', 'bin')
const ffmpegExe = path.join(binDir, 'ffmpeg.exe')

const url = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-lgpl.zip'

async function main() {
  if (fs.existsSync(ffmpegExe)) {
    console.log('[ensure-ffmpeg] ffmpeg.exe already present at:', ffmpegExe)
    return
  }

  console.log('[ensure-ffmpeg] Downloading LGPL FFmpeg build from BtbN/FFmpeg-Builds...')
  fs.mkdirSync(binDir, { recursive: true })
  const tmpZip = path.join(projectRoot, 'build', 'ffmpeg-lgpl.zip')

  const resp = await fetch(url)
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status} ${resp.statusText}`)
  }
  fs.writeFileSync(tmpZip, Buffer.from(await resp.arrayBuffer()))

  console.log('[ensure-ffmpeg] Extracting ffmpeg.exe and ffprobe.exe...')
  const tmpExtract = path.join(projectRoot, 'build', 'extract_ffmpeg')
  fs.mkdirSync(tmpExtract, { recursive: true })
  
  // Use Windows built-in tar.exe to unzip
  execSync(`tar -xf "${tmpZip}" -C "${tmpExtract}"`, { stdio: 'inherit' })

  // Find ffmpeg.exe and ffprobe.exe in extracted folder
  function findFile(dir, name) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        const found = findFile(full, name)
        if (found) return found
      } else if (entry.name.toLowerCase() === name.toLowerCase()) {
        return full
      }
    }
    return null
  }

  const foundFfmpeg = findFile(tmpExtract, 'ffmpeg.exe')
  const foundFfprobe = findFile(tmpExtract, 'ffprobe.exe')

  if (foundFfmpeg) {
    fs.copyFileSync(foundFfmpeg, ffmpegExe)
    console.log('[ensure-ffmpeg] Copied ffmpeg.exe to:', ffmpegExe)
  }
  if (foundFfprobe) {
    fs.copyFileSync(foundFfprobe, path.join(binDir, 'ffprobe.exe'))
    console.log('[ensure-ffmpeg] Copied ffprobe.exe to:', path.join(binDir, 'ffprobe.exe'))
  }

  try { fs.rmSync(tmpExtract, { recursive: true, force: true }) } catch {}
  try { fs.unlinkSync(tmpZip) } catch {}
  console.log('[ensure-ffmpeg] Pinned LGPL FFmpeg setup complete!')
}

main().catch(err => {
  console.error('[ensure-ffmpeg] Error:', err)
  process.exit(1)
})
