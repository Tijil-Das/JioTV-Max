import { motion } from 'framer-motion'
import { Check, Sparkles } from 'lucide-react'
import type { EngineLevel } from '@/hooks/useMediaPlayer'
import { cn } from '@/lib/cn'
import { popover } from '@/lib/motion'

interface QualityMenuProps {
  levels: EngineLevel[]
  activeLevel: number | 'auto'
  activeHeight: number
  onSelect: (level: number | 'auto') => void
  onClose: () => void
}

function formatBitrate(bitrate: number): string | null {
  if (!bitrate) return null
  return `${(bitrate / 1_000_000).toFixed(1)} Mbps`
}

function resolutionTag(height: number): string {
  if (height >= 1080) return 'FHD'
  if (height >= 720) return 'HD'
  if (height >= 480) return 'SD'
  return 'LD'
}

/**
 * Clean, mature stream quality chooser tuned to the JioTv Max design system.
 */
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
      aria-label="Stream Quality"
      variants={popover}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="absolute bottom-[calc(100%+12px)] right-0 z-50 w-[240px] overflow-hidden rounded-[14px] border border-white/[0.08] bg-[#0C0C0E]/95 p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.85)] backdrop-blur-[28px]"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
        <span className="text-[11.5px] font-[600] uppercase tracking-[0.12em] text-[#A1A1A6]">
          Playback Quality
        </span>
        {activeHeight > 0 ? (
          <span className="text-[11px] font-medium text-white/50">
            Current: <span className="font-semibold text-white/90">{activeHeight}p</span>
          </span>
        ) : null}
      </div>

      <div className="py-1">
        {/* Auto Quality (Prioritizes Highest Quality) */}
        <button
          type="button"
          role="menuitemradio"
          aria-checked={activeLevel === 'auto'}
          onClick={() => {
            onSelect('auto')
            onClose()
          }}
          className={cn(
            'flex w-full items-center justify-between rounded-[9px] px-3 py-2 text-left transition-colors duration-100',
            activeLevel === 'auto'
              ? 'bg-white/[0.08] text-white'
              : 'text-[#D4D4D8] hover:bg-white/[0.04] hover:text-white'
          )}
        >
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-3.5 w-3.5 text-[#E11D2E]" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-[550]">Auto</span>
                <span className="rounded-[4px] bg-[#E11D2E]/20 px-1 py-0.2 text-[9.5px] font-bold uppercase tracking-wider text-[#EF3340]">
                  Best
                </span>
              </div>
              <span className="block text-[11px] text-[#A1A1A6]">
                Always highest without buffering
              </span>
            </div>
          </div>
          {activeLevel === 'auto' ? <Check className="h-4 w-4 text-[#E11D2E]" /> : null}
        </button>
      </div>

      <div className="h-px bg-white/[0.06] mx-1 my-0.5" />

      {levels.length === 0 ? (
        <p className="px-3 py-3 text-[11.5px] text-[#A1A1A6]">
          Detecting stream resolutions…
        </p>
      ) : (
        <ul className="max-h-[220px] overflow-y-auto py-1">
          {[...levels]
            .sort((a, b) => b.height - a.height)
            .map((level) => {
              const active = activeLevel === level.index
              const isCurrentHeight = activeLevel === 'auto' && activeHeight === level.height
              const bitrateText = formatBitrate(level.bitrate)

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
                      'flex w-full items-center justify-between rounded-[9px] px-3 py-2 text-left transition-colors duration-100',
                      active
                        ? 'bg-white/[0.08] text-white'
                        : 'text-[#D4D4D8] hover:bg-white/[0.04] hover:text-white'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-[550]">
                        {level.height > 0 ? `${level.height}p` : level.label}
                      </span>
                      {level.height > 0 ? (
                        <span className="rounded-[4px] border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-semibold text-white/60">
                          {resolutionTag(level.height)}
                        </span>
                      ) : null}
                      {bitrateText ? (
                        <span className="text-[11px] text-white/40">· {bitrateText}</span>
                      ) : null}
                    </div>
                    {active ? (
                      <Check className="h-4 w-4 text-[#E11D2E]" />
                    ) : isCurrentHeight ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                    ) : null}
                  </button>
                </li>
              )
            })}
        </ul>
      )}
    </motion.div>
  )
}
