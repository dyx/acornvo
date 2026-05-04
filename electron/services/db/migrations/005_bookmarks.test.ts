import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../migrations'

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url))

describe('migration 005_bookmarks', () => {
  it('creates bookmarks table with correct schema and bumps user_version to 5', () => {
    const db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)

    expect(db.pragma('user_version', { simple: true })).toBe(5)

    const cols = db.prepare('PRAGMA table_info(bookmarks)').all() as {
      name: string
      type: string
      notnull: number
      pk: number
    }[]
    const byName = Object.fromEntries(cols.map((c) => [c.name, c]))
    expect(byName.id).toMatchObject({ type: 'INTEGER', pk: 1 })
    expect(byName.url).toMatchObject({ type: 'TEXT', notnull: 1 })
    expect(byName.title?.type).toBe('TEXT')
    expect(byName.favicon?.type).toBe('TEXT')
    expect(byName.tags_json?.type).toBe('TEXT')
    expect(byName.created_at).toMatchObject({ type: 'TEXT', notnull: 1 })
    expect(byName.updated_at).toMatchObject({ type: 'TEXT', notnull: 1 })
  })

  it('UNIQUE constraint on url rejects duplicates', () => {
    const db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)

    const insert = db.prepare(
      `INSERT INTO bookmarks(url, title, favicon, tags_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    insert.run('https://example.com', 'Ex', null, null, '2026-05-02T00:00:00Z', '2026-05-02T00:00:00Z')
    expect(() =>
      insert.run('https://example.com', 'Dup', null, null, '2026-05-02T00:00:00Z', '2026-05-02T00:00:00Z')
    ).toThrow(/UNIQUE/)
  })

  it('idx_bookmarks_created and idx_bookmarks_url exist', () => {
    const db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)

    const idx = db.prepare('PRAGMA index_list(bookmarks)').all() as { name: string }[]
    const names = idx.map((i) => i.name)
    expect(names).toContain('idx_bookmarks_created')
    expect(names).toContain('idx_bookmarks_url')
  })
})
