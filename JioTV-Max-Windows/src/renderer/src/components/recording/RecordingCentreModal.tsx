import { useState, useMemo, useEffect } from 'react'
import {
  Radio,
  Clock,
  Film,
  Sliders,
  Play,
  Pause,
  Square,
  Trash2,
  FolderOpen,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Info,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Edit3,
  X
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useRecordingStore } from '@/store/useRecordingStore'
import { useUIStore } from '@/store/useUIStore'
import { cn } from '@/lib/cn'
import type { RecordingRecord } from '@shared/recording-types'

function formatBytes(bytes: number): string {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 MB'
  const mb = bytes / (1024 * 1024)
  if (mb >= 1000) {
    return `${(mb / 1024).toFixed(2)} GB`
  }
  return `${mb.toFixed(1)} MB`
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

export function RecordingCentreModal(): JSX.Element | null {
  const isOpen = useRecordingStore((s) => s.isCentreOpen)
  const onClose = useRecordingStore((s) => s.closeRecordingCentre)
  const activeTab = useRecordingStore((s) => s.activeTab)
  const setActiveTab = useRecordingStore((s) => s.setActiveTab)

  const recordings = useRecordingStore((s) => s.recordings)
  const activeStats = useRecordingStore((s) => s.activeStats)
  const preferences = useRecordingStore((s) => s.preferences)
  const capability = useRecordingStore((s) => s.capability)

  const pauseRecording = useRecordingStore((s) => s.pauseRecording)
  const resumeRecording = useRecordingStore((s) => s.resumeRecording)
  const stopRecording = useRecordingStore((s) => s.stopRecording)
  const cancelRecording = useRecordingStore((s) => s.cancelRecording)
  const deleteRecording = useRecordingStore((s) => s.deleteRecording)
  const retryFinalize = useRecordingStore((s) => s.retryFinalize)
  const openFolder = useRecordingStore((s) => s.openFolder)
  const savePreferences = useRecordingStore((s) => s.savePreferences)
  const fetchCapability = useRecordingStore((s) => s.fetchCapability)
  const pushToast = useUIStore((s) => s.pushToast)

  // Diagnostics Modal State
  const [diagnosticsRecord, setDiagnosticsRecord] = useState<RecordingRecord | null>(null)
  const [diagnosticsData, setDiagnosticsData] = useState<any>(null)
  const [confirmEndId, setConfirmEndId] = useState<string | null>(null)

  // Preferences form local state
  const [prefFolder, setPrefFolder] = useState('')
  const [prefPattern, setPrefPattern] = useState('')
  const [prefQuality, setPrefQuality] = useState<'highest' | 'balanced'>('highest')
  const [prefPadding, setPrefPadding] = useState(0)
  const [prefPreventSleep, setPrefPreventSleep] = useState(true)
  const [prefMinimizeToTray, setPrefMinimizeToTray] = useState(true)
  const [prefStartWithWindows, setPrefStartWithWindows] = useState(false)
  const [prefTimestampDefault, setPrefTimestampDefault] = useState(false)
  const [probing, setProbing] = useState(false)

  // Edit Scheduled End Time modal state
  const [editingScheduled, setEditingScheduled] = useState<RecordingRecord | null>(null)
  const [editEndTime, setEditEndTime] = useState('')

  // Rename modal state
  const [renamingRecord, setRenamingRecord] = useState<RecordingRecord | null>(null)
  const [renameInput, setRenameInput] = useState('')

  useEffect(() => {
    if (preferences) {
      setPrefFolder(preferences.defaultFolder)
      setPrefPattern(preferences.filenamePattern)
      setPrefQuality(preferences.quality)
      setPrefPadding(preferences.paddingMinutes)
      setPrefPreventSleep(preferences.preventSleep)
      setPrefMinimizeToTray(preferences.minimizeToTray)
      setPrefStartWithWindows(Boolean(preferences.startWithWindows))
      setPrefTimestampDefault(preferences.timestampCardDefault)
    }
  }, [preferences])

  // Filter recordings by tab
  const activeRecordings = useMemo(() => {
    return recordings.filter((r) => ['starting', 'recording', 'paused', 'reconnecting', 'finalizing'].includes(r.status))
  }, [recordings])

  const scheduledRecordings = useMemo(() => {
    return recordings.filter((r) => r.status === 'scheduled')
  }, [recordings])

  const completedRecordings = useMemo(() => {
    return recordings.filter((r) => ['completed', 'failed', 'missed', 'needs_attention', 'cancelled'].includes(r.status))
  }, [recordings])

  const handleOpenDiagnostics = async (rec: RecordingRecord) => {
    setDiagnosticsRecord(rec)
    if (window.api?.recording?.getDiagnostics) {
      try {
        const diag = await window.api.recording.getDiagnostics(rec.id)
        setDiagnosticsData(typeof diag === 'string' ? JSON.parse(diag) : diag)
      } catch {
        setDiagnosticsData(null)
      }
    }
  }

  const handleSavePrefs = async () => {
    await savePreferences({
      defaultFolder: prefFolder,
      filenamePattern: prefPattern,
      quality: prefQuality,
      paddingMinutes: prefPadding,
      preventSleep: prefPreventSleep,
      minimizeToTray: prefMinimizeToTray,
      startWithWindows: prefStartWithWindows,
      timestampCardDefault: prefTimestampDefault
    })
    pushToast({
      title: 'Preferences saved',
      variant: 'success'
    })
  }

  const handleSaveEditedEndTime = async () => {
    if (!editingScheduled) return
    const newEndMs = new Date(editEndTime).getTime()
    if (isNaN(newEndMs)) {
      pushToast({ title: 'Invalid date/time', variant: 'error' })
      return
    }
    if (window.api?.recording?.updateEndTime) {
      const res = await window.api.recording.updateEndTime(editingScheduled.id, newEndMs)
      if (res.ok) {
        pushToast({ title: 'End time updated', variant: 'success' })
        setEditingScheduled(null)
      } else {
        pushToast({ title: 'Validation error', description: res.error, variant: 'error' })
      }
    }
  }

  const handleSaveRename = async () => {
    if (!renamingRecord || !renameInput.trim()) return
    if (window.api?.recording?.rename) {
      const res = await window.api.recording.rename(renamingRecord.id, renameInput.trim())
      if (res.ok) {
        pushToast({ title: 'File renamed successfully', variant: 'success' })
        setRenamingRecord(null)
      } else {
        pushToast({ title: 'Rename failed', description: res.error, variant: 'error' })
      }
    }
  }

  const handleRecheckHardware = async () => {
    setProbing(true)
    try {
      await fetchCapability(true)
      pushToast({
        title: 'Hardware probe completed',
        variant: 'info'
      })
    } finally {
      setProbing(false)
    }
  }

  if (!isOpen) return null

  return (
    <>
      <Modal open={isOpen} onClose={onClose} className="w-full max-w-[800px] p-6 bg-[#0E0E11] border border-white/10 rounded-2xl shadow-2xl">
        <div className="flex flex-col gap-5 max-h-[85vh]">
          {/* Header & Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Recording Centre</h2>
              <p className="text-xs text-white/50">Manage active captures, scheduled timers, library, and settings</p>
            </div>

            {/* Tabs */}
            <div className="flex rounded-xl bg-white/5 p-1 border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('recording')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-lg transition-all',
                  activeTab === 'recording' ? 'bg-red-600 text-white shadow-sm' : 'text-white/70 hover:text-white'
                )}
              >
                <Radio className="h-3.5 w-3.5" />
                <span>Now Recording</span>
                {activeRecordings.length > 0 ? (
                  <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.2 text-[10px] font-bold">
                    {activeRecordings.length}
                  </span>
                ) : null}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('scheduled')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-lg transition-all',
                  activeTab === 'scheduled' ? 'bg-red-600 text-white shadow-sm' : 'text-white/70 hover:text-white'
                )}
              >
                <Clock className="h-3.5 w-3.5" />
                <span>Scheduled</span>
                {scheduledRecordings.length > 0 ? (
                  <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.2 text-[10px] font-bold">
                    {scheduledRecordings.length}
                  </span>
                ) : null}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('completed')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-lg transition-all',
                  activeTab === 'completed' ? 'bg-red-600 text-white shadow-sm' : 'text-white/70 hover:text-white'
                )}
              >
                <Film className="h-3.5 w-3.5" />
                <span>Library</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('preferences')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-lg transition-all',
                  activeTab === 'preferences' ? 'bg-red-600 text-white shadow-sm' : 'text-white/70 hover:text-white'
                )}
              >
                <Sliders className="h-3.5 w-3.5" />
                <span>Preferences</span>
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="overflow-y-auto pr-1 flex-1 min-h-[360px] max-h-[550px]">
            {/* 1. NOW RECORDING TAB */}
            {activeTab === 'recording' ? (
              <div className="space-y-3">
                {activeRecordings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center text-white/40">
                    <Radio className="h-10 w-10 stroke-[1.2] mb-3 text-white/20" />
                    <p className="text-sm font-medium">No active recordings</p>
                    <p className="text-xs text-white/30 mt-1">Start recording any clear channel while watching in the player</p>
                  </div>
                ) : (
                  activeRecordings.map((rec) => {
                    const stats = activeStats.find((s) => s.id === rec.id)
                    const isPaused = rec.status === 'paused'
                    const elapsed = stats?.elapsedSeconds ?? 0
                    const bytes = stats?.sizeBytes ?? rec.sizeBytes
                    const bitrate = stats?.bitrateKbps ?? 0
                    const parts = stats?.partCount ?? 1

                    return (
                      <div key={rec.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                          {rec.channelLogo ? (
                            <img src={rec.channelLogo} alt="" className="h-10 w-10 rounded-lg object-contain bg-black/40 p-1" />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-500 font-bold text-xs">
                              REC
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-semibold text-white">{rec.channelName}</h3>
                              <span
                                className={cn(
                                  'rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
                                  isPaused
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    : 'bg-red-600/20 text-red-300 border border-red-500/30'
                                )}
                              >
                                {rec.status}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-white/50 mt-1">
                              <span>Elapsed: <strong className="text-white/80">{formatDuration(elapsed)}</strong></span>
                              <span>Size: <strong className="text-white/80">{formatBytes(bytes)}</strong></span>
                              <span>Bitrate: <strong className="text-white/80">{bitrate} kbps</strong></span>
                              <span>Parts: <strong className="text-white/80">{parts}</strong></span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          {isPaused ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={<Play className="h-3.5 w-3.5 text-emerald-400 fill-current" />}
                              onClick={() => void resumeRecording(rec.id)}
                            >
                              Resume
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={<Pause className="h-3.5 w-3.5 text-amber-400" />}
                              onClick={() => void pauseRecording(rec.id)}
                            >
                              Pause
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<Square className="h-3.5 w-3.5 text-red-400 fill-current" />}
                            onClick={() => setConfirmEndId(rec.id)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          >
                            End Early
                          </Button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            ) : null}

            {/* 2. SCHEDULED TAB */}
            {activeTab === 'scheduled' ? (
              <div className="space-y-3">
                {scheduledRecordings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center text-white/40">
                    <Clock className="h-10 w-10 stroke-[1.2] mb-3 text-white/20" />
                    <p className="text-sm font-medium">No scheduled recordings</p>
                    <p className="text-xs text-white/30 mt-1">Schedule future programs from the player or channel guide</p>
                  </div>
                ) : (
                  scheduledRecordings.map((rec) => {
                    const start = new Date(rec.plannedStartUtc)
                    const end = new Date(rec.plannedEndUtc)
                    const diffMs = start.getTime() - Date.now()
                    const minsLeft = Math.max(0, Math.round(diffMs / 60000))

                    return (
                      <div key={rec.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                          {rec.channelLogo ? (
                            <img src={rec.channelLogo} alt="" className="h-10 w-10 rounded-lg object-contain bg-black/40 p-1" />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xs">
                              SCH
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-semibold text-white">{rec.channelName}</h3>
                              <span className="rounded-full bg-blue-500/15 border border-blue-500/30 px-2 py-0.5 text-[10px] font-semibold text-blue-300">
                                Starts in {minsLeft}m
                              </span>
                            </div>
                            <p className="text-xs text-white/50 mt-1">
                              {start.toLocaleDateString()} {start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – {end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} ({rec.quality} quality)
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<Edit3 className="h-3.5 w-3.5 text-white/70" />}
                            onClick={() => {
                              setEditingScheduled(rec)
                              setEditEndTime(new Date(rec.plannedEndUtc).toISOString().slice(0, 16))
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void cancelRecording(rec.id)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            ) : null}

            {/* 3. COMPLETED / LIBRARY TAB */}
            {activeTab === 'completed' ? (
              <div className="space-y-3">
                {completedRecordings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center text-white/40">
                    <Film className="h-10 w-10 stroke-[1.2] mb-3 text-white/20" />
                    <p className="text-sm font-medium">Library is empty</p>
                    <p className="text-xs text-white/30 mt-1">Completed recordings will appear here with thumbnails and details</p>
                  </div>
                ) : (
                  completedRecordings.map((rec) => {
                    const isOk = rec.status === 'completed'
                    const isNeedsAttention = rec.status === 'needs_attention'
                    const isFailed = rec.status === 'failed' || rec.status === 'missed'

                    return (
                      <div key={rec.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                          {rec.thumbnailPath ? (
                            <img src={`file://${rec.thumbnailPath}`} alt="" className="h-14 w-24 rounded-lg object-cover bg-black/60 border border-white/10" />
                          ) : (
                            <div className="h-14 w-24 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/30">
                              <Film className="h-6 w-6 stroke-[1.2]" />
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-semibold text-white">{rec.channelName}</h3>
                              <span
                                className={cn(
                                  'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                                  isOk
                                    ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                                    : isNeedsAttention
                                      ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
                                      : 'bg-red-500/15 border border-red-500/30 text-red-300'
                                )}
                              >
                                {rec.status}
                              </span>
                            </div>
                            <p className="text-xs text-white/50 mt-1">
                              {rec.filename} • {formatBytes(rec.sizeBytes)} • {formatDuration(rec.durationSeconds)}
                            </p>
                            {rec.failureReason ? (
                              <p className="text-[11px] text-amber-400/80 mt-0.5">{rec.failureReason}</p>
                            ) : null}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          {isNeedsAttention ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={<RefreshCw className="h-3.5 w-3.5 text-amber-400" />}
                              onClick={() => void retryFinalize(rec.id)}
                            >
                              Retry Finalize
                            </Button>
                          ) : null}

                          {isOk ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={<Play className="h-3.5 w-3.5 text-emerald-400 fill-current" />}
                              onClick={async () => {
                                if (window.api?.recording?.playFile) {
                                  const res = await window.api.recording.playFile(rec.id)
                                  if (!res.ok) {
                                    pushToast({ title: 'Cannot play file', description: res.error, variant: 'error' })
                                  }
                                }
                              }}
                              title="Play video"
                            />
                          ) : null}

                          {isOk ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={<Edit3 className="h-3.5 w-3.5 text-white/70" />}
                              onClick={() => {
                                setRenamingRecord(rec)
                                setRenameInput(rec.filename)
                              }}
                              title="Rename file"
                            />
                          ) : null}

                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<FolderOpen className="h-3.5 w-3.5 text-white/70" />}
                            onClick={() => void openFolder(rec.folder)}
                            title="Open folder"
                          />

                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<Info className="h-3.5 w-3.5 text-white/70" />}
                            onClick={() => void handleOpenDiagnostics(rec)}
                            title="Diagnostics"
                          />

                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<Trash2 className="h-3.5 w-3.5 text-red-400" />}
                            onClick={() => void deleteRecording(rec.id)}
                            title="Delete to Recycle Bin"
                            className="text-red-400 hover:bg-red-500/10"
                          />
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            ) : null}

            {/* 4. PREFERENCES TAB */}
            {activeTab === 'preferences' ? (
              <div className="space-y-5">
                {/* Default Folder */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-white/50">Default Recordings Directory</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={prefFolder}
                      onChange={(e) => setPrefFolder(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500 font-mono"
                    />
                    <Button variant="secondary" size="sm" onClick={() => void openFolder(prefFolder)}>
                      Open
                    </Button>
                  </div>
                </div>

                {/* Filename Pattern */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-white/50">Filename Pattern</label>
                  <input
                    type="text"
                    value={prefPattern}
                    onChange={(e) => setPrefPattern(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500 font-mono"
                  />
                  <p className="text-[11px] text-white/40">
                    Available tokens: <code className="text-white/60 font-mono">&#123;channel&#125;</code>, <code className="text-white/60 font-mono">&#123;date&#125;</code>, <code className="text-white/60 font-mono">&#123;time&#125;</code>, <code className="text-white/60 font-mono">&#123;quality&#125;</code>
                  </p>
                </div>

                {/* Quality & Padding */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-white/50">Default Quality</label>
                    <select
                      value={prefQuality}
                      onChange={(e) => setPrefQuality(e.target.value as any)}
                      className="w-full rounded-xl border border-white/10 bg-[#161619] px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                    >
                      <option value="highest">Highest Quality (Pristine 1080p copy)</option>
                      <option value="balanced">Balanced Quality (Lower bitrate 720p)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-white/50">Scheduled Padding (Minutes)</label>
                    <select
                      value={prefPadding}
                      onChange={(e) => setPrefPadding(Number(e.target.value))}
                      className="w-full rounded-xl border border-white/10 bg-[#161619] px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                    >
                      <option value={0}>0 minutes (Exact start & end)</option>
                      <option value={2}>2 minutes before & after</option>
                      <option value={5}>5 minutes before & after</option>
                      <option value={10}>10 minutes before & after</option>
                    </select>
                  </div>
                </div>

                {/* Toggles */}
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <p className="text-xs font-medium text-white">Prevent sleep while recording</p>
                      <p className="text-[11px] text-white/50">Keep PC awake so background recordings complete uninterrupted</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={prefPreventSleep}
                      onChange={(e) => setPrefPreventSleep(e.target.checked)}
                      className="accent-red-600 h-4 w-4"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <p className="text-xs font-medium text-white">Minimize to tray on window close</p>
                      <p className="text-[11px] text-white/50">Keep active & upcoming recordings alive in system tray</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={prefMinimizeToTray}
                      onChange={(e) => setPrefMinimizeToTray(e.target.checked)}
                      className="accent-red-600 h-4 w-4"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <p className="text-xs font-medium text-white">Start with Windows (minimized)</p>
                      <p className="text-[11px] text-white/50">Launch JioTV Max minimized to tray on system startup so scheduled recordings run</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={prefStartWithWindows}
                      onChange={(e) => setPrefStartWithWindows(e.target.checked)}
                      className="accent-red-600 h-4 w-4"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <p className="text-xs font-medium text-white">Timestamp overlay default</p>
                      <p className="text-[11px] text-white/50">Enable broadcast clock on newly scheduled recordings by default</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={prefTimestampDefault}
                      onChange={(e) => setPrefTimestampDefault(e.target.checked)}
                      disabled={capability?.tier === 'unavailable'}
                      className="accent-red-600 h-4 w-4"
                    />
                  </label>
                </div>

                {/* Hardware Capability Card */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-amber-400" />
                      <p className="text-xs font-semibold text-white">Hardware Encoder Status</p>
                    </div>
                    <p className="text-xs text-white/60 mt-1">
                      Detected: <strong className="text-white/90">{capability?.hardwareSummary || 'Probing...'}</strong>
                      {' • '}
                      Tier: <span className="font-semibold text-emerald-400 uppercase">{capability?.tier || 'Probing'}</span>
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<RefreshCw className={cn('h-3.5 w-3.5', probing && 'animate-spin')} />}
                    disabled={probing}
                    onClick={handleRecheckHardware}
                  >
                    Re-check
                  </Button>
                </div>

                <div className="flex justify-end pt-2">
                  <Button variant="primary" size="sm" onClick={handleSavePrefs} className="bg-red-600 hover:bg-red-500 text-white">
                    Save Preferences
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </Modal>

      {/* Confirmation Modal for Ending Recording Early */}
      {confirmEndId ? (
        <Modal open={true} onClose={() => setConfirmEndId(null)} className="w-full max-w-[420px] p-6 bg-[#141417] border border-white/10 rounded-2xl shadow-2xl">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-white">End Recording Early?</h3>
                <p className="text-xs text-white/60">The recording up to this point will be finalized and saved.</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-3">
              <Button variant="secondary" size="sm" onClick={() => setConfirmEndId(null)}>
                Continue Recording
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  void stopRecording(confirmEndId)
                  setConfirmEndId(null)
                }}
                className="bg-red-600 hover:bg-red-500 text-white"
              >
                End & Save
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {/* Diagnostics Modal */}
      {diagnosticsRecord ? (
        <Modal open={true} onClose={() => setDiagnosticsRecord(null)} className="w-full max-w-[650px] p-6 bg-[#121215] border border-white/10 rounded-2xl shadow-2xl">
          <div className="space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Diagnostics & Events</h3>
                <p className="text-xs text-white/50">{diagnosticsRecord.channelName} • {diagnosticsRecord.id}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setDiagnosticsRecord(null)}>
                Close
              </Button>
            </div>

            {/* Parts list */}
            <div>
              <h4 className="text-xs font-semibold uppercase text-white/50 mb-2">Recorded Parts</h4>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1.5 text-xs font-mono">
                {diagnosticsData?.parts && diagnosticsData.parts.length > 0 ? (
                  diagnosticsData.parts.map((p: any) => (
                    <div key={p.partIndex} className="flex justify-between text-white/80">
                      <span>Part #{p.partIndex} ({p.mode})</span>
                      <span>
                        {formatBytes(p.bytes ?? p.sizeBytes ?? 0)}
                        {p.startUtc ? ` • ${new Date(p.startUtc).toLocaleTimeString()}` : p.startTime ? ` • ${p.startTime}` : ''}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-white/40 italic">No parts recorded</p>
                )}
              </div>
            </div>

            {/* Events list */}
            <div>
              <h4 className="text-xs font-semibold uppercase text-white/50 mb-2">Event Timeline</h4>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2 text-xs">
                {diagnosticsData?.events && diagnosticsData.events.length > 0 ? (
                  diagnosticsData.events.map((ev: any, idx: number) => (
                    <div key={idx} className="border-b border-white/5 pb-1.5 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between text-[11px] text-white/40">
                        <span className="font-semibold text-white/70 uppercase">{ev.type}</span>
                        <span>{new Date(ev.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-white/80 mt-0.5">{ev.message}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-white/40 italic">No events logged</p>
                )}
              </div>
            </div>
          </div>
        </Modal>
      ) : null}

      {/* Edit Scheduled End Time Modal */}
      {editingScheduled ? (
        <Modal open={true} onClose={() => setEditingScheduled(null)} className="w-full max-w-[420px] p-6 bg-[#141417] border border-white/10 rounded-2xl shadow-2xl">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Edit End Time</h3>
              <p className="text-xs text-white/50">{editingScheduled.channelName} • Start: {new Date(editingScheduled.plannedStartUtc).toLocaleTimeString()}</p>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-white/50">New End Time</label>
              <input
                type="datetime-local"
                value={editEndTime}
                onChange={(e) => setEditEndTime(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
              <Button variant="secondary" size="sm" onClick={() => setEditingScheduled(null)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSaveEditedEndTime} className="bg-red-600 hover:bg-red-500 text-white">
                Save End Time
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {/* Rename File Modal */}
      {renamingRecord ? (
        <Modal open={true} onClose={() => setRenamingRecord(null)} className="w-full max-w-[440px] p-6 bg-[#141417] border border-white/10 rounded-2xl shadow-2xl">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Rename Recording</h3>
              <p className="text-xs text-white/50">{renamingRecord.channelName}</p>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-white/50">Filename</label>
              <input
                type="text"
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500 font-mono"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
              <Button variant="secondary" size="sm" onClick={() => setRenamingRecord(null)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSaveRename} className="bg-red-600 hover:bg-red-500 text-white">
                Rename File
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  )
}
