import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { Validators } from './validators'

export interface ConflictCheckResult {
  hasConflict: boolean
  type?: 'existing_file' | 'file_locked' | 'folder_unavailable'
  suggestedPath: string
  suggestedName: string
}

export class NamingStorage {
  static getDefaultRecordingsDir(): string {
    if (typeof app !== 'undefined' && app.getPath) {
      try {
        const videos = app.getPath('videos')
        return path.join(videos, 'JioTV Max Recordings')
      } catch {
        return path.join(app.getPath('userData'), 'Recordings')
      }
    }
    return path.join(process.cwd(), 'Recordings')
  }

  /**
   * Generates a filename from pattern and recording metadata
   * Pattern defaults to: <Channel>_<YYYY-MM-DD>_<HH-mm>.mp4
   */
  static generateFilename(
    channelName: string,
    startEpochMs = Date.now(),
    pattern = '{channel}_{date}_{time}'
  ): string {
    const d = new Date(startEpochMs)
    const YYYY = d.getFullYear().toString()
    const MM = (d.getMonth() + 1).toString().padStart(2, '0')
    const DD = d.getDate().toString().padStart(2, '0')
    const HH = d.getHours().toString().padStart(2, '0')
    const mm = d.getMinutes().toString().padStart(2, '0')

    const dateStr = `${YYYY}-${MM}-${DD}`
    const timeStr = `${HH}-${mm}`

    let formatted = pattern
      .replace(/\{channel\}/gi, channelName)
      .replace(/\{date\}/gi, dateStr)
      .replace(/\{time\}/gi, timeStr)
      .replace(/\{year\}/gi, YYYY)
      .replace(/\{month\}/gi, MM)
      .replace(/\{day\}/gi, DD)
      .replace(/\{hour\}/gi, HH)
      .replace(/\{minute\}/gi, mm)

    // Ensure spaces replaced with underscore for clean filenames if requested or sanitize
    formatted = formatted.replace(/\s+/g, '_')
    return Validators.sanitizeFilename(formatted)
  }

  /**
   * Formats a path with Windows long-path prefix (\\?\) if length exceeds 240 chars
   */
  static toLongPath(targetPath: string): string {
    const resolved = path.resolve(targetPath)
    if (process.platform === 'win32' && resolved.length >= 240 && !resolved.startsWith('\\\\?\\')) {
      return `\\\\?\\${resolved}`
    }
    return resolved
  }

  /**
   * Inspects folder accessibility, existing files, and locked files
   */
  static checkConflict(folder: string, filename: string): ConflictCheckResult {
    const cleanName = Validators.sanitizeFilename(filename)
    const fullPath = path.join(folder, cleanName)

    // 1. Folder availability check
    try {
      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true })
      }
    } catch {
      return {
        hasConflict: true,
        type: 'folder_unavailable',
        suggestedPath: path.join(this.getDefaultRecordingsDir(), cleanName),
        suggestedName: cleanName
      }
    }

    // 2. Existing file check
    if (fs.existsSync(fullPath)) {
      // 3. Locked file check
      let isLocked = false
      try {
        const fd = fs.openSync(fullPath, 'r+')
        fs.closeSync(fd)
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code
        if (code === 'EBUSY' || code === 'EPERM') {
          isLocked = true
        }
      }

      // Generate auto-numbered conflict name
      const ext = path.extname(cleanName)
      const base = path.basename(cleanName, ext)
      let counter = 1
      let candidateName = `${base}_conflict_${counter}${ext}`
      let candidatePath = path.join(folder, candidateName)

      while (fs.existsSync(candidatePath)) {
        counter++
        candidateName = `${base}_conflict_${counter}${ext}`
        candidatePath = path.join(folder, candidateName)
      }

      return {
        hasConflict: true,
        type: isLocked ? 'file_locked' : 'existing_file',
        suggestedPath: candidatePath,
        suggestedName: candidateName
      }
    }

    return {
      hasConflict: false,
      suggestedPath: fullPath,
      suggestedName: cleanName
    }
  }

  static getFreeDiskSpace(targetFolder: string): Promise<number> {
    return new Promise((resolve) => {
      try {
        if (!fs.existsSync(targetFolder)) {
          fs.mkdirSync(targetFolder, { recursive: true })
        }
        if (typeof fs.statfs === 'function') {
          fs.statfs(targetFolder, (err, stats) => {
            if (!err && stats) {
              resolve(stats.bfree * stats.bsize)
            } else {
              resolve(50 * 1024 * 1024 * 1024) // Fallback 50 GB
            }
          })
        } else {
          resolve(50 * 1024 * 1024 * 1024)
        }
      } catch {
        resolve(50 * 1024 * 1024 * 1024)
      }
    })
  }
}
