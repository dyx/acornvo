import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { runMigrations } from '../services/db/migrations'
import { createPerf } from './perf'

const MIG_DIR = join(process.cwd(), 'electron/services/db/migrations')

describe('perf.start / end', () => {
  it('writes a row to perf_samples with ms >= 0 and meta JSON-stringified', () => {
    const db = new Database(':memory:')
    runMigrations(db, MIG_DIR)
    const perf = createPerf({ db, now: makeStubClock([0, 12]) })
    const end = perf.start('search.query', { sessionId: 's1' })
    end({ ok: true, meta: { hits: 7 } })

    const row = db.prepare(`SELECT * FROM perf_samples`).get() as {
      area: string
      ok: number
      ms: number
      meta: string
    }
    expect(row.area).toBe('search.query')
    expect(row.ok).toBe(1)
    expect(row.ms).toBe(12)
    expect(JSON.parse(row.meta)).toEqual({ sessionId: 's1', hits: 7 })
  })
})

function makeStubClock(seq: number[]): () => number {
  let i = 0
  return () => seq[Math.min(i++, seq.length - 1)]
}
