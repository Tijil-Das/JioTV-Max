import type { Channel, Program } from '@shared/types'
import { FEATURED_URL, HERO_LAST_KEY } from '@/lib/constants'
import { getBridge } from '@/services/api'
import { useChannelStore, type RecentChannel } from '@/store/useChannelStore'
import { useSettingsStore } from '@/store/useSettingsStore'

/**
 * Addendum 3 §6 · deterministic featured-channel selection.
 *
 * Sources are combined only when they return data, then renormalized:
 *   editorial .40 · popularity .25 · personal .25 · EPG fit .10
 *
 * `Math.random` is banned in this module. Every comparison ends in a stable
 * tiebreak (channel number, then id) so identical inputs always produce the
 * identical hero order.
 */

export interface EditorialEntry {
  channelId: string
  priority: number
  from?: string | number
  to?: string | number
}

export interface HeroSourceScores {
  editorial?: number
  popularity?: number
  personal?: number
  epg?: number
}

export interface HeroCandidate {
  channel: Channel
  score: number
  sources: HeroSourceScores
}

export interface HeroHistoryEntry {
  channelId: string
  watchedAt: string
  minutes?: number
}

export interface FeaturedContext {
  channels: Channel[]
  epg: Record<string, Program[]>
  favorites: string[]
  history: HeroHistoryEntry[]
  language: string
  now: Date
  editorial?: EditorialEntry[] | null
}

const SOURCE_WEIGHTS = {
  editorial: 0.4,
  popularity: 0.25,
  personal: 0.25,
  epg: 0.1
} as const

