const childProcess = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

/**
 * afterPack hook for electron-builder.
 *
 * Runs castLabs EVS VMP signing on the final packaged directory (e.g. win-unpacked).
 * This generates the valid .sig file for the FINAL renamed and resource-edited
 * application executable (e.g. "JioTv Max.exe.sig") BEFORE electron-builder
 * packages the NSIS installer and generates the .blockmap differential file.
 */
module.exports = async function afterPack(context, cp = childProcess) {
  if (context.electronPlatformName !== 'win32') {
    return
  }

  const appOutDir = context.appOutDir
  console.log(`\n[afterPack] Running castLabs EVS VMP signing on: ${appOutDir}`)

  // 1. Try 'evs-vmp' CLI
  let signResult = cp.spawnSync('evs-vmp', ['sign', appOutDir], {
    stdio: 'inherit',
    shell: true
  })

  // 2. Fallback to python castlabs_evs module: python -m castlabs_evs.vmp sign-pkg
  if (signResult.status !== 0) {
    signResult = cp.spawnSync('python', ['-m', 'castlabs_evs.vmp', 'sign-pkg', appOutDir], {
      stdio: 'inherit',
      shell: true
    })
  }

  if (signResult.status !== 0 || signResult.error) {
    if (process.env.SKIP_VMP_SIGN === 'true') {
      console.warn('\n[afterPack] [WARNING] SKIP_VMP_SIGN=true; VMP signature generation was skipped.\n')
      return
    }

    const errDetail = signResult.error ? signResult.error.message : `exit code ${signResult.status}`
    throw new Error(
      `[afterPack] CastLabs VMP signing failed (${errDetail}). Ensure EVS credentials and python -m castlabs_evs.vmp are configured.`
    )
  }

  console.log('[afterPack] CastLabs VMP signing completed successfully.')
}
