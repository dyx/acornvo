# Phase 05 — Indexer & Watcher: Plan 1 (Deps + index-queries layer)

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-05-indexer-watcher`
> **Task range:** OpenSpec tasks `1.1`–`2.7` (9 tasks)
> **Plan order:** 1 of 5. Subsequent plans (`tasks-3.1-4.2`, `4.3-5.2`, `6.1-8.4`, `9.1-9.9`) build on this one.
> **Status:** Not started
> **Created:** 2026-04-26
> **Branch suggestion:** `feat/phase-05-indexer-watcher` (branch from `main` after phase-03 + phase-04 land)

---

## Goal

Install `chokidar`, scaffold the four new service modules under `electron/services/` + `electron/ipc/`, and ship `electron/services/index-queries.ts` — a typed, fully-tested CRUD layer that is the **only** writer to the `files`, `tags`, `file_tags`, and `files_fts` tables.

## Architecture

- **`index-queries.ts` is the sole writer** to the four indexed tables. The indexer (Plan 2) and watcher (Plan 3) both call into this module; nothing else writes those tables (Spec: file-indexer §"唯一写者").
- All write helpers accept an open `Database.Database` handle (from phase-03 `db.getCurrent()`); none open their own connections. This keeps transaction control in the caller.
- Tag sync diffs old vs. new tags per file path so `tags.usage_count` stays accurate without scanning the whole table; `INSERT OR IGNORE` creates new tag rows and a count delta is applied per (added/removed) edge.
- `upsertFts` uses **delete-then-insert** semantics (FTS5 has no native upsert when the rowid varies) and routes `content` through an injected `tokenizer` so phase-08 can swap in jieba without rewriting indexer code (Spec: file-indexer §"FTS5 写入占位"; Design D6).
- `queryBy` is a basic paginated read for phase-06's library view; we only need `category` / `tag` / `rating` filters with `LIMIT/OFFSET` ordering. No JOIN optimisation here — phase-06 will benchmark and add indices if needed.

## Tech Stack

- `chokidar@^3.6` (used by Plan 3, but installed here so the workspace has it from the start)
- `better-sqlite3@^12` (already a project dep; phase-03 owns connection mgmt)
- `vitest@^2` (already configured) — unit tests for every helper
- Node 22+ (already pinned)

## Files Touched (this plan)

| Path                                      | Action                  | Owner task   |
| ----------------------------------------- | ----------------------- | ------------ |
| `package.json`, `package-lock.json`       | Modify (add chokidar)   | 1.1          |
| `electron/services/indexer.ts`            | Create stub             | 1.2          |
| `electron/services/watcher.ts`            | Create stub             | 1.2          |
| `electron/services/index-queries.ts`      | Create stub → implement | 1.2, 2.1–2.7 |
| `electron/services/index-queries.test.ts` | Create                  | 2.1–2.7      |
| `electron/ipc/index.ts`                   | Create stub             | 1.2          |

## Pre-flight

This plan assumes phase-03 (SQLite migrations) has produced a migration that creates these tables (matching `openspec/specs/sqlite-schema-migrations` if archived, or the latest phase-03 design):

```sql
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
CREATE VIRTUAL TABLE files_fts USING fts5(path, title, summary, content);
```

If the actual phase-03 schema differs in column names, **stop and reconcile** before writing tests in Tasks 2.x. The tests below name columns explicitly so a mismatch surfaces immediately.

---

## Tasks

<!-- openspec-task: 1.1 -->

### Task 1: Install chokidar

**Files:**

- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Confirm chokidar is not already a dep**

```bash
node -e "const p=require('./package.json');console.log(p.dependencies.chokidar||p.devDependencies?.chokidar||'absent')"
```

Expected output: `absent`. If a version prints, stop and reconcile with the existing one before continuing.

- [ ] **Step 2: Install**

```bash
npm install chokidar
```

Expected: `package.json` → `dependencies.chokidar` is `^3.6.x` (or whatever current major matches our Node 22 baseline). `npm install` exits 0; postinstall (`electron-rebuild`) completes.

- [ ] **Step 3: Smoke-load chokidar**

```bash
node -e "const c=require('chokidar'); console.log(typeof c.watch)"
```

Expected output: `function`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(phase-05): add chokidar dep for file watcher"
```

