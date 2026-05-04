import { describe, it, expect } from 'vitest'
import { enrich, cleanUrl } from './enrich'
import type { ExtractResult } from '@shared/clipper-types'

function ex(over: Partial<ExtractResult>): ExtractResult {
  return {
    ok: true,
    title: 'T',
    content: '<p>x</p>',
    url: 'https://www.example.com/a',
    ...over
  }
}

describe('cleanUrl', () => {
  it('strips hash and known tracking params', () => {
    expect(cleanUrl('https://www.example.com/a?utm_source=x&id=1#section')).toBe(
      'https://www.example.com/a?id=1'
    )
  })
  it('removes utm_*, fbclid, gclid, ref', () => {
    expect(cleanUrl('https://x.com/p?utm_medium=m&fbclid=abc&gclid=xy&ref=foo&q=1')).toBe(
      'https://x.com/p?q=1'
    )
  })
  it('keeps the URL unchanged when no tracking params', () => {
    expect(cleanUrl('https://x.com/p?id=1')).toBe('https://x.com/p?id=1')
  })
  it('returns input on parse failure', () => {
    expect(cleanUrl('not a url')).toBe('not a url')
  })
})

describe('enrich', () => {
  it('site = hostname without leading www.', () => {
    const r = enrich(ex({ url: 'https://www.example.com/a' }))
    expect(r.site).toBe('example.com')
  })

  it('site keeps non-www subdomains', () => {
    const r = enrich(ex({ url: 'https://blog.example.com/a' }))
    expect(r.site).toBe('blog.example.com')
  })

  it('author strips "By " prefix and trims', () => {
    const r = enrich(ex({ byline: '  By  Jane Doe  ' }))
    expect(r.author).toBe('Jane Doe')
  })

  it('author handles "by" lowercase prefix', () => {
    const r = enrich(ex({ byline: 'by John' }))
    expect(r.author).toBe('John')
  })

  it('author omitted when byline empty/whitespace', () => {
    const r = enrich(ex({ byline: '   ' }))
    expect(r.author).toBeUndefined()
  })

  it('publishedTime forwarded when present', () => {
    const r = enrich(ex({ publishedTime: '2026-04-19T00:00:00Z' }))
    expect(r.publishedTime).toBe('2026-04-19T00:00:00Z')
  })

  it('publishedTime omitted when extract did not provide one', () => {
    const r = enrich(ex({}))
    expect(r.publishedTime).toBeUndefined()
  })

  it('lang forwarded; omitted when empty', () => {
    expect(enrich(ex({ lang: 'zh' })).lang).toBe('zh')
    expect(enrich(ex({})).lang).toBeUndefined()
  })

  it('excerpt = Readability excerpt truncated to 160 chars', () => {
    const long = 'x'.repeat(500)
    const r = enrich(ex({ excerpt: long }))
    expect(r.excerpt?.length).toBe(160)
  })

  it('excerpt falls back to textContent when Readability excerpt is empty', () => {
    const r = enrich(ex({ excerpt: '', textContent: 'plain body text' }))
    expect(r.excerpt).toBe('plain body text')
  })

  it('excerpt omitted when both sources empty', () => {
    const r = enrich(ex({ excerpt: '', textContent: '' }))
    expect(r.excerpt).toBeUndefined()
  })

  it('degraded propagated through', () => {
    expect(enrich(ex({ degraded: true })).degraded).toBe(true)
    expect(enrich(ex({})).degraded).toBe(false)
  })

  it('title preferred from extract; missing → undefined', () => {
    expect(enrich(ex({ title: 'A' })).title).toBe('A')
    expect(enrich(ex({ title: '' })).title).toBeUndefined()
  })

  it('content forwarded as-is', () => {
    const r = enrich(ex({ content: '<article>hi</article>' }))
    expect(r.content).toBe('<article>hi</article>')
  })

  it('throws when extract has no url (pipeline pre-condition broken)', () => {
    expect(() => enrich({ ok: true, content: '<p>x</p>' } as any)).toThrow(/url/i)
  })
})
