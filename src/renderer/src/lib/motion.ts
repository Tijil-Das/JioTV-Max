import type { Transition, Variants } from 'framer-motion'

/**
 * Shared motion vocabulary. Keeping springs/easings here makes the whole app
 * feel like one physical system rather than a collection of unrelated screens.
 */
export const springSnappy = { type: 'spring', stiffness: 400, damping: 30 } as const
export const springSoft = { type: 'spring', stiffness: 260, damping: 26 } as const
export const springBouncy = { type: 'spring', stiffness: 300, damping: 18 } as const
export const easePremium = [0.22, 1, 0.36, 1] as const

export const tween = (duration = 0.25): Transition => ({
  duration,
  ease: easePremium
})

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: tween(0.3) },
  exit: { opacity: 0, transition: tween(0.15) }
}

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: tween(0.45) },
  exit: { opacity: 0, y: -8, transition: tween(0.15) }
}

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.94, y: 16 },
  visible: { opacity: 1, scale: 1, y: 0, transition: springSoft },
  exit: { opacity: 0, scale: 0.97, transition: tween(0.12) }
}

export const popover: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 6 },
  visible: { opacity: 1, scale: 1, y: 0, transition: springSoft },
  exit: { opacity: 0, scale: 0.97, transition: tween(0.12) }
}

export const staggerChildren = (stagger = 0.05, delayChildren = 0): Variants => ({
  hidden: {},
  visible: {
    transition: { staggerChildren: stagger, delayChildren }
  }
})

export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: tween(0.35) },
  exit: { opacity: 0, transition: tween(0.15) }
}

export const reducedFade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: tween(0.12) },
  exit: { opacity: 0, transition: tween(0.1) }
}
