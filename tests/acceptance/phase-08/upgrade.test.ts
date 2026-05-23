import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { runMigrations } from '../../../electron/services/db/migrations'
import { maybeRebuildFts, rebuildEvents } from '../../../electron/services/search/rebuild'
import { makeSeedGrove } from './seed'

const migrationsDir = join(__dirname, '..', '..', '..', 'electron', 'services', 'db', 'migrations')

describe('9.2 v1 grove upgrade', () => {
  it('detects empty files_fts after upgrade and triggers full rebuild matching files COUNT', async () => {
    const grove = makeSeedGrove()
    mkdirSync(join(grove, '.acornvo'), { recursive: true })
    const dbFile = join(grove, '.acornvo', 'index.db')

    // Stage 1: simulate v1 — apply only migration 001 manually, populate files
    const v1 = new Database(dbFile)
    v1.pragma('user_version = 1')
    v1.exec(`
      CREATE TABLE files (
        path TEXT PRIMARY KEY, title TEXT, url TEXT, category TEXT, rating INTEGER,
        summary TEXT, clipped_at TEXT, reviewed_at TEXT, mtime INTEGER NOT NULL,
        content_hash TEXT, frontmatter_json TEXT
      );
      CREATE VIRTUAL TABLE files_fts USING fts5(
        path UNINDEXED, title, summary, content
      );
    `)
    const insert = v1.prepare(
      'INSERT INTO files (path, title, mtime, content_hash) VALUES (?, ?, 0, ?)'
    )
    for (const seed of [
      { p: 'notes/attention.md', t: 'attention' },
      { p: 'cn/zhuyili.md', t: '注意力机制综述' },
      { p: 'cn/zhuyili2.md', t: '注意力' }
    ])
      insert.run(seed.p, seed.t, seed.p)
    v1.close()

    // Stage 2: open with current code → migrations 002+003 runs (002 drops + recreates files_fts empty)
    const v2 = new Database(dbFile)
    runMigrations(v2, migrationsDir)
    expect(v2.pragma('user_version', { simple: true }) as number).toBeGreaterThanOrEqual(2)

    const ftsBefore = (v2.prepare('SELECT COUNT(*) AS c FROM files_fts').get() as { c: number }).c
    const filesCount = (v2.prepare('SELECT COUNT(*) AS c FROM files').get() as { c: number }).c
    expect(ftsBefore).toBe(0)
    expect(filesCount).toBe(3)

    // Stage 3: rebuild
    const events: { done: number; total: number }[] = []
    rebuildEvents.removeAllListeners()
    rebuildEvents.on('progress', (p: { done: number; total: number }) => events.push(p))

    const triggered = await maybeRebuildFts(v2, grove)
    expect(triggered).toBe(true)

    const ftsAfter = (v2.prepare('SELECT COUNT(*) AS c FROM files_fts').get() as { c: number }).c
    expect(ftsAfter).toBe(filesCount)
    expect(events.length).toBeGreaterThanOrEqual(1)
    expect(events[events.length - 1]).toEqual({ done: filesCount, total: filesCount })

    v2.close()
  })
})
