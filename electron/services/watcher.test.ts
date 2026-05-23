// electron/services/watcher.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import Database from 'better-sqlite3'
import {
  registerSelfWrite,
  shouldIgnore,
  _resetSelfWritesForTest,
  _gcSelfWrites,
  _selfWritesSizeForTest,
  start,
  stop,
  onFileChanged,
  onFileDeleted,
  onFileRenamed,
  _simulateWatcherErrorForTest
} from './watcher'
import { upsertFile } from './index-queries'
import { _setStateForTest as _indexerSetState, state as indexerState } from './indexer'
import * as opsLog from './ops/log'
import * as dbSvc from './db'

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

function waitFor(predicate: () => boolean, timeoutMs = 5000, intervalMs = 50): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const id = setInterval(() => {
      if (predicate()) {
        clearInterval(id)
        resolve()
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(id)
        reject(new Error('timeout'))
      }
    }, intervalMs)
  })
}

describe('selfWrites map', () => {
  beforeEach(() => {
    _resetSelfWritesForTest()
  })

  it('returns false when path was never registered', () => {
    expect(shouldIgnore('/some/path.md', 1000)).toBe(false)
  })

  it('returns true when path was registered with matching mtime', () => {
    registerSelfWrite('/some/path.md', 1000)
    expect(shouldIgnore('/some/path.md', 1000)).toBe(true)
  })

  it('tolerates ±50ms mtime drift', () => {
    // +49ms — within tolerance
    registerSelfWrite('/p.md', 1000)
    expect(shouldIgnore('/p.md', 1049)).toBe(true)

    // -49ms — within tolerance (re-register because shouldIgnore is one-shot)
    registerSelfWrite('/p.md', 1000)
    expect(shouldIgnore('/p.md', 951)).toBe(true)

    // +51ms — outside tolerance
    registerSelfWrite('/p.md', 1000)
    expect(shouldIgnore('/p.md', 1051)).toBe(false)
  })

  it('removes the entry after a successful match (one-shot)', () => {
    registerSelfWrite('/p.md', 1000)
    expect(shouldIgnore('/p.md', 1000)).toBe(true)
    expect(shouldIgnore('/p.md', 1000)).toBe(false) // already consumed
  })

  it('expires entries after 3s TTL', () => {
    const now = Date.now()
    registerSelfWrite('/p.md', 1000, now)
    expect(shouldIgnore('/p.md', 1000, now + 2999)).toBe(true)
    registerSelfWrite('/p.md', 1000, now)
    expect(shouldIgnore('/p.md', 1000, now + 3001)).toBe(false)
  })
})

describe('selfWrites GC', () => {
  beforeEach(() => {
    _resetSelfWritesForTest()
  })

  it('removes entries past their expiresAt', () => {
    const now = Date.now()
    registerSelfWrite('/a.md', 1, now - 4000) // already expired
    registerSelfWrite('/b.md', 1, now) // fresh
    expect(_selfWritesSizeForTest()).toBe(2)
    _gcSelfWrites(now)
    expect(_selfWritesSizeForTest()).toBe(1)
  })
})

describe('watcher start/stop', () => {
  let root: string
  let db: Database.Database

  beforeEach(() => {
    _resetSelfWritesForTest()
    db = makeIndexedDb()
    root = mkdtempSync(join(tmpdir(), 'watch-'))
  })
  afterEach(async () => {
    await stop()
    rmSync(root, { recursive: true, force: true })
    db.close()
  })

  it('ignores dotfile dirs (.git, .acornvo, .obsidian)', async () => {
    mkdirSync(join(root, '.git'))
    await start(root, db)
    writeFileSync(join(root, '.git', 'HEAD'), 'x')
    await new Promise((r) => setTimeout(r, 800))
    expect((db.prepare('SELECT COUNT(*) AS n FROM files').get() as { n: number }).n).toBe(0)
  })

  it('ignores non-.md files', async () => {
    await start(root, db)
    writeFileSync(join(root, 'note.txt'), 'plain')
    await new Promise((r) => setTimeout(r, 800))
    expect((db.prepare('SELECT COUNT(*) AS n FROM files').get() as { n: number }).n).toBe(0)
  })
})

