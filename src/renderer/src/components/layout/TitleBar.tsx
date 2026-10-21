import { useLocation } from 'react-router-dom'
import { WifiOff } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useNow } from '@/hooks/useNow'
import { useOnline } from '@/hooks/useOnline'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { BrandMark, BrandWordmark } from '@/components/ui/BrandMark'
import { WindowControls } from './WindowControls'

const clockFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

/**
 * Custom 40px title bar. The whole strip is a drag region except interactive
 * chips, which opt out via `.no-drag`. It fades away over the player.
 */
export function TitleBar(): JSX.Element {
  const location = useLocation()
  const now = useNow()
  const online = useOnline()
  const mode = useSettingsStore((state) => state.mode)
  const controlsVisible = usePlayerStore((state) => state.controlsVisible)
  const isPlayer = location.pathname.startsWith('/watch')
  const faded = isPlayer && !controlsVisible

  return (
    <header
      className={cn(
        'drag-region relative z-50 flex h-[40px] shrink-0 items-center justify-between border-b border-white/[0.045] pl-4 pr-0',
        'bg-[linear-gradient(to_bottom,rgba(10,10,14,.72),rgba(5,5,7,.35))] backdrop-blur-xl',
        isPlayer && 'border-transparent bg-black/25'
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2.5 transition-opacity duration-500',
          faded ? 'opacity-0' : 'opacity-100'
        )}
      >
        <BrandMark size={20} />
        <BrandWordmark />
        <span className="mx-1 h-4 w-px bg-white/10" aria-hidden />
        <span className="text-[11px] font-medium tracking-wide text-text-muted">Live television</span>
      </div>

      <div
        className={cn(
          'flex items-center gap-3 transition-opacity duration-500',
          faded ? 'pointer-events-none opacity-0' : 'opacity-100'
        )}
      >
        {!online ? (
          <span className="flex items-center gap-1.5 rounded-pill border border-warning/25 bg-warning/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-warning">
            <WifiOff className="h-3 w-3" />
            Offline
          </span>
        ) : null}
        <span
          className={cn(
            'rounded-pill border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]',
            mode === 'demo'
              ? 'border-accent-alt/25 bg-accent-alt/10 text-accent-alt'
              : 'border-accent/30 bg-accent/10 text-accent-glow'
          )}
        >
          {mode === 'demo' ? 'Demo' : 'JioTV'}
        </span>
        <span className="mr-1 text-[11px] font-medium tabular-nums text-text-secondary">
          {clockFormatter.format(now)}
        </span>
        <WindowControls />
      </div>
    </header>
  )
}
