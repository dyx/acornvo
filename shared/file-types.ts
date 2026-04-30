/**
 * Shared types for the Library view. Locked by OpenSpec change
 * `phase-06-virtual-library-view` (specs `file-query-api` + `file-summary-dto`).
 *
 * `FileSummary` is the single DTO source for any IPC that returns a row of
 * `files` to the renderer. Phase 8 (QuickSwitcher) and phase 17 (`@` mention
 * picker) MUST reuse this type — do not create a parallel shape.
 */

export interface FileSummary {
  /** posix-style path relative to grove root (e.g. `inbox/a.md`). */
  path: string
  /** `frontmatter.title` or basename without `.md`. */
  title: string | null
  category: string | null
  /** 1–5 or null when unrated (phase-15 will populate; today `null` means "unreviewed"). */
  rating: number | null
  /** ISO datetime of `clipped_at` or null. */
  clipped_at: string | null
  /** `frontmatter_json.site` or null. */
  site: string | null
  /** True when `files.summary IS NOT NULL AND length > 0`. */
  has_summary: boolean
  /** Tag names attached to this file. Order is insertion order from `file_tags`. */
  tags: string[]
  /**
   * Reserved for phase-15 queue JOIN.
   * Phase-06 hard-codes `false`; phase-15 wires this to
   * `LEFT JOIN queue ON ... WHERE kind='review' AND status IN ('pending','running')`.
   */
  is_reviewing: boolean
}

export interface FileFilter {
  /**
   * Matches `f.category = :category OR f.category LIKE :category || '/%'`.
   * (Prefix match across `/` levels.)
   */
  category?: string
  /** Matches `file_tags.tag = :tag`. */
  tag?: string
  /** Matches `f.path LIKE :pathPrefix || '%'`. Used for `inbox/` view. */
  pathPrefix?: string
  /** Inclusive bounds. Either side may be omitted. */
  rating?: { min?: number; max?: number }
  /** Title + path LIKE `'%' || :q || '%'`. NOT FTS5 — phase 8 owns full-text. */
  q?: string
}

export type OrderBy = 'clipped_desc' | 'title_asc'

export interface Pagination {
  limit: number
  offset: number
  orderBy: OrderBy
}

export interface CategoryNode {
  /** Last segment after `/`. Top-level nodes use the full first segment. */
  name: string
  /** Files whose category equals this node's full path. */
  count: number
  children: CategoryNode[]
}

export interface TagCloudItem {
  name: string
  usage_count: number
}
