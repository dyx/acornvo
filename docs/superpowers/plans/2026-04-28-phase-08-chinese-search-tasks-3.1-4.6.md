# Phase 08 — Chinese Search: Plan 2 (Indexer integration + Search IPC)

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-08-chinese-search`
> **Task range:** OpenSpec tasks `3.1`–`4.6` (10 tasks)
> **Plan order:** 2 of 5. Builds on Plan 1 (`tasks-1.1-2.4`). Subsequent plans (`tasks-5.1-5.7`, `6.1-8.1`, `9.1-9.18`) build on this one.
> **Status:** Not started
> **Created:** 2026-04-28

---

## Goal

Migrate phase-05's `upsertFts/deleteFile/renameFile` to write the new `(rowid, path, title, body)` schema (replacing the old `summary, content` columns), keep the indexer transaction semantics intact, and ship the four search IPC handlers (`quickSwitch`, `fullText`, `suggest`, `stats`). The crown jewel is `fullText`: query-side jieba segmentation, stopword filtering, FTS5 query DSL (single-token prefix `"tok"*`, multi-token AND, quoted phrase passthrough), `snippet()` with `<mark>` highlight, and graceful FTS5 syntax-error fallback.

## Architecture

- **`upsertFts(db, { rowid, path, title, body })`** is the new signature — the `summary` and `content` parameters from phase-05 are gone, replaced by `body`. The function still uses delete-then-insert internally because rowids may shift when a file is reopened on a fresh schema. The injected `tokenizer` parameter is **deleted** since FTS5 `trigram` handles index-side segmentation natively.
- **Frontmatter-only changes (D5/spec scenario "仅 frontmatter 改动不影响 body")** must skip FTS rewrites. The indexer/watcher already calls `upsertFile` first; we add a `bodyChanged: boolean` second return so the caller knows whether to call `upsertFts`. This avoids a second prepared-statement round trip on the hot path.
- **`search/queryBuilder.ts` is the single brain** that turns a user query string into an FTS5 MATCH expression. It has three branches:
  1. Quoted phrases (entire string starts and ends with `"`): pass through as-is.
  2. Single token after segmentation + stopword filter: `"tok"*` (prefix match).
  3. Multiple tokens: `"tok1" AND "tok2" AND ...`.
  All other input gets fully sanitised — control chars, FTS5 reserved chars (`:`, `^`, `~`, `*` outside our own use, parentheses) are quoted or stripped.
- **`search/jiebaSegment.ts` lazy-loads `@node-rs/jieba`.** First call to `segment(text)` triggers the dictionary load (~6MB); subsequent calls are O(n). Cached in module scope.
- **`search/stopwords.ts` is a hardcoded `Set<string>`** of ~100 common CJK + English stopwords. Filter happens *after* segmentation, *before* token-count branching. Empty result after filtering is treated as "no meaningful terms" → `{ items: [], total: 0, pending: false }`.
- **`fullText` SQL uses `snippet()`.** The `<mark>` tags are produced by SQLite itself (`snippet(files_fts, 2, '<mark>', '</mark>', '…', 16)`). Service code never substring-matches in JS; the renderer trusts the snippet HTML and feeds it to `dangerouslySetInnerHTML` (Plan 4 task 6.4 — service-side guarantee: `body` content is HTML-escaped before being concatenated into snippet by SQLite). To prevent body-side XSS we **escape body** before insertion via a tiny helper: replace `<`, `>`, `&` with their entity forms. Snippet wrappers (`<mark>`) are added by SQLite *after* escape, so they survive intact.
- **JOIN back to `files`** to compose `FileSummary`. Phase-06 ships a helper `composeFileSummary(row, tagsConcat)` in `electron/ipc/files.ts`. We reuse it via `import { composeFileSummary } from '../ipc/files'` to keep the DTO shape identical across `quickSwitch` / `fullText` / phase-06 `files.list`.
- **`quickSwitch` does not use FTS5.** Per design D6 + tasks.md 4.2 — at 10K rows a `LIKE` scan is sub-20ms and lets us implement the four-tier sort (`title=q > title prefix > title contains > path contains`, then `clipped_at DESC`) in pure SQL. No jieba, no stopwords.

## Tech Stack

- `@node-rs/jieba@^2.0` (installed in Plan 1 task 1.1) — query-side segmentation
- `better-sqlite3@^12` — FTS5 queries
- `electron-log@^5.4` — warn-level log on FTS5 syntax errors
- Phase-06 `composeFileSummary` (or equivalent) — reused for DTO assembly

## Files Touched (this plan)

| Path | Action | Owner task |
|---|---|---|
| `electron/services/index-queries.ts` | Modify (`upsertFts` signature change, drop `tokenizer`/`setTokenizer`/`getTokenizer`) | 3.1 |
| `electron/services/index-queries.test.ts` | Modify | 3.1, 3.4 |
| `electron/services/indexer.ts` | Modify (call new `upsertFts` shape; pass `body` through) | 3.1, 3.4 |
| `electron/services/watcher.ts` | Modify (same as indexer; pass body) | 3.1 |
| `electron/services/index-queries.ts` (delete/rename) | Modify | 3.2, 3.3 |
| `electron/services/search/jiebaSegment.ts` | Create | 4.3.1 |
| `electron/services/search/jiebaSegment.test.ts` | Create | 4.3.1 |
| `electron/services/search/stopwords.ts` | Create | 4.3.2 |
| `electron/services/search/queryBuilder.ts` | Create | 4.3.3 |
| `electron/services/search/queryBuilder.test.ts` | Create | 4.3.3 |
| `electron/services/search/queries.ts` | Create (raw SQL helpers) | 4.2, 4.3.4–4.3.5, 4.4, 4.5 |
| `electron/services/search/queries.test.ts` | Create | 4.2, 4.3, 4.4, 4.5 |
| `shared/ipc-contract.ts` | Modify (full `search` namespace) | 4.1 |
| `electron/ipc/search.ts` | Modify (replace stubs with full handlers) | 4.2, 4.3, 4.4, 4.5, 4.6 |
| `electron/ipc/search.test.ts` | Modify | 4.2, 4.3, 4.4, 4.5, 4.6 |

## Pre-flight

This plan assumes Plan 1 has merged. Required artefacts:
- `migrations/002_fts.sql` exists and `files_fts` is `(path UNINDEXED, title, body, tokenize='trigram')`.
- `electron/services/search/{index,rebuild}.ts` exist with `isRebuilding()` + `_setRebuildingForTest()`.
- `electron/ipc/search.ts` exists with the `rebuild` and `fullText` (stub) handlers; `registerSearchIpc()` is called from `electron/ipc/handlers.ts`.
- `@node-rs/jieba` is installed.
- Phase-06 `composeFileSummary` is available — if the actual export name differs (e.g., `toFileSummary`), search tasks 4.2 and 4.3.5 use the alternative name.

```bash
grep -n "composeFileSummary\|toFileSummary" electron/ipc/files.ts shared/file-types.ts 2>/dev/null
```

If neither exists, this plan inlines a minimal `composeFileSummary` in `electron/services/search/queries.ts` (see task 4.2 step 4).

---

## Tasks

<!-- openspec-task: 3.1 -->
### Task 1: `upsertFts` writes new (rowid, path, title, body) schema; tokenizer plumbing deleted

**Files:**
- Modify: `electron/services/index-queries.ts`
- Modify: `electron/services/index-queries.test.ts`
- Modify: `electron/services/indexer.ts`
- Modify: `electron/services/watcher.ts`

