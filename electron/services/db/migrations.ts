import type Database from 'better-sqlite3'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MigrationError } from './errors'

export interface Migration {
  version: number
  name: string
  sql: string
}

const MIGRATION_RE = /^(\d{3})_.*\.sql$/

export function readMigrations(dir: string): Migration[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return []
    throw err
  }

  const out: Migration[] = []
  const seen = new Set<number>()
  for (const name of entries) {
    const m = MIGRATION_RE.exec(name)
    if (!m) continue
    const version = Number.parseInt(m[1], 10)
    if (seen.has(version)) {
      throw new Error(`duplicate migration version ${version} (file: ${name})`)
    }
    seen.add(version)
    out.push({ version, name, sql: readFileSync(join(dir, name), 'utf8') })
  }
  out.sort((a, b) => a.version - b.version)
  return out
}

export interface AppliedSummary {
  user_version: number
  migrations_applied: string[]
}

export function listApplied(db: Database.Database, dir: string): AppliedSummary {
  const user_version = db.pragma('user_version', { simple: true }) as number
  const all = readMigrations(dir)
  const migrations_applied = all.filter((m) => m.version <= user_version).map((m) => m.name)
  return { user_version, migrations_applied }
}

/**
 * Split `sql` into individual statements, skipping empty lines and comments.
 * Each statement is executed separately so that idempotent-safe errors
 * (e.g. "duplicate column name" from ALTER TABLE ADD COLUMN when the column
 * already exists on a DB that ran an earlier migration) can be skipped.
 */
function splitSQL(sql: string): string[] {
  const stmts: string[] = []
  let buf = ''
  for (const line of sql.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('--')) continue
    buf += (buf ? '\n' : '') + line
    if (trimmed.endsWith(';')) {
      stmts.push(buf)
      buf = ''
    }
  }
  if (buf.trim()) stmts.push(buf)
  return stmts
}

function isIdempotentError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /duplicate column name/i.test(msg)
}

export function runMigrations(db: Database.Database, dir: string): Migration[] {
  const all = readMigrations(dir)
  const current = db.pragma('user_version', { simple: true }) as number
  const pending = all.filter((m) => m.version > current)
  const applied: Migration[] = []
  for (const m of pending) {
    const stmts = splitSQL(m.sql)
    const tx = db.transaction(() => {
      for (const stmt of stmts) {
        try {
          db.exec(stmt)
        } catch (err) {
          if (!isIdempotentError(err)) throw err
        }
      }
      db.pragma(`user_version = ${m.version}`)
    })
    try {
      tx()
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : String(cause)
      throw new MigrationError(m.version, `migration ${m.name} failed: ${msg}`, cause)
    }
    applied.push(m)
  }
  return applied
}
