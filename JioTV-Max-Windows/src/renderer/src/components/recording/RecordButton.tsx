import { useState, useMemo } from 'react'
import {
  Circle,
  Pause,
  Play,
  Square,
  Clock,
  ShieldAlert,
  Disc
} from 'lucide-react'
import { useRecordingStore } from '@/store/useRecordingStore'
import { cn } from '@/lib/cn'
import type { Channel, StreamInfo } from '@shared/types'

interface RecordButtonProps {
  channel?: Channel
  stream?: StreamInfo | null
  scale?: number
}

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export function RecordButton({ channel, stream, scale = 1 }: RecordButtonProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const openRecordDialog = useRecordingStore((s) => s.openRecordDialog)
  const recordings = useRecordingStore((s) => s.recordings)
  const activeStats = useRecordingStore((s) => s.activeStats)
  const pauseRecording = useRecordingStore((s) => s.pauseRecording)
  const resumeRecording = useRecordingStore((s) => s.resumeRecording)
  const stopRecording = useRecordingStore((s) => s.stopRecording)

  const isDrm = Boolean(
    (channel as any)?.isDrm ||
    (channel as any)?.stream?.type === 'dash' ||
    stream?.drm ||
    stream?.url?.includes('.mpd')
  )

  // Find if current channel has an active session
  const activeSession = useMemo(() => {
    if (!channel) return null
    return recordings.find(
      (r) => r.channelId === channel.id && ['starting', 'recording', 'paused', 'reconnecting'].includes(r.status)
    )
  }, [channel, recordings])

  const stats = useMemo(() => {
    if (!activeSession) return null
    return activeStats.find((s) => s.id === activeSession.id)
  }, [activeSession, activeStats])

  // Find if current channel has a scheduled recording
  const scheduledRecording = useMemo(() => {
    if (!channel || activeSession) return null
    return recordings.find((r) => r.channelId === channel.id && r.status === 'scheduled')
  }, [channel, activeSession, recordings])

  // Count active recordings total to see if concurrency limit (2) is reached
  const activeCount = useMemo(() => {
    return recordings.filter((r) => ['starting', 'recording', 'paused', 'reconnecting'].includes(r.status)).length
  }, [recordings])

  const isConcurrencyLimit = !activeSession && activeCount >= 2

  // Determine state: 'recording' | 'scheduled' | 'disabled' | 'record'
  let state: 'recording' | 'scheduled' | 'disabled' | 'record' = 'record'
  let disabledReason = ''

  if (isDrm) {
    state = 'disabled'
    disabledReason = 'DRM channels cannot be recorded'
  } else if (activeSession) {
    state = 'recording'
  } else if (scheduledRecording) {
    state = 'scheduled'
  } else if (isConcurrencyLimit) {
    state = 'disabled'
    disabledReason = 'Maximum 2 simultaneous recordings reached'
  }

  // 1. Recording State
  if (state === 'recording' && activeSession) {
    const isPaused = activeSession.status === 'paused'
    const elapsed = stats?.elapsedSeconds ?? 0

    return (
      <div className="relative pointer-events-auto flex items-center">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold backdrop-blur-md transition-all',
            isPaused
              ? 'border-amber-500/40 bg-amber-500/20 text-amber-200'
              : 'border-red-500/50 bg-red-600/25 text-red-100 hover:bg-red-600/35'
          )}
          style={{
            fontSize: `${Math.round(11 * scale)}px`,
            padding: `${Math.round(4 * scale)}px ${Math.round(8 * scale)}px`
          }}
          title={isPaused ? 'Recording paused' : 'Actively recording'}
        >
          {/* Pulsing red dot or paused icon */}
          {isPaused ? (
            <span className="h-2 w-2 rounded-full bg-amber-400" />
          ) : (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
          )}
          <span>{formatElapsed(elapsed)}</span>
        </button>

        {/* Mini control popup menu */}
        {menuOpen ? (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div
              className="absolute bottom-full right-0 mb-2 z-50 flex flex-col gap-1 rounded-xl border border-white/10 bg-[#161619] p-1.5 shadow-2xl backdrop-blur-xl min-w-[120px]"
            >
              {isPaused ? (
                <button
                  type="button"
                  onClick={() => {
                    void resumeRecording(activeSession.id)
                    setMenuOpen(false)
                  }}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-white/90 hover:bg-white/10 transition-colors"
                >
                  <Play className="h-3.5 w-3.5 text-emerald-400 fill-current" />
                  <span>Resume</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    void pauseRecording(activeSession.id)
                    setMenuOpen(false)
                  }}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-white/90 hover:bg-white/10 transition-colors"
                >
                  <Pause className="h-3.5 w-3.5 text-amber-400" />
                  <span>Pause</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  void stopRecording(activeSession.id)
                  setMenuOpen(false)
                }}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/15 transition-colors"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                <span>Stop & Save</span>
              </button>
            </div>
          </>
        ) : null}
      </div>
    )
  }

  // 2. Scheduled State
  if (state === 'scheduled' && scheduledRecording) {
    const startTimeStr = new Date(scheduledRecording.plannedStartUtc).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit'
    })

    return (
      <div className="pointer-events-auto flex items-center">
        <button
          type="button"
          onClick={() => {
            if (channel) openRecordDialog(channel)
          }}
          className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/15 px-2.5 py-1 text-xs font-medium text-blue-200 backdrop-blur-md hover:bg-blue-500/25 transition-all"
          style={{
            fontSize: `${Math.round(11 * scale)}px`,
            padding: `${Math.round(4 * scale)}px ${Math.round(8 * scale)}px`
          }}
          title={`Recording scheduled for ${startTimeStr}`}
        >
          <Clock className="h-3.5 w-3.5 text-blue-400" />
          <span>{startTimeStr}</span>
        </button>
      </div>
    )
  }

  // 3. Disabled State (DRM or Concurrency)
  if (state === 'disabled') {
    return (
      <div className="pointer-events-auto flex items-center">
        <button
          type="button"
          disabled
          className="flex items-center justify-center rounded-lg text-white/30 cursor-not-allowed transition-colors"
          style={{ padding: `${Math.round(6 * scale)}px` }}
          title={disabledReason}
        >
          {isDrm ? (
            <ShieldAlert style={{ width: Math.round(19 * scale), height: Math.round(19 * scale) }} />
          ) : (
            <Disc style={{ width: Math.round(19 * scale), height: Math.round(19 * scale) }} />
          )}
        </button>
      </div>
    )
  }

  // 4. Record State (Idle)
  return (
    <div className="pointer-events-auto flex items-center">
      <button
        type="button"
        onClick={() => {
          if (channel) openRecordDialog(channel)
        }}
        className="flex items-center justify-center text-white/75 transition-colors hover:text-red-500 active:scale-95"
        style={{ padding: `${Math.round(6 * scale)}px` }}
        title="Record this channel"
        aria-label="Record this channel"
      >
        <Circle
          className="fill-red-600/40 text-red-500 hover:fill-red-600 transition-all"
          style={{ width: Math.round(18 * scale), height: Math.round(18 * scale) }}
        />
      </button>
    </div>
  )
}
