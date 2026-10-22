import type { Channel, Program } from '@shared/types'

// ---------------------------------------------------------------------------
// Dictionaries: Numbers, Words, Roman Numerals, Acronyms, and Categories
// ---------------------------------------------------------------------------

const NUMBER_WORD_MAP: Record<string, string> = {
  zero: '0',
  one: '1',
  first: '1',
  i: '1',
  two: '2',
  second: '2',
  ii: '2',
  three: '3',
  third: '3',
  iii: '3',
  four: '4',
  fourth: '4',
  iv: '4',
  five: '5',
  fifth: '5',
  v: '5',
  six: '6',
  sixth: '6',
  vi: '6',
  seven: '7',
  seventh: '7',
  vii: '7',
  eight: '8',
  eighth: '8',
  viii: '8',
  nine: '9',
  ninth: '9',
  ix: '9',
  ten: '10',
  tenth: '10',
  x: '10',
  eleven: '11',
  twelve: '12',
  eighteen: '18',
  twentyfour: '24'
}

const DIGIT_TO_WORDS: Record<string, string[]> = {
  '0': ['zero'],
  '1': ['one', 'first', 'i'],
  '2': ['two', 'second', 'ii'],
  '3': ['three', 'third', 'iii'],
  '4': ['four', 'fourth', 'iv'],
  '5': ['five', 'fifth', 'v'],
  '6': ['six', 'sixth', 'vi'],
  '7': ['seven', 'seventh', 'vii'],
  '8': ['eight', 'eighth', 'viii'],
  '9': ['nine', 'ninth', 'ix'],
  '10': ['ten', 'tenth', 'x'],
  '11': ['eleven'],
  '12': ['twelve'],
  '18': ['eighteen'],
  '24': ['twentyfour']
}

/** Common Indian broadcast channel shortcodes and acronyms. */
const ACRONYM_MAP: Record<string, string[]> = {
  ss1: ['star', 'sports', '1'],
  ss2: ['star', 'sports', '2'],
  ss3: ['star', 'sports', '3'],
  ss: ['star', 'sports'],
  st1: ['sony', 'ten', '1'],
  st2: ['sony', 'ten', '2'],
  st3: ['sony', 'ten', '3'],
  st4: ['sony', 'ten', '4'],
  st5: ['sony', 'ten', '5'],
  sm: ['sony', 'max'],
  sp: ['star', 'plus'],
  sg: ['star', 'gold'],
  sb: ['star', 'bharat'],
  ztv: ['zee', 'tv'],
  zc: ['zee', 'cinema'],
  zn: ['zee', 'news'],
  dd: ['doordarshan', 'dd'],
  abp: ['abp'],
  ndtv: ['ndtv'],
  cn: ['cartoon', 'network'],
  pogo: ['pogo'],
  ngc: ['national', 'geographic'],
  natgeo: ['national', 'geographic']
}

/** Category and genre colloquial search synonyms. */
const CATEGORY_SYNONYMS: Record<string, string[]> = {
  sports: ['sport', 'khel', 'cricket', 'football', 'wrestling', 'match', 'game'],
  news: ['samachar', 'khabar', 'bulletin', 'media', 'headlines'],
  movies: ['movie', 'cinema', 'film', 'filam', 'picture', 'talkies'],
  music: ['songs', 'song', 'gaana', 'gaan', 'sangeet', 'tracks'],
  kids: ['cartoon', 'bachhe', 'bachpan', 'anime'],
  entertainment: ['drama', 'serial', 'serials', 'show', 'shows', 'dailysoap'],
  lifestyle: ['food', 'travel', 'living', 'cooking'],
  infotainment: ['knowledge', 'wildlife', 'science', 'nature', 'documentary'],
  devotional: ['bhakti', 'spiritual', 'puja', 'darshan', 'prayer', 'bhajan']
}

