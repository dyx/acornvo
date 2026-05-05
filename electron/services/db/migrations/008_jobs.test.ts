// electron/services/db/migrations/008_jobs.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../migrations'

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url))

describe('migration 008 — jobs', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)
  })
  afterEach(() => db.close())

  it('bumps user_version to at least 8', () => {
    expect(db.pragma('user_version', { simple: true }) as number).toBeGreaterThanOrEqual(8)
  })

  it('creates jobs table with the expected columns + types', () => {
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    ).map((r) => r.name)
    expect(tables).toContain('jobs')

    const info = db.pragma("table_info('jobs')") as {
      name: string
      type: string
      notnull: number
      pk: number
      dflt_value: string | null
    }[]
    const byName = Object.fromEntries(info.map((c) => [c.name, c]))

    expect(byName.id?.pk).toBe(1)
    expect(byName.id?.type.toUpperCase()).toBe('TEXT')
    expect(byName.kind?.notnull).toBe(1)
    expect(byName.payload_json?.notnull).toBe(1)
    expect(byName.status?.notnull).toBe(1)
    expect(byName.attempts?.notnull).toBe(1)
    expect(byName.attempts?.dflt_value).toBe('0')
    expect(byName.next_run_at?.notnull).toBe(1)
    expect(byName.last_error?.notnull).toBe(0) // nullable
    expect(byName.created_at?.notnull).toBe(1)
    expect(byName.updated_at?.notnull).toBe(1)
  })

  it('creates the two expected indexes', () => {
    const indexes = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as { name: string }[]
    ).map((r) => r.name)
    expect(indexes).toContain('idx_jobs_status_next_run')
    expect(indexes).toContain('idx_jobs_kind_status')
  })

  it('allows inserting a representative pending row', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO jobs (id, kind, payload_json, status, attempts, next_run_at, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?)`
        )
        .run(
          'j-1',
          'index-retry',
          JSON.stringify({ path: 'a.md' }),
          'pending',
          0,
          '2026-05-03T00:00:00.000Z',
          '2026-05-03T00:00:00.000Z',
          '2026-05-03T00:00:00.000Z'
        )
    ).not.toThrow()
  })
})
