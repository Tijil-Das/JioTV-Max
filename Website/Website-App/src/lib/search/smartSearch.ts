import type { Channel, ChannelCategory, ChannelQuality, Program } from '@shared/types'

// ---------------------------------------------------------------------------
// Dictionaries: Numbers, Words, Roman Numerals, Acronyms, and Categories
// ---------------------------------------------------------------------------

export const NUMBER_WORD_MAP: Record<string, string> = {
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

export const DIGIT_TO_WORDS: Record<string, string[]> = {
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
export const ACRONYM_MAP: Record<string, string[]> = {
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
export const CATEGORY_SYNONYMS: Record<string, string[]> = {
  sports: [
    'sport',
    'khel',
    'cricket',
    'football',
    'wrestling',
    'match',
    'game',
    'kabaddi',
    'isl',
    'ipl',
    'wpl',
    'tennis',
    'badminton',
    'wwe',
    'raw',
    'smackdown',
    'f1',
    'racing',
    'athletics'
  ],
  news: [
    'samachar',
    'khabar',
    'bulletin',
    'media',
    'headlines',
    'breaking',
    'taza',
    'business',
    'market',
    'stock',
    'bizz',
    'politics',
    'debate'
  ],
  movies: [
    'movie',
    'cinema',
    'film',
    'filam',
    'picture',
    'talkies',
    'action',
    'thriller',
    'blockbuster',
    'bollywood',
    'hollywood',
    'tollywood'
  ],
  music: [
    'songs',
    'song',
    'gaana',
    'gaan',
    'sangeet',
    'tracks',
    'geet',
    'dhun',
    'beats',
    'pop',
    'rock',
    'dj',
    'hits'
  ],
  kids: [
    'cartoon',
    'bachhe',
    'bachpan',
    'anime',
    'animation',
    'pogo',
    'disney',
    'hungama',
    'chhota',
    'bheem',
    'motu',
    'patlu'
  ],
  entertainment: [
    'drama',
    'serial',
    'serials',
    'show',
    'shows',
    'dailysoap',
    'natak',
    'kahani',
    'dharavahik',
    'comedy',
    'reality'
  ],
  lifestyle: ['food', 'travel', 'living', 'cooking', 'khana', 'rasoi', 'recipe', 'fashion', 'health'],
  infotainment: [
    'knowledge',
    'wildlife',
    'science',
    'nature',
    'documentary',
    'discovery',
    'animal',
    'planet',
    'history',
    'space'
  ],
  devotional: [
    'bhakti',
    'spiritual',
    'puja',
    'darshan',
    'prayer',
    'bhajan',
    'aarti',
    'katha',
    'satsang',
    'gurbani',
    'islamic',
    'christian'
  ]
}

/** Language aliases and abbreviations. */
export const LANGUAGE_ALIASES: Record<string, string[]> = {
  hindi: ['hin', 'hind', 'hindustani'],
  english: ['eng', 'angrezi'],
  tamil: ['tam', 'thamizh'],
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

/** Broadcaster network and media group mapping. */
export const BROADCASTER_NETWORKS: Record<
  string,
  { aliases: string[]; channelKeywords: string[] }
> = {
  sony: {
    aliases: ['sony', 'spni', 'sony pictures', 'culver max'],
    channelKeywords: ['sony', 'sab', 'max', 'pal', 'yay', 'wah', 'pix', 'ten', 'earth']
  },
  star: {
    aliases: ['star', 'disney star', 'disney', 'star india'],
    channelKeywords: [
      'star',
      'plus',
      'bharat',
      'gold',
      'utsav',
      'sports',
      'jalsha',
      'pravah',
      'vijay',
      'maa',
      'suvarna',
      'asianet',
      'hungama',
      'disney'
    ]
  },
  zee: {
    aliases: ['zee', 'essel', 'zee entertainment'],
    channelKeywords: [
      'zee',
      'cinema',
      'talkies',
      'chitramandir',
      'zing',
      'zest',
      'cafe',
      'andtv',
      '&tv',
      'andpictures',
      '&pictures',
      '&flix',
      '&xplor'
    ]
  },
  colors: {
    aliases: ['colors', 'viacom', 'viacom18', 'network18', 'tv18'],
    channelKeywords: [
      'colors',
      'rishtey',
      'cineplex',
      'mtv',
      'beats',
      'vh1',
      'nickelodeon',
      'nick',
      'sonic',
      'comedy central',
      'news18',
      'cnbc',
      'cnn news18'
    ]
  },
  times: {
    aliases: ['times', 'times network', 'bennett coleman'],
    channelKeywords: ['times now', 'et now', 'mirror now', 'zoom']
  },
  indiatoday: {
    aliases: ['india today', 'tv today', 'aaj tak'],
    channelKeywords: ['aaj tak', 'india today', 'good news today', 'tez']
  },
  ndtv: {
    aliases: ['ndtv'],
    channelKeywords: ['ndtv']
  },
  dd: {
    aliases: ['dd', 'doordarshan', 'prasar bharati'],
    channelKeywords: [
      'dd',
      'doordarshan',
      'national',
      'news',
      'sports',
      'bharati',
      'kisan',
      'retro',
      'urdu',
      'india',
      'yadagiri',
      'saptagiri',
      'chandana',
      'sahyadri'
    ]
  },
  sun: {
    aliases: ['sun', 'sun network', 'sun tv network'],
    channelKeywords: ['sun', 'ktv', 'gemini', 'surya', 'udaya']
  },
  etv: {
    aliases: ['etv', 'eenadu'],
    channelKeywords: ['etv']
  },
  abp: {
    aliases: ['abp', 'abp network'],
    channelKeywords: ['abp']
  }
}

// ---------------------------------------------------------------------------
// Known TV vocabulary for compound word splitting (e.g. "sonythree" -> "sony three")
// ---------------------------------------------------------------------------

const KNOWN_WORDS: string[] = [
  // Numbers
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'eighteen',
  'twentyfour',
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  // Quality
  'hd',
  'sd',
  'fhd',
  'uhd',
  '4k',
  // Common TV brands & terms
  'sony',
  'star',
  'zee',
  'colors',
  'sports',
  'sport',
  'ten',
  'max',
  'sab',
  'pal',
  'yay',
  'wah',
  'cinemax',
  'cinema',
  'cineplex',
  'movies',
  'movie',
  'film',
  'filam',
  'music',
  'news',
  'khabar',
  'samachar',
  'india',
  'today',
  'ndtv',
  'abp',
  'aaj',
  'tak',
  'tez',
  'dd',
  'doordarshan',
  'national',
  'bharati',
  'urdu',
  'punjabi',
  'bengali',
  'bangla',
  'marathi',
  'gujarati',
  'tamil',
  'telugu',
  'kannada',
  'malayalam',
  'bhojpuri',
  'oriya',
  'plus',
  'gold',
  'bharat',
  'utsav',
  'action',
  'classic',
  'jalwa',
  'mastiii',
  'zoom',
  'zing',
  'pogo',
  'cartoon',
  'network',
  'hungama',
  'disney',
  'nick',
  'sonic',
  'discovery',
  'animal',
  'planet',
  'nat',
  'geo',
  'geographic',
  'tlc',
  'history',
  'travel',
  'food',
  'living',
  'lifestyle',
  'tv',
  'enter',
  'entertainment',
  'rishtey',
  'ananda',
  'majha',
  'asmit',
  'asmita',
  'ganga',
  'sanjha',
  'bharatvarsh',
  'bizz',
  'prime',
  'times',
  'now',
  'et',
  'mirror',
  'cnbc',
  'aawaz',
  'bazaar',
  'wion',
  'republic',
  'live',
  'super',
  'select'
]

const KNOWN_WORDS_SET = new Set(KNOWN_WORDS)

// Persistent caches to eliminate repeated string parsing across keystrokes
const compoundWordsCache = new Map<string, string[]>()
const tokenizeCache = new Map<string, string[]>()
const phoneticCache = new Map<string, string>()

/**
 * Splits glued compound words like "sonythree" -> ["sony", "three"],
 * "starsports" -> ["star", "sports"], "aajtak" -> ["aaj", "tak"].
 */
export function splitCompoundWords(token: string): string[] {
  if (token.length <= 3) return [token]
  if (KNOWN_WORDS_SET.has(token)) return [token]

  const cached = compoundWordsCache.get(token)
  if (cached) return cached

  function segment(s: string): string[] | null {
    if (!s) return []
    const fromCache = compoundWordsCache.get(s)
    if (fromCache) return fromCache

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
          compoundWordsCache.set(s, result)
          return result
        }
      }
    }

    return null
  }

  const segments = segment(token)
  const finalResult = segments && segments.length > 1 ? segments : [token]
  if (compoundWordsCache.size < 5000) {
    compoundWordsCache.set(token, finalResult)
  }
  return finalResult
}

/**
 * Returns true if needle characters appear in haystack in sequential order.
 */
export function isSubsequence(needle: string, haystack: string): boolean {
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
  const cached = tokenizeCache.get(text)
  if (cached) return cached

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

  if (tokenizeCache.size > 5000) tokenizeCache.clear()
  tokenizeCache.set(text, tokens)
  return tokens
}

// Reusable static matrix for Damerau-Levenshtein calculation (zero heap allocations)
const DL_MAX = 36
const dlMatrix: number[][] = Array.from({ length: DL_MAX }, () => new Array(DL_MAX).fill(0))
for (let i = 0; i < DL_MAX; i++) dlMatrix[i][0] = i
for (let j = 0; j < DL_MAX; j++) dlMatrix[0][j] = j

/**
 * Damerau-Levenshtein distance for fuzzy typo matching with transposition support.
 * Treats swapped adjacent characters (e.g. "snoy" -> "sony", "stra" -> "star") as 1 operation.
 * Utilizes pre-allocated static matrix to eliminate GC allocations and pauses.
 */
export function damerauLevenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a) return b.length
  if (!b) return a.length
  const m = a.length
  const n = b.length
  if (Math.abs(m - n) > 3) return 99
  if (m >= DL_MAX || n >= DL_MAX) return 99

  for (let i = 1; i <= m; i++) dlMatrix[i][0] = i
  for (let j = 1; j <= n; j++) dlMatrix[0][j] = j

  for (let i = 1; i <= m; i++) {
    const aChar = a[i - 1]
    for (let j = 1; j <= n; j++) {
      const bChar = b[j - 1]
      const cost = aChar === bChar ? 0 : 1
      let minVal = Math.min(
        dlMatrix[i - 1][j] + 1, // deletion
        dlMatrix[i][j - 1] + 1, // insertion
        dlMatrix[i - 1][j - 1] + cost // substitution
      )
      // Transposition
      if (i > 1 && j > 1 && aChar === b[j - 2] && a[i - 2] === bChar) {
        const transVal = dlMatrix[i - 2][j - 2] + cost
        if (transVal < minVal) minVal = transVal
      }
      dlMatrix[i][j] = minVal
    }
  }

  return dlMatrix[m][n]
}

