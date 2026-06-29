/**
 * Shared types for the Library view. Locked by OpenSpec change
 * `phase-06-virtual-library-view` (specs `file-query-api` + `file-summary-dto`).
 *
 * `FileSummary` is the single DTO source for any IPC that returns a row of
 * `files` to the renderer. Phase 17 (`@` mention
 * picker) MUST reuse this type — do not create a parallel shape.
 */

/** Granular review lifecycle status for each file. */
export type ReviewStatus = 'none' | 'pending' | 'running' | 'failed' | 'done'

export interface FileSummary {
  /** posix-style path relative to grove root (e.g. `inbox/a.md`). */
  path: string
  /** `frontmatter.title` or basename without `.md`. */
  title: string | null
  category: string | null
  /** ISO datetime of `clipped_at` or null. */
  clipped_at: string | null
  /** mtime of the file (Unix timestamp in ms) to use as a fallback sort key */
  mtime: number
  /** actual creation time of the file (Unix timestamp in ms) */
  created_at: number
  /** `frontmatter_json.site` or null. */
  site: string | null
  /** True when `files.summary IS NOT NULL AND length > 0`. */
  has_summary: boolean
  /** Tag names attached to this file. Order is insertion order from `file_tags`. */
  tags: string[]
  /**
   * Compat field — `true` when `review_status` is `'pending'` or `'running'`.
   * Derived from `review_status`; prefer using `review_status` directly.
   */
  is_reviewing: boolean
  /**
   * Granular review status derived from the jobs queue:
   * - `'none'`    — never queued for review (rating is null, no job exists)
   * - `'pending'` — review job is waiting in the queue
   * - `'running'` — review job is actively executing
   * - `'failed'`  — last review job failed
   * - `'done'`    — review completed
   */
  review_status: ReviewStatus
  /** Error message from the last failed review job, or null. */
  review_error: string | null
}

export interface FileFilter {
  /**
   * Matches `f.category = :category OR f.category LIKE :category || '/%'`.
   * (Prefix match across `/` levels.)
   */
  category?: string
  /** Matches `file_tags.tag IN (:tags)`. Supports multiple tags in frontend filter. */
  tags?: string[]
  /** Matches `f.path LIKE :pathPrefix || '%'`. Used for `inbox/` view. */
  pathPrefix?: string
  /** Title LIKE '%' || :q || '%'. NOT FTS5 — phase 8 owns full-text. */
  q?: string
}

export type OrderBy = 'clipped_desc' | 'clipped_asc' | 'title_asc' | 'title_desc'

export interface Pagination {
  limit?: number
  offset?: number
}

export interface HybridSearchResultItem {
  summary: FileSummary
  body: string
  heading_path: string
  score: number
  source: 'fts' | 'semantic' | 'hybrid'
}

export interface HybridSearchResult {
  items: HybridSearchResultItem[]
  total: number
  pending: boolean
  error?: string
}

export interface CategoryNode {
  /** Last segment after `/`. Top-level nodes use the full first segment. */
  name: string
  /** Files whose category equals this node's full path. */
  count: number
  children: CategoryNode[]
}
