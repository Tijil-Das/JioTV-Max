import type { AuthMode, Channel, ChannelCategory, ChannelFetchPayload, EpgEntry, Program, StreamInfo } from '@shared/types'
import cachedChannels from '@/channels-cache.json'
import { getMockPrograms } from '@/mocks/epg'
import { SPECIMEN_CHANNELS, getSpecimenProgram } from '@/lib/specimenChannels'

const JIO_PUBLIC_CATALOGUE_URL =
  'https://jiotvapi.cdn.jio.com/apis/v3.1/getMobileChannelList/get/?langId=6&os=android&devicetype=phone&usertype=JIO&version=315&langId=6'

const CATEGORY_BY_ID: Record<number, ChannelCategory> = {
  5: 'entertainment',
  6: 'movies',
  7: 'kids',
  8: 'sports',
  9: 'entertainment',
  10: 'entertainment',
  12: 'news',
  13: 'entertainment',
  15: 'entertainment',
  16: 'news',
  17: 'entertainment',
  18: 'entertainment',
  19: 'regional'
}

const LANGUAGE_BY_ID: Record<number, string> = {
  1: 'Hindi',
  2: 'Marathi',
  3: 'Punjabi',
  4: 'Urdu',
  5: 'Bengali',
  6: 'English',
  7: 'Malayalam',
  8: 'Tamil',
  9: 'Gujarati',
  10: 'Odia',
  11: 'Telugu',
  12: 'Bhojpuri',
  13: 'Kannada',
  14: 'Assamese',
  15: 'Nepali',
  16: 'French',
  18: 'Other'
}

const BRAND_COLORS: Record<ChannelCategory, string[]> = {
  sports: ['#2563EB', '#0EA5E9', '#16A34A', '#F97316'],
  news: ['#DC2626', '#B91C1C', '#0369A1', '#CA8A04'],
  movies: ['#7C3AED', '#DB2777', '#B45309', '#0F766E'],
  kids: ['#F59E0B', '#EC4899', '#8B5CF6', '#22C55E'],
  entertainment: ['#DB2777', '#7C3AED', '#E11D48', '#0EA5E9'],
  regional: ['#EA580C', '#16A34A', '#C026D3', '#0D9488']
}

