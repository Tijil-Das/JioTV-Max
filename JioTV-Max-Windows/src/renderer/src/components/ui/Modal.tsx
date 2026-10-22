import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { springSoft, tween } from '@/lib/motion'
import { IconButton } from './Button'
import { WindowControls } from '@/components/layout/WindowControls'

interface ModalProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  labelledBy?: string
  className?: string
  /** Hide the default glass card chrome when the consumer renders its own. */
  bare?: boolean
}

/**
 * Portal modal with backdrop blur, Escape handling and focus restoration.
 * Framer's presence keeps enter/exit symmetrical.
 */
export function Modal({
  open,
  onClose,
  children,
  labelledBy,
  className,
  bare = false
}: ModalProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    const focusTimer = setTimeout(() => {
      const target =
        document.querySelector<HTMLElement>('[data-autofocus="true"]') ??
        document.querySelector<HTMLElement>('[role="dialog"]')
      target?.focus()
    }, 60)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      clearTimeout(focusTimer)
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          {/* Top-right Windows caption buttons: close, minimize, maximize / restore down */}
          <div className="no-drag absolute right-0 top-0 z-[110] flex h-10 items-center">
            <WindowControls />
          </div>
          <motion.div
          className="absolute inset-0 bg-black/80 backdrop-blur-[4px]"
            variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={tween(0.2)}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            tabIndex={-1}
            variants={{ hidden: { opacity: 0, scale: 0.96, y: 18 }, visible: { opacity: 1, scale: 1, y: 0 } }}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, scale: 0.97, y: 10, transition: tween(0.14) }}
            transition={springSoft}
            className={cn(
              'relative z-10 outline-none',
              !bare && 'glass-strong overflow-hidden rounded-panel',
              className
            )}
          >
            {!bare ? (
              <IconButton
                label="Close"
                size="sm"
                onClick={onClose}
                className="absolute right-3 top-3 z-20"
              >
                <X className="h-4 w-4" />
              </IconButton>
            ) : null}
            {children}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}
