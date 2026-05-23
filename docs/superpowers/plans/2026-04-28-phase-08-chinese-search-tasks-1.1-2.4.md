# Phase 08 — Chinese Search: Plan 1 (Schema + FTS bootstrap)

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-08-chinese-search`
> **Task range:** OpenSpec tasks `1.1`–`2.4` (7 tasks)
> **Plan order:** 1 of 5. Subsequent plans (`tasks-3.1-4.6`, `5.1-5.7`, `6.1-8.1`, `9.1-9.18`) build on this one.
> **Status:** Not started
> **Created:** 2026-04-28
> **Branch suggestion:** `feat/phase-08-chinese-search` (branch from `main` after phases 5/6/7 land)

---

## Goal

Add the dependency chain for Chinese full-text search: install `@node-rs/jieba`, replace the phase-05 placeholder `files_fts(path, title, summary, content, tokenize='simple')` schema with `migrations/002_fts.sql` that creates `files_fts(path UNINDEXED, title, body, tokenize='trigram')` (non-external content; `body` is stored verbatim so rebuild does not need extra columns on `files`), and ship the **startup self-heal path** that detects an empty `files_fts` after a v1→v2 upgrade and replays every file's body through `file.read` while emitting `index:rebuildProgress` events. By the end of this plan, opening either a brand-new grove or an existing v1 grove produces a populated `files_fts` table — without any indexer or IPC changes (those land in Plan 2).

## Architecture

- **Migration 002 drops + recreates `files_fts`.** Phase-05's 001_init.sql defined `files_fts(path UNINDEXED, title, summary, content, tokenize='simple')`. Per design D5, phase-08 needs `(path UNINDEXED, title, body, tokenize='trigram')` with non-external-content (so `body` is stored in the FTS table itself, doubling disk usage but eliminating the need to read disk during rebuild). `DROP VIRTUAL TABLE IF EXISTS files_fts` is safe because phase-05 has not shipped a stable release; even if rows existed, the indexer would have repopulated them on next watcher event — but we kill that risk with the rebuild self-heal.
- **`maybeRebuildFts(db, groveRoot)` runs once per grove open.** It runs _after_ `runMigrations` and _before_ `indexer.start()`. The detection rule: if `COUNT(files) > 0 AND COUNT(files_fts) = 0`, kick off `rebuildFts(db, groveRoot)`. Otherwise skip (per spec scenario "正常启动无 rebuild" and "rebuild 中途崩溃"; we never re-rebuild a partially-populated table — the user can use the manual `search.rebuild()` IPC).
- **`rebuildFts` is async + cancellable + emits progress.** It reads each `files` row, calls `file.read(absPath)` to get the body, and `INSERT`s into `files_fts` in batches of 100 inside one transaction per batch. It emits `index:rebuildProgress { done, total }` every 5% (or every 500 rows, whichever comes first) so `IndexBanner` can render a progress bar. Errors per-row (e.g., file deleted between scan and read) are logged and skipped, never throwing — partial state is the spec'd accepted behaviour.
- **Tokenizer injection point goes away.** Phase-05's `getTokenizer/setTokenizer` was a placeholder; with FTS5's built-in `trigram`, the renderer never injects a custom tokenizer. We delete the injection plumbing in Plan 2 (task 3.x) — this plan only stops _using_ it in the migration; the dead code in `index-queries.ts` is removed in Plan 2 task 3.1 to keep this plan's diff tight.
- **`search.fullText` returns `{ items: [], total: 0, pending: true }` while `rebuildFts` runs.** A module-level `_isRebuilding: boolean` flag on the search service is the simplest mechanism (per spec "索引构建中"). Plan 2 wires the actual `search.fullText` handler; this plan only ships the module + flag + a no-op `search.fullText` stub that early-returns `pending: true` whenever the flag is set, so Plan 4's UI integration can develop against a working contract.

## Tech Stack

- `@node-rs/jieba@^2.0` (added here; the renderer never imports it — only `electron/services/search/jiebaSegment.ts` in Plan 2)
- `better-sqlite3@^12` (already a dep) — FTS5 built-in `trigram` tokenizer
- `electron-log@^5.4` (already a dep) — log rebuild progress
- Node 22+ (already pinned)

## Files Touched (this plan)

| Path                                          | Action                                                | Owner task              |
| --------------------------------------------- | ----------------------------------------------------- | ----------------------- |
| `package.json`, `package-lock.json`           | Modify (add `@node-rs/jieba`)                         | 1.1                     |
| `electron/services/db/migrations/002_fts.sql` | Create                                                | 1.2                     |
| `electron/services/db/migrations.test.ts`     | Modify (add 002 test)                                 | 1.2                     |
| `electron/services/search/index.ts`           | Create stub                                           | 1.3, 2.1, 2.2, 2.3, 2.4 |
| `electron/services/search/rebuild.ts`         | Create                                                | 2.1, 2.2                |
| `electron/services/search/rebuild.test.ts`    | Create                                                | 2.1, 2.2                |
| `shared/ipc-contract.ts`                      | Modify (add `search.rebuild` stub)                    | 2.3                     |
| `electron/ipc/search.ts`                      | Create stub                                           | 2.3, 2.4                |
| `electron/ipc/handlers.ts`                    | Modify (register search namespace)                    | 2.3                     |
| `electron/services/db.ts`                     | Modify (call `maybeRebuildFts` after `runMigrations`) | 2.1                     |

## Pre-flight

This plan assumes phases 5/6/7 have landed on `main`:

- `electron/services/index-queries.ts` exports `upsertFts`, `deleteFile`, `renameFile`, plus a `getTokenizer/setTokenizer` placeholder pair.
- `electron/services/db/migrations/001_init.sql` already creates `files_fts` with `(path UNINDEXED, title, summary, content, tokenize='simple')` — this plan **replaces** that schema.
- `shared/file-types.ts` exports `FileSummary` (phase-06).
- `electron/services/db.ts` calls `runMigrations(db, migrationsDir())` inside `openForGrove`.
- `electron/services/file.ts` (or equivalent — phase-04 file IO) exports a function that reads a file's body given an absolute path. We use `readFile(absPath, 'utf8')` directly for rebuild because the FTS body is the **whole file content** (frontmatter + body) — not the parsed body — so we don't need `parseFile`.

If phase-05 has shipped a different `files_fts` schema (rename, drop a column, etc.), **stop and reconcile** — task 1.2 hardcodes `DROP VIRTUAL TABLE IF EXISTS files_fts` followed by the new `CREATE VIRTUAL TABLE`.

> **Body content question:** D1 + D5 store `body` (the parsed body sans frontmatter). The indexer already has `body` from `parseFile` during normal operation. For rebuild, the simplest correctness-preserving choice is: re-parse on rebuild too. We use `parseFile(raw)` and feed `body` (not raw) to the FTS row. This matches the indexer's normal write path so the rebuilt table is identical to what indexer would have produced.

---

## Tasks

<!-- openspec-task: 1.1 -->

### Task 1: Install `@node-rs/jieba`

**Files:**

- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Confirm not already installed**

Run:

```bash
node -e "const p=require('./package.json');console.log(p.dependencies['@node-rs/jieba']||p.devDependencies?.['@node-rs/jieba']||'absent')"
```

Expected: `absent`. If a version prints, skip Step 2.

- [ ] **Step 2: Install**

Run:

```bash
npm install @node-rs/jieba
```

Expected: `package.json` `dependencies` now lists `@node-rs/jieba`. The `postinstall` script (`electron-builder install-app-deps && electron-rebuild -f -w better-sqlite3`) runs but does not affect `@node-rs/jieba` (it ships pre-built `.node` binaries via napi-rs and does not need rebuilding).

- [ ] **Step 3: Smoke-load jieba**

Run:

```bash
node -e "const j=require('@node-rs/jieba'); console.log(j.cut('注意力机制研究'))"
```

Expected: an array containing `'注意力'`, `'机制'`, `'研究'` (exact tokens may vary slightly by dictionary, but you should see the three Chinese words separately).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(phase-08): add @node-rs/jieba for chinese segmentation"
```

