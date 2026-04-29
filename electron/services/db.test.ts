import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync, writeFileSync, readdirSync, mkdirSync, statSync } from 'node:fs'
import { dbService } from './db'
import { applyPragmas, integrityCheck, backupCorruptDb, __setMainWindowForTest, openForGrove, __resetForTest, getCurrent, closeCurrent, requireCurrent } from './db'
import { IpcError } from '@shared/ipc-contract'

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

describe('backupCorruptDb', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'db-bk-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    __setMainWindowForTest(null)
  })

  it('renames index.db + sidecars to index.db.corrupt-<ts>* and emits db:rebuilding', () => {
    // Set up a fake "db" file plus -wal / -shm sidecars
    const acorn = join(dir, '.acornvo')
    require('node:fs').mkdirSync(acorn, { recursive: true })
    writeFileSync(join(acorn, 'index.db'), 'garbage')
    writeFileSync(join(acorn, 'index.db-wal'), 'wal')
    writeFileSync(join(acorn, 'index.db-shm'), 'shm')

    const sent: Array<{ channel: string; payload?: unknown }> = []
    __setMainWindowForTest({
      webContents: { send: (channel: string, payload?: unknown) => sent.push({ channel, payload }) }
    } as unknown as { webContents: { send: (c: string, p?: unknown) => void } })

    backupCorruptDb(dir)

    const left = readdirSync(acorn)
    expect(left.some((n) => n === 'index.db')).toBe(false)
    expect(left.some((n) => /^index\.db\.corrupt-.+$/.test(n))).toBe(true)
    expect(left.some((n) => /^index\.db\.corrupt-.+-wal$/.test(n))).toBe(true)
    expect(left.some((n) => /^index\.db\.corrupt-.+-shm$/.test(n))).toBe(true)
    expect(sent.find((e) => e.channel === 'db:rebuilding')).toBeTruthy()
  })

  it('is a no-op (does not throw) when index.db does not exist', () => {
    const acorn = join(dir, '.acornvo')
    require('node:fs').mkdirSync(acorn, { recursive: true })
    expect(() => backupCorruptDb(dir)).not.toThrow()
  })
})

describe('openForGrove', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'db-open-'))
    mkdirSync(join(dir, '.acornvo'), { recursive: true })
  })
  afterEach(() => {
    __resetForTest()
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates index.db, applies pragmas, runs 001 migration', () => {
    openForGrove(dir)
    expect(existsSync(join(dir, '.acornvo', 'index.db'))).toBe(true)
    const db = getCurrent()!
    expect(db.pragma('user_version', { simple: true }) as number).toBeGreaterThanOrEqual(1)
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    // files table exists from 001_init
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='files'")
      .all()
    expect(tables.length).toBe(1)
  })

  it('closes a previous handle before opening a new one', () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'db-open2-'))
    mkdirSync(join(dir2, '.acornvo'), { recursive: true })
    try {
      openForGrove(dir)
      const first = getCurrent()!
      expect(first.open).toBe(true)
      openForGrove(dir2)
      expect(first.open).toBe(false)
      const second = getCurrent()!
      expect(second).not.toBe(first)
    } finally {
      rmSync(dir2, { recursive: true, force: true })
    }
  })
})

describe('closeCurrent', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'db-close-'))
    mkdirSync(join(dir, '.acornvo'), { recursive: true })
  })
  afterEach(() => {
    __resetForTest()
    rmSync(dir, { recursive: true, force: true })
  })

  it('is a no-op when nothing is open', () => {
    expect(() => closeCurrent()).not.toThrow()
    expect(getCurrent()).toBeNull()
  })

  it('closes current handle, truncates WAL, clears state', () => {
    openForGrove(dir)
    const db = getCurrent() as Database.Database
    expect(db.open).toBe(true)
    // create some WAL pages
    db.exec("INSERT INTO files (path, mtime) VALUES ('p', 0)")
    closeCurrent()
    expect(db.open).toBe(false)
    expect(getCurrent()).toBeNull()
    // -wal file should be 0 bytes or absent after TRUNCATE checkpoint
    const wal = join(dir, '.acornvo', 'index.db-wal')
    if (existsSync(wal)) {
      const size = statSync(wal).size
      expect(size).toBe(0)
    }
  })
})

describe('requireCurrent', () => {
  afterEach(() => __resetForTest())

  it('returns the current db when open', () => {
    const dir = mkdtempSync(join(tmpdir(), 'db-req-'))
    mkdirSync(join(dir, '.acornvo'), { recursive: true })
    try {
      openForGrove(dir)
      expect(requireCurrent()).toBe(getCurrent())
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('throws IpcError(E_NOT_FOUND) when nothing is open', () => {
    let caught: unknown
    try {
      requireCurrent()
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(IpcError)
    expect((caught as IpcError).code).toBe('E_NOT_FOUND')
  })
})

describe('dbService surface', () => {
  it('exposes the documented methods', () => {
    expect(typeof dbService.openForGrove).toBe('function')
    expect(typeof dbService.closeCurrent).toBe('function')
    expect(typeof dbService.getCurrent).toBe('function')
    expect(typeof dbService.requireCurrent).toBe('function')
    expect(typeof dbService.integrityCheck).toBe('function')
    expect(typeof dbService.getCurrentGrovePath).toBe('function')
  })
})
