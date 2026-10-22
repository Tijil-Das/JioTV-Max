import { AnimatePresence, motion } from 'framer-motion'
import appIcon from '@/assets/icons/app-icon-256.png'

interface SplashScreenProps {
  visible: boolean
}

/**
 * Full-window loading splash shown while the app bootstraps —
 * session restore + relay init + first catalogue fetch.
 * Uses the JioTv Max rounded brand icon and matching purplish loading bar.
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
          aria-label="Loading JioTv Max"
          aria-busy="true"
        >
          {/* Brand mark */}
          <motion.div
            initial={{ opacity: 0, scale: 0.88, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center gap-5"
          >
            {/* Rounded App Icon from Icon-Pack/Rounded */}
            <div className="relative flex h-24 w-24 items-center justify-center">
              <img
                src={appIcon}
                alt="JioTv Max logo"
                className="h-24 w-24 object-contain drop-shadow-[0_8px_32px_rgba(157,12,165,0.45)]"
              />
              {/* Soft breathing pulse ring matching the purplish icon */}
              <motion.div
                className="absolute inset-0 rounded-[28px] ring-2 ring-[#9D0CA5]"
                animate={{ opacity: [0.55, 0, 0.55], scale: [1, 1.12, 1] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>

            <div className="text-center">
              <p className="font-sans text-[24px] font-[700] tracking-[-0.02em] text-[#F4F4F5]">
                JioTv <span className="text-[#B815C2]">Max</span>
              </p>
              <p className="mt-1 text-[13px] text-[#A1A1A6]">Live television, beautifully staged</p>
            </div>

            {/* Progress bar — same purplish as the icon colour theme */}
            <motion.div
              className="mt-3 h-[3px] w-[180px] overflow-hidden rounded-full bg-white/[0.08]"
            >
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-[#860A8D] via-[#9D0CA5] to-[#B815C2]"
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