---

<!-- openspec-task: 1.2 -->

### Task 2: Scaffold service + IPC stubs

Create empty placeholder modules so subsequent tasks can import without merge churn. Each stub exports a token so `tsc` will verify the import path; later tasks replace the body.

**Files:**

- Create: `electron/services/indexer.ts`
- Create: `electron/services/watcher.ts`
- Create: `electron/services/index-queries.ts`
- Create: `electron/ipc/index.ts`

- [ ] **Step 1: Create `electron/services/indexer.ts` stub**

```ts
// electron/services/indexer.ts — implemented in Plan 2
export const __indexerStub = true
```

- [ ] **Step 2: Create `electron/services/watcher.ts` stub**

```ts
// electron/services/watcher.ts — implemented in Plan 3
export const __watcherStub = true
```

- [ ] **Step 3: Create `electron/services/index-queries.ts` stub**

```ts
// electron/services/index-queries.ts — implemented in Tasks 2.1–2.7 of Plan 1
export const __indexQueriesStub = true
```

- [ ] **Step 4: Create `electron/ipc/index.ts` stub**

```ts
// electron/ipc/index.ts — implemented in Plan 4
export const __indexIpcStub = true
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0 (the stubs compile because they have no dependencies).

- [ ] **Step 6: Commit**

```bash
git add electron/services/indexer.ts electron/services/watcher.ts electron/services/index-queries.ts electron/ipc/index.ts
git commit -m "feat(phase-05): scaffold indexer/watcher/index-queries/index-ipc stubs"
```

---

<!-- openspec-task: 2.1 -->

### Task 3: `upsertFile(db, row)` returns `'inserted' | 'updated' | 'unchanged'`

**Files:**

- Modify: `electron/services/index-queries.ts`
- Create: `electron/services/index-queries.test.ts`

- [ ] **Step 1: Add the test fixture helper at the top of the test file**

```ts
// electron/services/index-queries.test.ts
import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach } from 'vitest'

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
    CREATE VIRTUAL TABLE files_fts USING fts5(path, title, summary, content);
  `)
  return db
}
```

- [ ] **Step 2: Write the failing test for `upsertFile`**

Append to `electron/services/index-queries.test.ts`:

```ts
import { upsertFile, type FileRow } from './index-queries'

const baseRow = (overrides: Partial<FileRow> = {}): FileRow => ({
  path: 'notes/a.md',
  title: 'A',
  summary: null,
  category: null,
  rating: null,
  content_hash: 'h1',
  mtime_ms: 1000,
  size_bytes: 10,
  frontmatter_json: '{}',
  created_at: 100,
  updated_at: 100,
  ...overrides
})

describe('upsertFile', () => {
  let db: Database.Database
  beforeEach(() => {
    db = makeDb()
  })

  it('inserts a new row', () => {
    const result = upsertFile(db, baseRow())
    expect(result).toBe('inserted')
    const row = db.prepare('SELECT path, content_hash FROM files WHERE path=?').get('notes/a.md')
    expect(row).toEqual({ path: 'notes/a.md', content_hash: 'h1' })
  })

  it('returns "unchanged" when content_hash and mtime_ms match', () => {
    upsertFile(db, baseRow())
    const result = upsertFile(db, baseRow())
    expect(result).toBe('unchanged')
  })

  it('returns "updated" when content_hash changes', () => {
    upsertFile(db, baseRow())
    const result = upsertFile(db, baseRow({ content_hash: 'h2', updated_at: 200 }))
    expect(result).toBe('updated')
    const row = db
      .prepare('SELECT content_hash, updated_at FROM files WHERE path=?')
      .get('notes/a.md')
    expect(row).toEqual({ content_hash: 'h2', updated_at: 200 })
  })

  it('returns "updated" when only frontmatter (rating) changes', () => {
    upsertFile(db, baseRow())
    const result = upsertFile(
      db,
      baseRow({ rating: 4, frontmatter_json: '{"rating":4}', updated_at: 200 })
    )
    expect(result).toBe('updated')
  })
})
```

