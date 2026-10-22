import { useState } from 'react'
import { Radio } from 'lucide-react'
import type { MediaSeekRange } from '@/hooks/useMediaPlayer'
import { cn } from '@/lib/cn'
import { formatBehindLive } from '@/lib/time'
import { LiveBadge } from '@/components/ui/LiveBadge'

interface DvrSeekBarProps {
  seekRange: MediaSeekRange | null
  currentTime: number
  behindLive: number
  atLiveEdge: boolean
  isLive: boolean
  onSeek: (time: number) => void
  onGoLive: () => void
}

/**
 * Progress bar mapped to Shaka's DVR window (or the HLS seekable range).
 *
 * The left edge is `seekRange.start`, the right edge is the live edge. The
 * badge turns into a grey "-MM:SS" countdown when the viewer rewinds, and a
 * "Go Live" affordance appears beside it.
 */
export function DvrSeekBar({
  seekRange,
  currentTime,
  behindLive,
  atLiveEdge,
  isLive,
  onSeek,
  onGoLive
}: DvrSeekBarProps): JSX.Element {
  const [dragging, setDragging] = useState(false)
  const [dragValue, setDragValue] = useState(0)

  const start = seekRange?.start ?? 0
  const end = seekRange?.end ?? 0
  const duration = Math.max(0, end - start)
  const selectableEnd = Math.max(start, end - 0.1)
  const disabled = !seekRange || duration <= 1 || !Number.isFinite(duration)

  const rawValue = dragging ? dragValue : currentTime
  const value = disabled ? start : Math.min(selectableEnd, Math.max(start, rawValue))
  const progress = duration > 0 ? Math.min(100, Math.max(0, ((value - start) / duration) * 100)) : 0
  const behind = Math.max(0, behindLive)
  const showGoLive = isLive && !atLiveEdge && behind >= 3

  const seek = (next: number): void => {
    setDragValue(next)
    onSeek(next)
  }

  const handleGoLive = (): void => {
    setDragging(false)
    onGoLive()
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <input
        type="range"
        min={start}
        max={selectableEnd}
        step={0.1}
        value={value}
        disabled={disabled}
        onChange={(event) => seek(Number(event.target.value))}
        onPointerDown={(event) => {
          if (disabled) return
          setDragging(true)
          setDragValue(value)
          event.currentTarget.setPointerCapture?.(event.pointerId)
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onBlur={() => setDragging(false)}
        aria-label="Seek within the live broadcast"
        aria-valuetext={
          isLive && !atLiveEdge ? `${formatBehindLive(behind)} behind live` : 'Live edge'
        }
        className={cn(
          'dvr-range h-[5px] min-w-0 flex-1 cursor-pointer appearance-none rounded-pill',
          disabled && 'cursor-default opacity-50'
        )}
        style={{
          background: disabled
            ? 'rgba(255,255,255,0.12)'
            : `linear-gradient(to right, #7C5CFF 0%, #22D3EE ${progress}%, rgba(255,255,255,0.14) ${progress}%, rgba(255,255,255,0.14) 100%)`
        }}
      />

      {isLive ? (
        atLiveEdge ? (
          <LiveBadge />
        ) : (
          <span
            className="shrink-0 rounded-pill bg-white/15 px-2.5 py-1 text-[12px] font-semibold tabular-nums tracking-[0.08em] text-white/75 backdrop-blur-md"
            title={`${formatBehindLive(behind)} behind live`}
          >
            {formatBehindLive(behind)}
          </span>
        )
      ) : null}

      {showGoLive ? (
        <button
          type="button"
          onClick={handleGoLive}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-pill border border-white/15 bg-white/10 px-2.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/90 backdrop-blur-md transition-colors hover:border-white/25 hover:bg-white/20"
        >
          <Radio className="h-3 w-3 text-live" />
          Go Live
        </button>
      ) : null}
    </div>
  )
}
