import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../services/db/migrations'

vi.mock('../services/db', () => ({
  dbService: { requireCurrent: vi.fn() }
}))

import { dbService } from '../services/db'
import { sweepStaleThreads, startSweeper, stopSweeper } from './checkpointer-sweeper'

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../services/db/migrations')
const NOW = 1_700_000_000_000
const DAY_MS = 24 * 60 * 60 * 1000

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db, MIGRATIONS_DIR)
  ;(dbService.requireCurrent as ReturnType<typeof vi.fn>).mockReturnValue(db)
})

function insertThread(threadId: string, opts: { lastActive: number; canceledAt?: number | null }) {
  db.prepare(
    `INSERT INTO checkpoint_meta (thread_id, last_active_at, canceled_at) VALUES (?, ?, ?)`
  ).run(threadId, opts.lastActive, opts.canceledAt ?? null)
  db.prepare(
    `INSERT INTO checkpoints (thread_id, checkpoint_ns, checkpoint_id) VALUES (?, '', 'cp-1')`
  ).run(threadId)
  db.prepare(
    `INSERT INTO writes (thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel) VALUES (?, '', 'cp-1', 't', 0, 'c')`
  ).run(threadId)
}

describe('sweepStaleThreads', () => {
  it('deletes threads canceled more than 24h ago', () => {
    insertThread('old-canceled', { lastActive: NOW - 2 * DAY_MS, canceledAt: NOW - 2 * DAY_MS })
    insertThread('fresh-canceled', { lastActive: NOW - 1000, canceledAt: NOW - 1000 })
    insertThread('active', { lastActive: NOW - 1000 })

    const result = sweepStaleThreads(NOW)
    expect(result.removed).toEqual(['old-canceled'])

    expect(
      db.prepare("SELECT COUNT(*) AS c FROM checkpoints WHERE thread_id='old-canceled'").get()
    ).toEqual({ c: 0 })
    expect(
      db.prepare("SELECT COUNT(*) AS c FROM writes WHERE thread_id='old-canceled'").get()
    ).toEqual({ c: 0 })
    expect(
      db.prepare("SELECT COUNT(*) AS c FROM checkpoint_meta WHERE thread_id='old-canceled'").get()
    ).toEqual({ c: 0 })
    expect(
      db.prepare("SELECT COUNT(*) AS c FROM checkpoints WHERE thread_id='active'").get()
    ).toEqual({ c: 1 })
  })

  it('deletes idle threads with last_active_at older than 24h even without cancel', () => {
    insertThread('idle-stale', { lastActive: NOW - 2 * DAY_MS })
    insertThread('idle-fresh', { lastActive: NOW - 1000 })

    const result = sweepStaleThreads(NOW)
    expect(result.removed).toContain('idle-stale')
    expect(result.removed).not.toContain('idle-fresh')
  })

  it('is a no-op when no threads are stale', () => {
    insertThread('a', { lastActive: NOW - 1000 })
    const result = sweepStaleThreads(NOW)
    expect(result.removed).toEqual([])
    expect(db.prepare("SELECT COUNT(*) AS c FROM checkpoints WHERE thread_id='a'").get()).toEqual({
      c: 1
    })
  })

  it('canceled exactly at cutoff is still swept (inclusive boundary)', () => {
    insertThread('boundary', { lastActive: NOW - DAY_MS, canceledAt: NOW - DAY_MS })
    const result = sweepStaleThreads(NOW)
    expect(result.removed).toContain('boundary')
  })
})

describe('startSweeper / stopSweeper', () => {
  it('returns a stop function and clears the interval', () => {
    const stop = startSweeper(1_000_000)
    expect(typeof stop).toBe('function')
    stop()
    // Calling stop again should not throw.
    expect(() => stopSweeper()).not.toThrow()
  })
})