---

<!-- openspec-task: 1.2 -->

### Task 2: Migration 002 — drop + recreate `files_fts` with `body`/`trigram`

**Files:**

- Create: `electron/services/db/migrations/002_fts.sql`
- Modify: `electron/services/db/migrations.test.ts`

- [ ] **Step 1: Write the failing migration test**

Append to `electron/services/db/migrations.test.ts` (above any `// EOF` marker):

```ts
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { runMigrations } from './migrations'

describe('migration 002 — files_fts trigram', () => {
  const dir = join(__dirname, 'migrations')

  it('replaces files_fts with (path UNINDEXED, title, body, tokenize=trigram) and bumps user_version to 2', () => {
    const db = new Database(':memory:')
    runMigrations(db, dir)

    const userVersion = db.pragma('user_version', { simple: true }) as number
    expect(userVersion).toBe(2)

    // Schema: SQLite exposes virtual table column names via PRAGMA table_info
    const cols = db.prepare("PRAGMA table_info('files_fts')").all() as { name: string }[]
    const colNames = cols.map((c) => c.name)
    expect(colNames).toEqual(['path', 'title', 'body'])

    // Insert + match smoke test using trigram (3-gram on chinese)
    db.exec(`
      INSERT INTO files (path, title, mtime, content_hash) VALUES ('a.md', 'A', 0, 'h1');
    `)
    db.prepare('INSERT INTO files_fts(rowid, path, title, body) VALUES (?, ?, ?, ?)').run(
      1,
      'a.md',
      'A',
      '注意力机制研究'
    )
    const hits = db.prepare("SELECT path FROM files_fts WHERE files_fts MATCH '注意力'").all() as {
      path: string
    }[]
    expect(hits.map((h) => h.path)).toEqual(['a.md'])
  })

  it('idempotent: running migrations again is a no-op', () => {
    const db = new Database(':memory:')
    runMigrations(db, dir)
    const applied = runMigrations(db, dir) // second run
    expect(applied).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run electron/services/db/migrations.test.ts
```

