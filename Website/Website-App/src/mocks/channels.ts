import type { Channel, ChannelCategory, ChannelQuality } from '@shared/types'
import { APP_NAME, DEMO_STREAMS } from '@/lib/constants'

/**
 * Demo catalogue used when the app is offline or running in demo mode.
 * These are real Indian channel names with representative artwork/tints; the
 * actual video URLs are public test streams so playback works without a Jio
 * account. Any remote URL is confined to `lib/constants.ts`.
 */

interface Seed {
  number: number
  name: string
  category: ChannelCategory
  language: string
  quality: ChannelQuality[]
  color: string
  stream: keyof typeof DEMO_STREAMS
  premium?: boolean
}

const seeds: Seed[] = [
  // Sports
  { number: 101, name: 'Star Sports 1 HD', category: 'sports', language: 'English', quality: ['HD'], color: '#DC2626', stream: 'mux' },
  { number: 102, name: 'Star Sports 2', category: 'sports', language: 'Hindi', quality: ['HD'], color: '#1D4ED8', stream: 'apple' },
  { number: 103, name: 'Star Sports Select 1 HD', category: 'sports', language: 'English', quality: ['HD'], color: '#B91C1C', stream: 'bunny' },
  { number: 104, name: 'Sony Sports Ten 1 HD', category: 'sports', language: 'Hindi', quality: ['HD'], color: '#7C3AED', stream: 'mux', premium: true },
  { number: 105, name: 'Sony Sports Ten 2', category: 'sports', language: 'English', quality: ['HD'], color: '#6D28D9', stream: 'apple' },
  { number: 106, name: 'DD Sports', category: 'sports', language: 'Hindi', quality: ['SD'], color: '#F59E0B', stream: 'bunny' },
  { number: 107, name: 'Eurosport HD', category: 'sports', language: 'English', quality: ['HD'], color: '#16A34A', stream: 'mux' },
  { number: 108, name: 'Sports18 1 HD', category: 'sports', language: 'English', quality: ['HD', '4K'], color: '#0EA5E9', stream: 'apple' },

  // Movies
  { number: 109, name: 'Star Movies HD', category: 'movies', language: 'English', quality: ['HD'], color: '#7C3AED', stream: 'mux' },
  { number: 110, name: 'Sony MAX', category: 'movies', language: 'Hindi', quality: ['HD'], color: '#EA580C', stream: 'apple' },
  { number: 111, name: 'Zee Cinema HD', category: 'movies', language: 'Hindi', quality: ['HD'], color: '#0F766E', stream: 'bunny' },
  { number: 112, name: '&pictures', category: 'movies', language: 'Hindi', quality: ['HD'], color: '#DB2777', stream: 'mux' },
  { number: 113, name: 'Movies Now HD', category: 'movies', language: 'English', quality: ['HD'], color: '#2563EB', stream: 'apple' },
  { number: 114, name: 'Star Gold HD', category: 'movies', language: 'Hindi', quality: ['HD', '4K'], color: '#CA8A04', stream: 'bunny' },

  // Entertainment
  { number: 115, name: 'Star Plus HD', category: 'entertainment', language: 'Hindi', quality: ['HD'], color: '#DB2777', stream: 'mux' },
  { number: 116, name: 'Zee TV HD', category: 'entertainment', language: 'Hindi', quality: ['HD'], color: '#7C3AED', stream: 'apple' },
  { number: 117, name: 'Colors HD', category: 'entertainment', language: 'Hindi', quality: ['HD'], color: '#A855F7', stream: 'bunny' },
  { number: 118, name: 'Sony SAB', category: 'entertainment', language: 'Hindi', quality: ['HD'], color: '#F97316', stream: 'mux' },
  { number: 119, name: 'SET HD', category: 'entertainment', language: 'Hindi', quality: ['HD'], color: '#0D9488', stream: 'apple' },
  { number: 120, name: '&TV HD', category: 'entertainment', language: 'Hindi', quality: ['HD'], color: '#E11D48', stream: 'bunny' },

  // News
  { number: 121, name: 'NDTV 24x7', category: 'news', language: 'English', quality: ['HD'], color: '#DC2626', stream: 'mux' },
  { number: 122, name: 'Aaj Tak', category: 'news', language: 'Hindi', quality: ['HD'], color: '#B91C1C', stream: 'apple' },
  { number: 123, name: 'Republic Bharat', category: 'news', language: 'Hindi', quality: ['HD'], color: '#1D4ED8', stream: 'bunny' },
  { number: 124, name: 'India Today', category: 'news', language: 'English', quality: ['HD'], color: '#DC2626', stream: 'mux' },
  { number: 125, name: 'CNBC-TV18', category: 'news', language: 'English', quality: ['HD'], color: '#16A34A', stream: 'apple' },
  { number: 126, name: 'WION', category: 'news', language: 'English', quality: ['HD'], color: '#0369A1', stream: 'bunny' },
  { number: 127, name: 'BBC World News', category: 'news', language: 'English', quality: ['HD'], color: '#991B1B', stream: 'mux' },

  // Kids
  { number: 128, name: 'Cartoon Network HD+', category: 'kids', language: 'English', quality: ['HD'], color: '#22D3EE', stream: 'mux' },
  { number: 129, name: 'Pogo', category: 'kids', language: 'Hindi', quality: ['SD'], color: '#F59E0B', stream: 'apple' },
  { number: 130, name: 'Nick HD+', category: 'kids', language: 'Hindi', quality: ['HD'], color: '#F97316', stream: 'bunny' },
  { number: 131, name: 'Disney Channel', category: 'kids', language: 'Hindi', quality: ['HD'], color: '#2563EB', stream: 'mux' },
  { number: 132, name: 'Discovery Kids', category: 'kids', language: 'English', quality: ['HD'], color: '#16A34A', stream: 'apple' },

  // Regional
  { number: 133, name: 'Sun TV HD', category: 'regional', language: 'Tamil', quality: ['HD'], color: '#DC2626', stream: 'bunny' },
  { number: 134, name: 'Asianet HD', category: 'regional', language: 'Malayalam', quality: ['HD'], color: '#B91C1C', stream: 'mux' },
  { number: 135, name: 'Star Vijay HD', category: 'regional', language: 'Tamil', quality: ['HD'], color: '#F97316', stream: 'apple' },
  { number: 136, name: 'Zee Marathi', category: 'regional', language: 'Marathi', quality: ['HD'], color: '#7C3AED', stream: 'bunny' },
  { number: 137, name: 'Star Jalsha HD', category: 'regional', language: 'Bengali', quality: ['HD'], color: '#EA580C', stream: 'mux' },
  { number: 138, name: 'Gemini TV HD', category: 'regional', language: 'Telugu', quality: ['HD'], color: '#16A34A', stream: 'apple' }
]