/**
 * Generates a phonetic sound-alike representation for Indian TV queries.
 * Normalizes common vowel elongations, consonant variations, and suffixes.
 * Results are cached globally in-memory for sub-microsecond retrieval.
 */
export function phoneticKey(word: string): string {
  if (!word) return ''
  const cached = phoneticCache.get(word)
  if (cached !== undefined) return cached

  let s = word.toLowerCase().trim()
  s = s.replace(/ph/g, 'f')
  s = s.replace(/kh/g, 'k')
  s = s.replace(/gh/g, 'g')
  s = s.replace(/sh/g, 's')
  s = s.replace(/ch/g, 'c')
  s = s.replace(/ee/g, 'i')
  s = s.replace(/oo/g, 'u')
  s = s.replace(/ou/g, 'u')
  s = s.replace(/ai/g, 'e')
  s = s.replace(/ay/g, 'e')
  s = s.replace(/ck/g, 'k')
  s = s.replace(/qu/g, 'k')
  s = s.replace(/c(?=[eiy])/g, 's')
  s = s.replace(/c/g, 'k')
  s = s.replace(/q/g, 'k')
  s = s.replace(/x/g, 'ks')
  s = s.replace(/z/g, 's')
  s = s.replace(/j/g, 'z')
  s = s.replace(/[yw]$/g, 'i')
  // Collapse duplicate letters: "staar" -> "star"
  s = s.replace(/(.)\1+/g, '$1')
  // Remove vowels after the first character
  if (s.length > 1) {
    const first = s[0]
    const rest = s.slice(1).replace(/[aeiou]/g, '')
    s = first + rest
  }

  if (phoneticCache.size < 5000) {
    phoneticCache.set(word, s)
  }
  return s
}

