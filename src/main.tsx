import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useSettingsStore } from '@/stores/settings'
import { installSettingsEffects } from '@/stores/settings-effects'
import { installGroveSubscriber } from '@/stores/grove'
import { installSettingsSubscriber } from '@/stores/settings'
import { installChatStreamSubscriber } from '@/stores/chat'
import { installLibrarySubscriber } from '@/stores/library'
import { installEditorSubscriber } from '@/stores/editor'
import { setBrowserPort, setBrowserEventPort } from '@/stores/browser'
import { browserPort, browserEventPort } from '@/ipc/browser-port'
import { ipc } from '@/ipc/client'
import { useGroveStore } from '@/stores/grove'
import { Placeholder } from './pages/Placeholder'
import { Library } from './pages/Library'
import { ProjectPicker } from './pages/ProjectPicker'
import { Settings } from './pages/Settings'
import { Chat } from './pages/Chat'
import { useBootstrap } from './hooks/useBootstrap'
import { Navigate } from 'react-router-dom'
import type { JSX } from 'react'
import Search from '@/pages/Search'
import { Browse } from '@/pages/Browse'
import './i18n'

import '@fontsource/lora/400.css'
import '@fontsource/lora/700.css'
import '@fontsource/noto-serif-sc/400.css'
import '@fontsource/noto-serif-sc/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/noto-sans-sc/400.css'
import '@fontsource/noto-sans-sc/500.css'
import '@fontsource/noto-sans-sc/700.css'
import '@fontsource/nunito/400.css'
import '@fontsource/nunito/600.css'
import 'lxgw-wenkai-webfont/style.css'
import './index.css'
import fontsConfig from '@/config/fonts.json'

function applyFontsConfig() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.setProperty('--font-editor-text', fontsConfig.editor.text.join(', '))
  root.style.setProperty('--font-editor-code', fontsConfig.editor.code.join(', '))
  root.style.setProperty('--font-chat-text', fontsConfig.chat.text.join(', '))
  root.style.setProperty('--font-ui-text', fontsConfig.ui.text.join(', '))
  root.style.setProperty('--font-review-text', fontsConfig.review.text.join(', '))
}
applyFontsConfig()

function BootstrapGate(): JSX.Element | null {
  const payload = useBootstrap()
  const general = useSettingsStore((s) => s.general)
  if (!payload) return null

  let initial = payload.initialRoute
  if (initial === '/library') {
    initial = general.defaultMenu || '/browser'
  }

  return <Navigate to={initial} replace />
}

const router = createMemoryRouter([
  {
    element: <App />,
    children: [
      { index: true, element: <BootstrapGate /> },
      { path: 'picker', element: <ProjectPicker /> },
      { path: 'library', element: <Library /> },
      { path: 'browser', element: <Browse /> },
      { path: 'chat', element: <Chat /> },
      { path: 'settings/*', element: <Settings /> },
      { path: 'search', element: <Search /> }
    ]
  }
])

const container = document.getElementById('root')
if (!container) {
  throw new Error('root element not found in src/index.html')
}

void (async () => {
  try {
    await useSettingsStore.getState().loadAll()
  } catch (err) {
    console.error('Failed to load settings on boot:', err)
  }

  installSettingsEffects()
  installGroveSubscriber()

  try {
    const currentGrove = await ipc.project.getCurrent()
    if (currentGrove) {
      useGroveStore.getState()._setCurrent(currentGrove)
    }
  } catch (err) {
    console.error('Failed to load current grove on boot:', err)
  }

  installSettingsSubscriber()
  installChatStreamSubscriber()
  installLibrarySubscriber()
  installEditorSubscriber()
  setBrowserPort(browserPort)
  setBrowserEventPort(browserEventPort)

  createRoot(container).render(
    <StrictMode>
      <ErrorBoundary>
        <RouterProvider router={router} />
      </ErrorBoundary>
    </StrictMode>
  )
})()
