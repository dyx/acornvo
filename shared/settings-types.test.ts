// shared/settings-types.test.ts
import { describe, it, expectTypeOf } from 'vitest'
import type {
  GeneralSettings,
  AppearanceSettings,
  AiSettings,
  BrowserSettings,
  AiProviderProfile,
  AiProviderKind,
  SettingsTab,
  SettingsByNs
} from './settings-types'

describe('settings-types module', () => {
  it('exposes the four namespace types', () => {
    expectTypeOf<GeneralSettings>().toMatchTypeOf<{ locale: string; autoBackup: string }>()
    expectTypeOf<AppearanceSettings>().toMatchTypeOf<{
      theme: string
      fontScale: number
      editorFont: string
    }>()
    expectTypeOf<AiSettings>().toMatchTypeOf<{ defaultProfileId: string | null }>()
    expectTypeOf<BrowserSettings>().toMatchTypeOf<{
      blockAds: boolean
      clipImagesLocalize: boolean
      searchEngine: 'google' | 'bing' | 'duckduckgo' | 'baidu'
    }>()
  })

  it('AiProviderProfile has apiKeyRef but no apiKey (plaintext never crosses IPC)', () => {
    expectTypeOf<AiProviderProfile>().toMatchTypeOf<{
      id: string
      name: string
      provider: AiProviderKind
      baseUrl: string | null
      model: string
      temperature: number
      maxTokens: number | null
      apiKeyRef: string | null
      createdAt: string
      updatedAt: string
    }>()
    // @ts-expect-error — apiKey must NOT exist on the over-the-wire shape
    expectTypeOf<AiProviderProfile>().toHaveProperty('apiKey')
  })

  it('SettingsByNs maps each known namespace to its concrete type', () => {
    expectTypeOf<SettingsByNs['general']>().toEqualTypeOf<GeneralSettings>()
    expectTypeOf<SettingsByNs['ai']>().toEqualTypeOf<AiSettings>()
    expectTypeOf<SettingsByNs['browser']>().toEqualTypeOf<BrowserSettings>()
  })

  it('SettingsTab is exactly the known set', () => {
    expectTypeOf<SettingsTab>().toEqualTypeOf<
      'general' | 'ai' | 'browser' | 'observability' | 'about'
    >()
  })
})
