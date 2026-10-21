import { motion } from 'framer-motion'
import { Check, Gauge } from 'lucide-react'
import type { EngineLevel } from '@/hooks/useHlsPlayer'
import { cn } from '@/lib/cn'
import { popover } from '@/lib/motion'

interface QualityMenuProps {
  levels: EngineLevel[]
  activeLevel: number | 'auto'
  activeHeight: number
  onSelect: (level: number | 'auto') => void
  onClose: () => void
}

function formatBitrate(bitrate: number): string {
  if (!bitrate) return 'Live bitrate'
  return `${(bitrate / 1_000_000).toFixed(1)} Mbps`
}

/** Quality popover. Auto is always offered; pinned levels come from the stream. */
export function QualityMenu({
  levels,
  activeLevel,
  activeHeight,
  onSelect,
  onClose
}: QualityMenuProps): JSX.Element {
  return (
    <motion.div
      role="menu"
      aria-label="Playback quality"
      variants={popover}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="glass-strong absolute bottom-[calc(100%+12px)] right-0 z-50 w-[260px] overflow-hidden rounded-2xl p-2"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <Gauge className="h-3.5 w-3.5 text-accent-alt" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          Stream quality
        </span>
      </div>

      <button
        type="button"
        role="menuitemradio"
        aria-checked={activeLevel === 'auto'}
        onClick={() => {
          onSelect('auto')
          onClose()
        }}
        className={cn(
          'flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors',
          activeLevel === 'auto' ? 'bg-white/[0.09]' : 'hover:bg-white/[0.05]'
        )}
      >
        <span>
          <span className="block text-[13px] font-medium text-white">Auto</span>
          <span className="block text-[11px] text-text-muted">Adapt to bandwidth and window size</span>
        </span>
        {activeLevel === 'auto' ? <Check className="h-4 w-4 text-accent-glow" /> : null}
      </button>

      <div className="my-1 h-px bg-white/[0.06]" />

      {levels.length === 0 ? (
        <p className="px-3 py-3 text-[12px] leading-relaxed text-text-muted">
          The stream has not advertised its levels yet. Auto keeps playing while it loads.
        </p>
      ) : (
        <ul className="max-h-[240px] overflow-y-auto">
          {[...levels]
            .sort((a, b) => b.height - a.height)
            .map((level) => {
              const active = activeLevel === level.index
              const isCurrentHeight = activeHeight === level.height
              return (
                <li key={`${level.index}-${level.height}`}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      onSelect(level.index)
                      onClose()
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors',
                      active || isCurrentHeight ? 'bg-white/[0.09]' : 'hover:bg-white/[0.05]'
                    )}
                  >
                    <span>
                      <span className="block text-[13px] font-medium text-white">
                        {level.height > 0 ? `${level.height}p` : level.label}
                      </span>
                      <span className="block text-[11px] text-text-muted">{formatBitrate(level.bitrate)}</span>
                    </span>
                    {active ? <Check className="h-4 w-4 text-accent-glow" /> : null}
                  </button>
                </li>
              )
            })}
        </ul>
      )}

      <p className="px-3 pb-1 pt-2 text-[10.5px] leading-relaxed text-text-muted">
        Pinning a level disables adaptive switching until you choose Auto again.
      </p>
    </motion.div>
  )
}
