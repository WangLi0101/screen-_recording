import { app, globalShortcut, Menu, nativeTheme, Tray } from 'electron'
import { initCapture } from './capture'
import { getAppIcon } from './icon'
import { registerIpc } from './ipc'
import { initLibrary } from './library'
import { registerMediaProtocol, registerMediaScheme } from './mediaProtocol'
import { flushOnQuit, quickStart } from './recording'
import { loadSettings, getSettings } from './settings'
import {
  applyNativeTheme,
  applyWindowTheme,
  createMainWindow,
  setQuitting,
  showMainWindow,
  getMainWindow
} from './windows'

registerMediaScheme()

// The hidden recorder window has no user gesture; allow WebAudio to start.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

let tray: Tray | null = null

function shortcutAccelerator(): string {
  return process.platform === 'darwin' ? 'Command+Shift+R' : 'Control+Alt+R'
}

function registerShortcuts(): void {
  globalShortcut.unregisterAll()
  const accelerator = shortcutAccelerator()
  const ok = globalShortcut.register(accelerator, () => {
    void quickStart()
  })
  if (!ok) {
    console.warn(`[screenrec] failed to register global shortcut: ${accelerator}`)
  }
}

function createTray(): void {
  if (tray) return
  tray = new Tray(getAppIcon().resize({ width: 16, height: 16 }))
  tray.setToolTip('ScreenRec')
  const menu = Menu.buildFromTemplate([
    {
      label: '开始 / 停止录制',
      accelerator: shortcutAccelerator(),
      click: () => {
        void quickStart()
      }
    },
    {
      label: '打开素材库',
      click: () => showMainWindow()
    },
    { type: 'separator' },
    {
      label: '打开录制文件夹',
      click: () => {
        void import('electron').then(({ shell }) => shell.openPath(getSettings().recordingsDir))
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        setQuitting(true)
        app.quit()
      }
    }
  ])
  tray.setContextMenu(menu)
  tray.on('click', () => showMainWindow())
}

async function bootstrap(): Promise<void> {
  app.setAppUserModelId('com.screenrec.desktop')
  await loadSettings()
  applyNativeTheme()
  await initLibrary()
  initCapture()
  registerMediaProtocol()
  registerIpc()
  createMainWindow()
  createTray()
  registerShortcuts()
  nativeTheme.on('updated', applyWindowTheme)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })

  app.whenReady().then(() => {
    void bootstrap().catch((error) => {
      console.error('[screenrec] bootstrap failed', error)
    })
  })

  app.on('activate', () => {
    showMainWindow()
  })

  app.on('window-all-closed', () => {
    // Keep running in the tray.
  })

  app.on('before-quit', () => {
    setQuitting(true)
    flushOnQuit()
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })

  process.on('uncaughtException', (error) => {
    console.error('[screenrec] uncaught exception', error)
  })

  // Ensure the main window exists on first launch even if the renderer fails.
  app.on('browser-window-created', (_event, window) => {
    if (!getMainWindow()) return
    window.on('unresponsive', () => {
      console.warn('[screenrec] window unresponsive')
    })
  })
}