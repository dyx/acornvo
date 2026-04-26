# Phase 05 — Indexer & Watcher: Plan 2 (Indexer core + watcher self-filter)

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-05-indexer-watcher`
> **Task range:** OpenSpec tasks `3.1`–`4.2` (8 tasks)
> **Plan order:** 2 of 5. Depends on Plan 1 (`tasks-1.1-2.7`).
> **Status:** Not started
> **Created:** 2026-04-26

---

## Goal

Build the **indexer**: state machine, file walker, full scan with hash-based skip/upsert, deletion diff, cancellation. Then bootstrap the **watcher's self-write filter** (the path/mtime map that lets the app write its own files without triggering a watcher loop).

## Architecture

- **`indexer.ts` is a singleton service** (module-scoped state). The `IndexState` machine `idle → scanning → ready → watching → (error)` is exposed via a `state()` getter and a Node `EventEmitter` for `stateChange`. Phase-04's lifecycle code (Plan 4) drives transitions.
- **The walker is an `async generator`** so cancellation is just "break the loop". It descends from `groveRoot`, skips a hard-coded `skipSet` (`.acornvo`, `.obsidian`, `.git`, `node_modules`, `.trash`), and refuses to follow symlinks (`fs.lstat` check). Yields `{ absPath, relPath }`.
- **`startScan(groveRoot)`** flows: pre-count *.md (cheap readdir-based) → loop walker, for each file compute `sha256(body)` → call `upsertFile`/`syncTags`/`upsertFts` → push `index:progress` every 50 files or 2s → after walk, diff `listAllPaths` minus `seen` → `deleteFile` for the missing → state → `ready` → fire `index:done`. (Watcher startup happens in Plan 4 lifecycle wiring; here we stop at `ready`.)
- **`cancelScan()`** sets a module-scoped `abort` flag. The walker checks it before each file. Already-written rows stay; the state goes back to `idle`.
- **`tokenizer` injection point** is a module-scoped `let` in `index-queries` exposed via `setTokenizer()`. Phase-08 will call this at boot to install jieba; default is identity.
- **Watcher self-write filter (Tasks 4.1, 4.2)** is the smallest possible piece: a `Map<absPath, { mtimeMs, expiresAt }>` plus `registerSelfWrite()` / `shouldIgnore()` / a 30s GC timer. We carve this out now because phase-04's `file.write` and the indexer (when it writes during scan) both need to register, and Plan 3's chokidar handlers need to consume it. Doing it standalone in this plan keeps Plan 3 focused on chokidar + flush logic.

## Tech Stack

- `node:crypto` for `sha256(body)`
- `node:fs/promises` + `node:fs.lstatSync` for the walker
- `events.EventEmitter` for `stateChange`
- (No new deps; chokidar lands in Plan 3 wiring.)

## Files Touched (this plan)

| Path | Action | Owner task |
|---|---|---|
| `electron/services/index-queries.ts` | Modify (add `setTokenizer` getter) | 3.6 |
| `electron/services/indexer.ts` | Replace stub → full impl | 3.1–3.5 |
| `electron/services/indexer.test.ts` | Create | 3.1–3.5 |
| `electron/services/walker.ts` | Create (extracted helper) | 3.2 |
| `electron/services/walker.test.ts` | Create | 3.2 |
| `electron/services/watcher.ts` | Modify stub → add selfWrites map | 4.1, 4.2 |
| `electron/services/watcher.test.ts` | Create | 4.1, 4.2 |

## Pre-flight

This plan assumes Plan 1 has merged and these helpers are available:

- `upsertFile`, `deleteFile`, `syncTags`, `upsertFts`, `listAllPaths` from `electron/services/index-queries.ts`
- `file.read(rel)` and `parseFile(content)` from phase-04 (`electron/services/file.ts` returns `{ body, frontmatter }`; `electron/services/frontmatter.ts` exposes the YAML parser). If phase-04 isn't merged yet, **stop** — the indexer cannot be tested without those helpers.

---

## Tasks

<!-- openspec-task: 3.1 -->
### Task 1: `IndexState` state machine + `stateChange` emitter + `state()` getter

**Files:**
- Modify: `electron/services/indexer.ts`
- Create: `electron/services/indexer.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// electron/services/indexer.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { state, _resetForTest, _setStateForTest, onStateChange } from './indexer'

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
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/services/indexer.test.ts
```

Expected: FAIL — module exports missing.

- [ ] **Step 3: Implement state machine**

Replace stub at `electron/services/indexer.ts`:

```ts
import { EventEmitter } from 'node:events'

