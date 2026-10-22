import { cn } from '@/lib/cn'

/**
 * StreamDeck mark — solid red square with white inner rectangle.
 * No gradients, no blue/purple.
 */
export function BrandMark({ className, size = 24 }: { className?: string; size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      <rect x="3" y="3" width="26" height="26" rx="6" fill="#E11D2E" />
      <rect x="10" y="10" width="12" height="12" rx="2" fill="white" opacity="0.9" />
      <path d="M14 13.5v5l4-2.5-4-2.5Z" fill="#E11D2E" />
    </svg>
  )
}

export function BrandWordmark({ className }: { className?: string }): JSX.Element {
  return (
    <span className={cn('text-[13px] font-[600] tracking-tight text-[#F4F4F5]', className)}>
      StreamDeck <span className="text-[#E11D2E]">TV</span>
    </span>
  )
}
