import { memo } from 'react'

export interface SkipIconProps extends React.SVGProps<SVGSVGElement> {
  /** Direction of the seek arrow: 'forward' (clockwise) or 'backward' (counter-clockwise). */
  direction: 'forward' | 'backward'
  /** Seconds value to display in the center (default: 5). */
  seconds?: number
  /** CSS class names for styling or sizing. */
  className?: string
}

/**
 * Custom inline SVG skip / seek icon matching the reference design:
 * - Bold, rounded-stroke circle (strokeWidth 2)
 * - Upper-right gap with directional arrowhead
 * - Centered numeral (stroked path for 5, bold rounded text for multi-digit/custom values)
 * - Mirrored arc for backward with intact, unmirrored center digit
 */
export const SkipIcon = memo(function SkipIcon({
  direction,
  seconds = 5,
  className,
  ...props
}: SkipIconProps): JSX.Element {
  const isBackward = direction === 'backward'

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Ring and Arrowhead: mirrored horizontally for backward rewind */}
      <g transform={isBackward ? 'translate(24 0) scale(-1 1)' : undefined}>
        {/* Circular arc with upper-right gap */}
        <path d="M20.2 14.7 A8.5 8.5 0 1 1 17.46 5.99" />
        {/* Open directional arrowhead at the end of the arc */}
        <path d="M14.9 6.3 L17.9 6.3 L17.4 3.35" />
      </g>

      {/* Centered digit: kept upright and un-mirrored for both forward and backward */}
      {seconds === 5 ? (
        <g transform="translate(0.35, 0)">
          <path d="M14.2 9.6 H10.2 L9.8 12.4 C10.3 12.1 10.8 12 11.4 12 C12.9 12 13.9 12.9 13.9 14.3 C13.9 15.8 12.8 16.7 11.3 16.7 C10.2 16.7 9.3 16.3 8.7 15.5" />
        </g>
      ) : (
        <text
          x="12"
          y="15.1"
          textAnchor="middle"
          fontSize={seconds >= 10 ? '7.2' : '8'}
          fontWeight="800"
          fill="currentColor"
          stroke="none"
          fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          letterSpacing="-0.3px"
        >
          {seconds}
        </text>
      )}
    </svg>
  )
})
