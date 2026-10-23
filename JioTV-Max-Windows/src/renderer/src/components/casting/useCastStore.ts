import { create } from 'zustand'
import type {
  CastDevice,
  CastStatePayload,
  CastErrorPayload,
  CastMediaInput,
  FallbackReceiverInfo,
  CastDiagnostics
} from '@shared/cast-types'

interface CastStore {
  isAvailable: boolean
  dialogOpen: boolean
  fallbackModalOpen: boolean
  helpOpen: boolean
  devices: CastDevice[]
  activeState: CastStatePayload
  isSearching: boolean
  searchStartTime: number
  lastError: CastErrorPayload | null
  fallbackInfo: FallbackReceiverInfo | null
  connectingDeviceId: string | null

  // Actions
  setDialogOpen: (open: boolean) => void
  setFallbackModalOpen: (open: boolean) => void
  setHelpOpen: (open: boolean) => void
  startDiscovery: () => Promise<void>
  stopDiscovery: () => Promise<void>
  startCast: (deviceId: string, media: CastMediaInput) => Promise<boolean>
  cancelConnecting: () => Promise<void>
  stopCast: () => Promise<boolean>
  pause: () => Promise<boolean>
  resume: () => Promise<boolean>
  seek: (seconds: number) => Promise<boolean>
  setVolume: (level: number) => Promise<boolean>
  setMuted: (muted: boolean) => Promise<boolean>
  fetchDiagnostics: () => Promise<CastDiagnostics | null>
  generateFallbackInfo: (media: CastMediaInput) => Promise<FallbackReceiverInfo | null>
  clearError: () => void
}

const DEFAULT_STATE: CastStatePayload = {
  state: 'idle',
  substate: 'idle',
  device: null,
  media: null,
  error: null,
  position: 0,
  duration: undefined,
  volume: 1,
  muted: false
}

export const useCastStore = create<CastStore>((set, get) => {
  // Casting feature temporarily disabled - listeners commented out
  // if (typeof window !== 'undefined' && window.castApi) {
  //   window.castApi.onDevicesUpdated((devices) => {
  //     set({ devices })
  //   })
  //
  //   window.castApi.onStateChanged((state) => {
  //     set({
  //       activeState: state,
  //       connectingDeviceId: state.state === 'connecting' || state.state === 'loading' ? state.device?.id ?? null : null
  //     })
  //   })
  //
  //   window.castApi.onError((err) => {
  //     set({
  //       lastError: err,
  //       connectingDeviceId: null
  //     })
  //   })
  //
  //   // Fetch initial state
  //   window.castApi.getState().then((state) => {
  //     if (state) set({ activeState: state })
  //   }).catch(() => {})
  // }

  return {
    isAvailable: false,
    dialogOpen: false,
    fallbackModalOpen: false,
    helpOpen: false,
    devices: [],
    activeState: DEFAULT_STATE,
    isSearching: false,
    searchStartTime: 0,
    lastError: null,
    fallbackInfo: null,
    connectingDeviceId: null,

    setDialogOpen: (open) => {
      set({ dialogOpen: open })
      if (open) {
        set({ lastError: null, helpOpen: false })
        if (window.castApi) {
          window.castApi.getDevices().then((cached) => {
            if (cached && cached.length > 0) {
              set({ devices: cached })
            }
          }).catch(() => {})
        }
        void get().startDiscovery()
      } else {
        // Stop discovery after dialog closes, unless actively casting
        const active = get().activeState.state
        if (active !== 'casting' && active !== 'connecting' && active !== 'loading') {
          setTimeout(() => {
            if (!get().dialogOpen) {
              void get().stopDiscovery()
            }
          }, 3000)
        }
      }
    },

    setFallbackModalOpen: (open) => set({ fallbackModalOpen: open }),
    setHelpOpen: (open) => set({ helpOpen: open }),

    startDiscovery: async () => {
      if (!window.castApi) return
      set({ isSearching: true, searchStartTime: Date.now() })
      try {
        const cached = await window.castApi.getDevices()
        if (cached && cached.length > 0) {
          set({ devices: cached })
        }
        await window.castApi.startDiscovery()
        const refreshed = await window.castApi.getDevices()
        set({ devices: refreshed })
      } catch (err) {
        console.error('startDiscovery error:', err)
      }
    },

    stopDiscovery: async () => {
      if (!window.castApi) return
      set({ isSearching: false })
      try {
        await window.castApi.stopDiscovery()
      } catch (err) {
        console.error('stopDiscovery error:', err)
      }
    },

    startCast: async (deviceId, media) => {
      if (!window.castApi) return false
      set({
        connectingDeviceId: deviceId,
        lastError: null
      })
      try {
        const success = await window.castApi.start({ deviceId, media })
        if (!success) {
          set({ connectingDeviceId: null })
        }
        return success
      } catch (err) {
        set({ connectingDeviceId: null })
        return false
      }
    },

    cancelConnecting: async () => {
      set({ connectingDeviceId: null })
      if (!window.castApi) return
      await window.castApi.stop()
    },

    stopCast: async () => {
      if (!window.castApi) return false
      set({ connectingDeviceId: null })
      return window.castApi.stop()
    },

    pause: async () => {
      if (!window.castApi) return false
      return window.castApi.pause()
    },

    resume: async () => {
      if (!window.castApi) return false
      return window.castApi.resume()
    },

    seek: async (seconds) => {
      if (!window.castApi) return false
      return window.castApi.seek(seconds)
    },

    setVolume: async (level) => {
      if (!window.castApi) return false
      return window.castApi.setVolume(level)
    },

    setMuted: async (muted) => {
      if (!window.castApi) return false
      return window.castApi.setMuted(muted)
    },

    fetchDiagnostics: async () => {
      if (!window.castApi) return null
      try {
        return await window.castApi.getDiagnostics()
      } catch {
        return null
      }
    },

    generateFallbackInfo: async (media) => {
      if (!window.castApi) return null
      try {
        const info = await window.castApi.getFallbackInfo(media)
        set({ fallbackInfo: info })
        return info
      } catch {
        return null
      }
    },

    clearError: () => set({ lastError: null })
  }
})
