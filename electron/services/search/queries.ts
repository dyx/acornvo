import type Database from 'better-sqlite3'
import type { FileSummary } from '@shared/file-types'
import { logger } from '../../obs/logger'
import { buildFtsQuery } from './queryBuilder'

export interface SummaryRow {
  path: string
  title: string | null
  category: string | null
  clipped_at: string | null
  summary: string | null
  frontmatter_json: string | null
  tags_json: string | null
}

export function rowToFileSummary(row: SummaryRow): FileSummary {
  let tags: string[] = []
  if (row.tags_json) {
    try {
      const parsed = JSON.parse(row.tags_json)
      if (Array.isArray(parsed)) tags = parsed.filter((t) => typeof t === 'string')
    } catch { /* ignore */ }
  }
  let site: string | null = null
  if (row.frontmatter_json) {
    try {
      const fm = JSON.parse(row.frontmatter_json) as { site?: unknown; url?: unknown }
      if (typeof fm.site === 'string') site = fm.site
      else if (typeof fm.url === 'string') {
        try {
          site = new URL(fm.url).host
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }
  return {
    path: row.path,
    title: row.title ?? null,
    category: row.category ?? null,
    clipped_at: row.clipped_at ?? null,
    mtime: 0, created_at: 0,
    site,
    has_summary: row.summary !== null && row.summary !== '',
    tags,
    is_reviewing: false,
    review_status: row.summary !== null && row.summary !== '' ? 'done' : 'none',
    review_error: null
  }
}

const SUMMARY_BASE = `
  SELECT
    files.path, files.title, files.category, files.clipped_at,
    files.summary, files.frontmatter_json,
    json_extract(files.frontmatter_json, '$.tags') AS tags_json
  FROM files
`


export interface FullTextOpts {
  limit?: number
  offset?: number
}
export interface FullTextResult {
  items: { summary: FileSummary; body: string; heading_path: string }[]
  total: number
  pending: boolean
  error?: string
}

interface FtsHitRow {
  path: string
  heading_path: string
  body: string
  rank: number
}

export function escapeForSnippet(s: string): string {
  const OPEN = '\u0000MARK_OPEN\u0000'
  const CLOSE = '\u0000MARK_CLOSE\u0000'
  return s
    .replace(/<mark>/g, OPEN)
    .replace(/<\/mark>/g, CLOSE)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(new RegExp(OPEN, 'g'), '<mark>')
    .replace(new RegExp(CLOSE, 'g'), '</mark>')
}

export function fullText(
  db: Database.Database,
  q: string | string[],
  opts: FullTextOpts = {}
): FullTextResult {
  const queries = Array.isArray(q) ? q : [q]
  const exprs = queries.map(query => buildFtsQuery(query)).filter(e => e.length > 0)
  if (exprs.length === 0) {
    return { items: [], total: 0, pending: false }
  }
  const expr = exprs.map(e => `(${e})`).join(' OR ')

  const limit = opts.limit ?? 50
  const offset = opts.offset ?? 0

  let totalRow: { c: number } | undefined
  let hits: FtsHitRow[] = []
  try {
    totalRow = db
      .prepare('SELECT COUNT(*) AS c FROM files_fts WHERE files_fts MATCH ?')
      .get(expr) as { c: number }

    hits = db
        .prepare(
          `SELECT path,
                heading_path,
                snippet(files_fts, -1, '<mark>', '</mark>', '...', 64) AS body,
                rank
         FROM files_fts
         WHERE files_fts MATCH ?
           AND rank MATCH 'bm25(0.0, 5.0, 10.0, 1.0)'
         ORDER BY rank
         LIMIT ? OFFSET ?`
        )
      .all(expr, limit, offset) as FtsHitRow[]
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger().warn('search', { msg: '[search.fullText] FTS5 syntax error', meta: { q, expr, msg } })
    return { items: [], total: 0, pending: false, error: msg }
  }

  if (hits.length === 0) {
    return { items: [], total: totalRow?.c ?? 0, pending: false }
  }

  const placeholders = hits.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT
       files.path, files.title, files.category, files.clipped_at,
       files.summary, files.frontmatter_json,
       json_extract(files.frontmatter_json, '$.tags') AS tags_json
     FROM files
     WHERE files.path IN (${placeholders})`
    )
    .all(...hits.map((h) => h.path)) as SummaryRow[]

  const byPath = new Map(rows.map((r) => [r.path, r]))
  const items = hits
    .map((hit) => {
      const row = byPath.get(hit.path)
      if (!row) return null
      return { summary: rowToFileSummary(row), body: escapeForSnippet(hit.body), heading_path: hit.heading_path }
    })
    .filter((x): x is { summary: FileSummary; body: string; heading_path: string } => x !== null)

  return { items, total: totalRow?.c ?? items.length, pending: false }
}

export function suggest(db: Database.Database, q: string): FileSummary[] {
  if (q.length === 0) {
    const sql = `
      ${SUMMARY_BASE}
      ORDER BY files.updated_at DESC, files.clipped_at DESC
      LIMIT 10
    `
    const rows = db.prepare(sql).all() as SummaryRow[]
    return rows.map(rowToFileSummary)
  }
  
  // Use files_fts with trigram tokenizer for ultra-fast substring matching
  const sql = `
    SELECT
      files.path, files.title, files.category, files.clipped_at,
      files.summary, files.frontmatter_json,
      json_extract(files.frontmatter_json, '$.tags') AS tags_json
    FROM files_fts
    JOIN files ON files.path = files_fts.path
    WHERE files_fts.title LIKE @q OR files_fts.path LIKE @q
    GROUP BY files.path
    ORDER BY files.updated_at DESC
    LIMIT 10
  `
  const rows = db.prepare(sql).all({ q: `%${q}%` }) as SummaryRow[]
  return rows.map(rowToFileSummary)
}
