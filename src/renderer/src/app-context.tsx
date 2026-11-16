import { createContext, useContext } from 'react'
import type { AppState, Recording, RecordingState, Settings } from '@shared/types'

/** State shared by the shell layout and the views rendered inside its outlet. */
export interface AppContextValue {
  appState: AppState | null
  settings: Settings | null
  items: Recording[]
  query: string
  setQuery: (value: string) => void
  recording: RecordingState
  busy: boolean
  openRecording: (id: string) => void
  openFolder: () => void
  applySettings: (next: Settings) => void
  pushToast: (message: string, tone?: 'info' | 'error') => void
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside <AppContext.Provider>')
  return value
}