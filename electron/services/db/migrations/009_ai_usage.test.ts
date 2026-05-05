// electron/services/db/migrations/009_ai_usage.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../migrations'

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url))

describe('migration 009 — ai_usage', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)
  })
  afterEach(() => db.close())

  it('bumps user_version to at least 9', () => {
    expect(db.pragma('user_version', { simple: true }) as number).toBeGreaterThanOrEqual(9)
  })

  it('creates ai_usage table with the expected columns + types', () => {
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    ).map((r) => r.name)
    expect(tables).toContain('ai_usage')

    const info = db.pragma("table_info('ai_usage')") as {
      name: string; type: string; notnull: number; pk: number; dflt_value: string | null
    }[]
    const byName = Object.fromEntries(info.map((c) => [c.name, c]))

    expect(byName.id?.pk).toBe(1)
    expect(byName.job_id?.type.toUpperCase()).toBe('TEXT')
    expect(byName.profile_id?.type.toUpperCase()).toBe('TEXT')
    expect(byName.model?.type.toUpperCase()).toBe('TEXT')
    expect(byName.prompt_tokens?.type.toUpperCase()).toBe('INTEGER')
    expect(byName.completion_tokens?.type.toUpperCase()).toBe('INTEGER')
    expect(byName.latency_ms?.type.toUpperCase()).toBe('INTEGER')
    expect(byName.ok?.notnull).toBe(1)
    expect(byName.ok?.type.toUpperCase()).toBe('INTEGER')
    expect(byName.error?.type.toUpperCase()).toBe('TEXT')
    expect(byName.created_at?.notnull).toBe(1)
    expect(byName.created_at?.type.toUpperCase()).toBe('TEXT')
  })

  it('creates the two expected indexes', () => {
    const indexes = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='ai_usage'").all() as { name: string }[]
    ).map((r) => r.name)
    expect(indexes).toContain('idx_ai_usage_created')
    expect(indexes).toContain('idx_ai_usage_profile')
  })

  it('allows inserting a representative success row', () => {
    expect(() =>
      db.prepare(
        `INSERT INTO ai_usage (job_id, profile_id, model, prompt_tokens, completion_tokens, latency_ms, ok, error, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`
      ).run('j-1', 'p-1', 'gpt-4o-mini', 100, 50, 1200, 1, null, '2026-05-04T00:00:00.000Z')
    ).not.toThrow()
  })

  it('allows inserting a failure row with null tokens', () => {
    expect(() =>
      db.prepare(
        `INSERT INTO ai_usage (job_id, profile_id, model, prompt_tokens, completion_tokens, latency_ms, ok, error, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`
      ).run('j-2', 'p-1', null, null, null, 30, 0, 'E_AUTH', '2026-05-04T00:00:00.000Z')
    ).not.toThrow()
  })
})
