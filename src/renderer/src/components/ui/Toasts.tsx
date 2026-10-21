import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { useUIStore, type ToastVariant } from '@/store/useUIStore'
import { cn } from '@/lib/cn'
import { tween } from '@/lib/motion'

const variantStyles: Record<ToastVariant, string> = {
  default: 'border-white/10 bg-bg-elevated/95',
  success: 'border-success/30 bg-[#0c1a15]/95',
  error: 'border-danger/30 bg-[#1c0f11]/95',
  info: 'border-accent-alt/30 bg-[#08161a]/95'
}

const icons: Record<ToastVariant, JSX.Element> = {
  default: <Info className="h-4 w-4 text-accent-alt" />,
  success: <CheckCircle2 className="h-4 w-4 text-success" />,
  error: <AlertTriangle className="h-4 w-4 text-danger" />,
  info: <Info className="h-4 w-4 text-accent-alt" />
}

/** Bottom-right toasts, below the title bar and above everything else. */
export function ToastViewport(): JSX.Element {
  const toasts = useUIStore((state) => state.toasts)
  const dismissToast = useUIStore((state) => state.dismissToast)

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-6 right-6 z-[120] flex w-[340px] flex-col gap-3"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, x: 40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 30, scale: 0.97 }}
            transition={tween(0.28)}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-glass backdrop-blur-xl',
              variantStyles[toast.variant]
            )}
          >
            <span className="mt-[2px]">{icons[toast.variant]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-text-primary">{toast.title}</p>
              {toast.description ? (
                <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">{toast.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismissToast(toast.id)}
              className="rounded-md p-1 text-text-muted transition-colors hover:text-text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
