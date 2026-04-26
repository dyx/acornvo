import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyPragmas, integrityCheck } from './db'

describe('applyPragmas', () => {
  let dir: string
  let db: Database.Database
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'db-prg-'))
    db = new Database(join(dir, 'test.db'))
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('sets WAL / synchronous=NORMAL / foreign_keys=ON / busy_timeout=5000 / temp_store=MEMORY', () => {
    applyPragmas(db)
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(db.pragma('synchronous', { simple: true })).toBe(1) // NORMAL = 1
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(db.pragma('busy_timeout', { simple: true })).toBe(5000)
    expect(db.pragma('temp_store', { simple: true })).toBe(2) // MEMORY = 2
    // cache_size negative = KiB; -20000 = 20 MB
    expect(db.pragma('cache_size', { simple: true })).toBe(-20000)
    // mmap_size returned in bytes
    expect(db.pragma('mmap_size', { simple: true })).toBe(268435456)
  })
})

describe('integrityCheck', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'db-ic-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns "ok" on a healthy db', () => {
    const db = new Database(join(dir, 'h.db'))
    expect(integrityCheck(db)).toBe('ok')
    db.close()
  })

  // Note: forging a corrupt-in-memory db is non-trivial. We rely on the on-disk
  // smoke check in Plan 5 (Task 8.5) for the corrupt-path coverage.
  it('returns a string for any result', () => {
    const db = new Database(join(dir, 'h2.db'))
    const result = integrityCheck(db)
    expect(typeof result).toBe('string')
    db.close()
  })
})
