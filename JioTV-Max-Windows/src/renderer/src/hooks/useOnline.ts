import { useSyncExternalStore } from 'react'

function subscribe(notify: () => void): () => void {
  window.addEventListener('online', notify)
  window.addEventListener('offline', notify)
  return () => {
    window.removeEventListener('online', notify)
    window.removeEventListener('offline', notify)
  }
}

function getSnapshot(): boolean {
  return navigator.onLine
}

/** Reactive connectivity so the UI can switch to its offline language. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
