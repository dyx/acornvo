# Phase 03 — SQLite Schema & Migrations: Plan 2 (`001_init.sql` Schema)

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-03-sqlite-schema-migrations`
> **Task range:** OpenSpec tasks `3.1`–`3.8` (8 tasks)
> **Plan order:** 2 of 5. **Depends on Plan 1** (migrations runner + vitest setup must exist).
> **Status:** Not started
> **Created:** 2026-04-25

---

## Goal

Build `electron/services/db/migrations/001_init.sql` containing the **entire** schema mandated by the PRD (`docs/prd.md` "SQLite Schema" section): tables `files` / `tags` / `file_tags` / `files_fts` (FTS5) / `bookmarks` / `chats` / `queue` / `usage`, plus all required indices. Build it incrementally under TDD: every table/index added because a failing test demanded it.

## Architecture

- One file: `electron/services/db/migrations/001_init.sql`. Header comment line `-- migration: 001_init`.
- One driver test: `electron/services/db/migrations/001_init.test.ts`. It opens `:memory:`, runs `runMigrations(db, dirname(__filename))` against the migrations directory, and asserts schema shape (tables, columns, indices, FTS5 query smoke).
- The migration is one big SQL block executed inside the runner's single transaction (Plan 1 task 2.2). All DDL must therefore be transaction-safe — `CREATE TABLE`, `CREATE INDEX`, `CREATE VIRTUAL TABLE` all are.
- `files_fts` is an FTS5 virtual table with `tokenize='simple'`. App-layer Chinese tokenization (jieba) lands in a later phase; phase 3 only proves FTS5 is available and queryable.
- `queue` has a partial unique index `uq_queue_active_path` on `payload_json ->> '$.path'` for `kind='review' AND status IN ('pending','running')` — this prevents duplicate review enqueue. JSON path extraction `->>` requires SQLite ≥ 3.38; `better-sqlite3@^11` ships SQLite 3.45+.

## Tech Stack

- SQLite 3.45+ (bundled in `better-sqlite3@^11`)
- FTS5 module (compiled in by default in `better-sqlite3`)
- vitest (set up in Plan 1)

## DDL Source of Truth

Tables and indices below come from `docs/prd.md:246–328`. Two **additions** beyond the PRD DDL come from `design.md` decision D5:
1. `idx_files_content_hash` on `files(content_hash)` (used by future dedupe logic)
2. `idx_usage_purpose` on `usage(purpose)` (used by future usage aggregation)

These additions are explicitly required by OpenSpec task `3.7` (mentions `idx_usage_purpose`) and design D5.

## Files Touched

| Path | Action | Owner task |
|---|---|---|
| `electron/services/db/migrations/001_init.sql` | Create then extend | 3.1–3.8 |
| `electron/services/db/migrations/001_init.test.ts` | Create then extend | 3.1–3.8 |

---

## Pre-flight: Create the test scaffold

Before Task 1, create the empty SQL file and the test driver shell. (No commit yet — this is part of Task 1.)

```bash
touch electron/services/db/migrations/001_init.sql
```

The test driver will be added inside Task 1's RED step.

---

## Tasks

<!-- openspec-task: 3.1 -->
### Task 1: `files` table + `idx_files_category` + `idx_files_rating` (+ `idx_files_content_hash`)

**Files:**
- Create: `electron/services/db/migrations/001_init.sql`
- Create: `electron/services/db/migrations/001_init.test.ts`

- [ ] **Step 1: Write the failing test for the `files` table & indices**

Create `electron/services/db/migrations/001_init.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../migrations'

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url))

function tableNames(db: Database.Database): string[] {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>
  ).map((r) => r.name)
}

function indexNames(db: Database.Database): string[] {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>
  ).map((r) => r.name)
}

function columnNames(db: Database.Database, table: string): string[] {
  return (db.pragma(`table_info('${table}')`) as Array<{ name: string }>).map((c) => c.name)
}

