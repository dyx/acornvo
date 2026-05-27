// @vitest-environment jsdom
// src/__acceptance__/theme-persistence.test.ts
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// jsdom does not ship window.matchMedia — stub it so settings-effects can run.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('dark'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
})

vi.mock('@/ipc/client', () => {
  let store: Record<string, Record<string, unknown>> = {
    appearance: { theme: 'system', fontScale: 1.0, editorFont: 'system-ui' },
    general: { locale: 'zh-CN', autoBackup: 'off' },
    ai: { defaultProfileId: null },
    browser: { clipImagesLocalize: false, searchEngine: 'google' }
  }
  return {
    ipc: {
      settings: {
        get: vi.fn(async (ns: string) => store[ns]),
        set: vi.fn(async (ns: string, patch: Record<string, unknown>) => {
          store[ns] = { ...store[ns], ...patch }
          return { ok: true }
        }),
        keychainAvailable: vi.fn().mockResolvedValue(true)
      },
      on: vi.fn(() => () => {}),
      window: { themeApplied: vi.fn().mockResolvedValue(undefined) }
    }
  }
})

import { i18n } from '@/i18n'
import { useSettingsStore } from '@/stores/settings'
import { installSettingsEffects, __resetEffectsForTest } from '@/stores/settings-effects'

describe('acceptance 9.2 — theme persists across reload', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState(), true)
    __resetEffectsForTest()
    document.documentElement.dataset.theme = ''
  })

  it('switching to dark immediately applies data-theme=dark', async () => {
    await useSettingsStore.getState().loadAll()
    installSettingsEffects()
    await useSettingsStore.getState().setAppearance({ theme: 'dark' })
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('after a "reload", loadAll returns dark and effects re-apply it', async () => {
    await useSettingsStore.getState().loadAll()
    installSettingsEffects()
    await useSettingsStore.getState().setAppearance({ theme: 'dark' })

    useSettingsStore.setState(useSettingsStore.getInitialState(), true)
    __resetEffectsForTest()
    document.documentElement.dataset.theme = ''

    await useSettingsStore.getState().loadAll()
    installSettingsEffects()
    expect(useSettingsStore.getState().appearance.theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
