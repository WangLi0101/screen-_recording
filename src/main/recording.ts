import { globalShortcut, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type {
  Recording,
  RecordingConfig,
  RecordingState,
  RecorderCommand,
  RecorderDoneInfo,
  RecorderReadyInfo
} from '../shared/types'
import { clearPendingCapture, listSources, setPendingCapture } from './capture'
import { emitEvent } from './events'
import { hasFfmpeg, readMp4DurationMs, remuxToFastStart } from './ffmpeg'
import { addRecording, getRecording, updateRecording } from './library'
import { getSettings, updateSettings } from './settings'
import { defaultTitle, readJson, sleep, writeJsonAtomic } from './util'
import {
  createRecorderWindow,
  destroyControlBar,
  destroyRecorderWindow,
  getRecorderWindow,
  hideMainWindow,
  showControlBar,
  showMainWindow
} from './windows'

interface Session {
  id: string
  config: RecordingConfig
  dir: string
  partPath: string
  handle: FileHandle
  title: string
  createdAt: number
  startedAt: number
  pausedAt: number | null
  pausedTotalMs: number
  bytes: number
  muted: boolean
  phase: 'countdown' | 'preparing' | 'recording' | 'paused' | 'stopping'
  video: { width: number; height: number; fps: number; codec: string }
  hasAudio: boolean
  thumbnail: string | null
  finished: boolean
  cancelled: boolean
  writeChain: Promise<void>
  tick: NodeJS.Timeout | null
  watchdog: NodeJS.Timeout | null
  durationOverrideMs: number | null
}

let session: Session | null = null

let state: RecordingState = { phase: 'idle', elapsedMs: 0, bytes: 0, muted: false }

export function getRecordingState(): RecordingState {
  return state
}

function publish(next: RecordingState): void {
  state = next
  emitEvent({ type: 'recording-state', state: next })
}

function publishIdle(): void {
  publish({ phase: 'idle', elapsedMs: 0, bytes: 0, muted: false })
}

function elapsedOf(target: Session): number {
  if (!target.startedAt) return 0
  const now = Date.now()
  const pausedNow = target.pausedAt ? now - target.pausedAt : 0
  return Math.max(0, now - target.startedAt - target.pausedTotalMs - pausedNow)
}

function publishFor(target: Session, phase: RecordingState['phase'], countdownRemainingMs?: number): void {
  publish({
    phase,
    id: target.id,
    elapsedMs: phase === 'countdown' ? 0 : elapsedOf(target),
    bytes: target.bytes,
    muted: target.muted,
    countdownRemainingMs
  })
}

function sendRecorder(command: RecorderCommand): void {
  const win = getRecorderWindow()
  if (win && !win.isDestroyed()) win.webContents.send('recorder:command', command)
}

const activeShortcuts: string[] = []

interface ShortcutBinding {
  label: string
  run: () => void
  /** Tried in order; the first free accelerator wins. */
  accelerators: string[]
}

/** Extra global shortcuts that only exist while a recording is running. */
function registerRecordingShortcuts(): void {
  unregisterRecordingShortcuts()
  const mac = process.platform === 'darwin'
  const primary = mac ? 'Command+Shift' : 'Control+Alt'
  const fallback = mac ? 'Command+Alt' : 'Control+Shift'
  const bindings: ShortcutBinding[] = [
    {
      label: '暂停/继续',
      accelerators: [`${primary}+P`, `${fallback}+P`, `${primary}+F10`],
      run: () => {
        if (state.phase === 'paused') resumeRecording()
        else pauseRecording()
      }
    },
    {
      label: '停止',
      accelerators: [`${primary}+S`, `${fallback}+S`, `${primary}+F9`],
      run: () => stopRecording()
    },
    {
      label: '静音',
      accelerators: [`${primary}+M`, `${fallback}+M`, `${primary}+F11`],
      run: () => toggleMute()
    },
    {
      label: '取消',
      accelerators: [`${primary}+X`, `${fallback}+X`, `${primary}+F12`],
      run: () => void cancelRecording()
    }
  ]

  const notes: string[] = []
  for (const binding of bindings) {
    let registered: string | null = null
    for (const accelerator of binding.accelerators) {
      try {
        if (globalShortcut.register(accelerator, binding.run)) {
          registered = accelerator
          break
        }
      } catch {
        // try the next candidate
      }
    }

    if (!registered) {
      notes.push(`${binding.label}快捷键被占用`)
      continue
    }
    activeShortcuts.push(registered)
    if (registered !== binding.accelerators[0]) {
      const from = binding.accelerators[0].replace('Control', 'Ctrl').replace('Command', '⌘')
      const to = registered.replace('Control', 'Ctrl').replace('Command', '⌘')
      notes.push(`${from} 被占用，${binding.label}改用 ${to}`)
    }
  }

  if (notes.length > 0) {
    emitEvent({ type: 'toast', message: `${notes.join('；')}，也可使用控制条`, tone: 'info' })
  }
}

function unregisterRecordingShortcuts(): void {
  for (const accelerator of activeShortcuts) {
    try {
      globalShortcut.unregister(accelerator)
    } catch {
      // ignore
    }
  }
  activeShortcuts.length = 0
}

function waitForLoad(win: BrowserWindow): Promise<void> {
  if (!win.webContents.isLoading()) return Promise.resolve()
  return new Promise<void>((resolve) => {
    win.webContents.once('did-finish-load', () => resolve())
  })
}

async function writeMeta(target: Session | { id: string; title: string; createdAt: number; config: RecordingConfig; dir: string }): Promise<void> {
  await writeJsonAtomic(join(target.dir, 'meta.json'), {
    id: target.id,
    title: target.title,
    createdAt: target.createdAt,
    config: target.config
  })
}

export async function startRecording(config: RecordingConfig): Promise<{ id: string }> {
  if (session) throw new Error('已有录制正在进行')

  const settings = getSettings()
  const id = randomUUID()
  const dir = join(settings.recordingsDir, id)
  await fsp.mkdir(dir, { recursive: true })
  const partPath = join(dir, 'recording.part.mp4')
  const handle = await fsp.open(partPath, 'w')
  const createdAt = Date.now()
  const title = defaultTitle(createdAt)

  const target: Session = {
    id,
    config,
    dir,
    partPath,
    handle,
    title,
    createdAt,
    startedAt: 0,
    pausedAt: null,
    pausedTotalMs: 0,
    bytes: 0,
    muted: false,
    phase: config.countdown > 0 ? 'countdown' : 'preparing',
    video: { width: 0, height: 0, fps: config.fps, codec: 'avc1' },
    hasAudio: false,
    thumbnail: null,
    finished: false,
    cancelled: false,
    writeChain: Promise.resolve(),
    tick: null,
    watchdog: null,
    durationOverrideMs: null
  }

  await writeMeta(target)
  session = target
  showControlBar()
  publishFor(target, config.countdown > 0 ? 'countdown' : 'preparing', config.countdown * 1000)

  void runStart(target)
  return { id }
}

async function runStart(target: Session): Promise<void> {
  try {
    for (let remaining = target.config.countdown; remaining > 0; remaining--) {
      if (session !== target || target.cancelled) return
      publishFor(target, 'countdown', remaining * 1000)
      await sleep(1000)
    }
    if (session !== target || target.cancelled) return

    target.phase = 'preparing'
    publishFor(target, 'preparing')
    // Hide before capturing so the library window never shows up in frame.
    hideMainWindow()
    setPendingCapture(target.config.sourceId, target.config.systemAudio)

    const win = createRecorderWindow()
    await waitForLoad(win)
    if (session !== target || target.cancelled) return
    win.webContents.send('recorder:start', { id: target.id, config: target.config })
  } catch (error) {
    await failSession(target, error)
  }
}

export function handleRecorderReady(id: string, info: RecorderReadyInfo): void {
  const target = session
  if (!target || target.id !== id || target.finished) return

  target.video = { width: info.width, height: info.height, fps: info.fps, codec: info.codec }
  target.hasAudio = info.hasAudio
  target.startedAt = Date.now()
  target.phase = 'recording'
  publishFor(target, 'recording')
  hideMainWindow()
  registerRecordingShortcuts()

  if (target.tick) clearInterval(target.tick)
  target.tick = setInterval(() => {
    if (session !== target) return
    publishFor(target, target.phase === 'paused' ? 'paused' : 'recording')
  }, 500)

  void updateSettings({
    lastSourceId: target.config.sourceId,
    lastSourceName: target.config.sourceName,
    lastSourceKind: target.config.sourceKind,
    lastCrop: target.config.crop ?? null
  })
}

export function handleRecorderChunk(payload: { id: string; position: number; data: ArrayBuffer }): void {
  const target = session
  if (!target || target.id !== payload.id || target.finished) return
  if (!payload.data || payload.data.byteLength === 0) return

  const view = Buffer.from(payload.data)
  const length = view.length
  const position = payload.position

  target.writeChain = target.writeChain
    .then(async () => {
      if (target.finished) return
      await target.handle.write(view, 0, length, position)
      if (position + length > target.bytes) target.bytes = position + length
    })
    .catch((error: unknown) => {
      void failSession(target, error)
    })
}

export function handleRecorderThumbnail(id: string, dataUrl: string): void {
  const target = session
  if (!target || target.id !== id) return
  target.thumbnail = dataUrl
}

export async function handleRecorderDone(id: string, info: RecorderDoneInfo): Promise<void> {
  const target = session
  if (!target || target.id !== id) return
  await finalizeSession(target, info)
}

export async function handleRecorderError(id: string, message: string): Promise<void> {
  const target = session
  if (!target || target.id !== id) return
  await failSession(target, new Error(message))
}

export function pauseRecording(): void {
  const target = session
  if (!target || target.phase !== 'recording') return
  target.phase = 'paused'
  target.pausedAt = Date.now()
  sendRecorder({ type: 'pause' })
  publishFor(target, 'paused')
}

export function resumeRecording(): void {
  const target = session
  if (!target || target.phase !== 'paused') return
  if (target.pausedAt) target.pausedTotalMs += Date.now() - target.pausedAt
  target.pausedAt = null
  target.phase = 'recording'
  sendRecorder({ type: 'resume' })
  publishFor(target, 'recording')
}

export function toggleMute(): void {
  const target = session
  if (!target) return
  target.muted = !target.muted
  sendRecorder({ type: 'mute', muted: target.muted })
  publishFor(target, target.phase === 'paused' ? 'paused' : 'recording')
}

export function stopRecording(): void {
  const target = session
  if (!target) return
  if (target.phase === 'countdown' || target.phase === 'preparing') {
    void cancelRecording()
    return
  }
  if (target.phase === 'stopping') return

  if (target.pausedAt) {
    target.pausedTotalMs += Date.now() - target.pausedAt
    target.pausedAt = null
  }
  target.durationOverrideMs = elapsedOf(target)
  target.phase = 'stopping'
  publishFor(target, 'stopping')
  sendRecorder({ type: 'stop' })

  if (target.watchdog) clearTimeout(target.watchdog)
  target.watchdog = setTimeout(() => {
    void finalizeSession(target, null)
  }, 10_000)
}

export async function cancelRecording(): Promise<void> {
  const target = session
  if (!target) return

  target.cancelled = true
  target.finished = true
  session = null
  unregisterRecordingShortcuts()
  if (target.tick) clearInterval(target.tick)
  if (target.watchdog) clearTimeout(target.watchdog)

  sendRecorder({ type: 'cancel' })
  destroyRecorderWindow()
  destroyControlBar()
  clearPendingCapture()

  try {
    await target.writeChain
  } catch {
    // ignore
  }
  await target.handle.close().catch(() => undefined)
  await fsp.rm(target.dir, { recursive: true, force: true }).catch(() => undefined)

  showMainWindow()
  publishIdle()
  emitEvent({ type: 'toast', message: '已取消录制', tone: 'info' })
}

export async function recoverRecording(id: string): Promise<Recording> {
  const recording = getRecording(id)
  if (!recording) throw new Error('素材不存在')

  const dir = dirname(recording.files.video)
  const part = join(dir, 'recording.part.mp4')
  const final = join(dir, 'recording.mp4')

  let source = part
  try {
    await fsp.access(part)
  } catch {
    source = recording.files.video
  }

  if (source !== final) {
    const ok = await remuxToFastStart(source, final)
    if (ok) {
      await fsp.rm(source, { force: true }).catch(() => undefined)
    } else {
      await fsp.rm(final, { force: true }).catch(() => undefined)
      await fsp.rename(source, final)
    }
  }

  const stat = await fsp.stat(final)
  // The crashed session never reported a duration, so recover it from the file.
  const recoveredDuration = recording.durationMs > 0 ? null : await readMp4DurationMs(final)
  const updated = await updateRecording(id, {
    status: 'ready',
    files: { ...recording.files, video: final },
    sizeBytes: stat.size,
    ...(recoveredDuration && recoveredDuration > 0 ? { durationMs: recoveredDuration } : {})
  })

  emitEvent({ type: 'toast', message: '录制已恢复', tone: 'info' })
  return updated ?? recording
}

async function failSession(target: Session, error: unknown): Promise<void> {
  if (target.finished) return
  const message = error instanceof Error ? error.message : String(error)
  emitEvent({ type: 'recording-error', message })
  await finalizeSession(target, null, message)
}

async function finalizeSession(target: Session, info: RecorderDoneInfo | null, errorMessage?: string): Promise<void> {
  if (target.finished) return
  target.finished = true
  unregisterRecordingShortcuts()
  if (target.tick) clearInterval(target.tick)
  if (target.watchdog) clearTimeout(target.watchdog)
  if (session === target) session = null

  try {
    await target.writeChain
  } catch {
    // ignore
  }
  await target.handle.close().catch(() => undefined)
  clearPendingCapture()
  destroyRecorderWindow()
  destroyControlBar()

  const ext = info?.container === 'webm' ? 'webm' : 'mp4'
  const finalPath = join(target.dir, `recording.${ext}`)
  let status: Recording['status'] = 'ready'
  let sizeBytes = 0
  let filePath = finalPath

  try {
    const stat = await fsp.stat(target.partPath)
    if (stat.size < 2048) throw new Error('没有采集到有效画面')

    if (ext === 'mp4' && hasFfmpeg()) {
      const ok = await remuxToFastStart(target.partPath, finalPath)
      if (ok) {
        await fsp.rm(target.partPath, { force: true }).catch(() => undefined)
      } else {
        await fsp.rename(target.partPath, finalPath)
      }
    } else {
      await fsp.rename(target.partPath, finalPath)
    }
    sizeBytes = (await fsp.stat(finalPath)).size
  } catch (error) {
    status = 'recoverable'
    filePath = target.partPath
    errorMessage = errorMessage ?? (error instanceof Error ? error.message : String(error))
    await fsp.stat(target.partPath).then((stat) => (sizeBytes = stat.size)).catch(() => undefined)
  }

  let thumbnailPath: string | undefined
  const thumb = info?.thumbnail ?? target.thumbnail
  if (thumb && thumb.startsWith('data:image')) {
    try {
      thumbnailPath = join(target.dir, 'thumbnail.jpg')
      await fsp.writeFile(thumbnailPath, Buffer.from(thumb.slice(thumb.indexOf(',') + 1), 'base64'))
    } catch {
      thumbnailPath = undefined
    }
  }

  const durationMs =
    info?.durationMs ?? target.durationOverrideMs ?? elapsedOf(target)

  const recording: Recording = {
    id: target.id,
    title: target.title,
    createdAt: target.createdAt,
    durationMs: Math.max(0, Math.round(durationMs)),
    sizeBytes,
    status,
    source: {
      kind: target.config.sourceKind,
      name: target.config.sourceName,
      crop: target.config.crop ?? null
    },
    video: {
      width: info?.width ?? target.video.width,
      height: info?.height ?? target.video.height,
      fps: info?.fps ?? target.video.fps,
      codec: info?.codec ?? target.video.codec
    },
    audio: { system: target.config.systemAudio, mic: target.config.microphone },
    hasAudio: info?.hasAudio ?? target.hasAudio,
    files: { video: filePath, thumbnail: thumbnailPath },
    error: status === 'recoverable' ? errorMessage : undefined
  }

  await addRecording(recording)

  showMainWindow()
  publishIdle()
  emitEvent({ type: 'recording-done', recording })

  if (status !== 'ready') {
    emitEvent({
      type: 'toast',
      message: '录制未正常结束，已保留文件并标记为可恢复',
      tone: 'error'
    })
  }
}

export async function quickStart(): Promise<void> {
  if (session) {
    stopRecording()
    return
  }

  const settings = getSettings()
  if (!settings.lastSourceId) {
    showMainWindow()
    emitEvent({ type: 'open-prepare' })
    return
  }

  const sources = await listSources()
  const source = sources.find((item) => item.id === settings.lastSourceId)
  if (!source) {
    showMainWindow()
    emitEvent({ type: 'open-prepare' })
    return
  }

  await startRecording({
    sourceId: source.id,
    sourceName: source.name,
    sourceKind: source.kind,
    crop: settings.lastCrop,
    fps: settings.fps,
    bitrate: settings.bitrate,
    systemAudio: settings.systemAudio,
    microphone: settings.microphone,
    micDeviceId: settings.micDeviceId,
    systemVolume: settings.systemVolume,
    micVolume: settings.micVolume,
    countdown: settings.countdown
  })
}

export function isRecording(): boolean {
  return session !== null
}

export function flushOnQuit(): void {
  const target = session
  if (!target) return
  target.finished = true
  if (target.tick) clearInterval(target.tick)
  if (target.watchdog) clearTimeout(target.watchdog)
  void target.handle.close().catch(() => undefined)
}

export async function readRecoveryMeta(dir: string): Promise<{ title?: string }> {
  return readJson<{ title?: string }>(join(dir, 'meta.json'), {})
}