describe('001_init.sql', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)
  })
  afterEach(() => {
    db.close()
  })

  it('creates files table with required columns + indices', () => {
    expect(tableNames(db)).toContain('files')
    const cols = columnNames(db, 'files')
    for (const required of [
      'path', 'title', 'url', 'category', 'rating', 'summary',
      'clipped_at', 'reviewed_at', 'mtime', 'content_hash', 'frontmatter_json'
    ]) {
      expect(cols).toContain(required)
    }
    // PK on path
    const info = db.pragma("table_info('files')") as Array<{ name: string; pk: number }>
    expect(info.find((c) => c.name === 'path')?.pk).toBe(1)
    // mtime NOT NULL
    const mtimeRow = info.find((c) => c.name === 'mtime') as unknown as { notnull: number }
    expect(mtimeRow.notnull).toBe(1)
    // indices
    const idx = indexNames(db)
    expect(idx).toContain('idx_files_category')
    expect(idx).toContain('idx_files_rating')
    expect(idx).toContain('idx_files_content_hash')
    expect(db.pragma('user_version', { simple: true })).toBe(1)
  })
})
```

- [ ] **Step 2: Run — verify FAIL (no migration yet, runMigrations sees an empty file)**

```bash
npx vitest run electron/services/db/migrations/001_init.test.ts
```

Expected: FAIL — `tableNames` returns `[]`, the assertion `toContain('files')` fails.

- [ ] **Step 3: Write the minimal SQL to pass**

Create/replace `electron/services/db/migrations/001_init.sql`:

```sql
-- migration: 001_init

-- 文件索引（从 md 同步生成，可随时重建）
CREATE TABLE files (
  path TEXT PRIMARY KEY,
  title TEXT,
  url TEXT,
  category TEXT,
  rating INTEGER,
  summary TEXT,
  clipped_at TEXT,
  reviewed_at TEXT,
  mtime INTEGER NOT NULL,
  content_hash TEXT,
  frontmatter_json TEXT
);

CREATE INDEX idx_files_category ON files(category);
CREATE INDEX idx_files_rating ON files(rating);
CREATE INDEX idx_files_content_hash ON files(content_hash);
```

- [ ] **Step 4: Run — verify GREEN**

```bash
npx vitest run electron/services/db/migrations/001_init.test.ts
```

Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add electron/services/db/migrations/001_init.sql electron/services/db/migrations/001_init.test.ts
git commit -m "feat(phase-03): 001_init creates files table + indices"
```

> **Note for header comment (task 3.8):** the line `-- migration: 001_init` is already present from this task. Task 3.8 will only verify it.

---

<!-- openspec-task: 3.2 -->
### Task 2: `tags` + `file_tags` (composite PK)

**Files:**
- Modify: `electron/services/db/migrations/001_init.sql`
- Modify: `electron/services/db/migrations/001_init.test.ts`

> **Note on FK to files:** OpenSpec task 3.2 says "FK to files". The PRD DDL does NOT declare `FOREIGN KEY (path) REFERENCES files(path)` — likely because reindex flows replace `files` rows by `DELETE` + re-`INSERT` and a strict FK would CASCADE-delete `file_tags` mid-reindex. We follow the PRD verbatim (no FK declaration) but enable `PRAGMA foreign_keys = ON` (Plan 3 task 4.2) so any future migration that adds the FK becomes immediately enforceable. The composite primary key `(path, tag)` provides the de-dupe guarantee that matters for phase 3.

- [ ] **Step 1: Append failing test**

Append inside the `describe('001_init.sql', () => { ... })` block:

```ts
  it('creates tags + file_tags with composite PK', () => {
    expect(tableNames(db)).toEqual(expect.arrayContaining(['tags', 'file_tags']))
    expect(columnNames(db, 'tags')).toEqual(expect.arrayContaining(['name', 'usage_count']))
    expect(columnNames(db, 'file_tags')).toEqual(expect.arrayContaining(['path', 'tag']))
    const ftInfo = db.pragma("table_info('file_tags')") as Array<{ name: string; pk: number }>
    expect(ftInfo.find((c) => c.name === 'path')?.pk).toBeGreaterThan(0)
    expect(ftInfo.find((c) => c.name === 'tag')?.pk).toBeGreaterThan(0)
    // composite PK rejects duplicates
    db.exec("INSERT INTO files (path, mtime) VALUES ('a.md', 0)")
    db.exec("INSERT INTO file_tags (path, tag) VALUES ('a.md', 'x')")
    expect(() => db.exec("INSERT INTO file_tags (path, tag) VALUES ('a.md', 'x')")).toThrow(/UNIQUE/i)
  })
```

