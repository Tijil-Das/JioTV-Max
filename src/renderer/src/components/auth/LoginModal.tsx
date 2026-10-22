import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Lock,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tv
} from 'lucide-react'
import type { AuthMode, OtpChallenge } from '@shared/types'
import { cn } from '@/lib/cn'
import { DEMO_PHONE } from '@/lib/constants'
import { springBouncy, springSoft, tween, scaleIn } from '@/lib/motion'
import { authService } from '@/services/authService'
import { useAuthStore } from '@/store/useAuthStore'
import { useChannelStore } from '@/store/useChannelStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useUIStore } from '@/store/useUIStore'
import { Modal } from '@/components/ui/Modal'
import { Button, IconButton } from '@/components/ui/Button'
import { SegmentedControl } from '@/components/ui/Controls'
import { BrandMark } from '@/components/ui/BrandMark'

type Step = 'phone' | 'otp' | 'success'

const OTP_LENGTH = 6
const RESEND_SECONDS = 30

const phoneIsValid = (value: string) => /^[6-9]\d{9}$/.test(value)

/** Accept pasted numbers with +91 or a leading 0 without truncating them. */
const sanitizePhone = (raw: string) => {
  let digits = raw.replace(/\D/g, '')
  if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2)
  else if (digits.length > 10 && digits.startsWith('0')) digits = digits.slice(1)
  return digits.slice(0, 10)
}

/**
 * Two-step JioTV sign-in: phone → OTP.
 *
 * Demo mode is fully local (code 123456) and exists so the app is useful with
 * no Jio account. Real mode calls the Electron main process; tokens never
 * touch this component or localStorage.
 */
