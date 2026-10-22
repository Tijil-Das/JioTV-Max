import { motion } from 'framer-motion'
import { WifiOff } from 'lucide-react'
import { Button } from './Button'
import { pageTransition } from '@/lib/motion'
import { cn } from '@/lib/cn'

export function PageTransition({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}): JSX.Element {
  return (
    <motion.div
      variants={pageTransition}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={cn('min-h-full', className)}
    >
      {children}
    </motion.div>
  )
}

interface StateViewProps {
  icon?: React.ReactNode
  title: string
  description: React.ReactNode
  actionLabel?: string
  onAction?: () => void
  secondaryLabel?: string
  onSecondary?: () => void
  tone?: 'default' | 'offline' | 'error'
  className?: string
}

export function StateView({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  tone = 'default',
  className
}: StateViewProps): JSX.Element {
  return (
    <div className={cn('flex flex-col items-center justify-center px-8 py-20 text-center', className)}>
      <div
        className={cn(
          'mb-5 flex h-16 w-16 items-center justify-center rounded-[12px] border border-[rgba(255,255,255,0.07)] bg-[#111113]',
          tone === 'error'
            ? 'text-[#F87171]'
            : tone === 'offline'
              ? 'text-[#FBBF24]'
              : 'text-[#A1A1A6]'
        )}
      >
        {icon ?? <WifiOff className="h-7 w-7" />}
      </div>
      <h2 className="font-display text-xl font-semibold text-text-primary">{title}</h2>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-text-secondary">{description}</p>
      {actionLabel && onAction ? (
        <div className="mt-7 flex items-center gap-3">
          <Button variant="primary" size="lg" onClick={onAction}>
            {actionLabel}
          </Button>
          {secondaryLabel && onSecondary ? (
            <Button variant="ghost" size="lg" onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
