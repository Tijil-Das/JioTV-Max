import { describe, it, expect, beforeEach } from 'vitest'
import { SharedStreamFetcher } from '../../src/main/recording/shared-stream-fetcher'

describe('SharedStreamFetcher', () => {
  let fetcher: SharedStreamFetcher

  beforeEach(() => {
    fetcher = SharedStreamFetcher.getInstance()
    fetcher.clear()
    fetcher.setFeatureFlag(true)
  })

  it('tracks consumer reference counts', () => {
    expect(fetcher.getConsumerCount('101', 'highest')).toBe(0)
    expect(fetcher.hasSharedConsumers('101', 'highest')).toBe(false)

    fetcher.acquire('101', 'highest', 'player')
    expect(fetcher.getConsumerCount('101', 'highest')).toBe(1)
    expect(fetcher.hasSharedConsumers('101', 'highest')).toBe(false)

    fetcher.acquire('101', 'highest', 'recorder_1')
    expect(fetcher.getConsumerCount('101', 'highest')).toBe(2)
    expect(fetcher.hasSharedConsumers('101', 'highest')).toBe(true)

    fetcher.release('101', 'highest', 'player')
    expect(fetcher.getConsumerCount('101', 'highest')).toBe(1)
    expect(fetcher.hasSharedConsumers('101', 'highest')).toBe(false)

    fetcher.release('101', 'highest', 'recorder_1')
    expect(fetcher.getConsumerCount('101', 'highest')).toBe(0)
  })

  it('coalesces concurrent segment fetches into a single network call', async () => {
    fetcher.acquire('101', 'highest', 'player')
    fetcher.acquire('101', 'highest', 'recorder_1')

    let networkCallCount = 0
    const mockFetch = async () => {
      networkCallCount++
      await new Promise((r) => setTimeout(r, 20))
      return { body: Buffer.from('test_segment_bytes'), contentType: 'video/mp2t' }
    }

    // Call concurrently from both player and recorder
    const [seg1, seg2] = await Promise.all([
      fetcher.fetchSegment('101', 'highest', 'http://cdn.com/seg1.ts', mockFetch),
      fetcher.fetchSegment('101', 'highest', 'http://cdn.com/seg1.ts', mockFetch)
    ])

    expect(networkCallCount).toBe(1)
    expect(seg1?.body.toString()).toBe('test_segment_bytes')
    expect(seg2?.body.toString()).toBe('test_segment_bytes')

    // Third call after completion serves from ring buffer without network call
    const seg3 = await fetcher.fetchSegment('101', 'highest', 'http://cdn.com/seg1.ts', mockFetch)
    expect(networkCallCount).toBe(1)
    expect(seg3?.body.toString()).toBe('test_segment_bytes')
  })

  it('respects feature flag for zero player degradation', () => {
    fetcher.acquire('101', 'highest', 'player')
    fetcher.acquire('101', 'highest', 'recorder_1')
    expect(fetcher.hasSharedConsumers('101', 'highest')).toBe(true)

    fetcher.setFeatureFlag(false)
    expect(fetcher.hasSharedConsumers('101', 'highest')).toBe(false)
  })
})
