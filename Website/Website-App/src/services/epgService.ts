import type { Channel, Program } from '@shared/types'
import { buildMockEpg, localDayKey } from '@/mocks/epg'
import { getMockPrograms } from '@/mocks/epg'
import { channelService } from './channelService'
import type { AuthMode } from '@shared/types'

/**
 * EPG cache keyed by channel + local day. Demo channels get a deterministic
 * 24-hour schedule; real channels are hydrated lazily from the Jio API.
 */
const EPG_TTL_MS = 20 * 60_000 // 20 minutes

interface CacheEntry {
  programs: Program[]
  fetchedAt: number
}

const cache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<Program[]>>()

export const epgService = {
  getCached(channelId: string, date = new Date()): Program[] | undefined {
    const entry = cache.get(`${channelId}-${localDayKey(date)}`)
    if (!entry) return undefined
    if (Date.now() - entry.fetchedAt > EPG_TTL_MS) {
      cache.delete(`${channelId}-${localDayKey(date)}`)
      return undefined
    }
    return entry.programs
  },

  setCached(channelId: string, programs: Program[], date = new Date()): void {
    cache.set(`${channelId}-${localDayKey(date)}`, { programs, fetchedAt: Date.now() })
  },

  initialEpg(channels: Channel[], mode: AuthMode): Record<string, Program[]> {
    const map = mode === 'demo' ? buildMockEpg(channels) : {}
    for (const [channelId, programs] of Object.entries(map)) {
      epgService.setCached(channelId, programs)
    }
    return map
  },

  async hydrate(channel: Channel, mode: AuthMode): Promise<Program[]> {
    const cached = epgService.getCached(channel.id)
    if (cached) return cached
    const key = `${channel.id}-${mode}`
    const existing = inFlight.get(key)
    if (existing) return existing

    const promise = (async () => {
      try {
        const programs =
          mode === 'demo' ? getMockPrograms(channel) : await channelService.getEpg(channel, mode)
        if (programs.length > 0) {
          epgService.setCached(channel.id, programs)
        }
        return programs
      } finally {
        inFlight.delete(key)
      }
    })()

    inFlight.set(key, promise)
    return promise
  }
}
