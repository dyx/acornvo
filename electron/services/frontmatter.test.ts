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
