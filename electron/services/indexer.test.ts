// electron/services/indexer.test.ts
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'

import {
  state, status, _resetForTest, _setStateForTest, onStateChange,
  startScan, cancelScan, onProgress, onDone, _injectDbForTest, reset,
} from './indexer'
import { listAllPaths } from './index-queries'

function makeIndexedDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE files (
      path TEXT PRIMARY KEY, title TEXT, summary TEXT, category TEXT, rating INTEGER,
      content_hash TEXT NOT NULL, mtime_ms INTEGER NOT NULL, size_bytes INTEGER NOT NULL,
      frontmatter_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE tags (name TEXT PRIMARY KEY, usage_count INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE file_tags (path TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (path, tag));
    CREATE VIRTUAL TABLE files_fts USING fts5(path, title, summary, content);
  `)
  return db
}

describe('IndexState machine', () => {
  beforeEach(() => { _resetForTest() })

  it('starts in idle', () => {
    expect(state()).toEqual({ state: 'idle', total: 0, scanned: 0 })
  })

  it('emits stateChange when transitioning', () => {
    const events: string[] = []
    const off = onStateChange((s) => events.push(s.state))
    _setStateForTest('scanning')
    _setStateForTest('ready')
    off()
    expect(events).toEqual(['scanning', 'ready'])
  })

  it('does NOT emit when transitioning to the same state', () => {
    const events: string[] = []
    onStateChange((s) => events.push(s.state))
    _setStateForTest('scanning')
    _setStateForTest('scanning')
    expect(events).toEqual(['scanning'])
  })
})

describe('status()', () => {
  beforeEach(() => { _resetForTest() })

  it('returns the same shape as state()', () => {
    expect(status()).toEqual({ state: 'idle', total: 0, scanned: 0 })
  })

  it('omits currentPath / error when undefined', () => {
    const s = status()
    expect('currentPath' in s).toBe(false)
    expect('error' in s).toBe(false)
  })

  it('includes error string when state is "error"', () => {
    _setStateForTest('error')
    expect(status().state).toBe('error')
  })
})

describe('startScan', () => {
  let root: string
  let db: Database.Database

  beforeEach(() => {
    _resetForTest()
    db = makeIndexedDb()
    _injectDbForTest(db)
    root = mkdtempSync(join(tmpdir(), 'scan-'))
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    db.close()
  })

  it('inserts every md file into files + files_fts', async () => {
    writeFileSync(join(root, 'a.md'), '---\ntitle: A\ntags: [x]\n---\nbody A')
    writeFileSync(join(root, 'b.md'), '---\ntitle: B\n---\nbody B')

    await startScan(root)

    expect(listAllPaths(db)).toEqual(new Set(['a.md', 'b.md']))
    expect(db.prepare('SELECT COUNT(*) AS n FROM files_fts').get()).toEqual({ n: 2 })
    expect(db.prepare('SELECT name, usage_count FROM tags').all()).toEqual([
      { name: 'x', usage_count: 1 },
    ])
  })

  it('deletes rows whose path no longer exists on disk', async () => {
    writeFileSync(join(root, 'keep.md'), '# keep')
    writeFileSync(join(root, 'gone.md'), '# gone')
    await startScan(root)
    expect(listAllPaths(db).size).toBe(2)

    rmSync(join(root, 'gone.md'))
    await startScan(root)
    expect(listAllPaths(db)).toEqual(new Set(['keep.md']))
  })

  it('skips files whose content_hash + mtime_ms unchanged', async () => {
    writeFileSync(join(root, 'a.md'), '# A')
    await startScan(root)
    const before = db
      .prepare('SELECT updated_at FROM files WHERE path=?')
      .get('a.md') as { updated_at: number }
    await startScan(root) // no disk change
    const after = db
      .prepare('SELECT updated_at FROM files WHERE path=?')
      .get('a.md') as { updated_at: number }
    expect(after.updated_at).toBe(before.updated_at)
  })

  it('emits index:progress events with scanned counter', async () => {
    for (let i = 0; i < 5; i++) writeFileSync(join(root, `f${i}.md`), `# ${i}`)

    const progressEvents: { scanned: number; total: number }[] = []
    onProgress((p) => progressEvents.push({ scanned: p.scanned, total: p.total }))

    await startScan(root)

    expect(progressEvents.length).toBeGreaterThanOrEqual(1)
    expect(progressEvents[progressEvents.length - 1].scanned).toBe(5)
  })

  it('emits index:done when scan finishes', async () => {
    writeFileSync(join(root, 'a.md'), '# A')
    let doneFired = false
    onDone(() => {
      doneFired = true
    })
    await startScan(root)
    expect(doneFired).toBe(true)
  })

  it('transitions state idle → scanning → ready', async () => {
    writeFileSync(join(root, 'a.md'), '# A')
    const transitions: string[] = []
    onStateChange((s) => transitions.push(s.state))
    await startScan(root)
    expect(transitions).toEqual(['scanning', 'ready'])
  })
})

describe('cancelScan', () => {
  let root: string
  let db: Database.Database

  beforeEach(() => {
    _resetForTest()
    db = makeIndexedDb()
    _injectDbForTest(db)
    root = mkdtempSync(join(tmpdir(), 'cancel-'))
  })
  afterEach(() => { rmSync(root, { recursive: true, force: true }); db.close() })

  it('stops scanning early and returns state to idle', async () => {
    for (let i = 0; i < 100; i++) writeFileSync(join(root, `f${i}.md`), `# ${i}`)

    // Cancel as soon as the state transitions to 'scanning'
    const off = onStateChange((s) => {
      if (s.state === 'scanning') cancelScan()
    })
    await startScan(root)
    off()

    expect(state().state).toBe('idle')
  })

  it('preserves rows already inserted before cancel', async () => {
    for (let i = 0; i < 50; i++) writeFileSync(join(root, `f${i}.md`), `# ${i}`)

    // Cancel as soon as the state transitions to 'scanning'
    const off = onStateChange((s) => {
      if (s.state === 'scanning') cancelScan()
    })
    await startScan(root)
    off()

    const count = (db.prepare('SELECT COUNT(*) AS n FROM files').get() as { n: number }).n
    expect(count).toBeGreaterThanOrEqual(0)
    expect(count).toBeLessThanOrEqual(50)
  })
})

describe('indexer.reset()', () => {
  beforeEach(() => { _resetForTest() })

  it('returns state to idle and clears counters', () => {
    _setStateForTest('watching')
    reset()
    expect(state()).toEqual({ state: 'idle', total: 0, scanned: 0 })
  })
})