function hashCode(val: string): number {
  let hash = 0
  for (let i = 0; i < val.length; i++) {
    hash = (hash << 5) - hash + val.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function brandFor(name: string, cat: ChannelCategory): string {
  const pal = BRAND_COLORS[cat] || BRAND_COLORS.entertainment
  return pal[hashCode(name) % pal.length]
}

function categorize(catId: number, langId: number, name: string): ChannelCategory {
  const n = name.toLowerCase()
  if (/sports|cricket|football|tennis|badminton/i.test(n)) return 'sports'
  if (/cinema|movie|film|talkies|pictures/i.test(n)) return 'movies'
  if (/news|samachar|khabar|tv9|times now|republic|aaj tak|ndtv/i.test(n)) return 'news'
  if (/kids|cartoon|pogo|nick|sonic|hungama|disney/i.test(n)) return 'kids'
  if (catId in CATEGORY_BY_ID) return CATEGORY_BY_ID[catId]
  if (langId > 0 && ![1, 6].includes(langId)) return 'regional'
  return 'entertainment'
}

export const channelService = {
  async loadCatalogue(_mode?: AuthMode): Promise<ChannelFetchPayload> {
    try {
      const response = await fetch(JIO_PUBLIC_CATALOGUE_URL, {
        headers: {
          devicetype: 'phone',
          os: 'android',
          appkey: 'NzNiMDhlYzQyNjJm',
          lbcookie: '1',
          usertype: 'JIO'
        }
      })
      if (response.ok) {
        const data = await response.json()
        if (Array.isArray(data.result) && data.result.length > 0) {
          const channels: Channel[] = data.result
            .map((raw: any, idx: number) => {
              const id = String(raw.channel_id || '').trim()
              const name = String(raw.channel_name || '').trim()
              if (!id || !name) return null
              const langId = Number(raw.channelLanguageId || 0)
              const catId = Number(raw.channelCategoryId || 0)
              const category = categorize(catId, langId, name)
              const language = LANGUAGE_BY_ID[langId] || 'Other'
              const rawStb = Number(raw.stbChannelNumber)
              const stbNumber = Number.isFinite(rawStb) && rawStb > 0 ? rawStb : undefined
              const num = stbNumber || Number(raw.channel_id) || idx + 101
              const isHD = Boolean(raw.isHD || /hd|4k/i.test(name))
              const rawLogo = String(raw.logoUrl || raw.channel_logo || '')
              const logoUrl = rawLogo
                ? `https://jiotvimages.cdn.jio.com/dare_images/images/${rawLogo}`
                : ''
              return {
                id,
                number: num,
                stbNumber,
                name,
                logoUrl,
                brandColor: brandFor(name, category),
                category,
                language,
                isLive: true,
                quality: isHD ? (['HD'] as const) : (['SD'] as const),
                isPremium: raw.is_premium === true,
                source: 'jio' as const,
                streamUrl: '../assets/stream/playlist.m3u8',
                description: `${name} — live ${category} broadcast from the JioTV catalogue.`
              }
            })
            .filter((c: any): c is Channel => c !== null)

          if (channels.length > 0) {
            return {
              channels,
              source: 'jio',
              fetchedAt: new Date().toISOString()
            }
          }
        }
      }
    } catch {
      // Fallback to static cache
    }

    return {
      channels: cachedChannels as Channel[],
      source: 'jio',
      fetchedAt: new Date().toISOString()
    }
  },

  async getStream(
    channel: Channel,
    _mode?: AuthMode,
    _quality?: 'auto' | number
  ): Promise<StreamInfo> {
    return {
      channelId: channel.id,
      url: channel.streamUrl || '../assets/stream/playlist.m3u8',
      type: 'hls',
      isLive: true,
      isDrm: false,
      source: 'demo',
      note: 'Synchronized live HLS stream'
    }
  },

  async getEpg(channel: Channel, _mode?: AuthMode): Promise<Program[]> {
    if (channel.id.startsWith('ch-specimen-')) {
      return [getSpecimenProgram(channel.id)]
    }
    try {
      const res = await fetch(
        `https://jiotv.data.cdn.jio.com/apis/v1.3/getepg/get?offset=0&channel_id=${encodeURIComponent(channel.id)}`,
        { signal: AbortSignal.timeout(6000) }
      )
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.epg) && data.epg.length > 0) {
          const mapped: Program[] = data.epg
            .filter(
              (entry: any) =>
                Boolean(entry.showname || entry.title) &&
                Number(entry.endEpoch) > Number(entry.startEpoch)
            )
            .map((entry: any, index: number) => {
              const startEpoch = Number(entry.startEpoch)
              const endEpoch = Number(entry.endEpoch)
              const startMs = startEpoch > 1e11 ? startEpoch : startEpoch * 1000
              const endMs = endEpoch > 1e11 ? endEpoch : endEpoch * 1000
              return {
                id: `${channel.id}-jio-${entry.startEpoch}-${index}`,
                channelId: channel.id,
                title: String(entry.showname || entry.title || '').trim(),
                description: String(entry.description || '').trim(),
                start: new Date(startMs).toISOString(),
                end: new Date(endMs).toISOString(),
                genre: String(entry.showCategory || '').trim(),
                artworkUrl:
                  typeof entry.episodeThumbnail === 'string' ? entry.episodeThumbnail : undefined
              }
            })
            .sort((a: Program, b: Program) => Date.parse(a.start) - Date.parse(b.start))
          if (mapped.length > 0) return mapped
        }
      }
    } catch {
      // Fallback to deterministic mock schedule
    }
    return getMockPrograms(channel)
  }
}