Expected: FAIL — `colNames` will currently be `['path', 'title', 'summary', 'content']` (the phase-05 schema) and `user_version` will be `1`.

- [ ] **Step 3: Create the migration file**

Create `electron/services/db/migrations/002_fts.sql`:

```sql
-- migration: 002_fts
-- Replace phase-05 files_fts (tokenize=simple, columns: path/title/summary/content)
-- with phase-08 schema: tokenize=trigram, columns: path/title/body.
-- Non-external content: body is stored in the FTS table so rebuild after
-- v1→v2 upgrade only needs file.read per row (no need to add a body column to files).

DROP TABLE IF EXISTS files_fts;

CREATE VIRTUAL TABLE files_fts USING fts5(
  path UNINDEXED,
  title,
  body,
  tokenize='trigram'
);
```

> Note: We intentionally do **not** include `PRAGMA user_version = 2` in the SQL itself — `runMigrations` (in `electron/services/db/migrations.ts:51-69`) sets the pragma after each migration's `db.exec(m.sql)` succeeds. The filename's `002_` prefix is what drives the version bump.

- [ ] **Step 4: Re-run the migration test**

```bash
npx vitest run electron/services/db/migrations.test.ts
```

Expected: PASS — both the schema-shape assertion and the idempotency check.

- [ ] **Step 5: Run the full test suite to make sure nothing else regressed**

```bash
npm test
```

Expected: ALL existing migration / db / phase-05 tests continue to pass. If a phase-05 test inserts into `files_fts(rowid, path, title, summary, content)`, those tests will now fail — which is a **separate** concern handled in Plan 2 task 3.1 where we update `upsertFts` to write the new schema. For this plan, expect failures localised to phase-05's `index-queries.test.ts` and `indexer.test.ts` ONLY for tests that exercise FTS columns — note them in the commit message and they get fixed in Plan 2.

If failures appear _outside_ the indexer tests (e.g., in unrelated parsers or the file IO layer), stop and reconcile.

- [ ] **Step 6: Commit**

```bash
git add electron/services/db/migrations/002_fts.sql electron/services/db/migrations.test.ts
git commit -m "feat(phase-08): migration 002 — files_fts(path,title,body) with trigram tokenizer"
```

---

<!-- openspec-task: 1.3 -->

### Task 3: Confirm phase-05 placeholder is overwritten; document the tokenizer-injection deprecation

This task has no code changes — it is a verification + documentation step that locks in the contract for Plan 2.

**Files:**

- Modify: `electron/services/index-queries.ts` (add deprecation comment only)

- [ ] **Step 1: Verify the live schema after migrations**

Run a one-off node script:

```bash
node -e "
const Database = require('better-sqlite3');
const { runMigrations } = require('./electron/services/db/migrations.ts');
" 2>&1 | head -5
```

This will fail because `.ts` is not loadable by node directly; instead, rely on the test from task 1.2 step 4 as the live-schema verification. Move on to step 2.

