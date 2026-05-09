// electron/services/db/migrations/011_perf_samples.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../migrations'

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url))

describe('migration 011 — perf_samples + telemetry_local + ops_log index', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db, MIGRATIONS_DIR)
  })
  afterEach(() => db.close())

  it('creates perf_samples, telemetry_local, idx_ops_log_ts and bumps user_version to 11', () => {
    expect(db.pragma('user_version', { simple: true })).toBe(11)

    const cols = (table: string): string[] =>
      (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((r) => r.name)

    expect(cols('perf_samples')).toEqual(
      expect.arrayContaining(['id', 'ts', 'area', 'ok', 'ms', 'meta'])
    )
    expect(cols('telemetry_local')).toEqual(
      expect.arrayContaining(['id', 'day', 'metric', 'value'])
    )

    const idx = (db.prepare(`PRAGMA index_list(ops_log)`).all() as { name: string }[]).map(
      (r) => r.name
    )
    expect(idx).toContain('idx_ops_log_ts')

    const idx2 = (db.prepare(`PRAGMA index_list(perf_samples)`).all() as { name: string }[]).map(
      (r) => r.name
    )
    expect(idx2).toContain('idx_perf_area_ts')
  })
})
