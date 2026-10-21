import type { Channel, ChannelCategory, Program } from '@shared/types'

/**
 * Deterministic 24-hour EPG for every demo channel.
 * A seeded PRNG means the same channel/day always produces the same schedule,
 * so tests, cards and the guide never disagree between renders.
 */

interface EpgSeed {
  title: string
  description: string
  rating: string
}

const TITLES: Record<ChannelCategory, string[]> = {
  sports: [
    'Matchday Live',
    'The Cricket Debate',
    'Premier League Live',
    'Olympic Stories',
    'Wimbledon Classics',
    'The Warm-Up',
    'Inside the Locker Room',
    'Super Sunday',
    'Formula 1: Grand Prix',
    'Kabaddi Night',
    'Tennis Masters',
    'Football Focus',
    'Extra Time',
    'The Final Whistle',
    'Champions League Live',
    'SportsCenter India'
  ],
  news: [
    'Morning Briefing',
    'The Big Story',
    'India Today Live',
    'World at Noon',
    'Market Watch',
    'The Newsroom',
    'Prime Time Debate',
    'Late Night Bulletin',
    'Ground Report',
    'Business Daily',
    'Global Eye',
    'The Interview',
    'Weather Watch',
    'Front Page',
    'Nightline',
    'Weekend Wrap'
  ],
  movies: [
    'The Last Horizon',
    'Midnight in Bombay',
    'A Quiet Storm',
    'The Glass Empire',
    'Letters from Home',
    'Neon City',
    'The Longest Road',
    'Crimson Tide Rising',
    'The Architect',
    'Echoes of Tomorrow',
    'Café Nights',
    'The Heist',
    'Monsoon Wedding',
    'Silver Linings',
    'The Great Escape',
    'After the Rain'
  ],
  kids: [
    'Milo & The Moon',
    'Dino Detectives',
    'The Tiny Chef',
    'Robo Pals',
    'Jungle Beat',
    'Sky Pirates',
    'Little Inventors',
    'Storytime Corner',
    'The Magic Treehouse',
    'Super Squad',
    'Ocean Explorers',
    'Crafty Kids',
    'Puzzle Planet',
    'Monster School',
    'The Great Campout',
    'Sing Along!'
  ],
  entertainment: [
    'The Grand Kitchen',
    'Family Matters',
    'Heartland',
    'The Late Show',
    'Dance Nation',
    'House of Secrets',
    'The Perfect Match',
    'City Lights',
    'An Evening With...',
    'The Big Reunion',
    'Quiz Night',
    'Cooking with Fire',
    'Love & Delhi',
    'The Wedding Season',
    'Weekend Getaway',
    'Spotlight'
  ],
  regional: [
    'Vizha',
    'Kalyana Parisu',
    'Manam',
    'Sthree',
    'Naadaga Veedu',
    'Pongal Special',
    'The Village Kitchen',
    'Kadhai Neram',
    'Isai Sangamam',
    'Chithiram Pesuthadi',
    'Mazhavil Manorama',
    'Aniyathipravu',
    'Maharashtra Din',
    'Bangla Gaon',
    'Andhra Kitchen',
    'Sunday Cinema'
  ]
}

const DESCRIPTION_POOL: Record<ChannelCategory, string[]> = {
  sports: [
    'Live coverage with expert commentary, tactical breakdowns and reactions from the touchline.',
    'A front-row seat to the biggest contest of the day, followed by analysis from the studio.',
    'Highlights, interviews and the moments that decided the match, presented in stunning HD.',
    'The stories behind the scoreboard — profiles, rivalries and the road to the final.'
  ],
  news: [
    'A clear-eyed roundup of the day’s biggest developments, with reporters live across the country.',
    'The stories shaping India and the world, plus the context you need to make sense of them.',
    'In-depth interviews, ground reports and a calm explanation of what happens next.',
    'Business, technology and policy, decoded by the newsroom’s specialist editors.'
  ],
  movies: [
    'A cinematic escape full of unexpected turns, beautiful locations and a cast at the top of its game.',
    'An acclaimed feature about family, ambition and the choices that define us.',
    'A late-night favourite — sharp dialogue, a little danger and a satisfying final act.',
    'Settle into a widescreen story of love, loss and the strange roads that lead us home.'
  ],
  kids: [
    'A bright, playful adventure with a gentle lesson about curiosity, kindness and teamwork.',
    'Join the gang for puzzles, silly songs and a brand-new discovery in the garden.',
    'Animated fun for the whole family, packed with friendship and tiny acts of bravery.',
    'A calming story before bedtime, with soft music and a warm-hearted ending.'
  ],
  entertainment: [
    'The conversations, competitions and celebrations everyone will be talking about tomorrow.',
    'A glamorous evening of music, games and surprise guests, live from the studio.',
    'Family drama with a warm centre — new beginnings, old secrets and one very long dinner.',
    'Big personalities, bigger challenges and a prize worth fighting for.'
  ],
  regional: [
    'A beloved regional story told with warmth, humour and a soundtrack you will remember.',
    'Voices and traditions from across India, brought to the screen in your language.',
    'A family favourite featuring everyday heroes and the places they call home.',
    'Music, food and conversation from the heart of the region.'
  ]
}

