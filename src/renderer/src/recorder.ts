import { Muxer, StreamTarget } from 'mp4-muxer'
import type { RecorderCommand, RecordingConfig } from '@shared/types'

/**
 * Hidden recorder window.
 *
 * Pipeline:
 *   getDisplayMedia (screen + loopback audio)
 *     -> optional region crop (OffscreenCanvas)
 *     -> VideoEncoder (H.264 / VP9)  -> mp4-muxer -> chunks -> main process
 *   system audio + microphone
 *     -> WebAudio mix -> AudioWorklet tap -> AudioEncoder (AAC / Opus) -> mp4-muxer
 *
 * Pausing does not interrupt the encoders: frames are dropped and the paused
 * wall-clock duration is subtracted from every subsequent timestamp, so the
 * output timeline stays continuous.
 */

const AUDIO_CHUNK_FRAMES = 1024
const AUDIO_SAMPLE_RATE = 48_000
const MAX_ENCODE_QUEUE = 24

const AUDIO_TAP_SOURCE = `
class ScreenRecTap extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    if (input && input.length > 0 && input[0] && input[0].length > 0) {
      const channels = []
      for (let i = 0; i < input.length; i++) channels.push(new Float32Array(input[i]))
      this.port.postMessage({ channels }, channels.map((channel) => channel.buffer))
    }
    return true
  }
}
registerProcessor('screenrec-tap', ScreenRecTap)
`

interface AudioPlan {
  codec: 'aac' | 'opus'
  context: AudioContext
  master: GainNode
  sources: MediaStreamAudioSourceNode[]
  worklet: AudioWorkletNode | null
  processor: ScriptProcessorNode | null
  channels: number
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function even(value: number): number {
  return Math.max(2, Math.round(value) - (Math.round(value) % 2))
}

class RecorderSession {
  private config: RecordingConfig
  private displayStream: MediaStream
  private videoTrack: MediaStreamTrack
  private micStream: MediaStream | null = null

  private audio: AudioPlan | null = null
  private audioEncoder: AudioEncoder | null = null
  private audioCodec: 'aac' | 'opus' = 'opus'
  private audioTimelineUs = 0
  private audioStarted = false
  private channelBufs: Float32Array[] = [new Float32Array(0), new Float32Array(0)]

  private muxer: Muxer<StreamTarget> | null = null
  private videoEncoder: VideoEncoder | null = null
  private reader: ReadableStreamDefaultReader<VideoFrame> | null = null

  private canvas: OffscreenCanvas | null = null
  private canvasCtx: OffscreenCanvasRenderingContext2D | null = null
  private cropPlan: { sx: number; sy: number; sw: number; sh: number } | null = null

  private width = 0
  private height = 0
  private fps: number
  private codec = 'avc1.640028'
  private hasAudio = false
  private frameDurationUs: number

  private paused = false
  private pauseStartedAt = 0
  private pausedTotalUs = 0
  private videoBaseTs: number | null = null
  private lastTsUs = 0
  private frameIndex = 0
  private thumbSent = false

  private stopping = false
  private failed = false
  private muted = false

  constructor(config: RecordingConfig, displayStream: MediaStream) {
    this.config = config
    this.displayStream = displayStream
    const videoTrack = displayStream.getVideoTracks()[0]
    if (!videoTrack) throw new Error('未能获取屏幕画面')
    this.videoTrack = videoTrack
    this.fps = config.fps > 0 ? config.fps : 30
    this.frameDurationUs = Math.round(1_000_000 / this.fps)
  }