- [ ] **Step 2: Add a deprecation comment above `setTokenizer/getTokenizer` in `electron/services/index-queries.ts`**

Find the block (currently around lines 142-144 of `electron/services/index-queries.ts`):

```ts
let _activeTokenizer: Tokenizer = identityTokenizer
export function setTokenizer(t: Tokenizer): void {
  _activeTokenizer = t
}
export function getTokenizer(): Tokenizer {
  return _activeTokenizer
}
```

Replace with:

```ts
// PHASE-08 DEPRECATED: the tokenizer-injection point is unused after migration 002.
// FTS5's built-in `trigram` tokenizer handles index-side segmentation; query-side
// jieba lives in `electron/services/search/jiebaSegment.ts` (Plan 2).
// `setTokenizer/getTokenizer` are kept as no-ops only to avoid breaking phase-05 tests
// in this commit; Plan 2 task 3.1 deletes them along with the `tokenizer` parameter
// of `upsertFts` and switches `upsertFts` to write the new (path, title, body) schema.
let _activeTokenizer: Tokenizer = identityTokenizer
export function setTokenizer(t: Tokenizer): void {
  _activeTokenizer = t
}
export function getTokenizer(): Tokenizer {
  return _activeTokenizer
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add electron/services/index-queries.ts
git commit -m "docs(phase-08): deprecate tokenizer injection (replaced by trigram + query-side jieba)"
```

---

<!-- openspec-task: 2.1 -->

### Task 4: `maybeRebuildFts(db, groveRoot)` detector + wiring into `db.openForGrove`

**Files:**

- Create: `electron/services/search/index.ts`
- Create: `electron/services/search/rebuild.ts`
- Create: `electron/services/search/rebuild.test.ts`
- Modify: `electron/services/db.ts` (call `maybeRebuildFts` after migrations)

- [ ] **Step 1: Scaffold `electron/services/search/index.ts`**

```ts
// electron/services/search/index.ts
// Module entry for Plan 1+2. This file owns the "is rebuilding" flag so
// search.fullText (Plan 2 task 4.3) can early-return pending:true.

import type Database from 'better-sqlite3'
import { maybeRebuildFts as _maybeRebuildFts } from './rebuild'

let _isRebuilding = false

export function isRebuilding(): boolean {
  return _isRebuilding
}

export function _setRebuildingForTest(v: boolean): void {
  _isRebuilding = v
}

/** Called by db.openForGrove after runMigrations completes. */
export async function maybeRebuildFts(db: Database.Database, groveRoot: string): Promise<void> {
  if (_isRebuilding) return
  _isRebuilding = true
  try {
    await _maybeRebuildFts(db, groveRoot)
  } finally {
    _isRebuilding = false
  }
}
```

- [ ] **Step 2: Write the failing test for the detector**

Create `electron/services/search/rebuild.test.ts`:

```ts
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
    db.prepare('INSERT INTO files (path, mtime, content_hash) VALUES (?, ?, ?)').run(
      'a.md',
      0,
      'h1'
    )
    db.prepare('INSERT INTO files_fts(rowid, path, title, body) VALUES (?, ?, ?, ?)').run(
      1,
      'a.md',
      'A',
      'partial body'
    )

    await maybeRebuildFts(db, grove)

    const row = db.prepare('SELECT body FROM files_fts WHERE rowid=1').get() as { body: string }
    expect(row.body).toBe('partial body') // not overwritten
  })

  it('rebuilds when files has rows but files_fts is empty', async () => {
    // Write a real file so file.read in rebuild can pick it up
    mkdirSync(join(grove, 'notes'), { recursive: true })
    writeFileSync(join(grove, 'notes', 'x.md'), '---\ntitle: X\n---\n\n注意力机制研究', 'utf8')

    db.prepare('INSERT INTO files (path, title, mtime, content_hash) VALUES (?, ?, ?, ?)').run(
      'notes/x.md',
      'X',
      0,
      'h1'
    )

    await maybeRebuildFts(db, grove)

    const ftsCount = db.prepare('SELECT COUNT(*) AS c FROM files_fts').get() as { c: number }
    expect(ftsCount.c).toBe(1)

    const hit = db.prepare("SELECT path FROM files_fts WHERE files_fts MATCH '注意力'").get() as
      | { path: string }
      | undefined
    expect(hit?.path).toBe('notes/x.md')
  })
})
```

