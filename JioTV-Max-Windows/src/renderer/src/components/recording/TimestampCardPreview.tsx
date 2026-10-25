import React, { useState, useEffect, useRef } from 'react'
import type { OverlaySettings } from '@shared/recording-types'
import { OverlayFilterBuilder } from '@shared/overlay-filter'

interface TimestampCardPreviewProps {
  settings: OverlaySettings
  onChange: (updated: OverlaySettings) => void
  disabled?: boolean
}

export function TimestampCardPreview({
  settings,
  onChange,
  disabled = false
}: TimestampCardPreviewProps): JSX.Element {
  const [timeText, setTimeText] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Live ticking clock
  useEffect(() => {
    const update = () => {
      const now = new Date()
      const timeStr = settings.format === '12h'
        ? now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
        : now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })

      const dateStr = settings.showDate ? `${now.toISOString().slice(0, 10)}  ` : ''
      setTimeText(`${dateStr}${timeStr}`)
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [settings.format, settings.showDate])

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return
    setIsDragging(true)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !containerRef.current || disabled) return
    const rect = containerRef.current.getBoundingClientRect()
    const rawX = ((e.clientX - rect.left) / rect.width) * 100
    const rawY = ((e.clientY - rect.top) / rect.height) * 100

    const clampedX = Math.max(2, Math.min(90, rawX))
    const clampedY = Math.max(2, Math.min(90, rawY))

    const snapped = OverlayFilterBuilder.snapCoordinates(clampedX, clampedY)
    onChange({
      ...settings,
      xPercent: Math.round(snapped.xPercent * 10) / 10,
      yPercent: Math.round(snapped.yPercent * 10) / 10
    })
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return
    setIsDragging(false)
    try {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {}
  }

  // Keyboard nudging: arrows = 1%, Shift + arrows = 5%
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    const step = e.shiftKey ? 5 : 1
    let nextX = settings.xPercent
    let nextY = settings.yPercent
    let handled = false

    if (e.key === 'ArrowLeft') {
      nextX = Math.max(2, nextX - step)
      handled = true
    } else if (e.key === 'ArrowRight') {
      nextX = Math.min(90, nextX + step)
      handled = true
    } else if (e.key === 'ArrowUp') {
      nextY = Math.max(2, nextY - step)
      handled = true
    } else if (e.key === 'ArrowDown') {
      nextY = Math.min(90, nextY + step)
      handled = true
    }

    if (handled) {
      e.preventDefault()
      const snapped = OverlayFilterBuilder.snapCoordinates(nextX, nextY)
      onChange({
        ...settings,
        xPercent: snapped.xPercent,
        yPercent: snapped.yPercent
      })
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[13px] text-[#A1A1A6]">
        <span>Position & Live Preview (Drag or use arrow keys)</span>
        <span className="font-mono text-[12px] text-white/70">
          X: {settings.xPercent}% · Y: {settings.yPercent}%
        </span>
      </div>

      <div
        ref={containerRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative aspect-video w-full select-none overflow-hidden rounded-[14px] border border-white/10 bg-[#08080A] shadow-inner"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.04) 0%, transparent 80%)'
        }}
      >
        {/* Aspect ratio frame markings */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-[12px] tracking-widest text-white/20">16:9 PREVIEW</span>
        </div>

        {/* Snap guidelines (subtle) */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-[1px] bg-white/[0.04]" />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-[1px] bg-white/[0.04]" />

        {/* Draggable clock card */}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Timestamp card position"
          aria-valuenow={settings.xPercent}
          onPointerDown={handlePointerDown}
          onKeyDown={handleKeyDown}
          className="absolute cursor-grab rounded-[8px] border border-white/25 px-3 py-1.5 shadow-xl transition-shadow active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-white/40"
          style={{
            left: `${settings.xPercent}%`,
            top: `${settings.yPercent}%`,
            backgroundColor: `rgba(0, 0, 0, ${settings.opacity ?? 0.85})`,
            color: 'white',
            fontSize: settings.size === 'small' ? '11px' : settings.size === 'large' ? '15px' : '13px'
          }}
        >
          <div className="font-mono font-medium tracking-wide">{timeText || '12:00:00 PM'}</div>
        </div>
      </div>
    </div>
  )
}
