import { BrowserWindow, nativeTheme, screen, shell, type Display } from 'electron'
import { join } from 'node:path'
import { getAppIcon } from './icon'
import { getSettings } from './settings'

let mainWindow: BrowserWindow | null = null
let controlWindow: BrowserWindow | null = null
let recorderWindow: BrowserWindow | null = null
let regionWindow: BrowserWindow | null = null
let quitting = false

export function setQuitting(value: boolean): void {
  quitting = value
}

const preloadPath = (): string => join(__dirname, '../preload/index.js')

/** Solid window background matching the renderer theme, to avoid a flash on resize. */
function surfaceColor(): string {
  const { theme } = getSettings()
  const dark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors)
  return dark ? '#141218' : '#fef7ff'
}

export function applyWindowTheme(): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setBackgroundColor(surfaceColor())
}

/** Keep the native titlebar / form controls in sync with the in-app appearance. */
export function applyNativeTheme(): void {
  nativeTheme.themeSource = getSettings().theme
  applyWindowTheme()
}

/** Every window loads the same HTML entry; the hash selects its route. */
const PAGE_HASH: Record<string, string> = {
  // Load the default view directly: the shell only renders <Outlet /> once the
  // app state has loaded, so a bare "#/" would stay on the loading screen.
  index: '/library',
  control: '/control',
  recorder: '/recorder',
  region: '/region'
}

function loadPage(win: BrowserWindow, page: string): void {
  const hash = PAGE_HASH[page] ?? '/'
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(`${devUrl.replace(/\/$/, '')}/#${hash}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }
}

function webPreferences(extra: Record<string, unknown> = {}): Electron.WebPreferences {
  return {
    preload: preloadPath(),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    ...extra
  }
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

export function getControlWindow(): BrowserWindow | null {
  return controlWindow && !controlWindow.isDestroyed() ? controlWindow : null
}

export function getRecorderWindow(): BrowserWindow | null {
  return recorderWindow && !recorderWindow.isDestroyed() ? recorderWindow : null
}

export function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow

  mainWindow = new BrowserWindow({
    width: 1160,
    height: 760,
    minWidth: 920,
    minHeight: 600,
    show: false,
    backgroundColor: surfaceColor(),
    autoHideMenuBar: true,
    title: 'ScreenRec',
    icon: getAppIcon(),
    webPreferences: webPreferences()
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    mainWindow?.hide()
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  loadPage(mainWindow, 'index')
  return mainWindow
}

export function showMainWindow(): void {
  const win = createMainWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

export function hideMainWindow(): void {
  mainWindow?.hide()
}

export function showControlBar(): BrowserWindow {
  const existing = getControlWindow()
  if (existing) {
    existing.showInactive()
    return existing
  }

  const display = screen.getPrimaryDisplay()
  const width = 440
  const height = 72

  controlWindow = new BrowserWindow({
    width,
    height,
    x: Math.round(display.workArea.x + (display.workArea.width - width) / 2),
    y: display.workArea.y + 24,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: false,
    show: false,
    webPreferences: webPreferences()
  })

  controlWindow.setAlwaysOnTop(true, 'screen-saver')
  controlWindow.setVisibleOnAllWorkspaces(true)
  // Keep the control bar out of our own recording.
  controlWindow.setContentProtection(true)
  controlWindow.once('ready-to-show', () => controlWindow?.showInactive())
  controlWindow.on('closed', () => {
    controlWindow = null
  })

  loadPage(controlWindow, 'control')
  return controlWindow
}

export function destroyControlBar(): void {
  if (controlWindow && !controlWindow.isDestroyed()) controlWindow.destroy()
  controlWindow = null
}

export function createRecorderWindow(): BrowserWindow {
  destroyRecorderWindow()

  recorderWindow = new BrowserWindow({
    width: 480,
    height: 320,
    show: false,
    skipTaskbar: true,
    backgroundColor: '#000000',
    webPreferences: webPreferences({ backgroundThrottling: false })
  })

  recorderWindow.webContents.setBackgroundThrottling(false)
  recorderWindow.on('closed', () => {
    recorderWindow = null
  })

  loadPage(recorderWindow, 'recorder')
  return recorderWindow
}

export function destroyRecorderWindow(): void {
  if (recorderWindow && !recorderWindow.isDestroyed()) recorderWindow.destroy()
  recorderWindow = null
}

export function createRegionOverlay(display: Display): BrowserWindow {
  destroyRegionOverlay()

  regionWindow = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: webPreferences()
  })

  regionWindow.setAlwaysOnTop(true, 'screen-saver')
  regionWindow.setVisibleOnAllWorkspaces(true)
  regionWindow.once('ready-to-show', () => {
    regionWindow?.show()
    regionWindow?.focus()
  })
  regionWindow.webContents.once('did-finish-load', () => {
    regionWindow?.webContents.send('region:init', {
      width: display.bounds.width,
      height: display.bounds.height,
      scaleFactor: display.scaleFactor
    })
  })
  regionWindow.on('closed', () => {
    regionWindow = null
  })

  loadPage(regionWindow, 'region')
  return regionWindow
}

export function destroyRegionOverlay(): void {
  if (regionWindow && !regionWindow.isDestroyed()) regionWindow.destroy()
  regionWindow = null
}

export function getRegionOverlay(): BrowserWindow | null {
  return regionWindow && !regionWindow.isDestroyed() ? regionWindow : null
}