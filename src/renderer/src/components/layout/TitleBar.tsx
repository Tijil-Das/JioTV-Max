import { useLocation } from 'react-router-dom'
import { WifiOff } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useNow } from '@/hooks/useNow'
import { useOnline } from '@/hooks/useOnline'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { WindowControls } from './WindowControls'
import appIcon from '@/assets/icons/app-icon-128.png'

const clockFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

/**
 * 36px title bar. True black, text in --text-2.
 * Fades away over the player when controls are hidden.
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
        'drag-region relative z-50 flex h-[36px] shrink-0 items-center justify-between',
        'border-b border-[rgba(255,255,255,0.07)] bg-[#000000] pl-4 pr-0',
        isPlayer && 'border-transparent bg-black/30'
      )}
    >
      {/* Left: app icon and name */}
      <div
        className={cn(
          'flex items-center gap-2 transition-opacity duration-500',
          faded ? 'opacity-0' : 'opacity-100'
        )}
      >
        <img src={appIcon} alt="" className="h-4 w-4 shrink-0 rounded-[3px] object-contain" />
        <span className="text-[12px] font-[600] tracking-wide text-[#F4F4F5]">JioTv Max</span>
        <span className="mx-1 h-3.5 w-px bg-white/[0.07]" aria-hidden />
        <span className="text-[11px] font-[400] text-[#66666C]">Live television</span>
      </div>

      {/* Right: status, clock, window controls */}
      <div
        className={cn(
          'flex items-center gap-3 transition-opacity duration-500',
          faded ? 'pointer-events-none opacity-0' : 'opacity-100'
        )}
      >
        {!online ? (
          <span className="flex items-center gap-1 text-[10px] font-[500] text-[#FBBF24]">
            <WifiOff className="h-3 w-3" />
            Offline
          </span>
        ) : null}

        <span
          className={cn(
            'text-[10px] font-[500] uppercase tracking-[0.1em]',
            mode === 'demo' ? 'text-[#66666C]' : 'text-[#A1A1A6]'
          )}
        >
          {mode === 'demo' ? 'Demo' : 'JioTV'}
        </span>

        <span className="text-[11px] font-[500] tabular-nums text-[#66666C]">
          {clockFormatter.format(now)}
        </span>

        <WindowControls />
      </div>
    </header>
  )
}
