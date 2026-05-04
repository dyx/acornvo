import { describe, it, expect } from 'vitest'
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'

const REQUIRED_KEYS = [
  'settings.title', 'settings.tab.general', 'settings.tab.appearance', 'settings.tab.ai', 'settings.tab.browser',
  'settings.general.locale', 'settings.general.autoBackup', 'settings.general.vaultPath',
  'settings.appearance.theme', 'settings.appearance.theme.system', 'settings.appearance.theme.light', 'settings.appearance.theme.dark',
  'settings.appearance.fontScale', 'settings.appearance.editorFont',
  'settings.ai.empty', 'settings.ai.addProfile', 'settings.ai.editProfile', 'settings.ai.deleteProfile',
  'settings.ai.setDefault', 'settings.ai.default', 'settings.ai.confirmDelete', 'settings.ai.errorDuplicateName',
  'settings.ai.name', 'settings.ai.provider', 'settings.ai.baseUrl', 'settings.ai.model',
  'settings.ai.temperature', 'settings.ai.topP', 'settings.ai.maxTokens', 'settings.ai.apiKey',
  'settings.ai.apiKeyKeepEmpty', 'settings.ai.save',
  'settings.browser.blockAds', 'settings.browser.clipImages', 'settings.browser.clearCookies',
  'settings.browser.clearCookiesConfirm', 'settings.browser.searchEngine',
  'settings.secret.unavailable', 'settings.common.comingSoon'
]

function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out[path] = v
    else if (v && typeof v === 'object') Object.assign(out, flatten(v as Record<string, unknown>, path))
  }
  return out
}

describe('settings i18n keys', () => {
  const flat_zh = flatten(zhCN as Record<string, unknown>)
  const flat_en = flatten(enUS as Record<string, unknown>)

  for (const k of REQUIRED_KEYS) {
    it(`zh-CN has key "${k}"`, () => { expect(flat_zh[k]).toBeDefined() })
    it(`en-US has key "${k}"`, () => { expect(flat_en[k]).toBeDefined() })
  }

  it('zh-CN and en-US have the same key set', () => {
    const zhKeys = Object.keys(flat_zh).sort()
    const enKeys = Object.keys(flat_en).sort()
    expect(enKeys).toEqual(zhKeys)
  })
})
