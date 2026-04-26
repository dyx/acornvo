import { describe, it, expect } from 'vitest'
import { FrontmatterSchema } from './frontmatter-schema'

describe('FrontmatterSchema', () => {
  it('accepts an empty object', () => {
    expect(FrontmatterSchema.parse({})).toEqual({})
  })

  it('accepts the full PRD field list with valid values', () => {
    const full = {
      title: 'hi',
      url: 'https://example.com/a',
      site: 'example.com',
      author: 'me',
      published_at: '2025-01-01',
      clipped_at: '2025-01-02T03:04:05.000Z',
      source_type: 'article' as const,
      summary: 'tl;dr',
      highlights: ['quote a', 'quote b'],
      rating: 4,
      category: 'tech',
      tags: ['x', 'y'],
      reviewed_at: '2025-01-03T00:00:00.000Z',
      reviewed_model: 'claude-opus-4-7',
      reviewed_version: 1,
      reviewed_error: undefined,
      sync_warning: undefined
    }
    const r = FrontmatterSchema.parse(full)
    expect(r.title).toBe('hi')
    expect(r.rating).toBe(4)
    expect(r.tags).toEqual(['x', 'y'])
  })

  it('rejects rating out of range', () => {
    expect(() => FrontmatterSchema.parse({ rating: 6 })).toThrow()
    expect(() => FrontmatterSchema.parse({ rating: 0 })).toThrow()
  })

  it('rejects non-integer rating', () => {
    expect(() => FrontmatterSchema.parse({ rating: 3.5 })).toThrow(/integer|int/i)
  })

  it('rejects non-URL `url`', () => {
    expect(() => FrontmatterSchema.parse({ url: 'not a url' })).toThrow()
  })

  it('preserves unknown keys (passthrough)', () => {
    const r = FrontmatterSchema.parse({ title: 'hi', custom_key: 'hello' })
    expect((r as { custom_key?: string }).custom_key).toBe('hello')
  })

  it('rejects an invalid source_type enum value', () => {
    expect(() => FrontmatterSchema.parse({ source_type: 'whatever' })).toThrow()
  })
})
