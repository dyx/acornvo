import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './i18n'
import './index.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('root element not found in src/index.html')
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </ErrorBoundary>
  </StrictMode>
)
