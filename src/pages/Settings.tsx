// src/pages/Settings.tsx
import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { SettingsLayout } from '@/components/settings/SettingsLayout'
import { GeneralTab } from '@/components/settings/GeneralTab'
import { AppearanceTab } from '@/components/settings/AppearanceTab'
import { AiTab } from '@/components/settings/AiTab'
import { BrowserTab } from '@/components/settings/BrowserTab'
import { ObservabilityTab } from '@/components/settings/ObservabilityTab'
import { ipc } from '@/ipc/client'

function AiTabRoute(): JSX.Element {
  const [keychainAvailable, setKeychainAvailable] = useState(true)
  useEffect(() => {
    void ipc.settings.keychainAvailable().then(setKeychainAvailable)
  }, [])
  return <AiTab keychainAvailable={keychainAvailable} />
}

export function Settings(): JSX.Element {
  return (
    <SettingsLayout>
      <Routes>
        <Route index element={<Navigate to="general" replace />} />
        <Route path="general" element={<GeneralTab />} />
        <Route path="appearance" element={<AppearanceTab />} />
        <Route path="ai" element={<AiTabRoute />} />
        <Route path="browser" element={<BrowserTab />} />
        <Route path="observability" element={<ObservabilityTab />} />
      </Routes>
    </SettingsLayout>
  )
}
