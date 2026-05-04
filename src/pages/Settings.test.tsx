// @vitest-environment jsdom
// src/pages/Settings.test.tsx
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

import { i18n } from '@/i18n'

vi.mock('@/ipc/client', () => ({
  ipc: {
    settings: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue({ ok: true }),
      aiProfilesList: vi.fn().mockResolvedValue([]),
      browserClearCookies: vi.fn().mockResolvedValue({ ok: true })
    },
    on: vi.fn(() => () => {})
  }
}))

import { Settings } from './Settings'

describe('Settings page', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  afterEach(() => cleanup())

  it('renders the four-tab rail at /settings/general', () => {
    render(
      <MemoryRouter initialEntries={['/settings/general']}>
        <Routes>
          <Route path="/settings/*" element={<Settings />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByRole('navigation', { name: /settings/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /通用|general/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /外观|appearance/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /ai/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /浏览器|browser/i })).toBeTruthy()
  })

  it('redirects /settings to /settings/general', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings/*" element={<Settings />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByTestId('settings-tab-general')).toBeTruthy()
  })
})