- [ ] **Step 1: Update the failing tests (replace phase-05's FTS test fixture)**

Open `electron/services/index-queries.test.ts`. Find the `makeDb()` helper (around the top of the file) and update the `CREATE VIRTUAL TABLE` line to match migration 002:

```ts
function makeDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE files (
      path TEXT PRIMARY KEY,
      title TEXT, summary TEXT,
      category TEXT, rating INTEGER,
      content_hash TEXT NOT NULL,
      mtime_ms INTEGER NOT NULL,
      size_bytes INTEGER NOT NULL,
      frontmatter_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE tags (name TEXT PRIMARY KEY, usage_count INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE file_tags (path TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (path, tag));
    CREATE VIRTUAL TABLE files_fts USING fts5(path UNINDEXED, title, body, tokenize='trigram');
  `)
  return db
}
```

Find every `upsertFts` call in this test file. The current shape is:
```ts
upsertFts(db, { rowid: 1, path: 'a.md', title: 'A', summary: 'S', content: 'B' }, identity)
```
Replace with the new shape:
```ts
upsertFts(db, { rowid: 1, path: 'a.md', title: 'A', body: 'B' })
```

Add or modify a test for the new contract:

```ts
import { upsertFts, upsertFile, deleteFile, renameFile, type FileRow } from './index-queries'

