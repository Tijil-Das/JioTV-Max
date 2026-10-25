'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRecordingStore } from '@/store/useRecordingStore'

/**
 * DesktopCaptureProvider handles surface capture for DRM (Widevine) channels.
 *
 * When the main process starts a surface-capture recording, it sends
 * 'desktop-capture:start' IPC to the renderer. This component:
 *   1. Lists capturable window sources via desktopCapturer
 *   2. Prompts the user to pick the JioTV player window
 *   3. Calls getUserMedia(chromeMediaSource: 'desktop') to capture it
 *   4. MediaRecords the stream and sends chunks back to the main process
 *   5. Handles pause/resume/stop IPC from the main process
 *
 * Mount once in the app tree (e.g. App.tsx).
 */

export function DesktopCaptureProvider(): JSX.Element | null {
  const {
    isDesktopCapturing,
    desktopCaptureSources,
    fetchDesktopCaptureSources,
    sendDesktopChunk,
    startDesktopCapture,
    stopDesktopCapture,
    pauseDesktopCapture,
    resumeDesktopCapture
  } = useRecordingStore()

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recordingIdRef = useRef<string | null>(null)
  const selectedSourceIdRef = useRef<string | null>(null)

  // Fetch available sources on mount
  useEffect(() => {
    void fetchDesktopCaptureSources()
  }, [fetchDesktopCaptureSources])

  // Handle start capture IPC
  useEffect(() => {
    const offStart = startDesktopCapture((data) => {
      recordingIdRef.current = data.recordingId
      void startCapture(data)
    })
    return () => offStart()
  }, [startDesktopCapture])

  // Handle stop capture IPC
  useEffect(() => {
    const offStop = stopDesktopCapture((data) => {
      if (recordingIdRef.current === data.recordingId) {
        stopCapture()
        recordingIdRef.current = null
      }
    })
    return () => offStop()
  }, [stopDesktopCapture])

  // Handle pause capture IPC
  useEffect(() => {
    const offPause = pauseDesktopCapture((data) => {
      if (recordingIdRef.current === data.recordingId && mediaRecorderRef.current) {
        mediaRecorderRef.current.pause()
      }
    })
    return () => offPause()
  }, [pauseDesktopCapture])

  // Handle resume capture IPC
  useEffect(() => {
    const offResume = resumeDesktopCapture((data) => {
      if (recordingIdRef.current === data.recordingId && mediaRecorderRef.current) {
        mediaRecorderRef.current.resume()
      }
    })
    return () => offResume()
  }, [resumeDesktopCapture])

  const startCapture = useCallback(async (data: { recordingId: string; channelId: string; channelName: string }) => {
    try {
      // Get sources if not already fetched
      if (desktopCaptureSources.length === 0) {
        await fetchDesktopCaptureSources()
      }

      // Prefer the JioTV Max player window; fall back to first window
      const sources = desktopCaptureSources
      const jioSource = sources.find((s) =>
        /jiotv|jio|player|max/i.test(s.name)
      )
      const source = jioSource ?? sources[0]
      if (!source) return

      selectedSourceIdRef.current = source.id

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: source.id
          }
        }
      })

      streamRef.current = stream

      const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm; codecs=vp9',
        videoBitsPerSecond: 6_000_000,
        audioBitsPerSecond: 128_000
      })

      mediaRecorderRef.current = recorder

      recorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && recordingIdRef.current) {
          const ab = await event.data.arrayBuffer()
          void sendDesktopChunk(recordingIdRef.current, ab)
        }
      }

      recorder.onstop = () => {
        stream?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        mediaRecorderRef.current = null
      }

      recorder.onerror = (e) => {
        // eslint-disable-next-line no-console
        console.error('[DesktopCapture] MediaRecorder error:', e)
      }

      recorder.start(1000) // send dataavailable every 1s
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[DesktopCapture] Failed to start capture:', err)
    }
  }, [desktopCaptureSources, fetchDesktopCaptureSources, sendDesktopChunk])

  const stopCapture = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    selectedSourceIdRef.current = null
    recordingIdRef.current = null
  }, [])

  return null
}
