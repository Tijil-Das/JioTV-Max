import type { StreamDeckApi } from '@shared/types'

/** The preload bridge, when running inside Electron. */
export function getBridge(): StreamDeckApi | null {
  return typeof window !== 'undefined' && window.api ? window.api : null
}

export const isElectron = Boolean(getBridge()?.isElectron)

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code = 'UNKNOWN',
    readonly retryable = false
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function toApiError(error: unknown, fallback = 'Something went wrong.'): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof Error) return new ApiError(error.message || fallback)
  return new ApiError(fallback)
}
