import { describe, expect, it } from 'vitest'
import type { Channel, Program } from '../../src/shared/types'
import {
  smartSearchChannels,
  smartSearchWithDetails,
  scoreChannel,
  tokenize,
  damerauLevenshtein,
  phoneticKey,
  parseQueryFilters
} from '../../src/renderer/src/lib/search/smartSearch'

function makeChannel(overrides: Partial<Channel>): Channel {
  return {
    id: 'ch-1',
    name: 'Sample Channel',
    number: 100,
    logoUrl: '',
    category: 'entertainment',
    language: 'Hindi',
    isLive: true,
    quality: ['HD'],
    isPremium: false,
    source: 'demo',
    ...overrides
  }
}

const sampleChannels: Channel[] = [
  makeChannel({ id: 'sony-sab', name: 'Sony SAB', number: 154, category: 'entertainment', language: 'Hindi' }),
  makeChannel({ id: 'sony-ten-1-hd', name: 'Sony Ten 1 HD', number: 162, category: 'sports', language: 'English', quality: ['HD'] }),
  makeChannel({ id: 'sony-ten-2-hd', name: 'Sony Ten 2 HD', number: 164, category: 'sports', language: 'English', quality: ['HD'] }),
  makeChannel({ id: 'sony-ten-3-hd', name: 'Sony Ten 3 HD', number: 166, category: 'sports', language: 'Hindi', quality: ['HD'] }),
  makeChannel({ id: 'sony-ten-5-hd', name: 'Sony Ten 5 HD', number: 155, category: 'sports', language: 'English', quality: ['HD'] }),
  makeChannel({ id: 'sony-max', name: 'Sony Max', number: 289, category: 'movies', language: 'Hindi' }),
  makeChannel({ id: 'star-sports-1', name: 'Star Sports 1', number: 170, category: 'sports', language: 'English', quality: ['SD'] }),
  makeChannel({ id: 'star-plus', name: 'Star Plus', number: 101, category: 'entertainment', language: 'Hindi', quality: ['HD'] }),
  makeChannel({ id: 'ndtv-24x7', name: 'NDTV 24x7', number: 301, category: 'news', language: 'English', quality: ['HD'] }),
  makeChannel({ id: 'aaj-tak', name: 'Aaj Tak', number: 305, category: 'news', language: 'Hindi', quality: ['HD'] }),
  makeChannel({ id: 'colors-hindi', name: 'Colors', number: 120, category: 'entertainment', language: 'Hindi', quality: ['HD'] })
]

