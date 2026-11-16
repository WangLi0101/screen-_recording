import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom'
import type {
  AppEvent,
  AppState,
  ExportProgress,
  Recording,
  RecordingState,
  Settings
} from '@shared/types'
import { cn } from '@renderer/lib/utils'
import { AppContext, type AppContextValue } from './app-context'
import { ExportDialog } from './components/ExportDialog'
import { Icon, type IconName } from './components/Icon'
import { RecordingDialog } from './components/RecordingDialog'
import { Button } from './components/ui/button'
import { formatClock } from './lib/format'
import { applyAppearance } from './lib/theme'

interface Toast {
  id: number
  message: string
  tone: 'info' | 'error'
}

const IDLE: RecordingState = { phase: 'idle', elapsedMs: 0, bytes: 0, muted: false }

const NAV: Array<{ id: string; path: string; label: string; icon: IconName }> = [
  { id: 'library', path: '/library', label: '素材库', icon: 'library' },
  { id: 'record', path: '/record', label: '新建录制', icon: 'record' },
  { id: 'settings', path: '/settings', label: '设置', icon: 'settings' }
]

function phaseLabel(state: RecordingState): string {
  switch (state.phase) {
    case 'countdown':
      return `倒计时 ${Math.max(1, Math.ceil((state.countdownRemainingMs ?? 0) / 1000))} 秒`
    case 'preparing':
      return '正在连接画面'
    case 'recording':
      return '正在录制'
    case 'paused':
      return '已暂停'
    case 'stopping':
      return '正在保存'
    default:
      return '准备中'
  }
}

/**
 * Main-window shell: sidebar, global recording banner and dialogs.
 * The three top-level views are rendered through <Outlet />.
 */