/** Language aliases and abbreviations. */
const LANGUAGE_ALIASES: Record<string, string[]> = {
  hindi: ['hin', 'hind'],
  english: ['eng'],
  tamil: ['tam'],
  telugu: ['tel'],
  kannada: ['kan'],
  malayalam: ['mal'],
  bengali: ['ben', 'bangla'],
  marathi: ['mar'],
  gujarati: ['guj'],
  punjabi: ['pun'],
  bhojpuri: ['bhoj'],
  urdu: ['urd'],
  assamese: ['asm', 'asomiya'],
  oriya: ['odia', 'ori']
}

// ---------------------------------------------------------------------------
// Known TV vocabulary for compound word splitting (e.g. "sonythree" -> "sony three")
// ---------------------------------------------------------------------------

const KNOWN_WORDS: string[] = [
  // Numbers
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'eighteen', 'twentyfour',
  'first', 'second', 'third', 'fourth', 'fifth',
  // Quality
  'hd', 'sd', 'fhd', 'uhd', '4k',
  // Common TV brands & terms
  'sony', 'star', 'zee', 'colors', 'sports', 'sport', 'ten', 'max', 'sab', 'pal', 'yay',
  'wah', 'cinemax', 'cinema', 'cineplex', 'movies', 'movie', 'film', 'filam', 'music',
  'news', 'khabar', 'samachar', 'india', 'today', 'ndtv', 'abp', 'aaj', 'tak', 'tez',
  'dd', 'doordarshan', 'national', 'bharati', 'urdu', 'punjabi', 'bengali', 'bangla',
  'marathi', 'gujarati', 'tamil', 'telugu', 'kannada', 'malayalam', 'bhojpuri', 'oriya',
  'plus', 'gold', 'bharat', 'utsav', 'action', 'classic', 'jalwa', 'mastiii', 'zoom',
  'zing', 'pogo', 'cartoon', 'network', 'hungama', 'disney', 'nick', 'sonic', 'discovery',
  'animal', 'planet', 'nat', 'geo', 'geographic', 'tlc', 'history', 'travel', 'food',
  'living', 'lifestyle', 'tv', 'enter', 'entertainment', 'rishtey', 'ananda', 'majha',
  'asmit', 'asmita', 'ganga', 'sanjha', 'bharatvarsh', 'bizz', 'prime', 'times', 'now',
  'et', 'mirror', 'cnbc', 'aawaz', 'bazaar', 'wion', 'republic', 'live', 'super', 'select'
]

const KNOWN_WORDS_SET = new Set(KNOWN_WORDS)

/**
 * Splits glued compound words like "sonythree" -> ["sony", "three"],
 * "starsports" -> ["star", "sports"], "aajtak" -> ["aaj", "tak"].
 */
export function splitCompoundWords(token: string): string[] {
  if (token.length <= 3) return [token]
  if (KNOWN_WORDS_SET.has(token)) return [token]

  const memo = new Map<string, string[] | null>()

  function segment(s: string): string[] | null {
    if (!s) return []
    if (memo.has(s)) return memo.get(s)!

    if (KNOWN_WORDS_SET.has(s) || /^\d+$/.test(s)) {
      return [s]
    }

    for (let len = Math.min(s.length - 1, 15); len >= 2; len--) {
      const prefix = s.slice(0, len)
      if (KNOWN_WORDS_SET.has(prefix) || /^\d+$/.test(prefix)) {
        const rest = s.slice(len)
        const restSegments = segment(rest)
        if (restSegments !== null) {
          const result = [prefix, ...restSegments]
          memo.set(s, result)
          return result
        }
      }
    }

    memo.set(s, null)
    return null
  }

  const segments = segment(token)
  return segments && segments.length > 1 ? segments : [token]
}

/**
 * Returns true if needle characters appear in haystack in sequential order.
 */
