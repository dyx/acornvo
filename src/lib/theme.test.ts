import { describe, expect, it } from 'vitest'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import { themeTokens, pickAntdLocale } from './theme'

describe('themeTokens', () => {
  it('maps colorBgContainer to --color-paper CSS variable', () => {
    expect(themeTokens.colorBgContainer).toBe('var(--color-paper)')
  })

  it('maps colorBgLayout to --color-paper-2 CSS variable', () => {
    expect(themeTokens.colorBgLayout).toBe('var(--color-paper-2)')
  })

  it('maps colorBorder to --color-line CSS variable', () => {
    expect(themeTokens.colorBorder).toBe('var(--color-line)')
  })

  it('maps colorText to --color-ink CSS variable', () => {
    expect(themeTokens.colorText).toBe('var(--color-ink)')
  })

  it('maps colorTextSecondary to --color-ink-3 CSS variable', () => {
    expect(themeTokens.colorTextSecondary).toBe('var(--color-ink-3)')
  })

  it('sets fontFamily literal "Source Han Serif SC", serif', () => {
    expect(themeTokens.fontFamily).toBe('"Source Han Serif SC", serif')
  })

  it('sets borderRadius literal number 6', () => {
    expect(themeTokens.borderRadius).toBe(6)
  })
})

describe('pickAntdLocale', () => {
  it('returns zhCN for "zh-CN"', () => {
    expect(pickAntdLocale('zh-CN')).toBe(zhCN)
  })

  it('returns zhCN for "zh" (bare)', () => {
    expect(pickAntdLocale('zh')).toBe(zhCN)
  })

  it('returns zhCN for "ZH-cn" (case-insensitive)', () => {
    expect(pickAntdLocale('ZH-cn')).toBe(zhCN)
  })

  it('returns enUS for "en-US"', () => {
    expect(pickAntdLocale('en-US')).toBe(enUS)
  })

  it('returns enUS for "fr-FR" (default fallback)', () => {
    expect(pickAntdLocale('fr-FR')).toBe(enUS)
  })
})
