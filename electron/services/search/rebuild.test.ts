import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { runMigrations } from '../db/migrations'
import { maybeRebuildFts } from './rebuild'

const migrationsDir = join(__dirname, '..', 'db', 'migrations')

function makeFreshDb(): Database.Database {
  const db = new Database(':memory:')
  runMigrations(db, migrationsDir)
  return db
}

function makeGrove(): string {
  return mkdtempSync(join(tmpdir(), 'acornvo-rebuild-'))
}

describe('maybeRebuildFts (detector)', () => {
  let db: Database.Database
  let grove: string

  beforeEach(() => {
    db = makeFreshDb()
    grove = makeGrove()
  })

  it('skips when files is empty', async () => {
    await maybeRebuildFts(db, grove)
    const ftsCount = db.prepare('SELECT COUNT(*) AS c FROM files_fts').get() as { c: number }
    expect(ftsCount.c).toBe(0)
  })

  it('skips when files_fts already has rows (partial state)', async () => {
    // Simulate a partially-populated FTS (mid-rebuild crash recovery scenario)
    db.prepare(
      'INSERT INTO files (path, mtime, content_hash) VALUES (?, ?, ?)'
    ).run('a.md', 0, 'h1')
    db.prepare(
      'INSERT INTO files_fts(rowid, path, title, body) VALUES (?, ?, ?, ?)'
    ).run(1, 'a.md', 'A', 'partial body')

    await maybeRebuildFts(db, grove)

    const row = db.prepare('SELECT body FROM files_fts WHERE rowid=1').get() as { body: string }
    expect(row.body).toBe('partial body') // not overwritten
  })

  it('rebuilds when files has rows but files_fts is empty', async () => {
    // Write a real file so file.read in rebuild can pick it up
    mkdirSync(join(grove, 'notes'), { recursive: true })
    writeFileSync(
      join(grove, 'notes', 'x.md'),
      '---\ntitle: X\n---\n\n注意力机制研究',
      'utf8'
    )

    db.prepare(
      'INSERT INTO files (path, title, mtime, content_hash) VALUES (?, ?, ?, ?)'
    ).run('notes/x.md', 'X', 0, 'h1')

    await maybeRebuildFts(db, grove)

    const ftsCount = db.prepare('SELECT COUNT(*) AS c FROM files_fts').get() as { c: number }
    expect(ftsCount.c).toBe(1)

    const hit = db.prepare(
      "SELECT path FROM files_fts WHERE files_fts MATCH '注意力'"
    ).get() as { path: string } | undefined
    expect(hit?.path).toBe('notes/x.md')
  })
})
