// @vitest-environment jsdom
// src/stores/settings-effects.test.ts
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useSettingsStore } from './settings'
import { installSettingsEffects, __resetEffectsForTest } from './settings-effects'

vi.mock('@/ipc/client', () => ({
  ipc: { window: { themeApplied: vi.fn().mockResolvedValue(undefined) } }
}))

describe('settings effects', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState(), true)
    __resetEffectsForTest()
    document.documentElement.dataset.theme = ''
    document.documentElement.style.removeProperty('--font-scale')
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    })) as unknown as typeof window.matchMedia
  })
  afterEach(() => { __resetEffectsForTest() })

  it('applies initial appearance + locale on install', async () => {
    useSettingsStore.setState({
      appearance: { theme: 'dark', fontScale: 1.2, editorFont: 'Georgia' },
      general: { locale: 'en-US', autoBackup: 'off' },
      ready: true
    })
    installSettingsEffects()
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1.2')
    expect(i18n.language).toBe('en-US')
  })

  it('reacts to subsequent appearance changes', () => {
    installSettingsEffects()
    useSettingsStore.setState({ appearance: { theme: 'light', fontScale: 1.1, editorFont: 'system-ui' } })
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1.1')
  })

  it('reacts to locale changes by calling i18n.changeLanguage', () => {
    installSettingsEffects()
    useSettingsStore.setState({ general: { locale: 'en-US', autoBackup: 'off' } })
    expect(i18n.language).toBe('en-US')
  })

  it('install is idempotent (called twice — only one subscription)', () => {
    installSettingsEffects()
    installSettingsEffects()
    const spy = vi.spyOn(document.documentElement.style, 'setProperty')
    useSettingsStore.setState({ appearance: { theme: 'dark', fontScale: 1.3, editorFont: 'system-ui' } })
    expect(spy.mock.calls.filter(([k]) => k === '--font-scale').length).toBe(1)
    spy.mockRestore()
  })
})
