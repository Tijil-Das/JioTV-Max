import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AuthMode } from '@shared/types'

export type QualityPreference = 'auto' | number

interface SettingsState {
  /** demo = local catalogue + sample streams; jio = real account. */
  mode: AuthMode
  defaultQuality: QualityPreference
  language: string
  reduceMotion: boolean
  autoplay: boolean
  /** Play muted live previews on the Home hero (Addendum 3 §8). Default on. */
  livePreviewOnHome: boolean
  /** Show the featured channel hero section on Home. Default on. */
  showHero: boolean
  alwaysOnTop: boolean
  parentalEnabled: boolean
  parentalPinHash: string
  recentSearches: string[]
  setMode: (mode: AuthMode) => void
  setDefaultQuality: (quality: QualityPreference) => void
  setLanguage: (language: string) => void
  setReduceMotion: (value: boolean) => void
  setAutoplay: (value: boolean) => void
  setLivePreviewOnHome: (value: boolean) => void
  setShowHero: (value: boolean) => void
  setAlwaysOnTop: (value: boolean) => void
  setParental: (enabled: boolean, hash?: string) => void
  addRecentSearch: (term: string) => void
  clearRecentSearches: () => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      mode: 'jio',
      defaultQuality: 1080,
      language: 'English',
      reduceMotion: false,
      autoplay: true,
      livePreviewOnHome: true,
      showHero: true,
      alwaysOnTop: false,
      parentalEnabled: false,
      parentalPinHash: '',
      recentSearches: [],
      setMode: (mode) => set({ mode }),
      setDefaultQuality: (defaultQuality) => set({ defaultQuality }),
      setLanguage: (language) => set({ language }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      setAutoplay: (autoplay) => set({ autoplay }),
      setLivePreviewOnHome: (livePreviewOnHome) => set({ livePreviewOnHome }),
      setShowHero: (showHero) => set({ showHero }),
      setAlwaysOnTop: (alwaysOnTop) => set({ alwaysOnTop }),
      setParental: (parentalEnabled, parentalPinHash) =>
        set((state) => ({
          parentalEnabled,
          parentalPinHash: parentalPinHash ?? state.parentalPinHash
        })),
      addRecentSearch: (term) =>
        set((state) => ({
          recentSearches: [term, ...state.recentSearches.filter((item) => item !== term)].slice(0, 6)
        })),
      clearRecentSearches: () => set({ recentSearches: [] })
    }),
    {
      name: 'streamdeck-settings',
      storage: createJSONStorage(() => localStorage)
    }
  )
)
