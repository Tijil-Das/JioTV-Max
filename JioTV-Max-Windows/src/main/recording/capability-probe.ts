import os from 'node:os'
import crypto from 'node:crypto'
import { spawnSync, spawn } from 'node:child_process'
import type { RecordingRepository } from './repository'
import type { CapabilityProbeResult, CapabilityTier } from '../../shared/recording-types'
import { FFmpegResolver } from './ffmpeg-resolver'

export class CapabilityProbe {
  private static activeBenchmark: Promise<CapabilityProbeResult> | null = null

  static getHardwareFingerprint(): { fingerprint: string; cpuModel: string; cores: number; ramBytes: number } {
    const cpus = os.cpus()
    const cpuModel = cpus[0]?.model || 'Unknown CPU'
    const cores = cpus.length
    const ramBytes = os.totalmem()

    const raw = `${cpuModel}|${cores}|${ramBytes}`
    const fingerprint = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16)

    return { fingerprint, cpuModel, cores, ramBytes }
  }

  static async probe(repo: RecordingRepository, forceRecheck = false): Promise<CapabilityProbeResult> {
    const hw = this.getHardwareFingerprint()

    if (!forceRecheck) {
      const cached = repo.getCapabilityCache(hw.fingerprint)
      if (cached) return cached
    }

    if (this.activeBenchmark) return this.activeBenchmark

    this.activeBenchmark = (async () => {
      try {
        const result = await this.runProbe(hw)
        repo.saveCapabilityCache(result)
        return result
      } finally {
        this.activeBenchmark = null
      }
    })()

    return this.activeBenchmark
  }

  private static async runProbe(hw: {
    fingerprint: string
    cpuModel: string
    cores: number
    ramBytes: number
  }): Promise<CapabilityProbeResult> {
    const ffmpegInfo = FFmpegResolver.getPaths()
    if (!ffmpegInfo.available) {
      return {
        fingerprint: hw.fingerprint,
        cpuModel: hw.cpuModel,
        cores: hw.cores,
        ramBytes: hw.ramBytes,
        gpuModel: 'Unknown GPU',
        encoders: [],
        benchmarkFps: 0,
        benchmarkSpeed: 0,
        tier: 'unavailable',
        reason: 'FFmpeg binary not available',
        testedAt: new Date().toISOString()
      }
    }

    // 1. Detect hardware encoders supported by bundled FFmpeg
    const probeProc = spawnSync(ffmpegInfo.ffmpegPath, ['-hide_banner', '-encoders'], {
      windowsHide: true,
      encoding: 'utf8'
    })
    const out = probeProc.stdout || ''

    const availableHwEncoders: string[] = []
    if (out.includes('h264_nvenc')) availableHwEncoders.push('h264_nvenc')
    if (out.includes('h264_qsv')) availableHwEncoders.push('h264_qsv')
    if (out.includes('h264_amf')) availableHwEncoders.push('h264_amf')

    if (availableHwEncoders.length === 0) {
      return {
        fingerprint: hw.fingerprint,
        cpuModel: hw.cpuModel,
        cores: hw.cores,
        ramBytes: hw.ramBytes,
        gpuModel: 'Integrated/Generic GPU',
        encoders: [],
        benchmarkFps: 0,
        benchmarkSpeed: 0,
        tier: 'unavailable',
        reason: 'No hardware encoder (NVENC/QSV/AMF) detected on this PC. Timestamp overlay requires hardware acceleration.',
        testedAt: new Date().toISOString()
      }
    }

    // 2. Select best encoder candidate (NVENC > QSV > AMF)
    const selectedEncoder = availableHwEncoders[0]

    // 3. Short low-priority benchmark (5 seconds testsrc at 1080p25)
    // Run at below-normal priority so player/desktop is never disrupted
    const benchmarkArgs = [
      '-hide_banner',
      '-f', 'lavfi',
      '-i', 'testsrc=size=1920x1080:rate=25',
      '-t', '4',
      '-c:v', selectedEncoder,
      '-f', 'null',
      '-'
    ]

    const benchmarkResult = await new Promise<{ fps: number; speed: number; ok: boolean }>((resolve) => {
      try {
        const proc = spawn(ffmpegInfo.ffmpegPath, benchmarkArgs, {
          windowsHide: true,
          stdio: ['ignore', 'ignore', 'pipe']
        })

        let stderr = ''
        proc.stderr?.on('data', (d) => {
          stderr += d.toString()
        })

        proc.on('exit', (code) => {
          if (code === 0) {
            // Parse speed: e.g. "speed= 4.2x" or "fps= 98"
            const speedMatch = stderr.match(/speed=\s*([0-9.]+)x/)
            const fpsMatch = stderr.match(/fps=\s*([0-9.]+)/)
            const speed = speedMatch ? parseFloat(speedMatch[1]) : 0
            const fps = fpsMatch ? parseFloat(fpsMatch[1]) : 0
            resolve({ speed, fps, ok: true })
          } else {
            resolve({ speed: 0, fps: 0, ok: false })
          }
        })
      } catch {
        resolve({ speed: 0, fps: 0, ok: false })
      }
    })

    let tier: CapabilityTier = 'unavailable'
    let reason: string | undefined

    if (!benchmarkResult.ok || benchmarkResult.speed === 0) {
      tier = 'unavailable'
      reason = `Hardware encoder ${selectedEncoder} failed during benchmark execution.`
    } else if (benchmarkResult.speed >= 3.0 && hw.ramBytes >= 6 * 1024 * 1024 * 1024) {
      tier = 'full'
    } else if (benchmarkResult.speed >= 1.4) {
      tier = 'limited'
      reason = `Hardware encode speed is ${benchmarkResult.speed.toFixed(1)}x; limited to 720p or lower.`
    } else {
      tier = 'unavailable'
      reason = `Hardware encode speed ${benchmarkResult.speed.toFixed(1)}x is below real-time threshold (1.4x).`
    }

    return {
      fingerprint: hw.fingerprint,
      cpuModel: hw.cpuModel,
      cores: hw.cores,
      ramBytes: hw.ramBytes,
      gpuModel: selectedEncoder.replace('h264_', '').toUpperCase(),
      encoders: availableHwEncoders,
      benchmarkFps: Math.round(benchmarkResult.fps),
      benchmarkSpeed: Math.round(benchmarkResult.speed * 10) / 10,
      tier,
      reason,
      testedAt: new Date().toISOString()
    }
  }
}
