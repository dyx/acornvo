import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { runMigrations } from '../services/db/migrations'
import { trimPerfSamples } from './perf'

describe('trimPerfSamples', () => {
  it('keeps only newest 80000 rows when total exceeds 100000', () => {
    const db = new Database(':memory:')
    runMigrations(db, join(process.cwd(), 'electron/services/db/migrations'))
    const ins = db.prepare(`INSERT INTO perf_samples (ts, area, ok, ms) VALUES (?, ?, 1, 1)`)
    const tx = db.transaction(() => {
      for (let i = 0; i < 100100; i += 1) {
        ins.run(new Date(2026, 0, 1, 0, 0, i).toISOString(), 'test')
      }
    })
    tx()

    trimPerfSamples({ db })

    const count = db.prepare(`SELECT COUNT(*) AS n FROM perf_samples`).get() as { n: number }
    expect(count.n).toBe(80000)
  })

  it('is a no-op below the 100k threshold', () => {
    const db = new Database(':memory:')
    runMigrations(db, join(process.cwd(), 'electron/services/db/migrations'))
    const ins = db.prepare(`INSERT INTO perf_samples (ts, area, ok, ms) VALUES (?, ?, 1, 1)`)
    for (let i = 0; i < 5; i += 1) ins.run(new Date(2026, 0, 1, 0, 0, i).toISOString(), 'test')
    trimPerfSamples({ db })
    const count = db.prepare(`SELECT COUNT(*) AS n FROM perf_samples`).get() as { n: number }
    expect(count.n).toBe(5)
  })
})
