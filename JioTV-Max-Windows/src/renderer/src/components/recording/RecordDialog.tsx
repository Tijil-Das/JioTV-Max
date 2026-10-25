import { useState, useEffect, useMemo, useId, useCallback } from 'react'
import {
  Clock,
  Folder,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  Calendar,
  Sparkles,
  Info,
  Monitor,
  Play,
  StopCircle,
  HardDrive
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { TimestampCardPreview } from './TimestampCardPreview'
import { useRecordingStore } from '@/store/useRecordingStore'
import { useChannelStore } from '@/store/useChannelStore'
import { useUIStore } from '@/store/useUIStore'
import { cn } from '@/lib/cn'
import type { OverlaySettings, ValidationResult, CaptureMode } from '@shared/recording-types'

export function RecordDialog(): JSX.Element | null {
  const isOpen = useRecordingStore((s) => s.isRecordDialogOpen)
  const channel = useRecordingStore((s) => s.dialogChannel)
  const onClose = useRecordingStore((s) => s.closeRecordDialog)
  const preferences = useRecordingStore((s) => s.preferences)
  const capability = useRecordingStore((s) => s.capability)
  const epg = useChannelStore((s) => s.epg)
  const pushToast = useUIStore((s) => s.pushToast)

  const now = Date.now()
  const isDrm = Boolean((channel as any)?.isDrm || (channel as any)?.stream?.type === 'dash')

  // Find current program from EPG
  const currentPrograms = channel ? (epg[channel.id] ?? []) : []
  const currentProgram = useMemo(() => {
    return currentPrograms.find((p) => {
      const s = new Date(p.start).getTime()
      const e = new Date(p.end).getTime()
      return now >= s && now < e
    })
  }, [currentPrograms, now])

  // Form states
  const [mode, setMode] = useState<'now' | 'schedule'>('now')
  const [quickDuration, setQuickDuration] = useState<'program' | '30' | '60' | '120' | 'custom'>(
    currentProgram ? 'program' : '60'
  )
  const [customDurationMinutes, setCustomDurationMinutes] = useState(60)

  // Scheduled date/time
  const [scheduledStart, setScheduledStart] = useState(() => {
    const d = new Date(now + 5 * 60 * 1000)
    return d.toISOString().slice(0, 16)
  })
  const [scheduledEnd, setScheduledEnd] = useState(() => {
    const d = new Date(now + 65 * 60 * 1000)
    return d.toISOString().slice(0, 16)
  })

  const [filename, setFilename] = useState('')
  const [folder, setFolder] = useState('')
  const [quality, setQuality] = useState<'highest' | 'balanced'>('highest')
  const [paddingMinutes, setPaddingMinutes] = useState(0)

  // Capture mode for DRM channels
  const [captureMode, setCaptureMode] = useState<CaptureMode>('stream-copy')
  const [drmKey, setDrmKey] = useState('')
  const [showDrmKeyInput, setShowDrmKeyInput] = useState(false)

  // Overlay settings
  const [overlayEnabled, setOverlayEnabled] = useState(false)
  const [overlaySettings, setOverlaySettings] = useState<OverlaySettings>({
    position: 'bottom-right',
    customCoords: { xPercent: 96, yPercent: 94 },
    showDate: true,
    timeFormat: '12h',
    fontSize: 'medium',
    opacity: 0.85
  })
  const [showOverlayOptions, setShowOverlayOptions] = useState(false)

  // Validation & Submission
  const [validating, setValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Calculate start and end epoch ms
  const { fromEpochMs, toEpochMs } = useMemo(() => {
    if (mode === 'now') {
      const start = now
      let end = start + 60 * 60 * 1000
      if (quickDuration === 'program' && currentProgram) {
        end = new Date(currentProgram.end).getTime()
      } else if (quickDuration === '30') {
        end = start + 30 * 60 * 1000
      } else if (quickDuration === '60') {
        end = start + 60 * 60 * 1000
      } else if (quickDuration === '120') {
        end = start + 120 * 60 * 1000
      } else if (quickDuration === 'custom') {
        end = start + customDurationMinutes * 60 * 1000
      }
      return { fromEpochMs: start, toEpochMs: end }
    } else {
      const s = new Date(scheduledStart).getTime()
      const e = new Date(scheduledEnd).getTime()
      return { fromEpochMs: isNaN(s) ? now + 60000 : s, toEpochMs: isNaN(e) ? now + 3600000 : e }
    }
  }, [mode, quickDuration, customDurationMinutes, scheduledStart, scheduledEnd, now, currentProgram])

  // Sync default folder & filename pattern on open
  useEffect(() => {
    if (isOpen && preferences) {
      setFolder(preferences.defaultFolder)
      setQuality(preferences.quality)
      setPaddingMinutes(preferences.paddingMinutes)
      setOverlayEnabled(preferences.timestampCardDefault && capability?.tier !== 'unavailable')
      // Set capture mode for DRM channels: default to surface-capture
      if (isDrm) {
        setCaptureMode('surface-capture')
        setShowDrmKeyInput(false)
      } else {
        setCaptureMode('stream-copy')
      }
      if (channel) {
        const cleanName = channel.name.replace(/[^a-zA-Z0-9_-]/g, '_')
        const dateStr = new Date().toISOString().slice(0, 10)
        setFilename(`${cleanName}_${dateStr}.mp4`)
      }
    }
  }, [isOpen, preferences, channel, capability, isDrm])

  // Debounced live validator
  useEffect(() => {
    if (!isOpen || !channel) return
    const timer = setTimeout(async () => {
      setValidating(true)
      try {
        if (window.api?.recording?.validate) {
          const res = await window.api.recording.validate({
            channel: {
              id: channel.id,
              name: channel.name,
              isDrm: isDrm,
              streamType: (channel as any)?.stream?.type || (isDrm ? 'dash' : 'hls'),
              isEntitled: true,
              captureMode: isDrm ? captureMode : 'stream-copy'
            },
            timeWindow: {
              fromEpochMs,
              toEpochMs,
              isRecordNow: mode === 'now'
            },
            concurrency: {
              newRecording: {
                startEpochMs: fromEpochMs - paddingMinutes * 60 * 1000,
                endEpochMs: toEpochMs + paddingMinutes * 60 * 1000,
                channelId: channel.id
              }
            },
            fromEpochMs,
            toEpochMs,
            isRecordNow: mode === 'now',
            paddingMinutes,
            filename,
            diskSpace: {
              targetFolder: folder,
              durationMinutes: Math.round((toEpochMs - fromEpochMs) / 60000) + paddingMinutes * 2,
              quality
            }
          })
          setValidationResult(res)
        }
      } catch {
      } finally {
        setValidating(false)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [isOpen, channel, isDrm, fromEpochMs, toEpochMs, mode, paddingMinutes, filename, folder, quality])

  if (!channel) return null

  const handlePickFolder = async () => {
    if (window.api?.recording?.openFolder) {
      // In electron main process, dialog pick folder can be called
    }
  }

  const handleSubmit = async () => {

    if (validationResult && !validationResult.valid) {
      pushToast({
        title: 'Validation Error',
        description: validationResult.errors[0]?.message || 'Please correct errors before recording.',
        variant: 'error'
      })
      return
    }

    setSubmitting(true)
    try {
      const input = {
        channelId: channel.id,
        channelName: channel.name,
        channelLogo: channel.logoUrl,
        fromEpochMs,
        toEpochMs,
        paddingMinutes,
        folder,
        filename,
        quality,
        overlaySettings: overlayEnabled ? overlaySettings : undefined,
        isRecordNow: mode === 'now',
        isDrm,
        captureMode: isDrm ? captureMode : 'stream-copy',
        drmKey: isDrm && captureMode === 'decryption-key' ? drmKey.trim() || undefined : undefined
      }

      let res
      if (mode === 'now') {
        res = await window.api?.recording?.startNow(input)
      } else {
        res = await window.api?.recording?.schedule(input)
      }

      if (res?.ok) {
        pushToast({
          title: mode === 'now' ? 'Recording Started' : 'Recording Scheduled',
          description: `${channel.name} will be saved to ${folder}`,
          variant: 'success'
        })
        onClose()
      } else {
        pushToast({
          title: 'Failed to record',
          description: res?.error || 'Unknown error occurred',
          variant: 'error'
        })
      }
    } catch (err: any) {
      pushToast({
        title: 'Error',
        description: err?.message || 'Failed to start recording',
        variant: 'error'
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={isOpen} onClose={onClose} className="w-full max-w-[560px] p-6 bg-[#0E0E11] border border-white/10 rounded-2xl shadow-2xl">
      <div className="flex flex-col gap-5 max-h-[85vh] overflow-y-auto pr-1">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600/15 border border-red-500/25 text-red-500">
              <Clock className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white">Record Channel</h2>
                {isDrm && (
                  <span className="text-[10px] font-medium text-amber-300 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded">
                    DRM
                  </span>
                )}
              </div>
              <p className="text-xs text-white/60">{channel.name}</p>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="flex rounded-lg bg-white/5 p-1 border border-white/10">
            <button
              type="button"
              onClick={() => setMode('now')}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-all',
                mode === 'now' ? 'bg-red-600 text-white shadow-sm' : 'text-white/70 hover:text-white'
              )}
            >
              Record Now
            </button>
            <button
              type="button"
              onClick={() => setMode('schedule')}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-all',
                mode === 'schedule' ? 'bg-red-600 text-white shadow-sm' : 'text-white/70 hover:text-white'
              )}
            >
              Schedule
            </button>
          </div>
        </div>

        {/* Duration / Schedule selector */}
        {mode === 'now' ? (
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-white/50">Duration</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {currentProgram ? (
                <button
                  type="button"
                  onClick={() => setQuickDuration('program')}
                  className={cn(
                    'flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition-all text-center',
                    quickDuration === 'program'
                      ? 'border-red-500/60 bg-red-600/15 text-white'
                      : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                  )}
                >
                  <span className="truncate max-w-full font-semibold">{currentProgram.title}</span>
                  <span className="text-[10px] text-white/50 mt-0.5">End of program</span>
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => setQuickDuration('30')}
                className={cn(
                  'flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition-all',
                  quickDuration === '30'
                    ? 'border-red-500/60 bg-red-600/15 text-white'
                    : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                )}
              >
                <span>30 Minutes</span>
                <span className="text-[10px] text-white/50 mt-0.5">Quick clip</span>
              </button>

              <button
                type="button"
                onClick={() => setQuickDuration('60')}
                className={cn(
                  'flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition-all',
                  quickDuration === '60'
                    ? 'border-red-500/60 bg-red-600/15 text-white'
                    : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                )}
              >
                <span>1 Hour</span>
                <span className="text-[10px] text-white/50 mt-0.5">Standard</span>
              </button>

              <button
                type="button"
                onClick={() => setQuickDuration('120')}
                className={cn(
                  'flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition-all',
                  quickDuration === '120'
                    ? 'border-red-500/60 bg-red-600/15 text-white'
                    : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                )}
              >
                <span>2 Hours</span>
                <span className="text-[10px] text-white/50 mt-0.5">Movie / Match</span>
              </button>
            </div>
          </div>
        ) : null}

        {/* Scheduled start & end time pickers */}
        {mode === 'schedule' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-white/50">Start Time</label>
              <input
                type="datetime-local"
                value={scheduledStart}
                onChange={(e) => setScheduledStart(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-white/50">End Time</label>
              <input
                type="datetime-local"
                value={scheduledEnd}
                onChange={(e) => setScheduledEnd(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
              />
            </div>
          </div>
        ) : null}

        {/* Destination & Quality settings */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-white/50">Output Filename</label>
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="recording.mp4"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-white/50">Quality</label>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value as any)}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#161619] px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
            >
              <option value="highest">Highest Quality (Pristine 1080p copy)</option>
              <option value="balanced">Balanced Quality (Lower bitrate 720p)</option>
            </select>
          </div>
        </div>

        {/* DRM Capture Mode (Sony / Widevine channels) */}
        {isDrm && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Monitor className="h-4 w-4 text-amber-400" />
                <div>
                  <p className="text-xs font-medium text-white">DRM Capture Mode</p>
                  <p className="text-[11px] text-white/50">
                    Sony channels use Widevine DRM. Stream-copy records encrypted chunks. Surface capture records decrypted playback.
                  </p>
                </div>
              </div>
            </div>
            <div className="pt-2 space-y-3">
              <label className="text-xs font-semibold text-white/80 block mb-2">Capture Method</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCaptureMode('surface-capture')}
                  className={cn(
                    'flex flex-col items-center justify-center p-3 rounded-xl border transition-all',
                    captureMode === 'surface-capture'
                      ? 'border-amber-500/60 bg-amber-500/10 text-amber-200'
                      : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                  )}
                >
                  <span className="text-xs font-semibold">Surface Capture</span>
                  <span className="text-[10px] text-white/50 mt-0.5">Recommended · Real-time</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCaptureMode('decryption-key')}
                  className={cn(
                    'flex flex-col items-center justify-center p-3 rounded-xl border transition-all',
                    captureMode === 'decryption-key'
                      ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200'
                      : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                  )}
                >
                  <span className="text-xs font-semibold">Decryption Key</span>
                  <span className="text-[10px] text-white/50 mt-0.5">Lossless · Needs KID:KEY</span>
                </button>
              </div>

              {captureMode === 'decryption-key' && (
                <div className="pt-2 border-t border-white/10 space-y-2">
                  <label className="text-xs font-semibold text-white/80 block mb-1">Widevine KID:KEY</label>
                  <input
                    type="text"
                    value={drmKey}
                    onChange={(e) => setDrmKey(e.target.value)}
                    placeholder="32 hex chars : 32 hex chars"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                  />
                  <p className="text-[11px] text-white/50">
                    16-byte content key extracted from the Widevine license exchange. Format: <span className="text-white/70">KID:KEY</span>
                  </p>
                </div>
              )}

              {captureMode === 'surface-capture' && (
                <p className="text-[11px] text-white/50">
                  Captures decrypted video/audio directly from the player window. Uses GPU/CPU to encode in real-time.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Timestamp Card Option */}
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-4 w-4 text-amber-400" />
              <div>
                <p className="text-xs font-medium text-white">Broadcast Timestamp Overlay</p>
                <p className="text-[11px] text-white/50">Burn live ticking date & clock into the video</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={overlayEnabled}
                onChange={(e) => setOverlayEnabled(e.target.checked)}
                disabled={capability?.tier === 'unavailable'}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600"></div>
            </label>
          </div>

          {capability?.tier === 'unavailable' ? (
            <p className="text-[11px] text-white/40 italic">
              Hardware encoder unavailable on this system. Timestamp card requires NVENC, QSV, or AMF.
            </p>
          ) : null}

          {overlayEnabled ? (
            <div className="pt-2 border-t border-white/10 space-y-3">
              <TimestampCardPreview settings={overlaySettings} onPositionChange={(p, c) => setOverlaySettings((s) => ({ ...s, position: p, customCoords: c }))} />
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label className="flex items-center gap-1.5 text-white/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overlaySettings.showDate}
                    onChange={(e) => setOverlaySettings((s) => ({ ...s, showDate: e.target.checked }))}
                    className="accent-red-600"
                  />
                  Show Date
                </label>
                <label className="flex items-center gap-1.5 text-white/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overlaySettings.timeFormat === '24h'}
                    onChange={(e) => setOverlaySettings((s) => ({ ...s, timeFormat: e.target.checked ? '24h' : '12h' }))}
                    className="accent-red-600"
                  />
                  24-Hour Clock
                </label>
              </div>
            </div>
          ) : null}
        </div>

        {/* Validation Errors & Warnings */}
        {validationResult && !validationResult.valid ? (
          <div className="space-y-1.5">
            {validationResult.errors.map((err, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/30 p-2.5 text-xs text-red-300">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                <span>{err.message}</span>
              </div>
            ))}
          </div>
        ) : null}

        {validationResult && validationResult.warnings.length > 0 ? (
          <div className="space-y-1.5">
            {validationResult.warnings.map((warn, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-300">
                <Info className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                <span>{warn.message}</span>
              </div>
            ))}
          </div>
        ) : null}

        {/* Permanent App Running Bandwidth Notice */}
        <p className="text-[11px] text-white/40 leading-relaxed">
          Permanent notice: Recordings only run while JioTV Max is open. Closing the app pauses or stops active and upcoming recordings.
        </p>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={submitting || (validationResult !== null && !validationResult.valid)}
            onClick={handleSubmit}
            className="bg-red-600 hover:bg-red-500 text-white min-w-[120px]"
          >
            {submitting ? 'Starting…' : mode === 'now' ? 'Start Recording' : 'Schedule Recording'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
