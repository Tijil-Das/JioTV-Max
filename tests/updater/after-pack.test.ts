import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockSpawnSync = vi.fn()
const fakeCp = { spawnSync: mockSpawnSync }

describe('scripts/after-pack.cjs tests', () => {
  let afterPack: (context: any, cp?: any) => Promise<void>
  const originalEnv = process.env

  beforeEach(async () => {
    process.env = { ...originalEnv }
    delete process.env.SKIP_VMP_SIGN
    mockSpawnSync.mockReset()
    vi.resetModules()
    afterPack = require('../../scripts/after-pack.cjs')
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('skips execution if platform is not win32', async () => {
    await afterPack(
      {
        electronPlatformName: 'darwin',
        appOutDir: '/tmp/test-out'
      },
      fakeCp
    )
    expect(mockSpawnSync).not.toHaveBeenCalled()
  })

  it('success path: calls signing command with appOutDir and completes without error', async () => {
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: Buffer.from('Signed successfully'),
      stderr: Buffer.from('')
    })

    await expect(
      afterPack(
        {
          electronPlatformName: 'win32',
          appOutDir: 'C:\\dist\\win-unpacked'
        },
        fakeCp
      )
    ).resolves.toBeUndefined()

    expect(mockSpawnSync).toHaveBeenCalledWith(
      'evs-vmp',
      ['sign', 'C:\\dist\\win-unpacked'],
      expect.objectContaining({ shell: true })
    )
  })

  it('fallback: if evs-vmp fails, falls back to python -m castlabs_evs.vmp sign-pkg', async () => {
    mockSpawnSync
      // 1st call fails (evs-vmp)
      .mockReturnValueOnce({ status: 1, error: new Error('command not found') })
      // 2nd call succeeds (python -m castlabs_evs.vmp sign-pkg)
      .mockReturnValueOnce({ status: 0 })

    await expect(
      afterPack(
        {
          electronPlatformName: 'win32',
          appOutDir: 'C:\\dist\\win-unpacked'
        },
        fakeCp
      )
    ).resolves.toBeUndefined()

    expect(mockSpawnSync).toHaveBeenCalledTimes(2)
    expect(mockSpawnSync).toHaveBeenNthCalledWith(
      2,
      'python',
      ['-m', 'castlabs_evs.vmp', 'sign-pkg', 'C:\\dist\\win-unpacked'],
      expect.objectContaining({ shell: true })
    )
  })

  it('failure path: non-zero exit code makes the hook THROW so the build fails', async () => {
    mockSpawnSync.mockReturnValue({
      status: 1,
      stderr: Buffer.from('EVS server rejected binary')
    })

    await expect(
      afterPack(
        {
          electronPlatformName: 'win32',
          appOutDir: 'C:\\dist\\win-unpacked'
        },
        fakeCp
      )
    ).rejects.toThrow(/CastLabs VMP signing failed/i)
  })

  it('failure path: command error (missing command) makes the hook THROW so build fails', async () => {
    mockSpawnSync.mockReturnValue({
      status: null,
      error: new Error('ENOENT: command not found')
    })

    await expect(
      afterPack(
        {
          electronPlatformName: 'win32',
          appOutDir: 'C:\\dist\\win-unpacked'
        },
        fakeCp
      )
    ).rejects.toThrow(/CastLabs VMP signing failed/i)
  })

  it('dev override: SKIP_VMP_SIGN=true skips throwing on failure with a warning', async () => {
    process.env.SKIP_VMP_SIGN = 'true'
    mockSpawnSync.mockReturnValue({
      status: 1
    })

    await expect(
      afterPack(
        {
          electronPlatformName: 'win32',
          appOutDir: 'C:\\dist\\win-unpacked'
        },
        fakeCp
      )
    ).resolves.toBeUndefined()
  })
})
