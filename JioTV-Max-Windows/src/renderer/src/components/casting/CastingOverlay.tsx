import React, { useState, useEffect, useRef } from 'react'
import { Play, Pause, Volume2, Volume1, VolumeX, Square, Tv, Cast } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { CastMediaInput } from '@shared/cast-types'
import { CAST_STRINGS } from './cast-strings'
import { useCastStore } from './useCastStore'

interface CastingOverlayProps {
  media: CastMediaInput | null
  onStop: () => void
}

export function CastingOverlay({ media, onStop }: CastingOverlayProps): JSX.Element | null {
  const activeState = useCastStore((s) => s.activeState)
  const isCasting = activeState.state === 'casting' || activeState.state === 'loading'
  const pause = useCastStore((s) => s.pause)
  const resume = useCastStore((s) => s.resume)
  const setVolume = useCastStore((s) => s.setVolume)
  const setMuted = useCastStore((s) => s.setMuted)

  const [localVolume, setLocalVolume] = useState(activeState.volume ?? 1)
  const volumeDebounceRef = useRef<number | null>(null)

  useEffect(() => {
    if (activeState.volume !== undefined) {
      setLocalVolume(activeState.volume)
    }
  }, [activeState.volume])

  if (!isCasting) return null

  const isPlaying = activeState.substate === 'playing'
  const isBuffering = activeState.substate === 'buffering'
  const isMuted = Boolean(activeState.muted)
  const deviceName = activeState.device?.name || 'TV'
  const channelTitle = media?.title || activeState.media?.title || 'Live Stream'
  const channelImage = media?.imageUrl || activeState.media?.imageUrl

  const handleVolumeChange = (newVal: number) => {
    setLocalVolume(newVal)
    if (volumeDebounceRef.current) window.clearTimeout(volumeDebounceRef.current)
    volumeDebounceRef.current = window.setTimeout(() => {
      void setVolume(newVal)
    }, 150)
  }

  const handleToggleMute = () => {
    void setMuted(!isMuted)
  }

  const handleTogglePlay = () => {
    if (isPlaying) {
      void pause()
    } else {
      void resume()
    }
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl p-6 text-white select-none">
      {/* Glow effect */}
      <div className="pointer-events-none absolute h-72 w-72 rounded-full bg-red-600/10 blur-[120px]" />

      <div className="relative z-10 flex flex-col items-center max-w-md w-full text-center space-y-6">
        {/* Animated Cast Icon & Badge */}
        <div className="relative">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.05] shadow-2xl backdrop-blur-md">
            <Tv className="h-10 w-10 text-white" />
          </div>
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-[#E11D2E] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg">
            {CAST_STRINGS.betaBadge}
          </span>
        </div>

        {/* Device & Channel Information */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-center gap-2 text-xs font-medium text-zinc-400">
            <Cast className="h-3.5 w-3.5 text-[#E11D2E]" />
            <span>{CAST_STRINGS.castingTo(deviceName)}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">{channelTitle}</h2>

          {/* Status Chip */}
          <div className="pt-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider',
                isBuffering
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : isPlaying
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-zinc-500/20 text-zinc-300 border border-zinc-500/30'
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  isBuffering
                    ? 'bg-amber-400 animate-pulse'
                    : isPlaying
                      ? 'bg-emerald-400 animate-ping'
                      : 'bg-zinc-400'
                )}
              />
              {isBuffering
                ? CAST_STRINGS.statusBuffering
                : isPlaying
                  ? CAST_STRINGS.statusPlaying
                  : CAST_STRINGS.statusPaused}
            </span>
            {media?.isDecryptedRelay || activeState.media?.isDecryptedRelay ? (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-300">
                Decrypted Stream Relay
              </span>
            ) : null}
          </div>
        </div>

        {/* Remote Playback Controls */}
        <div className="flex items-center justify-center gap-4 pt-2">
          {/* Pause / Resume Button */}
          <button
            type="button"
            onClick={handleTogglePlay}
            aria-label={isPlaying ? 'Pause TV' : 'Resume TV'}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-neutral-900 shadow-xl transition-all hover:scale-105 active:scale-95"
          >
            {isPlaying ? (
              <Pause className="h-6 w-6 fill-current" />
            ) : (
              <Play className="h-6 w-6 fill-current ml-0.5" />
            )}
          </button>
        </div>

        {/* Remote Volume Bar */}
        <div className="flex items-center justify-center gap-3 w-64 pt-2">
          <button
            type="button"
            onClick={handleToggleMute}
            aria-label={isMuted ? 'Unmute TV' : 'Mute TV'}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            {isMuted ? (
              <VolumeX className="h-5 w-5 text-red-400" />
            ) : localVolume > 0.5 ? (
              <Volume2 className="h-5 w-5" />
            ) : (
              <Volume1 className="h-5 w-5" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : localVolume}
            onChange={(e) => handleVolumeChange(Number(e.target.value))}
            aria-label="TV Volume"
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/20 accent-[#E11D2E]"
          />
        </div>

        {/* Stop Casting Button */}
        <div className="pt-4">
          <button
            type="button"
            onClick={onStop}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white shadow-md backdrop-blur-md transition-all hover:bg-red-600 hover:border-red-500 active:scale-95"
          >
            <Square className="h-4 w-4 fill-current" />
            {CAST_STRINGS.stopCasting}
          </button>
        </div>
      </div>
    </div>
  )
}
