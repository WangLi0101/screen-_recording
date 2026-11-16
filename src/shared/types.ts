export type SourceKind = 'display' | 'window'

export interface SourceInfo {
  id: string
  name: string
  kind: SourceKind
  thumbnail: string | null
  appIcon: string | null
  displayId: string | null
}

export interface CropRect {
  /** Physical pixels relative to the captured display frame. */
  x: number
  y: number
  width: number
  height: number
  scaleFactor: number
}

export interface RegionSelection {
  sourceId: string
  sourceName: string
  sourceKind: SourceKind
  displayId: string
  crop: CropRect
}

export interface RecordingConfig {
  sourceId: string
  sourceName: string
  sourceKind: SourceKind
  crop?: CropRect | null
  fps: number
  bitrate: number
  systemAudio: boolean
  microphone: boolean
  micDeviceId?: string | null
  /** 0-200 (%) */
  systemVolume: number
  /** 0-200 (%) */
  micVolume: number
  countdown: number
}

export type RecordingStatus = 'ready' | 'recoverable' | 'failed'

export interface Recording {
  id: string
  title: string
  createdAt: number
  durationMs: number
  sizeBytes: number
  status: RecordingStatus
  source: { kind: SourceKind; name: string; crop?: CropRect | null }
  video: { width: number; height: number; fps: number; codec: string }
  audio: { system: boolean; mic: boolean }
  hasAudio: boolean
  files: { video: string; thumbnail?: string }
  error?: string
}

export type ThemeMode = 'dark' | 'light' | 'system'

export interface Settings {
  recordingsDir: string
  fps: number
  bitrate: number
  systemAudio: boolean
  microphone: boolean
  micDeviceId: string | null
  systemVolume: number
  micVolume: number
  countdown: number
  lastSourceId: string | null
  lastSourceName: string | null
  lastSourceKind: SourceKind | null
  lastCrop: CropRect | null
  theme: ThemeMode
  /** Accent color as `#rrggbb`. */
  accent: string
  language: 'zh-CN' | 'en'
}

export type RecordingPhase =
  | 'idle'
  | 'countdown'
  | 'preparing'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'error'

export interface RecordingState {
  phase: RecordingPhase
  id?: string
  elapsedMs: number
  bytes: number
  muted: boolean
  countdownRemainingMs?: number
  message?: string
}

export interface RecorderReadyInfo {
  width: number
  height: number
  fps: number
  codec: string
  hasAudio: boolean
}

export interface RecorderDoneInfo {
  durationMs: number
  width: number
  height: number
  fps: number
  codec: string
  hasAudio: boolean
  container: 'mp4' | 'webm'
  thumbnail?: string | null
}

export type RecorderCommand =
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop' }
  | { type: 'cancel' }
  | { type: 'mute'; muted: boolean }

export type ExportResolution = 'original' | '1080p' | '720p'

export interface ExportRequest {
  id: string
  targetDir: string
  fileName: string
  resolution: ExportResolution
}

export interface ExportProgress {
  id: string
  percent: number
  state: 'running' | 'done' | 'error'
  message?: string
  output?: string
}

export type PermissionStatus = 'granted' | 'denied' | 'unknown' | 'not-applicable'

export interface PermissionSnapshot {
  screen: PermissionStatus
  microphone: PermissionStatus
  systemAudio: PermissionStatus
  accessibility: PermissionStatus
}

export interface AppState {
  version: string
  platform: string
  settings: Settings
  permissions: PermissionSnapshot
  ffmpeg: boolean
}

export type ControlAction = 'pause' | 'resume' | 'stop' | 'cancel' | 'mute'

export type AppEvent =
  | { type: 'recording-state'; state: RecordingState }
  | { type: 'recording-done'; recording: Recording }
  | { type: 'recording-error'; message: string }
  | { type: 'library-changed' }
  | { type: 'export-progress'; progress: ExportProgress }
  | { type: 'open-prepare' }
  | { type: 'toast'; message: string; tone?: 'info' | 'error' }

export interface RegionInitInfo {
  width: number
  height: number
  scaleFactor: number
}

export interface RegionRect {
  x: number
  y: number
  width: number
  height: number
}