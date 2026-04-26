// electron/services/frontmatter.ts
// Implemented in Plan 3 of phase-04-file-io-atomic (tasks 4.1-4.4).
import type { Frontmatter } from '@shared/frontmatter-schema'

export interface ParsedFile {
  frontmatter: Frontmatter
  body: string
  rawYaml: string
}

export function parseFile(_raw: string): ParsedFile {
  throw new Error('frontmatter.parseFile: not yet implemented (phase-04 plan 3)')
}

export function stringify(_frontmatter: Frontmatter, _body: string): string {
  throw new Error('frontmatter.stringify: not yet implemented (phase-04 plan 3)')
}