/**
 * Tests if a query token matches a target token.
 * Handles exact matches, number-word equivalences ("10" <-> "ten", "3" <-> "three"),
 * phonetic sound-alikes ("soni" <-> "sony"), prefixes ("son" -> "sony"),
 * and Damerau-Levenshtein typo tolerance.
 */
export function matchToken(
  qToken: string,
  cToken: string
): { matched: boolean; score: number } {
  // 1. Exact match
  if (qToken === cToken) {
    return { matched: true, score: 100 }
  }

  // 2. Number-to-word and word-to-number equivalence
  const qNum = NUMBER_WORD_MAP[qToken] ?? qToken
  const cNum = NUMBER_WORD_MAP[cToken] ?? cToken
  if (
    qNum === cNum &&
    (qToken in NUMBER_WORD_MAP ||
      cToken in NUMBER_WORD_MAP ||
      DIGIT_TO_WORDS[qToken] !== undefined ||
      DIGIT_TO_WORDS[cToken] !== undefined)
  ) {
    return { matched: true, score: 95 }
  }

  // 3. Phonetic match (sound-alike)
  if (qToken.length >= 3 && cToken.length >= 3) {
    const qKey = phoneticKey(qToken)
    const cKey = phoneticKey(cToken)
    if (qKey.length >= 2 && qKey === cKey) {
      return { matched: true, score: 90 }
    }
  }

  // 4. Prefix matching (e.g. "son" in "sony", "star" in "starsports")
  if (qToken.length >= 2 && cToken.startsWith(qToken)) {
    const ratio = qToken.length / cToken.length
    return { matched: true, score: 75 + Math.round(ratio * 20) }
  }

  // 5. Typo tolerance with Damerau-Levenshtein (transposition support)
  if (qToken.length >= 3 && cToken.length >= 3) {
    const maxAllowed = qToken.length >= 7 ? 2 : 1
    if (Math.abs(qToken.length - cToken.length) <= maxAllowed) {
      const dist = damerauLevenshtein(qToken, cToken)
      if (dist <= maxAllowed) {
        return { matched: true, score: 65 - dist * 15 }
      }
    }
  }

  return { matched: false, score: 0 }
}

// ---------------------------------------------------------------------------
// Structured Filter Parsing
// ---------------------------------------------------------------------------

export interface ParsedFilters {
  cleanQuery: string
  targetChannelNumber?: string
  language?: string
  category?: ChannelCategory
  quality?: ChannelQuality
  isLive?: boolean
  isPremium?: boolean
  broadcaster?: string
}

/**
 * Extracts structured prefix parameters from query (e.g. "ch:162", "lang:hindi", "cat:sports", "quality:hd").
 * Also detects natural channel number indicators like "ch 162", "channel 162", "#162".
 */
