import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../services/db/migrations'

vi.mock('../services/db', () => ({
  dbService: { requireCurrent: vi.fn() }
}))

import { dbService } from '../services/db'
import { markThreadActive, markThreadCanceled } from './checkpoint-meta'

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../services/db/migrations')

function freshDb(): Database.Database {
  const db = new Database(':memory:')
  runMigrations(db, MIGRATIONS_DIR)
  return db
}

describe('checkpoint-meta', () => {
  let db: Database.Database

  beforeEach(() => {
    db = freshDb()
    ;(dbService.requireCurrent as ReturnType<typeof vi.fn>).mockReturnValue(db)
  })

  it('markThreadActive inserts a row with last_active_at set', () => {
    markThreadActive('t1')
    const row = db.prepare('SELECT * FROM checkpoint_meta WHERE thread_id = ?').get('t1') as {
      thread_id: string
      last_active_at: number
      canceled_at: number | null
    }
    expect(row.thread_id).toBe('t1')
    expect(row.last_active_at).toBeGreaterThan(0)
    expect(row.canceled_at).toBeNull()
  })

  it('markThreadActive clears canceled_at when re-running on a canceled thread', () => {
    markThreadCanceled('t2')
    markThreadActive('t2')
    const row = db
      .prepare('SELECT canceled_at FROM checkpoint_meta WHERE thread_id = ?')
      .get('t2') as {
      canceled_at: number | null
    }
    expect(row.canceled_at).toBeNull()
  })

  it('markThreadCanceled stamps canceled_at without clobbering last_active_at', () => {
    markThreadActive('t3')
    const beforeRow = db
      .prepare('SELECT last_active_at FROM checkpoint_meta WHERE thread_id = ?')
      .get('t3') as {
      last_active_at: number
    }
    markThreadCanceled('t3')
    const afterRow = db
      .prepare('SELECT last_active_at, canceled_at FROM checkpoint_meta WHERE thread_id = ?')
      .get('t3') as {
      last_active_at: number
      canceled_at: number | null
    }
    expect(afterRow.last_active_at).toBe(beforeRow.last_active_at)
    expect(afterRow.canceled_at).toBeGreaterThan(0)
  })
})
