import { describe, it, expect } from 'vitest'
import { reviewClip, AiReviewSchema } from './review-clip'

describe('reviewClip.render', () => {
  it('returns { system, user } strings', () => {
    const r = reviewClip.render({ title: 'T', url: 'https://e.x/a', body: 'b' })
    expect(typeof r.system).toBe('string')
    expect(typeof r.user).toBe('string')
  })

  it('system prompt mentions structured-output handling, kebab-case, no extra text', () => {
    const r = reviewClip.render({ title: 'T', url: 'u', body: 'b' })
    expect(r.system).toMatch(/结构化输出|结构化/)
    expect(r.system).toMatch(/kebab-case/i)
    expect(r.system).toMatch(/不要包含任何额外文本/)
  })

  it('user prompt embeds title, url, and body', () => {
    const r = reviewClip.render({ title: 'My Article', url: 'https://e.x/a', body: 'BODY_CONTENT' })
    expect(r.user).toContain('My Article')
    expect(r.user).toContain('https://e.x/a')
    expect(r.user).toContain('BODY_CONTENT')
  })

  it('does not append truncation marker when body ≤ 16000 chars', () => {
    const body = 'x'.repeat(16000)
    const r = reviewClip.render({ title: 'T', url: 'u', body })
    expect(r.user).not.toContain('内容过长已截断')
  })

  it('truncates body to 16000 chars and appends marker when longer', () => {
    const body = 'x'.repeat(16500)
    const r = reviewClip.render({ title: 'T', url: 'u', body })
    expect(r.user).toContain('内容过长已截断')
    expect(r.user.match(/x{16000}/)?.[0]).toBeDefined()
    expect(r.user.match(/x{16001}/)).toBeNull()
  })
})

describe('AiReviewSchema (Zod)', () => {
  it('parses a valid review object', () => {
    const parsed = AiReviewSchema.parse({
      summary: 'a short summary',
      suggestedTitle: 'a title',
      tags: ['deep-learning', 'transformer', 'attention'],
      keyQuotes: ['Attention is all you need.']
    })
    expect(parsed.tags).toHaveLength(3)
  })

  it('rejects when tags has fewer than 3 entries', () => {
    expect(() =>
      AiReviewSchema.parse({
        summary: 's',
        suggestedTitle: 't',
        tags: ['a', 'b'],
        keyQuotes: ['q']
      })
    ).toThrow()
  })

  it('rejects when tags has more than 8 entries', () => {
    expect(() =>
      AiReviewSchema.parse({
        summary: 's',
        suggestedTitle: 't',
        tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
        keyQuotes: ['q']
      })
    ).toThrow()
  })

  it('rejects non-kebab-case tag', () => {
    expect(() =>
      AiReviewSchema.parse({
        summary: 's',
        suggestedTitle: 't',
        tags: ['DeepLearning', 'a-b', 'c-d'],
        keyQuotes: ['q']
      })
    ).toThrow()
  })

  it('rejects empty summary', () => {
    expect(() =>
      AiReviewSchema.parse({
        summary: '',
        suggestedTitle: 't',
        tags: ['a-x', 'b-x', 'c-x'],
        keyQuotes: ['q']
      })
    ).toThrow()
  })

  it('rejects keyQuotes with 0 or > 3 elements', () => {
    expect(() =>
      AiReviewSchema.parse({
        summary: 's',
        suggestedTitle: 't',
        tags: ['a-x', 'b-x', 'c-x'],
        keyQuotes: []
      })
    ).toThrow()
    expect(() =>
      AiReviewSchema.parse({
        summary: 's',
        suggestedTitle: 't',
        tags: ['a-x', 'b-x', 'c-x'],
        keyQuotes: ['1', '2', '3', '4']
      })
    ).toThrow()
  })
})
