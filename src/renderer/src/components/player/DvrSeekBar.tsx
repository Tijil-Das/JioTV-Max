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
 * Progress bar mapped to DVR window.
 *
 * Theme red timeline bar.
 * When at live edge or <= 20s behind: clean LiveBadge (no second counters).
 * When > 20s behind: subtle behind counter + "Go Live" affordance.
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

  // Only consider delayed if more than 20s behind live
  const isDelayed = isLive && behind > 20

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
          isDelayed ? `${formatBehindLive(behind)} behind live` : 'Live edge'
        }
        className={cn(
          'dvr-range h-[4px] min-w-0 flex-1 cursor-pointer appearance-none rounded-pill transition-all',
          disabled && 'cursor-default opacity-50'
        )}
        style={{
          background: disabled
            ? 'rgba(255,255,255,0.12)'
            : `linear-gradient(to right, #E11D2E 0%, #E11D2E ${progress}%, rgba(255,255,255,0.18) ${progress}%, rgba(255,255,255,0.18) 100%)`
        }}
      />

      {isLive ? (
        !isDelayed ? (
          <LiveBadge />
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            <span
              className="rounded-md border border-white/10 bg-white/[0.08] px-2 py-0.5 font-mono text-[11.5px] font-medium tabular-nums text-white/80"
              title={`${formatBehindLive(behind)} behind live`}
            >
              -{formatBehindLive(behind)}
            </span>
            <button
              type="button"
              onClick={handleGoLive}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[#E11D2E]/40 bg-[#E11D2E]/15 px-2.5 text-[11.5px] font-semibold text-white tracking-wide transition-all hover:bg-[#E11D2E]/25 hover:border-[#E11D2E]/60 active:scale-95 shadow-[0_0_12px_rgba(225,29,46,0.2)]"
            >
              <Radio className="h-3 w-3 text-[#E11D2E]" />
              Go Live
            </button>
          </div>
        )
      ) : null}
    </div>
  )
}
