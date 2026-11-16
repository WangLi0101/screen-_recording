import { BrowserWindow, desktopCapturer, screen, session, type Display } from 'electron'
import type { RegionRect, RegionSelection, SourceInfo } from '../shared/types'
import { createRegionOverlay, destroyRegionOverlay, getRecorderWindow, getRegionOverlay } from './windows'

let pending: { sourceId: string; withAudio: boolean } | null = null
let regionDisplay: Display | null = null
let regionResolve: ((value: RegionSelection | null) => void) | null = null

export function setPendingCapture(sourceId: string, withAudio: boolean): void {
  pending = { sourceId, withAudio }
  setTimeout(() => {
    if (pending?.sourceId === sourceId) pending = null
  }, 60_000)
}

export function clearPendingCapture(): void {
  pending = null
}

export function initCapture(): void {
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      const active = pending
      if (!active) {
        callback(null)
        return
      }
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] })
        const source = sources.find((item) => item.id === active.sourceId)
        if (!source) {
          callback(null)
          return
        }
        callback({
          video: source,
          audio: active.withAudio ? 'loopback' : undefined
        })
      } catch {
        callback(null)
      }
    },
    { useSystemPicker: false }
  )
}

function toDataUrl(image: Electron.NativeImage | null | undefined, type: 'png' | 'jpeg' = 'png'): string | null {
  if (!image || image.isEmpty()) return null
  if (type === 'jpeg') {
    return `data:image/jpeg;base64,${image.toJPEG(72).toString('base64')}`
  }
  return image.toDataURL()
}

export async function listSources(): Promise<SourceInfo[]> {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true
  })

  const ownIds = new Set<string>()
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      ownIds.add(win.webContents.getMediaSourceId(win.webContents))
    } catch {
      // window may be destroyed
    }
  }

  const mapped: SourceInfo[] = sources
    .filter((source) => !ownIds.has(source.id))
    .map((source) => ({
      id: source.id,
      name: source.name,
      kind: source.id.startsWith('screen:') ? 'display' : 'window',
      thumbnail: toDataUrl(source.thumbnail, 'jpeg'),
      appIcon: toDataUrl(source.appIcon),
      displayId: source.display_id || null
    }))

  return mapped.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'display' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export async function selectRegion(): Promise<RegionSelection | null> {
  if (regionResolve) return null
  const cursor = screen.getCursorScreenPoint()
  regionDisplay = screen.getDisplayNearestPoint(cursor)

  return new Promise<RegionSelection | null>((resolve) => {
    regionResolve = resolve
    void createRegionOverlay(regionDisplay as Display)
  })
}

export async function finishRegion(rect: RegionRect): Promise<void> {
  const resolve = regionResolve
  regionResolve = null
  const display = regionDisplay
  regionDisplay = null
  destroyRegionOverlay()

  if (!resolve) return
  if (!display || rect.width < 8 || rect.height < 8) {
    resolve(null)
    return
  }

  const scale = display.scaleFactor || 1
  const maxWidth = Math.round(display.bounds.width * scale)
  const maxHeight = Math.round(display.bounds.height * scale)

  let x = Math.max(0, Math.round(rect.x * scale))
  let y = Math.max(0, Math.round(rect.y * scale))
  let width = Math.min(Math.round(rect.width * scale), maxWidth - x)
  let height = Math.min(Math.round(rect.height * scale), maxHeight - y)

  width -= width % 2
  height -= height % 2
  if (width < 8 || height < 8) {
    resolve(null)
    return
  }

  const sources = await desktopCapturer.getSources({ types: ['screen'] })
  const source =
    sources.find((item) => item.display_id === String(display.id)) ?? sources[0]
  if (!source) {
    resolve(null)
    return
  }

  resolve({
    sourceId: source.id,
    sourceName: display.label || source.name,
    sourceKind: 'display',
    displayId: String(display.id),
    crop: { x, y, width, height, scaleFactor: scale }
  })
}

export function cancelRegion(): void {
  const resolve = regionResolve
  regionResolve = null
  regionDisplay = null
  destroyRegionOverlay()
  resolve?.(null)
}

export function isRegionSelecting(): boolean {
  return regionResolve !== null
}

export function notifyRegionResize(): void {
  const win = getRegionOverlay()
  if (win) win.setAlwaysOnTop(true, 'screen-saver')
}

export function isRecorderAlive(): boolean {
  const win = getRecorderWindow()
  return !!win && !win.isDestroyed()
}