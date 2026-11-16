import { useNavigate } from 'react-router-dom'
import { useApp } from '../app-context'
import { Prepare } from '../components/Prepare'

export default function RecordPage() {
  const { settings, busy, pushToast, openFolder } = useApp()
  const navigate = useNavigate()

  if (!settings) return null

  return (
    <Prepare
      settings={settings}
      busy={busy}
      onStarted={() => {
        navigate('/library')
        pushToast('录制即将开始，主窗口会自动隐藏')
      }}
      onError={(message) => pushToast(message, 'error')}
      onOpenFolder={openFolder}
    />
  )
}