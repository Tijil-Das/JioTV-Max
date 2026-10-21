import { useEffect, useState } from 'react'
import { AlertCircle, LockKeyhole } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

interface PinDialogProps {
  open: boolean
  onClose: () => void
  /** Called when the user dismisses the dialog without succeeding. */
  onCancel?: () => void
  title: string
  description: string
  /** Ask for the PIN twice (setting a new one). */
  requireConfirmation?: boolean
  onSubmit: (pin: string) => Promise<string | null>
}

const PIN_LENGTH = 4

/** Four-digit PIN capture for parental controls, with masked inputs. */
export function PinDialog({
  open,
  onClose,
  onCancel,
  title,
  description,
  requireConfirmation = false,
  onSubmit
}: PinDialogProps): JSX.Element {
  const [pin, setPin] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setPin('')
      setConfirmation('')
      setError(null)
      setBusy(false)
    }
  }, [open])

  const submit = async () => {
    if (pin.length !== PIN_LENGTH) {
      setError('Enter a four-digit PIN.')
      return
    }
    if (requireConfirmation && pin !== confirmation) {
      setError('The two PINs do not match.')
      return
    }
    setBusy(true)
    const result = await onSubmit(pin)
    setBusy(false)
    if (result) {
      setError(result)
      return
    }
    onClose()
  }

  const renderInput = (
    value: string,
    onChange: (value: string) => void,
    label: string,
    autoFocus = false
  ) => (
    <div>
      <label className="text-[12px] font-medium text-text-secondary">{label}</label>
      <input
        data-autofocus={autoFocus ? 'true' : undefined}
        value={value}
        onChange={(event) => {
          onChange(event.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))
          setError(null)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void submit()
        }}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        placeholder="••••"
        className={cn(
          'mt-2 h-12 w-full rounded-xl border bg-black/25 px-4 text-center font-display text-[20px] tracking-[0.5em] text-white outline-none transition-colors',
          error ? 'border-danger/50' : 'border-white/10 focus:border-accent/50'
        )}
      />
    </div>
  )

  return (
    <Modal open={open} onClose={onCancel ?? onClose} labelledBy="pin-title" className="w-[380px] p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/25 bg-accent/10 text-accent-glow">
          <LockKeyhole className="h-[18px] w-[18px]" />
        </span>
        <div>
          <h2 id="pin-title" className="font-display text-[16px] font-semibold text-white">
            {title}
          </h2>
          <p className="mt-0.5 text-[11.5px] text-text-muted">{description}</p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {renderInput(pin, setPin, requireConfirmation ? 'New PIN' : 'PIN', true)}
        {requireConfirmation ? renderInput(confirmation, setConfirmation, 'Confirm PIN') : null}
      </div>

      {error ? (
        <p className="mt-3 flex items-center gap-2 text-[12px] text-danger">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel ?? onClose}>
          Cancel
        </Button>
        <Button variant="primary" loading={busy} onClick={() => void submit()}>
          Confirm
        </Button>
      </div>
    </Modal>
  )
}
