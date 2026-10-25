import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { NamingStorage } from '../../src/main/recording/naming-storage'

const TEST_DIR = path.join(__dirname, 'test-storage-folder')

describe('NamingStorage', () => {
  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true })
    }
  })

  afterEach(() => {
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    } catch {}
  })

  it('generates filename from pattern and metadata', () => {
    // 2026-10-25 15:45:00
    const testEpoch = new Date(2026, 9, 25, 15, 45, 0).getTime()
    const name = NamingStorage.generateFilename('Star Sports 1 HD', testEpoch)
    expect(name).toBe('Star_Sports_1_HD_2026-10-25_15-45.mp4')
  })

  it('detects existing files and suggests auto-numbered conflict name', () => {
    const filename = 'News_18.mp4'
    const fullPath = path.join(TEST_DIR, filename)
    fs.writeFileSync(fullPath, 'fake_mp4_bytes')

    const res1 = NamingStorage.checkConflict(TEST_DIR, filename)
    expect(res1.hasConflict).toBe(true)
    expect(res1.type).toBe('existing_file')
    expect(res1.suggestedName).toBe('News_18_conflict_1.mp4')

    // Create conflict 1 as well
    fs.writeFileSync(res1.suggestedPath, 'fake_bytes_2')
    const res2 = NamingStorage.checkConflict(TEST_DIR, filename)
    expect(res2.hasConflict).toBe(true)
    expect(res2.suggestedName).toBe('News_18_conflict_2.mp4')
  })

  it('adds long-path prefix on Windows if path exceeds limit', () => {
    const longSegment = 'A'.repeat(250)
    const longPath = `C:\\Recordings\\${longSegment}\\file.mp4`
    const formatted = NamingStorage.toLongPath(longPath)
    if (process.platform === 'win32') {
      expect(formatted.startsWith('\\\\?\\')).toBe(true)
    }
  })
})
