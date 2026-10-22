import { AnimatePresence, motion } from 'framer-motion'

interface SplashScreenProps {
  visible: boolean
}

/**
 * Full-window loading splash shown while the app bootstraps —
 * session restore + relay init + first catalogue fetch.
 * Unmounts completely once `visible` becomes false.
 */
export function SplashScreen({ visible }: SplashScreenProps): JSX.Element {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5, ease: 'easeOut' } }}
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#000000]"
          aria-label="Loading StreamDeck TV"
          aria-busy="true"
        >
          {/* Brand mark */}
          <motion.div
            initial={{ opacity: 0, scale: 0.88, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center gap-5"
          >
            {/* Red square logo */}
            <div className="relative flex h-20 w-20 items-center justify-center rounded-[20px] bg-[#E11D2E]">
              {/* TV signal icon made from pure CSS */}
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden>
                <rect x="8" y="20" width="24" height="14" rx="2" fill="white" fillOpacity="0.95" />
                <polyline points="13,20 20,10 27,20" fill="none" stroke="white" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                <line x1="16" y1="34" x2="24" y2="34" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                <line x1="20" y1="34" x2="20" y2="38" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              {/* Breathing ring */}
              <motion.div
                className="absolute inset-0 rounded-[20px] ring-2 ring-[#E11D2E]"
                animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.12, 1] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>

            <div className="text-center">
              <p className="font-sans text-[22px] font-[700] tracking-[-0.02em] text-[#F4F4F5]">
                StreamDeck<span className="text-[#E11D2E]"> TV</span>
              </p>
              <p className="mt-1 text-[13px] text-[#66666C]">Live television, beautifully staged</p>
            </div>

            {/* Progress bar */}
            <motion.div
              className="mt-2 h-[2px] w-[160px] overflow-hidden rounded-full bg-[#18181B]"
            >
              <motion.div
                className="h-full bg-[#E11D2E]"
                initial={{ x: '-100%' }}
                animate={{ x: ['−100%', '0%', '100%'] }}
                transition={{
                  duration: 1.6,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  repeatDelay: 0.1
                }}
                style={{ width: '60%' }}
              />
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
