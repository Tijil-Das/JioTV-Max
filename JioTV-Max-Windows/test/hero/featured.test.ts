import { describe, expect, it } from 'vitest'
import type { Channel, Program } from '@shared/types'
import {
  editorialScores,
  epgScores,
  personalScores,
  popularityScores,
  rankHeroCandidates,
  type FeaturedContext
} from '@/services/featuredService'

/**
 * Addendum 3 §6 · deterministic featured selection.
 * The ranking must never call Math.random and must always end in a stable
 * tiebreak (channel number, then id).
 */

const NOW = new Date(2026, 9, 22, 12, 0, 0)

function makeChannel(
  overrides: Partial<Channel> & Pick<Channel, 'id' | 'number'>
): Channel {
  return {
    id: overrides.id,
    number: overrides.number,
    name: overrides.id,
    logoUrl: '',
    brandColor: '#111111',
    category: 'entertainment',
    language: 'English',
    isLive: true,
    quality: ['HD'],
    isPremium: false,
    source: 'demo',
    ...overrides
  }
}

function program(
  id: string,
  channelId: string,
  startMinutes: number,
  endMinutes: number,
  genre = 'News',
  title = 'Bulletin'
): Program {
  const at = (minutes: number): string =>
    new Date(NOW.getTime() + minutes * 60_000).toISOString()
  return {
    id,
    channelId,
    title,
    description: '',
    start: at(startMinutes),
    end: at(endMinutes),
    genre
  }
}

function context(overrides: Partial<FeaturedContext> = {}): FeaturedContext {
  return {
    channels: [],
    epg: {},
    favorites: [],
    history: [],
    language: 'English',
    now: NOW,
    editorial: null,
    ...overrides
  }
}

function ids(result: ReturnType<typeof rankHeroCandidates>): string[] {
  return result.map((candidate) => candidate.channel.id)
}

