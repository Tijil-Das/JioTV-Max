import { create } from 'zustand'
import type {
  RecordingRecord,
  ActiveRecordingStats,
  NotificationRecord,
  RecordingPreferences,
  CapabilityProbeResult
} from '@shared/recording-types'
import type { Channel } from '@shared/types'

interface RecordingStoreState {
  recordings: RecordingRecord[]
  activeStats: ActiveRecordingStats[]
  notifications: NotificationRecord[]
  unreadNotificationsCount: number
  preferences: RecordingPreferences | null
  capability: CapabilityProbeResult | null
  isCentreOpen: boolean
  activeTab: 'recording' | 'scheduled' | 'completed' | 'preferences'
  isRecordDialogOpen: boolean
  dialogChannel: Channel | null
  desktopCaptureSources: Array<{ id: string; name: string; thumbnail: string }>
  isDesktopCapturing: boolean

  // Actions
  openRecordDialog: (channel: Channel) => void
  closeRecordDialog: () => void
  openRecordingCentre: (tab?: 'recording' | 'scheduled' | 'completed' | 'preferences') => void
  closeRecordingCentre: () => void
  setActiveTab: (tab: 'recording' | 'scheduled' | 'completed' | 'preferences') => void

  fetchRecordings: () => Promise<void>
  fetchActiveStats: () => Promise<void>
  fetchNotifications: () => Promise<void>
  fetchPreferences: () => Promise<void>
  fetchCapability: (forceRecheck?: boolean) => Promise<void>
  savePreferences: (prefs: Partial<RecordingPreferences>) => Promise<void>
  fetchDesktopCaptureSources: () => Promise<void>

  markNotificationRead: (id?: string) => Promise<void>
  markNotificationActed: (id: string) => Promise<void>

  pauseRecording: (id: string) => Promise<boolean>
  resumeRecording: (id: string) => Promise<boolean>
  stopRecording: (id: string) => Promise<boolean>
  cancelRecording: (id: string) => Promise<boolean>
  deleteRecording: (id: string) => Promise<boolean>
  retryFinalize: (id: string) => Promise<boolean>
  resolveConflict: (conflictId: string, decision: 'cancel' | 'trim_first' | 'trim_second' | 'keep_both') => Promise<void>
  openFolder: (folder?: string) => Promise<boolean>
  pauseAll: () => Promise<void>

  // Desktop capture (DRM surface capture)
  sendDesktopChunk: (recordingId: string, chunk: ArrayBuffer) => void
  startDesktopCapture: (callback: (data: { recordingId: string; channelId: string; channelName: string }) => void) => () => void
  stopDesktopCapture: (callback: (data: { recordingId: string }) => void) => () => void
  pauseDesktopCapture: (callback: (data: { recordingId: string }) => void) => () => void
  resumeDesktopCapture: (callback: (data: { recordingId: string }) => void) => () => void
}

let isInitialized = false
let activeStatsInterval: any = null

