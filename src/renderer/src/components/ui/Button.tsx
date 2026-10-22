import { forwardRef } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'glass' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const variants: Record<ButtonVariant, string> = {
  // Solid red, no gradient, no glow, inner 1px highlight
  primary:
    'bg-[#E11D2E] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ' +
    'hover:bg-[#EF3340] active:bg-[#B8121F] disabled:shadow-none ' +
    'transition-colors duration-[120ms]',
  // Neutral fill, hairline border
  secondary:
    'bg-white/[0.08] text-[#F4F4F5] border border-white/[0.07] ' +
    'hover:bg-white/[0.12] hover:border-white/[0.14]',
  // No fill at rest, subtle hover
  ghost:
    'text-[#A1A1A6] hover:text-[#F4F4F5] hover:bg-white/[0.08]',
  // Glass — for overlays only
  glass:
    'bg-[rgba(10,10,11,0.72)] backdrop-blur-[28px] text-[#F4F4F5] ' +
    'border border-white/[0.07] hover:border-white/[0.14] hover:bg-white/[0.08]',
  danger:
    'bg-[#F87171]/10 text-[#F87171] border border-[#F87171]/20 ' +
    'hover:bg-[#F87171]/20'
}

const sizes: Record<ButtonSize, string> = {
  sm:   'h-8 px-3 text-[12px] font-[500] gap-1.5 rounded-[8px]',
  md:   'h-10 px-4 text-[13px] font-[550] gap-2 rounded-[8px]',
  lg:   'h-11 px-5 text-[14px] font-[600] gap-2.5 rounded-[8px]',
  icon: 'h-10 w-10 rounded-[8px] justify-center'
}

export function buttonClass(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
  className?: string
): string {
  return cn(
    'no-drag inline-flex select-none items-center justify-center whitespace-nowrap',
    'transition-colors duration-[120ms] disabled:pointer-events-none disabled:opacity-40',
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
  const dimensions = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-11 w-11' : 'h-10 w-10'
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
