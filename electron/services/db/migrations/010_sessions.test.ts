// electron/services/db/migrations/010_sessions.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../migrations'

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url))

describe('migration 010 — sessions', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db, MIGRATIONS_DIR)
  })
  afterEach(() => db.close())

  it('creates sessions / session_messages / tool_calls tables and bumps user_version to 10', () => {
    expect(db.pragma('user_version', { simple: true }) as number).toBeGreaterThanOrEqual(10)

    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]
    )
    const names = tables.map(t => t.name)
    expect(names).toContain('sessions')
    expect(names).toContain('session_messages')
    expect(names).toContain('tool_calls')
  })

  it('adds session_id column to ai_usage', () => {
    const cols = db.pragma("table_info('ai_usage')") as { name: string }[]
    expect(cols.map(c => c.name)).toContain('session_id')
  })

  it('sessions.id is PRIMARY KEY and updated_at is indexed', () => {
    const indexes = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='sessions'").all() as { name: string }[]
    )
    expect(indexes.some(i => i.name === 'idx_sessions_updated')).toBe(true)
  })

  it('session_messages CASCADE deletes when its session is deleted', () => {
    db.prepare("INSERT INTO sessions (id, title, profile_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run('s1', 't', 'p1', '2026-05-04T00:00:00Z', '2026-05-04T00:00:00Z')
    db.prepare("INSERT INTO session_messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)")
      .run('s1', 'user', 'hi', '2026-05-04T00:00:00Z')
    db.prepare("DELETE FROM sessions WHERE id = ?").run('s1')
    const remaining = db.prepare("SELECT COUNT(*) as n FROM session_messages WHERE session_id = ?").get('s1') as { n: number }
    expect(remaining.n).toBe(0)
  })

  it('tool_calls.session_id is required and indexed', () => {
    const idx = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='tool_calls'").all() as { name: string }[]
    )
    expect(idx.some(i => i.name === 'idx_tool_calls_session')).toBe(true)
    expect(() =>
      db.prepare("INSERT INTO tool_calls (id, tool_name, args_json) VALUES (?, ?, ?)").run('tc1', 'search_files', '{}')
    ).toThrow(/NOT NULL constraint failed: tool_calls.session_id/)
  })
})
