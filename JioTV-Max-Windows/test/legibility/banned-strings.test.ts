import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Addendum 3 §10 · banned-string scan.
 *
 * Never fabricate content, and never append "Live" to a channel name. This
 * walks the renderer source (not tests) so copy regressions fail CI.
 */

const BANNED = [
  'Tonight on',
  'Live broadcast on',
  '0% watched',
  'Live programming',
  'Live programme',
  'Live programming from JioTV'
]

const APPENDED_LIVE = /\$\{[^}]*\.name[^}]*\}\s+Live\b/

function collectSourceFiles(directory: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      files.push(...collectSourceFiles(fullPath))
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      files.push(fullPath)
    }
  }
  return files
}

describe('Addendum 3 §10 · banned copy', () => {
  const files = collectSourceFiles(resolve(__dirname, '../../src/renderer/src'))

  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  for (const phrase of BANNED) {
    it(`never contains "${phrase}"`, () => {
      const offenders = files.filter((file) => readFileSync(file, 'utf-8').includes(phrase))
      expect(offenders).toEqual([])
    })
  }

  it('never appends "Live" to a channel name', () => {
    const offenders = files.filter((file) => APPENDED_LIVE.test(readFileSync(file, 'utf-8')))
    expect(offenders).toEqual([])
  })
})
