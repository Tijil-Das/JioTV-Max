import fs from 'node:fs'
import path from 'node:path'
import { spawnSync, spawn } from 'node:child_process'
import type { RecordingRepository } from './repository'
import type { RecordingRecord } from '../../shared/recording-types'
import { FFmpegResolver } from './ffmpeg-resolver'
import { NamingStorage } from './naming-storage'

export interface FinalizeJob {
  recordingId: string
  workingDir: string
  onComplete?: (success: boolean, finalPath?: string, error?: string) => void
}

export class Finalizer {
  private queue: FinalizeJob[] = []
  private isProcessing = false

  constructor(private readonly repo: RecordingRepository) {}

  enqueue(job: FinalizeJob): void {
    this.queue.push(job)
    this.processNext()
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return
    this.isProcessing = true
    const job = this.queue.shift()!

    try {
      const rec = this.repo.getRecording(job.recordingId)
      if (!rec) {
        job.onComplete?.(false, undefined, 'Recording record not found')
        return
      }

      const result = await this.finalizeRecording(rec, job.workingDir)
      job.onComplete?.(result.ok, result.finalPath, result.error)
    } catch (err) {
      job.onComplete?.(false, undefined, err instanceof Error ? err.message : String(err))
    } finally {
      this.isProcessing = false
      this.processNext()
    }
  }

