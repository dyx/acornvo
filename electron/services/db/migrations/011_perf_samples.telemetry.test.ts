import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { runMigrations } from '../migrations'

describe('migration 011 -- telemetry_local', () => {
  it('exposes (id, day, metric, value, meta) and uniq index on (day, metric)', () => {
    const db = new Database(':memory:')
    runMigrations(db, join(__dirname))
    const cols = (db.prepare(`PRAGMA table_info(telemetry_local)`).all() as { name: string }[]).map(c => c.name)
    expect(cols).toEqual(expect.arrayContaining(['id', 'day', 'metric', 'value', 'meta']))
    const idxs = (db.prepare(`PRAGMA index_list(telemetry_local)`).all() as { name: string }[]).map(i => i.name)
    expect(idxs).toContain('uniq_telemetry_day_metric')
  })
})
