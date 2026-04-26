// electron/services/frontmatter.ts
// Implemented in Plan 3 of phase-04-file-io-atomic (tasks 4.1-4.4).
import matter from 'gray-matter'
import { FrontmatterSchema, type Frontmatter } from '@shared/frontmatter-schema'

export interface ParsedFile {
  frontmatter: Frontmatter
  body: string
  rawYaml: string
}

export function parseFile(raw: string): ParsedFile {
  const m = matter(raw)
  // m.data: parsed YAML object, m.content: body, m.matter: raw YAML string (between ---)
  const frontmatter = FrontmatterSchema.parse(m.data ?? {})
  return {
    frontmatter,
    body: m.content,
    rawYaml: m.matter ?? ''
  }
}

// Keep the throwing stub for stringify until Task 2.
export function stringify(_frontmatter: Frontmatter, _body: string): string {
  throw new Error('frontmatter.stringify: not yet implemented (phase-04 plan 3 task 2)')
}