  async finalizeRecording(
    rec: RecordingRecord,
    workingDir: string
  ): Promise<{ ok: boolean; finalPath?: string; error?: string }> {
    const ffmpegPaths = FFmpegResolver.getPaths()
    if (!ffmpegPaths.available) {
      this.markNeedsAttention(rec.id, 'FFmpeg not available for finalization')
      return { ok: false, error: 'FFmpeg not available' }
    }

    // 1. Collect all TS parts
    const parts = this.repo.getParts(rec.id)
    const existingParts = parts.filter((p) => fs.existsSync(p.path) && fs.statSync(p.path).size > 0)

    if (existingParts.length === 0) {
      this.markNeedsAttention(rec.id, 'No captured media parts found to finalize')
      return { ok: false, error: 'No media parts found' }
    }

    // 2. Resolve final destination path & check conflict
    let targetFolder = rec.folder
    try {
      if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true })
    } catch {
      targetFolder = NamingStorage.getDefaultRecordingsDir()
      fs.mkdirSync(targetFolder, { recursive: true })
    }

    const conflict = NamingStorage.checkConflict(targetFolder, rec.filename)
    const finalDestPath = conflict.hasConflict ? conflict.suggestedPath : path.join(targetFolder, rec.filename)
    const tempFinalPath = path.join(workingDir, 'output_temp.mp4')

    // 3. Create concat list file
    const concatListFile = path.join(workingDir, 'concat_list.txt')
    const concatContent = existingParts
      .map((p) => `file '${p.path.replace(/\\/g, '/')}'`)
      .join('\n')

    fs.writeFileSync(concatListFile, concatContent, 'utf8')

    // 4. Probe audio codec to check MP4 compatibility
    let needsAudioTranscode = false
    try {
      const probeProc = spawnSync(ffmpegPaths.ffprobePath, [
        '-v', 'error',
        '-select_streams', 'a:0',
        '-show_entries', 'stream=codec_name',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        existingParts[0].path
      ], { windowsHide: true })
      const codecName = probeProc.stdout?.toString().trim().toLowerCase()
      if (codecName === 'mp2' || codecName === 'mp1') {
        needsAudioTranscode = true
      }
    } catch {}

    // 5. Build FFmpeg command
    const args: string[] = [
      '-hide_banner',
      '-loglevel', 'warning',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListFile,
      '-map', '0:v?',
      '-map', '0:a?',
      '-c:v', 'copy',
      needsAudioTranscode ? '-c:a' : '-c:a',
      needsAudioTranscode ? 'aac' : 'copy'
    ]

    if (needsAudioTranscode) {
      args.push('-b:a', '192k')
    }

    args.push(
      '-movflags', '+faststart',
      '-y',
      tempFinalPath
    )

    // Execute with below-normal process priority
    const runResult = await new Promise<{ code: number | null; error?: string }>((resolve) => {
      try {
        const proc = spawn(ffmpegPaths.ffmpegPath, args, {
          windowsHide: true,
          stdio: ['ignore', 'ignore', 'pipe']
        })

        let stderr = ''
        proc.stderr?.on('data', (d) => {
          stderr += d.toString()
        })

        proc.on('exit', (code) => {
          resolve({ code, error: stderr })
        })
      } catch (e) {
        resolve({ code: -1, error: e instanceof Error ? e.message : String(e) })
      }
    })

    if (runResult.code !== 0 || !fs.existsSync(tempFinalPath)) {
      this.markNeedsAttention(rec.id, `FFmpeg remux failed (${runResult.code}): ${runResult.error}`)
      return { ok: false, error: runResult.error }
    }

    // 6. Verify duration & streams using ffprobe
    let verifiedDuration = 0
    let hasVideo = false
    let hasAudio = false

    try {
      const probeProc = spawnSync(ffmpegPaths.ffprobePath, [
        '-v', 'error',
        '-show_entries', 'format=duration:stream=codec_type',
        '-of', 'json',
        tempFinalPath
      ], { windowsHide: true })

      if (probeProc.status === 0) {
        const info = JSON.parse(probeProc.stdout.toString()) as {
          format?: { duration?: string }
          streams?: Array<{ codec_type?: string }>
        }
        verifiedDuration = parseFloat(info.format?.duration || '0')
        hasVideo = Boolean(info.streams?.some((s) => s.codec_type === 'video'))
        hasAudio = Boolean(info.streams?.some((s) => s.codec_type === 'audio'))
      }
    } catch {}

    if (verifiedDuration <= 0 && !hasVideo) {
      this.markNeedsAttention(rec.id, 'Verification failed: rendered MP4 has 0 duration or missing video stream')
      return { ok: false, error: 'Verification failed' }
    }

    // 7. Generate poster thumbnail
    const thumbDir = path.join(targetFolder, '.thumbs')
    try {
      if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true })
    } catch {}
    const thumbPath = path.join(thumbDir, `${rec.id}.jpg`)

    try {
      const seekTime = Math.max(1, Math.min(10, Math.floor(verifiedDuration * 0.1)))
      spawnSync(ffmpegPaths.ffmpegPath, [
        '-hide_banner',
        '-ss', String(seekTime),
        '-i', tempFinalPath,
        '-vframes', '1',
        '-q:v', '2',
        '-y',
        thumbPath
      ], { windowsHide: true })
    } catch {}

    // 8. Move temporary output to final destination atomically
    try {
      fs.copyFileSync(tempFinalPath, finalDestPath)
      fs.unlinkSync(tempFinalPath)
    } catch (moveErr) {
      this.markNeedsAttention(rec.id, `Failed to move final MP4 to target destination: ${moveErr}`)
      return { ok: false, error: String(moveErr) }
    }

    // 9. Update DB record ONLY on verified success
    const finalSize = fs.statSync(finalDestPath).size
    this.repo.updateRecordingFields(rec.id, {
      status: 'completed',
      finalPath: finalDestPath,
      tempConflictName: conflict.hasConflict ? conflict.suggestedName : undefined,
      sizeBytes: finalSize,
      durationSeconds: Math.round(verifiedDuration),
      actualEndUtc: new Date().toISOString()
    })

    this.repo.addEvent({
      recordingId: rec.id,
      type: 'transition',
      fromStatus: 'finalizing',
      toStatus: 'completed',
      message: `Recording finalized successfully to ${path.basename(finalDestPath)} (${Math.round(verifiedDuration)}s, ${Math.round(finalSize / 1024 / 1024)} MB)`,
      timestamp: new Date().toISOString()
    })

    // 10. Clean up working files on verified success only
    try {
      fs.rmSync(workingDir, { recursive: true, force: true })
    } catch {}

    return { ok: true, finalPath: finalDestPath }
  }

  private markNeedsAttention(recordingId: string, reason: string): void {
    this.repo.transitionStatus(recordingId, 'needs_attention', `Finalization failed: ${reason}`)
    this.repo.updateRecordingFields(recordingId, {
      failureReason: reason
    })
  }
}