describe('watcher batching', () => {
  let root: string
  let db: Database.Database

  beforeEach(() => {
    _resetSelfWritesForTest()
    db = makeIndexedDb()
    root = mkdtempSync(join(tmpdir(), 'batch-'))
  })
  afterEach(async () => {
    await stop()
    rmSync(root, { recursive: true, force: true })
    db.close()
  })

  it('inserts a single new md file after debounce', async () => {
    await start(root, db)
    writeFileSync(join(root, 'a.md'), '---\ntitle: A\n---\nbody')
    await waitFor(
      () => (db.prepare('SELECT COUNT(*) AS n FROM files').get() as { n: number }).n === 1
    )
    expect(db.prepare('SELECT path, title FROM files').get()).toEqual({ path: 'a.md', title: 'A' })
  })

  it('coalesces rapid changes to the same file into one upsert', async () => {
    await start(root, db)
    writeFileSync(join(root, 'a.md'), 'v1')
    writeFileSync(join(root, 'a.md'), 'v2')
    writeFileSync(join(root, 'a.md'), 'v3')
    await waitFor(
      () => (db.prepare('SELECT COUNT(*) AS n FROM files').get() as { n: number }).n === 1
    )
    const row = db.prepare('SELECT content_hash FROM files WHERE path=?').get('a.md') as {
      content_hash: string
    }
    const expected = createHash('sha256').update('v3').digest('hex')
    expect(row.content_hash).toBe(expected)
  })
})

describe('watcher transactional flush + rename', () => {
  let root: string
  let db: Database.Database

  beforeEach(() => {
    _resetSelfWritesForTest()
    db = makeIndexedDb()
    root = mkdtempSync(join(tmpdir(), 'rename-'))
  })
  afterEach(async () => {
    await stop()
    rmSync(root, { recursive: true, force: true })
    db.close()
  })

  it('detects rename when unlink + add of same content_hash within window', async () => {
    writeFileSync(join(root, 'old.md'), 'same body')
    await start(root, db)
    upsertFile(db, {
      path: 'old.md',
      title: null,
      summary: null,
      category: null,
      rating: null,
      content_hash: createHash('sha256').update('same body').digest('hex'),
      mtime: 1,
      size_bytes: 9,
      frontmatter_json: '{}',
      created_at: 1,
      updated_at: 1
    })

    rmSync(join(root, 'old.md'))
    writeFileSync(join(root, 'new.md'), 'same body')

    await waitFor(() => {
      const row = db.prepare('SELECT path FROM files').get() as { path: string } | undefined
      return row?.path === 'new.md'
    }, 3000)

    expect((db.prepare('SELECT COUNT(*) AS n FROM files').get() as { n: number }).n).toBe(1)
  })

  it('processes unlink + add of distinct content as delete + insert', async () => {
    writeFileSync(join(root, 'a.md'), 'A body')
    await start(root, db)
    upsertFile(db, {
      path: 'a.md',
      title: null,
      summary: null,
      category: null,
      rating: null,
      content_hash: createHash('sha256').update('A body').digest('hex'),
      mtime: 1,
      size_bytes: 6,
      frontmatter_json: '{}',
      created_at: 1,
      updated_at: 1
    })
    rmSync(join(root, 'a.md'))
    writeFileSync(join(root, 'b.md'), 'totally different')

    await waitFor(() => {
      const paths = (db.prepare('SELECT path FROM files').all() as { path: string }[])
        .map((r) => r.path)
        .sort()
      return paths.length === 1 && paths[0] === 'b.md'
    }, 3000)
  })
})

