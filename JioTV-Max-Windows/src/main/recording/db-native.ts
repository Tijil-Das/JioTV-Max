import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import type DatabaseConstructor from 'better-sqlite3'
import type { Database as DatabaseType } from 'better-sqlite3'

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const BetterSqlite = require('better-sqlite3') as typeof DatabaseConstructor

const isElectron = Boolean(process.versions.electron)

function getCandidateReleaseDirs(): string[] {
  const dirs: string[] = []

  // 1. Through package.json resolution
  try {
    const pkgPath = require.resolve('better-sqlite3/package.json')
    dirs.push(path.join(path.dirname(pkgPath), 'build/Release'))
  } catch {
    // ignore
  }

  // 2. Relative to process.cwd()
  dirs.push(path.resolve(process.cwd(), 'node_modules/better-sqlite3/build/Release'))

  // 3. Relative to __dirname (handles out/main and src/main/recording)
  dirs.push(path.resolve(__dirname, '../../node_modules/better-sqlite3/build/Release'))
  dirs.push(path.resolve(__dirname, '../../../node_modules/better-sqlite3/build/Release'))

  // 4. In packaged Electron app (app.asar.unpacked)
  if (process.resourcesPath) {
    dirs.push(
      path.join(process.resourcesPath, 'app.asar.unpacked/node_modules/better-sqlite3/build/Release')
    )
  }

  return dirs
}

function resolveNativeBinding(): string | undefined {
  const candidateDirs = getCandidateReleaseDirs()

  if (!isElectron) {
    // In Node (e.g. Vitest test runner), prefer the Node-compiled binary to avoid Electron ABI mismatch
    for (const dir of candidateDirs) {
      const nodeBinary = path.join(dir, 'better_sqlite3_node.node')
      if (fs.existsSync(nodeBinary)) {
        return nodeBinary
      }
    }
  }

  // In Electron (or fallback in Node), look for better_sqlite3.node
  for (const dir of candidateDirs) {
    const electronBinary = path.join(dir, 'better_sqlite3.node')
    if (fs.existsSync(electronBinary)) {
      return electronBinary
    }
  }

  // Let better-sqlite3 resolve via standard bindings if nothing explicit was found
  return undefined
}

export function openDatabase(filename: string, options?: DatabaseConstructor.Options): DatabaseType {
  const targetBinding = resolveNativeBinding()
  const mergedOptions: DatabaseConstructor.Options = {
    ...options
  }
  if (targetBinding) {
    mergedOptions.nativeBinding = targetBinding
  }
  return new BetterSqlite(filename, mergedOptions)
}

export type { DatabaseType }
