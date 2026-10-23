/**
 * repo.ts — Derives all repo-specific facts at runtime. Nothing is hardcoded.
 * Reads: git remote, package.json, release.yml, pnpm-lock, release-notes.md
 */

import { execa } from 'execa'
import fs from 'node:fs'
import path from 'node:path'
import semver from 'semver'

export interface RepoContext {
  /** Absolute path to the git repo root */
  gitRoot: string
  /** Absolute path to the app's package.json directory */
  appDir: string
  /** Current app version from package.json */
  appVersion: string
  /** Package manager used in the app dir */
  packageManager: 'pnpm' | 'npm' | 'yarn'
  /** Current git branch */
  branch: string
  /** Latest local tag (e.g. "v1.0.0") or null */
  lastTag: string | null
  /** GitHub owner/repo, derived from remote origin URL */
  owner: string
  repo: string
  /** Path to release-notes.md (as used by release.yml) */
  releaseNotesPath: string
  /** Relative path to workflow file from repo root */
  workflowPath: string
  /** Tag trigger pattern from release.yml */
  tagPattern: string
  /** Job names from the workflow */
  jobNames: string[]
  /** Platforms configured in electron-builder (package.json build section) */
  configuredPlatforms: ('windows' | 'mac' | 'linux')[]
  /** Whether the workflow uses a matrix (affects platform selection UX) */
  workflowHasMatrix: boolean
  /** Whether workflow_dispatch is configured */
  workflowHasDispatch: boolean
}

/** Parse "owner/repo" from a GitHub remote URL (https or ssh). */
function parseGitHubRemote(url: string): { owner: string; repo: string } {
  // https://github.com/Owner/Repo.git  or  git@github.com:Owner/Repo.git
  const m =
    url.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/) ||
    url.match(/github\.com\/([^/]+)\/([^/.]+)/)
  if (!m) throw new Error(`Cannot parse GitHub remote URL: ${url}`)
  return { owner: m[1], repo: m[2] }
}

/** Best-effort YAML field extractor — no full YAML parser dependency. */
function extractYamlField(yaml: string, field: string): string | null {
  const re = new RegExp(`^\\s*${field}:\\s*['"]?([^'"\\n]+)['"]?`, 'm')
  const m = yaml.match(re)
  return m ? m[1].trim() : null
}

function extractYamlJobs(yaml: string): string[] {
  const jobsBlock = yaml.match(/^jobs:\s*\n([\s\S]*)/m)
  if (!jobsBlock) return []
  const lines = jobsBlock[1].split('\n')
  const jobs: string[] = []
  for (const line of lines) {
    // Top-level job names are indented 2 spaces under "jobs:"
    const m = line.match(/^  ([a-zA-Z0-9_-]+):\s*$/)
    if (m) jobs.push(m[1])
  }
  return jobs
}

