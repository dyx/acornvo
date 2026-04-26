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

export function stringify(frontmatter: Frontmatter, body: string): string {
  if (!frontmatter || Object.keys(frontmatter).length === 0) {
    return body
  }
  // gray-matter's stringify takes (content, data) and returns a fenced string.
  return matter.stringify(body, frontmatter as Record<string, unknown>)
}
