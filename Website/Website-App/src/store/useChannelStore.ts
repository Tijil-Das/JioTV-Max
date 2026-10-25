import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Channel, AuthMode, Program } from '@shared/types'
import { channelService } from '@/services/channelService'
import { epgService } from '@/services/epgService'
import { buildMockEpg } from '@/mocks/epg'
import { mockChannels } from '@/mocks/channels'
import { safeLocalStorage } from '@/lib/safeStorage'

export interface RecentChannel {
  channelId: string
  progress: number
  watchedAt: string
  /** Optional real session length in minutes (older persisted rows omit it). */
  minutes?: number
}

interface ChannelState {
  channels: Channel[]
  epg: Record<string, Program[]>
  source: 'demo' | 'jio'
  loading: boolean
  error: string | null
  fetchedAt: string | null
  favorites: string[]
  recents: RecentChannel[]
  setChannels: (channels: Channel[], source: 'demo' | 'jio', epg?: Record<string, Program[]>) => void
  fetchCatalogue: (mode: AuthMode, force?: boolean) => Promise<void>
  hydrateEpg: (mode: AuthMode) => Promise<void>
  loadEpgForChannel: (channel: Channel, mode: AuthMode) => Promise<void>
  toggleFavorite: (channelId: string) => void
  clearFavorites: () => void
  recordRecent: (channelId: string, progress?: number, minutes?: number) => void
  clearRecents: () => void
}

export const useChannelStore = create<ChannelState>()(
  persist(
    (set, get) => ({
      channels: [],
      epg: {},
      source: 'demo',
      loading: false,
      error: null,
      fetchedAt: null,
      favorites: [],
      // Real watch history only — never seed fabricated sessions.
      recents: [],

      setChannels: (channels, source, epg) =>
        set({
          channels,
          source,
          epg: epg ?? epgService.initialEpg(channels, source),
          fetchedAt: new Date().toISOString(),
          error: null
        }),

      fetchCatalogue: async (mode, force = false) => {
        const state = get()
        const fresh =
          state.fetchedAt && Date.now() - Date.parse(state.fetchedAt) < 5 * 60_000
        if (!force && fresh && state.channels.length > 0) return
        set({ loading: true, error: null })
        try {
          const payload = await channelService.loadCatalogue(mode)
          const epg = payload.source === 'demo' ? buildMockEpg(payload.channels) : {}
          for (const [channelId, programs] of Object.entries(epg)) {
            epgService.setCached(channelId, programs)
          }
          set({
            channels: payload.channels,
            epg,
            source: payload.source,
            fetchedAt: payload.fetchedAt,
            loading: false,
            error: null
          })
          if (payload.source === 'jio') {
            void get().hydrateEpg(mode)
          }
        } catch (error) {
          // Keep the app usable: if the live Jio catalogue cannot be reached,
          // fall back to the demo catalogue and surface a non-blocking error.
          const fallback = mockChannels
          const fallbackEpg = buildMockEpg(fallback)
          set({
            channels: fallback.length ? fallback : get().channels,
            epg: fallback.length ? fallbackEpg : get().epg,
            source: 'demo',
            loading: false,
            error: error instanceof Error ? error.message : 'Could not load channels.'
          })
        }
      },

      hydrateEpg: async (mode) => {
        const channels = get().channels.slice(0, 40)
        for (const channel of channels) {
          if (!get().epg[channel.id]) {
            const programs = await epgService.hydrate(channel, mode)
            if (programs && programs.length > 0) {
              set((state) => ({ epg: { ...state.epg, [channel.id]: programs } }))
            }
          }
        }
      },

      loadEpgForChannel: async (channel, mode) => {
        const currentEpg = get().epg[channel.id]
        if (currentEpg && currentEpg.length > 0) return
        const programs = await epgService.hydrate(channel, mode)
        if (programs && programs.length > 0) {
          set((state) => ({ epg: { ...state.epg, [channel.id]: programs } }))
        }
      },

      toggleFavorite: () => {},

      clearFavorites: () => set({ favorites: [] }),

      recordRecent: (channelId, progress = 0, minutes) =>
        set((state) => {
          const existing = state.recents.find((recent) => recent.channelId === channelId)
          return {
            recents: [
              {
                channelId,
                progress,
                watchedAt: new Date().toISOString(),
                minutes: minutes ?? existing?.minutes
              },
              ...state.recents.filter((recent) => recent.channelId !== channelId)
            ].slice(0, 12)
          }
        }),

      clearRecents: () => set({ recents: [] })
    }),
    {
      name: 'streamdeck-library',
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({ favorites: state.favorites, recents: state.recents })
    }
  )
)

/** Selector helpers, kept outside components to avoid re-subscribing closures. */
export const selectChannel =
  (id: string | undefined) =>
  (state: ChannelState): Channel | undefined =>
    id ? state.channels.find((channel) => channel.id === id) : undefined
