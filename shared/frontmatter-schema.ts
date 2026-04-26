// shared/frontmatter-schema.ts
// Stub — full implementation in Plan 3 task 4.3 (design D5).
import { z } from 'zod'

/**
 * Frontmatter schema is intentionally permissive: every documented field is optional,
 * and unknown keys are preserved (passthrough). Plan 3 expands this to cover the full
 * PRD field list (title, url, summary, rating, tags, ...).
 */
export const FrontmatterSchema = z.object({}).passthrough()

export type Frontmatter = z.infer<typeof FrontmatterSchema>
