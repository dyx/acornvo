import type { JSX } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Placeholder } from './pages/Placeholder'
import { useBootstrap } from './hooks/useBootstrap'
import { Toaster } from '@/components/ui/toaster'

function BootstrapGate(): JSX.Element {
  const payload = useBootstrap()
  if (!payload) return <Placeholder name="loading" />
  return <Navigate to={payload.initialRoute} replace />
}

export function App(): JSX.Element {
  return (
    <>
      <Routes>
        <Route path="/" element={<BootstrapGate />} />
        <Route path="/picker" element={<Placeholder name="picker (plan 2 UI)" />} />
        <Route path="/library" element={<Placeholder name="library" />} />
        <Route path="/editor/:path" element={<Placeholder name="editor" />} />
        <Route path="/browser" element={<Placeholder name="browser" />} />
        <Route path="/chat" element={<Placeholder name="chat" />} />
        <Route path="/settings" element={<Placeholder name="settings" />} />
      </Routes>
      <Toaster />
    </>
  )
}
