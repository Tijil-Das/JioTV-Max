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

  const [mode, setLocalMode] = useState<AuthMode>(settingsMode)
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
      setLocalMode(settingsMode)
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
  const title = step === 'otp' ? 'Enter your code' : 'Sign in to StreamDeck'

  return (
    <Modal open={open} onClose={closeLogin} bare className="w-[900px] max-w-[94vw]" labelledBy="login-title">
      <div className="glass-strong grid grid-cols-1 overflow-hidden rounded-panel lg:grid-cols-[0.9fr_1.1fr]">
        {/* Brand / trust panel */}
        <div className="relative hidden flex-col justify-between overflow-hidden border-r border-white/[0.06] p-7 lg:flex">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(120% 100% at 10% 0%, rgba(124,92,255,.3) 0%, transparent 58%), radial-gradient(90% 80% at 100% 100%, rgba(34,211,238,.16) 0%, transparent 60%), linear-gradient(160deg, #12121c, #08080d)'
            }}
          />
          <div className="relative">
            <div className="flex items-center gap-2.5">
              <BrandMark size={26} />
              <span className="font-display text-[15px] font-semibold text-white">StreamDeck TV</span>
            </div>
            <h3 className="mt-8 font-display text-[26px] font-bold leading-tight text-white">
              Live television,
              <br />
              beautifully staged.
            </h3>
            <p className="mt-3 max-w-[280px] text-[13px] leading-relaxed text-text-secondary">
              Sign in with your JioTV number to unlock the full channel catalogue, guide and
              Widevine-protected streams.
            </p>
          </div>
          <ul className="relative mt-10 space-y-4">
            {[
              { icon: <Tv className="h-4 w-4" />, text: 'Hundreds of live channels and a real EPG' },
              { icon: <ShieldCheck className="h-4 w-4" />, text: 'Tokens encrypted with your OS keystore' },
              { icon: <Sparkles className="h-4 w-4" />, text: 'Adaptive quality up to 1080p and beyond' }
            ].map((item) => (
              <li key={item.text} className="flex items-start gap-3 text-[12.5px] text-text-secondary">
                <span className="mt-[1px] flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-accent-glow">
                  {item.icon}
                </span>
                {item.text}
              </li>
            ))}
          </ul>
          <p className="relative flex items-center gap-2 text-[11px] text-text-muted">
            <Lock className="h-3 w-3" />
            OTPs and tokens are never written to logs.
          </p>
        </div>

        {/* Form panel */}
        <div className="relative p-7 sm:p-9">
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
                  className="flex h-20 w-20 items-center justify-center rounded-full border border-success/30 bg-success/15 text-success"
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
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-alt">
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
                        { value: 'demo', label: 'Demo access' },
                        { value: 'jio', label: 'JioTV account' }
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
                          'mt-2 flex h-12 items-center gap-2 rounded-xl border bg-black/25 px-3 transition-colors',
                          error ? 'border-danger/50' : 'border-white/10 focus-within:border-accent/50'
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
                          className="h-full flex-1 bg-transparent text-[15px] tracking-wide text-white outline-none placeholder:text-text-muted"
                        />
                        {mode === 'demo' ? (
                          <button
                            type="button"
                            onClick={() => setPhone(DEMO_PHONE)}
                            className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-text-secondary transition-colors hover:border-white/25 hover:text-white"
                          >
                            Use demo
                          </button>
                        ) : null}
                      </div>
                      <p className="mt-2 text-[11px] text-text-muted">
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
                              ? 'border-danger/50'
                              : digit
                                ? 'border-accent/50 shadow-[0_0_0_1px_rgba(124,92,255,.25)]'
                                : 'border-white/10 focus:border-accent/50'
                          )}
                        />
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[12px]">
                      <span className="text-text-muted">
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
                          secondsLeft > 0 ? 'cursor-not-allowed text-text-muted' : 'text-accent-alt hover:text-white'
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
                      className="mt-4 flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/[0.08] px-3 py-2.5 text-[12px] text-danger"
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

                <p className="mt-5 text-center text-[11px] leading-relaxed text-text-muted">
                  By continuing you agree to keep this sign-in on trusted devices only. StreamDeck
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
