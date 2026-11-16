import { app, shell } from 'electron'
import { promises as fsp } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Recording } from '../shared/types'
import { emitEvent } from './events'
import { readMp4DurationMs } from './ffmpeg'
import { getSettings } from './settings'
import { readJson, writeJsonAtomic } from './util'

let items: Recording[] = []

export function libraryFile(): string {
  return join(app.getPath('userData'), 'library.json')
}

async function persist(): Promise<void> {
  await writeJsonAtomic(libraryFile(), items)
}

export async function initLibrary(): Promise<void> {
  const stored = await readJson<Recording[]>(libraryFile(), [])
  const known = Array.isArray(stored) ? stored : []

  // Drop index entries whose media is gone; scanRecordingsDir() re-adds any
  // session folder that still holds a playable part/final file.
  const alive: Recording[] = []
  for (const item of known) {
    try {
      await fsp.access(item.files.video)
      alive.push(item)
    } catch {
      // Missing file: forget the entry instead of keeping a permanent error row.
    }
  }
  items = alive

  await scanRecordingsDir()
  await persist()
}

/** Discover sessions that are not in the index (crash recovery / index loss). */
async function scanRecordingsDir(): Promise<void> {
  const root = getSettings().recordingsDir
  let entries: string[] = []
  try {
    entries = await fsp.readdir(root)
  } catch {
    return
  }

  for (const name of entries) {
    const dir = join(root, name)
    let stat
    try {
      stat = await fsp.stat(dir)
    } catch {
      continue
    }
    if (!stat.isDirectory()) continue
    if (items.some((item) => item.id === name)) continue

    const meta = await readJson<{
      id?: string
      title?: string
      createdAt?: number
      source?: Partial<Recording['source']>
      config?: Partial<Recording['source']> & { sourceKind?: Recording['source']['kind']; sourceName?: string }
    }>(join(dir, 'meta.json'), {})
    // meta.json from the recorder stores `sourceKind`/`sourceName`, older
    // fixtures used `kind`/`name`; accept both.
    const kind = meta.config?.sourceKind ?? meta.config?.kind ?? meta.source?.kind ?? 'display'
    const sourceName = meta.config?.sourceName ?? meta.config?.name ?? meta.source?.name ?? '未知来源'
    const crop = meta.config?.crop ?? meta.source?.crop ?? null
    const source: Recording['source'] = { kind, name: sourceName, crop }
    const part = join(dir, 'recording.part.mp4')
    const final = join(dir, 'recording.mp4')
    let partStat
    try {
      partStat = await fsp.stat(part)
    } catch {
      partStat = null
    }
    let finalStat
    try {
      finalStat = await fsp.stat(final)
    } catch {
      finalStat = null
    }

    if (partStat && partStat.size > 1024) {
      items.push({
        id: name,
        title: meta.title ?? name,
        createdAt: Math.round(meta.createdAt ?? stat.birthtimeMs),
        durationMs: 0,
        sizeBytes: partStat.size,
        status: 'recoverable',
        source,
        video: { width: 0, height: 0, fps: 30, codec: 'avc1' },
        audio: { system: true, mic: true },
        hasAudio: false,
        files: { video: part }
      })
    } else if (finalStat && finalStat.size > 1024) {
      items.push({
        id: name,
        title: meta.title ?? name,
        createdAt: Math.round(meta.createdAt ?? stat.birthtimeMs),
        durationMs: (await readMp4DurationMs(final)) ?? 0,
        sizeBytes: finalStat.size,
        status: 'ready',
        source,
        video: { width: 0, height: 0, fps: 30, codec: 'avc1' },
        audio: { system: true, mic: true },
        hasAudio: false,
        files: { video: final }
      })
    }
  }
}

export function listLibrary(): Recording[] {
  return [...items].sort((a, b) => b.createdAt - a.createdAt)
}

export function getRecording(id: string): Recording | undefined {
  return items.find((item) => item.id === id)
}

export async function addRecording(recording: Recording): Promise<void> {
  items = [recording, ...items.filter((item) => item.id !== recording.id)]
  await persist()
  emitEvent({ type: 'library-changed' })
}

export async function updateRecording(id: string, patch: Partial<Recording>): Promise<Recording | undefined> {
  const item = items.find((entry) => entry.id === id)
  if (!item) return undefined
  Object.assign(item, patch)
  await persist()
  emitEvent({ type: 'library-changed' })
  return item
}

export async function renameRecording(id: string, title: string): Promise<void> {
  const clean = title.trim().slice(0, 120)
  if (!clean) return
  await updateRecording(id, { title: clean })
}

export async function deleteRecording(id: string): Promise<void> {
  const item = items.find((entry) => entry.id === id)
  if (!item) return
  const dir = dirname(item.files.video)
  try {
    await shell.trashItem(dir)
  } catch {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
  items = items.filter((entry) => entry.id !== id)
  await persist()
  emitEvent({ type: 'library-changed' })
}

export async function revealRecording(id: string): Promise<void> {
  const item = items.find((entry) => entry.id === id)
  if (!item) return
  shell.showItemInFolder(item.files.video)
}