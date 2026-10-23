import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react'
import { cn } from '@/lib/cn'
import { SkipIcon } from './SkipIcon'

/** Constants controlling animation timing, angles, and sizing. */
export const SKIP_ICON_SIZE_PX = 34
export const SKIP_BUTTON_SIZE_PX = 46
export const SKIP_ANIMATION_ROTATION_DEG = 55
export const SKIP_ANIMATION_OVERSHOOT_DEG = 5
export const SKIP_ANIMATION_DURATION_MS = 920
export const SKIP_ANIMATION_EASING = 'cubic-bezier(0.25, 0.9, 0.35, 1)'

export interface SkipButtonProps {
  /** 'forward' (clockwise) or 'backward' (counter-clockwise). */
  direction: 'forward' | 'backward'
  /** Number of seconds to seek. Defaults to 5. */
  seconds?: number
  /** Callback fired on click. */
  onSkip: () => void
  /** Optional additional class names. */
  className?: string
  /** Whether the button is disabled. */
  disabled?: boolean
  /** Scale factor between threshold and full size (default: 1). */
  scale?: number
  /** Optional inline styles. */
  style?: React.CSSProperties
}

export interface SkipButtonHandle {
  /** Programmatically triggers the wind-up and spring rotation micro-animation. */
  triggerAnimation: () => void
}

/**
 * Premium skip control button with Web Animations API spring rotation.
 * - Refined, compact hit area with transparent / subtle hover background
 * - Scaled, crisp visible icon using currentColor
 * - Reliable, re-triggerable rotation animation on rapid consecutive clicks
 * - Imperative trigger handle for keyboard shortcut integration
 * - Accessible with visible focus ring and prefers-reduced-motion support
 */
export const SkipButton = forwardRef<SkipButtonHandle, SkipButtonProps>(function SkipButton(
  { direction, seconds = 5, onSkip, className, disabled = false, scale = 1, style },
  ref
): JSX.Element {
  const iconWrapperRef = useRef<HTMLSpanElement>(null)
  const activeAnimationRef = useRef<Animation | null>(null)
  const isForward = direction === 'forward'

  const triggerAnimation = useCallback(() => {
    const el = iconWrapperRef.current
    if (!el) return

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Cancel any in-flight animation so repeated rapid clicks immediately restart from rest
    if (activeAnimationRef.current) {
      activeAnimationRef.current.cancel()
      activeAnimationRef.current = null
    }

    if (prefersReduced) {
      activeAnimationRef.current = el.animate(
        [
          { opacity: 1 },
          { opacity: 0.3 },
          { opacity: 1 }
        ],
        { duration: 250, easing: 'ease-out' }
      )
    } else {
      const keyframes = isForward
        ? [
            { transform: 'rotate(0deg)' },
            { transform: `rotate(${SKIP_ANIMATION_ROTATION_DEG}deg)`, offset: 0.46 },
            { transform: `rotate(-${SKIP_ANIMATION_OVERSHOOT_DEG}deg)`, offset: 0.8 },
            { transform: 'rotate(0deg)' }
          ]
        : [
            { transform: 'rotate(0deg)' },
            { transform: `rotate(-${SKIP_ANIMATION_ROTATION_DEG}deg)`, offset: 0.46 },
            { transform: `rotate(${SKIP_ANIMATION_OVERSHOOT_DEG}deg)`, offset: 0.8 },
            { transform: 'rotate(0deg)' }
          ]

      activeAnimationRef.current = el.animate(keyframes, {
        duration: SKIP_ANIMATION_DURATION_MS,
        easing: SKIP_ANIMATION_EASING
      })
    }
  }, [isForward])

  // Expose animation trigger imperatively so keyboard shortcuts can trigger it
  useImperativeHandle(
    ref,
    () => ({
      triggerAnimation
    }),
    [triggerAnimation]
  )

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation()
      if (disabled) return
      triggerAnimation()
      onSkip()
    },
    [disabled, onSkip, triggerAnimation]
  )

  const label = isForward ? `Skip forward ${seconds} seconds` : `Rewind ${seconds} seconds`
  const tooltip = isForward ? `Forward ${seconds}s (L / →)` : `Rewind ${seconds}s (J / ←)`

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={label}
      title={tooltip}
      className={cn(
        // Compact, balanced hit area
        'relative z-10 flex cursor-pointer items-center justify-center rounded-full',
        // Transparent subtle background with soft hover/active states
        'bg-transparent text-white/85 hover:bg-white/[0.08] hover:text-white',
        'active:scale-[0.92] active:bg-white/[0.14] transition-all duration-150',
        'disabled:pointer-events-none disabled:opacity-30',
        // Accessible focus styling
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
        className
      )}
      style={{
        width: Math.round(46 * scale),
        height: Math.round(46 * scale),
        ...style
      }}
    >
      {/* Transform wrapper with inline-block / inline-flex and origin-center for Web Animations API */}
      <span
        ref={iconWrapperRef}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          transformOrigin: 'center center'
        }}
        className="pointer-events-none select-none text-current"
      >
        <SkipIcon
          direction={direction}
          seconds={seconds}
          className="text-current drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
          style={{
            width: Math.round(34 * scale),
            height: Math.round(34 * scale)
          }}
        />
      </span>
    </button>
  )
})