export function LoginModal(): JSX.Element | null {
  const open = useUIStore((state) => state.loginOpen)
  const reason = useUIStore((state) => state.loginReason)
  const closeLogin = useUIStore((state) => state.closeLogin)
  const pushToast = useUIStore((state) => state.pushToast)
  const settingsMode = useSettingsStore((state) => state.mode)
  const setMode = useSettingsStore((state) => state.setMode)
  const setSession = useAuthStore((state) => state.setSession)
  const setAuthenticating = useAuthStore((state) => state.setAuthenticating)
  const fetchCatalogue = useChannelStore((state) => state.fetchCatalogue)

  const [mode, setLocalMode] = useState<AuthMode>('jio')
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shakeToken, setShakeToken] = useState(0)
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS)
  const inputsRef = useRef<Array<HTMLInputElement | null>>([])
  const phoneRef = useRef<HTMLInputElement>(null)

  const code = digits.join('')

  const reset = useCallback(() => {
    setStep('phone')
    setPhone('')
    setDigits(Array(OTP_LENGTH).fill(''))
    setChallenge(null)
    setError(null)
    setSending(false)
    setVerifying(false)
    setSecondsLeft(RESEND_SECONDS)
  }, [])

  useEffect(() => {
    if (open) {
      setLocalMode(settingsMode === 'demo' ? 'demo' : 'jio')
      reset()
    }
  }, [open, reset, settingsMode])

  useEffect(() => {
    if (step !== 'otp') return
    const timer = setInterval(() => {
      setSecondsLeft((value) => (value <= 1 ? 0 : value - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [step])

  const fail = (message: string) => {
    setError(message)
    setShakeToken((token) => token + 1)
  }

  const requestOtp = async () => {
    setError(null)
    if (!phoneIsValid(phone)) {
      fail('Enter a valid 10-digit Indian mobile number.')
      return
    }
    setSending(true)
    try {
      const result = await authService.requestOtp(phone, mode)
      setChallenge(result)
      setStep('otp')
      setSecondsLeft(result.expiresInSeconds ?? RESEND_SECONDS)
      setDigits(Array(OTP_LENGTH).fill(''))
      setTimeout(() => inputsRef.current[0]?.focus(), 120)
      if (mode === 'demo' && result.demoCode) {
        pushToast({
          title: 'Demo code ready',
          description: `Use ${result.demoCode} to finish signing in.`,
          variant: 'info'
        })
      }
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : 'Could not send the code.')
    } finally {
      setSending(false)
    }
  }

  const verify = async (value = code) => {
    setError(null)
    if (value.length !== OTP_LENGTH) {
      fail('Enter all six digits of the code.')
      return
    }
    setVerifying(true)
    setAuthenticating()
    try {
      const session = await authService.verifyOtp(phone, value, mode)
      setSession(session)
      if (mode === 'jio') {
        setMode('jio')
        void fetchCatalogue('jio', true)
      }
      setStep('success')
      setTimeout(() => {
        closeLogin()
        pushToast({
          title: session.user.mode === 'demo' ? 'Demo access granted' : 'Signed in to JioTV',
          description:
            session.user.mode === 'demo'
              ? 'The full demo catalogue is ready to watch.'
              : 'Your channels and DRM licences are linked to this device.',
          variant: 'success'
        })
      }, 1250)
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : 'That code did not work.')
      setDigits(Array(OTP_LENGTH).fill(''))
      setTimeout(() => inputsRef.current[0]?.focus(), 80)
    } finally {
      setVerifying(false)
    }
  }

  const onDigitChange = (index: number, raw: string) => {
    const value = raw.replace(/\D/g, '')
    if (!value) {
      setDigits((current) => current.map((digit, itemIndex) => (itemIndex === index ? '' : digit)))
      return
    }
    // Paste or fast typing: distribute across the boxes.
    if (value.length > 1) {
      const next = [...digits]
      for (let offset = 0; offset < value.length && index + offset < OTP_LENGTH; offset += 1) {
        next[index + offset] = value[offset]
      }
      setDigits(next)
      const target = Math.min(index + value.length, OTP_LENGTH - 1)
      inputsRef.current[target]?.focus()
      const combined = next.join('')
      if (combined.length === OTP_LENGTH) void verify(combined)
      return
    }
    setDigits((current) => current.map((digit, itemIndex) => (itemIndex === index ? value : digit)))
    if (index < OTP_LENGTH - 1) inputsRef.current[index + 1]?.focus()
    const combined = digits.map((digit, itemIndex) => (itemIndex === index ? value : digit)).join('')
    if (combined.length === OTP_LENGTH) void verify(combined)
  }

  const onDigitKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault()
      setDigits((current) => current.map((digit, itemIndex) => (itemIndex === index - 1 ? '' : digit)))
      inputsRef.current[index - 1]?.focus()
    } else if (event.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus()
    } else if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus()
    }
  }

  const masked = challenge?.maskedPhone ?? `+91 ••••• ${phone.slice(-5)}`
  const title = step === 'otp' ? 'Enter your code' : 'Sign in to JioTv Max'

  return (
    <Modal open={open} onClose={closeLogin} bare className="w-[420px] max-w-[94vw]" labelledBy="login-title">
      <div className="overflow-hidden rounded-[16px] border border-[rgba(255,255,255,0.07)] bg-[#0A0A0B]">
        {/* Brand mark at top of single-column form */}

        {/* Form panel */}
        <div className="relative p-7">
          <IconButton
            label="Close sign-in"
            size="sm"
            className="absolute right-3 top-3"
            onClick={closeLogin}
          >
            <span className="text-lg leading-none">×</span>
          </IconButton>

          <AnimatePresence mode="wait">
            {step === 'success' ? (
              <motion.div
                key="success"
                variants={scaleIn}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="flex min-h-[360px] flex-col items-center justify-center text-center"
              >
                <motion.span
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={springBouncy}
                  className="flex h-16 w-16 items-center justify-center rounded-full border border-[#4ADE80]/30 bg-[#4ADE80]/10 text-[#4ADE80]"
                >
                  <CheckCircle2 className="h-9 w-9" />
                </motion.span>
                <h3 className="mt-6 font-display text-[22px] font-semibold text-white">You’re in</h3>
                <p className="mt-2 max-w-[300px] text-[13px] text-text-secondary">
                  {mode === 'demo'
                    ? 'Demo access is active. Every channel in the demo line-up is ready.'
                    : 'Your JioTV account is linked to this device.'}
                </p>
              </motion.div>
            ) : (
              <motion.div
                key={step}
                initial={{ opacity: 0, x: step === 'otp' ? 24 : -24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: step === 'otp' ? -24 : 24 }}
                transition={tween(0.24)}
              >
                <p className="text-[12px] font-[600] uppercase tracking-[0.12em] text-[#A1A1A6]">
                  {step === 'otp' ? 'Step 2 of 2' : 'Step 1 of 2'}
                </p>
                <h2 id="login-title" className="mt-2 font-display text-[24px] font-bold tracking-tight text-white">
                  {title}
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
                  {step === 'otp' ? (
                    <>
                      We sent a six-digit code to <span className="text-white">{masked}</span>.
                    </>
                  ) : (
                    (reason ?? 'Choose how you want to sign in, then enter your mobile number.')
                  )}
                </p>

                {step === 'phone' ? (
                  <>
                    <SegmentedControl
                      ariaLabel="Sign-in mode"
                      className="mt-6"
                      value={mode}
                      onChange={(value) => {
                        setLocalMode(value)
                        setError(null)
                      }}
                      options={[
                        { value: 'jio', label: 'JioTV account' },
                        { value: 'demo', label: 'Demo access' }
                      ]}
                    />

                    <div
                      key={`phone-${shakeToken}`}
                      className={cn('mt-6', error && 'animate-shake')}
                    >
                      <label htmlFor="login-phone" className="text-[12px] font-medium text-text-secondary">
                        Mobile number
                      </label>
                      <div
                        className={cn(
                          'mt-2 flex h-13 items-center gap-2 rounded-[8px] border bg-[#111113] px-3 transition-colors duration-[120ms]',
                          error ? 'border-[rgba(225,29,46,0.5)]' : 'border-[rgba(255,255,255,0.07)] focus-within:border-[rgba(225,29,46,0.55)]'
                        )}
                      >
                        <span className="flex items-center gap-1.5 border-r border-white/10 pr-3 text-[13px] text-text-secondary">
                          <Smartphone className="h-3.5 w-3.5" /> +91
                        </span>
                        <input
                          ref={phoneRef}
                          id="login-phone"
                          data-autofocus="true"
                          value={phone}
                          onChange={(event) => {
                            setPhone(sanitizePhone(event.target.value))
                            setError(null)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void requestOtp()
                          }}
                          inputMode="tel"
                          autoComplete="tel-national"
                          placeholder="98765 43210"
                          className="h-full flex-1 bg-transparent text-[15px] tracking-wide text-white outline-none placeholder:text-text-secondary"
                        />
                        {mode === 'demo' ? (
                          <button
                            type="button"
                            onClick={() => setPhone(DEMO_PHONE)}
                            className="rounded-[8px] border border-[rgba(255,255,255,0.07)] px-2.5 py-1 text-[12px] text-[#A1A1A6] transition-colors duration-[120ms] hover:border-[rgba(255,255,255,0.14)] hover:text-[#F4F4F5]"
                          >
                            Use demo
                          </button>
                        ) : null}
                      </div>
                      <p className="mt-2 text-[12px] text-text-secondary">
                        {mode === 'demo'
                          ? 'Demo mode accepts any valid Indian number and the code 123456.'
                          : 'JioTV sends a one-time password to this number by SMS.'}
                      </p>
                    </div>
                  </>
                ) : (
                  <div key={`otp-${shakeToken}`} className={cn('mt-6', error && 'animate-shake')}>
                    <div className="flex gap-2.5">
                      {digits.map((digit, index) => (
                        <input
                          key={index}
                          ref={(element) => {
                            inputsRef.current[index] = element
                          }}
                          value={digit}
                          onChange={(event) => onDigitChange(index, event.target.value)}
                          onKeyDown={(event) => onDigitKeyDown(index, event)}
                          onPaste={(event) => {
                            event.preventDefault()
                            onDigitChange(index, event.clipboardData.getData('text'))
                          }}
                          inputMode="numeric"
                          autoComplete={index === 0 ? 'one-time-code' : 'off'}
                          maxLength={1}
                          aria-label={`OTP digit ${index + 1}`}
                          className={cn(
                            'h-14 w-full rounded-xl border bg-black/25 text-center font-display text-[20px] font-semibold text-white outline-none transition-all duration-200',
                            error
                              ? 'border-[rgba(225,29,46,0.5)]'
                                : digit
                                  ? 'border-[rgba(225,29,46,0.4)]'
                                  : 'border-[rgba(255,255,255,0.07)] focus:border-[rgba(225,29,46,0.55)]'
                          )}
                        />
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[12px]">
                      <span className="text-text-secondary">
                        {secondsLeft > 0
                          ? `Resend available in ${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`
                          : 'Didn’t get the code?'}
                      </span>
                      <button
                        type="button"
                        disabled={secondsLeft > 0 || sending}
                        onClick={() => void requestOtp()}
                        className={cn(
                          'font-medium transition-colors',
                          secondsLeft > 0 ? 'cursor-not-allowed text-[#A1A1A6]' : 'text-[#E11D2E] hover:text-[#EF3340]'
                        )}
                      >
                        {sending ? 'Sending…' : 'Resend code'}
                      </button>
                    </div>
                  </div>
                )}

                <AnimatePresence>
                  {error ? (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="mt-4 flex items-start gap-2 rounded-[8px] border-l-2 border-[#E11D2E] bg-[#E11D2E]/[0.08] px-3 py-2.5 text-[12px] text-[#F87171]"
                    >
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      {error}
                    </motion.p>
                  ) : null}
                </AnimatePresence>

                <div className="mt-6 flex items-center gap-3">
                  {step === 'otp' ? (
                    <Button
                      variant="ghost"
                      size="lg"
                      icon={<ArrowLeft className="h-4 w-4" />}
                      onClick={() => {
                        setStep('phone')
                        setError(null)
                      }}
                    >
                      Back
                    </Button>
                  ) : null}
                  {step === 'phone' ? (
                    <Button
                      variant="primary"
                      size="lg"
                      className="flex-1"
                      loading={sending}
                      onClick={() => void requestOtp()}
                    >
                      {mode === 'demo' ? 'Continue with demo' : 'Send code'}
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="lg"
                      className="flex-1"
                      loading={verifying}
                      onClick={() => void verify()}
                    >
                      Verify and watch
                    </Button>
                  )}
                </div>

                <p className="mt-5 text-center text-[12px] leading-relaxed text-text-secondary">
                  By continuing you agree to keep this sign-in on trusted devices only. JioTv Max
                  stores your Jio tokens in the operating system keychain.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Modal>
  )
}
