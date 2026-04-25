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

export function runMigrations(db: Database.Database, dir: string): Migration[] {
  const all = readMigrations(dir)
  const current = db.pragma('user_version', { simple: true }) as number
  const pending = all.filter((m) => m.version > current)
  const applied: Migration[] = []
  for (const m of pending) {
    const tx = db.transaction(() => {
      db.exec(m.sql)
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
