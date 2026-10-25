import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const projectRoot = path.resolve(import.meta.dirname, '..')
const betterSqliteDir = path.join(projectRoot, 'node_modules', 'better-sqlite3')
const releaseDir = path.join(betterSqliteDir, 'build', 'Release')
const destElectron = path.join(releaseDir, 'better_sqlite3.node')
const destNode = path.join(releaseDir, 'better_sqlite3_node.node')

const version = 'v12.11.1'

async function downloadAndExtract(abi, targetFile) {
  if (fs.existsSync(targetFile)) {
    return
  }
  const tarName = `better-sqlite3-${version}-${abi}-win32-x64.tar.gz`
  const url = `https://github.com/WiseLibs/better-sqlite3/releases/download/${version}/${tarName}`
  console.log(`[ensure-better-sqlite] Downloading ${tarName}...`)
  const tmpTar = path.join(projectRoot, 'build', tarName)
  fs.mkdirSync(path.dirname(tmpTar), { recursive: true })

  const resp = await fetch(url)
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status} ${resp.statusText}`)
  }
  fs.writeFileSync(tmpTar, Buffer.from(await resp.arrayBuffer()))

  const tmpExtract = path.join(projectRoot, 'build', `extract_${abi}`)
  fs.mkdirSync(tmpExtract, { recursive: true })
  execSync(`tar -xzf "${tmpTar}" -C "${tmpExtract}"`, { stdio: 'inherit' })
  
  const extractedNode = path.join(tmpExtract, 'build', 'Release', 'better_sqlite3.node')
  fs.mkdirSync(path.dirname(targetFile), { recursive: true })
  fs.copyFileSync(extractedNode, targetFile)
  
  try { fs.rmSync(tmpExtract, { recursive: true, force: true }) } catch {}
  try { fs.unlinkSync(tmpTar) } catch {}
  console.log(`[ensure-better-sqlite] Saved ${path.basename(targetFile)}`)
}

async function main() {
  await downloadAndExtract('electron-v130', destElectron)
  await downloadAndExtract('node-v127', destNode)
  console.log('[ensure-better-sqlite] All binaries ready for Electron 33 and Node 22!')
}

main().catch(err => {
  console.error('[ensure-better-sqlite] Error:', err)
  process.exit(1)
})
