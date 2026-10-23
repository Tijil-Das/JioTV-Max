/**
 * Decrypted Cast Bridge
 *
 * Captures the decrypted audio and video from the local player and streams
 * it to the LAN StreamServer via IPC so that ANY TV receiver (Chromecast,
 * DLNA Samsung/LG, Web Receiver) can play it without DRM or token rejections.
 */

interface AudioRouting {
  ctx: AudioContext
  source: MediaElementAudioSourceNode
  dest: MediaStreamAudioDestinationNode
  localGain: GainNode
}

const audioRoutingMap = new WeakMap<HTMLVideoElement, AudioRouting>()

function getOrCreateAudioNodes(video: HTMLVideoElement): AudioRouting | null {
  try {
    const existing = audioRoutingMap.get(video)
    if (existing && existing.ctx.state !== 'closed') {
      if (existing.ctx.state === 'suspended') {
        void existing.ctx.resume().catch(() => {})
      }
      return existing
    }

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return null

    const ctx = new AudioContextClass()
    const source = ctx.createMediaElementSource(video)
    const dest = ctx.createMediaStreamDestination()
    const localGain = ctx.createGain()

    // Route 1 to TV receiver (always full audio volume)
    source.connect(dest)
    // Route 2 to local speakers (muted during casting)
    source.connect(localGain)
    localGain.connect(ctx.destination)

    const routing: AudioRouting = { ctx, source, dest, localGain }
    audioRoutingMap.set(video, routing)
    return routing
  } catch (err) {
    console.warn('[DecryptedCastBridge] Audio routing setup failed:', err)
    return null
  }
}

export class DecryptedCastBridge {
  private activeToken: string | null = null
  private recorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private boundVideo: HTMLVideoElement | null = null
  private isRelaying = false

  public async start(video: HTMLVideoElement, token: string): Promise<boolean> {
    if (this.isRelaying && this.activeToken === token) {
      return true
    }

    this.stop()
    this.activeToken = token
    this.boundVideo = video

    try {
      // 1. Capture video tracks from the video element
      let capturedStream: MediaStream | null = null
      const videoAny = video as unknown as {
        captureStream?: () => MediaStream
        mozCaptureStream?: () => MediaStream
      }

      if (typeof videoAny.captureStream === 'function') {
        try {
          capturedStream = videoAny.captureStream()
        } catch {
          capturedStream = null
        }
      } else if (typeof videoAny.mozCaptureStream === 'function') {
        try {
          capturedStream = videoAny.mozCaptureStream()
        } catch {
          capturedStream = null
        }
      }

      let videoTracks: MediaStreamTrack[] = capturedStream ? capturedStream.getVideoTracks() : []

      // Fallback: window capture if captureStream provided no video tracks
      if (videoTracks.length === 0 && window.castApi?.getAppWindowSource) {
        try {
          const sourceId = await window.castApi.getAppWindowSource()
          if (sourceId) {
            const displayStream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: {
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: sourceId,
                  minFrameRate: 24,
                  maxFrameRate: 30
                }
              } as unknown as MediaTrackConstraints
            })
            videoTracks = displayStream.getVideoTracks()
          }
        } catch (winErr) {
          console.warn('[DecryptedCastBridge] Window capture fallback failed:', winErr)
        }
      }

      if (videoTracks.length === 0) {
        console.warn('[DecryptedCastBridge] No video tracks available to cast')
        return false
      }

      // 2. Capture audio and mute laptop speakers
      let audioTracks: MediaStreamTrack[] = []
      const routing = getOrCreateAudioNodes(video)
      if (routing) {
        try {
          routing.localGain.gain.setValueAtTime(0, routing.ctx.currentTime)
          audioTracks = routing.dest.stream.getAudioTracks()
        } catch (gainErr) {
          console.warn('[DecryptedCastBridge] Could not mute local audio gain:', gainErr)
        }
      }

      if (audioTracks.length === 0 && capturedStream) {
        audioTracks = capturedStream.getAudioTracks()
      }

      // Combine video and audio tracks
      const combinedTracks = [...videoTracks, ...audioTracks]
      this.stream = new MediaStream(combinedTracks)

      // 3. Select supported container / codec format
      const mimeCandidates = [
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9,opus',
        'video/webm',
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4'
      ]
      const chosenMime =
        mimeCandidates.find(
          (m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)
        ) || 'video/webm'

      // 4. Notify LAN StreamServer of live relay format
      if (window.castApi?.startLiveRelay) {
        await window.castApi.startLiveRelay(token, chosenMime)
      }

      // 5. Initialize MediaRecorder with low latency chunk interval
      this.recorder = new MediaRecorder(this.stream, {
        mimeType: chosenMime,
        videoBitsPerSecond: 3_000_000
      })

      this.recorder.ondataavailable = async (event: BlobEvent) => {
        if (event.data && event.data.size > 0 && this.isRelaying && this.activeToken) {
          try {
            const buffer = await event.data.arrayBuffer()
            if (window.castApi?.feedLiveChunk && this.activeToken) {
              await window.castApi.feedLiveChunk(this.activeToken, buffer)
            }
          } catch (chunkErr) {
            console.warn('[DecryptedCastBridge] Chunk delivery error:', chunkErr)
          }
        }
      }

      this.recorder.start(500)
      this.isRelaying = true
      return true
    } catch (err) {
      console.error('[DecryptedCastBridge] Failed to start live decrypted relay:', err)
      this.stop()
      return false
    }
  }

  public stop(): void {
    const token = this.activeToken
    const video = this.boundVideo
    this.isRelaying = false
    this.activeToken = null
    this.boundVideo = null

    if (this.recorder) {
      try {
        if (this.recorder.state !== 'inactive') {
          this.recorder.stop()
        }
      } catch {}
      this.recorder = null
    }

    if (this.stream) {
      try {
        this.stream.getTracks().forEach((track) => track.stop())
      } catch {}
      this.stream = null
    }

    if (video) {
      try {
        const routing = audioRoutingMap.get(video)
        if (routing && routing.ctx.state !== 'closed') {
          routing.localGain.gain.setValueAtTime(1, routing.ctx.currentTime)
        }
      } catch {}
    }

    if (token && window.castApi?.stopLiveRelay) {
      void window.castApi.stopLiveRelay(token)
    }
  }

  public isActive(): boolean {
    return this.isRelaying
  }
}

export const decryptedCastBridge = new DecryptedCastBridge()
