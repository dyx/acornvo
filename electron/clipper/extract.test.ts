import { describe, it, expect, vi } from 'vitest'
import { createExtractor } from './extract'

function makeWebContents(opts: {
  injectImpl?: () => Promise<unknown>
  parseImpl?: () => Promise<unknown>
  isDestroyed?: () => boolean
}) {
  const calls: string[] = []
  return {
    isDestroyed: opts.isDestroyed ?? (() => false),
    executeJavaScript: vi.fn(async (code: string) => {
      if (code.includes('__acornvo_readability_injected__')) {
        calls.push('inject')
        if (opts.injectImpl) return opts.injectImpl()
        return undefined
      }
      calls.push('parse')
      if (opts.parseImpl) return opts.parseImpl()
      return undefined
    }),
    __calls: calls
  } as any
}

describe('extract', () => {
  it('returns ok=true with extracted fields on the happy path', async () => {
    const wc = makeWebContents({
      parseImpl: async () => ({
        ok: true,
        title: 'Hello',
        byline: 'By Jane',
        content: '<p>Hi</p>',
        textContent: 'Hi',
        length: 2,
        excerpt: 'Hi excerpt',
        siteName: 'Example',
        lang: 'en',
        publishedTime: '2026-04-19T00:00:00Z',
        url: 'https://example.com/a'
      })
    })
    const e = createExtractor({ timeoutMs: 5000 })
    const r = await e.extract(wc)
    expect(r.ok).toBe(true)
    expect(r.title).toBe('Hello')
    expect(r.byline).toBe('By Jane')
    expect(r.content).toBe('<p>Hi</p>')
    expect(r.url).toBe('https://example.com/a')
    expect(wc.__calls).toEqual(['inject', 'parse'])
  })

  it('returns E_EXTRACT_TIMEOUT when executeJavaScript exceeds timeoutMs', async () => {
    const wc = makeWebContents({
      parseImpl: () => new Promise(() => {}) // never resolves
    })
    const e = createExtractor({ timeoutMs: 50 })
    const r = await e.extract(wc)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('E_EXTRACT_TIMEOUT')
  })

  it('returns E_EXTRACT_EMPTY when the in-page snippet reports ok=false', async () => {
    const wc = makeWebContents({
      parseImpl: async () => ({ ok: false, error: 'snippet boom' })
    })
    const e = createExtractor({ timeoutMs: 5000 })
    const r = await e.extract(wc)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('E_EXTRACT_EMPTY')
  })

  it('returns E_EXTRACT_EMPTY when WebContents is destroyed before call', async () => {
    const wc = makeWebContents({ isDestroyed: () => true })
    const e = createExtractor({ timeoutMs: 5000 })
    const r = await e.extract(wc)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('E_EXTRACT_EMPTY')
  })
})

describe('extract — degraded fallback', () => {
  it('returns ok=true degraded=true when Readability parse returns null', async () => {
    const wc = makeWebContents({
      parseImpl: async () => ({
        ok: true,
        degraded: true,
        title: 'Doc Title',
        content: '<body><p>raw</p></body>',
        textContent: 'raw',
        length: 3,
        url: 'https://example.com/x',
        lang: 'en'
      })
    })
    const e = createExtractor({ timeoutMs: 5000 })
    const r = await e.extract(wc)
    expect(r.ok).toBe(true)
    expect(r.degraded).toBe(true)
    expect(r.title).toBe('Doc Title')
    expect(r.content).toBe('<body><p>raw</p></body>')
  })
})
