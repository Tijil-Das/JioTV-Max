const { spawnSync } = require('node:child_process')
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
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') {
    return
  }

  const appOutDir = context.appOutDir
  console.log(`\n[afterPack] Running castLabs EVS VMP signing on: ${appOutDir}`)

  // 1. Try 'evs-vmp' CLI
  let signResult = spawnSync('evs-vmp', ['sign', appOutDir], {
    stdio: 'inherit',
    shell: true
  })

  // 2. Fallback to python castlabs_evs module: python -m castlabs_evs.vmp sign-pkg
  if (signResult.status !== 0) {
    signResult = spawnSync('python', ['-m', 'castlabs_evs.vmp', 'sign-pkg', appOutDir], {
      stdio: 'inherit',
      shell: true
    })
  }

  if (signResult.status !== 0) {
    if (process.env.CI || process.env.REQUIRE_VMP) {
      throw new Error(
        `[afterPack] CastLabs VMP signing failed (exit code ${signResult.status}). Ensure EVS credentials and evs-vmp are configured.`
      )
    }

    console.warn('\n[afterPack] [WARNING] evs-vmp CLI was not found or failed.')
    console.warn(
      '[afterPack] VMP signature generation was skipped. (Production releases must run in CI with EVS configured).\n'
    )
  } else {
    console.log('[afterPack] CastLabs VMP signing completed successfully.')
  }
}
