import type Database from 'better-sqlite3'
import type { FileSummary } from '@shared/file-types'
import { logger } from '../../obs/logger'
import { buildFtsQuery } from './queryBuilder'
import { getPerf } from '../../obs/perf'

interface QuickSwitchRow {
  path: string
  title: string | null
  category: string | null
  rating: number | null
  clipped_at: string | null
  summary: string | null
  frontmatter_json: string | null
  tags_concat: string | null
}

function rowToFileSummary(row: QuickSwitchRow): FileSummary {
  const tags = row.tags_concat ? row.tags_concat.split(',').filter(Boolean) : []
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
    rating: row.rating ?? null,
    clipped_at: row.clipped_at ?? null,
    site,
    has_summary: row.summary !== null && row.summary !== '',
    tags,
    is_reviewing: false,
    review_status: row.rating !== null ? 'done' : 'none',
    review_error: null
  }
}

const QUICK_SWITCH_BASE = `
  SELECT
    files.path, files.title, files.category, files.rating, files.clipped_at,
    files.summary, files.frontmatter_json,
    GROUP_CONCAT(file_tags.tag, ',') AS tags_concat
  FROM files
  LEFT JOIN file_tags ON file_tags.path = files.path
`

export function quickSwitch(
  db: Database.Database,
  q: string,
  opts: { limit?: number } = {}
): FileSummary[] {
  if (q.length === 0) return []
  const limit = opts.limit ?? 10

  // Priority tiers: 1=title equals q; 2=title starts with q; 3=title contains q; 4=path contains q
  const sql = `
    ${QUICK_SWITCH_BASE}
    WHERE files.title = @q COLLATE NOCASE
       OR files.title LIKE @startsWith
       OR files.title LIKE @contains
       OR files.path  LIKE @contains
    GROUP BY files.path
    ORDER BY
      CASE
        WHEN files.title = @q COLLATE NOCASE THEN 1
        WHEN files.title LIKE @startsWith   THEN 2
        WHEN files.title LIKE @contains     THEN 3
        ELSE 4
      END,
      files.clipped_at DESC
    LIMIT @limit
  `
  const rows = db.prepare(sql).all({
    q,
    startsWith: `${q}%`,
    contains: `%${q}%`,
    limit
  }) as QuickSwitchRow[]

  return rows.map(rowToFileSummary)
}

export interface FullTextOpts {
  limit?: number
  offset?: number
}
export interface FullTextResult {
  items: { summary: FileSummary; snippet: string }[]
  total: number
  pending: boolean
  error?: string
}

interface FtsHitRow {
  path: string
  snippet: string
  rank: number
}

type SummaryRow = QuickSwitchRow

export function fullText(
  db: Database.Database,
  q: string,
  opts: FullTextOpts = {}
): FullTextResult {
  const expr = buildFtsQuery(q)
  if (expr.length === 0) {
    return { items: [], total: 0, pending: false }
  }

  const limit = opts.limit ?? 50
  const offset = opts.offset ?? 0

  const p = getPerf()
  const end = p?.start('search.query', { q, limit: opts.limit })

  let totalRow: { c: number } | undefined
  let hits: FtsHitRow[] = []
  try {
    totalRow = db
      .prepare('SELECT COUNT(*) AS c FROM files_fts WHERE files_fts MATCH ?')
      .get(expr) as { c: number }

    hits = db
      .prepare(
        `SELECT path,
              snippet(files_fts, 2, '<mark>', '</mark>', '…', 16) AS snippet,
              rank
       FROM files_fts
       WHERE files_fts MATCH ?
       ORDER BY rank
       LIMIT ? OFFSET ?`
      )
      .all(expr, limit, offset) as FtsHitRow[]
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    end?.({ ok: false, meta: { error: msg } })
    logger().warn('search', { msg: '[search.fullText] FTS5 syntax error', meta: { q, expr, msg } })
    return { items: [], total: 0, pending: false, error: msg }
  }

  if (hits.length === 0) {
    end?.({ ok: true, meta: { total: totalRow?.c ?? 0, returned: 0 } })
    return { items: [], total: totalRow?.c ?? 0, pending: false }
  }

  const placeholders = hits.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT
       files.path, files.title, files.category, files.rating, files.clipped_at,
       files.summary, files.frontmatter_json,
       GROUP_CONCAT(file_tags.tag, ',') AS tags_concat
     FROM files
     LEFT JOIN file_tags ON file_tags.path = files.path
     WHERE files.path IN (${placeholders})
     GROUP BY files.path`
    )
    .all(...hits.map((h) => h.path)) as SummaryRow[]

  const byPath = new Map(rows.map((r) => [r.path, r]))
  const items = hits
    .map((hit) => {
      const row = byPath.get(hit.path)
      if (!row) return null
      return { summary: rowToFileSummary(row), snippet: hit.snippet }
    })
    .filter((x): x is { summary: FileSummary; snippet: string } => x !== null)

  end?.({ ok: true, meta: { total: totalRow?.c ?? items.length, returned: items.length } })
  return { items, total: totalRow?.c ?? items.length, pending: false }
}

export function suggest(db: Database.Database, q: string): FileSummary[] {
  if (q.length === 0) return []
  const sql = `
    ${QUICK_SWITCH_BASE}
    WHERE files.title LIKE @q
    GROUP BY files.path
    ORDER BY files.clipped_at DESC
    LIMIT 5
  `
  const rows = db.prepare(sql).all({ q: `%${q}%` }) as QuickSwitchRow[]
  return rows.map(rowToFileSummary)
}
