// src/pages/Settings.tsx
import type { JSX } from 'react'

import { Routes, Route, Navigate } from 'react-router-dom'
import { SettingsLayout } from '@/components/settings/SettingsLayout'
import { GeneralTab } from '@/components/settings/GeneralTab'
import { AiTab } from '@/components/settings/AiTab'
import { BrowserTab } from '@/components/settings/BrowserTab'
import { LibraryTab } from '@/components/settings/LibraryTab'
import { ChatTab } from '@/components/settings/ChatTab'
import { ObservabilityTab } from '@/components/settings/ObservabilityTab'
import { AboutTab } from '@/components/settings/AboutTab'


function AiTabRoute(): JSX.Element {
  return <AiTab />
}

export function Settings(): JSX.Element {
  return (
    <SettingsLayout>
      <Routes>
        <Route index element={<Navigate to="general" replace />} />
        <Route path="general" element={<GeneralTab />} />
        <Route path="ai" element={<AiTabRoute />} />
        <Route path="browser" element={<BrowserTab />} />
        <Route path="library" element={<LibraryTab />} />
        <Route path="chat" element={<ChatTab />} />
        <Route path="observability" element={<ObservabilityTab />} />
        <Route path="about" element={<AboutTab />} />
      </Routes>
    </SettingsLayout>
  )
}
