import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../migrations'

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url))

describe('migration 006_clips', () => {
  it('creates clips table with correct schema and bumps user_version to at least 6', () => {
    const db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)

    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(6)

    const cols = db.prepare(`PRAGMA table_info(clips)`).all() as {
      name: string
      type: string
      notnull: number
      dflt_value: string | null
      pk: number
    }[]
    const byName = Object.fromEntries(cols.map((c) => [c.name, c]))

    expect(byName.id).toMatchObject({ type: 'INTEGER', pk: 1 })
    expect(byName.url).toMatchObject({ type: 'TEXT', notnull: 1 })
    expect(byName.path).toMatchObject({ type: 'TEXT', notnull: 1 })
    expect(byName.title?.type).toBe('TEXT')
    expect(byName.site?.type).toBe('TEXT')
    expect(byName.author?.type).toBe('TEXT')
    expect(byName.published_at?.type).toBe('TEXT')
    expect(byName.clipped_at).toMatchObject({ type: 'TEXT', notnull: 1 })
    expect(byName.excerpt?.type).toBe('TEXT')
    expect(byName.content_length?.type).toBe('INTEGER')
    expect(byName.degraded).toMatchObject({ type: 'INTEGER', dflt_value: '0' })
    expect(byName.created_at).toMatchObject({ type: 'TEXT', notnull: 1 })
  })

  it('UNIQUE(url) rejects duplicates', () => {
    const db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)

    const insert = db.prepare(
      `INSERT INTO clips(url, path, clipped_at, created_at)
       VALUES (?, ?, ?, ?)`
    )
    insert.run('https://example.com/a', 'inbox/202605/a.md', '2026-05-02T00:00:00Z', '2026-05-02T00:00:00Z')
    expect(() =>
      insert.run('https://example.com/a', 'inbox/202605/a-dup.md', '2026-05-02T00:00:01Z', '2026-05-02T00:00:01Z')
    ).toThrow(/UNIQUE/)
  })

  it('idx_clips_clipped_at and idx_clips_site exist', () => {
    const db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)

    const idx = db.prepare(`PRAGMA index_list(clips)`).all() as { name: string }[]
    const names = idx.map((i) => i.name)
    expect(names).toContain('idx_clips_clipped_at')
    expect(names).toContain('idx_clips_site')
  })
})
