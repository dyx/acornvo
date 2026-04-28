import type Database from 'better-sqlite3'

export interface FileRow {
  path: string
  title: string | null
  summary: string | null
  category: string | null
  rating: number | null
  content_hash: string
  mtime_ms: number
  size_bytes: number
  frontmatter_json: string | null
  created_at: number
  updated_at: number
}

export type UpsertResult = 'inserted' | 'updated' | 'unchanged'

export function upsertFile(db: Database.Database, row: FileRow): UpsertResult {
  const existing = db
    .prepare('SELECT title, summary, category, rating, content_hash, mtime_ms, size_bytes, frontmatter_json FROM files WHERE path=?')
    .get(row.path) as {
      title: string | null; summary: string | null; category: string | null; rating: number | null
      content_hash: string; mtime_ms: number; size_bytes: number; frontmatter_json: string | null
    } | undefined

  if (
    existing &&
    existing.content_hash === row.content_hash &&
    existing.mtime_ms === row.mtime_ms &&
    existing.title === row.title &&
    existing.summary === row.summary &&
    existing.category === row.category &&
    existing.rating === row.rating &&
    existing.size_bytes === row.size_bytes &&
    existing.frontmatter_json === row.frontmatter_json
  ) {
    return 'unchanged'
  }

  db.prepare(
    `INSERT OR REPLACE INTO files
       (path, title, summary, category, rating, content_hash, mtime_ms, size_bytes, frontmatter_json, created_at, updated_at)
       VALUES (@path, @title, @summary, @category, @rating, @content_hash, @mtime_ms, @size_bytes, @frontmatter_json, @created_at, @updated_at)`
  ).run(row)

  return existing ? 'updated' : 'inserted'
}
