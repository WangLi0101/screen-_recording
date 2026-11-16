import { contextBridge, ipcRenderer } from 'electron'
import { CH, type AppApi, type ControlApi, type RecorderApi, type RegionApi } from '../shared/api'
import type {
  AppEvent,
  ControlAction,
  ExportRequest,
  RecorderCommand,
  RecordingConfig,
  RecordingState,
  RegionInitInfo,
  RegionRect,
  Settings
} from '../shared/types'

const api: AppApi = {
  getState: () => ipcRenderer.invoke(CH.appState),
  getRecordingState: () => ipcRenderer.invoke(CH.recState),
  listSources: () => ipcRenderer.invoke(CH.sourcesList),
  selectRegion: () => ipcRenderer.invoke(CH.sourcesRegion),
  startRecording: (config: RecordingConfig) => ipcRenderer.invoke(CH.recStart, config),
  stopRecording: () => ipcRenderer.invoke(CH.recStop),
  pauseRecording: () => ipcRenderer.invoke(CH.recPause),
  resumeRecording: () => ipcRenderer.invoke(CH.recResume),
  cancelRecording: () => ipcRenderer.invoke(CH.recCancel),
  toggleMute: () => ipcRenderer.invoke(CH.recMute),
  controlAction: (action: ControlAction) => ipcRenderer.invoke(CH.recControl, action),

  listLibrary: () => ipcRenderer.invoke(CH.libList),
  renameRecording: (id: string, title: string) => ipcRenderer.invoke(CH.libRename, id, title),
  deleteRecording: (id: string) => ipcRenderer.invoke(CH.libDelete, id),
  revealRecording: (id: string) => ipcRenderer.invoke(CH.libReveal, id),
  recoverRecording: (id: string) => ipcRenderer.invoke(CH.libRecover, id),
  trimRecording: (id: string, startMs: number, endMs: number) =>
    ipcRenderer.invoke(CH.libTrim, id, startMs, endMs),

  exportRecording: (request: ExportRequest) => ipcRenderer.invoke(CH.exportStart, request),
  cancelExport: (id: string) => ipcRenderer.invoke(CH.exportCancel, id),

  chooseDirectory: () => ipcRenderer.invoke(CH.dialogDir),
  updateSettings: (patch: Partial<Settings>) => ipcRenderer.invoke(CH.settingsUpdate, patch),
  getPermissions: () => ipcRenderer.invoke(CH.permsGet),
  openSystemSettings: (kind: 'screen' | 'microphone' | 'systemAudio' | 'accessibility') =>
    ipcRenderer.invoke(CH.permsOpen, kind),
  openPath: (target: string) => ipcRenderer.invoke(CH.shellOpen, target),

  onEvent: (cb: (event: AppEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AppEvent): void => cb(payload)
    ipcRenderer.on(CH.appEvent, handler)
    return () => {
      ipcRenderer.off(CH.appEvent, handler)
    }
  }
}

// The recorder page is single-session; keep the id locally to avoid leaking it everywhere.
let currentId = ''

// Renderer pages are route-lazy now, so the main process can send `recorder:start`
// or `region:init` before the page script has registered its listener. The preload
// runs before any page script, so buffer those payloads here and replay on subscribe.
let startHandler: ((payload: { id: string; config: RecordingConfig }) => void) | null = null
const pendingStarts: Array<{ id: string; config: RecordingConfig }> = []

ipcRenderer.on(CH.recBegin, (_event, payload: { id: string; config: RecordingConfig }) => {
  if (startHandler) startHandler(payload)
  else pendingStarts.push(payload)
})

const recorder: RecorderApi = {
  onStart: (cb) => {
    startHandler = cb
    for (const payload of pendingStarts.splice(0)) cb(payload)
  },
  onCommand: (cb) => {
    ipcRenderer.on(CH.recCommand, (_event, command: RecorderCommand) => cb(command))
  },
  ready: (info) => ipcRenderer.send(CH.recReady, { id: currentId, info }),
  chunk: (payload) => ipcRenderer.send(CH.recChunk, { id: currentId, ...payload }),
  thumbnail: (dataUrl) => ipcRenderer.send(CH.recThumb, { id: currentId, dataUrl }),
  done: (info) => ipcRenderer.send(CH.recDone, { id: currentId, info }),
  error: (message) => ipcRenderer.send(CH.recError, { id: currentId, message }),
  streamEnded: () => ipcRenderer.send(CH.recEnded)
}

// Like the recorder, the control bar only subscribes after its lazy route mounts.
// Keep the latest state so a freshly created bar is never stuck on "idle".
let controlHandler: ((state: RecordingState) => void) | null = null
let latestControlState: RecordingState | null = null

ipcRenderer.on(CH.appEvent, (_event, payload: AppEvent) => {
  if (payload.type !== 'recording-state') return
  latestControlState = payload.state
  controlHandler?.(payload.state)
})

const control: ControlApi = {
  onState: (cb) => {
    controlHandler = cb
    if (latestControlState) cb(latestControlState)
  },
  action: (action: ControlAction) => {
    void ipcRenderer.invoke(CH.recControl, action)
  }
}

let regionHandler: ((info: RegionInitInfo) => void) | null = null
let pendingRegionInit: RegionInitInfo | null = null

ipcRenderer.on(CH.regionInit, (_event, info: RegionInitInfo) => {
  if (regionHandler) regionHandler(info)
  else pendingRegionInit = info
})

const region: RegionApi = {
  onInit: (cb) => {
    regionHandler = cb
    if (pendingRegionInit) cb(pendingRegionInit)
  },
  finish: (rect: RegionRect) => ipcRenderer.send(CH.regionFinish, rect),
  cancel: () => ipcRenderer.send(CH.regionCancel)
}

contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('recorder', recorder)
contextBridge.exposeInMainWorld('control', control)
contextBridge.exposeInMainWorld('region', region)
contextBridge.exposeInMainWorld('__setRecorderId', (id: string) => {
  currentId = id
})

export type { AppApi, RecorderApi, ControlApi, RegionApi }
export type { AppEvent, RecordingConfig, Settings }