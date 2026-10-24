/**
 * Safe storage adapter that falls back to in-memory store if localStorage throws
 * (which happens in file:// iframes or restricted browser sandbox modes).
 */
const memoryStorage = new Map<string, string>()

export const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key)
      }
    } catch {
      // access denied or null origin
    }
    return memoryStorage.get(key) ?? null
  },
  setItem: (key: string, value: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value)
        return
      }
    } catch {
      // access denied or null origin
    }
    memoryStorage.set(key, value)
  },
  removeItem: (key: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key)
        return
      }
    } catch {
      // access denied or null origin
    }
    memoryStorage.delete(key)
  }
}