describe('smartSearch', () => {
  it('tokenizes and splits letter-number combinations and punctuation', () => {
    expect(tokenize('sony3')).toEqual(['sony', '3'])
    expect(tokenize('sony-ten-3')).toEqual(['sony', 'ten', '3'])
    expect(tokenize('24x7')).toEqual(['24', '7'])
    expect(tokenize('star+')).toEqual(['star', 'plus'])
  })

  it('matches "sony 3" to "Sony Ten 3 HD" even though "ten" is omitted', () => {
    const results = smartSearchChannels('sony 3', sampleChannels)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name).toBe('Sony Ten 3 HD')
  })

  it('matches "sony 10 three" to "Sony Ten 3 HD" using number-word equivalence', () => {
    const results = smartSearchChannels('sony 10 three', sampleChannels)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name).toBe('Sony Ten 3 HD')
  })

  it('matches "sony ten 3" exactly to "Sony Ten 3 HD"', () => {
    const results = smartSearchChannels('sony ten 3', sampleChannels)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name).toBe('Sony Ten 3 HD')
  })

  it('matches shortcode "st3" to "Sony Ten 3 HD"', () => {
    const results = smartSearchChannels('st3', sampleChannels)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name).toBe('Sony Ten 3 HD')
  })

  it('matches shortcode "ss1" to "Star Sports 1"', () => {
    const results = smartSearchChannels('ss1', sampleChannels)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name).toBe('Star Sports 1')
  })

  it('matches direct channel numbers with highest priority', () => {
    const results = smartSearchChannels('154', sampleChannels)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].number).toBe(154)
    expect(results[0].name).toBe('Sony SAB')
  })

  it('matches channel numbers with prefixes like "ch 162", "channel 162", "#162", "ch:162"', () => {
    const chResults = smartSearchChannels('ch 162', sampleChannels)
    expect(chResults[0].number).toBe(162)

    const hashResults = smartSearchChannels('#162', sampleChannels)
    expect(hashResults[0].number).toBe(162)

    const colonResults = smartSearchChannels('ch:162', sampleChannels)
    expect(colonResults[0].number).toBe(162)

    const channelPrefix = smartSearchChannels('channel 162', sampleChannels)
    expect(channelPrefix[0].number).toBe(162)
  })

  it('handles typos like "soony" and returns Sony channels', () => {
    const results = smartSearchChannels('soony', sampleChannels)
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((r) => r.name.toLowerCase().includes('sony'))).toBe(true)
  })

  it('handles character transpositions with Damerau-Levenshtein ("snoy" -> Sony, "stra" -> Star)', () => {
    expect(damerauLevenshtein('snoy', 'sony')).toBe(1)
    const snoyResults = smartSearchChannels('snoy', sampleChannels)
    expect(snoyResults.length).toBeGreaterThan(0)
    expect(snoyResults[0].name.toLowerCase().includes('sony')).toBe(true)

    const straResults = smartSearchChannels('stra', sampleChannels)
    expect(straResults.length).toBeGreaterThan(0)
    expect(straResults[0].name.toLowerCase().includes('star')).toBe(true)
  })

  it('matches phonetic sound-alike spellings ("soni" -> Sony, "staar" -> Star)', () => {
    expect(phoneticKey('soni')).toBe(phoneticKey('sony'))
    expect(phoneticKey('staar')).toBe(phoneticKey('star'))

    const soniResults = smartSearchChannels('soni', sampleChannels)
    expect(soniResults.length).toBeGreaterThan(0)
    expect(soniResults[0].name.toLowerCase().includes('sony')).toBe(true)

    const staarResults = smartSearchChannels('staar', sampleChannels)
    expect(staarResults.length).toBeGreaterThan(0)
    expect(staarResults[0].name.toLowerCase().includes('star')).toBe(true)
  })

  it('matches category synonyms such as "cricket" or "match" to sports channels', () => {
    const results = smartSearchChannels('cricket', sampleChannels)
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((r) => r.category === 'sports')).toBe(true)
  })

  it('boosts multi-parameter intent queries like "hindi sports hd" with synergy bonus', () => {
    // "hindi sports hd" specifies language=Hindi, category=sports, quality=HD
    // Sony Ten 3 HD satisfies all 3, whereas Sony Ten 1/2 are English, and Star Sports 1 is English/SD
    const results = smartSearchChannels('hindi sports hd', sampleChannels)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name).toBe('Sony Ten 3 HD')
  })

  it('matches language and category combinations like "english news"', () => {
    const results = smartSearchChannels('english news', sampleChannels)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name).toBe('NDTV 24x7')
  })

  it('matches broadcaster network intent like "viacom" -> Colors', () => {
    const results = smartSearchChannels('viacom', sampleChannels)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name).toBe('Colors')
  })

  it('matches currently running EPG program titles', () => {
    const epg: Record<string, Program[]> = {
      'sony-sab': [
        {
          id: 'p1',
          channelId: 'sony-sab',
          title: 'Taarak Mehta Ka Ooltah Chashmah',
          description: '',
          start: new Date(Date.now() - 60000).toISOString(),
          end: new Date(Date.now() + 60000).toISOString(),
          genre: 'Comedy'
        }
      ]
    }
    const results = smartSearchChannels('taarak mehta', sampleChannels, epg)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].id).toBe('sony-sab')
  })

  it('matches program description keywords (e.g. searching for actor or player in synopsis)', () => {
    const epg: Record<string, Program[]> = {
      'sony-ten-1-hd': [
        {
          id: 'p2',
          channelId: 'sony-ten-1-hd',
          title: 'Live Football',
          description: 'Premier League clash featuring Manchester City vs Arsenal',
          start: new Date(Date.now() - 60000).toISOString(),
          end: new Date(Date.now() + 60000).toISOString(),
          genre: 'Sports'
        }
      ]
    }
    const results = smartSearchChannels('arsenal', sampleChannels, epg)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].id).toBe('sony-ten-1-hd')
  })

  it('matches upcoming EPG programs starting within the next few hours', () => {
    const now = new Date()
    const in30m = new Date(now.getTime() + 30 * 60 * 1000)
    const in90m = new Date(now.getTime() + 90 * 60 * 1000)

    const epg: Record<string, Program[]> = {
      'sony-max': [
        {
          id: 'up-1',
          channelId: 'sony-max',
          title: 'KGF Chapter 2',
          description: 'Blockbuster movie',
          start: in30m.toISOString(),
          end: in90m.toISOString(),
          genre: 'Movies'
        }
      ]
    }

    const scored = smartSearchWithDetails('kgf chapter', sampleChannels, epg, now)
    expect(scored.length).toBeGreaterThan(0)
    expect(scored[0].channel.id).toBe('sony-max')
    expect(scored[0].matchedReason).toContain('Upcoming')
    expect(scored[0].matchedReason).toContain('KGF Chapter 2')
  })

  it('parses structured search syntax tags like "lang:hindi" or "cat:sports"', () => {
    const parsed = parseQueryFilters('lang:hindi cat:sports quality:hd ch:162')
    expect(parsed.language).toBe('hindi')
    expect(parsed.category).toBe('sports')
    expect(parsed.quality).toBe('HD')
    expect(parsed.targetChannelNumber).toBe('162')
  })

  it('supports caller options such as category filtering and boostFavorites', () => {
    // 1. Category filter: searching "sony" with category="movies" filters to Sony Max
    const movieResults = smartSearchChannels('sony', sampleChannels, {}, new Date(), {
      category: 'movies'
    })
    expect(movieResults.length).toBe(1)
    expect(movieResults[0].id).toBe('sony-max')

    // 2. Favorites boost: sony-ten-5-hd (155) beats sony-sab (154) when favorited
    const boostedResults = smartSearchChannels('sony', sampleChannels, {}, new Date(), {
      boostFavorites: ['sony-ten-5-hd']
    })
    expect(boostedResults.length).toBeGreaterThan(0)
    expect(boostedResults[0].id).toBe('sony-ten-5-hd')
  })

  it('matches 24x7 to NDTV 24x7', () => {
    const results = smartSearchChannels('24x7', sampleChannels)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].id).toBe('ndtv-24x7')
  })

  it('matches star+ to Star Plus', () => {
    const results = smartSearchChannels('star+', sampleChannels)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].id).toBe('star-plus')
  })

  it('matches glued query "sonythree" to "Sony Ten 3 HD"', () => {
    const results = smartSearchChannels('sonythree', sampleChannels)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name).toBe('Sony Ten 3 HD')
  })

  it('matches glued query "sonytwo" to "Sony Ten 2 HD"', () => {
    const results = smartSearchChannels('sonytwo', sampleChannels)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name).toBe('Sony Ten 2 HD')
  })

  it('matches glued query "sonytenthree" to "Sony Ten 3 HD"', () => {
    const results = smartSearchChannels('sonytenthree', sampleChannels)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name).toBe('Sony Ten 3 HD')
  })

  it('matches glued query "starsports" to Star Sports channels', () => {
    const results = smartSearchChannels('starsports', sampleChannels)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name).toBe('Star Sports 1')
  })

  it('smart searches channel numbers by prefix, ordering by channel number', () => {
    const results = smartSearchChannels('16', sampleChannels)
    expect(results.length).toBeGreaterThanOrEqual(3)
    expect(results[0].number).toBe(162)
    expect(results[1].number).toBe(164)
    expect(results[2].number).toBe(166)
  })

  it('matches channel by internal channel id or stbNumber', () => {
    const channelsWithStb: Channel[] = [
      ...sampleChannels,
      makeChannel({
        id: '875',
        name: 'Eurosport HD',
        number: 875,
        stbNumber: 2506,
        category: 'sports',
        language: 'English'
      })
    ]

    // Searching STB number "2506"
    const stbResults = smartSearchChannels('2506', channelsWithStb)
    expect(stbResults.length).toBeGreaterThan(0)
    expect(stbResults[0].name).toBe('Eurosport HD')

    // Searching channel ID "875"
    const idResults = smartSearchChannels('875', channelsWithStb)
    expect(idResults.length).toBeGreaterThan(0)
    expect(idResults[0].name).toBe('Eurosport HD')
  })

  it('prioritizes channel number when query has words and number (e.g. "star 101")', () => {
    const results = smartSearchChannels('star 101', sampleChannels)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].id).toBe('star-plus')
    expect(results[0].number).toBe(101)
  })
})
