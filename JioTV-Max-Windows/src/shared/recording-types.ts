export type RecordingStatus =
  | 'scheduled'
  | 'starting'
  | 'recording'
  | 'paused'
  | 'finalizing'
  | 'completed'
  | 'reconnecting'
  | 'missed'
  | 'failed'
  | 'cancelled'
  | 'needs_attention'

export type CaptureMode = 'stream-copy' | 'surface-capture' | 'decryption-key'

export interface OverlaySettings {
  enabled: boolean
  format: '12h' | '24h'
  showDate: boolean
  size: 'small' | 'medium' | 'large'
  opacity: number // 0.1 to 1.0
  xPercent: number // 0 to 100
  yPercent: number // 0 to 100
}

export interface RecordingRecord {
  id: string
  accountId: string
  channelId: string
  channelName: string
  channelLogo?: string
  status: RecordingStatus
  plannedStartUtc: string
  plannedEndUtc: string
  actualStartUtc?: string
  actualEndUtc?: string
  paddingMinutes: number
  quality: 'highest' | 'balanced'
  resolution?: string
  bitrate?: number
  folder: string
  isDefaultFolder: boolean
  filename: string
  finalPath?: string
  tempConflictName?: string
  sizeBytes: number
  durationSeconds: number
  overlaySettings?: string // JSON of OverlaySettings
  overlayApplied: boolean
  isPartial: boolean
  partialReasons?: string // JSON array of string
  notified: boolean
  missedReason?: string
  failureReason?: string
  createdAt: string
  updatedAt: string
  /** DRM/Widevine channel flag. When true, stream-copy (-c copy) records encrypted chunks. */
  isDrm?: boolean
  /** Capture mode: 'stream-copy' (clear HLS), 'surface-capture' (desktop player capture), 'decryption-key' (ffmpeg -cenc_decryption_key). */
  captureMode?: CaptureMode
  /** Widevine KID:KEY hex string (e.g. "16-byte-hex-kid:16-byte-hex-key") for decryption-key mode. */
  drmKey?: string
}

export interface RecordingPart {
  id?: number
  recordingId: string
  partIndex: number
  path: string
  startUtc: string
  endUtc?: string
  bytes: number
  mode: 'copy' | 'encode' | 'surface' | 'key'
}

export interface RecordingEvent {
  id?: number
  recordingId: string
  type: 'transition' | 'pause' | 'resume' | 'gap' | 'error' | 'restart' | 'recovery'
  fromStatus?: string
  toStatus?: string
  message: string
  metadata?: string
  timestamp: string
}

export interface ConflictRecord {
  id: string
  recordingId: string
  type: 'existing_file' | 'duplicate_schedule' | 'file_locked' | 'folder_unavailable'
  targetPath: string
  status: 'pending' | 'resolved'
  decision?: 'keep_both' | 'rename' | 'replace' | 'append' | 'decide_later'
  suggestedName?: string
  resolvedAt?: string
  createdAt: string
}

export type NotificationType =
  | 'started'
  | 'finished'
  | 'partial'
  | 'failed'
  | 'missed'
  | 'recovered'
  | 'conflict'
  | 'disk_low'
  | 'overlay_fallback'
  | 'buffering_hint'

export interface NotificationRecord {
  id: string
  type: NotificationType
  title: string
  message: string
  payload?: string // JSON metadata
  dedupeKey?: string
  isRead: boolean
  isActed: boolean
  actionData?: string
  createdAt: string
}

export type CapabilityTier = 'full' | 'limited' | 'unavailable'

export interface CapabilityProbeResult {
  fingerprint: string
  cpuModel: string
  cores: number
  ramBytes: number
  gpuModel: string
  encoders: string[] // 'h264_nvenc' | 'h264_qsv' | 'h264_amf'
  benchmarkFps: number
  benchmarkSpeed: number // e.g. 3.4x
  tier: CapabilityTier
  reason?: string
  testedAt: string
}

export interface RecordingPreferences {
  defaultFolder: string
  filenamePattern: string
  quality: 'highest' | 'balanced'
  paddingMinutes: number
  preventSleep: boolean
  minimizeToTray: boolean
  startWithWindows: boolean
  timestampCardDefault: boolean
  timestampCardOptions: OverlaySettings
}

export interface ValidationIssue {
  field: 'channel' | 'from' | 'to' | 'concurrency' | 'file' | 'name'
  level: 'error' | 'warning'
  message: string
  suggestedFix?: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
  diskEstimateBytes: number
  endsTomorrowText?: string
}

export interface ActiveRecordingStats {
  id: string
  elapsedSeconds: number
  sizeBytes: number
  bitrateKbps: number
  status: RecordingStatus
  channelName: string
  partCount: number
}