export default function App() {
  const [appState, setAppState] = useState<AppState | null>(null)
  const [items, setItems] = useState<Recording[]>([])
  const [query, setQuery] = useState('')
  const [exportId, setExportId] = useState<string | null>(null)
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null)
  const [recording, setRecording] = useState<RecordingState>(IDLE)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)

  const navigate = useNavigate()
  const { pathname } = useLocation()
  const detail = useMatch('/library/:id')

  const pushToast = useCallback((message: string, tone: 'info' | 'error' = 'info') => {
    const id = ++toastId.current
    setToasts((previous) => [...previous.slice(-3), { id, message, tone }])
    window.setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== id))
    }, 3800)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [state, list] = await Promise.all([window.api.getState(), window.api.listLibrary()])
      setAppState(state)
      setItems(list)
    } catch (error) {
      pushToast(error instanceof Error ? error.message : String(error), 'error')
    }
  }, [pushToast])

  useEffect(() => {
    void refresh()
    void window.api
      .getRecordingState()
      .then(setRecording)
      .catch(() => undefined)

    return window.api.onEvent((event: AppEvent) => {
      switch (event.type) {
        case 'recording-state':
          setRecording(event.state)
          break
        case 'recording-done':
          setRecording(IDLE)
          // Wait for the library refresh so /library/:id can resolve the new item.
          void refresh().then(() => navigate(`/library/${event.recording.id}`))
          break
        case 'recording-error':
          setRecording(IDLE)
          pushToast(event.message, 'error')
          break
        case 'library-changed':
          void refresh()
          break
        case 'export-progress':
          setExportProgress(event.progress)
          break
        case 'open-prepare':
          navigate('/record')
          break
        case 'toast':
          pushToast(event.message, event.tone ?? 'info')
          break
      }
    })
  }, [refresh, pushToast, navigate])

  // Esc during the countdown aborts the recording before any frame is captured.
  useEffect(() => {
    if (recording.phase !== 'countdown') return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      void window.api.cancelRecording().catch(() => undefined)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [recording.phase])

  const settings = appState?.settings ?? null

  useEffect(() => {
    if (!settings) return
    return applyAppearance(settings.theme, settings.accent)
  }, [settings?.theme, settings?.accent])

  // A deep link (or a deleted recording) should not leave a dead detail route.
  useEffect(() => {
    if (!appState || !detail) return
    if (!items.some((item) => item.id === detail.params.id)) {
      navigate('/library', { replace: true })
    }
  }, [appState, detail, items, navigate])

  const openFolder = (): void => {
    if (settings) void window.api.openPath(settings.recordingsDir)
  }

  const applySettings = (next: Settings): void => {
    setAppState((previous) => (previous ? { ...previous, settings: next } : previous))
  }

  const openRecording = useCallback(
    (id: string) => {
      navigate(`/library/${id}`)
    },
    [navigate]
  )

  const selected = detail ? (items.find((item) => item.id === detail.params.id) ?? null) : null
  const exporting = items.find((item) => item.id === exportId) ?? null
  const busy = recording.phase !== 'idle'

  const context: AppContextValue = {
    appState,
    settings,
    items,
    query,
    setQuery,
    recording,
    busy,
    openRecording,
    openFolder,
    applySettings,
    pushToast
  }

  return (
    <AppContext.Provider value={context}>
      <div className="grid h-full grid-cols-[240px_1fr] bg-surface max-[980px]:grid-cols-[208px_1fr]">
        <aside className="flex min-h-0 flex-col gap-5 bg-surface-container-low px-3 py-4">
          <div className="flex items-center gap-3 px-3 pb-4 pt-2">
            <span className="relative size-9 shrink-0 rounded-m3-md bg-primary after:absolute after:inset-[11px] after:rounded-full after:bg-on-primary" />
            <div className="min-w-0">
              <div className="truncate text-base leading-tight font-semibold tracking-[-0.1px]">
                ScreenRec
              </div>
              <div className="truncate text-[12.5px] text-on-surface-variant">本机屏幕录制</div>
            </div>
          </div>

          <nav className="flex flex-col gap-1">
            {NAV.map((item) => {
              const active =
                item.id === 'library' ? pathname.startsWith('/library') : pathname === item.path
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className={cn(
                    'flex min-h-12 w-full items-center gap-3 rounded-full px-4 text-left text-sm font-medium tracking-[0.1px] outline-none transition-colors duration-200 ease-[var(--ease)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                    active
                      ? 'bg-primary-container text-on-primary-container'
                      : 'text-on-surface-variant hover:bg-state-hover hover:text-on-surface active:bg-state-press'
                  )}
                >
                  <Icon name={item.icon} size={20} />
                  {item.label}
                  {item.id === 'library' && items.length > 0 && (
                    <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-on-primary">
                      {items.length}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          <div className="mt-auto flex flex-col gap-2 border-t border-outline-variant/55 px-4 pb-2 pt-4 text-xs text-on-surface-variant">
            <div className="flex items-center gap-2">
              快捷键
              <kbd className="inline-flex items-center rounded-m3-xs bg-surface-container-high px-2 py-0.5 font-mono text-[11px] font-medium text-on-surface">
                {appState?.platform === 'darwin' ? '⌘ ⇧ R' : 'Ctrl Alt R'}
              </kbd>
            </div>
            <div className="truncate">
              v{appState?.version ?? '0.1.0'} · 本地优先 · 无遥测
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-col overflow-hidden bg-surface">
          {busy && (
            <div className="px-6 pt-3.5">
              <div className="flex items-center gap-3 rounded-m3-md bg-primary-container px-4 py-3 text-[13px] font-medium text-on-primary-container">
                <span className="size-2.5 shrink-0 animate-pulse-ring rounded-full bg-primary" />
                <span>
                  {phaseLabel(recording)} · {formatClock(recording.elapsedMs)}
                  {recording.muted ? ' · 已静音' : ''}
                </span>
                <div className="flex-1" />
                <Button variant="danger" size="sm" onClick={() => void window.api.stopRecording()}>
                  <Icon name="stop" size={14} />
                  停止并保存
                </Button>
              </div>
            </div>
          )}

          {!appState || !settings ? (
            <div className="flex flex-1 items-center justify-center text-[13px] text-on-surface-variant">
              正在载入 ScreenRec…
            </div>
          ) : (
            <Outlet />
          )}
        </main>

        {selected && (
          <RecordingDialog
            recording={selected}
            onClose={() => navigate('/library')}
            onExport={() => setExportId(selected.id)}
            onChanged={() => void refresh()}
            onError={(message) => pushToast(message, 'error')}
          />
        )}

        {exporting && (
          <ExportDialog
            recording={exporting}
            progress={exportProgress}
            onClose={() => setExportId(null)}
            onError={(message) => pushToast(message, 'error')}
          />
        )}

        <div className="pointer-events-none fixed right-6 bottom-6 z-[60] flex flex-col items-end gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={cn(
                'min-w-[280px] max-w-[420px] animate-toast-in rounded-m3-sm px-4 py-3.5 text-[13px] shadow-elevation-3',
                toast.tone === 'error'
                  ? 'bg-error-container text-on-error-container'
                  : 'bg-inverse-surface text-inverse-on-surface'
              )}
            >
              {toast.message}
            </div>
          ))}
        </div>
      </div>
    </AppContext.Provider>
  )
}