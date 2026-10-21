import type { StreamDeckApi } from '@shared/types'

declare global {
  interface Window {
    /** Undefined when the renderer runs in a plain browser for UI development. */
    api?: StreamDeckApi
  }
}

declare module 'shaka-player' {
  export = shaka
  export as namespace shaka
}

export {}