- [ ] **Step 3: Run the test to confirm it fails**

```bash
npx vitest run electron/services/index-queries.test.ts
```

Expected: FAIL — `upsertFile` not exported.

- [ ] **Step 4: Implement `upsertFile`**

Replace the contents of `electron/services/index-queries.ts`:

```ts
import type Database from 'better-sqlite3'

export interface FileRow {
  path: string
  title: string | null
  summary: string | null
  category: string | null
  rating: number | null
  content_hash: string
  mtime_ms: number
  size_bytes: number
  frontmatter_json: string | null
  created_at: number
  updated_at: number
}

export type UpsertResult = 'inserted' | 'updated' | 'unchanged'

export function upsertFile(db: Database.Database, row: FileRow): UpsertResult {
  const existing = db
    .prepare('SELECT content_hash, mtime_ms FROM files WHERE path=?')
    .get(row.path) as { content_hash: string; mtime_ms: number } | undefined

  if (
    existing &&
    existing.content_hash === row.content_hash &&
    existing.mtime_ms === row.mtime_ms
  ) {
    return 'unchanged'
  }

  db.prepare(
    `INSERT OR REPLACE INTO files
       (path, title, summary, category, rating, content_hash, mtime_ms, size_bytes, frontmatter_json, created_at, updated_at)
       VALUES (@path, @title, @summary, @category, @rating, @content_hash, @mtime_ms, @size_bytes, @frontmatter_json, @created_at, @updated_at)`
  ).run(row)

  return existing ? 'updated' : 'inserted'
}
```

- [ ] **Step 5: Run tests; confirm they pass**

```bash
npx vitest run electron/services/index-queries.test.ts
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add electron/services/index-queries.ts electron/services/index-queries.test.ts
git commit -m "feat(phase-05): upsertFile returns inserted/updated/unchanged"
```

---

<!-- openspec-task: 2.2 -->

### Task 4: `deleteFile(db, path)` cascades to file_tags + files_fts

**Files:**

- Modify: `electron/services/index-queries.ts`
- Modify: `electron/services/index-queries.test.ts`

- [ ] **Step 1: Write the failing test**

Append to the test file:

```ts
import { deleteFile } from './index-queries'

describe('deleteFile', () => {
  let db: Database.Database
  beforeEach(() => {
    db = makeDb()
  })

  it('removes the row from files, file_tags, and files_fts', () => {
    upsertFile(db, baseRow())
    db.prepare('INSERT INTO file_tags(path, tag) VALUES (?, ?)').run('notes/a.md', 'foo')
    db.prepare(
      "INSERT INTO files_fts(rowid, path, title, summary, content) VALUES (1, 'notes/a.md', 'A', '', 'body')"
    ).run()

    deleteFile(db, 'notes/a.md')

    expect(db.prepare('SELECT COUNT(*) AS n FROM files').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM file_tags').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM files_fts').get()).toEqual({ n: 0 })
  })

  it('is a no-op when the path does not exist', () => {
    expect(() => deleteFile(db, 'never.md')).not.toThrow()
  })
})
```

- [ ] **Step 2: Confirm the test fails**

```bash
npx vitest run electron/services/index-queries.test.ts -t deleteFile
```

Expected: FAIL — `deleteFile` not exported.

- [ ] **Step 3: Implement `deleteFile`**

Append to `electron/services/index-queries.ts`:

```ts
export function deleteFile(db: Database.Database, path: string): void {
  db.prepare('DELETE FROM files_fts WHERE path=?').run(path)
  db.prepare('DELETE FROM file_tags WHERE path=?').run(path)
  db.prepare('DELETE FROM files WHERE path=?').run(path)
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/services/index-queries.test.ts -t deleteFile
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add electron/services/index-queries.ts electron/services/index-queries.test.ts
git commit -m "feat(phase-05): deleteFile cascades to file_tags + files_fts"
```

