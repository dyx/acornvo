// shared/clip-types.ts
// Row model + DAO inputs/outputs for the phase-12 `clips` table.

export interface Clip {
  id: number
  url: string
  /** Relative-to-vault path. */
  path: string
  title: string | null
  site: string | null
  author: string | null
  publishedAt: string | null
  /** ISO 8601 with offset, e.g. "2026-05-02T10:23:11+08:00". */
  clippedAt: string
  excerpt: string | null
  contentLength: number | null
  /** Readability fell back to body.innerHTML when true. */
  degraded: boolean
  createdAt: string
}

export interface ClipCreateInput {
  url: string
  path: string
  title?: string | null
  site?: string | null
  author?: string | null
  publishedAt?: string | null
  /** Caller supplies clipped_at; created_at is set inside the DAO. */
  clippedAt: string
  excerpt?: string | null
  contentLength?: number | null
  degraded?: boolean
}

export type ClipsListOrderBy = 'clipped_at' | 'title'

export interface ClipsListOpts {
  q?: string
  site?: string
  limit: number
  offset: number
  orderBy?: ClipsListOrderBy
}

export interface ClipsListResult {
  items: Clip[]
  total: number
}
