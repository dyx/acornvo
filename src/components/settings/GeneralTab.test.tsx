// @vitest-environment jsdom
// src/components/settings/GeneralTab.test.tsx
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

import { i18n } from '@/i18n'

vi.mock('@/ipc/client', () => ({
  ipc: {
    settings: { get: vi.fn(), set: vi.fn().mockResolvedValue({ ok: true }) },
    on: vi.fn(() => () => {})
  }
}))

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.mock('@/stores/grove', () => ({
  useGroveStore: Object.assign(
    (selector: (s: unknown) => unknown) => selector({ current: { path: '/tmp/my-grove' } }),
    { getState: () => ({ current: { path: '/tmp/my-grove' } }) }
  )
}))

import { useSettingsStore } from '@/stores/settings'
import { GeneralTab } from './GeneralTab'

describe('GeneralTab', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState(), true)
  })
  afterEach(() => cleanup())

  it('renders settings fields', () => {
    useSettingsStore.setState({ general: { locale: 'zh-CN', autoBackup: 'off' } })
    render(<GeneralTab />)
    expect(screen.getByTestId('settings-tab-general')).toBeTruthy()
  })
})