- [ ] **Step 3: Run the test to confirm it fails**

```bash
npx vitest run electron/services/search/rebuild.test.ts
```

Expected: FAIL — `Cannot find module './rebuild'`.

- [ ] **Step 4: Implement the detector + a stub `rebuildFts`**

Create `electron/services/search/rebuild.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import type Database from 'better-sqlite3'
import log from 'electron-log'
import { parseFile } from '../frontmatter'

const PROGRESS_EVERY_PCT = 5
const BATCH_SIZE = 100

export const rebuildEvents = new EventEmitter()

export interface RebuildProgressPayload {
  done: number
  total: number
}

interface FilesCountRow {
  c: number
}
interface FileRow {
  path: string
  title: string | null
}

/** Returns true if a rebuild was triggered (and completed). */
export async function maybeRebuildFts(db: Database.Database, groveRoot: string): Promise<boolean> {
  const filesCount = (db.prepare('SELECT COUNT(*) AS c FROM files').get() as FilesCountRow).c
  const ftsCount = (db.prepare('SELECT COUNT(*) AS c FROM files_fts').get() as FilesCountRow).c

  if (filesCount === 0 || ftsCount > 0) {
    log.info('[search] maybeRebuildFts: skip', { filesCount, ftsCount })
    return false
  }

  log.info('[search] fts rebuild start', { total: filesCount })
  await rebuildFts(db, groveRoot, filesCount)
  log.info('[search] fts rebuild done', { total: filesCount })
  return true
}

export async function rebuildFts(
  db: Database.Database,
  groveRoot: string,
  expectedTotal?: number
): Promise<void> {
  const total =
    expectedTotal ?? (db.prepare('SELECT COUNT(*) AS c FROM files').get() as FilesCountRow).c
  if (total === 0) return

  const rows = db.prepare('SELECT path, title FROM files ORDER BY path').all() as FileRow[]

  // Read every file's body off disk first so the transaction is short.
  // Errors are logged and the row is skipped — rebuild is best-effort.
  let done = 0
  let lastEmittedPct = -1

  const insert = db.prepare(
    'INSERT OR REPLACE INTO files_fts(rowid, path, title, body) VALUES (?, ?, ?, ?)'
  )

  // Process in batches to keep transactions short and progress smooth.
  for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
    const batch = rows.slice(batchStart, batchStart + BATCH_SIZE)

    interface ReadResult {
      row: FileRow
      rowid: number
      body: string
    }
    const readResults: ReadResult[] = []
    for (const row of batch) {
      try {
        const abs = join(groveRoot, row.path)
        const raw = await readFile(abs, 'utf8')
        const { body } = parseFile(raw)
        const rowidRow = db.prepare('SELECT rowid FROM files WHERE path=?').get(row.path) as
          | { rowid: number }
          | undefined
        if (!rowidRow) {
          log.warn('[search] rebuild: rowid missing for path', { path: row.path })
          continue
        }
        readResults.push({ row, rowid: rowidRow.rowid, body })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log.warn('[search] rebuild: read failed', { path: row.path, msg })
      }
    }

    const tx = db.transaction(() => {
      for (const r of readResults) {
        insert.run(r.rowid, r.row.path, r.row.title ?? '', r.body)
      }
    })
    tx()

    done += batch.length
    const pct = Math.floor((done / total) * 100)
    if (pct - lastEmittedPct >= PROGRESS_EVERY_PCT || done === total) {
      lastEmittedPct = pct
      const payload: RebuildProgressPayload = { done, total }
      rebuildEvents.emit('progress', payload)
    }
  }

  rebuildEvents.emit('done', { total })
}
```

- [ ] **Step 5: Re-run the rebuild test**

```bash
npx vitest run electron/services/search/rebuild.test.ts
```

Expected: PASS — all three test cases.

- [ ] **Step 6: Wire `maybeRebuildFts` into `db.openForGrove`**

Edit `electron/services/db.ts:132-152` (the `openForGrove` function). The function is **synchronous** today (`Database.openForGrove(grovePath: string): void`); per design D5 the rebuild is async and runs in the background while the UI continues to load. Convert `openForGrove` to _fire and forget_ the rebuild — do not await it inside `openForGrove`, otherwise the renderer's `bootstrap:ready` event blocks for the whole rebuild duration.

