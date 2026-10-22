import type { Channel, Program } from '@shared/types'

export interface ScoredChannel {
  channel: Channel
  score: number
  reasons: string[]
}

export interface PopularityEngineConfig {
  allowedLanguages: string[]
  topN: number
}

export const DEFAULT_POPULARITY_CONFIG: PopularityEngineConfig = {
  allowedLanguages: ['English', 'Hindi'],
  topN: 5
}

// ── Heuristic Scoring Weights ─────────────────────────────────────────────

const MARQUEE_SPORTS_BRANDS = [
  { pattern: /\bstar\s*sports\b/i, score: 1200, name: 'Star Sports' },
  { pattern: /\b(sony\s*(sports\s*)?ten|\bten\s*[1-5]\b|sony\s*six)\b/i, score: 1200, name: 'Sony Sports' },
  { pattern: /\bsports\s*18\b/i, score: 1100, name: 'Sports18' },
  { pattern: /\beurosport\b/i, score: 1000, name: 'Eurosport' },
  { pattern: /\bdd\s*sports\b/i, score: 900, name: 'DD Sports' },
  { pattern: /\bespn\b/i, score: 900, name: 'ESPN' }
]

const MARQUEE_NEWS_BRANDS = [
  { pattern: /\baaj\s*tak\b/i, score: 800, name: 'Aaj Tak' },
  { pattern: /\bndtv\b/i, score: 750, name: 'NDTV' },
  { pattern: /\bindia\s*today\b/i, score: 750, name: 'India Today' },
  { pattern: /\btimes\s*now\b/i, score: 750, name: 'Times Now' },
  { pattern: /\brepublic\b/i, score: 700, name: 'Republic' },
  { pattern: /\bcnn(-|\s*)news\s*18\b/i, score: 700, name: 'CNN-News18' },
  { pattern: /\b(zee\s*news|abp\s*news|news\s*18\s*india|india\s*tv)\b/i, score: 650, name: 'National News' },
  { pattern: /\b(wion|bbc(\s*world)?\s*news|cnbc\s*(tv18)?|et\s*now)\b/i, score: 600, name: 'Business/Global News' }
]

const REGIONAL_NAME_INDICATORS =
  /\b(marathi|telugu|tamil|kannada|malayalam|bengali|gujarati|punjabi|bhojpuri|odia|oriya|assamese|urdu)\b/i

const JUNK_OR_NICHE_INDICATORS =
  /(shopping|teleshopping|naaptol|darshan|bhakti|aastha|sadhna|sanskar|peace\s*tv|subhavaartha|shubh|dangal\s*2|b4u\s*(bhojpuri|kadak)|manoranjan|maha\s*movie|cinemachi|test\b|chess\b|gangaur|ganagaur)/i

const LIVE_EVENT_KEYWORDS =
  /\b(live|match|final|semi[- ]final|tournament|premier league|ipl|isl|world cup|trophy|championship|cup|grand prix|racing|derby|breaking|debate|prime time|special report|bulletin|newsroom)\b/i

/**
 * Normalizes channel name for deduplicating simulcasts (e.g., HD vs SD).
 */
export function getBaseNetworkName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(hd|sd|4k|uhd|\+)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 1. Filter Channels
 * Keeps only channels whose category is Sports or News,
 * strictly excludes regional languages and regional name keywords,
 * and eliminates junk, niche, or shopping channels.
 */
export function filterChannels(
  channels: Channel[],
  config: PopularityEngineConfig = DEFAULT_POPULARITY_CONFIG
): Channel[] {
  const allowedSet = new Set(config.allowedLanguages.map((l) => l.trim().toLowerCase()))

  return channels.filter((channel) => {
    // 1. Category must be Sports or News
    const category = (channel.category || '').trim().toLowerCase()
    if (category !== 'sports' && category !== 'news') return false

    // 2. Language must be in allowed languages (e.g. English, Hindi)
    const lang = (channel.language || '').trim().toLowerCase()
    if (lang && !allowedSet.has(lang)) return false

    // 3. Exclude regional language keywords in name
    if (REGIONAL_NAME_INDICATORS.test(channel.name)) return false

    // 4. Exclude junk / niche / teleshopping / promotional channels
    if (JUNK_OR_NICHE_INDICATORS.test(channel.name)) return false

    return true
  })
}

