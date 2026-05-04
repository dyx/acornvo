// @vitest-environment jsdom
// src/components/settings/AppearanceTab.test.tsx
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

import { i18n } from '@/i18n'

vi.mock('@/ipc/client', () => ({
  ipc: { settings: { set: vi.fn().mockResolvedValue({ ok: true }) }, on: vi.fn(() => () => {}) }
}))

import { useSettingsStore } from '@/stores/settings'
import { AppearanceTab } from './AppearanceTab'

describe('AppearanceTab', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
    document.documentElement.dataset.theme = 'system'
    document.documentElement.style.removeProperty('--font-scale')
  })
  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState(), true)
  })
  afterEach(() => cleanup())

  it('renders three theme radios', () => {
    render(<AppearanceTab />)
    expect(screen.getByRole('radio', { name: /system|系统/i })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /light|浅色/i })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /dark|深色/i })).toBeTruthy()
  })

  it('clicking dark radio applies data-theme=dark immediately and calls setAppearance', () => {
    const setAppearance = vi.fn().mockResolvedValue(undefined)
    useSettingsStore.setState({
      appearance: { theme: 'system', fontScale: 1.0, editorFont: 'system-ui' },
      setAppearance
    })
    render(<AppearanceTab />)
    fireEvent.click(screen.getByRole('radio', { name: /dark|深色/i }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(setAppearance).toHaveBeenCalledWith({ theme: 'dark' })
  })

  it('font-scale slider sets --font-scale CSS var on the root element', () => {
    const setAppearance = vi.fn().mockResolvedValue(undefined)
    useSettingsStore.setState({
      appearance: { theme: 'system', fontScale: 1.0, editorFont: 'system-ui' },
      setAppearance
    })
    render(<AppearanceTab />)
    const slider = screen.getByRole('slider', { name: /font.*scale|字号/i })
    fireEvent.change(slider, { target: { value: '1.2' } })
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1.2')
  })
})
