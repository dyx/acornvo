import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { runMigrations } from '../services/db/migrations'
import { getAggregates } from './perf'
import { __setGlobalDbForTest } from '../services/global-db'

describe('getAggregates', () => {
  it('returns P50, P95, successRate, count for a window', () => {
    const db = new Database(':memory:')
    runMigrations(db, join(process.cwd(), 'electron/services/db/migrations'))
    db.prepare('ALTER TABLE perf_samples ADD COLUMN grove_id TEXT').run()
    __setGlobalDbForTest(db)

    const ins = db.prepare(`INSERT INTO perf_samples (ts, area, ok, ms) VALUES (?, ?, ?, ?)`)
    const now = new Date('2026-05-09T12:00:00.000Z')
    // 10 samples, ms = 10..100 step 10, all ok
    for (let i = 1; i <= 10; i += 1) {
      ins.run(new Date(now.getTime() - i * 60_000).toISOString(), 'search.query', 1, i * 10)
    }
    // 1 failure
    ins.run(now.toISOString(), 'search.query', 0, 999)

    const agg = getAggregates({
      area: 'search.query',
      windowMs: 24 * 3600 * 1000,
      now: () => now
    })
    expect(agg.count).toBe(11)
    // P50 of [10,20,…,100,999] sorted → index 5 → 60
    expect(agg.p50).toBeGreaterThanOrEqual(50)
    expect(agg.p50).toBeLessThanOrEqual(70)
    expect(agg.p95).toBeGreaterThanOrEqual(100)
    expect(agg.successRate).toBeCloseTo(10 / 11, 2)
  })

  it('returns zeros when no rows in window', () => {
    const db = new Database(':memory:')
    runMigrations(db, join(process.cwd(), 'electron/services/db/migrations'))
    db.prepare('ALTER TABLE perf_samples ADD COLUMN grove_id TEXT').run()
    __setGlobalDbForTest(db)

    const agg = getAggregates({ area: 'search.query', windowMs: 3600 * 1000 })
    expect(agg).toEqual({ count: 0, p50: 0, p95: 0, successRate: 0 })
  })
})