const CATEGORY_PRIORITY: Record<string, number> = {
  sports: 0,
  news: 1,
  entertainment: 2,
  movies: 3
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

function parseTime(value: string | number | undefined): number | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

/** Editorial feed: honor time windows, normalize priority to 0-1. */
export function editorialScores(
  entries: EditorialEntry[] | null | undefined,
  channelIds: Set<string>,
  now: Date
): Map<string, number> | null {
  if (!entries || entries.length === 0) return null
  const nowMs = now.getTime()
  const active = entries.filter((entry) => {
    if (!channelIds.has(entry.channelId)) return false
    const from = parseTime(entry.from)
    const to = parseTime(entry.to)
    if (from !== null && nowMs < from) return false
    if (to !== null && nowMs > to) return false
    return true
  })
  if (active.length === 0) return null
  const max = Math.max(1, ...active.map((entry) => Number(entry.priority) || 0))
  const scores = new Map<string, number>()
  for (const entry of active) {
    scores.set(entry.channelId, clamp01((Number(entry.priority) || 0) / max))
  }
  return scores
}

/**
 * Popularity adapter for optional channel API fields. Returns null when no
 * channel carries any signal so the weighted sum can renormalize.
 */
export function popularityScores(channels: Channel[]): Map<string, number> | null {
  const maxViewers = Math.max(
    1,
    ...channels.map((channel) => (typeof channel.viewers === 'number' ? channel.viewers : 0))
  )
  const ranked = channels
    .filter((channel) => typeof channel.rank === 'number')
    .map((channel) => ({ id: channel.id, rank: channel.rank as number }))
  const rankedCount = ranked.length
  const rankScore = new Map<string, number>()
  for (const item of ranked) {
    rankScore.set(
      item.id,
      rankedCount <= 1 ? 1 : clamp01(1 - (item.rank - 1) / (rankedCount - 1))
    )
  }

  const scores = new Map<string, number>()
  let any = false
  for (const channel of channels) {
    const parts: number[] = []
    if (typeof channel.popularity === 'number') {
      any = true
      parts.push(clamp01(channel.popularity > 1 ? channel.popularity / 100 : channel.popularity))
    }
    if (typeof channel.viewers === 'number') {
      any = true
      parts.push(clamp01(Math.log1p(channel.viewers) / Math.log1p(maxViewers)))
    }
    const rank = rankScore.get(channel.id)
    if (rank !== undefined) {
      any = true
      parts.push(rank)
    }
    if (channel.trending) {
      any = true
      parts.push(0.85)
    }
    if (channel.isFeatured) {
      any = true
      parts.push(1)
    }
    if (parts.length > 0) {
      scores.set(channel.id, parts.reduce((sum, part) => sum + part, 0) / parts.length)
    }
  }
  return any ? scores : null
}

/** Personal: 30-day decayed watch history, favourites bonus, same-hour lift. */
export function personalScores(
  history: HeroHistoryEntry[],
  favorites: string[],
  now: Date
): Map<string, number> | null {
  if (history.length === 0 && favorites.length === 0) return null
  const weights = new Map<string, number>()
  const nowMs = now.getTime()
  const nowHour = now.getHours()

  for (const entry of history) {
    const at = Date.parse(entry.watchedAt)
    if (Number.isNaN(at)) continue
    const daysAgo = (nowMs - at) / 86_400_000
    if (daysAgo < 0 || daysAgo > 30) continue
    const minutes = typeof entry.minutes === 'number' && entry.minutes > 0 ? entry.minutes : 30
    let weight = minutes * 0.5 ** (daysAgo / 7)
    const hour = new Date(at).getHours()
    const circular = Math.min((hour - nowHour + 24) % 24, (nowHour - hour + 24) % 24)
    if (circular <= 2) weight *= 1.25
    weights.set(entry.channelId, (weights.get(entry.channelId) ?? 0) + weight)
  }

  if (weights.size === 0 && favorites.length === 0) return null
  const max = Math.max(1, ...weights.values())
  for (const channelId of favorites) {
    weights.set(channelId, (weights.get(channelId) ?? 0) + max * 0.25)
  }
  const scores = new Map<string, number>()
  for (const [channelId, weight] of weights) {
    scores.set(channelId, clamp01(weight / Math.max(max, 1)))
  }
  return scores.size > 0 ? scores : null
}

const LIVE_GENRE = /(news|sport|movie|film|live event|event)/i

/** EPG fit: current live event/news/sport/movie, ≤25 min old, ≥30 min left. */
export function epgScores(
  channels: Channel[],
  epg: Record<string, Program[]>,
  now: Date
): Map<string, number> | null {
  const scores = new Map<string, number>()
  const nowMs = now.getTime()
  for (const channel of channels) {
    const programs = epg[channel.id] ?? []
    const current = programs.find((program) => {
      const start = Date.parse(program.start)
      const end = Date.parse(program.end)
      return start <= nowMs && nowMs < end
    })
    if (!current) continue
    const start = Date.parse(current.start)
    const end = Date.parse(current.end)
    const startedMinutes = (nowMs - start) / 60_000
    const leftMinutes = (end - nowMs) / 60_000
    if (startedMinutes > 25 || leftMinutes < 30) continue
    const genre = `${current.genre} ${current.title}`
    if (!LIVE_GENRE.test(genre)) continue
    scores.set(channel.id, 1)
  }
  return scores.size > 0 ? scores : null
}

function byNumber(a: HeroCandidate, b: HeroCandidate): number {
  if (Math.abs(b.score - a.score) > 0.0001) return b.score - a.score
  const categoryA = CATEGORY_PRIORITY[a.channel.category] ?? 9
  const categoryB = CATEGORY_PRIORITY[b.channel.category] ?? 9
  if (categoryA !== categoryB) return categoryA - categoryB

  const promA = getChannelProminence(a.channel)
  const promB = getChannelProminence(b.channel)
  if (promA !== promB) return promB - promA

  if (a.channel.number !== b.channel.number) return a.channel.number - b.channel.number
  return a.channel.id.localeCompare(b.channel.id)
}

export const MARQUEE_SPORTS_REGEX =
  /(sports\s*18|sony\s*(sports\s*)?ten|\bten\s*[1-5]\b|star\s*sports|dd\s*sports|eurosport)/i

export const MARQUEE_NEWS_REGEX =
  /(aaj\s*tak|ndtv|india\s*today|times\s*now|wion|cnn(-|\s*)news\s*18|republic|cnbc|abp\s*news|zee\s*news|bbc(\s*world)?\s*news)/i

export const MARQUEE_FLAGSHIP_REGEX =
  /(star\s*plus|colors|sony\s*sab|set(\s*india|\s*hd)?$|sony\s*entertainment|zee\s*tv|star\s*gold|sony\s*max|zee\s*cinema|&pictures|star\s*movies|movies\s*now)/i

export const JUNK_CHANNEL_REGEX =
  /(shopping|teleshopping|naaptol|darshan|bhakti|aastha|sadhna|sanskar|peace\s*tv|subhavaartha|shubh|dangal\s*2|b4u\s*(bhojpuri|kadak)|manoranjan|maha\s*movie|cinemachi|test\b)/i

const REGIONAL_LANGUAGES = new Set([
  'tamil',
  'telugu',
  'malayalam',
  'kannada',
  'bengali',
  'marathi',
  'gujarati',
  'punjabi',
  'odia',
  'bhojpuri',
  'assamese',
  'urdu'
])

export function isHeroEligibleChannel(channel: Channel): boolean {
  if (channel.category === 'regional') return false
  const lang = (channel.language || '').trim().toLowerCase()
  // Non-sports channels in regional languages must not lead the national hero stage
  if (channel.category !== 'sports' && REGIONAL_LANGUAGES.has(lang)) return false
  if (JUNK_CHANNEL_REGEX.test(channel.name)) return false
  return true
}

export function isHDChannel(channel: Channel): boolean {
  if (channel.quality && (channel.quality.includes('HD') || channel.quality.includes('4K'))) {
    return true
  }
  return /\b(HD|4K|UHD)\b/i.test(channel.name)
}

export function getBaseChannelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(hd|sd|4k|uhd|\+)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function getChannelProminence(channel: Channel): number {
  const name = channel.name.toLowerCase()
  let score = 0

  const isSports = channel.category === 'sports' || MARQUEE_SPORTS_REGEX.test(name)
  const isNews = channel.category === 'news' || MARQUEE_NEWS_REGEX.test(name)

  if (isSports) {
    score += 1000
    if (MARQUEE_SPORTS_REGEX.test(name)) score += 300
  } else if (isNews) {
    score += 600
    if (MARQUEE_NEWS_REGEX.test(name)) score += 250
  } else if (channel.category === 'entertainment') {
    score += 300
    if (MARQUEE_FLAGSHIP_REGEX.test(name)) score += 150
  } else if (channel.category === 'movies') {
    score += 250
    if (MARQUEE_FLAGSHIP_REGEX.test(name)) score += 150
  } else {
    score += 50
  }

  // Major boost for HD / 4K feeds so highest quality feeds strictly beat SD variants
  if (isHDChannel(channel)) {
    score += 200
  }

  return score
}

/**
 * Curates hero candidates so the top 5 slots guarantee the highest quality
 * Sports marquee channels (top 3) and High Quality News channels (top 2),
 * deduplicating SD feeds when an HD version of the network exists.
 */
export function curateHeroCandidates(candidates: HeroCandidate[]): HeroCandidate[] {
  if (candidates.length <= 1) return candidates

  const sports: HeroCandidate[] = []
  const news: HeroCandidate[] = []
  const others: HeroCandidate[] = []

  for (const candidate of candidates) {
    const ch = candidate.channel
    const name = ch.name.toLowerCase()
    if (ch.category === 'sports' || MARQUEE_SPORTS_REGEX.test(name)) {
      sports.push(candidate)
    } else if (ch.category === 'news' || MARQUEE_NEWS_REGEX.test(name)) {
      news.push(candidate)
    } else {
      others.push(candidate)
    }
  }

  // Deduplicate channels by base name, preferring HD and higher prominence
  const dedup = (list: HeroCandidate[]): { top: HeroCandidate[]; rest: HeroCandidate[] } => {
    const seenBase = new Set<string>()
    const top: HeroCandidate[] = []
    const rest: HeroCandidate[] = []

    const sorted = [...list].sort((a, b) => {
      const pDiff = getChannelProminence(b.channel) - getChannelProminence(a.channel)
      if (pDiff !== 0) return pDiff
      return b.score - a.score
    })

    for (const item of sorted) {
      const base = getBaseChannelName(item.channel.name)
      if (!seenBase.has(base)) {
        seenBase.add(base)
        top.push(item)
      } else {
        rest.push(item)
      }
    }
    return { top, rest }
  }

  const { top: topSports, rest: restSports } = dedup(sports)
  const { top: topNews, rest: restNews } = dedup(news)
  const { top: topOthers, rest: restOthers } = dedup(others)

  // Primary slots: top 3 premier sports + top 2 premier high-quality news
  const heroPrimary: HeroCandidate[] = []
  heroPrimary.push(...topSports.slice(0, 3))
  heroPrimary.push(...topNews.slice(0, 2))

  const combined = [
    ...heroPrimary,
    ...topSports.slice(3),
    ...topNews.slice(2),
    ...topOthers,
    ...restSports,
    ...restNews,
    ...restOthers
  ]

  const seenIds = new Set<string>()
  const finalCandidates: HeroCandidate[] = []
  for (const item of combined) {
    if (!seenIds.has(item.channel.id)) {
      seenIds.add(item.channel.id)
      finalCandidates.push(item)
    }
  }

  return finalCandidates
}

/** Deterministic fallback: recents & favorites first, then category priority & major Indian networks. */
export function fallbackCandidates(context: FeaturedContext): HeroCandidate[] {
  const language = context.language.trim().toLowerCase()
  const preferred = language
    ? context.channels.filter((channel) => channel.language.toLowerCase() === language)
    : []
  const pool = preferred.length > 0 ? preferred : context.channels

  const recentIndex = new Map<string, number>()
  context.history.forEach((h, idx) => {
    if (!recentIndex.has(h.channelId)) recentIndex.set(h.channelId, idx)
  })
  const favoritesSet = new Set(context.favorites)

  return [...pool]
    .sort((a, b) => {
      // 1. Recently watched channels first
      const aRecent = recentIndex.has(a.id)
      const bRecent = recentIndex.has(b.id)
      if (aRecent && bRecent) return (recentIndex.get(a.id) ?? 0) - (recentIndex.get(b.id) ?? 0)
      if (aRecent) return -1
      if (bRecent) return 1

      // 2. Favorites next
      const aFav = favoritesSet.has(a.id)
      const bFav = favoritesSet.has(b.id)
      if (aFav && !bFav) return -1
      if (!aFav && bFav) return 1

      // 3. Category priority: Sports (0), News (1), Entertainment (2), Movies (3)
      const categoryA = CATEGORY_PRIORITY[a.category] ?? 9
      const categoryB = CATEGORY_PRIORITY[b.category] ?? 9
      if (categoryA !== categoryB) return categoryA - categoryB

      // 4. Prominence within category (major flagship Indian channels over obscure tickers)
      const promA = getChannelProminence(a)
      const promB = getChannelProminence(b)
      if (promA !== promB) return promB - promA

      // 5. Channel number tiebreak
      if (a.number !== b.number) return a.number - b.number
      return a.id.localeCompare(b.id)
    })
    .map((channel) => ({ channel, score: 0, sources: {} }))
}

export function rankHeroCandidates(context: FeaturedContext): HeroCandidate[] {
  const channelIds = new Set(context.channels.map((channel) => channel.id))
  const editorial = editorialScores(context.editorial, channelIds, context.now)
  const popularity = popularityScores(context.channels)
  const personal = personalScores(context.history, context.favorites, context.now)
  const epg = epgScores(context.channels, context.epg, context.now)

  const available: Array<[keyof typeof SOURCE_WEIGHTS, Map<string, number>]> = []
  if (editorial) available.push(['editorial', editorial])
  if (popularity) available.push(['popularity', popularity])
  if (personal) available.push(['personal', personal])
  if (epg) available.push(['epg', epg])

  if (available.length === 0) return fallbackCandidates(context)

  let weightTotal = 0
  for (const [source] of available) weightTotal += SOURCE_WEIGHTS[source]

  const candidates = context.channels.map((channel) => {
    const sources: HeroSourceScores = {}
    let weighted = 0
    for (const [source, map] of available) {
      const value = map.get(channel.id)
      if (value === undefined) continue
      sources[source] = value
      weighted += value * SOURCE_WEIGHTS[source]
    }
    return { channel, score: weighted / weightTotal, sources }
  })

  return candidates.sort(byNumber)
}

// ---------------------------------------------------------------------------
// Editorial fetch: 3s timeout · 15 min cache · stale-if-error
// ---------------------------------------------------------------------------

let editorialCache: { data: EditorialEntry[]; fetchedAt: number } | null = null
const EDITORIAL_TTL_MS = 15 * 60_000

async function fetchEditorial(now: Date): Promise<EditorialEntry[] | null> {
  const bridge = getBridge()
  if (bridge?.channels?.getFeatured) {
    try {
      const res = await bridge.channels.getFeatured()
      if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
        return res.data
      }
    } catch (err) {
      console.warn('[hero] bridge getFeatured failed', err)
    }
  }

  if (!FEATURED_URL) return null
  if (editorialCache && now.getTime() - editorialCache.fetchedAt < EDITORIAL_TTL_MS) {
    return editorialCache.data
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3000)
  try {
    const response = await fetch(FEATURED_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const json = (await response.json()) as EditorialEntry[]
    if (!Array.isArray(json)) throw new Error('editorial feed is not an array')
    const clean = json
      .filter((entry): entry is EditorialEntry => Boolean(entry && entry.channelId))
      .map((entry) => ({ ...entry, priority: Number(entry.priority) || 0 }))
    editorialCache = { data: clean, fetchedAt: now.getTime() }
    return clean
  } catch (error) {
    if (editorialCache) {
      console.warn('[hero] editorial feed stale', error)
      return editorialCache.data
    }
    console.warn('[hero] editorial feed unavailable', error)
    return null
  } finally {
    clearTimeout(timer)
  }
}

function historyFromRecents(recents: RecentChannel[]): HeroHistoryEntry[] {
  return recents.map((recent) => ({
    channelId: recent.channelId,
    watchedAt: recent.watchedAt,
    minutes: 30
  }))
}

export const featuredService = {
  async getHeroCandidates(now: Date = new Date()): Promise<HeroCandidate[]> {
    const channelState = useChannelStore.getState()
    const settings = useSettingsStore.getState()
    const allChannels = channelState.channels

    if (!allChannels || allChannels.length === 0) return []

    // 1. Strictly filter out regional channels, non-sports regional languages, and junk tickers
    const eligibleChannels = allChannels.filter(isHeroEligibleChannel)
    const pool = eligibleChannels.length > 0 ? eligibleChannels : allChannels

    // 2. Fetch editorial feed and filter entries to eligible channels only
    const rawEditorial = await fetchEditorial(now)
    const eligibleIds = new Set(pool.map((c) => c.id))
    const editorial = rawEditorial ? rawEditorial.filter((e) => eligibleIds.has(e.channelId)) : null

    // 3. Rank eligible candidates
    const ranked = rankHeroCandidates({
      channels: pool,
      epg: channelState.epg,
      favorites: channelState.favorites,
      history: historyFromRecents(channelState.recents),
      language: settings.language,
      now,
      editorial
    })

    // 4. Curate top 5 slots: Top 3 Sports HD + Top 2 High-Quality News HD (deduplicating SD feeds)
    return curateHeroCandidates(ranked)
  }
}

export function saveHeroLast(channelIds: string[], at = Date.now()): void {
  try {
    localStorage.setItem(HERO_LAST_KEY, JSON.stringify({ channelIds, at }))
  } catch {
    // Storage can be unavailable in private/incognito contexts.
  }
}

export function loadHeroLast(): string[] {
  try {
    const raw = localStorage.getItem(HERO_LAST_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { channelIds?: unknown }
    return Array.isArray(parsed.channelIds)
      ? parsed.channelIds.filter((id): id is string => typeof id === 'string')
      : []
  } catch {
    return []
  }
}
