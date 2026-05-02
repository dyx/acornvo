import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../migrations'

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url))

describe('migration 002 — files_fts trigram', () => {
  it('replaces files_fts with (path UNINDEXED, title, body, tokenize=trigram) and bumps user_version to 2', () => {
    const db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)

    const userVersion = db.pragma('user_version', { simple: true }) as number
    expect(userVersion).toBeGreaterThanOrEqual(2)

    // Schema: SQLite exposes virtual table column names via PRAGMA table_info
    const cols = db.prepare("PRAGMA table_info('files_fts')").all() as { name: string }[]
    const colNames = cols.map((c) => c.name)
    expect(colNames).toEqual(['path', 'title', 'body'])

    // Insert + match smoke test using trigram (3-gram on chinese)
    db.exec(`
      INSERT INTO files (path, title, mtime, content_hash) VALUES ('a.md', 'A', 0, 'h1');
    `)
    db.prepare('INSERT INTO files_fts(rowid, path, title, body) VALUES (?, ?, ?, ?)').run(
      1, 'a.md', 'A', '注意力机制研究'
    )
    const hits = db.prepare(
      "SELECT path FROM files_fts WHERE files_fts MATCH '注意力'"
    ).all() as { path: string }[]
    expect(hits.map((h) => h.path)).toEqual(['a.md'])
  })

  it('idempotent: running migrations again is a no-op', () => {
    const db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)
    const applied = runMigrations(db, MIGRATIONS_DIR) // second run
    expect(applied).toEqual([])
  })
})