function isSubsequence(needle: string, haystack: string): boolean {
  if (!needle || !haystack) return false
  let nIdx = 0
  for (let hIdx = 0; hIdx < haystack.length && nIdx < needle.length; hIdx++) {
    if (needle[nIdx] === haystack[hIdx]) {
      nIdx++
    }
  }
  return nIdx === needle.length
}

// ---------------------------------------------------------------------------
// Text Preprocessing and Tokenization
// ---------------------------------------------------------------------------

/**
 * Splits text into clean lowercase tokens, converting punctuation,
 * splitting joined letter-digits (e.g. "sony3" -> "sony 3", "24x7" -> "24 7"),
 * splitting glued compound words ("sonythree" -> "sony three"),
 * and replacing "+" with "plus" (e.g. "star+" -> "star plus").
 */
export function tokenize(text: string): string[] {
  if (!text) return []
  let s = text.toLowerCase().trim()
  s = s.replace(/\+/g, ' plus ')
  s = s.replace(/24\s*[x*]\s*7/gi, ' 24 7 ')
  // Split letters followed by numbers or vice-versa: "sony10" -> "sony 10"
  s = s.replace(/([a-z]+)(\d+)/g, '$1 $2')
  s = s.replace(/(\d+)([a-z]+)/g, '$1 $2')
  s = s.replace(/[^a-z0-9]/g, ' ')
  const rawTokens = s.split(/\s+/).filter(Boolean)

  const tokens: string[] = []
  for (const token of rawTokens) {
    const segments = splitCompoundWords(token)
    tokens.push(...segments)
  }
  return tokens
}

/**
 * Standard Levenshtein distance for fuzzy typo matching.
 */
function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99
  const m = a.length
  const n = b.length
  const d: number[] = new Array(n + 1).fill(0)
  for (let j = 0; j <= n; j++) d[j] = j

  for (let i = 1; i <= m; i++) {
    let prev = d[0]
    d[0] = i
    for (let j = 1; j <= n; j++) {
      const temp = d[j]
      if (a[i - 1] === b[j - 1]) {
        d[j] = prev
      } else {
        d[j] = Math.min(prev + 1, d[j] + 1, d[j - 1] + 1)
      }
      prev = temp
    }
  }
  return d[n]
}

/**
 * Tests if a query token matches a channel token.
 * Handles exact matches, number-word equivalences ("10" <-> "ten", "3" <-> "three"),
 * prefixes ("son" -> "sony"), and typo tolerance.
 */
function matchToken(
  qToken: string,
  cToken: string
): { matched: boolean; score: number } {
  // 1. Exact match
  if (qToken === cToken) {
    return { matched: true, score: 100 }
  }

  // 2. Number-to-word and word-to-number equivalence
  // e.g. "10" matches "ten", "three" matches "3", "3" matches "three"
  const qNum = NUMBER_WORD_MAP[qToken] ?? qToken
  const cNum = NUMBER_WORD_MAP[cToken] ?? cToken
  if (
    qNum === cNum &&
    (qToken in NUMBER_WORD_MAP ||
      cToken in NUMBER_WORD_MAP ||
      DIGIT_TO_WORDS[qToken] ||
      DIGIT_TO_WORDS[cToken])
  ) {
    return { matched: true, score: 95 }
  }

  // 3. Prefix matching (e.g. "son" in "sony", "star" in "starsports")
  if (qToken.length >= 2 && cToken.startsWith(qToken)) {
    const ratio = qToken.length / cToken.length
    return { matched: true, score: 75 + Math.round(ratio * 20) }
  }

  // 4. Typo tolerance (1 typo for 4-6 chars, 2 typos for 7+ chars)
  if (qToken.length >= 4 && cToken.length >= 4) {
    const dist = levenshtein(qToken, cToken)
    const maxAllowed = qToken.length >= 7 ? 2 : 1
    if (dist <= maxAllowed) {
      return { matched: true, score: 65 - dist * 15 }
    }
  }

  return { matched: false, score: 0 }
}

