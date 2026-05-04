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
    // 5 oldest rows (seed/0..seed/4) were pruned; oldest remaining is seed/5
    const oldest = db
      .prepare('SELECT path FROM ops_log ORDER BY ts ASC LIMIT 1')
      .get() as { path: string }
    expect(oldest.path).toBe('seed/5.md')
  })
})

describe('opsLog.record combined prune', () => {
  it('applies age-prune and cap-prune together in one transaction', () => {
    // Seed 10007 rows: 3 old (100+ days), 10004 recent
    const stmt = db.prepare(
      'INSERT INTO ops_log (op, path, ts, meta_json) VALUES (?, ?, ?, ?)'
    )
    const oldBase = Date.now() - 100 * 24 * 60 * 60 * 1000
    for (let i = 0; i < 3; i++) {
      stmt.run('trash', `old/${i}.md`, new Date(oldBase + i).toISOString(), null)
    }
    const recentBase = Date.now() - 60 * 60 * 1000
    for (let i = 0; i < 10004; i++) {
      stmt.run('trash', `recent/${i}.md`, new Date(recentBase + i).toISOString(), null)
    }
    expect(
      (db.prepare('SELECT COUNT(*) AS n FROM ops_log').get() as { n: number }).n
    ).toBe(10007)

    // record() prunes 3 old rows (age), then caps to 10000 + inserts → 10001
    opsLog.record({ op: 'trash', path: 'after.md' })

    const count = (db.prepare('SELECT COUNT(*) AS n FROM ops_log').get() as { n: number }).n
    // 10007 - 3 (age prune) - 4 (cap prune) + 1 (insert) = 10001
    expect(count).toBe(10001)
    // No old rows survived
    const oldPaths = db
      .prepare("SELECT path FROM ops_log WHERE path LIKE 'old/%'")
      .all() as Array<{ path: string }>
    expect(oldPaths).toEqual([])
    // Newest row is the inserted one
    const newest = db
      .prepare('SELECT path FROM ops_log ORDER BY ts DESC LIMIT 1')
      .get() as { path: string }
    expect(newest.path).toBe('after.md')
  })
})

describe('opsLog.list', () => {
  it('returns items in ts DESC order with total count', () => {
    opsLog.record({ op: 'trash', path: 'a.md' })
    // tiny pause so ISO ts strings differ
    const t0 = Date.now()
    while (Date.now() - t0 < 2) {
      /* spin 2ms to ensure distinct ISO ms */
    }
    opsLog.record({ op: 'rename', path: 'b.md', meta: { new_path: 'b2.md' } })
    const result = opsLog.list({ limit: 10, offset: 0 })
    expect(result.total).toBe(2)
    expect(result.items.length).toBe(2)
    // newest first
    expect(result.items[0].path).toBe('b.md')
    expect(result.items[1].path).toBe('a.md')
  })

  it('respects limit and offset', () => {
    for (let i = 0; i < 5; i++) {
      opsLog.record({ op: 'trash', path: `n${i}.md` })
      const t0 = Date.now()
      while (Date.now() - t0 < 2) {
        /* spin */
      }
    }
    const page = opsLog.list({ limit: 2, offset: 1 })
    expect(page.total).toBe(5)
    expect(page.items.length).toBe(2)
    // newest first → offset 1 means skip n4
    expect(page.items.map((i) => i.path)).toEqual(['n3.md', 'n2.md'])
  })

  it('filters by op when supplied', () => {
    opsLog.record({ op: 'trash', path: 'a.md' })
    opsLog.record({ op: 'rename', path: 'b.md', meta: { new_path: 'b2.md' } })
    opsLog.record({ op: 'trash', path: 'c.md' })
    const onlyTrash = opsLog.list({ limit: 50, offset: 0, op: 'trash' })
    expect(onlyTrash.total).toBe(2)
    expect(onlyTrash.items.every((i) => i.op === 'trash')).toBe(true)
    const onlyRename = opsLog.list({ limit: 50, offset: 0, op: 'rename' })
    expect(onlyRename.total).toBe(1)
    expect(onlyRename.items[0].path).toBe('b.md')
  })

  it('returns parsed meta object (not the raw string)', () => {
    opsLog.record({
      op: 'conflict_resolve',
      path: 'a.md',
      meta: { id: 'c1', resolved_by: 'keep_local' }
    })
    const result = opsLog.list({ limit: 1, offset: 0 })
    expect(result.items[0].meta).toEqual({ id: 'c1', resolved_by: 'keep_local' })
    // null when meta absent
    opsLog.record({ op: 'trash', path: 'b.md' })
    const all = opsLog.list({ limit: 10, offset: 0 })
    const trashItem = all.items.find((i) => i.path === 'b.md')!
    expect(trashItem.meta).toBeNull()
  })

  it('returns empty result when table empty', () => {
    const result = opsLog.list({ limit: 10, offset: 0 })
    expect(result.total).toBe(0)
    expect(result.items).toEqual([])
  })
})
