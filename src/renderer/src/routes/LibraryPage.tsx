import { useNavigate } from 'react-router-dom'
import { useApp } from '../app-context'
import { Library } from '../components/Library'

export default function LibraryPage() {
  const { items, query, setQuery, openRecording, openFolder } = useApp()
  const navigate = useNavigate()

  return (
    <Library
      items={items}
      query={query}
      onQuery={setQuery}
      onOpen={(item) => openRecording(item.id)}
      onRecord={() => navigate('/record')}
      onOpenFolder={openFolder}
    />
  )
}