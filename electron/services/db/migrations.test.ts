import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { readMigrations, runMigrations, listApplied } from './migrations'
import { MigrationError } from './errors'

describe('readMigrations', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mig-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns [] for an empty directory', () => {
    expect(readMigrations(dir)).toEqual([])
  })

  it('parses NNN_*.sql files and sorts by NNN ascending', () => {
    writeFileSync(join(dir, '002_add_col.sql'), '-- two\nSELECT 2;')
    writeFileSync(join(dir, '001_init.sql'), '-- one\nSELECT 1;')
    writeFileSync(join(dir, '010_late.sql'), 'SELECT 10;')
    const got = readMigrations(dir)
    expect(got.map((m) => m.version)).toEqual([1, 2, 10])
    expect(got.map((m) => m.name)).toEqual(['001_init.sql', '002_add_col.sql', '010_late.sql'])
    expect(got[0].sql).toContain('SELECT 1')
  })

  it('ignores files that do not match NNN_*.sql', () => {
    writeFileSync(join(dir, '001_ok.sql'), '-- ok')
    writeFileSync(join(dir, 'README.md'), 'docs')
    writeFileSync(join(dir, '1_short.sql'), '-- bad prefix')
    writeFileSync(join(dir, 'abc_init.sql'), '-- not numeric')
    const got = readMigrations(dir)
    expect(got.map((m) => m.name)).toEqual(['001_ok.sql'])
  })

  it('throws if two files share the same NNN', () => {
    writeFileSync(join(dir, '001_a.sql'), '-- a')
    writeFileSync(join(dir, '001_b.sql'), '-- b')
    expect(() => readMigrations(dir)).toThrow(/duplicate migration version/i)
  })
})

describe('runMigrations', () => {
  let dir: string
  let db: Database.Database
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mig-run-'))
    db = new Database(':memory:')
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('runs all migrations on a fresh db (user_version=0)', () => {
    writeFileSync(join(dir, '001_init.sql'), 'CREATE TABLE a (x INTEGER);')
    writeFileSync(join(dir, '002_more.sql'), 'CREATE TABLE b (y INTEGER);')
    runMigrations(db, dir)
    expect(db.pragma('user_version', { simple: true })).toBe(2)
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>
    expect(tables.map((t) => t.name)).toEqual(['a', 'b'])
  })

  it('runs only the migrations greater than current user_version', () => {
    writeFileSync(join(dir, '001_init.sql'), 'CREATE TABLE a (x INTEGER);')
    writeFileSync(join(dir, '002_more.sql'), 'CREATE TABLE b (y INTEGER);')
    db.exec('CREATE TABLE a (x INTEGER);')
    db.pragma('user_version = 1')
    runMigrations(db, dir)
    expect(db.pragma('user_version', { simple: true })).toBe(2)
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>
    expect(tables.map((t) => t.name)).toEqual(['a', 'b'])
  })

  it('is a no-op when user_version is already at the latest', () => {
    writeFileSync(join(dir, '001_init.sql'), 'CREATE TABLE a (x INTEGER);')
    db.exec('CREATE TABLE a (x INTEGER);')
    db.pragma('user_version = 1')
    runMigrations(db, dir)
    expect(db.pragma('user_version', { simple: true })).toBe(1)
  })
})


