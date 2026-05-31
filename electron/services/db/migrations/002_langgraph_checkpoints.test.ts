import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../migrations'

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url))

function setup(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db, MIGRATIONS_DIR)
  return db
}

function tableNames(db: Database.Database): string[] {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
      name: string
    }[]
  ).map((r) => r.name)
}

function columns(db: Database.Database, table: string): string[] {
  return (db.pragma(`table_info('${table}')`) as { name: string }[]).map((c) => c.name)
}

describe('002_langgraph_checkpoints', () => {
  it('bumps user_version to >= 2', () => {
    const db = setup()
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(2)
  })

  it('creates checkpoints, writes, checkpoint_meta tables', () => {
    const db = setup()
    const names = tableNames(db)
    expect(names).toEqual(expect.arrayContaining(['checkpoints', 'writes', 'checkpoint_meta']))
  })

  it('preserves existing session tables', () => {
    const db = setup()
    const names = tableNames(db)
    expect(names).toEqual(expect.arrayContaining(['sessions', 'session_messages', 'tool_calls']))
  })

  it('checkpoints has thread_id / checkpoint_ns / checkpoint_id / metadata / checkpoint columns', () => {
    const db = setup()
    expect(columns(db, 'checkpoints')).toEqual(
      expect.arrayContaining([
        'thread_id',
        'checkpoint_ns',
        'checkpoint_id',
        'parent_checkpoint_id',
        'type',
        'checkpoint',
        'metadata'
      ])
    )
  })

  it('writes has thread_id / task_id / idx / channel / value columns', () => {
    const db = setup()
    expect(columns(db, 'writes')).toEqual(
      expect.arrayContaining([
        'thread_id',
        'checkpoint_ns',
        'checkpoint_id',
        'task_id',
        'idx',
        'channel',
        'type',
        'value'
      ])
    )
  })

  it('checkpoint_meta tracks last_active_at and canceled_at', () => {
    const db = setup()
    expect(columns(db, 'checkpoint_meta')).toEqual(
      expect.arrayContaining(['thread_id', 'last_active_at', 'canceled_at'])
    )
  })

  it('is idempotent when re-run', () => {
    const db = setup()
    expect(() => runMigrations(db, MIGRATIONS_DIR)).not.toThrow()
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(2)
  })

  it('coexists with SqliteSaver bootstrap (CREATE IF NOT EXISTS)', () => {
    const db = setup()
    // Simulate library re-running its own bootstrap; the IF NOT EXISTS guard
    // must keep the migrated columns intact.
    db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        checkpoint_id TEXT NOT NULL,
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
      );
    `)
    expect(columns(db, 'checkpoints')).toContain('metadata')
  })
})
