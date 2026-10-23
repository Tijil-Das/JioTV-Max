import type { Channel, ChannelCategory, Program } from '@shared/types'

/**
 * Addendum 3 §6 · editorial hero feed. Configure with `VITE_FEATURED_URL`
 * (JSON `[{channelId, priority, from?, to?}]`). Empty means the source is
 * simply unavailable and the remaining sources renormalize.
 */
export const FEATURED_URL: string = import.meta.env?.VITE_FEATURED_URL ?? ''

export const HERO_LAST_KEY = 'hero:last'

export const APP_NAME = 'JioTv Max'
export const APP_SHORT = 'JioTv Max'
export const APP_TAGLINE = 'Enjoy JioTV on desktop with mobile plans only'
export const DEMO_OTP = '123456'
export const DEMO_PHONE = '9876543210'

/** CORS-friendly public HLS sources used by demo mode. */
export const DEMO_STREAMS = {
  mux: 'https://stream.mux.com/v69RSHhFelSm4701snP22dYz2jICy4E4FUyk02rW4gxRM.m3u8',
  apple:
    'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8',
  bunny: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
} as const

export const CATEGORY_META: Record<
  ChannelCategory | 'all',
  { label: string; singular: string; description: string }
> = {
  all: { label: 'All Channels', singular: 'Channel', description: 'Every live channel in one place' },
  sports: { label: 'Sports', singular: 'Sports', description: 'The roar of the game, live' },
  news: { label: 'News', singular: 'News', description: 'The world, as it happens' },
  movies: { label: 'Movies', singular: 'Movies', description: 'Cinema on your schedule' },
  kids: { label: 'Kids', singular: 'Kids', description: 'Stories for younger eyes' },
  entertainment: {
    label: 'Entertainment',
    singular: 'Entertainment',
    description: 'Drama, comedy and everything after'
  },
  regional: { label: 'Regional', singular: 'Regional', description: 'Voices from across India' }
}

export const NAV_ITEMS: Array<{
  label: string
  to: string
  icon: 'home' | 'sports' | 'news' | 'movies' | 'settings' | 'heart' | 'guide'
}> = [
  { label: 'Home', to: '/', icon: 'home' },
  { label: 'Sports', to: '/category/sports', icon: 'sports' },
  { label: 'News', to: '/category/news', icon: 'news' },
  { label: 'Movies', to: '/category/movies', icon: 'movies' },
  { label: 'Favorites', to: '/favorites', icon: 'heart' }
]

export const GUIDE_NAV = { label: 'Guide', to: '/guide', icon: 'guide' as const }

export const QUALITY_OPTIONS = [
  { label: 'Auto', value: 'auto', height: 0, note: 'Adaptive' },
  { label: '2160p', value: 2160, height: 2160, note: '4K · ~18 Mbps' },
  { label: '1080p', value: 1080, height: 1080, note: 'Full HD · ~6 Mbps' },
  { label: '720p', value: 720, height: 720, note: 'HD · ~3 Mbps' },
  { label: '480p', value: 480, height: 480, note: 'SD · ~1.5 Mbps' },
  { label: '360p', value: 360, height: 360, note: 'Data saver · ~0.8 Mbps' }
] as const

export const LANGUAGES = [
  'English',
  'Hindi',
  'Tamil',
  'Telugu',
  'Malayalam',
  'Marathi',
  'Bengali',
  'Kannada',
  'Gujarati',
  'Punjabi'
]

export const FEATURED_CHANNEL_IDS = ['ch-101', 'ch-109', 'ch-115', 'ch-121', 'ch-128']

export const PAGE_TITLES: Record<string, string> = {
  '/': 'Home',
  '/guide': 'TV Guide',
  '/settings': 'Settings',
  '/favorites': 'My List',
  '/dev/logos': 'Logo audit',
  '/category/sports': 'Sports',
  '/category/news': 'News',
  '/category/movies': 'Movies',
  '/category/kids': 'Kids',
  '/category/entertainment': 'Entertainment',
  '/category/regional': 'Regional'
}

/** Small helper used across cards and hero components. */
export function highestQuality(channel: Channel): 'SD' | 'HD' | '4K' {
  if (channel.quality.includes('4K')) return '4K'
  if (channel.quality.includes('HD')) return 'HD'
  return 'SD'
}

export function programsForChannel(
  programsByChannel: Record<string, Program[]>,
  channelId: string
): Program[] {
  return programsByChannel[channelId] ?? []
}
