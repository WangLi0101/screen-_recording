import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom'
import { applyStoredAppearance } from './lib/theme'
import './tailwind.css'

/**
 * Every BrowserWindow loads the same index.html and picks its page through the
 * hash. Main-window views share the shell layout; the auxiliary windows
 * (control / region / recorder) are top-level routes so they never render the
 * sidebar, the dialogs or the main app state subscriptions.
 */
const Shell = lazy(() => import('./App'))
const LibraryPage = lazy(() => import('./routes/LibraryPage'))
const RecordPage = lazy(() => import('./routes/RecordPage'))
const SettingsPage = lazy(() => import('./routes/SettingsPage'))
const ControlPage = lazy(() => import('./routes/ControlPage'))
const RegionPage = lazy(() => import('./routes/RegionPage'))
const RecorderPage = lazy(() => import('./routes/RecorderPage'))

const router = createHashRouter([
  {
    path: '/',
    element: (
      <StrictMode>
        <Shell />
      </StrictMode>
    ),
    children: [
      { index: true, element: <Navigate to="/library" replace /> },
      { path: 'library', element: <LibraryPage /> },
      // Detail is the library with the recording dialog open.
      { path: 'library/:id', element: <LibraryPage /> },
      { path: 'record', element: <RecordPage /> },
      { path: 'settings', element: <SettingsPage /> }
    ]
  },
  { path: '/control', element: <ControlPage /> },
  { path: '/region', element: <RegionPage /> },
  { path: '/recorder', element: <RecorderPage /> }
])

applyStoredAppearance()

const container = document.getElementById('root')
if (!container) throw new Error('root container missing')

createRoot(container).render(
  <Suspense fallback={null}>
    <RouterProvider router={router} />
  </Suspense>
)