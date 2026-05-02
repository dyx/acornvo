import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { runMigrations } from '../../../electron/services/db/migrations'
import { makeSeedGrove } from './seed'

const migrationsDir = join(__dirname, '..', '..', '..', 'electron', 'services', 'db', 'migrations')

describe('9.1 fresh grove migration', () => {
  const grove = makeSeedGrove()

  it('user_version >= 2 and files_fts exists with new schema after runMigrations on a fresh DB', () => {
    const dbPath = join(grove, '.acornvo', 'index.db')
    mkdirSync(join(grove, '.acornvo'), { recursive: true })
    const db = new Database(dbPath)
    runMigrations(db, migrationsDir)

    expect(db.pragma('user_version', { simple: true }) as number).toBeGreaterThanOrEqual(2)

    const cols = db.prepare("PRAGMA table_info('files_fts')").all() as { name: string }[]
    expect(cols.map((c) => c.name)).toEqual(['path', 'title', 'body'])
    db.close()
  })
})
