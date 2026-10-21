import type { AuthMode, Channel, ChannelFetchPayload, EpgEntry, Program, StreamInfo } from '@shared/types'
import { FEATURED_CHANNEL_IDS } from '@/lib/constants'
import { mockChannels } from '@/mocks/channels'
import { getMockPrograms } from '@/mocks/epg'
import { ApiError, delay, getBridge } from './api'

function qualityToJio(_quality: 'auto' | number): 'auto' | 'high' | 'medium' | 'low' {
  // Always request 'auto' from JioTV API so the full multi-variant master manifest
  // is returned without server-side bitrate filtering (which causes audio-only fallback).
  // The client player (hls.js) chooses the exact rendition based on the user's quality preference.
  return 'auto'
}

export const channelService = {
  async loadCatalogue(mode: AuthMode): Promise<ChannelFetchPayload> {
    if (mode === 'demo') {
      await delay(550)
      return {
        channels: mockChannels,
        source: 'demo',
        fetchedAt: new Date().toISOString()
      }
    }
    const bridge = getBridge()
    if (!bridge) {
      throw new ApiError('JioTV channels are available in the desktop app only.', 'NO_BRIDGE')
    }
    const result = await bridge.channels.fetchAll()
    if (!result.ok) throw new ApiError(result.error, result.code, result.retryable)
    return result.data
  },

  async getStream(
    channel: Channel,
    mode: AuthMode,
    quality: 'auto' | number
  ): Promise<StreamInfo> {
    console.log(`[channelService] getStream channel=${channel.id} (${channel.name}), mode=${mode}, quality=${quality}`)
    if (mode === 'demo') {
      await delay(320)
      if (!channel.streamUrl) {
        console.warn(`[channelService] demo channel ${channel.id} has no streamUrl`)
        throw new ApiError('This demo channel has no stream attached.', 'NO_STREAM')
      }
      console.log(`[channelService] demo stream URL:`, channel.streamUrl)
      return {
        channelId: channel.id,
        url: channel.streamUrl,
        type: 'hls',
        isLive: true,
        isDrm: false,
        source: 'demo',
        note: 'Demo stream · public HLS sample'
      }
    }
    const bridge = getBridge()
    if (!bridge) {
      console.error('[channelService] No bridge available (running in web browser?)')
      throw new ApiError('Playback is available in the desktop app only.', 'NO_BRIDGE')
    }
    const result = await bridge.channels.getStream(channel.id, qualityToJio(quality))
    if (!result.ok) {
      console.error(`[channelService] bridge.channels.getStream error:`, result.error, result.code)
      throw new ApiError(result.error, result.code, result.retryable)
    }
    console.log(`[channelService] bridge.channels.getStream success:`, result.data)
    return result.data
  },

  async getEpg(channel: Channel, mode: AuthMode): Promise<Program[]> {
    if (mode === 'demo') return getMockPrograms(channel)
    const bridge = getBridge()
    if (!bridge) return getMockPrograms(channel)
    try {
      const result = await bridge.channels.getEpg(channel.id)
      if (!result.ok || result.data.length === 0) return getMockPrograms(channel)
      return mapJioEpg(result.data, channel.id)
    } catch {
      return getMockPrograms(channel)
    }
  },

  featured(channels: Channel[]): Channel[] {
    const byId = new Map(channels.map((channel) => [channel.id, channel]))
    const chosen = FEATURED_CHANNEL_IDS.map((id) => byId.get(id)).filter(
      (channel): channel is Channel => Boolean(channel)
    )
    if (chosen.length >= 5) return chosen
    // Real Jio catalogues use different IDs; pick a representative spread.
    const categories = ['sports', 'movies', 'entertainment', 'news', 'kids'] as const
    for (const category of categories) {
      const candidate = channels.find((channel) => channel.category === category)
      if (candidate && !chosen.some((item) => item.id === candidate.id)) chosen.push(candidate)
    }
    return chosen.slice(0, 5)
  }
}

export function mapJioEpg(entries: EpgEntry[], channelId: string): Program[] {
  return entries
    .map((entry, index) => ({
      id: `${channelId}-jio-${entry.startEpoch}-${index}`,
      channelId,
      title: entry.title || 'Live programme',
      description: entry.description || 'Live programming from JioTV.',
      start: new Date(entry.startEpoch * 1000).toISOString(),
      end: new Date(entry.endEpoch * 1000).toISOString(),
      genre: entry.category || 'Live',
      artworkUrl: entry.thumbnail
    }))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
}
