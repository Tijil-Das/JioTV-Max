declare module 'chromecast-api' {
  import { EventEmitter } from 'node:events'

  class Client extends EventEmitter {
    devices: any[]
    constructor()
    queryMDNS(): void
    querySSDP(): void
    update(): void
    destroy(): void
  }

  export = Client
}

declare module 'upnp-mediarenderer-client' {
  import { EventEmitter } from 'node:events'

  class MediaRendererClient extends EventEmitter {
    constructor(url: string)
    load(url: string, options: any, callback: (err?: any) => void): void
    play(callback?: (err?: any) => void): void
    pause(callback?: (err?: Error) => void): void
    stop(callback?: (err?: any) => void): void
    seek(seconds: number, callback?: (err?: any) => void): void
    getVolume(callback: (err: any, volume: number) => void): void
    setVolume(volume: number, callback?: (err?: any) => void): void
    getPosition(callback: (err: any, position: number) => void): void
    getDuration(callback: (err: any, duration: number) => void): void
  }

  export = MediaRendererClient
}
