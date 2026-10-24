import { memo } from 'react'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface SeekOverlayProps {
  /** True when a seek animation is currently active. */
  active: boolean
  /** Direction of the seek ('forward' or 'backward'). */
  direction: 'forward' | 'backward' | null
  /** Accumulated seek amount in seconds (e.g. 5, 10, 15...). */
  accumulatedSeconds: number
  /** Key/counter that bumps on every tap to retrigger chevron pulses. */
  pulseKey?: number
}

const chevronVariants: Variants = {
  initial: { opacity: 0.25, scale: 0.9 },
  pulse: (custom: number) => ({
    opacity: [0.25, 1, 0.25],
    scale: [0.9, 1.15, 0.9],
    transition: {
      duration: 0.5,
      repeat: Infinity,
      delay: custom * 0.12,
      ease: [0.42, 0, 0.58, 1]
    }
  })
}

/**
 * On-screen YouTube-style seek highlight overlay.
 * Displays translucent arched highlight on the left or right third of the video,
 * animated directional chevrons, and accumulated +/- seconds text.
 */
export const SeekOverlay = memo(function SeekOverlay({
  active,
  direction,
  accumulatedSeconds,
  pulseKey = 0
}: SeekOverlayProps): JSX.Element {
  const prefersReduced = useReducedMotion()
  const isForward = direction === 'forward'

  return (
    <div className="pointer-events-none absolute inset-0 z-30 select-none overflow-hidden">
      <AnimatePresence mode="wait">
        {active && direction ? (
          <motion.div
            key={direction}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={cn(
              'absolute top-0 bottom-0 flex w-[36%] min-w-[160px] max-w-[340px] items-center justify-center',
              isForward
                ? 'right-0 rounded-l-[140px] bg-gradient-to-l from-black/85 via-black/45 to-transparent'
                : 'left-0 rounded-r-[140px] bg-gradient-to-r from-black/85 via-black/45 to-transparent'
            )}
          >
            <motion.div
              key={pulseKey}
              initial={prefersReduced ? false : { scale: 0.88, opacity: 0.6 }}
              animate={prefersReduced ? false : { scale: 1, opacity: 1 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="flex flex-col items-center gap-1.5 px-4 text-white"
            >
              {/* Sequential animated chevrons */}
              <div className="flex items-center gap-0.5">
                {isForward ? (
                  <>
                    <motion.span
                      custom={0}
                      variants={prefersReduced ? undefined : chevronVariants}
                      initial="initial"
                      animate={prefersReduced ? undefined : 'pulse'}
                    >
                      <ChevronRight className="h-6 w-6 stroke-[3] text-white" />
                    </motion.span>
                    <motion.span
                      custom={1}
                      variants={prefersReduced ? undefined : chevronVariants}
                      initial="initial"
                      animate={prefersReduced ? undefined : 'pulse'}
                    >
                      <ChevronRight className="h-6 w-6 stroke-[3] text-white" />
                    </motion.span>
                    <motion.span
                      custom={2}
                      variants={prefersReduced ? undefined : chevronVariants}
                      initial="initial"
                      animate={prefersReduced ? undefined : 'pulse'}
                    >
                      <ChevronRight className="h-6 w-6 stroke-[3] text-white" />
                    </motion.span>
                  </>
                ) : (
                  <>
                    <motion.span
                      custom={2}
                      variants={prefersReduced ? undefined : chevronVariants}
                      initial="initial"
                      animate={prefersReduced ? undefined : 'pulse'}
                    >
                      <ChevronLeft className="h-6 w-6 stroke-[3] text-white" />
                    </motion.span>
                    <motion.span
                      custom={1}
                      variants={prefersReduced ? undefined : chevronVariants}
                      initial="initial"
                      animate={prefersReduced ? undefined : 'pulse'}
                    >
                      <ChevronLeft className="h-6 w-6 stroke-[3] text-white" />
                    </motion.span>
                    <motion.span
                      custom={0}
                      variants={prefersReduced ? undefined : chevronVariants}
                      initial="initial"
                      animate={prefersReduced ? undefined : 'pulse'}
                    >
                      <ChevronLeft className="h-6 w-6 stroke-[3] text-white" />
                    </motion.span>
                  </>
                )}
              </div>

              {/* Accumulated seek text */}
              <span className="font-sans text-[13px] font-bold tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] md:text-[15px]">
                {isForward ? `+${accumulatedSeconds}s` : `-${accumulatedSeconds}s`}
              </span>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
})
