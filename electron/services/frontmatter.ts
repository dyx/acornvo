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
  const result = FrontmatterSchema.safeParse(m.data ?? {})
  if (!result.success) {
    // Invalid frontmatter fields — fall back to empty frontmatter so the file
    // still gets indexed. The raw YAML is preserved for the editor.
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')
    console.warn(`[frontmatter] parse warnings in file: ${issues}`)
    return {
      frontmatter: {},
      body: m.content,
      rawYaml: m.matter ?? ''
    }
  }
  return {
    frontmatter: result.data,
    body: m.content,
    rawYaml: m.matter ?? ''
  }
}

export function stringify(frontmatter: Frontmatter, body: string, rawYaml?: string): string {
  if (!frontmatter || Object.keys(frontmatter).length === 0) {
    if (rawYaml && rawYaml.trim()) {
      return `---\n${rawYaml.trim()}\n---\n${body}`
    }
    return body
  }
  // gray-matter's stringify takes (content, data) and returns a fenced string.
  return matter.stringify(body, frontmatter as Record<string, unknown>)
}
