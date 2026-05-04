// electron/settings/defaults.test.ts
import { describe, it, expect } from 'vitest'
import { DEFAULTS, getDefault, isKnownNamespace } from './defaults'

describe('DEFAULTS', () => {
  it('exposes all four namespaces with PRD-mandated values', () => {
    expect(DEFAULTS.general).toEqual({ locale: 'zh-CN', autoBackup: 'off' })
    expect(DEFAULTS.appearance).toEqual({
      theme: 'system',
      fontScale: 1.0,
      editorFont: 'system-ui'
    })
    expect(DEFAULTS.ai).toEqual({ defaultProfileId: null })
    expect(DEFAULTS.browser).toEqual({
      blockAds: true,
      clipImagesLocalize: false,
      searchEngine: 'google'
    })
  })

  it('getDefault returns the namespace shape — frozen / structurally cloned', () => {
    const a = getDefault('appearance')
    expect(a).toEqual(DEFAULTS.appearance)
    // Mutating the returned object MUST NOT mutate DEFAULTS
    a.theme = 'dark'
    expect(DEFAULTS.appearance.theme).toBe('system')
  })

  it('isKnownNamespace accepts the 4 names and rejects others', () => {
    expect(isKnownNamespace('general')).toBe(true)
    expect(isKnownNamespace('appearance')).toBe(true)
    expect(isKnownNamespace('ai')).toBe(true)
    expect(isKnownNamespace('browser')).toBe(true)
    expect(isKnownNamespace('foo')).toBe(false)
    expect(isKnownNamespace('')).toBe(false)
  })
})
