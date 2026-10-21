import { useEffect, useState } from 'react'
import { Copy, Minus, Square, X } from 'lucide-react'
import { getBridge } from '@/services/api'
import { cn } from '@/lib/cn'

interface WindowControlsProps {
  className?: string
}

/**
  * Custom window controls (Minimize, Maximize / Restore, Close) matching
  * modern Windows 11 fluent styling with dark glass aesthetics.
  */
export function WindowControls({ className }: WindowControlsProps): JSX.Element {
  const [maximized, setMaximized] = useState(false)
  const bridge = getBridge()

  useEffect(() => {
    if (!bridge) return
    void bridge.isMaximized().then(setMaximized).catch(() => undefined)
    const off = bridge.onMaximizedChange((val) => setMaximized(val))
    return () => off()
  }, [bridge])

  const handleMinimize = (): void => {
    if (bridge) void bridge.minimize()
  }

  const handleMaximize = (): void => {
    if (bridge) void bridge.maximize()
  }

  const handleClose = (): void => {
    if (bridge) void bridge.close()
  }

  return (
    <div className={cn('no-drag flex h-full items-center', className)}>
      <button
        type="button"
        title="Minimize"
        aria-label="Minimize window"
        onClick={handleMinimize}
        className="flex h-[40px] w-[46px] items-center justify-center text-text-muted transition-colors hover:bg-white/[0.08] hover:text-white"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title={maximized ? 'Restore' : 'Maximize'}
        aria-label={maximized ? 'Restore window' : 'Maximize window'}
        onClick={handleMaximize}
        className="flex h-[40px] w-[46px] items-center justify-center text-text-muted transition-colors hover:bg-white/[0.08] hover:text-white"
      >
        {maximized ? (
          <Copy className="h-3 w-3 -scale-x-100" />
        ) : (
          <Square className="h-3 w-3" />
        )}
      </button>
      <button
        type="button"
        title="Close"
        aria-label="Close window"
        onClick={handleClose}
        className="flex h-[40px] w-[46px] items-center justify-center text-text-muted transition-colors hover:bg-[#e81123] hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
