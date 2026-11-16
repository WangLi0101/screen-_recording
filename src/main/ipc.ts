import { app, dialog, ipcMain, shell } from 'electron'
import { CH } from '../shared/api'
import type {
  ControlAction,
  ExportRequest,
  RecorderDoneInfo,
  RecorderReadyInfo,
  RecordingConfig,
  RegionRect,
  Settings
} from '../shared/types'
import { cancelRegion, finishRegion, listSources, selectRegion } from './capture'
import { bus } from './events'
import { cancelExportJob, hasFfmpeg } from './ffmpeg'
import { exportRecording, trimRecording } from './exporter'
import {
  deleteRecording,
  listLibrary,
  renameRecording,
  revealRecording
} from './library'
import { getPermissions, openSystemSettings } from './permissions'
import {
  cancelRecording,
  getRecordingState,
  handleRecorderChunk,
  handleRecorderDone,
  handleRecorderError,
  handleRecorderReady,
  handleRecorderThumbnail,
  pauseRecording,
  recoverRecording,
  resumeRecording,
  startRecording,
  stopRecording,
  toggleMute
} from './recording'
import { getSettings, updateSettings } from './settings'
import { applyNativeTheme, getControlWindow, getMainWindow } from './windows'

let registered = false

export function registerIpc(): void {
  if (registered) return
  registered = true

  ipcMain.handle(CH.appState, () => ({
    version: app.getVersion(),
    platform: process.platform,
    settings: getSettings(),
    permissions: getPermissions(),
    ffmpeg: hasFfmpeg()
  }))

  ipcMain.handle(CH.recState, () => getRecordingState())

  ipcMain.handle(CH.sourcesList, () => listSources())
  ipcMain.handle(CH.sourcesRegion, () => selectRegion())
  ipcMain.on(CH.regionFinish, (_event, rect: RegionRect) => {
    void finishRegion(rect)
  })
  ipcMain.on(CH.regionCancel, () => cancelRegion())

  ipcMain.handle(CH.recStart, async (_event, config: RecordingConfig) => {
    if (!config || !config.sourceId) throw new Error('请选择录制来源')
    return startRecording(config)
  })
  ipcMain.handle(CH.recPause, () => pauseRecording())
  ipcMain.handle(CH.recResume, () => resumeRecording())
  ipcMain.handle(CH.recStop, () => stopRecording())
  ipcMain.handle(CH.recCancel, () => cancelRecording())
  ipcMain.handle(CH.recMute, () => toggleMute())
  ipcMain.handle(CH.recControl, (_event, action: ControlAction) => {
    switch (action) {
      case 'pause':
        pauseRecording()
        break
      case 'resume':
        resumeRecording()
        break
      case 'stop':
        stopRecording()
        break
      case 'cancel':
        void cancelRecording()
        break
      case 'mute':
        toggleMute()
        break
    }
  })

  ipcMain.on(CH.recReady, (_event, payload: { id: string; info: RecorderReadyInfo }) => {
    handleRecorderReady(payload.id, payload.info)
  })
  ipcMain.on(CH.recChunk, (_event, payload: { id: string; position: number; data: ArrayBuffer }) => {
    handleRecorderChunk(payload)
  })
  ipcMain.on(CH.recThumb, (_event, payload: { id: string; dataUrl: string }) => {
    handleRecorderThumbnail(payload.id, payload.dataUrl)
  })
  ipcMain.on(CH.recDone, (_event, payload: { id: string; info: RecorderDoneInfo }) => {
    void handleRecorderDone(payload.id, payload.info)
  })
  ipcMain.on(CH.recError, (_event, payload: { id: string; message: string }) => {
    void handleRecorderError(payload.id, payload.message)
  })
  ipcMain.on(CH.recEnded, () => stopRecording())

  ipcMain.handle(CH.libList, () => listLibrary())
  ipcMain.handle(CH.libRename, (_event, id: string, title: string) => renameRecording(id, title))
  ipcMain.handle(CH.libDelete, (_event, id: string) => deleteRecording(id))
  ipcMain.handle(CH.libReveal, (_event, id: string) => revealRecording(id))
  ipcMain.handle(CH.libRecover, (_event, id: string) => recoverRecording(id))
  ipcMain.handle(CH.libTrim, (_event, id: string, startMs: number, endMs: number) =>
    trimRecording(id, startMs, endMs)
  )

  ipcMain.handle(CH.exportStart, (_event, request: ExportRequest) => exportRecording(request))
  ipcMain.handle(CH.exportCancel, (_event, id: string) => cancelExportJob(id))

  ipcMain.handle(CH.dialogDir, async () => {
    const window = getMainWindow()
    const result = window
      ? await dialog.showOpenDialog(window, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0] ?? null
  })

  ipcMain.handle(CH.settingsUpdate, async (_event, patch: Partial<Settings>) => {
    const next = await updateSettings(patch)
    applyNativeTheme()
    return next
  })

  ipcMain.handle(CH.permsGet, () => getPermissions())
  ipcMain.handle(CH.permsOpen, (_event, kind: 'screen' | 'microphone' | 'systemAudio' | 'accessibility') =>
    openSystemSettings(kind)
  )

  ipcMain.handle(CH.shellOpen, async (_event, target: string) => {
    await shell.openPath(target)
  })

  bus.on('app-event', (event) => {
    for (const win of [getMainWindow(), getControlWindow()]) {
      if (win && !win.isDestroyed()) win.webContents.send(CH.appEvent, event)
    }
  })
}