---

<!-- openspec-task: 2.3 -->

### Task 5: `renameFile(db, oldPath, newPath)` updates path in three tables (transactional)

**Files:**

- Modify: `electron/services/index-queries.ts`
- Modify: `electron/services/index-queries.test.ts`

- [ ] **Step 1: Write the failing test**

Append to the test file:

```ts
import { renameFile } from './index-queries'

describe('renameFile', () => {
  let db: Database.Database
  beforeEach(() => {
    db = makeDb()
  })

  it('updates path across files, file_tags, files_fts in one transaction', () => {
    upsertFile(db, baseRow({ path: 'old.md' }))
    db.prepare('INSERT INTO file_tags(path, tag) VALUES (?, ?)').run('old.md', 'foo')
    db.prepare(
      "INSERT INTO files_fts(rowid, path, title, summary, content) VALUES (1,'old.md','','','')"
    ).run()

    renameFile(db, 'old.md', 'new.md')

    expect(db.prepare('SELECT path FROM files').get()).toEqual({ path: 'new.md' })
    expect(db.prepare('SELECT path FROM file_tags').get()).toEqual({ path: 'new.md' })
    expect(db.prepare('SELECT path FROM files_fts').get()).toEqual({ path: 'new.md' })
  })

  it('is a no-op when oldPath does not exist', () => {
    expect(() => renameFile(db, 'missing.md', 'new.md')).not.toThrow()
    expect(db.prepare('SELECT COUNT(*) AS n FROM files').get()).toEqual({ n: 0 })
  })
})
```

- [ ] **Step 2: Confirm the test fails**

```bash
npx vitest run electron/services/index-queries.test.ts -t renameFile
```

Expected: FAIL — `renameFile` not exported.

- [ ] **Step 3: Implement `renameFile`**

Append to `electron/services/index-queries.ts`:

```ts
export function renameFile(db: Database.Database, oldPath: string, newPath: string): void {
  const tx = db.transaction(() => {
    db.prepare('UPDATE files SET path=? WHERE path=?').run(newPath, oldPath)
    db.prepare('UPDATE file_tags SET path=? WHERE path=?').run(newPath, oldPath)
    db.prepare('UPDATE files_fts SET path=? WHERE path=?').run(newPath, oldPath)
  })
  tx()
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/services/index-queries.test.ts -t renameFile
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add electron/services/index-queries.ts electron/services/index-queries.test.ts
git commit -m "feat(phase-05): renameFile transactionally updates path in 3 tables"
```

---

<!-- openspec-task: 2.4 -->

### Task 6: `syncTags(db, path, tags)` diffs old/new and updates `tags.usage_count`

**Files:**

- Modify: `electron/services/index-queries.ts`
- Modify: `electron/services/index-queries.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to the test file:

```ts
import { syncTags } from './index-queries'

