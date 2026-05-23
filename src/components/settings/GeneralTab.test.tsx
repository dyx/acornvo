// @vitest-environment jsdom
// src/components/settings/GeneralTab.test.tsx
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

import { i18n } from '@/i18n'

vi.mock('@/ipc/client', () => ({
  ipc: {
    settings: { get: vi.fn(), set: vi.fn().mockResolvedValue({ ok: true }) },
    on: vi.fn(() => () => {})
  }
}))

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

  it('renders locale select with the current value', () => {
    useSettingsStore.setState({ general: { locale: 'zh-CN', autoBackup: 'off' } })
    render(<GeneralTab />)
    const select = screen.getByLabelText(/locale|语言/i) as HTMLSelectElement
    expect(select.value).toBe('zh-CN')
  })

  it('changing the locale calls setGeneral with new value AND switches i18n', () => {
    const setGeneral = vi.fn().mockResolvedValue(undefined)
    useSettingsStore.setState({
      general: { locale: 'zh-CN', autoBackup: 'off' },
      setGeneral
    })
    render(<GeneralTab />)
    const select = screen.getByLabelText(/locale|语言/i)
    fireEvent.change(select, { target: { value: 'en-US' } })
    expect(setGeneral).toHaveBeenCalledWith({ locale: 'en-US' })
  })

  it('shows vault path read-only with copy button', () => {
    render(<GeneralTab />)
    expect(screen.getByText('/tmp/my-grove')).toBeTruthy()
    expect(screen.getByRole('button', { name: /copy|复制/i })).toBeTruthy()
  })
})
