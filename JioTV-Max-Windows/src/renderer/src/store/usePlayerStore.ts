import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { PlaybackType } from '@shared/types'
import type { QualityPreference } from './useSettingsStore'

interface PlayerState {
  currentChannelId: string | null
  isPlaying: boolean
  volume: number
  muted: boolean
  quality: QualityPreference
  isFullscreen: boolean
  controlsVisible: boolean
  isMiniPlayer: boolean
  isBuffering: boolean
  error: string | null
  engine: PlaybackType | null
  setCurrentChannel: (id: string | null) => void
  setPlaying: (playing: boolean) => void
  setVolume: (volume: number) => void
  setMuted: (muted: boolean) => void
  toggleMuted: () => void
  setQuality: (quality: QualityPreference) => void
  setFullscreen: (value: boolean) => void
  setMiniPlayer: (value: boolean) => void
  setControlsVisible: (value: boolean) => void
  setBuffering: (value: boolean) => void
  setError: (message: string | null) => void
  setEngine: (engine: PlaybackType | null) => void
  reset: () => void
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      currentChannelId: null,
      isPlaying: false,
      volume: 0.8,
      muted: false,
      quality: 1080,
      isFullscreen: false,
      isMiniPlayer: false,
      controlsVisible: true,
      isBuffering: false,
      error: null,
      engine: null,
      setCurrentChannel: (currentChannelId) => set({ currentChannelId }),
      setPlaying: (isPlaying) => set({ isPlaying }),
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)), muted: false }),
      setMuted: (muted) => set({ muted }),
      toggleMuted: () => set({ muted: !get().muted }),
      setQuality: (quality) => set({ quality }),
      setFullscreen: (isFullscreen) => set({ isFullscreen }),
      setMiniPlayer: (isMiniPlayer) => set({ isMiniPlayer }),
      setControlsVisible: (controlsVisible) => set({ controlsVisible }),
      setBuffering: (isBuffering) => set({ isBuffering }),
      setError: (error) => set({ error }),
      setEngine: (engine) => set({ engine }),
      reset: () =>
        set({
          currentChannelId: null,
          isPlaying: false,
          isMiniPlayer: false,
          controlsVisible: true,
          isBuffering: false,
          error: null,
          engine: null
        })
    }),
    {
      name: 'streamdeck-player',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        volume: state.volume,
        muted: state.muted,
        quality: state.quality
      })
    }
  )
)