describe('watcher emits aggregate events', () => {
  let root: string
  let db: Database.Database
  beforeEach(() => {
    _resetSelfWritesForTest()
    db = makeIndexedDb()
    root = mkdtempSync(join(tmpdir(), 'evt-'))
  })
  afterEach(async () => {
    await stop()
    rmSync(root, { recursive: true, force: true })
    db.close()
  })

  it('emits index:fileChanged on new file', async () => {
    const events: { path: string }[] = []
    onFileChanged((p) => events.push(p))
    await start(root, db)
    writeFileSync(join(root, 'a.md'), '---\ntitle: A\n---\nbody')
    await waitFor(() => events.length > 0)
    expect(events[0].path).toBe('a.md')
  })

  it('emits index:fileDeleted on unlink', async () => {
    writeFileSync(join(root, 'a.md'), 'body')
    await start(root, db)
    upsertFile(db, {
      path: 'a.md',
      title: null,
      summary: null,
      category: null,
      rating: null,
      content_hash: 'h',
      mtime: 1,
      size_bytes: 4,
      frontmatter_json: '{}',
      created_at: 1,
      updated_at: 1
    })
    const events: { path: string }[] = []
    onFileDeleted((p) => events.push(p))
    rmSync(join(root, 'a.md'))
    await waitFor(() => events.length > 0)
    expect(events[0]).toEqual({ path: 'a.md' })
  })

  it('emits index:fileRenamed on rename detection', async () => {
    writeFileSync(join(root, 'old.md'), 'same body')
    await start(root, db)
    upsertFile(db, {
      path: 'old.md',
      title: null,
      summary: null,
      category: null,
      rating: null,
      content_hash: createHash('sha256').update('same body').digest('hex'),
      mtime: 1,
      size_bytes: 9,
      frontmatter_json: '{}',
      created_at: 1,
      updated_at: 1
    })
    const events: { oldPath: string; newPath: string }[] = []
    onFileRenamed((p) => events.push(p))
    rmSync(join(root, 'old.md'))
    writeFileSync(join(root, 'new.md'), 'same body')
    await waitFor(() => events.length > 0)
    expect(events[0]).toEqual({ oldPath: 'old.md', newPath: 'new.md' })
  })
})

describe('watcher restart logic', () => {
  let root: string
  let db: Database.Database
  beforeEach(() => {
    _resetSelfWritesForTest()
    _indexerSetState('idle')
    db = makeIndexedDb()
    root = mkdtempSync(join(tmpdir(), 'err-'))
  })
  afterEach(async () => {
    await stop()
    rmSync(root, { recursive: true, force: true })
    db.close()
  })

  it('flips IndexState to error after 3 failed restarts', async () => {
    await start(root, db)
    await _simulateWatcherErrorForTest({ failRestarts: 3, intervalMs: 1 })
    expect(indexerState().state).toBe('error')
  })

  it('returns to watching when a restart succeeds', async () => {
    await start(root, db)
    await _simulateWatcherErrorForTest({ failRestarts: 0, intervalMs: 1 })
    expect(indexerState().state).not.toBe('error')
  })
})

describe('watcher rename -> ops_log (phase-10 2.6)', () => {
  let root: string
  let db: Database.Database

  beforeEach(() => {
    _resetSelfWritesForTest()
    db = makeIndexedDb()
    vi.spyOn(dbSvc, 'getCurrent').mockReturnValue(db)
    root = mkdtempSync(join(tmpdir(), 'opslog-'))
  })
  afterEach(async () => {
    await stop()
    vi.restoreAllMocks()
    rmSync(root, { recursive: true, force: true })
    db.close()
  })

  it('records op=rename with old path + meta.new_path when rename detected', async () => {
    const recordSpy = vi.spyOn(opsLog, 'record')
    const expectedHash = createHash('sha256').update('same body').digest('hex')

    writeFileSync(join(root, 'a.md'), 'same body')
    await start(root, db)
    upsertFile(db, {
      path: 'a.md',
      title: null,
      summary: null,
      category: null,
      rating: null,
      content_hash: expectedHash,
      mtime: 1,
      size_bytes: 9,
      frontmatter_json: '{}',
      created_at: 1,
      updated_at: 1
    })

    rmSync(join(root, 'a.md'))
    writeFileSync(join(root, 'b.md'), 'same body')

    await waitFor(() => {
      const row = db.prepare('SELECT path FROM files').get() as { path: string } | undefined
      return row?.path === 'b.md'
    }, 3000)

    expect(recordSpy).toHaveBeenCalledWith({
      op: 'rename',
      path: 'a.md',
      meta: { new_path: 'b.md' }
    })
  })
})