- [ ] **Step 2: Run — FAIL**

```bash
npx vitest run electron/services/db/migrations/001_init.test.ts
```

Expected: `expected [...] to contain ['tags','file_tags']` — fails.

- [ ] **Step 3: Append SQL**

Append to `001_init.sql`:

```sql

-- 标签索引（多对多）
CREATE TABLE tags (
  name TEXT PRIMARY KEY,
  usage_count INTEGER DEFAULT 0
);

CREATE TABLE file_tags (
  path TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (path, tag)
);
```

- [ ] **Step 4: Run — GREEN**

```bash
npx vitest run electron/services/db/migrations/001_init.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/services/db/migrations/001_init.sql electron/services/db/migrations/001_init.test.ts
git commit -m "feat(phase-03): 001_init adds tags + file_tags"
```

---

<!-- openspec-task: 3.3 -->
### Task 3: `files_fts` (FTS5 virtual table, tokenize=simple)

**Files:**
- Modify: `electron/services/db/migrations/001_init.sql`
- Modify: `electron/services/db/migrations/001_init.test.ts`

- [ ] **Step 1: Append failing test**

```ts
  it('creates files_fts FTS5 virtual table that supports MATCH', () => {
    expect(tableNames(db)).toContain('files_fts')
    db.exec("INSERT INTO files_fts (path, title, summary, content) VALUES ('a.md', 'hello world', 's', 'body')")
    const rows = db.prepare("SELECT path FROM files_fts WHERE files_fts MATCH 'hello'").all() as Array<{ path: string }>
    expect(rows.map((r) => r.path)).toEqual(['a.md'])
  })
```

- [ ] **Step 2: Run — FAIL**

Expected: `no such table: files_fts`.

- [ ] **Step 3: Append SQL**

```sql

-- 全文搜索（tokenizer=simple；中文由应用层 jieba 预分词后写入 content）
CREATE VIRTUAL TABLE files_fts USING fts5(
  path UNINDEXED,
  title,
  summary,
  content,
  tokenize='simple'
);
```

- [ ] **Step 4: Run — GREEN**

```bash
npx vitest run electron/services/db/migrations/001_init.test.ts
```

If you see `no such module: fts5`, the `better-sqlite3` build does not include FTS5 — this would be a Plan 1 regression. Re-run `npm run postinstall` and retry.

- [ ] **Step 5: Commit**

```bash
git add electron/services/db/migrations/001_init.sql electron/services/db/migrations/001_init.test.ts
git commit -m "feat(phase-03): 001_init adds files_fts FTS5 virtual table"
```

---

<!-- openspec-task: 3.4 -->
### Task 4: `bookmarks` (with `sort_order`)

- [ ] **Step 1: Append failing test**

```ts
  it('creates bookmarks with autoincrement id + sort_order', () => {
    expect(tableNames(db)).toContain('bookmarks')
    const cols = columnNames(db, 'bookmarks')
    expect(cols).toEqual(expect.arrayContaining(['id', 'url', 'title', 'favicon', 'created_at', 'sort_order']))
    const r1 = db.prepare("INSERT INTO bookmarks (url, created_at) VALUES ('https://x', '2026-01-01') RETURNING id").get() as { id: number }
    const r2 = db.prepare("INSERT INTO bookmarks (url, created_at) VALUES ('https://y', '2026-01-01') RETURNING id").get() as { id: number }
    expect(r2.id).toBe(r1.id + 1)
  })
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Append SQL**

```sql

