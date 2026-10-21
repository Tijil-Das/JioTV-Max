import { useId } from 'react'
import { cn } from '@/lib/cn'

/**
 * The StreamDeck mark: three stacked screens with a play cut-out.
 * Pure SVG so it stays crisp in the title bar, splash and about panel.
 */
export function BrandMark({ className, size = 24 }: { className?: string; size?: number }): JSX.Element {
  const gradientId = useId().replace(/[:]/g, '')
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9D85FF" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect x="3" y="4" width="26" height="7" rx="3.5" fill={`url(#${gradientId})`} opacity="0.45" />
      <rect x="3" y="12" width="26" height="7" rx="3.5" fill={`url(#${gradientId})`} opacity="0.75" />
      <rect x="3" y="20" width="26" height="8" rx="4" fill={`url(#${gradientId})`} />
      <path d="M14.2 22.4v3.2l3-1.6-3-1.6Z" fill="#050507" />
    </svg>
  )
}

export function BrandWordmark({ className }: { className?: string }): JSX.Element {
  return (
    <span className={cn('font-display text-[13px] font-semibold tracking-tight text-text-primary', className)}>
      StreamDeck <span className="accent-text">TV</span>
    </span>
  )
}