describe('Addendum 3 §6 · featured ranking', () => {
  it('is deterministic across repeated runs', () => {
    const channels = [
      makeChannel({ id: 'a', number: 10, viewers: 500, category: 'news' }),
      makeChannel({ id: 'b', number: 2, rank: 1, category: 'sports' }),
      makeChannel({ id: 'c', number: 7, popularity: 80, category: 'movies' }),
      makeChannel({ id: 'd', number: 3, trending: true, category: 'entertainment' }),
      makeChannel({ id: 'e', number: 1, isFeatured: true, category: 'kids' })
    ]
    const ctx = context({
      channels,
      favorites: ['a', 'c'],
      history: [
        { channelId: 'b', watchedAt: new Date(NOW.getTime() - 3_600_000).toISOString(), minutes: 90 },
        { channelId: 'd', watchedAt: new Date(NOW.getTime() - 86_400_000).toISOString(), minutes: 30 }
      ],
      epg: {
        b: [program('p1', 'b', -10, 50, 'Sports')],
        e: [program('p2', 'e', -5, 80, 'News')]
      },
      editorial: [
        { channelId: 'e', priority: 5 },
        { channelId: 'b', priority: 9 }
      ]
    })
    const first = rankHeroCandidates(ctx)
    const second = rankHeroCandidates(ctx)
    expect(ids(first)).toEqual(ids(second))
    expect(first.map((candidate) => candidate.score)).toEqual(
      second.map((candidate) => candidate.score)
    )
  })

  it('breaks equal editorial scores by channel number', () => {
    const channels = [
      makeChannel({ id: 'two', number: 2 }),
      makeChannel({ id: 'one', number: 1 })
    ]
    const result = rankHeroCandidates(
      context({
        channels,
        editorial: [
          { channelId: 'two', priority: 50 },
          { channelId: 'one', priority: 50 }
        ]
      })
    )
    expect(ids(result)).toEqual(['one', 'two'])
    expect(result[0].sources.editorial).toBe(1)
  })

  it('renormalizes weights when personal and EPG sources are absent', () => {
    const channels = [
      makeChannel({ id: 'editorial', number: 1, popularity: 0 }),
      makeChannel({ id: 'popular', number: 2, popularity: 100 })
    ]
    const result = rankHeroCandidates(
      context({
        channels,
        editorial: [
          { channelId: 'editorial', priority: 10 },
          { channelId: 'popular', priority: 0 }
        ]
      })
    )
    expect(ids(result)).toEqual(['editorial', 'popular'])
    // .40 / (.40 + .25) = 0.61538…
    expect(result[0].score).toBeCloseTo(0.4 / 0.65, 6)
    expect(result[1].score).toBeCloseTo(0.25 / 0.65, 6)
  })

  it('uses the deterministic fallback order when no source is available', () => {
    const channels = [
      makeChannel({ id: 'kids', number: 1, category: 'kids' }),
      makeChannel({ id: 'movies', number: 5, category: 'movies' }),
      makeChannel({ id: 'ent', number: 10, category: 'entertainment' }),
      makeChannel({ id: 'news', number: 20, category: 'news' }),
      makeChannel({ id: 'sports', number: 50, category: 'sports' })
    ]
    const result = rankHeroCandidates(context({ channels }))
    expect(ids(result)).toEqual(['sports', 'news', 'ent', 'movies', 'kids'])
  })

  it('prefers the Settings language before category priority in fallback', () => {
    const channels = [
      makeChannel({ id: 'hindi-sports', number: 1, category: 'sports', language: 'Hindi' }),
      makeChannel({ id: 'english-news', number: 60, category: 'news', language: 'English' }),
      makeChannel({ id: 'english-sports', number: 50, category: 'sports', language: 'English' })
    ]
    const result = rankHeroCandidates(context({ channels, language: 'English' }))
    expect(ids(result)).toEqual(['english-sports', 'english-news'])
  })

  it('scores only EPG entries that started recently and still have time left', () => {
    const channels = [
      makeChannel({ id: 'news', number: 1, category: 'news' }),
      makeChannel({ id: 'movie', number: 2, category: 'movies' })
    ]
    const epg = {
      news: [program('a', 'news', -10, 50, 'News')],
      movie: [program('b', 'movie', -40, 20, 'Movie')]
    }
    const scores = epgScores(channels, epg, NOW)
    expect(scores).not.toBeNull()
    expect(Array.from(scores?.keys() ?? [])).toEqual(['news'])

    const result = rankHeroCandidates(context({ channels, epg }))
    expect(ids(result)[0]).toBe('news')
  })

  it('weights recent personal history over old sessions', () => {
    const history = [
      {
        channelId: 'recent',
        watchedAt: new Date(NOW.getTime() - 3_600_000).toISOString(),
        minutes: 60
      },
      {
        channelId: 'ancient',
        watchedAt: new Date(NOW.getTime() - 10 * 86_400_000).toISOString(),
        minutes: 60
      }
    ]
    const scores = personalScores(history, [], NOW)
    expect(scores).not.toBeNull()
    expect(scores?.get('recent')).toBeCloseTo(1, 6)
    expect(scores?.get('ancient') ?? 0).toBeLessThan(0.6)
  })

  it('maps optional popularity signals without inventing data', () => {
    expect(popularityScores([makeChannel({ id: 'a', number: 1 })])).toBeNull()

    const scores = popularityScores([
      makeChannel({ id: 'featured', number: 1, isFeatured: true }),
      makeChannel({ id: 'ranked', number: 2, rank: 1 }),
      makeChannel({ id: 'plain', number: 3 })
    ])
    expect(scores?.get('featured')).toBe(1)
    expect(scores?.get('ranked')).toBe(1)
    expect(scores?.has('plain')).toBe(false)
  })

  it('ignores expired editorial windows and falls back deterministically', () => {
    const channels = [
      makeChannel({ id: 'news', number: 99, category: 'news' }),
      makeChannel({ id: 'sports', number: 50, category: 'sports' })
    ]
    const entries = [
      {
        channelId: 'news',
        priority: 100,
        from: new Date(2020, 0, 1).toISOString(),
        to: new Date(2020, 0, 2).toISOString()
      }
    ]
    expect(editorialScores(entries, new Set(['news', 'sports']), NOW)).toBeNull()
    expect(ids(rankHeroCandidates(context({ channels, editorial: entries })))).toEqual([
      'sports',
      'news'
    ])
  })
})
