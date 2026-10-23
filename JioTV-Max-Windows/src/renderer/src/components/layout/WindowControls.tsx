import { useEffect, useRef, useState } from 'react'
import { getBridge } from '@/services/api'
import { cn } from '@/lib/cn'
import { useSnapOverlay } from './useSnapOverlay'

interface WindowControlsProps {
  className?: string
}

function WindowsMinimizeIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges">
      <path d="M0 5H10" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

function WindowsMaximizeIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges">
      <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  )
}

function WindowsRestoreIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges">
      <path d="M2.5 2.5V0.5H9.5V7.5H7.5" stroke="currentColor" strokeWidth="1" fill="none" />
      <rect x="0.5" y="2.5" width="7" height="7" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  )
}

function WindowsCloseIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

/**
 * Standard Windows 11 / Windows 10 caption buttons (Minimize, Maximize / Restore, Close)
 * using the official Windows glyph geometry and interactions.
 */
export function WindowControls({ className }: WindowControlsProps): JSX.Element {
  const [maximized, setMaximized] = useState(false)
  const maxBtnRef = useRef<HTMLButtonElement>(null)
  const bridge = getBridge()
  const { isOverlayMode, dataHover, dataPressed } = useSnapOverlay(maxBtnRef, maximized)

  useEffect(() => {
    if (!bridge) return
    void bridge.isMaximized().then(setMaximized).catch(() => undefined)
    const offMax = bridge.onMaximizedChange((val) => setMaximized(val))
    const offFs = bridge.onFullscreenChange?.((val) => {
      if (val) setMaximized(true)
      else void bridge.isMaximized().then(setMaximized).catch(() => undefined)
    })
    return () => {
      offMax()
      offFs?.()
    }
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleMaximize()
    }
  }

  return (
    <div className={cn('no-drag flex h-[36px] items-center', className)}>
      <button
        type="button"
        title="Minimize"
        aria-label="Minimize"
        onClick={handleMinimize}
        className="flex h-full w-[46px] items-center justify-center text-[#A1A1A6] transition-colors duration-75 hover:bg-white/[0.08] hover:text-[#F4F4F5] active:bg-white/[0.12]"
      >
        <WindowsMinimizeIcon />
      </button>
      <button
        ref={maxBtnRef}
        type="button"
        title={maximized ? 'Restore Down' : 'Maximize'}
        aria-label={maximized ? 'Restore Down' : 'Maximize'}
        data-hover={dataHover}
        data-pressed={dataPressed}
        onClick={handleMaximize}
        onKeyDown={handleKeyDown}
        className={cn(
          'flex h-full w-[46px] items-center justify-center text-[#A1A1A6] transition-colors duration-75',
          'focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/40',
          isOverlayMode
            ? 'data-[hover=true]:bg-white/[0.08] data-[hover=true]:text-[#F4F4F5] data-[pressed=true]:bg-white/[0.12]'
            : 'hover:bg-white/[0.08] hover:text-[#F4F4F5] active:bg-white/[0.12]'
        )}
      >
        {maximized ? <WindowsRestoreIcon /> : <WindowsMaximizeIcon />}
      </button>
      <button
        type="button"
        title="Close"
        aria-label="Close"
        onClick={handleClose}
        className="flex h-full w-[46px] items-center justify-center text-[#A1A1A6] transition-colors duration-75 hover:bg-[#E81123] hover:text-white active:bg-[#C4101E]"
      >
        <WindowsCloseIcon />
      </button>
    </div>
  )
}
