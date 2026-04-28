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

export function listAllPaths(db: Database.Database): Set<string> {
  const rows = db.prepare('SELECT path FROM files').all() as { path: string }[]
  return new Set(rows.map((r) => r.path))
}

export interface QueryOptions {
  category?: string
  tag?: string
  rating?: number  // minimum rating
  limit: number
  offset: number
  orderBy: 'updated_at_desc' | 'updated_at_asc' | 'created_at_desc' | 'created_at_asc'
}

const ORDER_BY_SQL: Record<QueryOptions['orderBy'], string> = {
  updated_at_desc: 'updated_at DESC',
  updated_at_asc: 'updated_at ASC',
  created_at_desc: 'created_at DESC',
  created_at_asc: 'created_at ASC'
}

export function queryBy(db: Database.Database, opts: QueryOptions): FileRow[] {
  const where: string[] = []
  const params: Record<string, unknown> = {}

  if (opts.category !== undefined) {
    where.push('files.category = @category')
    params.category = opts.category
  }
  if (opts.rating !== undefined) {
    where.push('files.rating >= @rating')
    params.rating = opts.rating
  }
  let from = 'files'
  if (opts.tag !== undefined) {
    from = 'files INNER JOIN file_tags ON file_tags.path = files.path'
    where.push('file_tags.tag = @tag')
    params.tag = opts.tag
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const sql = `
    SELECT files.* FROM ${from}
    ${whereSql}
    ORDER BY ${ORDER_BY_SQL[opts.orderBy]}
    LIMIT @limit OFFSET @offset
  `
  return db.prepare(sql).all({ ...params, limit: opts.limit, offset: opts.offset }) as FileRow[]
}

let _activeTokenizer: Tokenizer = identityTokenizer
export function setTokenizer(t: Tokenizer): void { _activeTokenizer = t }
export function getTokenizer(): Tokenizer { return _activeTokenizer }

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
