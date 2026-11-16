import type {
  AppEvent,
  AppState,
  ControlAction,
  ExportRequest,
  PermissionSnapshot,
  Recording,
  RecordingConfig,
  RecordingState,
  RecorderCommand,
  RecorderDoneInfo,
  RecorderReadyInfo,
  RegionInitInfo,
  RegionRect,
  RegionSelection,
  Settings,
  SourceInfo
} from './types'

export interface AppApi {
  getState(): Promise<AppState>
  getRecordingState(): Promise<RecordingState>
  listSources(): Promise<SourceInfo[]>
  selectRegion(): Promise<RegionSelection | null>
  startRecording(config: RecordingConfig): Promise<{ id: string }>
  stopRecording(): Promise<void>
  pauseRecording(): Promise<void>
  resumeRecording(): Promise<void>
  cancelRecording(): Promise<void>
  toggleMute(): Promise<void>
  controlAction(action: ControlAction): Promise<void>

  listLibrary(): Promise<Recording[]>
  renameRecording(id: string, title: string): Promise<void>
  deleteRecording(id: string): Promise<void>
  revealRecording(id: string): Promise<void>
  recoverRecording(id: string): Promise<Recording>
  trimRecording(id: string, startMs: number, endMs: number): Promise<Recording>

  exportRecording(req: ExportRequest): Promise<{ output: string }>
  cancelExport(id: string): Promise<void>

  chooseDirectory(): Promise<string | null>
  updateSettings(patch: Partial<Settings>): Promise<Settings>
  getPermissions(): Promise<PermissionSnapshot>
  openSystemSettings(kind: 'screen' | 'microphone' | 'systemAudio' | 'accessibility'): Promise<void>
  openPath(target: string): Promise<void>

  onEvent(cb: (event: AppEvent) => void): () => void
}

export interface RecorderApi {
  onStart(cb: (payload: { id: string; config: RecordingConfig }) => void): void
  onCommand(cb: (command: RecorderCommand) => void): void
  ready(info: RecorderReadyInfo): void
  chunk(payload: { position: number; data: ArrayBuffer }): void
  thumbnail(dataUrl: string): void
  done(info: RecorderDoneInfo): void
  error(message: string): void
  streamEnded(): void
}

export interface ControlApi {
  onState(cb: (state: RecordingState) => void): void
  action(action: ControlAction): void
}

export interface RegionApi {
  onInit(cb: (info: RegionInitInfo) => void): void
  finish(rect: RegionRect): void
  cancel(): void
}

// Channel names shared by main / preload.
export const CH = {
  appState: 'app:state',
  appEvent: 'app:event',
  sourcesList: 'sources:list',
  sourcesRegion: 'sources:region',
  regionInit: 'region:init',
  regionFinish: 'region:finish',
  regionCancel: 'region:cancel',
  recStart: 'recording:start',
  recStop: 'recording:stop',
  recPause: 'recording:pause',
  recResume: 'recording:resume',
  recCancel: 'recording:cancel',
  recMute: 'recording:mute',
  recState: 'recording:state',
  recControl: 'recording:control',
  recReady: 'recorder:ready',
  recChunk: 'recorder:chunk',
  recThumb: 'recorder:thumbnail',
  recDone: 'recorder:done',
  recError: 'recorder:error',
  recEnded: 'recorder:stream-ended',
  recBegin: 'recorder:start',
  recCommand: 'recorder:command',
  libList: 'library:list',
  libRename: 'library:rename',
  libDelete: 'library:delete',
  libReveal: 'library:reveal',
  libRecover: 'library:recover',
  libTrim: 'library:trim',
  exportStart: 'export:start',
  exportCancel: 'export:cancel',
  settingsUpdate: 'settings:update',
  permsGet: 'permissions:get',
  permsOpen: 'permissions:open',
  dialogDir: 'dialog:directory',
  shellOpen: 'shell:open'
} as const