// src/pages/Settings.tsx
import type { JSX } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { SettingsLayout } from '@/components/settings/SettingsLayout'
import { GeneralTab } from '@/components/settings/GeneralTab'
import { AppearanceTab } from '@/components/settings/AppearanceTab'

function AiTabStub(): JSX.Element {
  return <div data-testid="settings-tab-ai">AI tab (Plan 3)</div>
}
function BrowserTabStub(): JSX.Element {
  return <div data-testid="settings-tab-browser">Browser tab (Plan 3)</div>
}

export function Settings(): JSX.Element {
  return (
    <SettingsLayout>
      <Routes>
        <Route index element={<Navigate to="general" replace />} />
        <Route path="general" element={<GeneralTab />} />
        <Route path="appearance" element={<AppearanceTab />} />
        <Route path="ai" element={<AiTabStub />} />
        <Route path="browser" element={<BrowserTabStub />} />
      </Routes>
    </SettingsLayout>
  )
}