-- 标记
CREATE TABLE bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  title TEXT,
  favicon TEXT,
  created_at TEXT NOT NULL,
  sort_order INTEGER
);
```

- [ ] **Step 4: Run — GREEN**

- [ ] **Step 5: Commit**

```bash
git add electron/services/db/migrations/001_init.sql electron/services/db/migrations/001_init.test.ts
git commit -m "feat(phase-03): 001_init adds bookmarks table"
```

---

<!-- openspec-task: 3.5 -->
### Task 5: `chats` (TEXT PK)

- [ ] **Step 1: Append failing test**

```ts
  it('creates chats with TEXT primary key', () => {
    expect(tableNames(db)).toContain('chats')
    const cols = columnNames(db, 'chats')
    expect(cols).toEqual(expect.arrayContaining(['id', 'title', 'model', 'created_at', 'updated_at']))
    db.exec("INSERT INTO chats (id, created_at, updated_at) VALUES ('c1', '2026-01-01', '2026-01-01')")
    expect(() => db.exec("INSERT INTO chats (id, created_at, updated_at) VALUES ('c1', '2026-01-01', '2026-01-01')")).toThrow(/UNIQUE/i)
  })
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Append SQL**

```sql

-- 松语对话（元数据索引；消息正文落 .acornvo/chats/<id>.json）
CREATE TABLE chats (
  id TEXT PRIMARY KEY,
  title TEXT,
  model TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

- [ ] **Step 4: Run — GREEN**

- [ ] **Step 5: Commit**

```bash
git add electron/services/db/migrations/001_init.sql electron/services/db/migrations/001_init.test.ts
git commit -m "feat(phase-03): 001_init adds chats table"
```

---

<!-- openspec-task: 3.6 -->
### Task 6: `queue` + `idx_queue_status` + partial unique index

- [ ] **Step 1: Append failing test**

```ts
  it('creates queue with idx_queue_status + partial unique index for active reviews', () => {
    expect(tableNames(db)).toContain('queue')
    const idx = indexNames(db)
    expect(idx).toContain('idx_queue_status')
    expect(idx).toContain('uq_queue_active_path')

    // The partial unique index should reject a second active review for the same path.
    const insert = db.prepare(
      "INSERT INTO queue (kind, payload_json, status, created_at, updated_at) VALUES (?, ?, ?, '2026-01-01', '2026-01-01')"
    )
    insert.run('review', JSON.stringify({ path: 'a.md' }), 'pending')
    expect(() => insert.run('review', JSON.stringify({ path: 'a.md' }), 'pending')).toThrow(/UNIQUE/i)

    // But a different path is fine.
    expect(() => insert.run('review', JSON.stringify({ path: 'b.md' }), 'pending')).not.toThrow()

    // And a 'failed' row for the same path is fine (not in the partial set).
    expect(() => insert.run('review', JSON.stringify({ path: 'a.md' }), 'failed')).not.toThrow()

    // And a non-review kind is fine.
    expect(() => insert.run('reindex', JSON.stringify({ path: 'a.md' }), 'pending')).not.toThrow()
  })
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Append SQL**

```sql

-- 持久化队列
CREATE TABLE queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                 -- 'review' | 'reindex' | ...
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,               -- 'pending' | 'running' | 'failed'
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_queue_status ON queue(status);

-- 同一 path 在 pending/running 的 review 任务唯一（payload_json ->> '$.path' 提取 JSON 字段）
CREATE UNIQUE INDEX uq_queue_active_path
  ON queue(payload_json ->> '$.path')
  WHERE status IN ('pending','running') AND kind = 'review';
```

- [ ] **Step 4: Run — GREEN**

If `payload_json ->> '$.path'` errors with `near "->>": syntax error`, the SQLite version is < 3.38. Confirm `better-sqlite3@^11` is installed (Plan 1 task 1.1) and rerun.

- [ ] **Step 5: Commit**

```bash
git add electron/services/db/migrations/001_init.sql electron/services/db/migrations/001_init.test.ts
git commit -m "feat(phase-03): 001_init adds queue + partial unique index for active reviews"
```

