/// <reference lib="webworker" />

import {
  runLogoPipeline,
  type LogoPipelineResult,
  type LogoPipelineTier
} from '../lib/logo/pipeline'

/**
 * Addendum 3 logo worker. Decodes the fetched bytes with createImageBitmap,
 * runs the pure pipeline on RGBA data, and returns a cropped PNG blob. The
 * main thread owns network access and IndexedDB; this worker only touches
 * OffscreenCanvas.
 */

export interface LogoWorkerRequest {
  id: number
  channelId: string
  bytes: ArrayBuffer
  mimeType?: string
  tileSize: number
  areaFactor?: number
  forceTier?: LogoPipelineTier
}

export interface LogoWorkerResponse {
  id: number
  ok: boolean
  error?: string
  result?: Omit<LogoPipelineResult, 'image'>
  blob?: Blob
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<LogoWorkerRequest>) => void) | null
  postMessage: (message: LogoWorkerResponse, transfer?: Transferable[]) => void
}

async function decode(bytes: ArrayBuffer, mimeType?: string): Promise<ImageData> {
  const blob = new Blob([bytes], { type: mimeType || '' })
  const bitmap = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('OffscreenCanvas 2D context unavailable')
  context.drawImage(bitmap, 0, 0)
  const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height)
  bitmap.close()
  return imageData
}

async function encode(image: ImageData): Promise<Blob> {
  const canvas = new OffscreenCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('OffscreenCanvas 2D context unavailable')
  context.putImageData(image, 0, 0)
  return canvas.convertToBlob({ type: 'image/png' })
}

workerScope.onmessage = (event) => {
  const request = event.data
  void (async () => {
    try {
      const imageData = await decode(request.bytes, request.mimeType)
      const result = runLogoPipeline(
        {
          data: imageData.data,
          width: imageData.width,
          height: imageData.height
        },
        {
          tileSize: request.tileSize,
          areaFactor: request.areaFactor,
          forceTier: request.forceTier,
          channelId: request.channelId
        }
      )

      if (!result.ok || !result.image) {
        const { image: _image, ...serializable } = result
        // if (!result.ok) console.warn(request.channelId, result.reason ?? 'logo rejected')
        workerScope.postMessage({ id: request.id, ok: false, result: serializable })
        return
      }

      const png = await encode(
        new ImageData(
          new Uint8ClampedArray(result.image.data),
          result.image.width,
          result.image.height
        )
      )
      const { image: _image, ...serializable } = result
      workerScope.postMessage({ id: request.id, ok: true, result: serializable, blob: png })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'logo decode failed'
      // console.warn(request.channelId, message)
      workerScope.postMessage({ id: request.id, ok: false, error: message })
    }
  })()
}