export function parseQueryFilters(rawQuery: string): ParsedFilters {
  let clean = rawQuery.trim().toLowerCase()
  const result: ParsedFilters = { cleanQuery: clean }

  // 1. Channel number prefix forms: "ch 162", "channel 162", "#162", "ch:162", "no 162"
  const chNumberRegex = /^(?:ch(?:annel)?|no|number|#)[\s:]*(\d+)$/i
  const chMatch = clean.match(chNumberRegex)
  if (chMatch) {
    result.targetChannelNumber = chMatch[1]
    result.cleanQuery = chMatch[1]
    return result
  }

  // 2. Inline channel number tags: "ch:162" or "channel:162"
  clean = clean.replace(/\b(?:ch|channel|number):(\d+)\b/gi, (_, num) => {
    result.targetChannelNumber = num
    return ''
  })

  // 3. Language tag: "lang:hindi" or "language:tamil"
  clean = clean.replace(/\b(?:lang|language):([a-z]+)\b/gi, (_, lang) => {
    result.language = lang
    return ''
  })

  // 4. Category tag: "cat:sports", "category:news", "genre:movies"
  clean = clean.replace(/\b(?:cat|category|genre):([a-z]+)\b/gi, (_, cat) => {
    result.category = cat as ChannelCategory
    return ''
  })

  // 5. Quality tag: "quality:hd", "q:4k"
  clean = clean.replace(/\b(?:quality|q):(hd|sd|fhd|4k)\b/gi, (_, q) => {
    result.quality = q.toUpperCase() as ChannelQuality
    return ''
  })

  // 6. Live / Premium tags: "is:live", "is:premium", "is:free"
  if (/\bis:live\b/i.test(clean)) {
    result.isLive = true
    clean = clean.replace(/\bis:live\b/gi, '')
  }
  if (/\bis:premium\b/i.test(clean)) {
    result.isPremium = true
    clean = clean.replace(/\bis:premium\b/gi, '')
  }
  if (/\bis:free\b/i.test(clean)) {
    result.isPremium = false
    clean = clean.replace(/\bis:free\b/gi, '')
  }

  // 7. Broadcaster tag: "net:sony", "network:star"
  clean = clean.replace(/\b(?:net|network|broadcaster):([a-z0-9]+)\b/gi, (_, net) => {
    result.broadcaster = net
    return ''
  })

  result.cleanQuery = clean.trim().replace(/\s+/g, ' ')
  return result
}

// ---------------------------------------------------------------------------
// Smart Scoring Core
// ---------------------------------------------------------------------------

export interface ScoredChannel {
  channel: Channel
  score: number
  matchedReason?: string
}

export interface SmartSearchOptions {
  category?: ChannelCategory | 'all'
  language?: string
  quality?: ChannelQuality | 'all'
  isPremium?: boolean
  isLive?: boolean
  includeUpcomingHours?: number
  limit?: number
  boostFavorites?: string[]
  boostRecent?: string[]
}

export interface PreparedQuery {
  query: string
  cleanQuery: string
  filters: ParsedFilters
  queryTokens: string[]
  queryPhoneticKeys: string[]
  effectiveQueryTokens: string[]
  collapsedQuery: string
  wantsHD: boolean
  wantsSD: boolean
  targetNum?: string
  targetBroadcasters: Set<string>
  targetLanguages: Set<string>
  targetCategories: Set<string>
}

export function prepareQuery(rawQuery: string): PreparedQuery {
  const query = rawQuery.trim().toLowerCase()
  const filters = parseQueryFilters(query)
  const cleanQuery = filters.cleanQuery || query
  const queryTokens = tokenize(cleanQuery)
  const queryPhoneticKeys = queryTokens.map((t) => (t.length >= 3 ? phoneticKey(t) : ''))
  const acronymExpansion = ACRONYM_MAP[cleanQuery]
  const effectiveQueryTokens = acronymExpansion ?? queryTokens
  const collapsedQuery = queryTokens.map((t) => NUMBER_WORD_MAP[t] ?? t).join('')

  const wantsHD =
    filters.quality === 'HD' ||
    filters.quality === '4K' ||
    queryTokens.includes('hd') ||
    queryTokens.includes('fhd') ||
    queryTokens.includes('4k') ||
    cleanQuery.includes('high definition')
  const wantsSD =
    filters.quality === 'SD' || queryTokens.includes('sd') || cleanQuery.includes('standard definition')
  const targetNum = filters.targetChannelNumber || (/^\d+$/.test(cleanQuery) ? cleanQuery : undefined)

  // Pre-resolve matched broadcaster networks once per query
  const targetBroadcasters = new Set<string>()
  const broadcasterTarget = filters.broadcaster
  for (const [netKey, netData] of Object.entries(BROADCASTER_NETWORKS)) {
    if (
      broadcasterTarget === netKey ||
      queryTokens.some((t) => netData.aliases.some((a) => a === t || matchToken(t, a).matched))
    ) {
      targetBroadcasters.add(netKey)
    }
  }

  // Pre-resolve matched languages once per query
  const targetLanguages = new Set<string>()
  const filterLang = filters.language?.toLowerCase()
  if (filterLang) targetLanguages.add(filterLang)
  for (const qToken of queryTokens) {
    for (const [lang, aliases] of Object.entries(LANGUAGE_ALIASES)) {
      if (qToken === lang || aliases.includes(qToken)) {
        targetLanguages.add(lang)
      }
    }
  }

  // Pre-resolve matched categories once per query
  const targetCategories = new Set<string>()
  const filterCat = filters.category?.toLowerCase()
  if (filterCat) targetCategories.add(filterCat)
  for (const qToken of queryTokens) {
    for (const [cat, syns] of Object.entries(CATEGORY_SYNONYMS)) {
      if (qToken === cat || syns.includes(qToken)) {
        targetCategories.add(cat)
      }
    }
  }

  return {
    query,
    cleanQuery,
    filters,
    queryTokens,
    queryPhoneticKeys,
    effectiveQueryTokens,
    collapsedQuery,
    wantsHD,
    wantsSD,
    targetNum,
    targetBroadcasters,
    targetLanguages,
    targetCategories
  }
}

export interface CachedChannelIndex {
  channelNumberStr: string
  rawCleanName: string
  nameTokens: string[]
  namePhoneticKeys: string[]
  namePhoneticSet: Set<string>
  descTokens: string[]
  langTokens: string[]
  catTokens: string[]
  collapsedChannel: string
  isHD: boolean
  popularityBonus: number
  broadcasterKey?: string
  quickTokenSet: Set<string>
}

const channelIndexCache = new WeakMap<Channel, CachedChannelIndex>()

export function getCachedChannelIndex(channel: Channel): CachedChannelIndex {
  let cached = channelIndexCache.get(channel)
  if (!cached) {
    const channelNumberStr = channel.number.toString()
    const rawCleanName = channel.name.toLowerCase().trim()
    const nameTokens = tokenize(channel.name)
    const namePhoneticKeys = nameTokens.map((t) => (t.length >= 3 ? phoneticKey(t) : ''))
    const namePhoneticSet = new Set(namePhoneticKeys.filter(Boolean))
    const descTokens = channel.description ? tokenize(channel.description) : []
    const langTokens = tokenize(channel.language || '')
    const catTokens = tokenize(channel.category || '')
    const collapsedChannel = nameTokens.map((t) => NUMBER_WORD_MAP[t] ?? t).join('')
    const isHD =
      channel.quality?.some((q) => q.toUpperCase() === 'HD' || q.toUpperCase() === '4K') ||
      channel.name.toUpperCase().includes('HD')
    const popularityBonus = Math.min(
      channel.popularity ?? (channel.viewers ? Math.min(channel.viewers / 100, 20) : 0),
      20
    )

    // Pre-determine broadcaster membership
    let broadcasterKey: string | undefined
    for (const [netKey, netData] of Object.entries(BROADCASTER_NETWORKS)) {
      const matchesNetwork = netData.channelKeywords.some((kw) => {
        const kwTokens = kw.split(/\s+/)
        return kwTokens.every((k) => nameTokens.some((ct) => ct === k || matchToken(k, ct).matched))
      })
      if (matchesNetwork) {
        broadcasterKey = netKey
        break
      }
    }

    // Quick set for sub-microsecond candidate pruning
    const quickTokenSet = new Set<string>()
    for (const t of nameTokens) {
      quickTokenSet.add(t)
      const numEquiv = NUMBER_WORD_MAP[t]
      if (numEquiv) quickTokenSet.add(numEquiv)
      const words = DIGIT_TO_WORDS[t]
      if (words) {
        for (const w of words) quickTokenSet.add(w)
      }
    }
    for (const t of catTokens) quickTokenSet.add(t)
    for (const t of langTokens) quickTokenSet.add(t)
    for (const t of descTokens) quickTokenSet.add(t)
    if (broadcasterKey) quickTokenSet.add(broadcasterKey)
    quickTokenSet.add(channelNumberStr)

    cached = {
      channelNumberStr,
      rawCleanName,
      nameTokens,
      namePhoneticKeys,
      namePhoneticSet,
      descTokens,
      langTokens,
      catTokens,
      collapsedChannel,
      isHD,
      popularityBonus,
      broadcasterKey,
      quickTokenSet
    }
    channelIndexCache.set(channel, cached)
  }
  return cached
}

interface CachedProgramInfo {
  titleTokens: string[]
  descTokens: string[]
  startMs: number
  endMs: number
}

const programCache = new WeakMap<Program, CachedProgramInfo>()

function getCachedProgramInfo(p: Program): CachedProgramInfo {
  let cached = programCache.get(p)
  if (!cached) {
    cached = {
      titleTokens: tokenize(p.title),
      descTokens: p.description ? tokenize(p.description) : [],
      startMs: Date.parse(p.start),
      endMs: Date.parse(p.end)
    }
    programCache.set(p, cached)
  }
  return cached
}

export interface ChannelScoreContext {
  epgProgram?: Program
  epgProgramInfo?: CachedProgramInfo
  upcomingPrograms?: { program: Program; info: CachedProgramInfo }[]
  now?: Date
  options?: SmartSearchOptions
  preparedQuery?: PreparedQuery
}

/**
 * Formats a Date or ISO timestamp into a concise user-facing time (e.g. "8:30 PM").
 */
function formatShortTime(isoOrDate: string | Date): string {
  try {
    const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

/**
 * Computes the smart search relevance score of a channel against user query.
 * Backward compatible: contextOrEpg can be a single Program or a ChannelScoreContext object.
 */
export function scoreChannel(
  channel: Channel,
  rawQuery: string,
  contextOrEpg?: Program | ChannelScoreContext
): ScoredChannel {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return { channel, score: 0 }

  // Normalize context
  let currentProgram: Program | undefined
  let currentProgInfo: CachedProgramInfo | undefined
  let upcomingPrograms: { program: Program; info: CachedProgramInfo }[] | undefined
  let now = new Date()
  let options: SmartSearchOptions | undefined
  let preparedQuery: PreparedQuery | undefined

  if (contextOrEpg) {
    if ('title' in contextOrEpg && typeof contextOrEpg.title === 'string') {
      currentProgram = contextOrEpg as Program
      currentProgInfo = getCachedProgramInfo(currentProgram)
    } else {
      const ctx = contextOrEpg as ChannelScoreContext
      currentProgram = ctx.epgProgram
      currentProgInfo = ctx.epgProgramInfo ?? (currentProgram ? getCachedProgramInfo(currentProgram) : undefined)
      upcomingPrograms = ctx.upcomingPrograms
      if (ctx.now) now = ctx.now
      options = ctx.options
      preparedQuery = ctx.preparedQuery
    }
  }

  // Apply hard filters if requested in options
  if (options?.category && options.category !== 'all' && channel.category !== options.category) {
    return { channel, score: 0 }
  }
  if (options?.language && channel.language.toLowerCase() !== options.language.toLowerCase()) {
    return { channel, score: 0 }
  }
  if (options?.quality && options.quality !== 'all') {
    const hasQuality = channel.quality?.some((q) => q.toUpperCase() === options!.quality)
    if (!hasQuality) return { channel, score: 0 }
  }
  if (options?.isPremium !== undefined && channel.isPremium !== options.isPremium) {
    return { channel, score: 0 }
  }
  if (options?.isLive !== undefined && channel.isLive !== options.isLive) {
    return { channel, score: 0 }
  }

  const prep = preparedQuery ?? prepareQuery(query)
  const { cleanQuery, queryTokens, effectiveQueryTokens, collapsedQuery, wantsHD, wantsSD, targetNum } = prep

  if (queryTokens.length === 0 && !targetNum) {
    return { channel, score: 0 }
  }

  const idx = getCachedChannelIndex(channel)
  const {
    channelNumberStr,
    rawCleanName,
    nameTokens: channelNameTokens,
    descTokens: channelDescTokens,
    collapsedChannel,
    isHD,
    popularityBonus,
    broadcasterKey
  } = idx

  let score = 0
  let matchedReason: string | undefined

  const currentProgTokens = currentProgInfo ? currentProgInfo.titleTokens : []
  const currentDescTokens = currentProgInfo ? currentProgInfo.descTokens : []

  // Track multi-parameter matched dimensions for synergy scoring
  const matchedDimensions = new Set<'number' | 'name' | 'language' | 'category' | 'quality' | 'broadcaster' | 'epg'>()

  // -------------------------------------------------------------------------
  // 1. Channel Number Matching
  // -------------------------------------------------------------------------
  if (targetNum) {
    if (channelNumberStr === targetNum) {
      score += 2000
      matchedReason = `Channel ${channel.number}`
      matchedDimensions.add('number')
    } else if (channelNumberStr.startsWith(targetNum)) {
      score += 1200 - (channelNumberStr.length - targetNum.length) * 50
      matchedDimensions.add('number')
    }
  }

  // -------------------------------------------------------------------------
  // 2. Exact & Prefix Name Matching
  // -------------------------------------------------------------------------
  if (rawCleanName === cleanQuery) {
    score += 1500
    matchedReason = 'Exact name match'
    matchedDimensions.add('name')
  } else if (rawCleanName.startsWith(cleanQuery)) {
    score += 1100
    matchedDimensions.add('name')
  }

  // -------------------------------------------------------------------------
  // 3. Acronym & Token Matching against Channel Name
  // -------------------------------------------------------------------------
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

  if (nameMatches > 0) {
    matchedDimensions.add('name')
    const fractionMatched = nameMatches / effectiveQueryTokens.length
    score += nameMatchScoreTotal * 3 * fractionMatched

    if (nameMatches === effectiveQueryTokens.length) {
      score += 600
      if (inOrderCount === nameMatches) {
        score += 150
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4. Collapsed Substring and Subsequence Matching
  // -------------------------------------------------------------------------
  if (collapsedQuery.length >= 3) {
    if (collapsedChannel.includes(collapsedQuery)) {
      score += 450
      matchedDimensions.add('name')
    } else if (isSubsequence(collapsedQuery, collapsedChannel)) {
      score += 250
      matchedDimensions.add('name')
    }
  }

  // -------------------------------------------------------------------------
  // 5. Broadcaster Network Intent
  // -------------------------------------------------------------------------
  if (broadcasterKey && prep.targetBroadcasters.has(broadcasterKey)) {
    score += 260
    matchedDimensions.add('broadcaster')
    if (!matchedReason) matchedReason = `${broadcasterKey.toUpperCase()} Network`
  }

  // -------------------------------------------------------------------------
  // 6. Language Matching
  // -------------------------------------------------------------------------
  if (prep.targetLanguages.size > 0) {
    const normLang = channel.language?.toLowerCase()
    let matchedLang = normLang ? prep.targetLanguages.has(normLang) : false
    if (!matchedLang) {
      for (const t of idx.langTokens) {
        if (prep.targetLanguages.has(t)) {
          matchedLang = true
          break
        }
      }
    }
    if (matchedLang) {
      score += 200
      matchedDimensions.add('language')
      if (!matchedReason) matchedReason = channel.language
    }
  }

  // -------------------------------------------------------------------------
  // 7. Category and Genre Synonyms
  // -------------------------------------------------------------------------
  if (prep.targetCategories.size > 0) {
    const normCat = channel.category?.toLowerCase()
    let matchedCat = normCat ? prep.targetCategories.has(normCat) : false
    if (!matchedCat) {
      for (const t of idx.catTokens) {
        if (prep.targetCategories.has(t)) {
          matchedCat = true
          break
        }
      }
    }
    if (matchedCat) {
      score += 180
      matchedDimensions.add('category')
      if (!matchedReason) matchedReason = channel.category
    }
  }

  // -------------------------------------------------------------------------
  // 8. Quality Intent (HD / SD / 4K)
  // -------------------------------------------------------------------------
  if (wantsHD) {
    if (isHD) {
      score += 150
      matchedDimensions.add('quality')
    } else {
      score -= 80
    }
  } else if (wantsSD) {
    if (!isHD) {
      score += 150
      matchedDimensions.add('quality')
    } else {
      score -= 80
    }
  } else if (score > 0) {
    if (isHD) score += 15
  }

  // -------------------------------------------------------------------------
  // 9. Multi-Parameter Synergy Bonus
  // -------------------------------------------------------------------------
  if (matchedDimensions.size >= 3) {
    score += 450
  } else if (matchedDimensions.size === 2) {
    score += 220
  }

  // -------------------------------------------------------------------------
  // 10. EPG Program Matching (Current + Upcoming)
  // -------------------------------------------------------------------------
  if (currentProgram && currentProgTokens.length > 0) {
    let epgTokenMatches = 0
    let epgTokenScore = 0
    for (const qToken of queryTokens) {
      for (const pToken of currentProgTokens) {
        const match = matchToken(qToken, pToken)
        if (match.matched) {
          epgTokenMatches += 1
          epgTokenScore += match.score
          break
        }
      }
    }
    if (epgTokenMatches > 0) {
      const fraction = epgTokenMatches / queryTokens.length
      score += epgTokenScore * 2 * fraction
      if (epgTokenMatches === queryTokens.length) {
        score += 400
        matchedReason = `Live: ${currentProgram.title}`
        matchedDimensions.add('epg')
      }
    }

    // Match current program description keywords (teams, actors, players)
    if (currentDescTokens.length > 0) {
      let descMatches = 0
      for (const qToken of queryTokens) {
        if (currentDescTokens.some((dt) => dt === qToken || matchToken(qToken, dt).matched)) {
          descMatches += 1
        }
      }
      if (descMatches > 0) {
        score += descMatches * 80
        if (!matchedReason) matchedReason = `Live: ${currentProgram.title}`
      }
    }
  }

  // Search upcoming EPG programs (up to 4 hours ahead)
  if (upcomingPrograms && upcomingPrograms.length > 0 && queryTokens.length > 0) {
    const nowMs = now.getTime()
    for (const item of upcomingPrograms) {
      const { program: prog, info: progInfo } = item
      if (progInfo.startMs > nowMs && progInfo.startMs - nowMs <= 4 * 3600 * 1000) {
        const pTokens = progInfo.titleTokens
        let matches = 0
        for (const qToken of queryTokens) {
          if (pTokens.some((pt) => pt === qToken || matchToken(qToken, pt).matched)) {
            matches += 1
          }
        }
        if (matches === queryTokens.length) {
          const minutesUntil = Math.max(0, (progInfo.startMs - nowMs) / 60000)
          const timeBonus = Math.max(80, 260 - Math.round(minutesUntil * 0.7))
          score += timeBonus
          if (!matchedReason) {
            matchedReason = `Upcoming (${formatShortTime(prog.start)}): ${prog.title}`
          }
          break
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 11. Channel Description Matching
  // -------------------------------------------------------------------------
  if (channelDescTokens.length > 0 && queryTokens.length > 0) {
    let descCount = 0
    for (const qToken of queryTokens) {
      if (channelDescTokens.some((ct) => ct === qToken || matchToken(qToken, ct).matched)) {
        descCount += 1
      }
    }
    if (descCount > 0) {
      score += descCount * 60
    }
  }

  // -------------------------------------------------------------------------
  // 12. Caller Options: Favorites & Recent Boosts
  // -------------------------------------------------------------------------
  if (options?.boostFavorites?.includes(channel.id)) {
    score += 100
  }
  if (options?.boostRecent?.includes(channel.id)) {
    score += 80
  }

  // -------------------------------------------------------------------------
  // 13. Popularity & Viewers Tie-Breaker
  // -------------------------------------------------------------------------
  if (score > 0) {
    score += popularityBonus
  }

  return { channel, score, matchedReason }
}

/**
 * Intelligent channel search that handles:
 * - Number-word equivalence ("sony 10 three" -> "Sony Ten 3")
 * - Sub-token matching ("sony 3" -> "Sony Ten 3 HD")
 * - Acronym expansion ("ss1" -> "Star Sports 1", "st3" -> "Sony Ten 3")
 * - Damerau-Levenshtein typo tolerance with transpositions ("snoy" -> "sony")
 * - Phonetic sound-alikes ("soni", "staar", "kolors", "zeee")
 * - Direct & prefixed channel number search ("154", "ch 162", "#162")
 * - Multi-parameter intent ("hindi sports hd", "tamil news")
 * - Broadcaster network search ("sony sports", "viacom", "disney")
 * - Live and upcoming EPG program search (with start times)
 * - Structured query syntax ("lang:hindi", "cat:sports", "quality:hd")
 * - Caller-level structured parameters and favorites/recent boosts
 */
export function smartSearchChannels(
  query: string,
  channels: Channel[],
  epg: Record<string, Program[]> = {},
  now: Date = new Date(),
  optionsOrLimit: SmartSearchOptions | number = 20
): Channel[] {
  const scored = smartSearchWithDetails(query, channels, epg, now, optionsOrLimit)
  const limit = typeof optionsOrLimit === 'number' ? optionsOrLimit : optionsOrLimit.limit ?? 20
  return scored.slice(0, limit).map((s) => s.channel)
}

/**
 * Detailed channel search returning scored results and matched reasons.
 */
export function smartSearchWithDetails(
  query: string,
  channels: Channel[],
  epg: Record<string, Program[]> = {},
  now: Date = new Date(),
  optionsOrLimit: SmartSearchOptions | number = 20
): ScoredChannel[] {
  const trimmed = query.trim()
  if (!trimmed) return []

  const prep = prepareQuery(trimmed)
  if (prep.queryTokens.length === 0 && !prep.targetNum) return []

  const options: SmartSearchOptions | undefined =
    typeof optionsOrLimit === 'number' ? undefined : optionsOrLimit

  const scored: ScoredChannel[] = []
  const nowMs = now.getTime()

  for (const channel of channels) {
    // Fast skip by hard options before doing EPG lookups
    if (options?.category && options.category !== 'all' && channel.category !== options.category) {
      continue
    }
    if (options?.language && channel.language.toLowerCase() !== options.language.toLowerCase()) {
      continue
    }
    if (options?.isPremium !== undefined && channel.isPremium !== options.isPremium) {
      continue
    }
    if (options?.isLive !== undefined && channel.isLive !== options.isLive) {
      continue
    }

    const idx = getCachedChannelIndex(channel)
    const programs = epg[channel.id]
    const hasAnyEpg = Boolean(programs && programs.length > 0)

    // Sub-microsecond candidate filter: check if the channel has any match on number, name, tokens, or network
    const hasNumMatch = Boolean(prep.targetNum && idx.channelNumberStr.startsWith(prep.targetNum))
    const hasNamePrefix = idx.rawCleanName.startsWith(prep.cleanQuery) || idx.rawCleanName === prep.cleanQuery
    const hasBroadcasterMatch = Boolean(idx.broadcasterKey && prep.targetBroadcasters.has(idx.broadcasterKey))
    const hasCategoryMatch = prep.targetCategories.size > 0 && (
      prep.targetCategories.has(channel.category?.toLowerCase()) ||
      idx.catTokens.some((t) => prep.targetCategories.has(t))
    )
    const hasLanguageMatch = prep.targetLanguages.size > 0 && (
      prep.targetLanguages.has(channel.language?.toLowerCase()) ||
      idx.langTokens.some((t) => prep.targetLanguages.has(t))
    )
    const hasTokenMatch = prep.queryTokens.some((qt) => {
      if (idx.quickTokenSet.has(qt)) return true
      if (qt.length >= 2 && idx.nameTokens.some((nt) => nt.startsWith(qt))) return true
      const qk = qt.length >= 3 ? phoneticKey(qt) : ''
      if (qk && idx.namePhoneticSet.has(qk)) return true
      return false
    })
    const hasCollapsedMatch = prep.collapsedQuery.length >= 3 && (
      idx.collapsedChannel.includes(prep.collapsedQuery) ||
      isSubsequence(prep.collapsedQuery, idx.collapsedChannel)
    )

    // Skip channel if there is no possibility of matching
    if (
      !hasNumMatch &&
      !hasNamePrefix &&
      !hasTokenMatch &&
      !hasBroadcasterMatch &&
      !hasCategoryMatch &&
      !hasLanguageMatch &&
      !hasCollapsedMatch &&
      !hasAnyEpg
    ) {
      continue
    }

    let currentProgram: Program | undefined
    let currentProgInfo: CachedProgramInfo | undefined
    const upcomingPrograms: { program: Program; info: CachedProgramInfo }[] = []

    if (programs && programs.length > 0) {
      for (const p of programs) {
        const info = getCachedProgramInfo(p)
        if (nowMs >= info.startMs && nowMs <= info.endMs) {
          currentProgram = p
          currentProgInfo = info
        } else if (info.startMs > nowMs) {
          upcomingPrograms.push({ program: p, info })
        }
      }
    }

    const context: ChannelScoreContext = {
      epgProgram: currentProgram,
      epgProgramInfo: currentProgInfo,
      upcomingPrograms,
      now,
      options,
      preparedQuery: prep
    }

    const result = scoreChannel(channel, trimmed, context)
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

  return scored
}


