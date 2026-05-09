import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../migrations'

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url))

describe('migration 004 — file columns alignment', () => {
  it('adds size_bytes, created_at, updated_at to files table', () => {
    const db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)

    const userVersion = db.pragma('user_version', { simple: true }) as number
    expect(userVersion).toBeGreaterThanOrEqual(4)

    const cols = db.pragma("table_info('files')") as Array<{ name: string }>
    const names = cols.map((c) => c.name)
    expect(names).toContain('size_bytes')
    expect(names).toContain('created_at')
    expect(names).toContain('updated_at')
  })

  it('is idempotent — skips ALTER TABLE when columns already exist', () => {
    const db = new Database(':memory:')
    // Simulate a DB that already ran the old 003 migration (columns exist)
    db.exec(`
      CREATE TABLE files (
        path TEXT PRIMARY KEY, title TEXT, url TEXT, category TEXT, rating INTEGER,
        summary TEXT, clipped_at TEXT, reviewed_at TEXT,
        mtime INTEGER NOT NULL, content_hash TEXT, frontmatter_json TEXT,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE tags (name TEXT PRIMARY KEY, usage_count INTEGER DEFAULT 0);
      CREATE TABLE file_tags (path TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (path, tag));
      CREATE TABLE bookmarks (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL, title TEXT, sort_order INTEGER DEFAULT 0);
      CREATE TABLE chats (id TEXT PRIMARY KEY);
      CREATE TABLE queue (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', due_at TEXT);
      CREATE TABLE usage (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, model_id TEXT NOT NULL, purpose TEXT NOT NULL);
      CREATE TABLE ops_log (id INTEGER PRIMARY KEY AUTOINCREMENT, op TEXT NOT NULL, path TEXT NOT NULL, ts TEXT NOT NULL, meta_json TEXT);
    `)
    db.pragma('user_version = 3')

    // Should NOT throw — migration 004 is idempotent
    expect(() => runMigrations(db, MIGRATIONS_DIR)).not.toThrow()
    expect((db.pragma('user_version', { simple: true }) as number)).toBeGreaterThanOrEqual(4)
  })

  it('existing rows get DEFAULT values for new columns', () => {
    const db = new Database(':memory:')
    // Simulate v2 state: run only migrations up to 002, insert a row
    db.exec(`
      CREATE TABLE files (
        path TEXT PRIMARY KEY, title TEXT, url TEXT, category TEXT, rating INTEGER,
        summary TEXT, clipped_at TEXT, reviewed_at TEXT,
        mtime INTEGER NOT NULL, content_hash TEXT, frontmatter_json TEXT
      );
    `)
    db.pragma('user_version = 2')
    db.exec("INSERT INTO files (path, mtime) VALUES ('a.md', 100)")

    // Now run remaining migrations (003)
    runMigrations(db, MIGRATIONS_DIR)

    const row = db.prepare('SELECT size_bytes, created_at, updated_at FROM files WHERE path=?').get('a.md') as
      { size_bytes: number; created_at: number; updated_at: number }
    expect(row).toEqual({ size_bytes: 0, created_at: 0, updated_at: 0 })
  })
})
