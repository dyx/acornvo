// src/stores/settings.ts
import { create } from 'zustand'
import { ipc } from '@/ipc/client'
import type {
  GeneralSettings,
  AppearanceSettings,
  AiSettings,
  BrowserSettings,
  SettingsChangedPayload
} from '@shared/settings-types'

const DEFAULTS = {
  general: { locale: 'zh-CN', autoBackup: 'off', defaultMenu: '/browser' } as GeneralSettings,
  appearance: { theme: 'system', fontScale: 1.0 } as AppearanceSettings,
  ai: { defaultChatModelId: null, defaultReviewerModelId: null, bodyMax: 20000 } as AiSettings,
  browser: { clipImagesLocalize: false, searchEngine: 'google' } as BrowserSettings
}

interface SettingsState {
  ready: boolean
  general: GeneralSettings
  appearance: AppearanceSettings
  ai: AiSettings
  browser: BrowserSettings
  loadAll: () => Promise<void>
  setGeneral: (patch: Partial<GeneralSettings>) => Promise<void>
  setAppearance: (patch: Partial<AppearanceSettings>) => Promise<void>
  setAi: (patch: Partial<AiSettings>) => Promise<void>
  setBrowser: (patch: Partial<BrowserSettings>) => Promise<void>
  _applyChange: (payload: SettingsChangedPayload) => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ready: false,
  ...DEFAULTS,

  async loadAll() {
    const [general, appearance, ai, browser] = await Promise.all([
      ipc.settings.get('general') as Promise<GeneralSettings>,
      ipc.settings.get('appearance') as Promise<AppearanceSettings>,
      ipc.settings.get('ai') as Promise<AiSettings>,
      ipc.settings.get('browser') as Promise<BrowserSettings>
    ])
    set({ general, appearance, ai, browser, ready: true })
  },

  async setGeneral(patch) {
    const next = { ...get().general, ...patch }
    set({ general: next })
    await ipc.settings.set('general', patch)
  },
  async setAppearance(patch) {
    const next = { ...get().appearance, ...patch }
    set({ appearance: next })
    await ipc.settings.set('appearance', patch)
  },
  async setAi(patch) {
    const next = { ...get().ai, ...patch }
    set({ ai: next })
    await ipc.settings.set('ai', patch)
  },
  async setBrowser(patch) {
    const next = { ...get().browser, ...patch }
    set({ browser: next })
    await ipc.settings.set('browser', patch)
  },


  _applyChange({ ns, key, newValue }) {
    const current = get()
    if (ns === 'general')
      set({ general: { ...current.general, [key]: newValue } as GeneralSettings })
    else if (ns === 'appearance')
      set({ appearance: { ...current.appearance, [key]: newValue } as AppearanceSettings })
    else if (ns === 'ai') set({ ai: { ...current.ai, [key]: newValue } as AiSettings })
    else if (ns === 'browser')
      set({ browser: { ...current.browser, [key]: newValue } as BrowserSettings })
  }
}))

let subscriberInstalled = false

/** @internal — exposed for test teardown only */
export function _resetSettingsSubscriber(): void {
  subscriberInstalled = false
}

export function installSettingsSubscriber(): () => void {
  if (subscriberInstalled) return () => {}
  subscriberInstalled = true
  const unsub = ipc.on('settings:changed', (payload) => {
    useSettingsStore.getState()._applyChange(payload)
  })
  return () => {
    subscriberInstalled = false
    unsub()
  }
}
