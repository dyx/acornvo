import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../db/migrations'
import { migrationsDir } from '../db/migrations/index'
import * as dbSvc from '../db'
import * as opsLog from './log'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db, migrationsDir())
  vi.spyOn(dbSvc, 'getCurrent').mockReturnValue(db)
})

afterEach(() => {
  vi.restoreAllMocks()
  db.close()
})

describe('opsLog.record', () => {
  it('inserts a row with op/path/ts/meta_json=null when meta omitted', () => {
    opsLog.record({ op: 'trash', path: 'notes/a.md' })
    const row = db.prepare('SELECT op, path, ts, meta_json FROM ops_log').get() as {
      op: string
      path: string
      ts: string
      meta_json: string | null
    }
    expect(row.op).toBe('trash')
    expect(row.path).toBe('notes/a.md')
    expect(row.meta_json).toBeNull()
    // ts is ISO-8601
    expect(() => new Date(row.ts).toISOString()).not.toThrow()
    expect(row.ts).toBe(new Date(row.ts).toISOString())
  })

  it('serialises meta to JSON string', () => {
    opsLog.record({
      op: 'conflict_resolve',
      path: 'notes/a.md',
      meta: { id: 'c1', resolved_by: 'save_as', winner_path: 'notes/a.copy.md' }
    })
    const row = db.prepare('SELECT meta_json FROM ops_log').get() as {
      meta_json: string
    }
    const parsed = JSON.parse(row.meta_json)
    expect(parsed.id).toBe('c1')
    expect(parsed.resolved_by).toBe('save_as')
    expect(parsed.winner_path).toBe('notes/a.copy.md')
  })

  it('stores rename meta with new_path', () => {
    opsLog.record({
      op: 'rename',
      path: 'old/a.md',
      meta: { new_path: 'new/a.md' }
    })
    const row = db.prepare('SELECT op, path, meta_json FROM ops_log').get() as {
      op: string
      path: string
      meta_json: string
    }
    expect(row.op).toBe('rename')
    expect(row.path).toBe('old/a.md')
    expect(JSON.parse(row.meta_json).new_path).toBe('new/a.md')
  })

  it('returns without throwing when getCurrent returns null', () => {
    vi.spyOn(dbSvc, 'getCurrent').mockReturnValue(null)
    expect(() => opsLog.record({ op: 'trash', path: 'notes/a.md' })).not.toThrow()
  })
})

describe('opsLog.list null-db guard', () => {
  it('returns empty result when getCurrent returns null', () => {
    vi.spyOn(dbSvc, 'getCurrent').mockReturnValue(null)
    const result = opsLog.list({ limit: 10, offset: 0 })
    expect(result).toEqual({ items: [], total: 0 })
  })
})
