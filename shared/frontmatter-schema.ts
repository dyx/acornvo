// shared/frontmatter-schema.ts
// Full implementation per design D5 of phase-04-file-io-atomic (task 4.3).
import { z } from 'zod'

/**
 * Frontmatter schema — design D5 of phase-04-file-io-atomic.
 *
 * Every documented field is optional so old files can lack any subset; unknown
 * keys are preserved (.passthrough). New optional fields can be added here without
 * breaking already-stored files.
 */
export const FrontmatterSchema = z
  .object({
    // 拾果 (clip) phase
    title: z.string().optional(),
    url: z.string().url().optional(),
    site: z.string().optional(),
    author: z.string().optional(),
    published_at: z.string().optional(), // permissive: YYYY-MM-DD or ISO
    clipped_at: z.string().datetime().optional(),
    source_type: z.enum(['article', 'rss', 'manual']).optional(),

    // 理果 (review) phase
    summary: z.string().optional(),
    highlights: z.array(z.string()).optional(),
    rating: z.number().int().min(1).max(5).optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    reviewed_at: z.string().datetime().optional(),
    reviewed_model: z.string().optional(),
    reviewed_version: z.number().int().nonnegative().optional(),
    reviewed_error: z.string().optional(),

    // misc / future
    sync_warning: z.string().optional()
  })
  .passthrough()

export type Frontmatter = z.infer<typeof FrontmatterSchema>
