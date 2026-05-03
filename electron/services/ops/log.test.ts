import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../db/migrations'
import { migrationsDir } from '../db/migrations/index'
import * as dbSvc from '../db'
import * as opsLog from './log'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db, migrationsDir())
  vi.spyOn(dbSvc, 'getCurrent').mockReturnValue(db)
})

afterEach(() => {
  vi.restoreAllMocks()
  db.close()
})

describe('opsLog.record', () => {
  it('inserts a row with op/path/ts/meta_json=null when meta omitted', () => {
    opsLog.record({ op: 'trash', path: 'notes/a.md' })
    const row = db.prepare('SELECT op, path, ts, meta_json FROM ops_log').get() as {
      op: string
      path: string
      ts: string
      meta_json: string | null
    }
    expect(row.op).toBe('trash')
    expect(row.path).toBe('notes/a.md')
    expect(row.meta_json).toBeNull()
    // ts is ISO-8601
    expect(() => new Date(row.ts).toISOString()).not.toThrow()
    expect(row.ts).toBe(new Date(row.ts).toISOString())
  })

  it('serialises meta to JSON string', () => {
    opsLog.record({
      op: 'conflict_resolve',
      path: 'notes/a.md',
      meta: { id: 'c1', resolved_by: 'save_as', winner_path: 'notes/a.copy.md' }
    })
    const row = db.prepare('SELECT meta_json FROM ops_log').get() as {
      meta_json: string
    }
    const parsed = JSON.parse(row.meta_json)
    expect(parsed.id).toBe('c1')
    expect(parsed.resolved_by).toBe('save_as')
    expect(parsed.winner_path).toBe('notes/a.copy.md')
  })

  it('stores rename meta with new_path', () => {
    opsLog.record({
      op: 'rename',
      path: 'old/a.md',
      meta: { new_path: 'new/a.md' }
    })
    const row = db.prepare('SELECT op, path, meta_json FROM ops_log').get() as {
      op: string
      path: string
      meta_json: string
    }
    expect(row.op).toBe('rename')
    expect(row.path).toBe('old/a.md')
    expect(JSON.parse(row.meta_json).new_path).toBe('new/a.md')
  })

  it('returns without throwing when getCurrent returns null', () => {
    vi.spyOn(dbSvc, 'getCurrent').mockReturnValue(null)
    expect(() => opsLog.record({ op: 'trash', path: 'notes/a.md' })).not.toThrow()
  })
})

describe('opsLog.list null-db guard', () => {
  it('returns empty result when getCurrent returns null', () => {
    vi.spyOn(dbSvc, 'getCurrent').mockReturnValue(null)
    const result = opsLog.list({ limit: 10, offset: 0 })
    expect(result).toEqual({ items: [], total: 0 })
  })
})

describe('opsLog.record prune (90-day age)', () => {
  it('drops rows older than 90 days before inserting', () => {
    // Seed an old row via direct SQL (bypassing record so prune doesn't fire)
    const oldTs = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString()
    db.prepare('INSERT INTO ops_log (op, path, ts, meta_json) VALUES (?, ?, ?, ?)').run(
      'trash',
      'old.md',
      oldTs,
      null
    )
    expect((db.prepare('SELECT COUNT(*) AS n FROM ops_log').get() as { n: number }).n).toBe(1)

    opsLog.record({ op: 'trash', path: 'fresh.md' })

    const rows = db
      .prepare('SELECT path FROM ops_log ORDER BY ts ASC')
      .all() as Array<{ path: string }>
    // The 100-day-old row was pruned; only the fresh one remains
    expect(rows.map((r) => r.path)).toEqual(['fresh.md'])
  })
})

describe('opsLog.record prune (10000 cap)', () => {
  it('enforces 10000-row cap by ts DESC', () => {
    // Seed 10005 rows with monotonically increasing ts via raw SQL
    const stmt = db.prepare(
      'INSERT INTO ops_log (op, path, ts, meta_json) VALUES (?, ?, ?, ?)'
    )
    const base = Date.now() - 60 * 60 * 1000 // 1h ago
    for (let i = 0; i < 10005; i++) {
      const ts = new Date(base + i).toISOString()
      stmt.run('trash', `seed/${i}.md`, ts, null)
    }
    expect(
      (db.prepare('SELECT COUNT(*) AS n FROM ops_log').get() as { n: number }).n
    ).toBe(10005)

    // Next record() should prune cap to 10000, then insert → final count 10001
    opsLog.record({ op: 'trash', path: 'newest.md' })

    const finalCount = (db.prepare('SELECT COUNT(*) AS n FROM ops_log').get() as {
      n: number
    }).n
    expect(finalCount).toBe(10001)
    // Newest row is preserved
    const newest = db
      .prepare('SELECT path FROM ops_log ORDER BY ts DESC LIMIT 1')
      .get() as { path: string }
    expect(newest.path).toBe('newest.md')
  })
})

describe('opsLog.record atomicity', () => {
  it('prune and insert are committed atomically (single transaction)', () => {
    // Seed an old row that should be pruned
    const oldTs = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString()
    db.prepare('INSERT INTO ops_log (op, path, ts, meta_json) VALUES (?, ?, ?, ?)').run(
      'trash',
      'old.md',
      oldTs,
      null
    )
    // After record returns, both effects (prune of old + insert of new) are visible
    opsLog.record({ op: 'trash', path: 'new.md' })
    const rows = db.prepare('SELECT path FROM ops_log').all() as Array<{ path: string }>
    expect(rows.map((r) => r.path).sort()).toEqual(['new.md'])
  })
})
