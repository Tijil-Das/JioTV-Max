import type { StreamDeckApi, UpdaterBridge } from '@shared/types'
import type { CastApiBridge } from '@shared/cast-types'

declare global {
  interface Window {
    /** Undefined when the renderer runs in a plain browser for UI development. */
    api?: StreamDeckApi
    /** Auto-updater bridge exposed by Electron preload. */
    updater?: UpdaterBridge
    /** Cast bridge exposed by Electron preload. */
    castApi?: CastApiBridge
  }
}

declare module 'shaka-player' {
  export = shaka
  export as namespace shaka
}

export {}
