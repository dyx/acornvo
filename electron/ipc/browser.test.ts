// electron/ipc/browser.test.ts
import { describe, it, expect } from 'vitest'
import { newTabId, resolveCreateUrl } from './browser'

describe('newTabId', () => {
  it('returns unique strings', () => {
    const a = newTabId()
    const b = newTabId()
    expect(typeof a).toBe('string')
    expect(a).not.toBe(b)
  })
})

describe('resolveCreateUrl', () => {
  it('returns about:blank when undefined', () => {
    expect(resolveCreateUrl(undefined)).toBe('about:blank')
  })
  it('returns the input when provided', () => {
    expect(resolveCreateUrl('https://x.com')).toBe('https://x.com')
  })
})
