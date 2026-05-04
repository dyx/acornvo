import { describe, it, expect } from 'vitest'
import { sha6, buildSlug } from './slug'

describe('sha6', () => {
  it('returns first 6 hex chars of sha1(url)', () => {
    const result = sha6('https://example.com/article')
    expect(result).toHaveLength(6)
    expect(/^[0-9a-f]{6}$/.test(result)).toBe(true)
  })

  it('is deterministic', () => {
    expect(sha6('https://example.com/article')).toBe(sha6('https://example.com/article'))
  })

  it('produces different hashes for different URLs', () => {
    expect(sha6('https://a.com')).not.toBe(sha6('https://b.com'))
  })
})

describe('buildSlug', () => {
  it('uses jieba for Chinese title (CJK) + sha6', () => {
    const slug = buildSlug({
      title: '人工智能的未来发展趋势',
      url: 'https://example.com/ai-future'
    })
    // jieba cuts: 人工智能 的 未来 发展 趋势 → first 3 words: 人工智能-的-未来
    expect(slug).toMatch(/^人工智能-的-未来-/)
    expect(slug).toContain(sha6('https://example.com/ai-future'))
  })

  it('uses slugify for English title (≤50 chars) + sha6', () => {
    const slug = buildSlug({
      title: 'The Future of Artificial Intelligence',
      url: 'https://example.com/ai-future'
    })
    // slugify lowercased, spaces to dashes, ≤50 chars
    expect(slug).toMatch(/^the-future-of-artificial-intelligence-/)
    expect(slug).toContain(sha6('https://example.com/ai-future'))
    // Title part should be ≤ 50 chars
    const titlePart = slug.slice(0, slug.lastIndexOf('-'))
    expect(titlePart.length).toBeLessThanOrEqual(50)
  })

  it('truncates English slugified title to ≤50 chars', () => {
    const longTitle = 'A Very Long Title About Many Different Topics In The World Of Technology And Science And Everything Else'
    const slug = buildSlug({
      title: longTitle,
      url: 'https://example.com/long'
    })
    const titlePart = slug.slice(0, slug.lastIndexOf('-'))
    expect(titlePart.length).toBeLessThanOrEqual(50)
  })

  it('falls back to clip-YYYYMMDD- + sha6 when title is empty', () => {
    const slug = buildSlug({
      title: '',
      url: 'https://example.com/no-title',
      clippedAt: '2026-05-03T10:30:00+08:00'
    })
    expect(slug).toMatch(/^clip-20260503-/)
    expect(slug).toContain(sha6('https://example.com/no-title'))
  })

  it('uses today date for fallback when clippedAt is missing', () => {
    const slug = buildSlug({
      title: '',
      url: 'https://example.com/empty'
    })
    expect(slug).toMatch(/^clip-\d{8}-/)
    expect(slug).toContain(sha6('https://example.com/empty'))
  })

  it('uses Chinese branch for mixed CJK+Latin title', () => {
    const slug = buildSlug({
      title: 'GPT-4 人工智能突破',
      url: 'https://example.com/mixed'
    })
    // Contains CJK → uses jieba branch
    expect(slug).toMatch(/^GPT-4-/)
    // sha6 is appended
    expect(slug).toContain(sha6('https://example.com/mixed'))
  })
})