// ---------------------------------------------------------------------------
// Smart Scoring Core
// ---------------------------------------------------------------------------

export interface ScoredChannel {
  channel: Channel
  score: number
  matchedReason?: string
}

/**
 * Computes the smart search relevance score of a channel against user query.
 */
export function scoreChannel(
  channel: Channel,
  rawQuery: string,
  epgProgram?: Program
): ScoredChannel {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return { channel, score: 0 }

  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return { channel, score: 0 }

  let score = 0
  let matchedReason: string | undefined

  const channelNumberStr = channel.number.toString()
  const channelNameTokens = tokenize(channel.name)
  const channelLangTokens = tokenize(channel.language || '')
  const channelCatTokens = tokenize(channel.category || '')
  const programTokens = epgProgram ? tokenize(epgProgram.title) : []

  // Check if query is purely numeric (channel number search)
  const isNumericQuery = /^\d+$/.test(query)
  if (isNumericQuery) {
    if (channelNumberStr === query) {
      // Direct exact channel number match -> top priority
      score += 2000
      matchedReason = `Channel ${channel.number}`
    } else if (channelNumberStr.startsWith(query)) {
      score += 1200 - (channelNumberStr.length - query.length) * 50
    }
  }

  // Exact full name match
  const rawCleanName = channel.name.toLowerCase().trim()
  if (rawCleanName === query) {
    score += 1500
    matchedReason = 'Exact name match'
  } else if (rawCleanName.startsWith(query)) {
    score += 1100
  }

  // Check acronym expansion (e.g. user typed "ss1" or "st3")
  const acronymExpansion = ACRONYM_MAP[query]
  const effectiveQueryTokens = acronymExpansion ?? queryTokens

  // Match query tokens against channel name tokens
  let nameMatches = 0
  let nameMatchScoreTotal = 0
  let lastMatchedChannelIndex = -1
  let inOrderCount = 0

  for (const qToken of effectiveQueryTokens) {
    let bestTokenScore = 0
    let bestTokenIndex = -1

    for (let i = 0; i < channelNameTokens.length; i++) {
      const match = matchToken(qToken, channelNameTokens[i])
      if (match.matched && match.score > bestTokenScore) {
        bestTokenScore = match.score
        bestTokenIndex = i
      }
    }

    if (bestTokenScore > 0) {
      nameMatches += 1
      nameMatchScoreTotal += bestTokenScore
      if (bestTokenIndex > lastMatchedChannelIndex) {
        inOrderCount += 1
      }
      lastMatchedChannelIndex = bestTokenIndex
    }
  }

  // If tokens matched in channel name:
  if (nameMatches > 0) {
    const fractionMatched = nameMatches / effectiveQueryTokens.length
    // Base name score
    score += nameMatchScoreTotal * 3 * fractionMatched

    // Bonus if ALL query tokens matched channel name tokens
    // (e.g. "sony 3" matches "Sony Ten 3 HD", "sony 10 three" matches "Sony Ten 3 HD")
    if (nameMatches === effectiveQueryTokens.length) {
      score += 600
      // In-order sequence bonus
      if (inOrderCount === nameMatches) {
        score += 150
      }
    }
  }

  // Collapsed substring and subsequence matching (e.g. "sony3" or "sonythree" in "sonyten3")
  const collapsedQuery = queryTokens
    .map((t) => NUMBER_WORD_MAP[t] ?? t)
    .join('')
  const collapsedChannel = channelNameTokens
    .map((t) => NUMBER_WORD_MAP[t] ?? t)
    .join('')

  if (collapsedQuery.length >= 3) {
    if (collapsedChannel.includes(collapsedQuery)) {
      score += 450
    } else if (isSubsequence(collapsedQuery, collapsedChannel)) {
      score += 250
    }
  }

  // Match language tokens (e.g. "hindi", "tamil", "english")
  for (const qToken of queryTokens) {
    for (const [lang, aliases] of Object.entries(LANGUAGE_ALIASES)) {
      if (qToken === lang || aliases.includes(qToken)) {
        if (channelLangTokens.some((t) => t === lang || aliases.includes(t))) {
          score += 180
          if (!matchedReason) matchedReason = channel.language
        }
      }
    }
  }

  // Match category / genre synonyms (e.g. "sports", "cricket", "news", "movie")
  for (const qToken of queryTokens) {
    for (const [cat, syns] of Object.entries(CATEGORY_SYNONYMS)) {
      if (qToken === cat || syns.includes(qToken)) {
        if (channelCatTokens.some((t) => t === cat || syns.includes(t))) {
          score += 140
          if (!matchedReason) matchedReason = channel.category
        }
      }
    }
  }

  // Match currently running EPG program title (e.g. user searches for a show or live event)
  if (programTokens.length > 0) {
    let epgTokenMatches = 0
    for (const qToken of queryTokens) {
      for (const pToken of programTokens) {
        const match = matchToken(qToken, pToken)
        if (match.matched) {
          epgTokenMatches += 1
          score += match.score * 1.5
          break
        }
      }
    }
    if (epgTokenMatches === queryTokens.length && queryTokens.length > 0) {
      score += 350
      matchedReason = epgProgram?.title
    }
  }

  // Match quality intent: if user typed "hd", boost HD channels. If "sd", boost SD channels.
  const wantsHD = queryTokens.includes('hd') || queryTokens.includes('fhd') || queryTokens.includes('4k')
  const wantsSD = queryTokens.includes('sd')
  const isHD =
    channel.quality?.some((q) => q.toUpperCase() === 'HD' || q.toUpperCase() === '4K') ||
    channel.name.toUpperCase().includes('HD')

  if (wantsHD) {
    if (isHD) score += 120
    else score -= 80
  } else if (wantsSD) {
    if (!isHD) score += 120
    else score -= 80
  } else if (score > 0) {
    // Subtle tie-breaker preference for HD when not explicitly specified
    if (isHD) score += 15
  }

  // Popularity / rank tie-breaker
  if (score > 0) {
    const popularity = channel.popularity ?? (channel.viewers ? Math.min(channel.viewers / 100, 20) : 0)
    score += Math.min(popularity, 20)
  }

  return { channel, score, matchedReason }
}

