import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { runMigrations } from '../db/migrations'
import { maybeRebuildFts, rebuildFts, rebuildEvents, type RebuildProgressPayload } from './rebuild'

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

describe('rebuildFts progress events', () => {
  let db: Database.Database
  let grove: string

  beforeEach(() => {
    db = makeFreshDb()
    grove = makeGrove()
    rebuildEvents.removeAllListeners()
  })

  it('emits progress at most once per 5% step (250-row corpus)', async () => {
    // Seed 250 files in one transaction
    const insert = db.prepare(
      'INSERT INTO files (path, title, mtime, content_hash) VALUES (?, ?, ?, ?)'
    )
    for (let i = 0; i < 250; i++) {
      const rel = `notes/n${i}.md`
      mkdirSync(join(grove, 'notes'), { recursive: true })
      writeFileSync(join(grove, rel), `---\ntitle: T${i}\n---\nbody ${i}`, 'utf8')
      insert.run(rel, `T${i}`, 0, `h${i}`)
    }

    const events: RebuildProgressPayload[] = []
    rebuildEvents.on('progress', (p: RebuildProgressPayload) => events.push(p))

    await rebuildFts(db, grove)

    // 250 rows / 100-batch cadence → 3 batches → 3 events. With 5% threshold (12.5 rows),
    // the cadence is dominated by BATCH_SIZE here, so we expect exactly 3 progress events.
    expect(events.length).toBeGreaterThanOrEqual(3)
    expect(events.length).toBeLessThanOrEqual(20) // way below 250 — proves cadence not per-row
    expect(events[events.length - 1]).toEqual({ done: 250, total: 250 })
  })

  it('emits done event with total at the end', async () => {
    mkdirSync(join(grove, 'notes'), { recursive: true })
    writeFileSync(join(grove, 'notes', 'a.md'), 'body a', 'utf8')
    db.prepare('INSERT INTO files (path, mtime, content_hash) VALUES (?, ?, ?)').run('notes/a.md', 0, 'h')

    const doneEvents: { total: number }[] = []
    rebuildEvents.on('done', (p: { total: number }) => doneEvents.push(p))

    await rebuildFts(db, grove)

    expect(doneEvents).toEqual([{ total: 1 }])
  })
})
