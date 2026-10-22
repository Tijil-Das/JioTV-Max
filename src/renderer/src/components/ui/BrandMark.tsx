import { cn } from '@/lib/cn'
import appIcon from '@/assets/icons/app-icon-128.png'

/**
 * JioTv Max rounded brand mark.
 */
export function BrandMark({
  className,
  size = 24
}: {
  className?: string
  size?: number
}): JSX.Element {
  return (
    <img
      src={appIcon}
      alt="JioTv Max"
      width={size}
      height={size}
      className={cn('shrink-0 rounded-[6px] object-contain', className)}
      style={{ width: size, height: size }}
    />
  )
}

export function BrandWordmark({ className }: { className?: string }): JSX.Element {
  return (
    <span className={cn('text-[14px] font-[700] tracking-tight text-[#F4F4F5]', className)}>
      JioTv <span className="text-[#B815C2]">Max</span>
    </span>
  )
}