export async function discoverRepo(): Promise<RepoContext> {
  // 1. Git root
  const { stdout: gitRoot } = await execa('git', ['rev-parse', '--show-toplevel'])
  const root = gitRoot.trim().replace(/\\/g, '/')

  // 2. Remote URL → owner/repo
  const { stdout: remoteUrl } = await execa('git', ['remote', 'get-url', 'origin'], {
    cwd: root,
  })
  const { owner, repo } = parseGitHubRemote(remoteUrl.trim())

  // 3. Current branch
  const { stdout: branchOut } = await execa('git', ['branch', '--show-current'], { cwd: root })
  const branch = branchOut.trim()

  // 4. Last tag
  let lastTag: string | null = null
  try {
    const { stdout: tagOut } = await execa(
      'git',
      ['describe', '--tags', '--abbrev=0', '--match', 'v*'],
      { cwd: root }
    )
    lastTag = tagOut.trim() || null
  } catch {
    lastTag = null
  }

  // 5. App dir — find package.json with electron-builder config
  const candidateAppDirs = [
    path.join(root, 'JioTV-Max-Windows'),
    path.join(root, 'app'),
    root,
  ]
  let appDir = root
  for (const d of candidateAppDirs) {
    const pjPath = path.join(d, 'package.json')
    if (fs.existsSync(pjPath)) {
      try {
        const pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'))
        if (pj.build?.publish || pj.build?.appId) {
          appDir = d
          break
        }
      } catch {}
    }
  }

  // 6. App version
  const appPjPath = path.join(appDir, 'package.json')
  const appPj = JSON.parse(fs.readFileSync(appPjPath, 'utf8'))
  const appVersion: string = appPj.version

  // 7. Package manager
  const packageManager: 'pnpm' | 'npm' | 'yarn' = fs.existsSync(
    path.join(appDir, 'pnpm-lock.yaml')
  )
    ? 'pnpm'
    : fs.existsSync(path.join(appDir, 'yarn.lock'))
    ? 'yarn'
    : 'npm'

  // 8. Workflow file
  const workflowPath = path.join(root, '.github', 'workflows', 'release.yml')
  if (!fs.existsSync(workflowPath)) {
    throw new Error(`release.yml not found at ${workflowPath}`)
  }
  const workflowYaml = fs.readFileSync(workflowPath, 'utf8')

  // Tag pattern
  const tagPatternMatch = workflowYaml.match(/tags:\s*\[?'?([^'\]\n]+)'?\]?/)
  const tagPattern = tagPatternMatch ? tagPatternMatch[1].trim() : 'v*'

  // Job names
  const jobNames = extractYamlJobs(workflowYaml)

  // workflow_dispatch
  const workflowHasDispatch = workflowYaml.includes('workflow_dispatch')

  // matrix
  const workflowHasMatrix = workflowYaml.includes('matrix:')

  // 9. Configured platforms from electron-builder config
  const configuredPlatforms: ('windows' | 'mac' | 'linux')[] = []
  if (appPj.build?.win) configuredPlatforms.push('windows')
  if (appPj.build?.mac) configuredPlatforms.push('mac')
  if (appPj.build?.linux) configuredPlatforms.push('linux')
  // Always include windows if nothing found (fallback)
  if (configuredPlatforms.length === 0) configuredPlatforms.push('windows')

  // 10. release-notes.md — workflow checks ../release-notes.md (relative to JioTV-Max-Windows)
  // which maps to root/release-notes.md
  const releaseNotesPath = path.join(root, 'release-notes.md')

  return {
    gitRoot: root,
    appDir: appDir.replace(/\\/g, '/'),
    appVersion,
    packageManager,
    branch,
    lastTag,
    owner,
    repo,
    releaseNotesPath: releaseNotesPath.replace(/\\/g, '/'),
    workflowPath: '.github/workflows/release.yml',
    tagPattern,
    jobNames: jobNames.length > 0 ? jobNames : ['release'],
    configuredPlatforms,
    workflowHasMatrix,
    workflowHasDispatch,
  }
}

/** Compute the new version string from bump type. */
export function computeNextVersion(
  current: string,
  bump: 'patch' | 'minor' | 'major' | 'prerelease' | string
): string {
  if (bump === 'patch' || bump === 'minor' || bump === 'major' || bump === 'prerelease') {
    const next = semver.inc(current, bump)
    if (!next) throw new Error(`semver.inc(${current}, ${bump}) returned null`)
    return next
  }
  // Custom version
  const clean = semver.clean(bump)
  if (!clean) throw new Error(`"${bump}" is not a valid semver version`)
  return clean
}

/** Check whether a tag already exists locally or on origin. */
export async function tagExists(
  tag: string,
  cwd: string
): Promise<{ local: boolean; remote: boolean }> {
  let local = false
  let remote = false
  try {
    const { stdout } = await execa('git', ['tag', '-l', tag], { cwd })
    local = stdout.trim() === tag
  } catch {}
  try {
    const { stdout } = await execa('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`], {
      cwd,
    })
    remote = stdout.trim().length > 0
  } catch {}
  return { local, remote }
}

/** Check if working tree is clean. */
export async function isWorkingTreeClean(cwd: string): Promise<boolean> {
  const { stdout } = await execa('git', ['status', '--porcelain'], { cwd })
  return stdout.trim().length === 0
}

/** Check if local branch is behind origin. */
export async function isBehindOrigin(branch: string, cwd: string): Promise<boolean> {
  try {
    await execa('git', ['fetch', 'origin', '--quiet'], { cwd })
    const { stdout } = await execa(
      'git',
      ['rev-list', '--count', `HEAD..origin/${branch}`],
      { cwd }
    )
    return parseInt(stdout.trim(), 10) > 0
  } catch {
    return false
  }
}

/** Read release-notes.md content. Returns empty string if not found. */
export function readReleaseNotes(filePath: string): string {
  if (!fs.existsSync(filePath)) return ''
  return fs.readFileSync(filePath, 'utf8')
}

/** Write release-notes.md content. */
export function writeReleaseNotes(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, 'utf8')
}
