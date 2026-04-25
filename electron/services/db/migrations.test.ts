import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readMigrations } from './migrations'

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