/**
 * Intelligent channel search that handles:
 * - Number-word equivalence ("sony 10 three" -> "Sony Ten 3")
 * - Sub-token matching ("sony 3" -> "Sony Ten 3 HD")
 * - Acronym expansion ("ss1" -> "Star Sports 1", "st3" -> "Sony Ten 3")
 * - Typo tolerance ("soony" -> "sony")
 * - Channel number direct search ("154")
 * - Live EPG program title match ("wwe", "kapil sharma")
 * - Category / language semantics ("hindi sports", "news")
 */
export function smartSearchChannels(
  query: string,
  channels: Channel[],
  epg: Record<string, Program[]> = {},
  now: Date = new Date(),
  limit = 20
): Channel[] {
  const trimmed = query.trim()
  if (!trimmed) return []

  const scored: ScoredChannel[] = []

  for (const channel of channels) {
    // Find current active program if EPG exists
    const programs = epg[channel.id]
    let currentProgram: Program | undefined
    if (programs && programs.length > 0) {
      const nowMs = now.getTime()
      currentProgram = programs.find((p) => {
        const start = Date.parse(p.start)
        const end = Date.parse(p.end)
        return nowMs >= start && nowMs <= end
      })
    }

    const result = scoreChannel(channel, trimmed, currentProgram)
    if (result.score > 25) {
      scored.push(result)
    }
  }

  // Sort by score descending; tie-break by lower channel number
  scored.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 0.001) {
      return b.score - a.score
    }
    return a.channel.number - b.channel.number
  })

  const results = scored.slice(0, limit).map((s) => s.channel)
  return results
}
