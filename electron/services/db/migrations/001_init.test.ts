import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../migrations'

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url))

function tableNames(db: Database.Database): string[] {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>
  ).map((r) => r.name)
}

function indexNames(db: Database.Database): string[] {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>
  ).map((r) => r.name)
}

function columnNames(db: Database.Database, table: string): string[] {
  return (db.pragma(`table_info('${table}')`) as Array<{ name: string }>).map((c) => c.name)
}

describe('001_init.sql', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)
  })
  afterEach(() => {
    db.close()
  })

  it('creates files table with required columns + indices', () => {
    expect(tableNames(db)).toContain('files')
    const cols = columnNames(db, 'files')
    for (const required of [
      'path', 'title', 'url', 'category', 'rating', 'summary',
      'clipped_at', 'reviewed_at', 'mtime', 'content_hash', 'frontmatter_json'
    ]) {
      expect(cols).toContain(required)
    }
    // PK on path
    const info = db.pragma("table_info('files')") as Array<{ name: string; pk: number }>
    expect(info.find((c) => c.name === 'path')?.pk).toBe(1)
    // mtime NOT NULL
    const mtimeRow = info.find((c) => c.name === 'mtime') as unknown as { notnull: number }
    expect(mtimeRow.notnull).toBe(1)
    // indices
    const idx = indexNames(db)
    expect(idx).toContain('idx_files_category')
    expect(idx).toContain('idx_files_rating')
    expect(idx).toContain('idx_files_content_hash')
    expect(db.pragma('user_version', { simple: true })).toBe(1)
  })

  it('creates tags + file_tags with composite PK', () => {
    expect(tableNames(db)).toEqual(expect.arrayContaining(['tags', 'file_tags']))
    expect(columnNames(db, 'tags')).toEqual(expect.arrayContaining(['name', 'usage_count']))
    expect(columnNames(db, 'file_tags')).toEqual(expect.arrayContaining(['path', 'tag']))
    const ftInfo = db.pragma("table_info('file_tags')") as Array<{ name: string; pk: number }>
    expect(ftInfo.find((c) => c.name === 'path')?.pk).toBeGreaterThan(0)
    expect(ftInfo.find((c) => c.name === 'tag')?.pk).toBeGreaterThan(0)
    // composite PK rejects duplicates
    db.exec("INSERT INTO files (path, mtime) VALUES ('a.md', 0)")
    db.exec("INSERT INTO file_tags (path, tag) VALUES ('a.md', 'x')")
    expect(() => db.exec("INSERT INTO file_tags (path, tag) VALUES ('a.md', 'x')")).toThrow(/UNIQUE/i)
  })

  it('creates files_fts FTS5 virtual table that supports MATCH', () => {
    expect(tableNames(db)).toContain('files_fts')
    db.exec("INSERT INTO files_fts (path, title, summary, content) VALUES ('a.md', 'hello world', 's', 'body')")
    const rows = db.prepare("SELECT path FROM files_fts WHERE files_fts MATCH 'hello'").all() as Array<{ path: string }>
    expect(rows.map((r) => r.path)).toEqual(['a.md'])
  })

  it('creates bookmarks with autoincrement id + sort_order', () => {
    expect(tableNames(db)).toContain('bookmarks')
    const cols = columnNames(db, 'bookmarks')
    expect(cols).toEqual(expect.arrayContaining(['id', 'url', 'title', 'favicon', 'created_at', 'sort_order']))
    const r1 = db.prepare("INSERT INTO bookmarks (url, created_at) VALUES ('https://x', '2026-01-01') RETURNING id").get() as { id: number }
    const r2 = db.prepare("INSERT INTO bookmarks (url, created_at) VALUES ('https://y', '2026-01-01') RETURNING id").get() as { id: number }
    expect(r2.id).toBe(r1.id + 1)
  })

  it('creates chats with TEXT primary key', () => {
    expect(tableNames(db)).toContain('chats')
    const cols = columnNames(db, 'chats')
    expect(cols).toEqual(expect.arrayContaining(['id', 'title', 'model', 'created_at', 'updated_at']))
    db.exec("INSERT INTO chats (id, created_at, updated_at) VALUES ('c1', '2026-01-01', '2026-01-01')")
    expect(() => db.exec("INSERT INTO chats (id, created_at, updated_at) VALUES ('c1', '2026-01-01', '2026-01-01')")).toThrow(/UNIQUE/i)
  })

  it('creates queue with idx_queue_status + partial unique index for active reviews', () => {
    expect(tableNames(db)).toContain('queue')
    const idx = indexNames(db)
    expect(idx).toContain('idx_queue_status')
    expect(idx).toContain('uq_queue_active_path')

    // The partial unique index should reject a second active review for the same path.
    const insert = db.prepare(
      "INSERT INTO queue (kind, payload_json, status, created_at, updated_at) VALUES (?, ?, ?, '2026-01-01', '2026-01-01')"
    )
    insert.run('review', JSON.stringify({ path: 'a.md' }), 'pending')
    expect(() => insert.run('review', JSON.stringify({ path: 'a.md' }), 'pending')).toThrow(/UNIQUE/i)

    // But a different path is fine.
    expect(() => insert.run('review', JSON.stringify({ path: 'b.md' }), 'pending')).not.toThrow()

    // And a 'failed' row for the same path is fine (not in the partial set).
    expect(() => insert.run('review', JSON.stringify({ path: 'a.md' }), 'failed')).not.toThrow()

    // And a non-review kind is fine.
    expect(() => insert.run('reindex', JSON.stringify({ path: 'a.md' }), 'pending')).not.toThrow()
  })

  it('creates usage with ts/model/purpose indices', () => {
    expect(tableNames(db)).toContain('usage')
    const cols = columnNames(db, 'usage')
    expect(cols).toEqual(
      expect.arrayContaining([
        'id', 'ts', 'purpose', 'model_id', 'model_name',
        'input_tokens', 'output_tokens', 'estimated_cost_usd',
        'file_path', 'chat_id'
      ])
    )
    const idx = indexNames(db)
    expect(idx).toContain('idx_usage_ts')
    expect(idx).toContain('idx_usage_model')
    expect(idx).toContain('idx_usage_purpose')
  })
})