const categoryCopy: Record<ChannelCategory, string> = {
  sports: 'Live sport, expert analysis and every decisive moment.',
  news: 'Breaking stories, sharp reporting and calm context from the newsroom.',
  movies: 'A hand-picked seat in the cinema, without leaving the room.',
  kids: 'Bright adventures and gentle stories for younger viewers.',
  entertainment: 'Drama, laughter and the conversations everyone is having.',
  regional: 'Stories, music and voices from across India, in your language.'
}

const logoFilenameMap: Record<string, string> = {
  'Star Sports 1 HD': 'Star_Sports_1_HD.png',
  'Star Sports 2': 'Star_Sports_2.png',
  'Star Sports Select 1 HD': 'Star_Sports_Select_1_HD.png',
  'Sony Sports Ten 1 HD': 'Sony_Ten_1_HD.png',
  'Sony Sports Ten 2': 'Sony_Ten_2.png',
  'DD Sports': 'DD_Sports.png',
  'Eurosport HD': 'Eurosport_HD.png',
  'Sports18 1 HD': 'Sports18_1_HD.png',
  'Star Movies HD': 'Star_Movies_HD.png',
  'Sony MAX': 'Sony_MAX.png',
  'Zee Cinema HD': 'Zee_Cinema_HD.png',
  '&pictures': 'And_Pictures_HD.png',
  'Movies Now HD': 'Movies_Now_HD.png',
  'Star Gold HD': 'Star_Gold_HD.png',
  'Star Plus HD': 'Star_Plus_HD.png',
  'Zee TV HD': 'Zee_TV_HD.png',
  'Colors HD': 'ColorsHD1.png',
  'Sony SAB': 'Sony_SAB.png',
  'SET HD': 'Sony_Entertainment_Television_HD.png',
  '&TV HD': 'And_TV_HD.png',
  'NDTV 24x7': 'NDTV_24x7.png',
  'Aaj Tak': 'Aaj_Tak.png',
  'Republic Bharat': 'Republic_Bharat.png',
  'India Today': 'India_Today.png',
  'CNBC-TV18': 'CNBC_TV18.png',
  'WION': 'Wion.png',
  'BBC World News': 'BBC_World_News.png',
  'Cartoon Network HD+': 'Cartoon_Network_HD_Plus.png',
  'Pogo': 'Pogo.png',
  'Nick HD+': 'Nick_HD_Plus.png',
  'Disney Channel': 'Disney_Channel.png',
  'Discovery Kids': 'Discovery_Kids.png',
  'Sun TV HD': 'Sun_TV_HD.png',
  'Asianet HD': 'Asianet_HD.png',
  'Star Vijay HD': 'Star_Vijay_HD.png',
  'Zee Marathi': 'Zee_Marathi.png',
  'Star Jalsha HD': 'Star_Jalsha_HD.png',
  'Gemini TV HD': 'Gemini_TV_HD.png'
}

export const mockChannels: Channel[] = seeds.map((seed) => ({
  id: `ch-${seed.number}`,
  number: seed.number,
  name: seed.name,
  logoUrl: logoFilenameMap[seed.name] ?? `${seed.name.replace(/\s+/g, '_')}.png`,
  brandColor: seed.color,
  category: seed.category,
  language: seed.language,
  isLive: true,
  quality: seed.quality,
  streamUrl: DEMO_STREAMS[seed.stream],
  isPremium: seed.premium ?? false,
  source: 'demo',
  description: `${seed.name} — ${categoryCopy[seed.category]}`
}))

export function getMockChannel(id: string): Channel | undefined {
  return mockChannels.find((channel) => channel.id === id)
}

export const DEMO_CHANNEL_COUNT = mockChannels.length
export const DEMO_SOURCE_LABEL = `${APP_NAME} demo catalogue`