export const useRecordingStore = create<RecordingStoreState>((set, get) => ({
  recordings: [],
  activeStats: [],
  notifications: [],
  unreadNotificationsCount: 0,
  preferences: null,
  capability: null,
  isCentreOpen: false,
  activeTab: 'recording',
  isRecordDialogOpen: false,
  dialogChannel: null,
  desktopCaptureSources: [],
  isDesktopCapturing: false,

  openRecordDialog: (channel) => set({ isRecordDialogOpen: true, dialogChannel: channel }),
  closeRecordDialog: () => set({ isRecordDialogOpen: false, dialogChannel: null }),
  openRecordingCentre: (tab = 'recording') => set({ isCentreOpen: true, activeTab: tab }),
  closeRecordingCentre: () => set({ isCentreOpen: false }),
  setActiveTab: (activeTab) => set({ activeTab }),

  fetchRecordings: async () => {
    if (!window.api?.recording?.getAll) return
    try {
      const recordings = await window.api.recording.getAll()
      set({ recordings })
    } catch {}
  },

  fetchActiveStats: async () => {
    if (!window.api?.recording?.getActive) return
    try {
      const activeStats = await window.api.recording.getActive()
      set({ activeStats })
    } catch {}
  },

  fetchNotifications: async () => {
    if (!window.api?.recording?.getNotifications) return
    try {
      const notifications = await window.api.recording.getNotifications(50)
      const unreadNotificationsCount = notifications.filter((n: NotificationRecord) => !n.isRead).length
      set({ notifications, unreadNotificationsCount })
    } catch {}
  },

  fetchPreferences: async () => {
    if (!window.api?.recording?.getPreferences) return
    try {
      const preferences = await window.api.recording.getPreferences()
      set({ preferences })
    } catch {}
  },

  fetchCapability: async (forceRecheck = false) => {
    if (!window.api?.recording?.probeCapabilities) return
    try {
      const capability = await window.api.recording.probeCapabilities(forceRecheck)
      set({ capability })
    } catch {}
  },

  savePreferences: async (prefs) => {
    if (!window.api?.recording?.savePreferences) return
    try {
      const updated = await window.api.recording.savePreferences(prefs)
      set({ preferences: updated })
    } catch {}
  },

  fetchDesktopCaptureSources: async () => {
    if (!window.api?.desktopCapture?.getSources) return
    try {
      const sources = await window.api.desktopCapture.getSources()
      set({ desktopCaptureSources: sources })
    } catch {}
  },

  markNotificationRead: async (id) => {
    if (!window.api?.recording?.markNotificationRead) return
    await window.api.recording.markNotificationRead(id)
    void get().fetchNotifications()
  },

  markNotificationActed: async (id) => {
    if (!window.api?.recording?.markNotificationActed) return
    await window.api.recording.markNotificationActed(id)
    void get().fetchNotifications()
  },

  pauseRecording: async (id) => {
    if (!window.api?.recording?.pause) return false
    const res = await window.api.recording.pause(id)
    void get().fetchRecordings()
    void get().fetchActiveStats()
    return res
  },

  resumeRecording: async (id) => {
    if (!window.api?.recording?.resume) return false
    const res = await window.api.recording.resume(id)
    void get().fetchRecordings()
    void get().fetchActiveStats()
    return res
  },

  stopRecording: async (id) => {
    if (!window.api?.recording?.stop) return false
    const res = await window.api.recording.stop(id)
    void get().fetchRecordings()
    void get().fetchActiveStats()
    return res
  },

  cancelRecording: async (id) => {
    if (!window.api?.recording?.cancel) return false
    const res = await window.api.recording.cancel(id)
    void get().fetchRecordings()
    void get().fetchActiveStats()
    return res
  },

  deleteRecording: async (id) => {
    if (!window.api?.recording?.delete) return false
    const res = await window.api.recording.delete(id)
    void get().fetchRecordings()
    return res
  },

  retryFinalize: async (id) => {
    if (!window.api?.recording?.retryFinalize) return false
    const res = await window.api.recording.retryFinalize(id)
    void get().fetchRecordings()
    return res
  },

  resolveConflict: async (conflictId, decision) => {
    if (!window.api?.recording?.resolveConflict) return
    await window.api.recording.resolveConflict(conflictId, decision)
    void get().fetchRecordings()
    void get().fetchNotifications()
  },

  openFolder: async (folder) => {
    if (!window.api?.recording?.openFolder) return false
    return window.api.recording.openFolder(folder)
  },

  pauseAll: async () => {
    if (!window.api?.recording?.pauseAll) return
    await window.api.recording.pauseAll()
    void get().fetchRecordings()
    void get().fetchActiveStats()
  },

  sendDesktopChunk: (recordingId, chunk) => {
    if (!window.api?.desktopCapture?.sendChunk) return
    window.api.desktopCapture.sendChunk(recordingId, chunk)
  },

  startDesktopCapture: (callback) => {
    if (!window.api?.desktopCapture?.onStart) return () => {}
    set({ isDesktopCapturing: true })
    const off = window.api.desktopCapture.onStart((data) => {
      set({ isDesktopCapturing: true })
      callback(data)
    })
    return off
  },

  stopDesktopCapture: (callback) => {
    if (!window.api?.desktopCapture?.onStop) return () => {}
    set({ isDesktopCapturing: false })
    const off = window.api.desktopCapture.onStop((data) => {
      set({ isDesktopCapturing: false })
      callback(data)
    })
    return off
  },

  pauseDesktopCapture: (callback) => {
    if (!window.api?.desktopCapture?.onPause) return () => {}
    const off = window.api.desktopCapture.onPause(callback)
    return off
  },

  resumeDesktopCapture: (callback) => {
    if (!window.api?.desktopCapture?.onResume) return () => {}
    const off = window.api.desktopCapture.onResume(callback)
    return off
  }
}))

export function initRecordingSubscriptions(): () => void {
  if (isInitialized || typeof window === 'undefined' || !window.api?.recording) {
    return () => {}
  }
  isInitialized = true

  const store = useRecordingStore.getState()
  void store.fetchRecordings()
  void store.fetchActiveStats()
  void store.fetchNotifications()
  void store.fetchPreferences()
  void store.fetchCapability()
  void store.fetchDesktopCaptureSources()

  const offRecordings = window.api.recording.onRecordingsChanged(() => {
    void store.fetchRecordings()
    void store.fetchActiveStats()
  })

  const offNotifications = window.api.recording.onNotificationsChanged((data) => {
    useRecordingStore.setState({
      notifications: data.notifications,
      unreadNotificationsCount: data.unreadCount
    })
  })

  // Poll active stats every second if any recordings are active
  if (!activeStatsInterval) {
    activeStatsInterval = setInterval(() => {
      const activeCount = useRecordingStore.getState().recordings.filter(
        (r) => ['starting', 'recording', 'paused', 'reconnecting'].includes(r.status)
      ).length
      if (activeCount > 0) {
        void useRecordingStore.getState().fetchActiveStats()
      }
    }, 1000)
  }

  return () => {
    offRecordings?.()
    offNotifications?.()
    if (activeStatsInterval) {
      clearInterval(activeStatsInterval)
      activeStatsInterval = null
    }
    isInitialized = false
  }
}
