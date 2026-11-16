import { useApp } from '../app-context'
import { SettingsView } from '../components/SettingsView'

export default function SettingsPage() {
  const { appState, applySettings, pushToast } = useApp()

  if (!appState) return null

  return (
    <SettingsView
      state={appState}
      onSettings={applySettings}
      onError={(message) => pushToast(message, 'error')}
    />
  )
}