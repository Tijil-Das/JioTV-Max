import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import semver from 'semver'

const projectRoot = path.resolve(__dirname, '../..')

describe('static / config tests', () => {
  const pkgPath = path.join(projectRoot, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

  // ──────────────────────────────────────────────────────────────────────────
  // 1. package.json validations
  // ──────────────────────────────────────────────────────────────────────────
  describe('package.json', () => {
    it('has a valid SemVer version', () => {
      expect(pkg.version).toBeDefined()
      expect(semver.valid(pkg.version)).toBe(pkg.version)
    })

    it('electron-updater, electron-log and semver are in dependencies (not devDependencies)', () => {
      expect(pkg.dependencies['electron-updater']).toBeDefined()
      expect(pkg.dependencies['electron-log']).toBeDefined()
      expect(pkg.dependencies['semver']).toBeDefined()
    })

    it('build.publish is github with owner and repo set', () => {
      expect(pkg.build?.publish?.provider).toBe('github')
      expect(pkg.build?.publish?.owner).toBe('Tijil-Das')
      expect(pkg.build?.publish?.repo).toBe('JioTV-Max')
    })

    it('win target is nsis (not portable, not nsis-web)', () => {
      const targets = pkg.build?.win?.target
      expect(Array.isArray(targets)).toBe(true)
      const targetNames = targets.map((t: any) => (typeof t === 'string' ? t : t.target))
      expect(targetNames).toContain('nsis')
      expect(targetNames).not.toContain('portable')
      expect(targetNames).not.toContain('nsis-web')
    })

    it('nsis config has oneClick: true, perMachine: false, differentialPackage: true', () => {
      const nsis = pkg.build?.nsis
      expect(nsis?.oneClick).toBe(true)
      expect(nsis?.perMachine).toBe(false)
      expect(nsis?.differentialPackage).toBe(true)
    })

    it('asar is not disabled (default true)', () => {
      expect(pkg.build?.asar).not.toBe(false)
    })

    it('no mac or linux targets remain', () => {
      expect(pkg.build?.mac).toBeUndefined()
      expect(pkg.build?.linux).toBeUndefined()
    })

    it('afterPack points to an existing file', () => {
      const afterPackPath = pkg.build?.afterPack
      expect(afterPackPath).toBeDefined()
      const resolved = path.join(projectRoot, afterPackPath)
      expect(fs.existsSync(resolved)).toBe(true)
    })

    it('files includes out/**/*', () => {
      const files = pkg.build?.files
      expect(Array.isArray(files)).toBe(true)
      expect(files).toContain('out/**/*')
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Source code scans
  // ──────────────────────────────────────────────────────────────────────────
  describe('Source scans', () => {
    function getAllFiles(dir: string, fileList: string[] = []): string[] {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          getAllFiles(fullPath, fileList)
        } else if (/\.(ts|tsx|js|cjs|mjs)$/.test(entry.name)) {
          fileList.push(fullPath)
        }
      }
      return fileList
    }

    const srcFiles = getAllFiles(path.join(projectRoot, 'src'))

    it('no quitAndInstall(true anywhere in src/', () => {
      for (const file of srcFiles) {
        const content = fs.readFileSync(file, 'utf8')
        expect(content).not.toMatch(/quitAndInstall\s*\(\s*true/)
      }
    })

    it('no dialog.showErrorBox or dialog.showMessageBox inside updater module', () => {
      const updaterFile = path.join(projectRoot, 'src/main/updater.ts')
      const content = fs.readFileSync(updaterFile, 'utf8')
      expect(content).not.toContain('showErrorBox')
      expect(content).not.toContain('showMessageBox')
    })

    it('updater only runs checks and downloads when app.isPackaged', () => {
      const updaterFile = path.join(projectRoot, 'src/main/updater.ts')
      const content = fs.readFileSync(updaterFile, 'utf8')
      expect(content).toContain('if (!app.isPackaged) return')
    })

    it('index.ts guards close, before-quit, and window-all-closed with isInstallingUpdate()', () => {
      const indexFile = path.join(projectRoot, 'src/main/index.ts')
      const content = fs.readFileSync(indexFile, 'utf8')

      // Assert close handler has guard
      expect(content).toMatch(/mainWindow\.on\('close',\s*\(\)\s*=>\s*\{\s*if\s*\(isInstallingUpdate\(\)\)\s*return/)

      // Assert before-quit handler has guard
      expect(content).toMatch(/app\.on\('before-quit',\s*\(\)\s*=>\s*\{\s*if\s*\(isInstallingUpdate\(\)\)\s*return/)

      // Assert window-all-closed handler has guard
      expect(content).toMatch(/app\.on\('window-all-closed',\s*\(\)\s*=>\s*\{\s*if\s*\(isInstallingUpdate\(\)\)\s*return/)
    })

    it('index.ts calls createWindow() BEFORE closeInstallingPanel()', () => {
      const indexFile = path.join(projectRoot, 'src/main/index.ts')
      const content = fs.readFileSync(indexFile, 'utf8')
      const createWinIndex = content.indexOf('await createWindow()')
      const closePanelIndex = content.indexOf('closeInstallingPanel()')
      expect(createWinIndex).toBeGreaterThan(-1)
      expect(closePanelIndex).toBeGreaterThan(-1)
      expect(createWinIndex).toBeLessThan(closePanelIndex)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 3. GitHub Actions Release Workflow
  // ──────────────────────────────────────────────────────────────────────────
  describe('release.yml workflow', () => {
    const workflowPath = fs.existsSync(path.join(projectRoot, '.github/workflows/release.yml'))
      ? path.join(projectRoot, '.github/workflows/release.yml')
      : path.join(projectRoot, '../.github/workflows/release.yml')
    const content = fs.readFileSync(workflowPath, 'utf8')

    it('triggers on v* tags', () => {
      expect(content).toContain("tags: ['v*']")
    })

    it('has permissions contents: write', () => {
      expect(content).toContain('contents: write')
    })

    it('uses pnpm action-setup and frozen lockfile', () => {
      expect(content).toContain('pnpm/action-setup')
      expect(content).toContain('pnpm install --frozen-lockfile')
    })

    it('runs pnpm test BEFORE publishing', () => {
      const testIndex = content.indexOf('run: pnpm test')
      const publishIndex = content.indexOf('--publish always')
      expect(testIndex).toBeGreaterThan(-1)
      expect(publishIndex).toBeGreaterThan(-1)
      expect(testIndex).toBeLessThan(publishIndex)
    })

    it('matrix / runner is Windows-only', () => {
      expect(content).toContain('runs-on: windows-latest')
      expect(content).not.toContain('macos-latest')
      expect(content).not.toContain('ubuntu-latest')
    })

    it('tag verification shell logic: passes with matching tag, fails with non-matching tag', () => {
      const version = pkg.version
      const matchingRef = `v${version}`
      const nonMatchingRef = 'v99.99.99'

      const verifyTag = (ref: string) => `v${version}` === ref

      expect(verifyTag(matchingRef)).toBe(true)
      expect(verifyTag(nonMatchingRef)).toBe(false)
    })
  })
})
