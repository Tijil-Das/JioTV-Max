import { describe, expect, it } from 'vitest'
import type { Channel, Program } from '../../src/shared/types'
import { smartSearchChannels, scoreChannel, tokenize } from '../../src/renderer/src/lib/search/smartSearch'

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
  makeChannel({ id: 'star-sports-1', name: 'Star Sports 1', number: 170, category: 'sports', language: 'English' }),
  makeChannel({ id: 'star-plus', name: 'Star Plus', number: 101, category: 'entertainment', language: 'Hindi' }),
  makeChannel({ id: 'ndtv-24x7', name: 'NDTV 24x7', number: 301, category: 'news', language: 'English' }),
  makeChannel({ id: 'aaj-tak', name: 'Aaj Tak', number: 305, category: 'news', language: 'Hindi' })
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

  it('handles typos like "soony" and returns Sony channels', () => {
    const results = smartSearchChannels('soony', sampleChannels)
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((r) => r.name.toLowerCase().includes('sony'))).toBe(true)
  })

  it('matches category synonyms such as "cricket" or "match" to sports channels', () => {
    const results = smartSearchChannels('cricket', sampleChannels)
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((r) => r.category === 'sports')).toBe(true)
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
})