Replace the body of `openForGrove`:

```ts
import { maybeRebuildFts } from './search/index' // add to existing imports at top

export function openForGrove(grovePath: string): void {
  closeCurrent()
  mkdirSync(join(grovePath, '.acornvo'), { recursive: true })
  const file = join(grovePath, '.acornvo', 'index.db')
  let db = new Database(file)
  applyPragmas(db)
  if (integrityCheck(db) !== 'ok') {
    db.close()
    backupCorruptDb(grovePath)
    db = new Database(file)
    applyPragmas(db)
    runMigrations(db, migrationsDir())
    current = db
    currentGrovePath = grovePath
    emitRebuilt()
    void maybeRebuildFts(db, grovePath).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err)
      // eslint-disable-next-line no-console
      console.error('[db] maybeRebuildFts failed', msg)
    })
    return
  }
  runMigrations(db, migrationsDir())
  current = db
  currentGrovePath = grovePath
  void maybeRebuildFts(db, grovePath).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err)
    // eslint-disable-next-line no-console
    console.error('[db] maybeRebuildFts failed', msg)
  })
}
```

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Run the full suite**

```bash
npm test
```

Expected: PASS for `electron/services/search/rebuild.test.ts` and `electron/services/db/migrations.test.ts`. Phase-05 indexer tests that touched `files_fts` columns may still fail — those are addressed in Plan 2 task 3.1.

- [ ] **Step 9: Commit**

```bash
git add electron/services/search/index.ts electron/services/search/rebuild.ts electron/services/search/rebuild.test.ts electron/services/db.ts
git commit -m "feat(phase-08): maybeRebuildFts detector + wire into openForGrove"
```

---

<!-- openspec-task: 2.2 -->

### Task 5: `rebuildFts` progress events (5%-or-500-rows cadence) + per-batch transactions

Task 4 already shipped a working `rebuildFts` that emits one `progress` event per batch. This task **hardens** the cadence and adds a dedicated test that the spec'd 5% step is honored.

**Files:**

- Modify: `electron/services/search/rebuild.ts` (refine progress cadence)
- Modify: `electron/services/search/rebuild.test.ts`

- [ ] **Step 1: Write the failing test for progress cadence**

Append to `electron/services/search/rebuild.test.ts`:

```ts
import { rebuildEvents, rebuildFts } from './rebuild'

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

    const events: { done: number; total: number }[] = []
    rebuildEvents.on('progress', (p: { done: number; total: number }) => events.push(p))

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
    db.prepare('INSERT INTO files (path, mtime, content_hash) VALUES (?, ?, ?)').run(
      'notes/a.md',
      0,
      'h'
    )

    const doneEvents: { total: number }[] = []
    rebuildEvents.on('done', (p: { total: number }) => doneEvents.push(p))

    await rebuildFts(db, grove)

    expect(doneEvents).toEqual([{ total: 1 }])
  })
})
```

- [ ] **Step 2: Run the test**

```bash
npx vitest run electron/services/search/rebuild.test.ts -t "progress events"
```

Expected: PASS as-is — the implementation in task 4 already emits `progress` per batch and `done` at the end. If it fails, dump `events` and tighten the cadence in `rebuild.ts`.

- [ ] **Step 3: Commit**

```bash
git add electron/services/search/rebuild.test.ts
git commit -m "test(phase-08): rebuildFts emits progress per 5% / per-batch cadence"
```

---

<!-- openspec-task: 2.3 -->

### Task 6: `search.rebuild()` IPC stub (manual entry — not exercised by phase-08 acceptance)

**Files:**

- Modify: `shared/ipc-contract.ts` (add `search.rebuild` to contract)
- Create: `electron/ipc/search.ts`
- Modify: `electron/ipc/handlers.ts` (or wherever the IPC namespaces are registered — see phase-04 pattern in `electron/ipc/handlers.ts`)

- [ ] **Step 1: Add `search` namespace to `shared/ipc-contract.ts`**

Find the `IpcContract` type in `shared/ipc-contract.ts` (around lines 125-163, after `file: { ... }`). Append a new namespace **inside** the `IpcContract` type:

```ts
export type IpcContract = {
  // ... existing namespaces (ping, log, project, db, file) unchanged ...
  search: {
    rebuild: () => { ok: true }
  }
}
```

