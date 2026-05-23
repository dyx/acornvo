# Phase 05 — Indexer & Watcher: Plan 3 (Chokidar wiring + flush + phase-04 integration)

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-05-indexer-watcher`
> **Task range:** OpenSpec tasks `4.3`–`5.2` (8 tasks)
> **Plan order:** 3 of 5. Depends on Plans 1 & 2.
> **Status:** Not started
> **Created:** 2026-04-26

---

## Goal

Wire chokidar into `electron/services/watcher.ts`: configure ignore patterns, debounce events into a single transactional flush, detect renames inside the 500ms window, emit aggregate events (`index:fileChanged` / `:fileDeleted` / `:fileRenamed`), implement watcher restart-on-error, and wire phase-04 `file.write` / `file.rename` to register self-writes.

## Architecture

- **Single-flush model:** chokidar fires raw `add` / `change` / `unlink` per file. The watcher's `flush()` runs at most every 500ms (debounce) and applies _all_ pending events in **one** SQLite transaction — keeps `git pull`-of-100-files at ~1 transaction.
- **Rename detection** lives entirely in `flush()`: process `unlink`s first, capture `(deletedPath → contentHash)`. Then for each `add`/`change`, compute fresh `sha256(body)`. If a deleted path had the same hash, treat as rename (`renameFile(...)` instead of delete+insert) and emit `index:fileRenamed`.
- **Self-write filter** (built in Plan 2): every event handler calls `shouldIgnore(absPath, mtimeMs)` before queuing. Hits are silently dropped — the indexer already wrote the row in the application's own write path.
- **Error → restart loop**: chokidar's `'error'` event triggers up to 3 restarts (`watcher.close()` then `start()`), each separated by 2s. Failure flips IndexState to `'error'`.
- **Phase-04 hand-off** (Tasks 5.1, 5.2): when the app's own `file.write(rel, body)` succeeds, the IPC handler calls `registerSelfWrite(abs, freshMtimeMs)` after the atomic rename completes. For `file.rename(old, new)`, register both `oldAbs` (so the `unlink` from chokidar is suppressed) **and** `newAbs` (so the `add` is suppressed).

## Tech Stack

- `chokidar` (installed in Plan 1)
- `node:fs/promises` for hash + stat re-reads on flush
- `events.EventEmitter` for downstream `index:fileChanged` / `:fileDeleted` / `:fileRenamed`

## Files Touched (this plan)

| Path                                | Action                                                                 | Owner task |
| ----------------------------------- | ---------------------------------------------------------------------- | ---------- |
| `electron/services/watcher.ts`      | Modify (chokidar `start/stop`, batch+flush, rename detection, restart) | 4.3–4.8    |
| `electron/services/watcher.test.ts` | Modify (integration tests against real chokidar in tmp dir)            | 4.3–4.8    |
| `electron/services/file.ts`         | Modify (hook `registerSelfWrite` into `write` / `rename`)              | 5.1, 5.2   |
| `electron/services/file.test.ts`    | Modify (verify self-write registration after write/rename)             | 5.1, 5.2   |

## Pre-flight

This plan assumes phase-04's `electron/services/file.ts` exposes:

```ts
export async function write(rel: string, content: string, opts?: WriteOptions): Promise<void>
export async function rename(oldRel: string, newRel: string): Promise<void>
```

…and that both call `safeResolve(getCurrentRoot(), rel)` to produce the absolute path. If the actual API differs, adapt the import / call shape but **do not** change the contract: a successful write/rename MUST end with a `registerSelfWrite()` call.

---

## Tasks

<!-- openspec-task: 4.3 -->

### Task 1: `start(groveRoot)` — chokidar config + handler registration

**Files:**

- Modify: `electron/services/watcher.ts`
- Modify: `electron/services/watcher.test.ts`

- [ ] **Step 1: Write the failing test (chokidar against real tmp dir)**

```ts
// append to electron/services/watcher.test.ts
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { start, stop } from './watcher'
import Database from 'better-sqlite3'

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
    // Wait the debounce window + a little; should still be 0 rows
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
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/services/watcher.test.ts -t 'watcher start/stop'
```

Expected: FAIL (`start` / `stop` not exported).

- [ ] **Step 3: Implement `start` and `stop`**

Append to `electron/services/watcher.ts`:

```ts
import chokidar, { type FSWatcher } from 'chokidar'
import { stat as fsStat, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { relative } from 'node:path'
import { EventEmitter } from 'node:events'
import type Database from 'better-sqlite3'
import {
  upsertFile,
  syncTags,
  upsertFts,
  deleteFile,
  renameFile,
  getTokenizer
} from './index-queries'
import { parseFile } from './frontmatter' // phase-04

const fileEventEmitter = new EventEmitter()

export function onFileChanged(
  h: (p: {
    path: string
    contentHash: string
    mtime: number
    frontmatter: Record<string, unknown>
  }) => void
): () => void {
  fileEventEmitter.on('fileChanged', h)
  return () => fileEventEmitter.off('fileChanged', h)
}
export function onFileDeleted(h: (p: { path: string }) => void): () => void {
  fileEventEmitter.on('fileDeleted', h)
  return () => fileEventEmitter.off('fileDeleted', h)
}
export function onFileRenamed(h: (p: { oldPath: string; newPath: string }) => void): () => void {
  fileEventEmitter.on('fileRenamed', h)
  return () => fileEventEmitter.off('fileRenamed', h)
}

let _watcher: FSWatcher | null = null
let _root: string | null = null
let _db: Database.Database | null = null

export async function start(groveRoot: string, db: Database.Database): Promise<void> {
  if (_watcher) await stop()
  _root = groveRoot
  _db = db
  startSelfWritesGc()

  _watcher = chokidar.watch(groveRoot, {
    ignored: [
      /(^|[/\\])\../, // dotfiles
      /node_modules/,
      '**/*.tmp',
      '**/*~',
      '**/*.swp',
      (p) => {
        // ignore non-md files (but allow dirs through so we recurse)
        if (p.endsWith('.md')) return false
        try {
          return require('node:fs').statSync(p).isFile()
        } catch {
          return false
        }
      }
    ],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    followSymlinks: false,
    usePolling: false
  })

  _watcher.on('add', (p) => onAddOrChange(p, 'add'))
  _watcher.on('change', (p) => onAddOrChange(p, 'change'))
  _watcher.on('unlink', (p) => onUnlink(p))
  _watcher.on('error', (err) => handleWatcherError(err))

  await new Promise<void>((resolve, reject) => {
    if (!_watcher) return reject(new Error('watcher gone'))
    _watcher.once('ready', () => resolve())
    _watcher.once('error', (err) => reject(err))
  })
}

export async function stop(): Promise<void> {
  if (_watcher) {
    await _watcher.close()
    _watcher = null
  }
  _root = null
  _db = null
  selfWrites.clear()
  stopSelfWritesGc()
  cancelPendingFlush()
}

function handleWatcherError(_err: unknown): void {
  // Restart logic added in Task 6 below
}

// Stubs filled in subsequent tasks
function onAddOrChange(_abs: string, _kind: 'add' | 'change'): void {}
function onUnlink(_abs: string): void {}
function cancelPendingFlush(): void {}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/services/watcher.test.ts -t 'watcher start/stop'
```

Expected: 2 passed (the dotfile / non-md-ignore tests pass because chokidar simply never emits for those paths).

- [ ] **Step 5: Commit**

```bash
git add electron/services/watcher.ts electron/services/watcher.test.ts
git commit -m "feat(phase-05): watcher.start/stop + chokidar config (ignores dotfiles/non-md)"
```

---

<!-- openspec-task: 4.4 -->

### Task 2: Event batching with 500ms debounce

**Files:**

- Modify: `electron/services/watcher.ts`
- Modify: `electron/services/watcher.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
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
    const expected = require('node:crypto').createHash('sha256').update('v3').digest('hex')
    expect(row.content_hash).toBe(expected)
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/services/watcher.test.ts -t 'watcher batching'
```

Expected: FAIL (events go nowhere — handlers are stubs).

- [ ] **Step 3: Implement batch + debounce**

In `electron/services/watcher.ts`, replace the stub handlers:

```ts
type EventKind = 'add' | 'change' | 'unlink'
interface EventEntry {
  kind: EventKind
  abs: string
  rel: string
}

const FLUSH_DEBOUNCE_MS = 500
const batch: Map<string, EventEntry> = new Map()
let _flushTimer: NodeJS.Timeout | null = null

function toRel(abs: string): string {
  if (!_root) return abs
  return relative(_root, abs).split(/[\\/]/).join('/')
}

function queue(entry: EventEntry): void {
  batch.set(entry.abs, entry) // last-write-wins per path
  if (_flushTimer) clearTimeout(_flushTimer)
  _flushTimer = setTimeout(() => {
    void flush()
  }, FLUSH_DEBOUNCE_MS)
}

function onAddOrChange(abs: string, kind: 'add' | 'change'): void {
  queue({ kind, abs, rel: toRel(abs) })
}
function onUnlink(abs: string): void {
  queue({ kind: 'unlink', abs, rel: toRel(abs) })
}
function cancelPendingFlush(): void {
  if (_flushTimer) {
    clearTimeout(_flushTimer)
    _flushTimer = null
  }
  batch.clear()
}

async function flush(): Promise<void> {
  _flushTimer = null
  if (!_db) {
    batch.clear()
    return
  }
  const events = [...batch.values()]
  batch.clear()
  // For now: process add/change only — rename detection comes in Task 4
  for (const ev of events) {
    if (ev.kind === 'unlink') continue
    let raw: string
    let stat: { mtimeMs: number; size: number }
    try {
      raw = await readFile(ev.abs, 'utf8')
      stat = await fsStat(ev.abs)
    } catch {
      continue
    }
    if (shouldIgnore(ev.abs, stat.mtimeMs)) continue
    const { body, frontmatter } = parseFile(raw)
    const content_hash = createHash('sha256').update(body).digest('hex')
    const row = {
      path: ev.rel,
      title: typeof frontmatter.title === 'string' ? frontmatter.title : null,
      summary: typeof frontmatter.summary === 'string' ? frontmatter.summary : null,
      category: typeof frontmatter.category === 'string' ? frontmatter.category : null,
      rating: typeof frontmatter.rating === 'number' ? frontmatter.rating : null,
      content_hash,
      mtime_ms: stat.mtimeMs,
      size_bytes: stat.size,
      frontmatter_json: JSON.stringify(frontmatter),
      created_at: typeof frontmatter.created_at === 'number' ? frontmatter.created_at : Date.now(),
      updated_at: Date.now()
    }
    upsertFile(_db, row)
    const tags = Array.isArray(frontmatter.tags)
      ? (frontmatter.tags as unknown[]).filter((t): t is string => typeof t === 'string')
      : []
    syncTags(_db, row.path, tags)
    const ftsRowid = (
      _db.prepare('SELECT rowid FROM files WHERE path=?').get(row.path) as { rowid: number }
    ).rowid
    upsertFts(
      _db,
      {
        rowid: ftsRowid,
        path: row.path,
        title: row.title ?? '',
        summary: row.summary ?? '',
        content: body
      },
      getTokenizer()
    )
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/services/watcher.test.ts -t 'watcher batching'
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add electron/services/watcher.ts electron/services/watcher.test.ts
git commit -m "feat(phase-05): batch chokidar events with 500ms debounce + last-write-wins"
```

---

<!-- openspec-task: 4.5 -->

### Task 3: Single-transaction flush + unlink-first ordering + rename detection

**Files:**

- Modify: `electron/services/watcher.ts`
- Modify: `electron/services/watcher.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```ts
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
    // Seed db with the existing file the way startScan would
    upsertFile(db, {
      path: 'old.md',
      title: null,
      summary: null,
      category: null,
      rating: null,
      content_hash: require('node:crypto').createHash('sha256').update('same body').digest('hex'),
      mtime_ms: 1,
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

    expect(db.prepare('SELECT COUNT(*) AS n FROM files').get()).toEqual({ n: 1 })
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
      content_hash: require('node:crypto').createHash('sha256').update('A body').digest('hex'),
      mtime_ms: 1,
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
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/services/watcher.test.ts -t 'transactional flush'
```

Expected: FAIL (current flush has no rename detection and no transaction wrapping).

- [ ] **Step 3: Reimplement `flush()` with unlink-first + rename detection in one tx**

Replace the `flush` function body:

```ts
async function flush(): Promise<void> {
  _flushTimer = null
  if (!_db) {
    batch.clear()
    return
  }
  const events = [...batch.values()]
  batch.clear()
  if (events.length === 0) return

  // Pre-compute fresh hashes for add/change so the rename check + the upsert see the same value.
  type Hashed = EventEntry & {
    body?: string
    frontmatter?: Record<string, unknown>
    content_hash?: string
    mtimeMs?: number
    size?: number
  }
  const enriched: Hashed[] = []
  for (const ev of events) {
    if (ev.kind === 'unlink') {
      enriched.push(ev)
      continue
    }
    try {
      const raw = await readFile(ev.abs, 'utf8')
      const stat = await fsStat(ev.abs)
      if (shouldIgnore(ev.abs, stat.mtimeMs)) continue // self-write filter
      const { body, frontmatter } = parseFile(raw)
      const content_hash = createHash('sha256').update(body).digest('hex')
      enriched.push({
        ...ev,
        body,
        frontmatter,
        content_hash,
        mtimeMs: stat.mtimeMs,
        size: stat.size
      })
    } catch {
      // file vanished between event and read — ignore
    }
  }

  // Build map of unlinked path → its prior content_hash for rename detection
  const pendingRenames = new Map<string, string>()
  for (const ev of enriched) {
    if (ev.kind !== 'unlink') continue
    const row = _db.prepare('SELECT content_hash FROM files WHERE path=?').get(ev.rel) as
      | { content_hash: string }
      | undefined
    if (row) pendingRenames.set(ev.rel, row.content_hash)
  }

  const renamedFromTo = new Map<string, string>() // oldRel -> newRel
  const renamedNewPaths = new Set<string>()

  // Match each add/change against pending renames
  for (const ev of enriched) {
    if (ev.kind === 'unlink') continue
    if (!ev.content_hash) continue
    for (const [oldRel, oldHash] of pendingRenames) {
      if (oldHash === ev.content_hash) {
        renamedFromTo.set(oldRel, ev.rel)
        renamedNewPaths.add(ev.rel)
        pendingRenames.delete(oldRel)
        break
      }
    }
  }

  const tx = _db.transaction(() => {
    // 1. Apply renames (UPDATE path)
    for (const [oldRel, newRel] of renamedFromTo) {
      renameFile(_db!, oldRel, newRel)
    }
    // 2. Apply remaining unlinks (those not matched to a rename)
    for (const oldRel of pendingRenames.keys()) {
      deleteFile(_db!, oldRel)
    }
    // 3. Apply add/change for files NOT matched as a rename target
    for (const ev of enriched) {
      if (ev.kind === 'unlink') continue
      if (renamedNewPaths.has(ev.rel)) continue // already handled via UPDATE
      if (ev.content_hash === undefined || ev.body === undefined || ev.frontmatter === undefined)
        continue
      const row = {
        path: ev.rel,
        title: typeof ev.frontmatter.title === 'string' ? ev.frontmatter.title : null,
        summary: typeof ev.frontmatter.summary === 'string' ? ev.frontmatter.summary : null,
        category: typeof ev.frontmatter.category === 'string' ? ev.frontmatter.category : null,
        rating: typeof ev.frontmatter.rating === 'number' ? ev.frontmatter.rating : null,
        content_hash: ev.content_hash,
        mtime_ms: ev.mtimeMs!,
        size_bytes: ev.size!,
        frontmatter_json: JSON.stringify(ev.frontmatter),
        created_at:
          typeof ev.frontmatter.created_at === 'number' ? ev.frontmatter.created_at : Date.now(),
        updated_at: Date.now()
      }
      upsertFile(_db!, row)
      const tags = Array.isArray(ev.frontmatter.tags)
        ? (ev.frontmatter.tags as unknown[]).filter((t): t is string => typeof t === 'string')
        : []
      syncTags(_db!, row.path, tags)
      const ftsRowid = (
        _db!.prepare('SELECT rowid FROM files WHERE path=?').get(row.path) as { rowid: number }
      ).rowid
      upsertFts(
        _db!,
        {
          rowid: ftsRowid,
          path: row.path,
          title: row.title ?? '',
          summary: row.summary ?? '',
          content: ev.body
        },
        getTokenizer()
      )
    }
  })
  tx()

  // Stash the enriched + rename info on a module-scope value so Task 4 can emit events.
  _lastFlush = { enriched, renamedFromTo, deletedPaths: [...pendingRenames.keys()] }
  // Task 4 will emit; for now, stash silently.
}

interface LastFlush {
  enriched: {
    kind: EventKind
    rel: string
    content_hash?: string
    mtimeMs?: number
    frontmatter?: Record<string, unknown>
  }[]
  renamedFromTo: Map<string, string>
  deletedPaths: string[]
}
let _lastFlush: LastFlush | null = null
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/services/watcher.test.ts -t 'transactional flush'
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add electron/services/watcher.ts electron/services/watcher.test.ts
git commit -m "feat(phase-05): transactional flush with rename detection (single SQLite tx)"
```

---

<!-- openspec-task: 4.6 -->

### Task 4: Emit `index:fileChanged` / `:fileDeleted` / `:fileRenamed`

**Files:**

- Modify: `electron/services/watcher.ts`
- Modify: `electron/services/watcher.test.ts`

- [ ] **Step 1: Write failing tests**

Append:

```ts
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
      mtime_ms: 1,
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
      content_hash: require('node:crypto').createHash('sha256').update('same body').digest('hex'),
      mtime_ms: 1,
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
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/services/watcher.test.ts -t 'aggregate events'
```

Expected: FAIL — flush stores `_lastFlush` but never emits.

- [ ] **Step 3: Add emit logic at the tail of `flush()`**

In `electron/services/watcher.ts`, immediately after `tx()` and the `_lastFlush = ...` assignment, add:

```ts
// Emit aggregate events
for (const oldRel of _lastFlush.deletedPaths) {
  fileEventEmitter.emit('fileDeleted', { path: oldRel })
}
for (const [oldRel, newRel] of _lastFlush.renamedFromTo) {
  fileEventEmitter.emit('fileRenamed', { oldPath: oldRel, newPath: newRel })
}
for (const ev of _lastFlush.enriched) {
  if (ev.kind === 'unlink') continue
  if (_lastFlush.renamedFromTo) {
    // skip if this rel is a rename target
    let isRenameTarget = false
    for (const newRel of _lastFlush.renamedFromTo.values())
      if (newRel === ev.rel) {
        isRenameTarget = true
        break
      }
    if (isRenameTarget) continue
  }
  if (ev.content_hash && ev.mtimeMs !== undefined && ev.frontmatter) {
    fileEventEmitter.emit('fileChanged', {
      path: ev.rel,
      contentHash: ev.content_hash,
      mtime: ev.mtimeMs,
      frontmatter: ev.frontmatter
    })
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/services/watcher.test.ts -t 'aggregate events'
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add electron/services/watcher.ts electron/services/watcher.test.ts
git commit -m "feat(phase-05): emit index:fileChanged/Deleted/Renamed after flush"
```

---

<!-- openspec-task: 4.7 -->

### Task 5: Restart on chokidar `error` (3 attempts, 2s gap → IndexState='error')

**Files:**

- Modify: `electron/services/watcher.ts`
- Modify: `electron/services/watcher.test.ts`

- [ ] **Step 1: Write the failing test**

Append (this test simulates errors via injection rather than corrupting the FS):

```ts
import { _setStateForTest, state as indexerState } from './indexer'
import { _simulateWatcherErrorForTest } from './watcher'

describe('watcher restart logic', () => {
  let root: string
  let db: Database.Database
  beforeEach(() => {
    _resetSelfWritesForTest()
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
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/services/watcher.test.ts -t 'restart logic'
```

Expected: FAIL.

- [ ] **Step 3: Implement restart loop**

Replace `handleWatcherError` and add the test-only simulation hook:

```ts
import { _setStateForTest as _indexerSetState } from './indexer'

const RESTART_MAX_ATTEMPTS = 3
const RESTART_DELAY_MS = 2000

let _restartInProgress = false

async function tryRestart(
  intervalMs: number = RESTART_DELAY_MS,
  attemptsAllowed: number = RESTART_MAX_ATTEMPTS,
  simulateFailures = 0
): Promise<boolean> {
  if (_restartInProgress) return false
  _restartInProgress = true
  try {
    let failuresLeft = simulateFailures
    for (let attempt = 1; attempt <= attemptsAllowed; attempt++) {
      await new Promise((r) => setTimeout(r, intervalMs))
      try {
        if (failuresLeft > 0) {
          failuresLeft--
          throw new Error('simulated restart failure')
        }
        if (!_root || !_db) return false
        const root = _root,
          db = _db
        if (_watcher) await _watcher.close()
        _watcher = null
        await start(root, db)
        return true
      } catch {
        if (attempt === attemptsAllowed) {
          _indexerSetState('error')
          return false
        }
      }
    }
    return false
  } finally {
    _restartInProgress = false
  }
}

function handleWatcherError(_err: unknown): void {
  void tryRestart()
}

export async function _simulateWatcherErrorForTest(opts: {
  failRestarts: number
  intervalMs?: number
}): Promise<void> {
  await tryRestart(opts.intervalMs ?? 1, RESTART_MAX_ATTEMPTS, opts.failRestarts)
}
```

> Note: `_indexerSetState` import re-exposes the existing test hook. If `_setStateForTest` is intentionally test-only, add a non-underscored `setError(msg)` to `indexer.ts` instead and call that here.

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/services/watcher.test.ts -t 'restart logic'
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add electron/services/watcher.ts electron/services/watcher.test.ts
git commit -m "feat(phase-05): watcher restart up to 3x on error; flip to IndexState=error on giving up"
```

---

<!-- openspec-task: 4.8 -->

### Task 6: `stop()` closes watcher + clears selfWrites

This was scaffolded in Task 1 of this plan; verify it explicitly.

**Files:**

- Modify: `electron/services/watcher.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
describe('watcher.stop', () => {
  let root: string
  let db: Database.Database
  beforeEach(() => {
    _resetSelfWritesForTest()
    db = makeIndexedDb()
    root = mkdtempSync(join(tmpdir(), 'stop-'))
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    db.close()
  })

  it('clears selfWrites and stops emitting events', async () => {
    await start(root, db)
    registerSelfWrite('/whatever.md', 1)
    expect(_selfWritesSizeForTest()).toBe(1)
    await stop()
    expect(_selfWritesSizeForTest()).toBe(0)

    // After stop, writing should NOT update db
    writeFileSync(join(root, 'a.md'), 'x')
    await new Promise((r) => setTimeout(r, 800))
    expect((db.prepare('SELECT COUNT(*) AS n FROM files').get() as { n: number }).n).toBe(0)
  })
})
```

- [ ] **Step 2: Run; should already pass (logic exists)**

```bash
npx vitest run electron/services/watcher.test.ts -t 'watcher.stop'
```

Expected: 1 passed (or fail if `stop()` doesn't currently call `selfWrites.clear()` — fix and re-run).

- [ ] **Step 3: Typecheck + lint + full file suite**

```bash
npm run test -- electron/services/watcher.test.ts && npm run typecheck && npm run lint
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add electron/services/watcher.test.ts electron/services/watcher.ts
git commit -m "test(phase-05): verify watcher.stop clears state + halts events"
```

---

<!-- openspec-task: 5.1 -->

### Task 7: phase-04 `file.write` registers self-write after success

**Files:**

- Modify: `electron/services/file.ts`
- Modify: `electron/services/file.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `electron/services/file.test.ts`:

```ts
import { write as fileWrite } from './file'
import { _selfWritesSizeForTest, _resetSelfWritesForTest, shouldIgnore } from './watcher'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('file.write registers selfWrite', () => {
  let root: string
  beforeEach(() => {
    _resetSelfWritesForTest()
    root = mkdtempSync(
      join(tmpdir(), 'fw-')
    ) /* set current grove root using whatever phase-04 helper exists */
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('registers absolute path + final mtime after a successful write', async () => {
    // Adjust for actual phase-04 API (e.g. setCurrentRoot(root) or similar)
    setCurrentRootForTest(root) // <- replace with real phase-04 helper

    await fileWrite('a.md', 'hello')

    const abs = join(root, 'a.md')
    const mtime = statSync(abs).mtimeMs
    expect(_selfWritesSizeForTest()).toBe(1)
    expect(shouldIgnore(abs, mtime)).toBe(true)
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/services/file.test.ts -t 'registers selfWrite'
```

Expected: FAIL — `file.write` does not yet call `registerSelfWrite`.

- [ ] **Step 3: Wire `file.write` to call `registerSelfWrite`**

In `electron/services/file.ts`, locate the `write` function. Inside, after the atomic rename succeeds and before returning, add:

```ts
import { registerSelfWrite } from './watcher'

// inside write(rel, content, opts?)
// after fs.rename(tmp, abs) succeeds:
const finalStat = await fs.stat(abs)
registerSelfWrite(abs, finalStat.mtimeMs)
return
```

(If phase-04 does `await fs.writeFile` directly, just call `stat` after that.)

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/services/file.test.ts -t 'registers selfWrite'
```

Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add electron/services/file.ts electron/services/file.test.ts
git commit -m "feat(phase-05): file.write registers selfWrite after successful atomic rename"
```

---

<!-- openspec-task: 5.2 -->

### Task 8: phase-04 `file.rename` registers self-write for both old and new paths

**Files:**

- Modify: `electron/services/file.ts`
- Modify: `electron/services/file.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { rename as fileRename } from './file'

describe('file.rename registers selfWrite for both paths', () => {
  let root: string
  beforeEach(() => {
    _resetSelfWritesForTest()
    root = mkdtempSync(join(tmpdir(), 'fr-'))
    setCurrentRootForTest(root)
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('registers oldAbs (mtime 0 — any) + newAbs (real mtime)', async () => {
    await fileWrite('a.md', 'body')
    _resetSelfWritesForTest()

    await fileRename('a.md', 'b.md')

    const oldAbs = join(root, 'a.md')
    const newAbs = join(root, 'b.md')
    const newMtime = statSync(newAbs).mtimeMs

    // Both registrations exist
    expect(_selfWritesSizeForTest()).toBe(2)

    // The unlink event for oldAbs should be ignored (any mtime works because the
    // file is gone; we register with mtime 0 + tolerance, OR by special-casing unlinks
    // in the watcher).
    expect(shouldIgnore(oldAbs, 0)).toBe(true)
    expect(shouldIgnore(newAbs, newMtime)).toBe(true)
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/services/file.test.ts -t 'rename registers selfWrite'
```

Expected: FAIL.

- [ ] **Step 3: Implement**

In `electron/services/file.ts`, locate `rename(oldRel, newRel)`. After the underlying `fs.rename` succeeds, add:

```ts
import { registerSelfWrite } from './watcher'

// inside rename(oldRel, newRel)
// after await fs.rename(oldAbs, newAbs):
const newStat = await fs.stat(newAbs)
registerSelfWrite(oldAbs, 0) // suppress the unlink event (mtime tolerance handles 0)
registerSelfWrite(newAbs, newStat.mtimeMs) // suppress the add event
```

> The watcher's `shouldIgnore` only returns true if mtimes match within ±50ms. For unlink events, the watcher receives **no** stat, so we either: (a) special-case unlinks to ignore self-writes solely by path, or (b) register with `mtimeMs=0` and have the unlink-side branch in flush check by path only. Choose (a) for clarity:

In `electron/services/watcher.ts`, in the `unlink`-handling section of `flush()`, before recording the unlink, add a path-only ignore check:

```ts
// At the start of flush(), filter unlinks first
const unlinkSelfWriteHits = new Set<string>()
for (const ev of events) {
  if (ev.kind === 'unlink' && selfWrites.has(ev.abs)) {
    selfWrites.delete(ev.abs) // consume the registration
    unlinkSelfWriteHits.add(ev.abs)
  }
}
// ...later, when iterating enriched, skip events whose abs is in unlinkSelfWriteHits
```

(Adjust the existing `flush()` to skip unlink events whose abs is in `unlinkSelfWriteHits`.)

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/services/file.test.ts electron/services/watcher.test.ts
```

Expected: all green (file tests + watcher tests still pass).

- [ ] **Step 5: Commit**

```bash
git add electron/services/file.ts electron/services/file.test.ts electron/services/watcher.ts
git commit -m "feat(phase-05): file.rename registers selfWrite for both old (path-only ignore) + new"
```

---

## Self-Review Checklist (run after Task 8)

- [ ] Annotation labels:
  ```bash
  grep -oE 'openspec-task: [0-9.]+' docs/superpowers/plans/2026-04-26-phase-05-indexer-watcher-tasks-4.3-5.2.md | sort -u
  ```
  Expected: `4.3 4.4 4.5 4.6 4.7 4.8 5.1 5.2`.
- [ ] Spec coverage:
  - file-watcher §"chokidar 增量监听" → Task 1
  - file-watcher §"批处理 + 单事务" → Tasks 2, 3
  - file-watcher §"rename 识别" → Task 3
  - file-watcher §"公开事件" → Task 4
  - file-watcher §"自我过滤" (consumed in flush) → Tasks 2, 8
  - file-indexer §"启动门禁 / state error transition" → Task 5
  - md-file-io §"写入后 watcher 不误报" → Tasks 7, 8
- [ ] Function names align: `start`, `stop`, `onFileChanged`, `onFileDeleted`, `onFileRenamed`, `registerSelfWrite`, `shouldIgnore`.
- [ ] No `TODO`, `TBD`, `similar to`, or "appropriate handling" placeholders.
- [ ] Plans 1+2 helpers used verbatim: `upsertFile`, `syncTags`, `upsertFts`, `getTokenizer`, `renameFile`, `deleteFile`, `_setStateForTest` (re-aliased), `state()`.