  async begin(): Promise<void> {
    this.videoTrack.addEventListener('ended', () => {
      if (!this.stopping) window.recorder.streamEnded()
    })

    if (this.config.microphone) {
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: this.config.micDeviceId ? { deviceId: { exact: this.config.micDeviceId } } : true,
          video: false
        })
      } catch {
        this.micStream = null
      }
    }

    try {
      this.audio = await this.prepareAudio()
    } catch {
      this.audio = null
    }
    this.hasAudio = this.audio !== null
    if (this.audio) this.audioCodec = this.audio.codec

    const processor = new MediaStreamTrackProcessor({ track: this.videoTrack })
    this.reader = processor.readable.getReader()
    void this.pump()
  }

  private async prepareAudio(): Promise<AudioPlan | null> {
    const systemTrack = this.displayStream.getAudioTracks()[0] ?? null
    const micTrack = this.micStream?.getAudioTracks()[0] ?? null
    if (!systemTrack && !micTrack) return null

    const aac = await AudioEncoder.isConfigSupported({
      codec: 'mp4a.40.2',
      sampleRate: AUDIO_SAMPLE_RATE,
      numberOfChannels: 2,
      bitrate: 128_000
    }).catch(() => null)
    const opus = await AudioEncoder.isConfigSupported({
      codec: 'opus',
      sampleRate: AUDIO_SAMPLE_RATE,
      numberOfChannels: 2,
      bitrate: 128_000
    }).catch(() => null)
    // AAC in WebCodecs is rare; Opus is the practical default on Chromium.
    const codec: 'aac' | 'opus' | null = aac?.supported
      ? 'aac'
      : opus?.supported
        ? 'opus'
        : null
    if (!codec) return null

    const context = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE })
    await context.resume().catch(() => undefined)

    const master = context.createGain()
    master.gain.value = this.muted ? 0 : 1
    const sources: MediaStreamAudioSourceNode[] = []

    if (systemTrack) {
      const source = context.createMediaStreamSource(new MediaStream([systemTrack]))
      const gain = context.createGain()
      gain.gain.value = clamp((this.config.systemVolume ?? 100) / 100, 0, 2)
      source.connect(gain).connect(master)
      sources.push(source)
    }
    if (micTrack) {
      const source = context.createMediaStreamSource(new MediaStream([micTrack]))
      const gain = context.createGain()
      gain.gain.value = clamp((this.config.micVolume ?? 100) / 100, 0, 2)
      source.connect(gain).connect(master)
      sources.push(source)
    }

    const plan: AudioPlan = {
      codec,
      context,
      master,
      sources,
      worklet: null,
      processor: null,
      channels: 2
    }

    const silent = context.createGain()
    silent.gain.value = 0
    silent.connect(context.destination)

    try {
      const url = URL.createObjectURL(new Blob([AUDIO_TAP_SOURCE], { type: 'text/javascript' }))
      try {
        await context.audioWorklet.addModule(url)
      } finally {
        URL.revokeObjectURL(url)
      }
      const worklet = new AudioWorkletNode(context, 'screenrec-tap', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit'
      })
      worklet.port.onmessage = (event: MessageEvent<{ channels: Float32Array[] }>) => {
        this.pushSamples(event.data.channels)
      }
      master.connect(worklet)
      worklet.connect(silent)
      plan.worklet = worklet
    } catch {
      // AudioWorklet unavailable: fall back to the (deprecated) script processor.
      const processor = context.createScriptProcessor(4096, 2, 2)
      processor.onaudioprocess = (event) => {
        const buffer = event.inputBuffer
        const channels: Float32Array[] = []
        for (let i = 0; i < buffer.numberOfChannels; i++) {
          channels.push(new Float32Array(buffer.getChannelData(i)))
        }
        this.pushSamples(channels)
      }
      master.connect(processor)
      processor.connect(silent)
      plan.processor = processor
    }

    return plan
  }

  private pushSamples(channels: Float32Array[]): void {
    if (this.stopping || this.failed) return
    const length = channels[0]?.length ?? 0
    if (!length) return

    for (let channel = 0; channel < 2; channel++) {
      const source = channels[channel] ?? channels[0]
      const previous = this.channelBufs[channel]
      const next = new Float32Array(previous.length + length)
      next.set(previous)
      next.set(source.subarray(0, length), previous.length)
      this.channelBufs[channel] = next
    }

    while (this.channelBufs[0].length >= AUDIO_CHUNK_FRAMES) {
      this.encodeAudioChunk()
    }
  }

  private encodeAudioChunk(): void {
    const left = this.channelBufs[0].subarray(0, AUDIO_CHUNK_FRAMES)
    const right = this.channelBufs[1].subarray(0, AUDIO_CHUNK_FRAMES)

    const encoder = this.audioEncoder
    if (
      this.audioStarted &&
      !this.paused &&
      !this.stopping &&
      encoder &&
      encoder.state === 'configured' &&
      this.muxer
    ) {
      const planar = new Float32Array(AUDIO_CHUNK_FRAMES * 2)
      planar.set(left, 0)
      planar.set(right, AUDIO_CHUNK_FRAMES)
      const timestamp = this.audioTimelineUs
      this.audioTimelineUs += Math.round((AUDIO_CHUNK_FRAMES / AUDIO_SAMPLE_RATE) * 1_000_000)
      try {
        const data = new AudioData({
          format: 'f32-planar',
          sampleRate: AUDIO_SAMPLE_RATE,
          numberOfFrames: AUDIO_CHUNK_FRAMES,
          numberOfChannels: 2,
          timestamp,
          data: planar
        })
        encoder.encode(data)
        data.close()
      } catch {
        // Drop the chunk; a single audio hiccup must not kill the recording.
      }
    }

    this.channelBufs[0] = this.channelBufs[0].slice(AUDIO_CHUNK_FRAMES)
    this.channelBufs[1] = this.channelBufs[1].slice(AUDIO_CHUNK_FRAMES)
  }

  private createAudioEncoder(): void {
    if (!this.audio || !this.muxer) return
    const encoder = new AudioEncoder({
      output: (chunk, meta) => {
        if (this.muxer) this.muxer.addAudioChunk(chunk, meta)
      },
      error: (error) => this.fail(error)
    })
    encoder.configure({
      codec: this.audio.codec === 'aac' ? 'mp4a.40.2' : 'opus',
      sampleRate: AUDIO_SAMPLE_RATE,
      numberOfChannels: 2,
      bitrate: this.audio.codec === 'aac' ? 128_000 : 96_000
    })
    this.audioEncoder = encoder
  }

  private async pump(): Promise<void> {
    const reader = this.reader
    if (!reader) return
    try {
      for (;;) {
        const { done, value: frame } = await reader.read()
        if (done) break
        if (!frame) continue
        if (this.stopping || this.failed) {
          frame.close()
          continue
        }
        try {
          await this.handleFrame(frame)
        } catch (error) {
          this.fail(error)
          break
        }
        if (this.videoEncoder && this.videoEncoder.encodeQueueSize > MAX_ENCODE_QUEUE) {
          await delay(4)
        }
      }
    } catch (error) {
      if (!this.stopping && !this.failed) this.fail(error)
    }
  }

  private async handleFrame(frame: VideoFrame): Promise<void> {
    if (this.paused) {
      frame.close()
      return
    }

    if (!this.videoEncoder || !this.muxer) {
      await this.initPipeline(frame)
    }

    const encoder = this.videoEncoder
    const muxer = this.muxer
    if (!encoder || !muxer) {
      frame.close()
      return
    }

    const raw = frame.timestamp
    if (this.videoBaseTs === null) this.videoBaseTs = raw
    const timestamp = Math.max(
      this.lastTsUs + 1,
      raw - this.videoBaseTs - this.pausedTotalUs
    )

    let output: VideoFrame
    if (this.canvas && this.canvasCtx && this.cropPlan) {
      const plan = this.cropPlan
      this.canvasCtx.drawImage(frame, plan.sx, plan.sy, plan.sw, plan.sh, 0, 0, this.width, this.height)
      output = new VideoFrame(this.canvas, {
        timestamp,
        duration: this.frameDurationUs
      })
    } else if (timestamp === frame.timestamp && frame.duration !== null) {
      output = frame
    } else {
      output = new VideoFrame(frame, { timestamp, duration: this.frameDurationUs })
    }

    if (!this.thumbSent && this.frameIndex >= Math.round(this.fps)) {
      this.thumbSent = true
      this.captureThumbnail(frame)
    }

    this.lastTsUs = timestamp
    // A 1s GOP keeps lossless head trims (ffmpeg -c copy) within a second.
    const keyFrame = this.frameIndex % Math.max(1, Math.round(this.fps)) === 0
    encoder.encode(output, { keyFrame })
    if (output !== frame) output.close()
    frame.close()
    this.frameIndex++
  }

  private async initPipeline(frame: VideoFrame): Promise<void> {
    const frameWidth = frame.displayWidth || frame.codedWidth
    const frameHeight = frame.displayHeight || frame.codedHeight

    let sx = 0
    let sy = 0
    let sw = frameWidth
    let sh = frameHeight

    const crop = this.config.crop
    if (crop) {
      sx = clamp(Math.round(crop.x), 0, Math.max(0, frameWidth - 2))
      sy = clamp(Math.round(crop.y), 0, Math.max(0, frameHeight - 2))
      sw = clamp(Math.round(crop.width), 2, frameWidth - sx)
      sh = clamp(Math.round(crop.height), 2, frameHeight - sy)
      sw = even(sw)
      sh = even(sh)
      this.cropPlan = { sx, sy, sw, sh }
      this.width = sw
      this.height = sh
      this.canvas = new OffscreenCanvas(sw, sh)
      this.canvasCtx = this.canvas.getContext('2d', { alpha: false })
    } else {
      sw = even(sw)
      sh = even(sh)
      this.width = sw
      this.height = sh
    }

    const chosen = await this.pickVideoCodec()
    this.codec = chosen.codec

    this.muxer = new Muxer({
      target: new StreamTarget({
        // chunked:true would buffer up to 16 MiB in memory before writing, which
        // defeats crash recovery. Write every muxer flush straight to disk.
        chunked: false,
        onData: (data, position) => {
          const copy = new Uint8Array(data.byteLength)
          copy.set(data)
          window.recorder.chunk({ position, data: copy.buffer })
        }
      }),
      video: {
        codec: chosen.container,
        width: this.width,
        height: this.height,
        frameRate: this.fps
      },
      audio: this.audio
        ? {
            codec: this.audio.codec,
            numberOfChannels: 2,
            sampleRate: AUDIO_SAMPLE_RATE
          }
        : undefined,
      fastStart: 'fragmented',
      firstTimestampBehavior: 'cross-track-offset'
    })

    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        if (this.muxer) this.muxer.addVideoChunk(chunk, meta)
      },
      error: (error) => this.fail(error)
    })

    const config: VideoEncoderConfig = {
      codec: chosen.codec,
      width: this.width,
      height: this.height,
      bitrate: this.config.bitrate,
      framerate: this.fps,
      latencyMode: 'quality'
    }
    if (chosen.container === 'avc') config.avc = { format: 'avc' }

    encoder.configure(config)
    this.videoEncoder = encoder

    if (this.audio) this.createAudioEncoder()
    this.audioStarted = true

    window.recorder.ready({
      width: this.width,
      height: this.height,
      fps: this.fps,
      codec: this.codec,
      hasAudio: this.hasAudio
    })
  }

  private async pickVideoCodec(): Promise<{ codec: string; container: 'avc' | 'vp9' }> {
    const large = this.width * this.height > 1920 * 1080 * 1.2
    const candidates: Array<{ codec: string; container: 'avc' | 'vp9' }> = large
      ? [
          { codec: 'avc1.640033', container: 'avc' },
          { codec: 'avc1.4d0033', container: 'avc' },
          { codec: 'avc1.640028', container: 'avc' },
          { codec: 'vp09.00.10.08', container: 'vp9' }
        ]
      : [
          { codec: 'avc1.640028', container: 'avc' },
          { codec: 'avc1.4d0028', container: 'avc' },
          { codec: 'avc1.42e01e', container: 'avc' },
          { codec: 'vp09.00.10.08', container: 'vp9' }
        ]

    for (const candidate of candidates) {
      const base: VideoEncoderConfig = {
        codec: candidate.codec,
        width: this.width,
        height: this.height,
        bitrate: this.config.bitrate,
        framerate: this.fps
      }
      if (candidate.container === 'avc') base.avc = { format: 'avc' }
      const supported = await VideoEncoder.isConfigSupported(base).catch(() => null)
      if (supported?.supported) return candidate
    }

    throw new Error('当前设备不支持可用的视频编码器（H.264 / VP9）')
  }

  private captureThumbnail(frame: VideoFrame): void {
    try {
      const targetWidth = 480
      const scale = Math.min(1, targetWidth / this.width)
      const width = Math.max(2, Math.round(this.width * scale))
      const height = Math.max(2, Math.round(this.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) return
      const plan = this.cropPlan
      if (plan) {
        context.drawImage(frame, plan.sx, plan.sy, plan.sw, plan.sh, 0, 0, width, height)
      } else {
        context.drawImage(frame, 0, 0, this.width, this.height, 0, 0, width, height)
      }
      window.recorder.thumbnail(canvas.toDataURL('image/jpeg', 0.72))
    } catch {
      // Thumbnails are cosmetic.
    }
  }

  pause(): void {
    if (this.paused || this.stopping) return
    this.paused = true
    this.pauseStartedAt = performance.now()
  }

  resume(): void {
    if (!this.paused) return
    this.pausedTotalUs += Math.round((performance.now() - this.pauseStartedAt) * 1000)
    this.paused = false
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (this.audio) {
      const now = this.audio.context.currentTime
      this.audio.master.gain.cancelScheduledValues(now)
      this.audio.master.gain.setTargetAtTime(muted ? 0 : 1, now, 0.015)
    }
  }

  async stop(): Promise<void> {
    if (this.stopping) return
    this.stopping = true
    const durationMs = Math.round(this.lastTsUs / 1000)

    this.audioStarted = false
    await this.reader?.cancel().catch(() => undefined)
    await this.videoEncoder?.flush().catch(() => undefined)
    this.videoEncoder?.close()
    await this.audioEncoder?.flush().catch(() => undefined)
    this.audioEncoder?.close()

    try {
      this.muxer?.finalize()
    } catch {
      // The main process still has the bytes written so far.
    }

    this.teardown()
    window.recorder.done({
      durationMs,
      width: this.width,
      height: this.height,
      fps: this.fps,
      codec: this.codec,
      hasAudio: this.hasAudio,
      container: 'mp4'
    })
  }

  async cancel(): Promise<void> {
    if (this.stopping) return
    this.stopping = true
    this.audioStarted = false
    await this.reader?.cancel().catch(() => undefined)
    try {
      this.videoEncoder?.close()
    } catch {
      // already closed
    }
    try {
      this.audioEncoder?.close()
    } catch {
      // already closed
    }
    this.teardown()
  }

  private fail(error: unknown): void {
    if (this.failed || this.stopping) return
    this.failed = true
    const message = error instanceof Error ? error.message : String(error)
    this.teardown()
    window.recorder.error(message)
  }

  private teardown(): void {
    try {
      this.videoTrack.stop()
    } catch {
      // ignore
    }
    for (const track of this.displayStream.getTracks()) track.stop()
    for (const track of this.micStream?.getTracks() ?? []) track.stop()

    if (this.audio) {
      try {
        if (this.audio.worklet) {
          this.audio.worklet.port.onmessage = null
          this.audio.worklet.disconnect()
        }
        if (this.audio.processor) {
          this.audio.processor.onaudioprocess = null
          this.audio.processor.disconnect()
        }
        for (const source of this.audio.sources) source.disconnect()
        this.audio.master.disconnect()
        void this.audio.context.close().catch(() => undefined)
      } catch {
        // ignore
      }
      this.audio = null
    }

    this.reader = null
    this.canvas = null
    this.canvasCtx = null
  }
}

let session: RecorderSession | null = null

function applyCommand(command: RecorderCommand): void {
  if (!session) return
  switch (command.type) {
    case 'pause':
      session.pause()
      break
    case 'resume':
      session.resume()
      break
    case 'mute':
      session.setMuted(command.muted)
      break
    case 'stop':
      void session.stop()
      break
    case 'cancel': {
      const active = session
      session = null
      void active.cancel()
      break
    }
  }
}

async function start(id: string, config: RecordingConfig): Promise<void> {
  window.__setRecorderId(id)
  try {
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: config.fps, max: config.fps } },
      audio: config.systemAudio
    })
    session = new RecorderSession(config, displayStream)
    await session.begin()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    window.recorder.error(message === 'Permission denied' ? '用户取消了屏幕共享授权' : message)
  }
}

window.recorder.onStart((payload) => {
  void start(payload.id, payload.config)
})

window.recorder.onCommand((command) => {
  applyCommand(command)
})

window.addEventListener('beforeunload', () => {
  void session?.cancel()
})