describe('runMigrations error handling', () => {
  let dir: string
  let db: Database.Database
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mig-err-'))
    db = new Database(':memory:')
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('throws MigrationError with version + cause and rolls back user_version', () => {
    writeFileSync(join(dir, '001_init.sql'), 'CREATE TABLE a (x INTEGER);')
    writeFileSync(join(dir, '002_bad.sql'), 'CREATE TABLE a (x INTEGER); -- duplicate, should fail')
    let caught: unknown
    try {
      runMigrations(db, dir)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(MigrationError)
    const e = caught as MigrationError
    expect(e.version).toBe(2)
    expect(e.cause).toBeInstanceOf(Error)
    // user_version stays at 1 because tx 002 rolled back
    expect(db.pragma('user_version', { simple: true })).toBe(1)
  })
})

describe('migration 003 ops_log', () => {
  let dir: string
  let db: Database.Database
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mig-003-'))
    db = new Database(':memory:')
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('create ops_log table with correct columns', () => {
    writeFileSync(join(dir, '001_init.sql'), 'CREATE TABLE t1(x INTEGER);')
    writeFileSync(join(dir, '002_fts.sql'), 'CREATE TABLE t2(x INTEGER);')
    writeFileSync(join(dir, '003_ops_log.sql'), `
      CREATE TABLE ops_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        op TEXT NOT NULL,
        path TEXT NOT NULL,
        ts TEXT NOT NULL,
        meta_json TEXT
      );
      CREATE INDEX idx_ops_log_ts ON ops_log(ts DESC);
      CREATE INDEX idx_ops_log_op_ts ON ops_log(op, ts DESC);
      PRAGMA user_version = 3;
    `)
    db.pragma('user_version = 0')
    runMigrations(db, dir)
    const status = db.pragma('user_version', { simple: true }) as number
    expect(status).toBeGreaterThanOrEqual(3)
    const tbl = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ops_log'")
      .get() as { name: string } | undefined
    expect(tbl?.name).toBe('ops_log')
    const cols = db.prepare(`PRAGMA table_info(ops_log)`).all() as Array<{
      name: string
      type: string
      notnull: number
    }>
    const byName = new Map(cols.map((c) => [c.name, c]))
    expect(byName.get('id')?.type).toBe('INTEGER')
    expect(byName.get('op')?.type).toBe('TEXT')
    expect(byName.get('op')?.notnull).toBe(1)
    expect(byName.get('path')?.type).toBe('TEXT')
    expect(byName.get('path')?.notnull).toBe(1)
    expect(byName.get('ts')?.type).toBe('TEXT')
    expect(byName.get('ts')?.notnull).toBe(1)
    expect(byName.get('meta_json')?.type).toBe('TEXT')
  })

  it('creates idx_ops_log_ts and idx_ops_log_op_ts', () => {
    writeFileSync(join(dir, '001_init.sql'), 'CREATE TABLE t1(x INTEGER);')
    writeFileSync(join(dir, '002_fts.sql'), 'CREATE TABLE t2(x INTEGER);')
    writeFileSync(join(dir, '003_ops_log.sql'), `
      CREATE TABLE ops_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        op TEXT NOT NULL,
        path TEXT NOT NULL,
        ts TEXT NOT NULL,
        meta_json TEXT
      );
      CREATE INDEX idx_ops_log_ts ON ops_log(ts DESC);
      CREATE INDEX idx_ops_log_op_ts ON ops_log(op, ts DESC);
      PRAGMA user_version = 3;
    `)
    db.pragma('user_version = 0')
    runMigrations(db, dir)
    const idx = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='ops_log'`)
      .all() as Array<{ name: string }>
    const names = new Set(idx.map((i) => i.name))
    expect(names.has('idx_ops_log_ts')).toBe(true)
    expect(names.has('idx_ops_log_op_ts')).toBe(true)
  })
})

describe('listApplied', () => {
  let dir: string
  let db: Database.Database
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mig-list-'))
    db = new Database(':memory:')
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns user_version 0 and [] when nothing applied', () => {
    writeFileSync(join(dir, '001_init.sql'), 'CREATE TABLE a (x);')
    expect(listApplied(db, dir)).toEqual({ user_version: 0, migrations_applied: [] })
  })

  it('returns user_version + names of files with version <= current', () => {
    writeFileSync(join(dir, '001_init.sql'), 'CREATE TABLE a (x);')
    writeFileSync(join(dir, '002_more.sql'), 'CREATE TABLE b (y);')
    writeFileSync(join(dir, '003_future.sql'), 'CREATE TABLE c (z);')
    runMigrations(db, dir)
    db.pragma('user_version = 2') // simulate "we only got to 2"
    expect(listApplied(db, dir)).toEqual({
      user_version: 2,
      migrations_applied: ['001_init.sql', '002_more.sql']
    })
  })
})
