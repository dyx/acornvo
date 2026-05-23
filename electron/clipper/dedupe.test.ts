import { describe, it, expect } from 'vitest'
import { createDedupe, type ClipsLookup } from './dedupe'
import type { Clip } from '@shared/clip-types'

function makeClip(url: string): Clip {
  return {
    id: 1,
    url,
    path: 'inbox/test.md',
    title: 'Test',
    site: 'example.com',
    author: null,
    publishedAt: null,
    clippedAt: '2026-05-01T00:00:00Z',
    excerpt: null,
    contentLength: null,
    degraded: false,
    createdAt: '2026-05-01T00:00:00Z'
  }
}

function makeLookup(overrides: Partial<ClipsLookup> = {}): ClipsLookup {
  return {
    getByUrl: async (_url: string) => null,
    ...overrides
  }
}

describe('dedupe', () => {
  it('finds a match when the cleaned URL exists', async () => {
    const clip = makeClip('https://example.com/article')
    const lookup = makeLookup({
      getByUrl: async (url: string) => (url === 'https://example.com/article' ? clip : null)
    })
    const dedupe = createDedupe(lookup)

    const result = await dedupe.findExisting('https://example.com/article')
    expect(result).toEqual(clip)
  })

  it('returns null on miss', async () => {
    const lookup = makeLookup()
    const dedupe = createDedupe(lookup)

    const result = await dedupe.findExisting('https://example.com/missing')
    expect(result).toBeNull()
  })

  it('cleans URL params before lookup', async () => {
    const calls: string[] = []
    const lookup = makeLookup({
      getByUrl: async (url: string) => {
        calls.push(url)
        return null
      }
    })
    const dedupe = createDedupe(lookup)

    await dedupe.findExisting('https://example.com/article?utm_source=x&fbclid=abc#section')
    expect(calls).toEqual(['https://example.com/article'])
  })
})
