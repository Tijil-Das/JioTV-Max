import { forwardRef } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'glass' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-accent-gradient text-white shadow-glow hover:brightness-110 active:brightness-95 disabled:shadow-none',
  secondary:
    'bg-white/[0.06] text-text-primary border border-white/10 hover:bg-white/[0.1] hover:border-white/20',
  ghost: 'text-text-secondary hover:text-text-primary hover:bg-white/[0.06]',
  glass: 'glass text-text-primary hover:border-white/20 hover:bg-white/[0.08]',
  danger: 'bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25'
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[12px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-[13px] gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[14px] gap-2.5 rounded-xl',
  icon: 'h-10 w-10 rounded-xl justify-center'
}

export function buttonClass(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
  className?: string
): string {
  return cn(
    'no-drag inline-flex select-none items-center justify-center whitespace-nowrap font-medium',
    'transition-all duration-200 ease-premium disabled:pointer-events-none disabled:opacity-40',
    variants[variant],
    sizes[size],
    className
  )
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: React.ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, icon, className, children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={buttonClass(variant, size, className)}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
})

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  label: string
  size?: 'sm' | 'md' | 'lg'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', label, size = 'md', className, children, ...rest },
  ref
) {
  const dimensions = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-12 w-12' : 'h-10 w-10'
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={buttonClass(variant, 'icon', cn(dimensions, className))}
      {...rest}
    >
      {children}
    </button>
  )
})
