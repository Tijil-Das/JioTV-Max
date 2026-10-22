import type { StreamDeckApi, UpdaterBridge } from '@shared/types'

declare global {
  interface Window {
    /** Undefined when the renderer runs in a plain browser for UI development. */
    api?: StreamDeckApi
    /** Auto-updater bridge exposed by Electron preload. */
    updater?: UpdaterBridge
  }
}

declare module 'shaka-player' {
  export = shaka
  export as namespace shaka
}

export {}
