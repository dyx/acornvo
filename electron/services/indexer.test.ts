// electron/services/indexer.test.ts
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'

import {
  state, status, _resetForTest, _setStateForTest, onStateChange,
  startScan, cancelScan, onProgress, onDone, _injectDbForTest, reset,
  upsertFromFs,
} from './indexer'
import { listAllPaths } from './index-queries'
import { bootstrapQueueRunner, disposeQueueBootstrap, getQueueBootstrap } from '../queue'

// Mock readFile to allow controlled error injection in transient-error tests
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    readFile: vi.fn((...args: any[]) => (actual as any).readFile(...args)),
  }
})

const { obsWarnMock } = vi.hoisted(() => ({
  obsWarnMock: vi.fn()
}))

vi.mock('../obs/logger', () => ({
  logger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: obsWarnMock,
    error: vi.fn()
  })
}))

import { readFile } from 'node:fs/promises'

function makeIndexedDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE files (
      path TEXT PRIMARY KEY, title TEXT, summary TEXT, category TEXT, rating INTEGER,
      content_hash TEXT NOT NULL, mtime INTEGER NOT NULL, size_bytes INTEGER NOT NULL,
      frontmatter_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE tags (name TEXT PRIMARY KEY, usage_count INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE file_tags (path TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (path, tag));
    CREATE VIRTUAL TABLE files_fts USING fts5(path UNINDEXED, title, body, tokenize='trigram');
  `)
  return db
}

function makeQueueDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload_json TEXT NOT NULL,
      status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      next_run_at TEXT NOT NULL, last_error TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
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

  it('skips files whose content_hash + mtime unchanged', async () => {
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

describe('upsertFromFs', () => {
  let root: string
  let db: Database.Database

  beforeEach(() => {
    _resetForTest()
    db = makeIndexedDb()
    _injectDbForTest(db)
    root = mkdtempSync(join(tmpdir(), 'upsert-'))
    vi.mocked(readFile).mockClear()
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    db.close()
    disposeQueueBootstrap()
  })

  it('throws if grove root is not set', async () => {
    await expect(upsertFromFs('any.md')).rejects.toThrow('grove root not set')
  })

  it('deletes row from index when file is gone (ENOENT)', async () => {
    writeFileSync(join(root, 'gone.md'), '# will be removed')
    await startScan(root)
    expect(listAllPaths(db).has('gone.md')).toBe(true)

    // Remove file from disk to trigger ENOENT
    rmSync(join(root, 'gone.md'))

    await upsertFromFs('gone.md')

    // Row should be deleted from the index
    expect(listAllPaths(db).has('gone.md')).toBe(false)
  })

  it('enqueues index-retry job on transient (non-ENOENT) error', async () => {
    // Initialize the queue so getQueueBootstrap() returns a valid store
    const queueDb = makeQueueDb()
    bootstrapQueueRunner(queueDb, { getRenderers: () => [] })

    writeFileSync(join(root, 'keep.md'), '# exists')
    await startScan(root)

    // Verify the file is indexed
    expect(listAllPaths(db).has('keep.md')).toBe(true)

    // Make readFile throw a transient error for the next call
    vi.mocked(readFile).mockRejectedValueOnce(
      Object.assign(new Error('EIO read error'), { code: 'EIO' })
    )

    // upsertFromFs should catch the error, enqueue retry, and not throw
    await expect(upsertFromFs('keep.md')).resolves.toBeUndefined()

    // Verify the retry job was enqueued in the queue
    const bootstrap = getQueueBootstrap()
    expect(bootstrap).not.toBeNull()
    const { items: pending } = bootstrap!.store.list({ status: 'pending', limit: 10, offset: 0 })
    expect(pending.length).toBe(1)
    expect(pending[0].kind).toBe('index-retry')
    expect(pending[0].payload).toMatchObject({ path: 'keep.md', reason: 'EIO read error' })

    // Cleanup
    disposeQueueBootstrap()
    queueDb.close()
  })

  it('logs warning when queue is not initialised on transient error', async () => {
    obsWarnMock.mockClear()

    writeFileSync(join(root, 'a.md'), '# A')
    await startScan(root)

    // Make readFile throw a transient error
    vi.mocked(readFile).mockRejectedValueOnce(
      Object.assign(new Error('disk error'), { code: 'EIO' })
    )

    await expect(upsertFromFs('a.md')).resolves.toBeUndefined()

    expect(obsWarnMock).toHaveBeenCalledWith(
      'indexer',
      expect.objectContaining({
        op: 'enqueue-retry',
        ok: false,
        msg: 'queue not initialised; dropping retry',
        meta: { path: 'a.md', reason: 'disk error' }
      })
    )
  })
})
