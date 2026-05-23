import { describe, it, expect } from 'vitest'
import zhCN from './locales/zh-CN.json'

describe('i18n library keys', () => {
  it('has all keys used by phase-06 components', () => {
    const required = [
      'library.views',
      'library.categories',
      'library.tags',
      'library.all',
      'library.inbox',
      'library.unreviewed',
      'library.search_ph',
      'library.open_editor',
      'library.reveal',
      'library.reviewing',
      'library.empty_grove',
      'library.empty_preview',
      'library.banner_scanning',
      'library.banner_error',
      'library.banner_view_logs',
      'library.shown_total'
    ]
    const lib = (zhCN as Record<string, Record<string, string>>).library ?? {}
    for (const k of required) {
      const subkey = k.split('.')[1]
      expect(typeof lib[subkey]).toBe('string')
    }
  })
})