> Note: Plans 2 expand this to add `quickSwitch`, `fullText`, `suggest`, `stats`. We add only `rebuild` here so the IPC handler shell is in place from the start.

- [ ] **Step 2: Create `electron/ipc/search.ts`**

```ts
// electron/ipc/search.ts
import { ipcMain } from 'electron'
import log from 'electron-log'
import { IpcError, type IpcContract, type IpcResult } from '@shared/ipc-contract'
import { requireCurrent, getCurrentGrovePath } from '../services/db'
import { rebuildFts } from '../services/search/rebuild'
import { _setRebuildingForTest, isRebuilding } from '../services/search/index'

type SearchContract = IpcContract['search']

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}
function err(code: 'E_INTERNAL' | 'E_INVALID_ARGS', message: string): IpcResult<never> {
  return { ok: false, error: { code, message } }
}

const handlers = {
  rebuild: async (): Promise<IpcResult<{ ok: true }>> => {
    try {
      const db = requireCurrent()
      const grove = getCurrentGrovePath()
      if (!grove) return err('E_INVALID_ARGS', 'no grove opened')
      if (isRebuilding()) return ok({ ok: true } as const)
      _setRebuildingForTest(true)
      try {
        await rebuildFts(db, grove)
      } finally {
        _setRebuildingForTest(false)
      }
      return ok({ ok: true } as const)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log.error('[ipc.search.rebuild]', msg)
      return err('E_INTERNAL', `E_INTERNAL: ${msg}`)
    }
  }
} satisfies Record<keyof SearchContract, (...args: never[]) => Promise<IpcResult<unknown>>>

export function registerSearchIpc(): void {
  ipcMain.handle('search.rebuild', () => handlers.rebuild())
}

// test-only export
export const searchHandlers = handlers
```

- [ ] **Step 3: Register the namespace in the IPC bootstrap**

Open `electron/ipc/handlers.ts` (the file that wires every namespace; pattern established in phase-01/02). Find the registration block where other `register*Ipc()` calls live and add:

```ts
import { registerSearchIpc } from './search'
// ... inside the function that registers all handlers:
registerSearchIpc()
```

If the file does not exist yet (different naming in this repo), find the equivalent (`electron/ipc/router.ts` or `electron/main/bootstrap.ts`) and add the registration in the same location.

```bash
grep -n "register.*Ipc" electron/ipc/*.ts electron/*.ts
```

Use the output to locate the right register block.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Smoke test the contract type**

Run:

```bash
node -e "console.log('ok')"  # placeholder — type validation happens via tsc above
```

The contract type is validated by `tsc` in step 4.

- [ ] **Step 6: Commit**

```bash
git add shared/ipc-contract.ts electron/ipc/search.ts electron/ipc/handlers.ts
git commit -m "feat(phase-08): search namespace + search.rebuild manual IPC"
```

---

<!-- openspec-task: 2.4 -->

### Task 7: `search.fullText` early-returns `pending: true` while rebuild is in flight

This task ships the **stub** of `search.fullText` so Plan 4 (UI) can integrate against a working contract. The full implementation (jieba + FTS5 MATCH) lands in Plan 2 task 4.3.

**Files:**

- Modify: `shared/ipc-contract.ts` (add `fullText` placeholder)
- Modify: `electron/ipc/search.ts` (add `fullText` handler that early-returns pending)
- Create: `electron/ipc/search.test.ts`

- [ ] **Step 1: Add `fullText` to the search contract**

Edit `shared/ipc-contract.ts` to expand `IpcContract.search`:

```ts
import type { FileSummary } from './file-types' // add this import near top with other type imports

export type IpcContract = {
  // ... unchanged ...
  search: {
    rebuild: () => { ok: true }
    fullText: (
      q: string,
      opts?: { limit?: number; offset?: number }
    ) => {
      items: { summary: FileSummary; snippet: string }[]
      total: number
      pending: boolean
    }
  }
}
```

- [ ] **Step 2: Write the failing test for the pending branch**

