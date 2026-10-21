import { cn } from '@/lib/cn'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
  id?: string
}

/** Accessible switch built from a real button, styled for the glass surface. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
  id
}: ToggleProps): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <p id={id ? `${id}-label` : undefined} className="text-[13px] font-medium text-text-primary">
          {label}
        </p>
        {description ? (
          <p className="mt-1 text-[12px] leading-relaxed text-text-muted">{description}</p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-labelledby={id ? `${id}-label` : undefined}
        aria-label={id ? undefined : label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-pill border transition-colors duration-200',
          checked ? 'border-accent/60 bg-accent/80' : 'border-white/10 bg-white/[0.06]',
          disabled && 'cursor-not-allowed opacity-40'
        )}
      >
        <span
          className={cn(
            'absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow transition-all duration-200 ease-premium',
            checked ? 'left-[22px]' : 'left-[3px]'
          )}
        />
      </button>
    </div>
  )
}

interface SegmentedControlProps<T extends string> {
  options: Array<{ value: T; label: string; icon?: React.ReactNode }>
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className
}: SegmentedControlProps<T>): JSX.Element {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex rounded-xl border border-white/10 bg-black/30 p-1', className)}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors duration-200',
              active ? 'text-white' : 'text-text-muted hover:text-text-secondary'
            )}
          >
            {active ? (
              <span className="absolute inset-0 rounded-lg bg-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,.12)]" />
            ) : null}
            <span className="relative flex items-center gap-1.5">
              {option.icon}
              {option.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
