import type { AuthMode, AuthSession, OtpChallenge } from '@shared/types'
import { DEMO_OTP } from '@/lib/constants'
import { ApiError, delay, getBridge } from './api'

/**
 * Auth facade.
 *
 * Demo mode is fully local (OTP 123456) so the app is useful without a Jio
 * account. Real mode delegates to the Electron main process, where the Jio
 * tokens are kept encrypted and never exposed to the renderer.
 */
const SIMULATE_NETWORK_FAILURES = false

function validatePhone(phone: string): void {
  const digits = phone.replace(/\D/g, '').slice(-10)
  if (!/^[6-9]\d{9}$/.test(digits)) {
    throw new ApiError('Enter a valid 10-digit mobile number.', 'INVALID_PHONE')
  }
}

async function demoFailure(): Promise<void> {
  if (SIMULATE_NETWORK_FAILURES && Math.random() < 0.15) {
    throw new ApiError('Could not reach the authentication service.', 'NETWORK', true)
  }
}

export const authService = {
  async requestOtp(phone: string, mode: AuthMode): Promise<OtpChallenge> {
    validatePhone(phone)
    if (mode === 'demo') {
      await delay(800)
      await demoFailure()
      return {
        sent: true,
        maskedPhone: `+91 ••••• ${phone.replace(/\D/g, '').slice(-5)}`,
        demoCode: DEMO_OTP,
        expiresInSeconds: 30
      }
    }
    const bridge = getBridge()
    if (!bridge) {
      throw new ApiError('Jio sign-in is available in the desktop app only.', 'NO_BRIDGE')
    }
    const result = await bridge.auth.requestOtp(phone)
    if (!result.ok) throw new ApiError(result.error, result.code, result.retryable)
    return result.data
  },

  async verifyOtp(phone: string, code: string, mode: AuthMode): Promise<AuthSession> {
    if (!/^\d{6}$/.test(code)) {
      throw new ApiError('Enter the 6-digit code.', 'INVALID_OTP')
    }
    if (mode === 'demo') {
      await delay(900)
      await demoFailure()
      if (code !== DEMO_OTP) {
        throw new ApiError('Incorrect code. Please try again.', 'OTP_REJECTED')
      }
      const session: AuthSession = {
        user: {
          id: `demo-${phone.replace(/\D/g, '').slice(-10)}`,
          phone: phone.replace(/\D/g, '').slice(-10),
          name: 'Demo Viewer',
          mode: 'demo'
        },
        issuedAt: new Date().toISOString()
      }
      // Demo token is intentionally meaningless; it demonstrates the secure
      // storage path without ever handling a real credential.
      void getBridge()?.secure.saveToken(`demo:${session.user.id}`)
      return session
    }
    const bridge = getBridge()
    if (!bridge) throw new ApiError('Jio sign-in is available in the desktop app only.', 'NO_BRIDGE')
    const result = await bridge.auth.verifyOtp(phone, code)
    if (!result.ok) throw new ApiError(result.error, result.code, result.retryable)
    return result.data
  },

  async restore(mode: AuthMode): Promise<AuthSession | null> {
    if (mode !== 'jio') return null
    const bridge = getBridge()
    if (!bridge) return null
    return bridge.auth.restore()
  },

  async logout(mode: AuthMode): Promise<void> {
    const bridge = getBridge()
    if (mode === 'jio' && bridge) {
      await bridge.auth.logout()
    }
    await bridge?.secure.clearToken()
  }
}