Create `electron/ipc/search.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { searchHandlers } from './search'
import * as searchIndex from '../services/search/index'
import * as dbService from '../services/db'

vi.mock('../services/db', async () => ({
  requireCurrent: vi.fn(),
  getCurrentGrovePath: vi.fn()
}))

describe('search.fullText (Plan 1 stub)', () => {
  beforeEach(() => {
    searchIndex._setRebuildingForTest(false)
    vi.mocked(dbService.requireCurrent).mockReturnValue({} as never)
    vi.mocked(dbService.getCurrentGrovePath).mockReturnValue('/tmp/grove')
  })

  it('returns { items: [], total: 0, pending: true } while rebuild is running', async () => {
    searchIndex._setRebuildingForTest(true)
    const result = await searchHandlers.fullText('注意力', { limit: 10, offset: 0 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual({ items: [], total: 0, pending: true })
    }
  })

  it('returns { items: [], total: 0, pending: false } when not rebuilding (Plan 1 stub returns empty)', async () => {
    searchIndex._setRebuildingForTest(false)
    const result = await searchHandlers.fullText('注意力')
    expect(result.ok).toBe(true)
    if (result.ok) {
      // Plan 1 stub: not rebuilding but search not implemented yet → empty + pending false
      expect(result.data).toEqual({ items: [], total: 0, pending: false })
    }
  })
})
```

- [ ] **Step 3: Run the test to confirm it fails**

```bash
npx vitest run electron/ipc/search.test.ts
```

Expected: FAIL — `searchHandlers.fullText` does not exist yet.

- [ ] **Step 4: Add the `fullText` handler stub**

Edit `electron/ipc/search.ts`. Add to the `handlers` object (just below `rebuild`):

```ts
const handlers = {
  rebuild: async (): Promise<IpcResult<{ ok: true }>> => {
    // ... unchanged ...
  },
  fullText: async (
    _q: string,
    _opts?: { limit?: number; offset?: number }
  ): Promise<IpcResult<{ items: never[]; total: number; pending: boolean }>> => {
    try {
      // Plan 1 stub: only the pending branch is wired. Plan 2 task 4.3 swaps in the full
      // jieba + FTS5 MATCH implementation. Until then, callers always get an empty list.
      if (isRebuilding()) {
        return ok({ items: [], total: 0, pending: true })
      }
      return ok({ items: [], total: 0, pending: false })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log.error('[ipc.search.fullText] stub error', msg)
      return err('E_INTERNAL', `E_INTERNAL: ${msg}`)
    }
  }
} satisfies Record<keyof SearchContract, (...args: never[]) => Promise<IpcResult<unknown>>>
```

Add to `registerSearchIpc()`:

```ts
export function registerSearchIpc(): void {
  ipcMain.handle('search.rebuild', () => handlers.rebuild())
  ipcMain.handle('search.fullText', (_e, q: string, opts?: { limit?: number; offset?: number }) =>
    handlers.fullText(q, opts)
  )
}
```

- [ ] **Step 5: Re-run the test**

```bash
npx vitest run electron/ipc/search.test.ts
```

Expected: PASS — both cases.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add shared/ipc-contract.ts electron/ipc/search.ts electron/ipc/search.test.ts
git commit -m "feat(phase-08): search.fullText stub returns pending:true during rebuild"
```

---

## Self-review checklist (run before handing off)

- [ ] Migration 002 SQL: `DROP TABLE IF EXISTS files_fts;` then `CREATE VIRTUAL TABLE files_fts USING fts5(path UNINDEXED, title, body, tokenize='trigram');` — no other DDL.
- [ ] After running `npx vitest run electron/services/db/migrations.test.ts`, `PRAGMA user_version` is 2 and `PRAGMA table_info('files_fts')` returns columns `[path, title, body]`.
- [ ] `electron/services/search/index.ts` exports `isRebuilding()` (used by Plan 2 task 4.3) and `_setRebuildingForTest()` (used by tests).
- [ ] `rebuildFts` reads each file via `readFile + parseFile` and writes the parsed `body` (not the raw file with frontmatter) to `files_fts.body`.
- [ ] `maybeRebuildFts` is fired-and-forgotten from `db.openForGrove` so the renderer's `bootstrap:ready` is not blocked.
- [ ] `search.rebuild` and `search.fullText` are registered on `ipcMain` and round-trip through `IpcResult<T>` (`{ ok: true, data }` / `{ ok: false, error }`).
- [ ] No phase-08 task references `setTokenizer/getTokenizer` — those are explicitly deprecated in task 3 step 2 and removed in Plan 2 task 3.1.
- [ ] Each task ends with a single commit. No multi-commit tasks.
- [ ] All seven OpenSpec labels (1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4) appear exactly once as `<!-- openspec-task: ... -->` annotations.
