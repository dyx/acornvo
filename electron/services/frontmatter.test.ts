import { describe, it, expect } from 'vitest'
import { parseFile, stringify } from './frontmatter'

describe('frontmatter.parseFile', () => {
  it('extracts frontmatter, body, and rawYaml from a wrapped md', () => {
    const raw = '---\ntitle: hi\nrating: 4\n---\n\n# Body\n\ncontent here.\n'
    const r = parseFile(raw)
    expect(r.frontmatter).toMatchObject({ title: 'hi', rating: 4 })
    expect(r.body).toBe('\n# Body\n\ncontent here.\n')
    expect(r.rawYaml).toContain('title: hi')
  })

  it('returns empty frontmatter and full input as body when no fence is present', () => {
    const raw = '# just a body\n\nno frontmatter\n'
    const r = parseFile(raw)
    expect(r.frontmatter).toEqual({})
    expect(r.body).toBe(raw)
    expect(r.rawYaml).toBe('')
  })

  it('preserves unknown fields via passthrough', () => {
    const raw = '---\ncustom_key: some_value\n---\nbody\n'
    const r = parseFile(raw)
    expect(r.frontmatter).toMatchObject({ custom_key: 'some_value' })
  })
})

describe('frontmatter.stringify', () => {
  it('emits a fenced frontmatter block when frontmatter is non-empty', () => {
    const out = stringify({ title: 'hi' } as never, '# Body\n')
    expect(out.startsWith('---\n')).toBe(true)
    expect(out).toMatch(/title:\s*hi/)
    expect(out).toMatch(/---\n+# Body/)
  })

  it('returns body unchanged when frontmatter is empty', () => {
    const body = 'plain body, no frontmatter\n'
    expect(stringify({} as never, body)).toBe(body)
  })

  it('round-trips: parseFile(stringify(...)) preserves data', () => {
    const fm = { title: 'hi', tags: ['a', 'b'], rating: 3 }
    const body = '\n# Body\n'
    const round = parseFile(stringify(fm as never, body))
    expect(round.frontmatter).toMatchObject(fm)
    expect(round.body.trim()).toBe('# Body')
  })
})

describe('frontmatter codec — integration', () => {
  it('roundtrips the full PRD field set without loss', () => {
    const fm = {
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
      reviewed_version: 1
    }
    const body = '\n# Body\n\nLorem ipsum.\n'
    const md = stringify(fm as never, body)
    const back = parseFile(md)
    expect(back.frontmatter).toMatchObject(fm)
    expect(back.body.trim()).toBe('# Body\n\nLorem ipsum.'.trim())
  })

  it('parseFile falls back to empty frontmatter on invalid rating instead of throwing', () => {
    const raw = '---\nrating: 9\n---\nbody\n'
    const result = parseFile(raw)
    // Invalid frontmatter is gracefully downgraded; file still gets indexed.
    expect(result.frontmatter).toEqual({})
    expect(result.body).toBe('body\n')
  })

  it('stringify of empty frontmatter does NOT add wrapper bytes', () => {
    const body = '# just a body\n'
    const out = stringify({} as never, body)
    expect(out).toBe(body)
    expect(out.startsWith('---')).toBe(false)
  })

  it('stringify of a 1-key frontmatter starts with --- and has the key', () => {
    const out = stringify({ title: 'x' } as never, 'body')
    expect(out.startsWith('---\n')).toBe(true)
    expect(out).toMatch(/^---\n[\s\S]*title:\s*x/)
  })
})
