import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { spawnSync } from 'node:child_process'

export interface FFmpegPaths {
  ffmpegPath: string
  ffprobePath: string
  available: boolean
  version?: string
  error?: string
}

export class FFmpegResolver {
  private static cachedResult: FFmpegPaths | null = null

  static getPaths(): FFmpegPaths {
    if (this.cachedResult) return this.cachedResult

    const appPath = typeof app !== 'undefined' ? app.getAppPath() : process.cwd()

    // Candidates in order of precedence:
    // 1. Asar unpacked directory (packaged app)
    // 2. build/bin relative to app path
    // 3. build/bin relative to cwd
    const candidates = [
      path.join(process.resourcesPath || '', 'app.asar.unpacked', 'build', 'bin', 'ffmpeg.exe'),
      path.join(appPath, 'build', 'bin', 'ffmpeg.exe'),
      path.join(process.cwd(), 'build', 'bin', 'ffmpeg.exe')
    ]

    let foundFfmpeg: string | null = null
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        foundFfmpeg = cand
        break
      }
    }

    if (!foundFfmpeg) {
      const res: FFmpegPaths = {
        ffmpegPath: '',
        ffprobePath: '',
        available: false,
        error: 'Bundled FFmpeg executable was not found. Please verify application installation.'
      }
      this.cachedResult = res
      return res
    }

    const ffprobePath = path.join(path.dirname(foundFfmpeg), 'ffprobe.exe')

    // Quick verification
    try {
      const probe = spawnSync(foundFfmpeg, ['-version'], { timeout: 3000, windowsHide: true })
      if (probe.status === 0) {
        const out = probe.stdout?.toString() || ''
        const versionMatch = out.match(/ffmpeg version ([^\s]+)/)
        this.cachedResult = {
          ffmpegPath: foundFfmpeg,
          ffprobePath: fs.existsSync(ffprobePath) ? ffprobePath : foundFfmpeg,
          available: true,
          version: versionMatch ? versionMatch[1] : 'unknown'
        }
        return this.cachedResult
      } else {
        this.cachedResult = {
          ffmpegPath: foundFfmpeg,
          ffprobePath,
          available: false,
          error: `FFmpeg probe failed with code ${probe.status}`
        }
        return this.cachedResult
      }
    } catch (e) {
      this.cachedResult = {
        ffmpegPath: foundFfmpeg,
        ffprobePath,
        available: false,
        error: e instanceof Error ? e.message : 'Failed to execute bundled FFmpeg.'
      }
      return this.cachedResult
    }
  }

  static resetCache(): void {
    this.cachedResult = null
  }
}
