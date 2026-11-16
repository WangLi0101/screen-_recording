import { app } from 'electron'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import type { Settings } from '../shared/types'
import { readJson, writeJsonAtomic } from './util'

let current: Settings | null = null

export function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function defaultSettings(): Settings {
  return {
    recordingsDir: join(app.getPath('videos'), 'ScreenRec'),
    fps: 30,
    bitrate: 8_000_000,
    systemAudio: true,
    microphone: true,
    micDeviceId: null,
    systemVolume: 100,
    micVolume: 100,
    countdown: 3,
    lastSourceId: null,
    lastSourceName: null,
    lastSourceKind: null,
    lastCrop: null,
    theme: 'dark',
    accent: '#ef4444',
    language: 'zh-CN'
  }
}

const THEMES: Settings['theme'][] = ['dark', 'light', 'system']

/** Keep values coming from settings.json or IPC within the supported range. */
function normalize(next: Settings): Settings {
  if (!next.recordingsDir) next.recordingsDir = defaultSettings().recordingsDir
  if (!THEMES.includes(next.theme)) next.theme = 'dark'
  if (!/^#[0-9a-fA-F]{6}$/.test(next.accent ?? '')) next.accent = defaultSettings().accent
  return next
}

export async function loadSettings(): Promise<Settings> {
  const stored = await readJson<Partial<Settings>>(settingsFile(), {})
  current = normalize({ ...defaultSettings(), ...stored })
  await fsp.mkdir(current.recordingsDir, { recursive: true }).catch(() => undefined)
  return current
}

export function getSettings(): Settings {
  if (!current) current = defaultSettings()
  return current
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  current = normalize({ ...getSettings(), ...patch })
  await fsp.mkdir(current.recordingsDir, { recursive: true }).catch(() => undefined)
  await writeJsonAtomic(settingsFile(), current)
  return current
}