// electron/services/db/migrations/007_settings.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../migrations'

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url))

describe('migration 007 — settings + secrets + ai profiles', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)
  })
  afterEach(() => db.close())

  it('bumps user_version to 7', () => {
    expect(db.pragma('user_version', { simple: true }) as number).toBe(7)
  })

  it('creates settings table with composite primary key (ns, key)', () => {
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
      .map((r) => r.name)
    expect(tables).toContain('settings')
    const info = db.pragma("table_info('settings')") as { name: string; pk: number; notnull: number }[]
    expect(info.find((c) => c.name === 'ns')?.pk).toBe(1)
    expect(info.find((c) => c.name === 'key')?.pk).toBe(2)
    expect(info.find((c) => c.name === 'value_json')?.notnull).toBe(1)
    expect(info.find((c) => c.name === 'updated_at')?.notnull).toBe(1)
  })

  it('creates settings_secrets table with key as primary key + BLOB column', () => {
    const info = db.pragma("table_info('settings_secrets')") as { name: string; pk: number; type: string }[]
    expect(info.find((c) => c.name === 'key')?.pk).toBe(1)
    expect(info.find((c) => c.name === 'encrypted_value')?.type.toUpperCase()).toBe('BLOB')
  })

  it('creates ai_provider_profiles with unique index on name', () => {
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
      .map((r) => r.name)
    expect(tables).toContain('ai_provider_profiles')
    const indices = (db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as { name: string }[])
      .map((r) => r.name)
    expect(indices).toContain('idx_ai_profiles_name')
    db.exec(`
      INSERT INTO ai_provider_profiles (id, name, provider, model, created_at, updated_at)
      VALUES ('a', 'p1', 'openai', 'gpt-4o', '2026-05-03', '2026-05-03')
    `)
    expect(() =>
      db.exec(`
        INSERT INTO ai_provider_profiles (id, name, provider, model, created_at, updated_at)
        VALUES ('b', 'p1', 'openai', 'gpt-4o', '2026-05-03', '2026-05-03')
      `)
    ).toThrow(/UNIQUE/i)
  })

  it('ai_provider_profiles default values: temperature=0.7, top_p=1.0', () => {
    db.exec(`
      INSERT INTO ai_provider_profiles (id, name, provider, model, created_at, updated_at)
      VALUES ('a', 'p1', 'openai', 'gpt-4o', '2026-05-03', '2026-05-03')
    `)
    const row = db.prepare('SELECT temperature, top_p FROM ai_provider_profiles WHERE id=?').get('a') as
      { temperature: number; top_p: number }
    expect(row.temperature).toBe(0.7)
    expect(row.top_p).toBe(1.0)
  })
})
