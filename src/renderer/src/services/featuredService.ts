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
  if (b.score !== a.score) return b.score - a.score
  if (a.channel.number !== b.channel.number) return a.channel.number - b.channel.number
  return a.channel.id.localeCompare(b.channel.id)
}

const MAJOR_NETWORKS_REGEX =
  /sports\s*18|sony\s*ten|star\s*sports|dd\s*sports|eurosport|aaj\s*tak|ndtv|abp\s*news|india\s*today|republic|news\s*18\s*india|zee\s*news|times\s*now|wion|colors|star\s*plus|sony\s*sab|set\s*india|sony\s*entertainment|zee\s*tv|star\s*gold|sony\s*max|zee\s*cinema/i

export function getChannelProminence(channel: Channel): number {
  const name = channel.name.toLowerCase()
  let score = 0
  if (channel.category === 'sports') score += 50
  else if (channel.category === 'news') score += 40
  else if (channel.category === 'entertainment') score += 20
  else if (channel.category === 'movies') score += 15

  if (MAJOR_NETWORKS_REGEX.test(name)) score += 60
  if (channel.quality.includes('HD') || channel.quality.includes('4K')) score += 5
  return score
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
    const editorial = await fetchEditorial(now)
    return rankHeroCandidates({
      channels: channelState.channels,
      epg: channelState.epg,
      favorites: channelState.favorites,
      history: historyFromRecents(channelState.recents),
      language: settings.language,
      now,
      editorial
    })
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
