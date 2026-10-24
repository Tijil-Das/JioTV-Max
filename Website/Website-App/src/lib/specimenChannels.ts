import type { Channel, Program } from '@shared/types'
import icon1 from '@/assets/icons/JioTV Max 1.png'
import icon2 from '@/assets/icons/JioTV Max 2.png'
import icon3 from '@/assets/icons/JioTV Max 3.png'
import icon4 from '@/assets/icons/JioTV Max 4.png'
import icon5 from '@/assets/icons/JioTV Max 5.png'

export const SPECIMEN_SHOW_TITLE = 'IND vs NZ T20I 2020, Super Over'

export const SPECIMEN_CHANNELS: Channel[] = [
  {
    id: 'ch-specimen-1',
    number: 1,
    name: 'Specimen Channel 1',
    logoUrl: icon1,
    brandColor: '#2563EB',
    category: 'sports',
    language: 'English',
    isLive: true,
    quality: ['HD'],
    streamUrl: '../assets/stream/playlist.m3u8',
    description: SPECIMEN_SHOW_TITLE
  },
  {
    id: 'ch-specimen-2',
    number: 2,
    name: 'Specimen Channel 2',
    logoUrl: icon2,
    brandColor: '#DC2626',
    category: 'sports',
    language: 'Hindi',
    isLive: true,
    quality: ['HD'],
    streamUrl: '../assets/stream/playlist.m3u8',
    description: SPECIMEN_SHOW_TITLE
  },
  {
    id: 'ch-specimen-3',
    number: 3,
    name: 'Specimen Channel 3',
    logoUrl: icon3,
    brandColor: '#7C3AED',
    category: 'sports',
    language: 'English',
    isLive: true,
    quality: ['HD'],
    streamUrl: '../assets/stream/playlist.m3u8',
    description: SPECIMEN_SHOW_TITLE
  },
  {
    id: 'ch-specimen-4',
    number: 4,
    name: 'Specimen Channel 4',
    logoUrl: icon4,
    brandColor: '#0EA5E9',
    category: 'sports',
    language: 'Hindi',
    isLive: true,
    quality: ['HD'],
    streamUrl: '../assets/stream/playlist.m3u8',
    description: SPECIMEN_SHOW_TITLE
  },
  {
    id: 'ch-specimen-5',
    number: 5,
    name: 'Specimen Channel 5',
    logoUrl: icon5,
    brandColor: '#16A34A',
    category: 'sports',
    language: 'English',
    isLive: true,
    quality: ['HD'],
    streamUrl: '../assets/stream/playlist.m3u8',
    description: SPECIMEN_SHOW_TITLE
  }
]

export function isSpecimenChannelId(id?: string | null): boolean {
  if (!id) return false
  return SPECIMEN_CHANNELS.some((c) => c.id === id)
}

/**
 * Resolves a channel to one of the 5 specimen channels.
 * If id matches specimen 1..5, returns that channel.
 * Otherwise defaults to Specimen Channel 1.
 */
export function getSpecimenChannel(idOrAny?: string | null): Channel {
  if (!idOrAny) return SPECIMEN_CHANNELS[0]
  const match = SPECIMEN_CHANNELS.find((c) => c.id === idOrAny)
  if (match) return match
  return SPECIMEN_CHANNELS[0]
}

export function getSpecimenProgram(channelId?: string): Program {
  const now = Date.now()
  return {
    id: `prog-${channelId || 'specimen'}-live`,
    title: SPECIMEN_SHOW_TITLE,
    start: new Date(now - 20 * 60 * 1000).toISOString(),
    end: new Date(now + 70 * 60 * 1000).toISOString(),
    durationMinutes: 90,
    genre: 'Sports',
    rating: 'U'
  }
}
