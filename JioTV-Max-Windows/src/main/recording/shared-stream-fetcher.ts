export interface BufferedSegment {
  uri: string
  body: Buffer
  contentType: string
  durationSec?: number
  fetchedAt: number
}

export class SharedStreamFetcher {
  private static instance: SharedStreamFetcher | null = null
  private featureFlagEnabled = true

  // channelId:quality -> consumers set
  private refCounts = new Map<string, Set<string>>()
  // channelId:quality -> segmentUri -> BufferedSegment
  private ringBuffers = new Map<string, Map<string, BufferedSegment>>()
  // In-flight fetches coalescing: url -> Promise<BufferedSegment>
  private inFlight = new Map<string, Promise<BufferedSegment | null>>()

  private readonly maxSegmentsPerStream = 20

  static getInstance(): SharedStreamFetcher {
    if (!SharedStreamFetcher.instance) {
      SharedStreamFetcher.instance = new SharedStreamFetcher()
    }
    return SharedStreamFetcher.instance
  }

  setFeatureFlag(enabled: boolean): void {
    this.featureFlagEnabled = enabled
  }

  isFeatureFlagEnabled(): boolean {
    return this.featureFlagEnabled
  }

  /**
   * Acquire a stream reference for a consumer (player or recordingId)
   */
  acquire(channelId: string, quality: string, consumerId: string): void {
    const key = `${channelId}:${quality}`
    let consumers = this.refCounts.get(key)
    if (!consumers) {
      consumers = new Set()
      this.refCounts.set(key, consumers)
      this.ringBuffers.set(key, new Map())
    }
    consumers.add(consumerId)
  }

  /**
   * Release a stream reference
   */
  release(channelId: string, quality: string, consumerId: string): void {
    const key = `${channelId}:${quality}`
    const consumers = this.refCounts.get(key)
    if (consumers) {
      consumers.delete(consumerId)
      if (consumers.size === 0) {
        this.refCounts.delete(key)
        this.ringBuffers.delete(key)
      }
    }
  }

  hasSharedConsumers(channelId: string, quality: string): boolean {
    if (!this.featureFlagEnabled) return false
    const consumers = this.refCounts.get(`${channelId}:${quality}`)
    return Boolean(consumers && consumers.size > 1)
  }

  getConsumerCount(channelId: string, quality: string): number {
    return this.refCounts.get(`${channelId}:${quality}`)?.size ?? 0
  }

  /**
   * Fetch a segment with de-duplication and ring buffer caching.
   * If player and recorder fetch the same segment, only one network request is made.
   */
  async fetchSegment(
    channelId: string,
    quality: string,
    segmentUrl: string,
    fetchFn: () => Promise<{ body: Buffer; contentType: string }>
  ): Promise<BufferedSegment | null> {
    const streamKey = `${channelId}:${quality}`
    const bufferMap = this.ringBuffers.get(streamKey)

    // 1. Check ring buffer
    if (bufferMap && bufferMap.has(segmentUrl)) {
      return bufferMap.get(segmentUrl)!
    }

    // 2. Check in-flight promise coalescing
    const inFlightPromise = this.inFlight.get(segmentUrl)
    if (inFlightPromise) {
      return inFlightPromise
    }

    // 3. Initiate single fetch
    const fetchPromise = (async (): Promise<BufferedSegment | null> => {
      try {
        const { body, contentType } = await fetchFn()
        const seg: BufferedSegment = {
          uri: segmentUrl,
          body,
          contentType,
          fetchedAt: Date.now()
        }

        // Store in ring buffer if stream is still registered
        const currentBuffer = this.ringBuffers.get(streamKey)
        if (currentBuffer) {
          currentBuffer.set(segmentUrl, seg)
          // Evict oldest if exceeding capacity
          if (currentBuffer.size > this.maxSegmentsPerStream) {
            const oldestKey = currentBuffer.keys().next().value
            if (oldestKey) currentBuffer.delete(oldestKey)
          }
        }
        return seg
      } catch (err) {
        return null
      } finally {
        this.inFlight.delete(segmentUrl)
      }
    })()

    this.inFlight.set(segmentUrl, fetchPromise)
    return fetchPromise
  }

  clear(): void {
    this.refCounts.clear()
    this.ringBuffers.clear()
    this.inFlight.clear()
  }
}