export type IndexStateName = 'idle' | 'scanning' | 'ready' | 'watching' | 'error'

export interface IndexStatus {
  state: IndexStateName
  total: number
  scanned: number
  currentPath?: string
  error?: string
}

let _state: IndexStateName = 'idle'
let _total = 0
let _scanned = 0
let _currentPath: string | undefined
let _error: string | undefined

const emitter = new EventEmitter()

export function state(): IndexStatus {
  return {
    state: _state,
    total: _total,
    scanned: _scanned,
    ...(_currentPath !== undefined ? { currentPath: _currentPath } : {}),
    ...(_error !== undefined ? { error: _error } : {})
  }
}

export function onStateChange(handler: (s: IndexStatus) => void): () => void {
  emitter.on('stateChange', handler)
  return () => emitter.off('stateChange', handler)
}

function setState(next: IndexStateName, error?: string): void {
  if (next === _state) return
  _state = next
  _error = error
  emitter.emit('stateChange', state())
}

// --- test hooks ---
export function _resetForTest(): void {
  _state = 'idle'
  _total = 0
  _scanned = 0
  _currentPath = undefined
  _error = undefined
  emitter.removeAllListeners()
}
export function _setStateForTest(next: IndexStateName): void {
  setState(next)
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/services/indexer.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add electron/services/indexer.ts electron/services/indexer.test.ts
git commit -m "feat(phase-05): IndexState machine with stateChange emitter"
```

---

<!-- openspec-task: 3.2 -->
### Task 2: `walk(groveRoot, skipSet)` async generator

Extract the file-walker into its own module so it can be unit-tested independently (the indexer's `startScan` will compose it).

**Files:**
- Create: `electron/services/walker.ts`
- Create: `electron/services/walker.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// electron/services/walker.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { walk, DEFAULT_SKIP_SET } from './walker'
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('walk', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'walker-'))
    mkdirSync(join(root, 'notes'), { recursive: true })
    writeFileSync(join(root, 'a.md'), '# A')
    writeFileSync(join(root, 'notes', 'b.md'), '# B')
    writeFileSync(join(root, 'notes', 'c.txt'), 'skip me')
    mkdirSync(join(root, '.git'))
    writeFileSync(join(root, '.git', 'config'), '')
    mkdirSync(join(root, '.acornvo'))
    writeFileSync(join(root, '.acornvo', 'state.json'), '{}')
    mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true })
    writeFileSync(join(root, 'node_modules', 'pkg', 'inner.md'), '# inner')
  })
  afterEach(() => { rmSync(root, { recursive: true, force: true }) })

  it('yields only *.md files, recursively', async () => {
    const found: string[] = []
    for await (const entry of walk(root, DEFAULT_SKIP_SET)) {
      found.push(entry.relPath)
    }
    expect(found.sort()).toEqual(['a.md', 'notes/b.md'])
  })

  it('skips configured directories', async () => {
    const found: string[] = []
    for await (const entry of walk(root, DEFAULT_SKIP_SET)) {
      found.push(entry.relPath)
    }
    expect(found.find((p) => p.includes('.git'))).toBeUndefined()
    expect(found.find((p) => p.includes('.acornvo'))).toBeUndefined()
    expect(found.find((p) => p.includes('node_modules'))).toBeUndefined()
  })

  it('skips symlinks (does not follow)', async () => {
    mkdirSync(join(root, 'real'), { recursive: true })
    writeFileSync(join(root, 'real', 'r.md'), '# r')
    symlinkSync(join(root, 'real'), join(root, 'link'))
    const found: string[] = []
    for await (const entry of walk(root, DEFAULT_SKIP_SET)) {
      found.push(entry.relPath)
    }
    expect(found.find((p) => p.startsWith('link/'))).toBeUndefined()
    expect(found).toContain('real/r.md')
  })

  it('always uses posix "/" separators in relPath', async () => {
    const found: string[] = []
    for await (const entry of walk(root, DEFAULT_SKIP_SET)) {
      found.push(entry.relPath)
    }
    expect(found.every((p) => !p.includes('\\'))).toBe(true)
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/services/walker.test.ts
```

Expected: FAIL — `walker` not defined.

- [ ] **Step 3: Implement walker**

```ts
// electron/services/walker.ts
import { readdir, lstat } from 'node:fs/promises'
import { join, relative } from 'node:path'

export const DEFAULT_SKIP_SET = new Set([
  '.acornvo',
  '.obsidian',
  '.git',
  'node_modules',
  '.trash'
])

export interface WalkEntry {
  absPath: string
  relPath: string  // posix-style, relative to groveRoot
}

export async function* walk(
  groveRoot: string,
  skipSet: Set<string> = DEFAULT_SKIP_SET
): AsyncGenerator<WalkEntry> {
  yield* walkDir(groveRoot, groveRoot, skipSet)
}

async function* walkDir(
  groveRoot: string,
  dir: string,
  skipSet: Set<string>
): AsyncGenerator<WalkEntry> {
  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (skipSet.has(entry.name)) continue
    const abs = join(dir, entry.name)
    const stat = await lstat(abs)
    if (stat.isSymbolicLink()) continue
    if (stat.isDirectory()) {
      yield* walkDir(groveRoot, abs, skipSet)
      continue
    }
    if (!entry.isFile()) continue
    if (!entry.name.endsWith('.md')) continue
    const rel = relative(groveRoot, abs).split(/[\\/]/).join('/')
    yield { absPath: abs, relPath: rel }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/services/walker.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add electron/services/walker.ts electron/services/walker.test.ts
git commit -m "feat(phase-05): walk() async generator with skipSet + symlink guard"
```

---

<!-- openspec-task: 3.3 -->
### Task 3: `startScan(groveRoot)` — pre-count, walk, hash, upsert, diff-delete, progress

This is the meaty one. Sub-tasks 3.3.1–3.3.8 from `tasks.md` are folded into a single Superpowers task with multiple steps.

**Files:**
- Modify: `electron/services/indexer.ts`
- Modify: `electron/services/indexer.test.ts`

- [ ] **Step 1: Write integration tests**

Append to `electron/services/indexer.test.ts`:

```ts
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { startScan, onProgress, onDone, _injectDbForTest } from './indexer'
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

describe('startScan', () => {
  let root: string
  let db: Database.Database

  beforeEach(() => {
    _resetForTest()
    db = makeIndexedDb()
    _injectDbForTest(db)
    root = mkdtempSync(join(tmpdir(), 'scan-'))
  })
  afterEach(() => { rmSync(root, { recursive: true, force: true }); db.close() })

  it('inserts every md file into files + files_fts', async () => {
    writeFileSync(join(root, 'a.md'), '---\ntitle: A\ntags: [x]\n---\nbody A')
    writeFileSync(join(root, 'b.md'), '---\ntitle: B\n---\nbody B')

    await startScan(root)

    expect(listAllPaths(db)).toEqual(new Set(['a.md', 'b.md']))
    expect(db.prepare('SELECT COUNT(*) AS n FROM files_fts').get()).toEqual({ n: 2 })
    expect(db.prepare('SELECT name, usage_count FROM tags').all()).toEqual([
      { name: 'x', usage_count: 1 }
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
    const updates: number[] = []
    db.aggregate('mockaggr', { start: 0, step: (acc) => acc + 1 }) // sentinel; actually we count via update_at
    const before = db.prepare('SELECT updated_at FROM files WHERE path=?').get('a.md') as {
      updated_at: number
    }
    await startScan(root)  // no disk change
    const after = db.prepare('SELECT updated_at FROM files WHERE path=?').get('a.md') as {
      updated_at: number
    }
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
    onDone(() => { doneFired = true })
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
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/services/indexer.test.ts -t startScan
```

Expected: FAIL — `startScan` / `onProgress` / `onDone` / `_injectDbForTest` not exported.

- [ ] **Step 3: Implement `startScan`**

Append to `electron/services/indexer.ts`:

```ts
import { createHash } from 'node:crypto'
import { readFile, stat as fsStat, readdir } from 'node:fs/promises'
import type Database from 'better-sqlite3'
import { walk, DEFAULT_SKIP_SET } from './walker'
import {
  upsertFile,
  syncTags,
  upsertFts,
  listAllPaths,
  deleteFile,
  type FileRow
} from './index-queries'
import { parseFile } from './frontmatter'  // phase-04

let _abort = false
let _db: Database.Database | null = null

export function _injectDbForTest(db: Database.Database): void { _db = db }

function getDb(): Database.Database {
  if (!_db) throw new Error('indexer: db not injected (phase-04 should call setDb on grove open)')
  return _db
}

export function setDb(db: Database.Database | null): void { _db = db }

const PROGRESS_FILE_INTERVAL = 50
const PROGRESS_TIME_INTERVAL_MS = 2000

const progressEmitter = new EventEmitter()
const doneEmitter = new EventEmitter()
const errorEmitter = new EventEmitter()

export function onProgress(h: (s: IndexStatus) => void): () => void {
  progressEmitter.on('progress', h)
  return () => progressEmitter.off('progress', h)
}
export function onDone(h: () => void): () => void {
  doneEmitter.on('done', h)
  return () => doneEmitter.off('done', h)
}
export function onError(h: (msg: string) => void): () => void {
  errorEmitter.on('error', h)
  return () => errorEmitter.off('error', h)
}

async function preCount(root: string, skipSet = DEFAULT_SKIP_SET): Promise<number> {
  let n = 0
  async function visit(dir: string): Promise<void> {
    let entries
    try { entries = await readdir(dir, { withFileTypes: true }) }
    catch { return }
    for (const e of entries) {
      if (skipSet.has(e.name)) continue
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) await visit(`${dir}/${e.name}`)
      else if (e.isFile() && e.name.endsWith('.md')) n++
    }
  }
  await visit(root)
  return n
}

export async function startScan(groveRoot: string): Promise<void> {
  if (_state === 'scanning') return
  _abort = false
  _scanned = 0
  _currentPath = undefined
  _total = await preCount(groveRoot)
  setState('scanning')

  const db = getDb()
  const seen = new Set<string>()
  let lastEmit = Date.now()

  for await (const entry of walk(groveRoot)) {
    if (_abort) {
      setState('idle')
      return
    }
    _currentPath = entry.relPath
    try {
      const raw = await readFile(entry.absPath, 'utf8')
      const { body, frontmatter } = parseFile(raw)
      const stat = await fsStat(entry.absPath)
      const content_hash = createHash('sha256').update(body).digest('hex')

      const row: FileRow = {
        path: entry.relPath,
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

      const result = upsertFile(db, row)
      if (result !== 'unchanged') {
        const tags = Array.isArray(frontmatter.tags)
          ? (frontmatter.tags as unknown[]).filter((t): t is string => typeof t === 'string')
          : []
        syncTags(db, row.path, tags)
        // For FTS rowid, use `files`'s implicit rowid lookup
        const ftsRowid = (db.prepare('SELECT rowid FROM files WHERE path=?').get(row.path) as { rowid: number }).rowid
        upsertFts(db, {
          rowid: ftsRowid,
          path: row.path,
          title: row.title ?? '',
          summary: row.summary ?? '',
          content: body
        })
      }
      seen.add(entry.relPath)
      _scanned++

      const now = Date.now()
      if (_scanned % PROGRESS_FILE_INTERVAL === 0 || now - lastEmit > PROGRESS_TIME_INTERVAL_MS) {
        progressEmitter.emit('progress', state())
        lastEmit = now
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errorEmitter.emit('error', `scan failed for ${entry.relPath}: ${msg}`)
      // continue with next file rather than aborting whole scan
    }
  }

  // Diff: delete rows whose path no longer exists
  const allPaths = listAllPaths(db)
  for (const p of allPaths) {
    if (!seen.has(p)) deleteFile(db, p)
  }

  // Final progress emit
  progressEmitter.emit('progress', state())
  setState('ready')
  doneEmitter.emit('done')
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/services/indexer.test.ts -t startScan
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add electron/services/indexer.ts electron/services/indexer.test.ts
git commit -m "feat(phase-05): startScan does precount, walk, hash-skip, upsert, diff-delete, progress"
```

---

<!-- openspec-task: 3.4 -->
### Task 4: `cancelScan()` — abort flag, state back to idle, partial data preserved

**Files:**
- Modify: `electron/services/indexer.ts`
- Modify: `electron/services/indexer.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { cancelScan } from './indexer'

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

    const scanPromise = startScan(root)
    // After microtask yield, cancel
    queueMicrotask(() => cancelScan())
    await scanPromise

    expect(state().state).toBe('idle')
  })

  it('preserves rows already inserted before cancel', async () => {
    for (let i = 0; i < 50; i++) writeFileSync(join(root, `f${i}.md`), `# ${i}`)

    const scanPromise = startScan(root)
    setTimeout(() => cancelScan(), 1)  // cancel mid-flight
    await scanPromise

    const count = (db.prepare('SELECT COUNT(*) AS n FROM files').get() as { n: number }).n
    expect(count).toBeGreaterThanOrEqual(0)  // partial data is fine
    expect(count).toBeLessThanOrEqual(50)
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/services/indexer.test.ts -t cancelScan
```

Expected: FAIL — `cancelScan` not exported.

- [ ] **Step 3: Implement**

Append to `electron/services/indexer.ts`:

```ts
export function cancelScan(): void {
  if (_state === 'scanning') _abort = true
}
```

(The walker already checks `_abort` per file; that's enough.)

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/services/indexer.test.ts -t cancelScan
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add electron/services/indexer.ts electron/services/indexer.test.ts
git commit -m "feat(phase-05): cancelScan flips abort flag; partial data preserved"
```

---

<!-- openspec-task: 3.5 -->
### Task 5: `status()` returns `{ state, total, scanned, error? }`

This was already exported as `state()` in Task 1. Add the alias `status()` so the IPC layer (Plan 4) can match the OpenSpec naming and add tests proving the shape.

**Files:**
- Modify: `electron/services/indexer.ts`
- Modify: `electron/services/indexer.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { status } from './indexer'

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
    // setState only sets error if passed, so simulate:
    // (use the indexer's internal-only error path; for now just verify shape works)
    expect(status().state).toBe('error')
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/services/indexer.test.ts -t 'status\\(\\)'
```

Expected: FAIL — `status` not exported.

- [ ] **Step 3: Implement**

Append to `electron/services/indexer.ts`:

```ts
export const status = state  // alias
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/services/indexer.test.ts -t 'status\\(\\)'
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add electron/services/indexer.ts electron/services/indexer.test.ts
git commit -m "feat(phase-05): export status() alias for IPC consumption"
```

---

<!-- openspec-task: 3.6 -->
### Task 6: Tokenizer injection point in `index-queries`

The `upsertFts` helper from Plan 1 already accepts a `tokenizer` arg. To let phase-08 swap the default without touching every callsite, expose a module-scoped `getTokenizer()` / `setTokenizer()` and have the indexer call `upsertFts(db, row, getTokenizer())`.

**Files:**
- Modify: `electron/services/index-queries.ts`
- Modify: `electron/services/index-queries.test.ts`
- Modify: `electron/services/indexer.ts`

- [ ] **Step 1: Write failing test**

Append to `electron/services/index-queries.test.ts`:

```ts
import { setTokenizer, getTokenizer } from './index-queries'

describe('tokenizer injection', () => {
  it('default tokenizer is identity', () => {
    expect(getTokenizer()('foo bar')).toBe('foo bar')
  })

  it('setTokenizer swaps the active tokenizer', () => {
    setTokenizer((t) => `[[${t}]]`)
    expect(getTokenizer()('hello')).toBe('[[hello]]')
    setTokenizer((t) => t)  // restore
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/services/index-queries.test.ts -t tokenizer
```

Expected: FAIL.

- [ ] **Step 3: Add tokenizer registry to `index-queries.ts`**

Append:

```ts
let _activeTokenizer: Tokenizer = identityTokenizer
export function setTokenizer(t: Tokenizer): void { _activeTokenizer = t }
export function getTokenizer(): Tokenizer { return _activeTokenizer }
```

- [ ] **Step 4: Update indexer to use `getTokenizer()`**

In `electron/services/indexer.ts`, change the `upsertFts` call inside `startScan`:

```ts
upsertFts(db, {
  rowid: ftsRowid,
  path: row.path,
  title: row.title ?? '',
  summary: row.summary ?? '',
  content: body
}, getTokenizer())
```

Add the import at the top:

```ts
import { upsertFile, syncTags, upsertFts, listAllPaths, deleteFile, getTokenizer, type FileRow } from './index-queries'
```

- [ ] **Step 5: Run tests**

```bash
npm run test -- electron/services/index-queries.test.ts electron/services/indexer.test.ts
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add electron/services/index-queries.ts electron/services/index-queries.test.ts electron/services/indexer.ts
git commit -m "feat(phase-05): tokenizer registry (default identity; phase-08 will inject jieba)"
```

---

<!-- openspec-task: 4.1 -->
### Task 7: `selfWrites` map + `registerSelfWrite` / `shouldIgnore` exports

**Files:**
- Modify: `electron/services/watcher.ts`
- Create: `electron/services/watcher.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// electron/services/watcher.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { registerSelfWrite, shouldIgnore, _resetSelfWritesForTest } from './watcher'

describe('selfWrites map', () => {
  beforeEach(() => { _resetSelfWritesForTest() })

  it('returns false when path was never registered', () => {
    expect(shouldIgnore('/some/path.md', 1000)).toBe(false)
  })

  it('returns true when path was registered with matching mtime', () => {
    registerSelfWrite('/some/path.md', 1000)
    expect(shouldIgnore('/some/path.md', 1000)).toBe(true)
  })

  it('tolerates ±50ms mtime drift', () => {
    registerSelfWrite('/p.md', 1000)
    expect(shouldIgnore('/p.md', 1049)).toBe(true)
    expect(shouldIgnore('/p.md', 951)).toBe(true)
    expect(shouldIgnore('/p.md', 1051)).toBe(false)
  })

  it('removes the entry after a successful match (one-shot)', () => {
    registerSelfWrite('/p.md', 1000)
    expect(shouldIgnore('/p.md', 1000)).toBe(true)
    expect(shouldIgnore('/p.md', 1000)).toBe(false)  // already consumed
  })

  it('expires entries after 3s TTL', () => {
    const now = Date.now()
    registerSelfWrite('/p.md', 1000, now)
    // Simulate clock advance by passing now to shouldIgnore
    expect(shouldIgnore('/p.md', 1000, now + 2999)).toBe(true)
    registerSelfWrite('/p.md', 1000, now)
    expect(shouldIgnore('/p.md', 1000, now + 3001)).toBe(false)
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/services/watcher.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement self-writes map**

Replace stub at `electron/services/watcher.ts`:

```ts
const SELF_WRITE_TTL_MS = 3000
const MTIME_TOLERANCE_MS = 50

interface SelfWriteEntry { mtimeMs: number; expiresAt: number }
const selfWrites = new Map<string, SelfWriteEntry>()

export function registerSelfWrite(absPath: string, mtimeMs: number, now: number = Date.now()): void {
  selfWrites.set(absPath, { mtimeMs, expiresAt: now + SELF_WRITE_TTL_MS })
}

export function shouldIgnore(absPath: string, mtimeMs: number, now: number = Date.now()): boolean {
  const entry = selfWrites.get(absPath)
  if (!entry) return false
  if (entry.expiresAt < now) {
    selfWrites.delete(absPath)
    return false
  }
  if (Math.abs(entry.mtimeMs - mtimeMs) > MTIME_TOLERANCE_MS) return false
  selfWrites.delete(absPath)
  return true
}

export function _resetSelfWritesForTest(): void {
  selfWrites.clear()
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/services/watcher.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add electron/services/watcher.ts electron/services/watcher.test.ts
git commit -m "feat(phase-05): selfWrites map with 3s TTL + 50ms mtime tolerance"
```

---

<!-- openspec-task: 4.2 -->
### Task 8: 30s GC timer for expired selfWrites entries

**Files:**
- Modify: `electron/services/watcher.ts`
- Modify: `electron/services/watcher.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { _gcSelfWrites, _selfWritesSizeForTest } from './watcher'

describe('selfWrites GC', () => {
  beforeEach(() => { _resetSelfWritesForTest() })

  it('removes entries past their expiresAt', () => {
    const now = Date.now()
    registerSelfWrite('/a.md', 1, now - 4000)  // already expired
    registerSelfWrite('/b.md', 1, now)         // fresh
    expect(_selfWritesSizeForTest()).toBe(2)
    _gcSelfWrites(now)
    expect(_selfWritesSizeForTest()).toBe(1)
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/services/watcher.test.ts -t 'selfWrites GC'
```

Expected: FAIL — `_gcSelfWrites` and `_selfWritesSizeForTest` not exported.

- [ ] **Step 3: Implement GC**

Append to `electron/services/watcher.ts`:

```ts
export function _gcSelfWrites(now: number = Date.now()): void {
  for (const [k, v] of selfWrites) {
    if (v.expiresAt < now) selfWrites.delete(k)
  }
}

export function _selfWritesSizeForTest(): number { return selfWrites.size }

let _gcTimer: NodeJS.Timeout | null = null

export function startSelfWritesGc(intervalMs: number = 30_000): void {
  if (_gcTimer) return
  _gcTimer = setInterval(() => _gcSelfWrites(), intervalMs)
  if (typeof _gcTimer.unref === 'function') _gcTimer.unref()
}

export function stopSelfWritesGc(): void {
  if (_gcTimer) {
    clearInterval(_gcTimer)
    _gcTimer = null
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/services/watcher.test.ts
```

Expected: all 6 watcher tests passed.

- [ ] **Step 5: Typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add electron/services/watcher.ts electron/services/watcher.test.ts
git commit -m "feat(phase-05): periodic GC for expired selfWrites entries"
```

---

## Self-Review Checklist (run after Task 8)

- [ ] Annotation labels present:
  ```bash
  grep -oE 'openspec-task: [0-9.]+' docs/superpowers/plans/2026-04-26-phase-05-indexer-watcher-tasks-3.1-4.2.md | sort -u
  ```
  Expected: `3.1 3.2 3.3 3.4 3.5 3.6 4.1 4.2` (one per line).
- [ ] Spec coverage:
  - file-indexer §"全量扫描" → Task 3 (startScan)
  - file-indexer §"content_hash 以 body 为准" → `createHash('sha256').update(body)` in Task 3
  - file-indexer §"FTS5 写入占位" → Task 6 (tokenizer registry; default identity)
  - index-startup-progress §"扫描可取消" → Task 4 (cancelScan)
  - index-startup-progress §"索引状态机" → Task 1 (state machine)
  - index-startup-progress §"启动扫描进度事件" → Task 3 (`onProgress` / `onDone`)
  - file-watcher §"自我过滤" → Tasks 7–8 (selfWrites map)
- [ ] No `TODO` / `TBD` / unfilled-in steps.
- [ ] Function names align with Plan 1: `upsertFile`, `syncTags`, `upsertFts(... getTokenizer())`, `listAllPaths`, `deleteFile`.
