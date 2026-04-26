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
})
