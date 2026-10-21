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
  description: string
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
          'mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border',
          tone === 'error'
            ? 'border-danger/25 bg-danger/10 text-danger'
            : tone === 'offline'
              ? 'border-warning/25 bg-warning/10 text-warning'
              : 'border-white/10 bg-white/[0.04] text-text-secondary'
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
