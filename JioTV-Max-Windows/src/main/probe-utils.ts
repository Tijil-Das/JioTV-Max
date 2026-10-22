/**
 * Pure HLS playlist helpers used by stage-1 stream verification.
 *
 * Kept free of Electron imports so the parser can be unit tested in Node.
 */

const DRM_KEYFORMATS = /(?:widevine|fairplay|playready)/i
const DRM_KEY_SYSTEM_UUID = /urn:uuid:(?:edef8ba9|94ce86fb|9a04f079)/i

/** True when the playlist declares encryption the app cannot play. */
export function isDrmPlaylist(text: string): boolean {
  const keyLines = text
    .split(/\r?\n/)
    .filter((line) => /^#EXT-X-(?:SESSION-)?KEY:/i.test(line.trim()))
  for (const line of keyLines) {
    if (/METHOD=NONE/i.test(line)) continue
    if (/METHOD=SAMPLE-AES/i.test(line)) return true
    const keyFormat = /KEYFORMAT\s*=\s*"([^"]*)"/i.exec(line)
    if (keyFormat && DRM_KEYFORMATS.test(keyFormat[1])) return true
    if (DRM_KEY_SYSTEM_UUID.test(line)) return true
  }
  return false
}

/** True when the document is a master (multivariant) playlist. */
export function isMasterPlaylist(text: string): boolean {
  return /^#EXT-X-STREAM-INF:/im.test(text)
}

/** True when the document is a playable media playlist. */
export function isMediaPlaylist(text: string): boolean {
  if (!text.trimStart().startsWith('#EXTM3U')) return false
  if (isMasterPlaylist(text)) return false
  return /^#EXTINF:/im.test(text)
}

/** Resolves the first media segment URI against the playlist URL. */
export function firstSegment(text: string, baseUrl: string): string | null {
  const lines = text.split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    try {
      return new URL(line, baseUrl).toString()
    } catch {
      return null
    }
  }
  return null
}

/** Counts media segment URIs (comment lines excluded). */
export function segmentCount(text: string): number {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#')).length
}

/** Highest-bandwidth variant advertised by a master playlist. */
export function bestVariant(text: string, baseUrl: string): string | null {
  const lines = text.split(/\r?\n/)
  let best: { url: string; bandwidth: number } | null = null
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue
    const bandwidthMatch = /BANDWIDTH\s*=\s*(\d+)/i.exec(line)
    const bandwidth = bandwidthMatch ? Number(bandwidthMatch[1]) : 0
    let cursor = index + 1
    while (
      cursor < lines.length &&
      (!lines[cursor].trim() || lines[cursor].trim().startsWith('#'))
    ) {
      cursor += 1
    }
    if (cursor >= lines.length) continue
    try {
      const url = new URL(lines[cursor].trim(), baseUrl).toString()
      if (!best || bandwidth > best.bandwidth) best = { url, bandwidth }
    } catch {
      // Ignore malformed variant rows and keep scanning.
    }
  }
  return best?.url ?? null
}
