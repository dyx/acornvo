// electron/settings/defaults.ts
import type {
  GeneralSettings,
  AppearanceSettings,
  AiSettings,
  BrowserSettings,
  SearchSettings,
  SettingsNamespace,
  SettingsByNs
} from '@shared/settings-types'

export const DEFAULTS: {
  general: GeneralSettings
  appearance: AppearanceSettings
  ai: AiSettings
  browser: BrowserSettings
  search: SearchSettings
} = {
  general: { locale: 'zh-CN', autoBackup: 'off', defaultMenu: '/browser', logLevel: 'info' },
  appearance: { theme: 'system', fontScale: 1.0 },
  ai: {
    defaultChatModelId: null,
    defaultReviewerModelId: null,
    defaultEmbeddingModelId: null,
    bodyMax: 20000
  },
  browser: { clipImagesLocalize: false, searchEngine: 'google' },
  search: { hybridEnabled: true, ftsWeight: 1.0, vecWeight: 1.0 }
}

const KNOWN_NAMESPACES: ReadonlyArray<SettingsNamespace> = [
  'general',
  'appearance',
  'ai',
  'browser',
  'search'
]

export function isKnownNamespace(value: unknown): value is SettingsNamespace {
  return typeof value === 'string' && (KNOWN_NAMESPACES as readonly string[]).includes(value)
}

/** Returns a fresh shallow clone of the defaults so callers can mutate freely. */
export function getDefault<NS extends SettingsNamespace>(ns: NS): SettingsByNs[NS] {
  return { ...DEFAULTS[ns] } as SettingsByNs[NS]
}
