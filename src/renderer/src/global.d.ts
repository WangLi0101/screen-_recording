import type { AppApi, ControlApi, RecorderApi, RegionApi } from '@shared/api'

declare global {
  interface Window {
    api: AppApi
    recorder: RecorderApi
    control: ControlApi
    region: RegionApi
    __setRecorderId: (id: string) => void
  }

  // Breakout Box API (not part of the DOM lib yet).
  interface MediaStreamTrackProcessorInit {
    track: MediaStreamTrack
    maxBufferSize?: number
  }

  class MediaStreamTrackProcessor<T = VideoFrame> {
    constructor(init: MediaStreamTrackProcessorInit)
    readonly readable: ReadableStream<T>
  }
}

export {}