/**
 * 2. Scoring Algorithm (Weighted Heuristics)
 * - Brand Prominence (Weight: High)
 * - Quality Badge (Weight: Medium)
 * - Language Preference (Weight: Medium)
 * - EPG "Live Event" Boost (Weight: Very High)
 */
export function scoreChannel(
  channel: Channel,
  currentProgram?: Program | null,
  config: PopularityEngineConfig = DEFAULT_POPULARITY_CONFIG
): ScoredChannel {
  let score = 0
  const reasons: string[] = []
  const category = (channel.category || '').toLowerCase()

  // Base Category weight (Sports prioritized for hero stage)
  if (category === 'sports') {
    score += 400
    reasons.push('Sports category (+400)')
  } else if (category === 'news') {
    score += 200
    reasons.push('News category (+200)')
  }

  // 1. Brand Prominence (Weight: High)
  let brandMatched = false
  for (const b of MARQUEE_SPORTS_BRANDS) {
    if (b.pattern.test(channel.name)) {
      score += b.score
      reasons.push(`${b.name} brand (+${b.score})`)
      brandMatched = true
      break
    }
  }
  if (!brandMatched) {
    for (const b of MARQUEE_NEWS_BRANDS) {
      if (b.pattern.test(channel.name)) {
        score += b.score
        reasons.push(`${b.name} brand (+${b.score})`)
        brandMatched = true
        break
      }
    }
  }

  // 2. Quality Badge (Weight: Medium)
  const isHD =
    Boolean(channel.quality && (channel.quality.includes('HD') || channel.quality.includes('4K'))) ||
    /\b(hd|4k|uhd)\b/i.test(channel.name)
  if (isHD) {
    score += 250
    reasons.push('HD/4K Quality (+250)')
  }

  // 3. Language Preference (Weight: Medium)
  const lang = (channel.language || '').toLowerCase()
  if (config.allowedLanguages.map((l) => l.toLowerCase()).includes(lang)) {
    score += 150
    reasons.push(`${channel.language} national appeal (+150)`)
  }

  // 4. EPG "Live Event" Boost (Weight: Very High)
  if (currentProgram) {
    const textToCheck = `${currentProgram.title} ${currentProgram.description || ''} ${currentProgram.genre || ''}`
    if (LIVE_EVENT_KEYWORDS.test(textToCheck)) {
      score += 800
      reasons.push(`Live event: "${currentProgram.title}" (+800)`)
    }
  }

  return { channel, score, reasons }
}

/**
 * 3. Implementation Details
 * - Filter channels to Sports & News (excluding regional)
 * - Score every channel with weighted heuristics
 * - Deduplicate simulcasts (prefer higher-scoring HD over SD)
 * - Sort descending and return top N channels (default 5-7)
 */
export function rankChannels(
  channels: Channel[],
  epgData?: Record<string, Program[]> | null,
  config: PopularityEngineConfig = DEFAULT_POPULARITY_CONFIG
): ScoredChannel[] {
  const eligible = filterChannels(channels, config)
  if (eligible.length === 0) return []

  const nowMs = Date.now()
  const scored = eligible.map((channel) => {
    let current: Program | null = null
    if (epgData && epgData[channel.id]) {
      current =
        epgData[channel.id].find((p) => {
          const s = Date.parse(p.start)
          const e = Date.parse(p.end)
          return s <= nowMs && nowMs < e
        }) ?? null
    }
    return scoreChannel(channel, current, config)
  })

  // Deduplicate base channel names, keeping highest scoring version (e.g. HD over SD)
  const seenBase = new Map<string, ScoredChannel>()
  for (const item of scored) {
    const base = getBaseNetworkName(item.channel.name)
    const existing = seenBase.get(base)
    if (!existing || item.score > existing.score) {
      seenBase.set(base, item)
    }
  }

  const deduped = Array.from(seenBase.values())

  // Sort descending by score, tie-break by channel number
  deduped.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.channel.number - b.channel.number
  })

  return deduped.slice(0, config.topN)
}

export const popularityEngine = {
  filterChannels,
  scoreChannel,
  rankChannels
}
