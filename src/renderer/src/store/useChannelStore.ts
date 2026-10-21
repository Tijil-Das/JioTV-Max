import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Channel, AuthMode, Program } from '@shared/types'
import { channelService } from '@/services/channelService'
import { epgService } from '@/services/epgService'
import { buildFallbackEpg, buildMockEpg } from '@/mocks/epg'
import { mockChannels } from '@/mocks/channels'

export interface RecentChannel {
  channelId: string
  progress: number
  watchedAt: string
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
  recordRecent: (channelId: string, progress?: number) => void
  seedRecentsIfEmpty: () => void
  clearRecents: () => void
}

const initialRecents: RecentChannel[] = [
  { channelId: 'ch-109', progress: 0.36, watchedAt: new Date(Date.now() - 1000 * 60 * 24).toISOString() },
  { channelId: 'ch-115', progress: 0.71, watchedAt: new Date(Date.now() - 1000 * 60 * 78).toISOString() },
  { channelId: 'ch-133', progress: 0.48, watchedAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString() }
]

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
      recents: initialRecents,

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
          const epg =
            payload.source === 'demo'
              ? buildMockEpg(payload.channels)
              : buildFallbackEpg(payload.channels)
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
        const channels = get().channels
        for (const channel of channels) {
          if (mode === 'demo' && !get().epg[channel.id]) {
            const programs = await epgService.hydrate(channel, mode)
            set((state) => ({ epg: { ...state.epg, [channel.id]: programs } }))
          }
        }
      },

      loadEpgForChannel: async (channel, mode) => {
        const programs = await epgService.hydrate(channel, mode)
        set((state) => ({ epg: { ...state.epg, [channel.id]: programs } }))
      },

      toggleFavorite: (channelId) =>
        set((state) => ({
          favorites: state.favorites.includes(channelId)
            ? state.favorites.filter((id) => id !== channelId)
            : [channelId, ...state.favorites]
        })),

      recordRecent: (channelId, progress = 0) =>
        set((state) => ({
          recents: [
            { channelId, progress, watchedAt: new Date().toISOString() },
            ...state.recents.filter((recent) => recent.channelId !== channelId)
          ].slice(0, 12)
        })),

      seedRecentsIfEmpty: () => {
        if (get().recents.length === 0) set({ recents: initialRecents })
      },

      clearRecents: () => set({ recents: [] })
    }),
    {
      name: 'streamdeck-library',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ favorites: state.favorites, recents: state.recents })
    }
  )
)

/** Selector helpers, kept outside components to avoid re-subscribing closures. */
export const selectChannel =
  (id: string | undefined) =>
  (state: ChannelState): Channel | undefined =>
    id ? state.channels.find((channel) => channel.id === id) : undefined
