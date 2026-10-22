/**
 * Tiny reactive store that holds the local media-relay base URL.
 * Populated once at startup from bridge.getAppInfo().
 * Falls back to empty string in browser preview mode.
 */
import { create } from 'zustand'

interface RelayStore {
  relayBase: string
  setRelayBase: (url: string) => void
  /** Build a logo proxy URL for a given logoUrl from the JioTV API */
  logoProxyUrl: (logoUrl: string) => string
}

export const useRelayStore = create<RelayStore>((set, get) => ({
  relayBase: '',
  setRelayBase: (url) => set({ relayBase: url }),
  logoProxyUrl: (logoUrl: string) => {
    const base = get().relayBase
    if (!logoUrl || !base) return ''
    // If it's already a full URL (http/https), pass as ?url=
    if (/^https?:\/\//i.test(logoUrl)) {
      return `${base}/logo?url=${encodeURIComponent(logoUrl)}`
    }
    // Otherwise treat as a bare filename (e.g. "Colors_HD.png")
    return `${base}/logo?file=${encodeURIComponent(logoUrl)}`
  }
}))
