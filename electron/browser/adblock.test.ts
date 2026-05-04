// electron/browser/adblock.test.ts
import { describe, it, expect } from 'vitest'
import { createAdblock } from './adblock'

describe('adblock', () => {
  it('shouldBlock matches exact hostname (case-insensitive)', () => {
    const ab = createAdblock(new Set(['google-analytics.com']))
    expect(ab.shouldBlock('https://google-analytics.com/collect')).toBe(true)
    expect(ab.shouldBlock('https://GOOGLE-ANALYTICS.COM/x')).toBe(true)
    expect(ab.shouldBlock('https://example.com/')).toBe(false)
  })

  it('shouldBlock returns false for malformed URLs', () => {
    const ab = createAdblock(new Set(['x.com']))
    expect(ab.shouldBlock('not a url')).toBe(false)
    expect(ab.shouldBlock('')).toBe(false)
  })

  it('markBlocked + drainCount counts blocks and resets', () => {
    const ab = createAdblock(new Set(['x.com']))
    ab.markBlocked()
    ab.markBlocked()
    ab.markBlocked()
    expect(ab.drainCount()).toBe(3)
    expect(ab.drainCount()).toBe(0)
  })

  it('subdomains do NOT match a hostname-only entry (exact match)', () => {
    // Spec D5: hostname match. Subdomain coverage requires explicit entries
    // (Steven Black list includes them); we keep the matcher strict.
    const ab = createAdblock(new Set(['google-analytics.com']))
    expect(ab.shouldBlock('https://www.google-analytics.com/x')).toBe(false)
  })

  it('empty host set never blocks', () => {
    const ab = createAdblock(new Set())
    expect(ab.shouldBlock('https://anywhere.com/')).toBe(false)
  })
})