describe('syncTags', () => {
  let db: Database.Database
  beforeEach(() => {
    db = makeDb()
    upsertFile(db, baseRow())
  })

  it('inserts new tag rows and bumps usage_count from 0', () => {
    syncTags(db, 'notes/a.md', ['attention', 'transformer'])
    expect(db.prepare('SELECT name, usage_count FROM tags ORDER BY name').all()).toEqual([
      { name: 'attention', usage_count: 1 },
      { name: 'transformer', usage_count: 1 }
    ])
    expect(db.prepare('SELECT COUNT(*) AS n FROM file_tags').get()).toEqual({ n: 2 })
  })

  it('decrements usage_count for removed tags and increments for added ones', () => {
    syncTags(db, 'notes/a.md', ['x', 'y'])
    syncTags(db, 'notes/a.md', ['y', 'z']) // remove x, keep y, add z

    expect(db.prepare('SELECT name, usage_count FROM tags ORDER BY name').all()).toEqual([
      { name: 'x', usage_count: 0 },
      { name: 'y', usage_count: 1 },
      { name: 'z', usage_count: 1 }
    ])
  })

  it('is idempotent when tags do not change', () => {
    syncTags(db, 'notes/a.md', ['x'])
    syncTags(db, 'notes/a.md', ['x'])
    expect(db.prepare('SELECT usage_count FROM tags WHERE name=?').get('x')).toEqual({
      usage_count: 1
    })
  })

  it('handles deduplication of input tags', () => {
    syncTags(db, 'notes/a.md', ['x', 'x', 'y'])
    expect(db.prepare('SELECT COUNT(*) AS n FROM file_tags').get()).toEqual({ n: 2 })
  })
})
```

- [ ] **Step 2: Confirm tests fail**

```bash
npx vitest run electron/services/index-queries.test.ts -t syncTags
```

Expected: FAIL — `syncTags` not exported.

- [ ] **Step 3: Implement `syncTags`**

Append to `electron/services/index-queries.ts`:

```ts
export function syncTags(db: Database.Database, path: string, tags: string[]): void {
  const wanted = new Set(tags)
  const existing = new Set(
    (db.prepare('SELECT tag FROM file_tags WHERE path=?').all(path) as { tag: string }[]).map(
      (r) => r.tag
    )
  )

  const toAdd = [...wanted].filter((t) => !existing.has(t))
  const toRemove = [...existing].filter((t) => !wanted.has(t))

  const tx = db.transaction(() => {
    for (const tag of toAdd) {
      db.prepare('INSERT OR IGNORE INTO tags(name, usage_count) VALUES (?, 0)').run(tag)
      db.prepare('INSERT INTO file_tags(path, tag) VALUES (?, ?)').run(path, tag)
      db.prepare('UPDATE tags SET usage_count = usage_count + 1 WHERE name=?').run(tag)
    }
    for (const tag of toRemove) {
      db.prepare('DELETE FROM file_tags WHERE path=? AND tag=?').run(path, tag)
      db.prepare('UPDATE tags SET usage_count = usage_count - 1 WHERE name=?').run(tag)
    }
  })
  tx()
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/services/index-queries.test.ts -t syncTags
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add electron/services/index-queries.ts electron/services/index-queries.test.ts
git commit -m "feat(phase-05): syncTags diffs old/new tags + updates usage_count"
```

---

<!-- openspec-task: 2.5 -->

### Task 7: `upsertFts(db, row, tokenizer)` rewrites FTS row via delete-then-insert

**Files:**

- Modify: `electron/services/index-queries.ts`
- Modify: `electron/services/index-queries.test.ts`

- [ ] **Step 1: Write failing tests**

Append to the test file:

```ts
import { upsertFts } from './index-queries'

describe('upsertFts', () => {
  let db: Database.Database
  beforeEach(() => {
    db = makeDb()
  })

  it('inserts a new row using identity tokenizer by default', () => {
    upsertFts(db, { rowid: 1, path: 'a.md', title: 'A', summary: '', content: 'hello world' })
    expect(db.prepare('SELECT path, title, content FROM files_fts').get()).toEqual({
      path: 'a.md',
      title: 'A',
      content: 'hello world'
    })
  })

  it('passes content through the tokenizer arg', () => {
    upsertFts(
      db,
      { rowid: 2, path: 'b.md', title: '', summary: '', content: 'hello world' },
      (text) => text.split('').join(' ')
    )
    expect(db.prepare('SELECT content FROM files_fts WHERE path=?').get('b.md')).toEqual({
      content: 'h e l l o   w o r l d'
    })
  })

  it('overwrites an existing row (delete-then-insert)', () => {
    upsertFts(db, { rowid: 1, path: 'a.md', title: 'A', summary: '', content: 'first' })
    upsertFts(db, { rowid: 1, path: 'a.md', title: 'A2', summary: 's', content: 'second' })
    const rows = db.prepare('SELECT title, content FROM files_fts WHERE path=?').all('a.md')
    expect(rows).toEqual([{ title: 'A2', content: 'second' }])
  })
})
```

- [ ] **Step 2: Confirm failing**

```bash
npx vitest run electron/services/index-queries.test.ts -t upsertFts
```

Expected: FAIL.

- [ ] **Step 3: Implement `upsertFts`**

Append to `electron/services/index-queries.ts`:

```ts
export interface FtsRow {
  rowid: number
  path: string
  title: string
  summary: string
  content: string
}

export type Tokenizer = (text: string) => string

const identityTokenizer: Tokenizer = (t) => t

export function upsertFts(
  db: Database.Database,
  row: FtsRow,
  tokenizer: Tokenizer = identityTokenizer
): void {
  const tokenized = tokenizer(row.content)
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM files_fts WHERE path=?').run(row.path)
    db.prepare(
      'INSERT INTO files_fts(rowid, path, title, summary, content) VALUES (?, ?, ?, ?, ?)'
    ).run(row.rowid, row.path, row.title, row.summary, tokenized)
  })
  tx()
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/services/index-queries.test.ts -t upsertFts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add electron/services/index-queries.ts electron/services/index-queries.test.ts
git commit -m "feat(phase-05): upsertFts delete-then-insert with tokenizer injection point"
```

---

<!-- openspec-task: 2.6 -->

### Task 8: `listAllPaths(db)` returns Set of every files.path

**Files:**

- Modify: `electron/services/index-queries.ts`
- Modify: `electron/services/index-queries.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { listAllPaths } from './index-queries'

