import React from 'react'
import { Cast } from 'lucide-react'
import { cn } from '@/lib/cn'
import { CAST_STRINGS } from './cast-strings'
import { useCastStore } from './useCastStore'

interface CastButtonProps {
  scale?: number
  isCastable?: boolean
  className?: string
}

export function CastButton({ scale = 1, isCastable = true, className }: CastButtonProps): JSX.Element | null {
  const isAvailable = useCastStore((s) => s.isAvailable)
  const activeState = useCastStore((s) => s.activeState)
  const setDialogOpen = useCastStore((s) => s.setDialogOpen)

  if (!isAvailable || !isCastable) {
    return null
  }

  const isCasting =
    activeState.state === 'casting' ||
    activeState.state === 'connecting' ||
    activeState.state === 'loading'

  const tooltip = isCasting ? CAST_STRINGS.buttonActiveTooltip : CAST_STRINGS.buttonTooltip

  return (
    <button
      type="button"
      onClick={() => setDialogOpen(true)}
      title={tooltip}
      aria-label={tooltip}
      className={cn(
        'pointer-events-auto flex items-center justify-center rounded-lg transition-all active:scale-95',
        isCasting
          ? 'text-[#E11D2E] bg-white/10 shadow-[0_0_12px_rgba(225,29,46,0.4)]'
          : 'text-white/75 hover:text-white hover:bg-white/10',
        className
      )}
      style={{
        padding: `${Math.round(6 * scale)}px`
      }}
    >
      <Cast
        style={{
          width: Math.round(20 * scale),
          height: Math.round(20 * scale)
        }}
        className={cn('transition-transform duration-200', isCasting && 'scale-105')}
      />
    </button>
  )
}
