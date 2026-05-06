import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { installSettingsEffects } from '@/stores/settings-effects'
import { installGroveSubscriber } from '@/stores/grove'
import { installSettingsSubscriber } from '@/stores/settings'
import { installChatStreamSubscriber } from '@/stores/chat'
import { setBrowserPort, setBrowserEventPort } from '@/stores/browser'
import { browserPort, browserEventPort } from '@/ipc/browser-port'
import { Placeholder } from './pages/Placeholder'
import { Library } from './pages/Library'
import { ProjectPicker } from './pages/ProjectPicker'
import { Editor } from './pages/Editor'
import { Settings } from './pages/Settings'
import { useBootstrap } from './hooks/useBootstrap'
import { Navigate } from 'react-router-dom'
import type { JSX } from 'react'
import Search from '@/pages/Search'
import History from '@/pages/History'
import { Browse } from '@/pages/Browse'
import './i18n'
import './index.css'

function BootstrapGate(): JSX.Element {
  const payload = useBootstrap()
  if (!payload) return <Placeholder name="loading" />
  return <Navigate to={payload.initialRoute} replace />
}

const router = createMemoryRouter([
  {
    element: <App />,
    children: [
      { index: true, element: <BootstrapGate /> },
      { path: 'picker', element: <ProjectPicker /> },
      { path: 'library', element: <Library /> },
      { path: 'editor/:encodedPath', element: <Editor /> },
      { path: 'browser', element: <Browse /> },
      { path: 'chat', element: <Placeholder name="chat" /> },
      { path: 'settings/*', element: <Settings /> },
      { path: 'history', element: <Navigate to="/history/trash" replace /> },
      { path: 'history/:tab', element: <History /> },
      { path: 'search', element: <Search /> }
    ]
  }
])

const container = document.getElementById('root')
if (!container) {
  throw new Error('root element not found in src/index.html')
}

installSettingsEffects()
installGroveSubscriber()
installSettingsSubscriber()
installChatStreamSubscriber()
setBrowserPort(browserPort)
setBrowserEventPort(browserEventPort)

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </StrictMode>
)
