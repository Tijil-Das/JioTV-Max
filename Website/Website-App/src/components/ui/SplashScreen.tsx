import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import appIcon from '@/assets/icons/app-icon-256.png'
import { APP_TAGLINE } from '@/lib/constants'
import { cn } from '@/lib/cn'

interface SplashScreenProps {
  visible: boolean
}

/**
 * Full-window loading splash shown while the app bootstraps —
 * session restore + relay init + first catalogue fetch.
 * Scales down dynamically in miniplayer mode to remain compact and centered.
 */
export function SplashScreen({ visible }: SplashScreenProps): JSX.Element {
  const location = useLocation()
  const [isSmall, setIsSmall] = useState(
    () => typeof window !== 'undefined' && window.innerHeight < 340
  )

  useEffect(() => {
    const checkSize = () => setIsSmall(window.innerHeight < 340)
    window.addEventListener('resize', checkSize)
    return () => window.removeEventListener('resize', checkSize)
  }, [])

  const isMini =
    new URLSearchParams(location.search).get('mini') === 'true' ||
    (typeof window !== 'undefined' &&
      (window.location.hash.includes('mini=true') ||
        new URLSearchParams(window.location.search).get('mini') === 'true')) ||
    isSmall

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5, ease: 'easeOut' } }}
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#000000] p-3 text-center select-none"
          aria-label="Loading JioTv Max"
          aria-busy="true"
        >
          {/* Brand mark */}
          <motion.div
            initial={{ opacity: 0, scale: 0.88, y: isMini ? 6 : 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'flex flex-col items-center justify-center',
              isMini ? 'gap-2 max-w-[280px]' : 'gap-5'
            )}
          >
            {/* Rounded App Icon */}
            <div
              className={cn(
                'relative flex items-center justify-center',
                isMini ? 'h-11 w-11' : 'h-24 w-24'
              )}
            >
              <img
                src={appIcon}
                alt="JioTv Max logo"
                className={cn('object-contain', isMini ? 'h-11 w-11' : 'h-24 w-24')}
              />
            </div>

            <div className="text-center">
              <p
                className={cn(
                  'font-sans font-[700] tracking-[-0.02em] text-[#F4F4F5]',
                  isMini ? 'text-[14px] leading-tight' : 'text-[24px]'
                )}
              >
                JioTv <span className="text-[#E11D2E]">Max</span>
              </p>
              <p
                className={cn(
                  'text-[#A1A1A6]',
                  isMini ? 'mt-0.5 text-[10px] leading-tight' : 'mt-1 text-[13px]'
                )}
              >
                {APP_TAGLINE}
              </p>
            </div>

            {/* Progress bar — same red as the icon colour theme */}
            <motion.div
              className={cn(
                'overflow-hidden rounded-full bg-white/[0.08]',
                isMini ? 'mt-1.5 h-[2px] w-[90px]' : 'mt-3 h-[3px] w-[180px]'
              )}
            >
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-[#B8121F] via-[#E11D2E] to-[#EF3340]"
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
