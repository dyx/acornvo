// electron/settings/defaults.ts
import type {
  GeneralSettings,
  AppearanceSettings,
  AiSettings,
  BrowserSettings,
  SettingsNamespace,
  SettingsByNs
} from '@shared/settings-types'

export const DEFAULTS: {
  general: GeneralSettings
  appearance: AppearanceSettings
  ai: AiSettings
  browser: BrowserSettings
} = {
  general: { locale: 'zh-CN', autoBackup: 'off' },
  appearance: { theme: 'system', fontScale: 1.0, editorFont: 'system-ui' },
  ai: { defaultProfileId: null },
  browser: { blockAds: true, clipImagesLocalize: false, searchEngine: 'google' }
}

const KNOWN_NAMESPACES: ReadonlyArray<SettingsNamespace> = ['general', 'appearance', 'ai', 'browser']

export function isKnownNamespace(value: unknown): value is SettingsNamespace {
  return typeof value === 'string' && (KNOWN_NAMESPACES as readonly string[]).includes(value)
}

/** Returns a fresh shallow clone of the defaults so callers can mutate freely. */
export function getDefault<NS extends SettingsNamespace>(ns: NS): SettingsByNs[NS] {
  return { ...DEFAULTS[ns] } as SettingsByNs[NS]
}
