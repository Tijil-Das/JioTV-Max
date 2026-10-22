import { describe, expect, it } from 'vitest'
import {
  bestVariant,
  firstSegment,
  isDrmPlaylist,
  isMasterPlaylist,
  isMediaPlaylist,
  segmentCount
} from '../../src/main/probe-utils'

/**
 * Addendum 3 §7 · stage-1 playlist parsing.
 * Pure helpers shared by the main-process probe so fail/mixed master playlists
 * are rejected before any renderer player is created.
 */

const MEDIA = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXTINF:6,
seg-1.ts
#EXTINF:6,
seg-2.ts
#EXTINF:6,
seg-3.ts
#EXT-X-ENDLIST`

const MASTER = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
low/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
high/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720
mid/index.m3u8`

describe('Addendum 3 §7 · stage-1 playlist helpers', () => {
  it('classifies master and media playlists correctly', () => {
    expect(isMasterPlaylist(MASTER)).toBe(true)
    expect(isMediaPlaylist(MASTER)).toBe(false)
    expect(isMasterPlaylist(MEDIA)).toBe(false)
    expect(isMediaPlaylist(MEDIA)).toBe(true)
  })

  it('rejects documents that are neither valid masters nor media playlists', () => {
    expect(isMediaPlaylist('#EXTM3U\n#EXT-X-VERSION:3')).toBe(false)
    expect(isMediaPlaylist('<html>not a playlist</html>')).toBe(false)
    expect(isMasterPlaylist('#EXTM3U\n#EXT-X-VERSION:3')).toBe(false)
  })

  it('selects the highest-bandwidth variant and resolves relative URLs', () => {
    expect(bestVariant(MASTER, 'https://cdn.example.com/live/master.m3u8')).toBe(
      'https://cdn.example.com/live/high/index.m3u8'
    )
  })

  it('returns null when a master advertises no resolvable variants', () => {
    expect(bestVariant('#EXTM3U\n#EXT-X-VERSION:3', 'https://cdn.example.com/master.m3u8')).toBeNull()
    expect(
      bestVariant(
        '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\n',
        'https://cdn.example.com/master.m3u8'
      )
    ).toBeNull()
  })

  it('counts only media segment lines', () => {
    expect(segmentCount(MEDIA)).toBe(3)
    expect(segmentCount(MASTER)).toBe(3) // variant lines are ignored downstream
    expect(segmentCount('')).toBe(0)
  })

  it('resolves the first segment against the media playlist URL', () => {
    expect(firstSegment(MEDIA, 'https://cdn.example.com/live/index.m3u8')).toBe(
      'https://cdn.example.com/live/seg-1.ts'
    )
    expect(firstSegment('#EXTM3U\n#EXTINF:6,\nhttps://cdn.example.com/a.ts?token=1', 'https://x/'))
      .toBe('https://cdn.example.com/a.ts?token=1')
    expect(firstSegment('#EXTM3U', 'https://cdn.example.com/live/index.m3u8')).toBeNull()
  })

  it('flags SAMPLE-AES and known DRM key systems', () => {
    expect(
      isDrmPlaylist(
        '#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://key",KEYFORMAT="com.apple.streamingkeydelivery"'
      )
    ).toBe(true)
    expect(
      isDrmPlaylist(
        '#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES-CTR,URI="data:text/plain;base64,AAAA",KEYFORMAT="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"'
      )
    ).toBe(true)
    expect(
      isDrmPlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="https://keys.example.com/key"')
    ).toBe(false)
    expect(isDrmPlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=NONE')).toBe(false)
  })

  it('treats a one-segment media playlist as a failed probe (<2 segments)', () => {
    const single = '#EXTM3U\n#EXTINF:6,\nonly.ts\n#EXT-X-ENDLIST'
    expect(isMediaPlaylist(single)).toBe(true)
    expect(segmentCount(single)).toBeLessThan(2)
  })
})
