import { describe, it, expect } from 'vitest'
import { parseFile } from './frontmatter'

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
