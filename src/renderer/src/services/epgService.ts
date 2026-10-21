import type { Channel, Program } from '@shared/types'
import { buildFallbackEpg, buildMockEpg, localDayKey } from '@/mocks/epg'
import { getMockPrograms } from '@/mocks/epg'
import { channelService } from './channelService'
import type { AuthMode } from '@shared/types'

/**
 * EPG cache keyed by channel + local day. Demo channels get a deterministic
 * 24-hour schedule; real channels are hydrated lazily from the Jio API.
 */
const cache = new Map<string, Program[]>()

export const epgService = {
  getCached(channelId: string, date = new Date()): Program[] | undefined {
    return cache.get(`${channelId}-${localDayKey(date)}`)
  },

  setCached(channelId: string, programs: Program[], date = new Date()): void {
    cache.set(`${channelId}-${localDayKey(date)}`, programs)
  },

  initialEpg(channels: Channel[], mode: AuthMode): Record<string, Program[]> {
    const map = mode === 'demo' ? buildMockEpg(channels) : buildFallbackEpg(channels)
    for (const [channelId, programs] of Object.entries(map)) {
      epgService.setCached(channelId, programs)
    }
    return map
  },

  async hydrate(channel: Channel, mode: AuthMode): Promise<Program[]> {
    const cached = epgService.getCached(channel.id)
    if (cached) return cached
    const programs = mode === 'demo' ? getMockPrograms(channel) : await channelService.getEpg(channel, mode)
    epgService.setCached(channel.id, programs)
    return programs
  }
}
