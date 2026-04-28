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

export function deleteFile(db: Database.Database, path: string): void {
  db.prepare('DELETE FROM files_fts WHERE path=?').run(path)
  db.prepare('DELETE FROM file_tags WHERE path=?').run(path)
  db.prepare('DELETE FROM files WHERE path=?').run(path)
}

export function renameFile(db: Database.Database, oldPath: string, newPath: string): void {
  const tx = db.transaction(() => {
    db.prepare('UPDATE files SET path=? WHERE path=?').run(newPath, oldPath)
    db.prepare('UPDATE file_tags SET path=? WHERE path=?').run(newPath, oldPath)
    db.prepare('UPDATE files_fts SET path=? WHERE path=?').run(newPath, oldPath)
  })
  tx()
}

export interface FtsRow {
  rowid: number
  path: string
  title: string
  summary: string
  content: string
}

export type Tokenizer = (text: string) => string

const identityTokenizer: Tokenizer = (t) => t

export function upsertFts(
  db: Database.Database,
  row: FtsRow,
  tokenizer: Tokenizer = identityTokenizer
): void {
  const tokenized = tokenizer(row.content)
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM files_fts WHERE path=?').run(row.path)
    db.prepare(
      'INSERT INTO files_fts(rowid, path, title, summary, content) VALUES (?, ?, ?, ?, ?)'
    ).run(row.rowid, row.path, row.title, row.summary, tokenized)
  })
  tx()
}

export function syncTags(db: Database.Database, path: string, tags: string[]): void {
  const wanted = new Set(tags)
  const existing = new Set(
    (db.prepare('SELECT tag FROM file_tags WHERE path=?').all(path) as { tag: string }[]).map(
      (r) => r.tag
    )
  )

  const toAdd = [...wanted].filter((t) => !existing.has(t))
  const toRemove = [...existing].filter((t) => !wanted.has(t))

  const tx = db.transaction(() => {
    for (const tag of toAdd) {
      db.prepare('INSERT OR IGNORE INTO tags(name, usage_count) VALUES (?, 0)').run(tag)
      db.prepare('INSERT INTO file_tags(path, tag) VALUES (?, ?)').run(path, tag)
      db.prepare('UPDATE tags SET usage_count = usage_count + 1 WHERE name=?').run(tag)
    }
    for (const tag of toRemove) {
      db.prepare('DELETE FROM file_tags WHERE path=? AND tag=?').run(path, tag)
      db.prepare('UPDATE tags SET usage_count = usage_count - 1 WHERE name=?').run(tag)
    }
  })
  tx()
}