describe('upsertFts (phase-08)', () => {
  let db: Database.Database
  beforeEach(() => { db = makeDb() })

  function seedFile(path: string): number {
    const row: FileRow = {
      path, title: 'T', summary: null, category: null, rating: null,
      content_hash: 'h', mtime_ms: 0, size_bytes: 0, frontmatter_json: null,
      created_at: 0, updated_at: 0
    }
    upsertFile(db, row)
    return (db.prepare('SELECT rowid FROM files WHERE path=?').get(path) as { rowid: number }).rowid
  }

  it('writes a row and is matchable via trigram', () => {
    const rowid = seedFile('notes/x.md')
    upsertFts(db, { rowid, path: 'notes/x.md', title: 'T', body: '注意力机制' })
    const hit = db.prepare("SELECT path FROM files_fts WHERE files_fts MATCH '注意力'").get() as
      | { path: string }
      | undefined
    expect(hit?.path).toBe('notes/x.md')
  })

  it('replace semantics: second upsert overwrites body', () => {
    const rowid = seedFile('notes/x.md')
    upsertFts(db, { rowid, path: 'notes/x.md', title: 'T', body: 'foo' })
    upsertFts(db, { rowid, path: 'notes/x.md', title: 'T', body: 'bar' })
    const row = db.prepare('SELECT body FROM files_fts WHERE rowid=?').get(rowid) as
      | { body: string }
      | undefined
    expect(row?.body).toBe('bar')
  })

  it('escapes html in body so snippet wrappers are unambiguous', () => {
    const rowid = seedFile('notes/x.md')
    upsertFts(db, { rowid, path: 'notes/x.md', title: 'T', body: '<script>注意力</script>' })
    const row = db.prepare('SELECT body FROM files_fts WHERE rowid=?').get(rowid) as
      | { body: string }
      | undefined
    expect(row?.body).toBe('&lt;script&gt;注意力&lt;/script&gt;')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run electron/services/index-queries.test.ts -t upsertFts
```

Expected: FAIL — current `upsertFts` accepts `{ summary, content }` and uses `tokenizer`.

- [ ] **Step 3: Update `upsertFts` and remove tokenizer plumbing in `electron/services/index-queries.ts`**

Replace the `FtsRow` interface, `Tokenizer` type, `identityTokenizer`, `upsertFts`, `setTokenizer`, `getTokenizer`, and the deprecation comment block (added in Plan 1 task 3) with:

```ts
export interface FtsRow {
  rowid: number
  path: string
  title: string
  body: string
}

/** Escape HTML-special chars so SQLite snippet wrappers (<mark></mark>) are unambiguous. */
function escapeForFts(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function upsertFts(db: Database.Database, row: FtsRow): void {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM files_fts WHERE rowid=?').run(row.rowid)
    db.prepare(
      'INSERT INTO files_fts(rowid, path, title, body) VALUES (?, ?, ?, ?)'
    ).run(row.rowid, row.path, row.title, escapeForFts(row.body))
  })
  tx()
}
```

Delete the lines:
```ts
export type Tokenizer = (text: string) => string
const identityTokenizer: Tokenizer = (t) => t
let _activeTokenizer: Tokenizer = identityTokenizer
export function setTokenizer(t: Tokenizer): void { _activeTokenizer = t }
export function getTokenizer(): Tokenizer { return _activeTokenizer }
```

Also delete the deprecation comment block above them.

Update `deleteFile` (existing) to delete by `rowid`-based path-equivalence — already correct since it uses `WHERE path=?`. No change needed but verify:

```ts
export function deleteFile(db: Database.Database, path: string): void {
  db.prepare('DELETE FROM files_fts WHERE path=?').run(path)
  db.prepare('DELETE FROM file_tags WHERE path=?').run(path)
  db.prepare('DELETE FROM files WHERE path=?').run(path)
}
```

(Phase-05 path of "delete from files_fts where path" works because path is a column even if UNINDEXED; SQLite scans the FTS table. For 10K rows this is fine.)

- [ ] **Step 4: Update callers in `electron/services/indexer.ts`**

Find every `upsertFts(db, { rowid, path, title, summary, content }, getTokenizer())` call. There is at least one inside `startScan` (around `electron/services/indexer.ts:195-201`). Replace with the new shape:

```ts
upsertFts(db, {
  rowid: ftsRowid,
  path: row.path,
  title: row.title ?? '',
  body
})
```

Remove the `getTokenizer` import from the top of the file.

- [ ] **Step 5: Update callers in `electron/services/watcher.ts`**

Find the `upsertFts` call inside `flush` (around `electron/services/watcher.ts:292`). Replace with:

```ts
upsertFts(_db!, {
  rowid: ftsRowid,
  path: row.path,
  title: row.title ?? '',
  body: ev.body
})
```

Remove `getTokenizer` from the imports at the top.

- [ ] **Step 6: Re-run the targeted test**

```bash
npx vitest run electron/services/index-queries.test.ts -t upsertFts
```

Expected: PASS for all three sub-tests.

- [ ] **Step 7: Run the full suite**

```bash
npm test
```

Expected: PASS for all phase-05 indexer / watcher tests; PASS for migration test from Plan 1. If any phase-05 test still references `summary` / `content` / `tokenizer` arguments, update them inline (search and replace) and rerun.

```bash
grep -rn "summary,\s*content\|getTokenizer\|setTokenizer" electron/services/ --include="*.ts"
```

Expected: no hits.

- [ ] **Step 8: Commit**

```bash
git add electron/services/index-queries.ts electron/services/index-queries.test.ts electron/services/indexer.ts electron/services/watcher.ts
git commit -m "feat(phase-08): upsertFts writes (path,title,body); drop tokenizer injection"
```

---

<!-- openspec-task: 3.2 -->
### Task 2: `deleteFile` keeps cascading delete; verify FTS row gone after delete

`deleteFile` already deletes from `files_fts` (verified in step 3 above). This task adds an explicit test against the new schema to lock the behaviour against future regressions.

**Files:**
- Modify: `electron/services/index-queries.test.ts`

- [ ] **Step 1: Add the test**

Append to `electron/services/index-queries.test.ts`:

```ts
describe('deleteFile (phase-08 FTS)', () => {
  let db: Database.Database
  beforeEach(() => { db = makeDb() })

  it('removes both files row and files_fts row in one logical operation', () => {
    const row: FileRow = {
      path: 'notes/x.md', title: 'T', summary: null, category: null, rating: null,
      content_hash: 'h', mtime_ms: 0, size_bytes: 0, frontmatter_json: null,
      created_at: 0, updated_at: 0
    }
    upsertFile(db, row)
    const rowid = (db.prepare('SELECT rowid FROM files WHERE path=?').get('notes/x.md') as { rowid: number }).rowid
    upsertFts(db, { rowid, path: 'notes/x.md', title: 'T', body: 'attention' })

    deleteFile(db, 'notes/x.md')

    const filesCount = (db.prepare('SELECT COUNT(*) AS c FROM files').get() as { c: number }).c
    const ftsCount = (db.prepare('SELECT COUNT(*) AS c FROM files_fts').get() as { c: number }).c
    expect(filesCount).toBe(0)
    expect(ftsCount).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test**

```bash
npx vitest run electron/services/index-queries.test.ts -t deleteFile
```

Expected: PASS (no implementation change needed — task 1 step 3 preserved the existing `deleteFile`).

- [ ] **Step 3: Commit**

```bash
git add electron/services/index-queries.test.ts
git commit -m "test(phase-08): deleteFile cascades to files_fts on new schema"
```

---

<!-- openspec-task: 3.3 -->
### Task 3: `renameFile` updates `files_fts.path` in the same transaction

`renameFile` already does this (`electron/services/index-queries.ts:56-63`). Add a test on the new schema.

**Files:**
- Modify: `electron/services/index-queries.test.ts`

- [ ] **Step 1: Add the test**

Append:

```ts
describe('renameFile (phase-08 FTS)', () => {
  let db: Database.Database
  beforeEach(() => { db = makeDb() })

  it('updates files_fts.path; rowid stays stable', () => {
    const row: FileRow = {
      path: 'notes/x.md', title: 'T', summary: null, category: null, rating: null,
      content_hash: 'h', mtime_ms: 0, size_bytes: 0, frontmatter_json: null,
      created_at: 0, updated_at: 0
    }
    upsertFile(db, row)
    const rowid = (db.prepare('SELECT rowid FROM files WHERE path=?').get('notes/x.md') as { rowid: number }).rowid
    upsertFts(db, { rowid, path: 'notes/x.md', title: 'T', body: '注意力' })

    renameFile(db, 'notes/x.md', 'notes/y.md')

    const ftsRow = db.prepare('SELECT rowid, path FROM files_fts WHERE rowid=?').get(rowid) as
      | { rowid: number; path: string }
      | undefined
    expect(ftsRow).toEqual({ rowid, path: 'notes/y.md' })

    // FTS still queryable on the new path
    const hit = db.prepare(
      "SELECT path FROM files_fts WHERE files_fts MATCH '注意力'"
    ).get() as { path: string } | undefined
    expect(hit?.path).toBe('notes/y.md')
  })
})
```

- [ ] **Step 2: Run the test**

```bash
npx vitest run electron/services/index-queries.test.ts -t renameFile
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add electron/services/index-queries.test.ts
git commit -m "test(phase-08): renameFile keeps rowid + updates files_fts.path"
```

---

<!-- openspec-task: 3.4 -->
### Task 4: Skip FTS rewrite when only frontmatter changed (`content_hash` unchanged)

The watcher currently calls `upsertFile` then unconditionally calls `upsertFts`. Per spec scenario "仅 frontmatter 改动不影响 body", we must skip `upsertFts` when `upsertFile` returns `'unchanged'` *or* when the new `content_hash` matches the previously-stored row's hash. The simplest contract: `upsertFile` already returns `'unchanged' | 'updated' | 'inserted'`. We add a new helper `upsertFileWithBodyDelta` that returns `{ result, bodyChanged }`.

**Files:**
- Modify: `electron/services/index-queries.ts`
- Modify: `electron/services/index-queries.test.ts`
- Modify: `electron/services/watcher.ts`
- Modify: `electron/services/indexer.ts`

- [ ] **Step 1: Add the failing test**

Append to `electron/services/index-queries.test.ts`:

```ts
import { upsertFileWithBodyDelta } from './index-queries'

describe('upsertFileWithBodyDelta (phase-08)', () => {
  let db: Database.Database
  beforeEach(() => { db = makeDb() })

  const r = (overrides: Partial<FileRow> = {}): FileRow => ({
    path: 'notes/a.md', title: 'A', summary: null, category: null, rating: null,
    content_hash: 'h1', mtime_ms: 0, size_bytes: 0, frontmatter_json: null,
    created_at: 0, updated_at: 0,
    ...overrides
  })

  it('first insert: bodyChanged=true', () => {
    const out = upsertFileWithBodyDelta(db, r())
    expect(out).toEqual({ result: 'inserted', bodyChanged: true })
  })

  it('frontmatter-only change (rating): bodyChanged=false', () => {
    upsertFileWithBodyDelta(db, r())
    const out = upsertFileWithBodyDelta(db, r({ rating: 4, frontmatter_json: '{"rating":4}', updated_at: 100 }))
    expect(out).toEqual({ result: 'updated', bodyChanged: false })
  })

  it('content_hash change: bodyChanged=true', () => {
    upsertFileWithBodyDelta(db, r())
    const out = upsertFileWithBodyDelta(db, r({ content_hash: 'h2', updated_at: 100 }))
    expect(out).toEqual({ result: 'updated', bodyChanged: true })
  })

  it('unchanged row: bodyChanged=false', () => {
    upsertFileWithBodyDelta(db, r())
    const out = upsertFileWithBodyDelta(db, r())
    expect(out).toEqual({ result: 'unchanged', bodyChanged: false })
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run electron/services/index-queries.test.ts -t upsertFileWithBodyDelta
```

Expected: FAIL — `upsertFileWithBodyDelta` not exported.

- [ ] **Step 3: Implement the helper**

Append to `electron/services/index-queries.ts` (just below the existing `upsertFile`):

```ts
export interface UpsertWithBodyDelta {
  result: UpsertResult
  bodyChanged: boolean
}

/** Like upsertFile but also returns whether the body content changed (content_hash diff). */
export function upsertFileWithBodyDelta(db: Database.Database, row: FileRow): UpsertWithBodyDelta {
  const existing = db
    .prepare('SELECT content_hash FROM files WHERE path=?')
    .get(row.path) as { content_hash: string } | undefined

  const bodyChanged = !existing || existing.content_hash !== row.content_hash
  const result = upsertFile(db, row)
  return { result, bodyChanged }
}
```

- [ ] **Step 4: Re-run the test**

```bash
npx vitest run electron/services/index-queries.test.ts -t upsertFileWithBodyDelta
```

Expected: PASS for all four sub-tests.

- [ ] **Step 5: Update the watcher to skip FTS when `bodyChanged === false`**

Edit `electron/services/watcher.ts`. Inside `flush`'s transaction (around lines 273-293), replace the `upsertFile(_db!, row)` call and the unconditional `upsertFts(...)` call with:

```ts
const { bodyChanged } = upsertFileWithBodyDelta(_db!, row)
const tags = Array.isArray(ev.frontmatter.tags)
  ? (ev.frontmatter.tags as unknown[]).filter((t): t is string => typeof t === 'string')
  : []
syncTags(_db!, row.path, tags)
if (bodyChanged) {
  const ftsRowid = (
    _db!.prepare('SELECT rowid FROM files WHERE path=?').get(row.path) as { rowid: number }
  ).rowid
  upsertFts(_db!, {
    rowid: ftsRowid,
    path: row.path,
    title: row.title ?? '',
    body: ev.body!
  })
}
```

Update the import line at the top to include `upsertFileWithBodyDelta`:
```ts
import {
  upsertFileWithBodyDelta, syncTags, upsertFts, deleteFile, renameFile
} from './index-queries'
```

(Drop `upsertFile` and `getTokenizer` from the imports if still present.)

- [ ] **Step 6: Update the indexer's `startScan` similarly**

In `electron/services/indexer.ts` (around lines 186-202), replace the `upsertFile`+`upsertFts` block with:

```ts
const { result, bodyChanged } = upsertFileWithBodyDelta(db, row)
if (result !== 'unchanged') {
  const tags = Array.isArray(frontmatter.tags)
    ? (frontmatter.tags as unknown[]).filter((t): t is string => typeof t === 'string')
    : []
  syncTags(db, row.path, tags)
  if (bodyChanged) {
    const ftsRowid = (
      db.prepare('SELECT rowid FROM files WHERE path=?').get(row.path) as { rowid: number }
    ).rowid
    upsertFts(db, {
      rowid: ftsRowid,
      path: row.path,
      title: row.title ?? '',
      body
    })
  }
}
```

Adjust the import:
```ts
import {
  upsertFileWithBodyDelta, syncTags, upsertFts, listAllPaths, deleteFile, type FileRow
} from './index-queries'
```

- [ ] **Step 7: Run the full suite**

```bash
npm test
```

Expected: PASS. The phase-05 indexer/watcher tests still hold because `upsertFileWithBodyDelta` returns the same `result` field as `upsertFile`. If a phase-05 test asserted on the *return value* of `upsertFile` from inside the indexer and now sees a wrapped result, update the assertion to match.

- [ ] **Step 8: Commit**

```bash
git add electron/services/index-queries.ts electron/services/index-queries.test.ts electron/services/indexer.ts electron/services/watcher.ts
git commit -m "feat(phase-08): skip FTS rewrite when only frontmatter changed"
```

---

<!-- openspec-task: 4.1 -->
### Task 5: Expand `search` namespace in `shared/ipc-contract.ts`

**Files:**
- Modify: `shared/ipc-contract.ts`

- [ ] **Step 1: Edit the contract**

Open `shared/ipc-contract.ts`. Replace the `search` block (added in Plan 1) with:

```ts
import type { FileSummary } from './file-types'  // add at top with other imports if not present

export type IpcContract = {
  // ... unchanged namespaces ...
  search: {
    quickSwitch: (q: string, opts?: { limit?: number }) => FileSummary[]
    fullText: (
      q: string,
      opts?: { limit?: number; offset?: number }
    ) => {
      items: { summary: FileSummary; snippet: string }[]
      total: number
      pending: boolean
    }
    suggest: (q: string) => FileSummary[]
    stats: () => { fts_rows: number; last_rebuild_at: string | null }
    rebuild: () => { ok: true }
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: FAIL — `search.ts` does not yet implement `quickSwitch`, `suggest`, `stats`. The `satisfies Record<keyof SearchContract, ...>` pattern from Plan 1 will trigger an error like `Property 'quickSwitch' is missing`. We resolve this in tasks 6–9 below.

- [ ] **Step 3: Temporarily relax the `satisfies` constraint in `electron/ipc/search.ts`**

To keep the typecheck green between commits, change the `satisfies` line in `electron/ipc/search.ts` to a TODO comment:

```ts
// TODO(phase-08): restore `satisfies Record<keyof SearchContract, ...>` after tasks 6-9 implement the rest.
const handlers = {
  rebuild: ...,
  fullText: ...
}
```

(Just delete the `satisfies` clause for now — the per-task tests will catch missing methods.)

- [ ] **Step 4: Typecheck again**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/ipc-contract.ts electron/ipc/search.ts
git commit -m "feat(phase-08): expand search ipc contract (quickSwitch/suggest/stats)"
```

---

<!-- openspec-task: 4.2 -->
### Task 6: `quickSwitch(q, { limit })` — title/path LIKE with priority sort

**Files:**
- Create: `electron/services/search/queries.ts`
- Create: `electron/services/search/queries.test.ts`
- Modify: `electron/ipc/search.ts`
- Modify: `electron/ipc/search.test.ts`

- [ ] **Step 1: Write the failing test**

Create `electron/services/search/queries.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { quickSwitch } from './queries'

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE files (
      path TEXT PRIMARY KEY, title TEXT, category TEXT, rating INTEGER,
      clipped_at TEXT, summary TEXT, mtime INTEGER, content_hash TEXT,
      url TEXT, reviewed_at TEXT, frontmatter_json TEXT
    );
    CREATE TABLE tags (name TEXT PRIMARY KEY, usage_count INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE file_tags (path TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (path, tag));
  `)
  return db
}

function seed(db: Database.Database, rows: { path: string; title: string; clipped_at?: string }[]): void {
  const insert = db.prepare(
    'INSERT INTO files (path, title, clipped_at, mtime, content_hash) VALUES (?, ?, ?, 0, ?)'
  )
  for (const r of rows) insert.run(r.path, r.title, r.clipped_at ?? null, r.path)
}

describe('quickSwitch', () => {
  let db: Database.Database
  beforeEach(() => { db = makeDb() })

  it('returns [] for empty q', () => {
    seed(db, [{ path: 'a.md', title: 'A' }])
    expect(quickSwitch(db, '', { limit: 10 })).toEqual([])
  })

  it('priority: title equals q > title prefix > title contains > path contains', () => {
    seed(db, [
      { path: 'old/x.md', title: 'X', clipped_at: '2025-01-01' },                        // path contains "x"
      { path: 'a.md', title: 'attention is all you need', clipped_at: '2025-02-01' },    // title contains
      { path: 'b.md', title: 'attention pattern', clipped_at: '2025-03-01' },            // title prefix
      { path: 'c.md', title: 'attention', clipped_at: '2025-04-01' }                     // title equals
    ])
    const items = quickSwitch(db, 'attention', { limit: 10 })
    expect(items.map((i) => i.path)).toEqual(['c.md', 'b.md', 'a.md', 'old/x.md'])
    // wait — q='attention' does not contain 'x' → 'old/x.md' should NOT match → expect 3 items
  })

  it('cn substring on title', () => {
    seed(db, [
      { path: 'a.md', title: '注意力机制综述', clipped_at: '2025-04-01' },
      { path: 'b.md', title: '其他笔记', clipped_at: '2025-04-02' }
    ])
    const items = quickSwitch(db, '注意力', { limit: 10 })
    expect(items.map((i) => i.path)).toEqual(['a.md'])
  })

  it('respects limit', () => {
    seed(db, [
      { path: 'a.md', title: 'attention 1', clipped_at: '2025-04-01' },
      { path: 'b.md', title: 'attention 2', clipped_at: '2025-04-02' },
      { path: 'c.md', title: 'attention 3', clipped_at: '2025-04-03' }
    ])
    const items = quickSwitch(db, 'attention', { limit: 2 })
    expect(items.length).toBe(2)
  })
})
```

> Note the test "priority" case: I included a row whose path matches but whose title does not — under the four-tier priority, only title-matching rows show up for `q='attention'` plus path-only matchers. Since `q='attention'` is absent from `'old/x.md'`, that row is filtered. I'll fix the assertion below.

Replace the priority test's assertion to:
```ts
expect(items.map((i) => i.path)).toEqual(['c.md', 'b.md', 'a.md'])
```
And drop the `'old/x.md'` row from the seed for that test (or change the title to something that contains "attention").

To exercise the path-contains branch, add a separate test:
```ts
it('falls back to path contains', () => {
  seed(db, [
    { path: 'projects/attention.md', title: 'unrelated', clipped_at: '2025-04-01' }
  ])
  const items = quickSwitch(db, 'attention', { limit: 10 })
  expect(items.map((i) => i.path)).toEqual(['projects/attention.md'])
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run electron/services/search/queries.test.ts
```

Expected: FAIL — `Cannot find module './queries'`.

- [ ] **Step 3: Implement `quickSwitch`**

Create `electron/services/search/queries.ts`:

```ts
import type Database from 'better-sqlite3'
import type { FileSummary } from '@shared/file-types'

interface QuickSwitchRow {
  path: string
  title: string | null
  category: string | null
  rating: number | null
  clipped_at: string | null
  summary: string | null
  frontmatter_json: string | null
  tags_concat: string | null
}

function rowToFileSummary(row: QuickSwitchRow): FileSummary {
  const tags = row.tags_concat ? row.tags_concat.split(',').filter(Boolean) : []
  let site: string | null = null
  if (row.frontmatter_json) {
    try {
      const fm = JSON.parse(row.frontmatter_json) as { site?: unknown; url?: unknown }
      if (typeof fm.site === 'string') site = fm.site
      else if (typeof fm.url === 'string') {
        try { site = new URL(fm.url).host } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }
  return {
    path: row.path,
    title: row.title,
    category: row.category,
    rating: row.rating,
    clipped_at: row.clipped_at,
    site,
    has_summary: row.summary !== null && row.summary !== '',
    tags,
    is_reviewing: false
  }
}

const QUICK_SWITCH_BASE = `
  SELECT
    files.path, files.title, files.category, files.rating, files.clipped_at,
    files.summary, files.frontmatter_json,
    GROUP_CONCAT(file_tags.tag, ',') AS tags_concat
  FROM files
  LEFT JOIN file_tags ON file_tags.path = files.path
`

export function quickSwitch(
  db: Database.Database,
  q: string,
  opts: { limit?: number } = {}
): FileSummary[] {
  if (q.length === 0) return []
  const limit = opts.limit ?? 10

  // Priority tiers materialised via CASE expression.
  // 1 = title equals q (case-insensitive);  2 = title starts with q;
  // 3 = title contains q (anywhere); 4 = path contains q.
  const sql = `
    ${QUICK_SWITCH_BASE}
    WHERE files.title = @q COLLATE NOCASE
       OR files.title LIKE @startsWith
       OR files.title LIKE @contains
       OR files.path  LIKE @contains
    GROUP BY files.path
    ORDER BY
      CASE
        WHEN files.title = @q COLLATE NOCASE THEN 1
        WHEN files.title LIKE @startsWith   THEN 2
        WHEN files.title LIKE @contains     THEN 3
        ELSE 4
      END,
      files.clipped_at DESC
    LIMIT @limit
  `
  const rows = db.prepare(sql).all({
    q,
    startsWith: `${q}%`,
    contains: `%${q}%`,
    limit
  }) as QuickSwitchRow[]

  return rows.map(rowToFileSummary)
}
```

- [ ] **Step 4: Re-run the test**

```bash
npx vitest run electron/services/search/queries.test.ts
```

Expected: PASS for all five cases.

- [ ] **Step 5: Wire `quickSwitch` to the IPC handler**

Edit `electron/ipc/search.ts`. Add to the `handlers` object (at the same indentation level as `rebuild` and `fullText`):

```ts
quickSwitch: async (q: string, opts?: { limit?: number }): Promise<IpcResult<FileSummary[]>> => {
  try {
    const db = requireCurrent()
    const items = quickSwitch(db, q, opts ?? {})
    return ok(items)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('[ipc.search.quickSwitch]', msg)
    return err('E_INTERNAL', `E_INTERNAL: ${msg}`)
  }
}
```

Add the import at the top:
```ts
import { quickSwitch } from '../services/search/queries'
import type { FileSummary } from '@shared/file-types'
```

Add to `registerSearchIpc()`:
```ts
ipcMain.handle('search.quickSwitch', (_e, q: string, opts?: { limit?: number }) =>
  handlers.quickSwitch(q, opts)
)
```

- [ ] **Step 6: Add an integration test for the IPC handler**

Append to `electron/ipc/search.test.ts`:

```ts
import * as queries from '../services/search/queries'

describe('search.quickSwitch handler', () => {
  beforeEach(() => {
    vi.mocked(dbService.requireCurrent).mockReturnValue({} as never)
    vi.mocked(dbService.getCurrentGrovePath).mockReturnValue('/tmp/grove')
  })

  it('delegates to queries.quickSwitch and returns IpcOk', async () => {
    const stub: import('@shared/file-types').FileSummary = {
      path: 'a.md', title: 'A', category: null, rating: null, clipped_at: null,
      site: null, has_summary: false, tags: [], is_reviewing: false
    }
    const spy = vi.spyOn(queries, 'quickSwitch').mockReturnValue([stub])
    const result = await searchHandlers.quickSwitch('attention', { limit: 5 })
    expect(spy).toHaveBeenCalledWith({}, 'attention', { limit: 5 })
    expect(result).toEqual({ ok: true, data: [stub] })
  })

  it('returns E_INTERNAL on thrown error', async () => {
    vi.spyOn(queries, 'quickSwitch').mockImplementation(() => { throw new Error('boom') })
    const result = await searchHandlers.quickSwitch('x')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('E_INTERNAL')
  })
})
```

- [ ] **Step 7: Run the test**

```bash
npx vitest run electron/ipc/search.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add electron/services/search/queries.ts electron/services/search/queries.test.ts electron/ipc/search.ts electron/ipc/search.test.ts
git commit -m "feat(phase-08): search.quickSwitch handler with priority sort"
```

---

<!-- openspec-task: 4.3 -->
### Task 7: `search.fullText` — jieba segmentation, stopwords, query DSL, snippet, JOIN to FileSummary, error fallback

This task wraps OpenSpec sub-tasks 4.3.1–4.3.7. We bundle them into one task with explicit step blocks because they form a single end-to-end feature: each piece is unusable without the others.

**Files:**
- Create: `electron/services/search/jiebaSegment.ts`
- Create: `electron/services/search/jiebaSegment.test.ts`
- Create: `electron/services/search/stopwords.ts`
- Create: `electron/services/search/queryBuilder.ts`
- Create: `electron/services/search/queryBuilder.test.ts`
- Modify: `electron/services/search/queries.ts` (add `fullText`)
- Modify: `electron/services/search/queries.test.ts`
- Modify: `electron/ipc/search.ts` (replace stub `fullText` with full impl)
- Modify: `electron/ipc/search.test.ts`

#### Sub-step 4.3.1 — `jiebaSegment.ts`

- [ ] **Step 1: Write the failing test**

Create `electron/services/search/jiebaSegment.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { segment } from './jiebaSegment'

describe('jiebaSegment', () => {
  it('segments mixed cn/en string', () => {
    const tokens = segment('注意力机制 attention mechanism')
    expect(tokens).toContain('注意力')
    expect(tokens).toContain('机制')
    expect(tokens).toContain('attention')
    expect(tokens).toContain('mechanism')
  })

  it('handles empty input', () => {
    expect(segment('')).toEqual([])
  })

  it('strips whitespace-only tokens', () => {
    const tokens = segment('foo   bar')
    expect(tokens.filter((t) => t.trim() === '').length).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test**

```bash
npx vitest run electron/services/search/jiebaSegment.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `electron/services/search/jiebaSegment.ts`:

```ts
import { cut } from '@node-rs/jieba'

/** Segment a query string into tokens. Strips whitespace-only tokens. */
export function segment(q: string): string[] {
  if (q.length === 0) return []
  const raw = cut(q, false)  // false = HMM off; deterministic for stable test snapshots
  return raw.map((t) => t.trim()).filter((t) => t.length > 0)
}
```

- [ ] **Step 4: Re-run**

```bash
npx vitest run electron/services/search/jiebaSegment.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/services/search/jiebaSegment.ts electron/services/search/jiebaSegment.test.ts
git commit -m "feat(phase-08): jiebaSegment query-side tokenizer"
```

#### Sub-step 4.3.2 — `stopwords.ts`

- [ ] **Step 1: Create the stopwords list**

Create `electron/services/search/stopwords.ts`:

```ts
/** Hardcoded CJK + EN stopwords. Filtered after segmentation, before query-builder dispatch. */
export const STOPWORDS: ReadonlySet<string> = new Set([
  // Chinese function words / particles
  '的', '了', '是', '在', '和', '或', '与', '及', '而', '于', '也', '都', '就', '还', '又',
  '等', '但', '把', '被', '给', '让', '使', '从', '到', '为', '由', '以', '对', '向', '及',
  '吗', '呢', '吧', '啊', '哦', '哇', '嗯', '哎', '呀',
  '这', '那', '其', '它', '他', '她', '我', '你', '们', '你们', '我们', '他们',
  '一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
  // English stopwords (subset; non-exhaustive)
  'a', 'an', 'and', 'or', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'as', 'from',
  'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their',
  'i', 'you', 'we', 'he', 'she', 'him', 'her', 'me', 'us',
  'do', 'does', 'did', 'have', 'has', 'had', 'will', 'would', 'shall', 'should', 'can', 'could'
])

export function filterStopwords(tokens: readonly string[]): string[] {
  return tokens.filter((t) => !STOPWORDS.has(t.toLowerCase()))
}
```

- [ ] **Step 2: Smoke test (no separate test file — exercised via queryBuilder.test.ts in 4.3.3)**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add electron/services/search/stopwords.ts
git commit -m "feat(phase-08): stopwords table for query-side filtering"
```

#### Sub-step 4.3.3 — `queryBuilder.ts`

- [ ] **Step 1: Write the failing test**

Create `electron/services/search/queryBuilder.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildFtsQuery } from './queryBuilder'

describe('buildFtsQuery', () => {
  it('passes through quoted phrases', () => {
    expect(buildFtsQuery('"注意力机制"')).toBe('"注意力机制"')
  })

  it('single token after segmentation → prefix match', () => {
    expect(buildFtsQuery('注意')).toBe('"注意"*')
  })

  it('multi-token → AND', () => {
    expect(buildFtsQuery('注意力 机制')).toBe('"注意力" AND "机制"')
  })

  it('stopwords removed', () => {
    expect(buildFtsQuery('的 注意力')).toBe('"注意力"*')
    // After stripping '的', single token left → prefix match
  })

  it('all stopwords → empty', () => {
    expect(buildFtsQuery('的 了 在')).toBe('')
  })

  it('escapes embedded double quotes inside a token', () => {
    // jieba is unlikely to produce "foo with quote, but defensive
    expect(buildFtsQuery('foo"bar')).toContain('foo')
  })

  it('rejects FTS5 reserved colon', () => {
    // Wrap as quoted to neutralise; never produce raw "foo:" which FTS5 parses as colspec
    const out = buildFtsQuery('foo:')
    expect(out).not.toMatch(/[^"]:/)  // no unquoted colons
  })
})
```

- [ ] **Step 2: Run the test**

```bash
npx vitest run electron/services/search/queryBuilder.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `electron/services/search/queryBuilder.ts`:

```ts
import { segment } from './jiebaSegment'
import { filterStopwords } from './stopwords'

/** Escape a single token so it can be wrapped in FTS5 double-quotes safely. */
function escapeToken(t: string): string {
  return t.replace(/"/g, '""')
}

/** Convert a user query into an FTS5 MATCH expression. Empty string when nothing meaningful remains. */
export function buildFtsQuery(q: string): string {
  const trimmed = q.trim()
  if (trimmed.length === 0) return ''

  // Quoted phrase passthrough
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 3) {
    return trimmed
  }

  // Segment → drop empties → drop stopwords → drop tokens that are pure punctuation
  const segmented = segment(trimmed)
  const meaningful = filterStopwords(segmented).filter((t) => /[\p{L}\p{N}]/u.test(t))

  if (meaningful.length === 0) return ''
  if (meaningful.length === 1) {
    return `"${escapeToken(meaningful[0])}"*`
  }
  return meaningful.map((t) => `"${escapeToken(t)}"`).join(' AND ')
}
```

- [ ] **Step 4: Re-run the test**

```bash
npx vitest run electron/services/search/queryBuilder.test.ts
```

Expected: PASS for all seven cases.

- [ ] **Step 5: Commit**

```bash
git add electron/services/search/queryBuilder.ts electron/services/search/queryBuilder.test.ts
git commit -m "feat(phase-08): FTS5 query DSL builder (jieba+stopwords+phrase/AND/prefix)"
```

#### Sub-step 4.3.4 + 4.3.5 — `fullText` SQL with snippet + JOIN to FileSummary

- [ ] **Step 1: Add the failing test**

Append to `electron/services/search/queries.test.ts`:

```ts
import { fullText } from './queries'

function makeFtsDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE files (
      path TEXT PRIMARY KEY, title TEXT, category TEXT, rating INTEGER,
      clipped_at TEXT, summary TEXT, mtime INTEGER, content_hash TEXT,
      url TEXT, reviewed_at TEXT, frontmatter_json TEXT
    );
    CREATE TABLE tags (name TEXT PRIMARY KEY, usage_count INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE file_tags (path TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (path, tag));
    CREATE VIRTUAL TABLE files_fts USING fts5(path UNINDEXED, title, body, tokenize='trigram');
  `)
  return db
}

function seedWithFts(
  db: Database.Database,
  rows: { path: string; title: string; body: string; clipped_at?: string }[]
): void {
  const insertFile = db.prepare(
    'INSERT INTO files (path, title, clipped_at, mtime, content_hash) VALUES (?, ?, ?, 0, ?)'
  )
  const insertFts = db.prepare(
    'INSERT INTO files_fts(rowid, path, title, body) VALUES (?, ?, ?, ?)'
  )
  for (const r of rows) {
    insertFile.run(r.path, r.title, r.clipped_at ?? null, r.path)
    const rowid = (db.prepare('SELECT rowid FROM files WHERE path=?').get(r.path) as { rowid: number }).rowid
    insertFts.run(rowid, r.path, r.title, r.body)
  }
}

describe('fullText', () => {
  let db: Database.Database
  beforeEach(() => { db = makeFtsDb() })

  it('AND across two cn tokens', () => {
    seedWithFts(db, [
      { path: 'a.md', title: 'A', body: '注意力机制研究' },
      { path: 'b.md', title: 'B', body: '只有注意力' },
      { path: 'c.md', title: 'C', body: '只有机制' }
    ])
    const out = fullText(db, '注意力 机制', { limit: 10, offset: 0 })
    expect(out.total).toBe(1)
    expect(out.items.map((i) => i.summary.path)).toEqual(['a.md'])
  })

  it('prefix match on single cn token', () => {
    seedWithFts(db, [
      { path: 'a.md', title: 'A', body: '注意力机制' },
      { path: 'b.md', title: 'B', body: '注意事项' }
    ])
    const out = fullText(db, '注意', { limit: 10, offset: 0 })
    expect(out.items.length).toBe(2)
  })

  it('phrase match (quoted)', () => {
    seedWithFts(db, [
      { path: 'a.md', title: 'A', body: '注意力机制研究' },
      { path: 'b.md', title: 'B', body: '注意 加 力 加 机制' }
    ])
    const out = fullText(db, '"注意力机制"', { limit: 10, offset: 0 })
    expect(out.items.length).toBe(1)
    expect(out.items[0].summary.path).toBe('a.md')
  })

  it('snippet wraps matched tokens with <mark>', () => {
    seedWithFts(db, [{ path: 'a.md', title: 'A', body: '上下文 注意力 上下文' }])
    const out = fullText(db, '注意力', { limit: 10, offset: 0 })
    expect(out.items[0].snippet).toMatch(/<mark>/)
  })

  it('returns total + paged items', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      path: `p/${i}.md`, title: `T${i}`, body: '注意力'
    }))
    seedWithFts(db, rows)
    const page = fullText(db, '注意力', { limit: 5, offset: 5 })
    expect(page.total).toBe(12)
    expect(page.items.length).toBe(5)
  })

  it('FTS5 syntax error → returns empty', () => {
    seedWithFts(db, [{ path: 'a.md', title: 'A', body: '注意力' }])
    const out = fullText(db, 'foo:', { limit: 10, offset: 0 })
    expect(out.total).toBe(0)
    expect(out.items).toEqual([])
  })

  it('all-stopword query → empty', () => {
    seedWithFts(db, [{ path: 'a.md', title: 'A', body: '注意力' }])
    const out = fullText(db, '的 了', { limit: 10, offset: 0 })
    expect(out.total).toBe(0)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run electron/services/search/queries.test.ts -t fullText
```

Expected: FAIL — `fullText` not exported.

- [ ] **Step 3: Implement `fullText`**

Append to `electron/services/search/queries.ts`:

```ts
import log from 'electron-log'
import { buildFtsQuery } from './queryBuilder'

export interface FullTextOpts {
  limit?: number
  offset?: number
}
export interface FullTextResult {
  items: { summary: FileSummary; snippet: string }[]
  total: number
  pending: boolean
}

interface FtsHitRow {
  path: string
  snippet: string
  rank: number
}

interface SummaryRow extends QuickSwitchRow {}

export function fullText(
  db: Database.Database,
  q: string,
  opts: FullTextOpts = {}
): FullTextResult {
  const expr = buildFtsQuery(q)
  if (expr.length === 0) {
    return { items: [], total: 0, pending: false }
  }

  const limit = opts.limit ?? 50
  const offset = opts.offset ?? 0

  let totalRow: { c: number } | undefined
  let hits: FtsHitRow[] = []
  try {
    totalRow = db.prepare(
      'SELECT COUNT(*) AS c FROM files_fts WHERE files_fts MATCH ?'
    ).get(expr) as { c: number }

    hits = db.prepare(
      `SELECT path,
              snippet(files_fts, 2, '<mark>', '</mark>', '…', 16) AS snippet,
              rank
       FROM files_fts
       WHERE files_fts MATCH ?
       ORDER BY rank
       LIMIT ? OFFSET ?`
    ).all(expr, limit, offset) as FtsHitRow[]
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log.warn('[search.fullText] FTS5 syntax error', { q, expr, msg })
    return { items: [], total: 0, pending: false }
  }

  if (hits.length === 0) {
    return { items: [], total: totalRow?.c ?? 0, pending: false }
  }

  const placeholders = hits.map(() => '?').join(',')
  const rows = db.prepare(
    `SELECT
       files.path, files.title, files.category, files.rating, files.clipped_at,
       files.summary, files.frontmatter_json,
       GROUP_CONCAT(file_tags.tag, ',') AS tags_concat
     FROM files
     LEFT JOIN file_tags ON file_tags.path = files.path
     WHERE files.path IN (${placeholders})
     GROUP BY files.path`
  ).all(...hits.map((h) => h.path)) as SummaryRow[]

  const byPath = new Map(rows.map((r) => [r.path, r]))
  const items = hits
    .map((hit) => {
      const row = byPath.get(hit.path)
      if (!row) return null
      return { summary: rowToFileSummary(row), snippet: hit.snippet }
    })
    .filter((x): x is { summary: FileSummary; snippet: string } => x !== null)

  return { items, total: totalRow?.c ?? items.length, pending: false }
}
```

- [ ] **Step 4: Re-run the test**

```bash
npx vitest run electron/services/search/queries.test.ts -t fullText
```

Expected: PASS for all seven sub-tests.

- [ ] **Step 5: Commit**

```bash
git add electron/services/search/queries.ts electron/services/search/queries.test.ts
git commit -m "feat(phase-08): search.fullText (FTS5 + jieba + snippet + JOIN)"
```

#### Sub-step 4.3.6 + 4.3.7 — wire the `fullText` IPC handler

- [ ] **Step 1: Replace the stub in `electron/ipc/search.ts`**

Find the current `fullText` handler (the Plan 1 stub that always returns empty). Replace it with:

```ts
fullText: async (
  q: string,
  opts?: { limit?: number; offset?: number }
): Promise<IpcResult<{ items: { summary: FileSummary; snippet: string }[]; total: number; pending: boolean }>> => {
  try {
    if (isRebuilding()) {
      return ok({ items: [], total: 0, pending: true })
    }
    const db = requireCurrent()
    const result = fullText(db, q, opts ?? {})
    return ok(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('[ipc.search.fullText]', msg)
    return err('E_INTERNAL', `E_INTERNAL: ${msg}`)
  }
}
```

Add the import:
```ts
import { quickSwitch, fullText } from '../services/search/queries'
```

(Renaming the local `fullText` import is fine — the closure `result` shadow is intentional. If the linter complains, alias it: `import { fullText as fullTextQuery } from '../services/search/queries'` and call `fullTextQuery(db, q, opts ?? {})`.)

- [ ] **Step 2: Update the existing IPC test**

Edit `electron/ipc/search.test.ts`. The Plan 1 test asserted `{ items: [], total: 0, pending: false }` for the not-rebuilding case. Update that assertion to use a mocked `queries.fullText`:

```ts
import * as queries from '../services/search/queries'

describe('search.fullText handler (real impl)', () => {
  beforeEach(() => {
    searchIndex._setRebuildingForTest(false)
    vi.mocked(dbService.requireCurrent).mockReturnValue({} as never)
  })

  it('delegates to queries.fullText when not rebuilding', async () => {
    const stub = { items: [], total: 0, pending: false }
    const spy = vi.spyOn(queries, 'fullText').mockReturnValue(stub)
    const out = await searchHandlers.fullText('注意力', { limit: 10 })
    expect(spy).toHaveBeenCalledWith({}, '注意力', { limit: 10 })
    expect(out).toEqual({ ok: true, data: stub })
  })

  it('still returns pending:true when rebuilding (does not delegate)', async () => {
    const spy = vi.spyOn(queries, 'fullText')
    searchIndex._setRebuildingForTest(true)
    const out = await searchHandlers.fullText('注意力')
    expect(spy).not.toHaveBeenCalled()
    if (out.ok) expect(out.data).toEqual({ items: [], total: 0, pending: true })
  })
})
```

- [ ] **Step 3: Wire the IPC channel**

Add to `registerSearchIpc()`:
```ts
ipcMain.handle('search.fullText', (_e, q: string, opts?: { limit?: number; offset?: number }) =>
  handlers.fullText(q, opts)
)
```

(The Plan 1 stub already had this; verify the line exists and uses the new handler.)

- [ ] **Step 4: Run the test**

```bash
npx vitest run electron/ipc/search.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/search.ts electron/ipc/search.test.ts
git commit -m "feat(phase-08): wire search.fullText IPC handler to real impl"
```

---

<!-- openspec-task: 4.4 -->
### Task 8: `search.suggest(q)` — top-5 title-LIKE suggestions

**Files:**
- Modify: `electron/services/search/queries.ts`
- Modify: `electron/services/search/queries.test.ts`
- Modify: `electron/ipc/search.ts`

- [ ] **Step 1: Failing test**

Append to `electron/services/search/queries.test.ts`:

```ts
import { suggest } from './queries'

describe('suggest', () => {
  it('returns up to 5 title matches', () => {
    const db = makeDb()
    const insert = db.prepare('INSERT INTO files (path, title, mtime, content_hash) VALUES (?, ?, 0, ?)')
    for (let i = 0; i < 8; i++) insert.run(`a${i}.md`, `attention ${i}`, `h${i}`)
    const items = suggest(db, 'attention')
    expect(items.length).toBe(5)
  })

  it('empty q returns []', () => {
    const db = makeDb()
    expect(suggest(db, '')).toEqual([])
  })
})
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npx vitest run electron/services/search/queries.test.ts -t suggest
```

- [ ] **Step 3: Implement**

Append to `electron/services/search/queries.ts`:

```ts
export function suggest(db: Database.Database, q: string): FileSummary[] {
  if (q.length === 0) return []
  const sql = `
    ${QUICK_SWITCH_BASE}
    WHERE files.title LIKE @q
    GROUP BY files.path
    ORDER BY files.clipped_at DESC
    LIMIT 5
  `
  const rows = db.prepare(sql).all({ q: `%${q}%` }) as QuickSwitchRow[]
  return rows.map(rowToFileSummary)
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Wire IPC handler**

Edit `electron/ipc/search.ts`. Add to handlers:

```ts
suggest: async (q: string): Promise<IpcResult<FileSummary[]>> => {
  try {
    const db = requireCurrent()
    return ok(suggest(db, q))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('[ipc.search.suggest]', msg)
    return err('E_INTERNAL', `E_INTERNAL: ${msg}`)
  }
}
```

Update import:
```ts
import { quickSwitch, fullText, suggest } from '../services/search/queries'
```

Register channel:
```ts
ipcMain.handle('search.suggest', (_e, q: string) => handlers.suggest(q))
```

- [ ] **Step 6: Typecheck + test**

```bash
npm run typecheck && npx vitest run electron/ipc/search.test.ts electron/services/search/queries.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add electron/services/search/queries.ts electron/services/search/queries.test.ts electron/ipc/search.ts
git commit -m "feat(phase-08): search.suggest top-5 title hints"
```

---

<!-- openspec-task: 4.5 -->
### Task 9: `search.stats()` — `{ fts_rows, last_rebuild_at }`

`last_rebuild_at` requires persisting the timestamp on disk. Per design D10 we use `<groveRoot>/.acornvo/state/fts_last_rebuild.json`.

**Files:**
- Modify: `electron/services/search/rebuild.ts` (write timestamp on rebuild done)
- Create: `electron/services/search/stats.ts`
- Create: `electron/services/search/stats.test.ts`
- Modify: `electron/ipc/search.ts`

- [ ] **Step 1: Failing test**

Create `electron/services/search/stats.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { stats, writeRebuildTimestamp } from './stats'

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`CREATE VIRTUAL TABLE files_fts USING fts5(path UNINDEXED, title, body, tokenize='trigram');`)
  return db
}

describe('stats', () => {
  let db: Database.Database
  let grove: string

  beforeEach(() => {
    db = makeDb()
    grove = mkdtempSync(join(tmpdir(), 'acornvo-stats-'))
  })

  it('returns 0 rows + null timestamp on empty grove', () => {
    expect(stats(db, grove)).toEqual({ fts_rows: 0, last_rebuild_at: null })
  })

  it('returns row count', () => {
    db.prepare('INSERT INTO files_fts(rowid, path, title, body) VALUES (?, ?, ?, ?)').run(1, 'a.md', 'A', 'B')
    expect(stats(db, grove).fts_rows).toBe(1)
  })

  it('reads last_rebuild_at from state file when present', () => {
    mkdirSync(join(grove, '.acornvo', 'state'), { recursive: true })
    writeFileSync(join(grove, '.acornvo', 'state', 'fts_last_rebuild.json'), JSON.stringify({ at: '2026-04-28T12:00:00.000Z' }))
    expect(stats(db, grove).last_rebuild_at).toBe('2026-04-28T12:00:00.000Z')
  })

  it('writeRebuildTimestamp + stats round-trip', () => {
    writeRebuildTimestamp(grove, '2026-04-28T13:00:00.000Z')
    expect(stats(db, grove).last_rebuild_at).toBe('2026-04-28T13:00:00.000Z')
  })
})
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npx vitest run electron/services/search/stats.test.ts
```

- [ ] **Step 3: Implement**

Create `electron/services/search/stats.ts`:

```ts
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'

export interface StatsResult {
  fts_rows: number
  last_rebuild_at: string | null
}

function statePath(groveRoot: string): string {
  return join(groveRoot, '.acornvo', 'state', 'fts_last_rebuild.json')
}

export function writeRebuildTimestamp(groveRoot: string, at: string = new Date().toISOString()): void {
  const dir = join(groveRoot, '.acornvo', 'state')
  mkdirSync(dir, { recursive: true })
  writeFileSync(statePath(groveRoot), JSON.stringify({ at }))
}

function readRebuildTimestamp(groveRoot: string): string | null {
  const p = statePath(groveRoot)
  if (!existsSync(p)) return null
  try {
    const j = JSON.parse(readFileSync(p, 'utf8')) as { at?: unknown }
    return typeof j.at === 'string' ? j.at : null
  } catch {
    return null
  }
}

export function stats(db: Database.Database, groveRoot: string): StatsResult {
  const row = db.prepare('SELECT COUNT(*) AS c FROM files_fts').get() as { c: number }
  return {
    fts_rows: row.c,
    last_rebuild_at: readRebuildTimestamp(groveRoot)
  }
}
```

- [ ] **Step 4: Hook into rebuild**

Edit `electron/services/search/rebuild.ts`. At the end of `rebuildFts`, after the `done` event, write the timestamp:

```ts
import { writeRebuildTimestamp } from './stats'

// ... at the end of rebuildFts, just before the closing brace:
  rebuildEvents.emit('done', { total })
  writeRebuildTimestamp(groveRoot)
}
```

- [ ] **Step 5: Wire IPC handler**

Edit `electron/ipc/search.ts`. Add:

```ts
import { stats } from '../services/search/stats'

stats: async (): Promise<IpcResult<{ fts_rows: number; last_rebuild_at: string | null }>> => {
  try {
    const db = requireCurrent()
    const grove = getCurrentGrovePath()
    if (!grove) return err('E_INVALID_ARGS', 'no grove opened')
    return ok(stats(db, grove))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('[ipc.search.stats]', msg)
    return err('E_INTERNAL', `E_INTERNAL: ${msg}`)
  }
}
```

Register:
```ts
ipcMain.handle('search.stats', () => handlers.stats())
```

- [ ] **Step 6: Run all tests**

```bash
npx vitest run electron/services/search/stats.test.ts electron/ipc/search.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add electron/services/search/stats.ts electron/services/search/stats.test.ts electron/services/search/rebuild.ts electron/ipc/search.ts
git commit -m "feat(phase-08): search.stats with persisted last_rebuild_at"
```

---

<!-- openspec-task: 4.6 -->
### Task 10: Restore `satisfies` typecheck on the handlers map; final guard against missing methods

The Plan 1 stub used `satisfies Record<keyof SearchContract, ...>` to ensure every method in the contract had a handler. We removed it in task 5 to keep typecheck green during the migration. With all five methods (`rebuild`, `fullText`, `quickSwitch`, `suggest`, `stats`) now implemented, restore the constraint.

**Files:**
- Modify: `electron/ipc/search.ts`

- [ ] **Step 1: Re-add the satisfies clause**

Edit `electron/ipc/search.ts`. Find the `const handlers = { ... }` block (now containing all five methods) and append:

```ts
} satisfies Record<keyof SearchContract, (...args: never[]) => Promise<IpcResult<unknown>>>
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS — every method exists on `SearchContract`. If it fails with `Property 'X' is missing`, you forgot one — go back to the corresponding task and verify.

- [ ] **Step 3: Run the full suite**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Sanity-grep the registrations**

```bash
grep "ipcMain.handle.*search\." electron/ipc/search.ts
```

Expected: five lines:
```
ipcMain.handle('search.rebuild', ...)
ipcMain.handle('search.fullText', ...)
ipcMain.handle('search.quickSwitch', ...)
ipcMain.handle('search.suggest', ...)
ipcMain.handle('search.stats', ...)
```

If any are missing, add them now and rerun typecheck.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/search.ts
git commit -m "refactor(phase-08): restore satisfies guard on search handler map"
```

---

## Self-review checklist

- [ ] `upsertFts` only takes `{ rowid, path, title, body }`. No `summary`, no `content`, no `tokenizer` parameter anywhere in `electron/services/`.
- [ ] `setTokenizer/getTokenizer` and `Tokenizer`/`identityTokenizer` are deleted from `index-queries.ts`. `grep -rn "Tokenizer\|setTokenizer\|getTokenizer" electron/services/` returns no hits in production code.
- [ ] `upsertFileWithBodyDelta` returns `{ result, bodyChanged }`; the indexer + watcher only call `upsertFts` when `bodyChanged === true`.
- [ ] `buildFtsQuery` produces:
  - `""` for empty / all-stopword input
  - `"foo"*` for single-token input
  - `"foo" AND "bar"` for multi-token
  - quoted phrase passthrough untouched
- [ ] `fullText` JOINs back to `files` via `WHERE files.path IN (...)` (one round trip), not N+1.
- [ ] `fullText` returns `{ items, total, pending }` and `pending: true` only when `isRebuilding()`.
- [ ] FTS5 syntax errors caught and returned as empty results (`pending: false`).
- [ ] `search.stats` reads `<grove>/.acornvo/state/fts_last_rebuild.json`; rebuildFts writes that file on completion.
- [ ] `satisfies Record<keyof SearchContract, ...>` is back on the handlers map.
- [ ] All ten OpenSpec labels (3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6) appear exactly once in the plan as `<!-- openspec-task: ... -->` annotations.
