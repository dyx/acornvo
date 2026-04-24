import type { JSX } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { Placeholder } from './pages/Placeholder'

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/picker" element={<Placeholder name="picker" />} />
      <Route path="/library" element={<Placeholder name="library" />} />
      <Route path="/editor/:path" element={<Placeholder name="editor" />} />
      <Route path="/browser" element={<Placeholder name="browser" />} />
      <Route path="/chat" element={<Placeholder name="chat" />} />
      <Route path="/settings" element={<Placeholder name="settings" />} />
    </Routes>
  )
}