---

<!-- openspec-task: 3.7 -->
### Task 7: `usage` + `idx_usage_ts` + `idx_usage_model` + `idx_usage_purpose`

- [ ] **Step 1: Append failing test**

```ts
  it('creates usage with ts/model/purpose indices', () => {
    expect(tableNames(db)).toContain('usage')
    const cols = columnNames(db, 'usage')
    expect(cols).toEqual(
      expect.arrayContaining([
        'id', 'ts', 'purpose', 'model_id', 'model_name',
        'input_tokens', 'output_tokens', 'estimated_cost_usd',
        'file_path', 'chat_id'
      ])
    )
    const idx = indexNames(db)
    expect(idx).toContain('idx_usage_ts')
    expect(idx).toContain('idx_usage_model')
    expect(idx).toContain('idx_usage_purpose')
  })
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Append SQL**

```sql

-- AI 用量记录
CREATE TABLE usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  purpose TEXT NOT NULL,              -- 'review' | 'chat' | 'title-derive'
  model_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  estimated_cost_usd REAL,
  file_path TEXT,
  chat_id TEXT
);
CREATE INDEX idx_usage_ts ON usage(ts);
CREATE INDEX idx_usage_model ON usage(model_id);
CREATE INDEX idx_usage_purpose ON usage(purpose);
```

- [ ] **Step 4: Run — GREEN**

- [ ] **Step 5: Commit**

```bash
git add electron/services/db/migrations/001_init.sql electron/services/db/migrations/001_init.test.ts
git commit -m "feat(phase-03): 001_init adds usage table + ts/model/purpose indices"
```

---

<!-- openspec-task: 3.8 -->
### Task 8: Verify `-- migration: 001_init` header + final coverage assertion

**Files:**
- Modify: `electron/services/db/migrations/001_init.sql` (verify header only)
- Modify: `electron/services/db/migrations/001_init.test.ts` (add umbrella assertion)

- [ ] **Step 1: Verify the header line exists (already added in Task 1)**

```bash
head -1 electron/services/db/migrations/001_init.sql
```

Expected: `-- migration: 001_init`. If not, prepend it.

- [ ] **Step 2: Append the umbrella assertion**

```ts
  it('matches the spec scenario "初始 schema 完整" — every required table + index exists', () => {
    const tables = tableNames(db)
    for (const t of ['files', 'tags', 'file_tags', 'files_fts', 'bookmarks', 'chats', 'queue', 'usage']) {
      expect(tables).toContain(t)
    }
    const idx = indexNames(db)
    for (const i of ['idx_files_category', 'idx_files_rating', 'idx_queue_status', 'idx_usage_ts', 'idx_usage_model']) {
      expect(idx).toContain(i)
    }
  })
```

- [ ] **Step 3: Run — GREEN**

```bash
npx vitest run electron/services/db/migrations/001_init.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 4: Run the full test suite + typecheck for regression**

```bash
npm test
npm run typecheck
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add electron/services/db/migrations/001_init.test.ts
git commit -m "feat(phase-03): 001_init umbrella schema-completeness test"
```

---

## Plan 2 Verification Checklist

- [ ] `electron/services/db/migrations/001_init.sql` starts with `-- migration: 001_init`
- [ ] All eight required tables exist after `runMigrations` on a fresh `:memory:` db
- [ ] `idx_files_category`, `idx_files_rating`, `idx_files_content_hash`, `idx_queue_status`, `uq_queue_active_path`, `idx_usage_ts`, `idx_usage_model`, `idx_usage_purpose` all exist
- [ ] FTS5 `MATCH` query against `files_fts` succeeds
- [ ] Partial unique index on `queue` rejects duplicate active reviews and accepts non-conflicting rows
- [ ] After migration, `PRAGMA user_version` returns `1`
- [ ] `npm test` is green; `npm run typecheck` passes

When all boxes are checked, mark OpenSpec tasks 3.1–3.8 done and proceed to Plan 3 (`tasks-4.1-4.8` — the `db.ts` service singleton).
