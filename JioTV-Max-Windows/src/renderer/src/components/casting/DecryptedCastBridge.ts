/**
 * DecryptedCastBridge.ts
 *
 * Captures decrypted media playing in the desktop application (Widevine DRM / DASH)
 * and feeds the unencrypted audio/video chunks to the local StreamServer via IPC.
 *
 * This guarantees that ANY TV (Chromecast, DLNA Samsung/LG/Sony, Web Receiver)
 * can play the channel without needing DRM or license capabilities.
 */

class DecryptedCastBridge {
  private active = false
  private recorder: MediaRecorder | null = null
  private mediaStream: MediaStream | null = null
  private videoElement: HTMLVideoElement | null = null
  private audioCtx: AudioContext | null = null
  private gainNode: GainNode | null = null
  private prevVolume: number | null = null
  private prevMuted: boolean | null = null
  private activeToken: string | null = null

  public isActive(): boolean {
    return this.active
  }

  public async start(video: HTMLVideoElement, token?: string): Promise<boolean> {
    if (this.active) {
      console.log('[DecryptedCastBridge] Already running')
      return true
    }

    if (!window.castApi) {
      console.warn('[DecryptedCastBridge] window.castApi is not available')
      return false
    }

    this.videoElement = video
    this.activeToken = token || null

    let stream: MediaStream | null = null

    // 1. Attempt HTMLMediaElement captureStream (pristine direct video + audio)
    try {
      if (typeof (video as any).captureStream === 'function') {
        stream = (video as any).captureStream()
      } else if (typeof (video as any).mozCaptureStream === 'function') {
        stream = (video as any).mozCaptureStream()
      }
    } catch (err) {
      console.log('[DecryptedCastBridge] captureStream() threw (likely EME with media keys):', err)
    }

    // 2. Fallback to desktopCapturer window capture if element capture is blocked by DRM/EME
    if (!stream || stream.getVideoTracks().length === 0) {
      try {
        const sourceId = await window.castApi?.getAppWindowSource()
        if (sourceId) {
          console.log('[DecryptedCastBridge] Capturing application window via desktopCapturer:', sourceId)
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              mandatory: {
                chromeMediaSource: 'desktop'
              }
            },
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId,
                minWidth: 1280,
                maxWidth: 1920,
                minHeight: 720,
                maxHeight: 1080,
                maxFrameRate: 30
              }
            }
          } as any)
        }
      } catch (err) {
        console.warn('[DecryptedCastBridge] Window capture fallback failed:', err)
      }
    }

    if (!stream || stream.getVideoTracks().length === 0) {
      console.error('[DecryptedCastBridge] Failed to acquire any video track from player')
      return false
    }

    this.mediaStream = stream

    // 3. Mute local speakers to prevent audio echo with TV while keeping stream unmuted
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass()
        const source = this.audioCtx.createMediaElementSource(video)
        this.gainNode = this.audioCtx.createGain()
        this.gainNode.gain.value = 0 // Silences local PC speakers
        source.connect(this.gainNode)
        this.gainNode.connect(this.audioCtx.destination)

        const dest = this.audioCtx.createMediaStreamDestination()
        source.connect(dest)
        const audioTrack = dest.stream.getAudioTracks()[0]
        if (audioTrack && stream.getAudioTracks().length === 0) {
          stream.addTrack(audioTrack)
        }
      }
    } catch {
      // If Web Audio API cannot hook the element (e.g. already connected), softly lower volume
      this.prevVolume = video.volume
      this.prevMuted = video.muted
      video.muted = true
    }

    // 4. Select optimal container/codec format
    const candidateTypes = [
      'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
      'video/mp4',
      'video/webm; codecs="h264,opus"',
      'video/webm; codecs="vp8,opus"',
      'video/webm'
    ]

    let selectedMime = 'video/webm'
    for (const mime of candidateTypes) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
        selectedMime = mime
        break
      }
    }

    console.log(`[DecryptedCastBridge] Selected recording mimeType: ${selectedMime}`)

    try {
      // 5. Tell main process StreamServer to prepare live relay
      await window.castApi?.startLiveRelay(token || '', selectedMime)

      this.recorder = new MediaRecorder(stream, {
        mimeType: selectedMime,
        videoBitsPerSecond: 4_500_000
      })

      this.recorder.ondataavailable = async (e: BlobEvent) => {
        if (e.data && e.data.size > 0) {
          try {
            const buf = await e.data.arrayBuffer()
            await window.castApi?.feedLiveChunk(token || '', buf)
          } catch (err) {
            console.warn('[DecryptedCastBridge] feedLiveChunk failed:', err)
          }
        }
      }

      this.recorder.onerror = (err) => {
        console.error('[DecryptedCastBridge] MediaRecorder error:', err)
      }

      // 400ms time slice for smooth continuous live delivery
      this.recorder.start(400)
      this.active = true
      console.log('[DecryptedCastBridge] Successfully started recording decrypted stream')
      return true
    } catch (err) {
      console.error('[DecryptedCastBridge] Failed to start MediaRecorder:', err)
      await this.stop(token)
      return false
    }
  }

  public async stop(token?: string): Promise<void> {
    if (!this.active) return
    const targetToken = token || this.activeToken || ''
    console.log('[DecryptedCastBridge] Stopping decrypted stream bridge')

    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop()
      } catch {}
      this.recorder = null
    }

    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        try {
          track.stop()
        } catch {}
      }
      this.mediaStream = null
    }

    // Restore local PC audio
    if (this.gainNode) {
      try {
        this.gainNode.gain.value = 1.0
      } catch {}
      this.gainNode = null
    }

    if (this.audioCtx) {
      try {
        await this.audioCtx.close()
      } catch {}
      this.audioCtx = null
    }

    if (this.videoElement) {
      if (this.prevVolume !== null) {
        this.videoElement.volume = this.prevVolume
        this.prevVolume = null
      }
      if (this.prevMuted !== null) {
        this.videoElement.muted = this.prevMuted
        this.prevMuted = null
      }
    }

    try {
      await window.castApi?.stopLiveRelay(targetToken)
    } catch {}

    this.active = false
    this.videoElement = null
    this.activeToken = null
  }
}

export const decryptedCastBridge = new DecryptedCastBridge()