const DURATIONS: Record<ChannelCategory, number[]> = {
  sports: [60, 60, 90, 120],
  news: [30, 30, 60],
  movies: [120, 150, 180],
  kids: [30, 30, 60],
  entertainment: [30, 60, 60, 90],
  regional: [30, 60, 90]
}

const RATINGS = ['U', 'U/A', 'PG-13', 'A']

function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mulberry32(seed: number): () => number {
  let state = seed
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function localDayKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const cache = new Map<string, Program[]>()

export function getMockPrograms(channel: Channel, date = new Date()): Program[] {
  const dayKey = localDayKey(date)
  const key = `${channel.id}-${dayKey}`
  const cached = cache.get(key)
  if (cached) return cached

  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const nextDay = new Date(dayStart)
  nextDay.setDate(nextDay.getDate() + 1)
  const random = mulberry32(hashString(key))
  const titles = TITLES[channel.category]
  const descriptions = DESCRIPTION_POOL[channel.category]
  const durations = DURATIONS[channel.category]
  const programs: Program[] = []

  let cursor = dayStart.getTime()
  let index = 0
  let previousTitle = ''
  while (cursor < nextDay.getTime()) {
    // Rotate through the category pool without ever showing the same title twice
    // back to back, which keeps shelves and the hero feeling editorial.
    let pick = (Math.floor(random() * titles.length) + index) % titles.length
    if (titles[pick] === previousTitle) pick = (pick + 1) % titles.length
    const title = titles[pick]
    previousTitle = title
    const duration = durations[Math.floor(random() * durations.length)]
    const end = Math.min(cursor + duration * 60_000, nextDay.getTime())
    programs.push({
      id: `${channel.id}-${cursor}`,
      channelId: channel.id,
      title,
      description: descriptions[Math.floor(random() * descriptions.length)],
      start: new Date(cursor).toISOString(),
      end: new Date(end).toISOString(),
      genre: channel.category === 'movies' ? 'Film' : channel.category === 'news' ? 'News' : 'Entertainment',
      rating: RATINGS[Math.floor(random() * RATINGS.length)]
    })
    cursor = end
    index += 1
  }

  cache.set(key, programs)
  return programs
}

export function buildMockEpg(channels: Channel[], date = new Date()): Record<string, Program[]> {
  const result: Record<string, Program[]> = {}
  for (const channel of channels) {
    result[channel.id] = getMockPrograms(channel, date)
  }
  return result
}

/** Placeholder schedule for real Jio channels until their EPG arrives. */
export function buildFallbackEpg(channels: Channel[]): Record<string, Program[]> {
  const now = new Date()
  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)
  const result: Record<string, Program[]> = {}
  for (const channel of channels) {
    const programs: Program[] = []
    let cursor = dayStart.getTime()
    let index = 0
    while (cursor < dayStart.getTime() + 24 * 60 * 60_000) {
      const end = cursor + 60 * 60_000
      programs.push({
        id: `${channel.id}-fallback-${cursor}`,
        channelId: channel.id,
        title: index % 2 === 0 ? `${channel.name} Live` : `Tonight on ${channel.name}`,
        description: `Live programming from ${channel.name}. The full schedule will appear once JioTV publishes it.`,
        start: new Date(cursor).toISOString(),
        end: new Date(end).toISOString(),
        genre: channel.category === 'news' ? 'News' : 'Live'
      })
      cursor = end
      index += 1
    }
    result[channel.id] = programs
  }
  return result
}