describe('listAllPaths', () => {
  let db: Database.Database
  beforeEach(() => {
    db = makeDb()
  })

  it('returns empty Set on empty table', () => {
    expect(listAllPaths(db)).toEqual(new Set<string>())
  })

  it('returns all paths', () => {
    upsertFile(db, baseRow({ path: 'a.md' }))
    upsertFile(db, baseRow({ path: 'b.md' }))
    expect(listAllPaths(db)).toEqual(new Set(['a.md', 'b.md']))
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/services/index-queries.test.ts -t listAllPaths
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `electron/services/index-queries.ts`:

```ts
export function listAllPaths(db: Database.Database): Set<string> {
  const rows = db.prepare('SELECT path FROM files').all() as { path: string }[]
  return new Set(rows.map((r) => r.path))
}
```

- [ ] **Step 4: Run**

```bash
npx vitest run electron/services/index-queries.test.ts -t listAllPaths
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add electron/services/index-queries.ts electron/services/index-queries.test.ts
git commit -m "feat(phase-05): listAllPaths returns Set of files.path"
```

---

<!-- openspec-task: 2.7 -->

### Task 9: `queryBy(db, opts)` paginated read for phase-06 library view

**Files:**

- Modify: `electron/services/index-queries.ts`
- Modify: `electron/services/index-queries.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```ts
import { queryBy } from './index-queries'

describe('queryBy', () => {
  let db: Database.Database
  beforeEach(() => {
    db = makeDb()
    upsertFile(db, baseRow({ path: 'a.md', category: 'note', rating: 3, updated_at: 1 }))
    upsertFile(db, baseRow({ path: 'b.md', category: 'note', rating: 5, updated_at: 2 }))
    upsertFile(db, baseRow({ path: 'c.md', category: 'idea', rating: 4, updated_at: 3 }))
    syncTags(db, 'a.md', ['x'])
    syncTags(db, 'b.md', ['x', 'y'])
    syncTags(db, 'c.md', ['y'])
  })

  it('returns all rows ordered by updated_at desc when no filters', () => {
    const rows = queryBy(db, { limit: 10, offset: 0, orderBy: 'updated_at_desc' })
    expect(rows.map((r) => r.path)).toEqual(['c.md', 'b.md', 'a.md'])
  })

  it('filters by category', () => {
    const rows = queryBy(db, { category: 'note', limit: 10, offset: 0, orderBy: 'updated_at_desc' })
    expect(rows.map((r) => r.path)).toEqual(['b.md', 'a.md'])
  })

  it('filters by tag (joins file_tags)', () => {
    const rows = queryBy(db, { tag: 'y', limit: 10, offset: 0, orderBy: 'updated_at_desc' })
    expect(rows.map((r) => r.path)).toEqual(['c.md', 'b.md'])
  })

  it('filters by minimum rating', () => {
    const rows = queryBy(db, { rating: 4, limit: 10, offset: 0, orderBy: 'updated_at_desc' })
    expect(rows.map((r) => r.path)).toEqual(['c.md', 'b.md'])
  })

  it('paginates with limit + offset', () => {
    const page1 = queryBy(db, { limit: 1, offset: 0, orderBy: 'updated_at_desc' })
    const page2 = queryBy(db, { limit: 1, offset: 1, orderBy: 'updated_at_desc' })
    expect(page1.map((r) => r.path)).toEqual(['c.md'])
    expect(page2.map((r) => r.path)).toEqual(['b.md'])
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/services/index-queries.test.ts -t queryBy
```

Expected: FAIL.

- [ ] **Step 3: Implement `queryBy`**

Append to `electron/services/index-queries.ts`:

```ts
export interface QueryOptions {
  category?: string
  tag?: string
  rating?: number // minimum rating
  limit: number
  offset: number
  orderBy: 'updated_at_desc' | 'updated_at_asc' | 'created_at_desc' | 'created_at_asc'
}

const ORDER_BY_SQL: Record<QueryOptions['orderBy'], string> = {
  updated_at_desc: 'updated_at DESC',
  updated_at_asc: 'updated_at ASC',
  created_at_desc: 'created_at DESC',
  created_at_asc: 'created_at ASC'
}

export function queryBy(db: Database.Database, opts: QueryOptions): FileRow[] {
  const where: string[] = []
  const params: Record<string, unknown> = {}

  if (opts.category !== undefined) {
    where.push('files.category = @category')
    params.category = opts.category
  }
  if (opts.rating !== undefined) {
    where.push('files.rating >= @rating')
    params.rating = opts.rating
  }
  let from = 'files'
  if (opts.tag !== undefined) {
    from = 'files INNER JOIN file_tags ON file_tags.path = files.path'
    where.push('file_tags.tag = @tag')
    params.tag = opts.tag
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const sql = `
    SELECT files.* FROM ${from}
    ${whereSql}
    ORDER BY ${ORDER_BY_SQL[opts.orderBy]}
    LIMIT @limit OFFSET @offset
  `
  return db.prepare(sql).all({ ...params, limit: opts.limit, offset: opts.offset }) as FileRow[]
}
```

- [ ] **Step 4: Run all tests**

```bash
npm run test -- electron/services/index-queries.test.ts
```

Expected: all 18 tests across the file pass (4 + 2 + 2 + 4 + 3 + 2 + 5 from Tasks 3–9 = 22; adjust if you added more).

- [ ] **Step 5: Typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add electron/services/index-queries.ts electron/services/index-queries.test.ts
git commit -m "feat(phase-05): queryBy provides paginated read for library view"
```

---

## Self-Review Checklist (run after Task 9)

- [ ] Every label `1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7` appears in exactly one annotation comment in this file. Verify:
  ```bash
  grep -oE 'openspec-task: [0-9.]+' docs/superpowers/plans/2026-04-26-phase-05-indexer-watcher-tasks-1.1-2.7.md | sort -u
  ```
  Expected: `1.1 1.2 2.1 2.2 2.3 2.4 2.5 2.6 2.7` (one per line).
- [ ] All 9 tasks have at least 4 numbered steps and a final commit step.
- [ ] No `TODO`, `TBD`, `fill in`, `similar to`, or "appropriate error handling" placeholders.
- [ ] Spec coverage:
  - file-indexer §"标签同步" → Task 6 (syncTags)
  - file-indexer §"FTS5 写入占位" → Task 7 (upsertFts with tokenizer arg)
  - file-indexer §"唯一写者" → satisfied by routing all writes through this module (architectural; no test)
- [ ] After running `npm run test -- electron/services/index-queries.test.ts`, **22+ tests** are green.
