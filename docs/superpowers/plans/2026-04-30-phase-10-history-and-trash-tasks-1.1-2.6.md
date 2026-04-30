# Phase 10 History & Trash — Plan 1 (Tasks 1.1–2.6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the SQLite + main-process foundation for phase 10 — migration `003_ops_log.sql`, shared `OpsItem`/`Op` types, the `opsLog.record/list/prune` service (90 day + 10000 cap retention, prune in-transaction with each insert), and integration hooks into phase-9 conflict resolution + phase-5 watcher rename detection.

**Architecture:** All work in this plan is renderer-invisible. We add one SQL migration (`electron/services/db/migrations/003_ops_log.sql`), one shared type module (`shared/ops-types.ts`), one main-side service (`electron/services/ops/log.ts`), and surgical wiring at three call sites: phase-9's conflict-resolution branches in `ConflictDialog`'s save-handler path (after `writeSnapshot` returns), phase-9's banner-reload path, and phase-5's `watcher.ts` rename pairing block. No IPC handlers ship in this plan — those land in Plan 2.

**Tech Stack:** TypeScript, better-sqlite3, vitest, jsdiff (for later plans).

---

## Pre-flight

This plan requires phases 4 and 5 to be merged on `main` (they are — see archived `phase-04-file-io-atomic` and `phase-05-indexer-watcher`). It also touches integration points introduced by phase 9 (`phase-09-conflict-handling`). If phase 9 is **not yet merged**, Tasks 7 and 8 below (which wire `opsLog.record` into the conflict-resolution path and the banner-reload path) MUST be applied as part of phase 9's merge — not added speculatively. The migration in Task 2 is independent and can land first; phase 9 is expected to add `002_*.sql` (its own migration), so this plan numbers its file `003_ops_log.sql`.

Verify before starting:

```bash
grep -q "registerSelfWrite" /Users/aaa/develop/workspace-ai/acornvo/electron/services/watcher.ts && echo "phase-05 OK"
grep -q "renamedFromTo" /Users/aaa/develop/workspace-ai/acornvo/electron/services/watcher.ts && echo "phase-05 rename detection OK"
ls /Users/aaa/develop/workspace-ai/acornvo/electron/services/db/migrations/001_init.sql && echo "migrations runner OK"
test -f /Users/aaa/develop/workspace-ai/acornvo/shared/conflict-types.ts && echo "phase-09 types present (OK to wire 2.4/2.5)" || echo "phase-09 NOT merged: defer 2.4/2.5 wiring until merge"
```

The first three must print "OK". The fourth tells you whether to apply Tasks 7 and 8's wiring inline or hold them.

## File Structure

| Path | Action | Owner task |
|---|---|---|
| `package.json` / `package-lock.json` | Modify (add `diff` dep) | 1.1 |
| `electron/services/db/migrations/003_ops_log.sql` | Create | 1.2 |
| `electron/services/db/migrations.test.ts` | Modify (add `003` assertion) | 1.2 |
| `shared/ops-types.ts` | Create | 1.3 |
| `electron/services/ops/log.ts` | Create | 2.1, 2.2, 2.3 |
| `electron/services/ops/log.test.ts` | Create | 2.1, 2.2, 2.3 |
| `electron/services/conflicts/store.ts` | Modify (call `opsLog.record` after `writeSnapshot`) | 2.4 |
| `electron/services/conflicts/store.test.ts` | Modify (assert `ops_log` row written) | 2.4 |
| `src/stores/editor.ts` (or phase-9 banner-reload entry) | Modify (call `opsLog.record` for `load_remote_banner`) | 2.5 |
| `electron/services/watcher.ts` | Modify (call `opsLog.record({op:'rename', ...})` in `renamedFromTo` block) | 2.6 |
| `electron/services/watcher.test.ts` | Modify (assert ops row on rename) | 2.6 |

## Conventions reused

- Migrations live at `electron/services/db/migrations/00X_name.sql` and are auto-discovered by `electron/services/db/migrations.ts` (driven by `PRAGMA user_version`). The runner already wraps each file in a single transaction, so the `PRAGMA user_version = 3;` statement MUST be the last line of `003_ops_log.sql`.
- DB connection helper: `electron/services/db.ts` (uses `better-sqlite3`). `db.transaction(fn)` is the only allowed primitive for grouping the prune+insert atomically.
- Logger: `electron/services/logger.ts` exports `logger.info/warn/error`. Use `logger.warn` for non-fatal prune anomalies.
- IPC contract style: `shared/ipc-contract.ts` defines `IpcError` and `IpcErrorCode`. Even though no IPC handlers ship in this plan, the service throws `IpcError` so Plan 2 can return error shapes unchanged.
- The `ts` field of `ops_log` MUST be ISO-8601 UTC string from `new Date().toISOString()`.
- All grove-relative paths use POSIX separators (`/`), no leading slash.

---

<!-- openspec-task: 1.1 -->
### Task 1: install `diff` (jsdiff) dependency

This is a pure-config task. The `diff` package is the source for line-level diffs in later plans (Plan 4 ships the `conflict.diff` IPC); installing it now keeps Plan 1 self-contained for `package.json` changes.

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install**

```bash
npm install diff
npm install -D @types/diff
```

- [ ] **Step 2: Verify presence**

```bash
node -e "console.log(require('diff').diffLines('a\nb', 'a\nc').length)"
```
Expected: a small positive integer (e.g. `3`). If `diff` is missing, the require fails.

```bash
grep -q '"diff":' /Users/aaa/develop/workspace-ai/acornvo/package.json && echo "diff in deps OK"
grep -q '"@types/diff":' /Users/aaa/develop/workspace-ai/acornvo/package.json && echo "@types/diff in devDeps OK"
```
Both must print "OK".

- [ ] **Step 3: Type-check (catches accidentally broken types)**

```bash
npm run typecheck
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add diff (jsdiff) for line-level diffing (phase-10 1.1)"
```

---

<!-- openspec-task: 1.2 -->
### Task 2: migration `003_ops_log.sql` — create `ops_log`, indexes, bump user_version

**Files:**
- Create: `electron/services/db/migrations/003_ops_log.sql`
- Modify: `electron/services/db/migrations.test.ts`

- [ ] **Step 1: Write the failing test**

Open `electron/services/db/migrations.test.ts` and append a new test (use the same patterns as the existing `001_init` tests for an in-memory DB):

```ts
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { applyAll, getStatus } from './migrations'

describe('migration 003 ops_log', () => {
  it('applyAll bumps user_version to 3 and creates ops_log', () => {
    const db = new Database(':memory:')
    applyAll(db)
    const status = getStatus(db)
    expect(status.user_version).toBeGreaterThanOrEqual(3)
    const tbl = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ops_log'")
      .get() as { name: string } | undefined
    expect(tbl?.name).toBe('ops_log')
    const cols = db.prepare(`PRAGMA table_info(ops_log)`).all() as Array<{
      name: string
      type: string
      notnull: number
    }>
    const byName = new Map(cols.map((c) => [c.name, c]))
    expect(byName.get('id')?.type).toBe('INTEGER')
    expect(byName.get('op')?.type).toBe('TEXT')
    expect(byName.get('op')?.notnull).toBe(1)
    expect(byName.get('path')?.type).toBe('TEXT')
    expect(byName.get('path')?.notnull).toBe(1)
    expect(byName.get('ts')?.type).toBe('TEXT')
    expect(byName.get('ts')?.notnull).toBe(1)
    expect(byName.get('meta_json')?.type).toBe('TEXT')
  })

  it('creates idx_ops_log_ts and idx_ops_log_op_ts', () => {
    const db = new Database(':memory:')
    applyAll(db)
    const idx = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='ops_log'`)
      .all() as Array<{ name: string }>
    const names = new Set(idx.map((i) => i.name))
    expect(names.has('idx_ops_log_ts')).toBe(true)
    expect(names.has('idx_ops_log_op_ts')).toBe(true)
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run electron/services/db/migrations.test.ts -t "migration 003"
```
Expected: FAIL — `ops_log` does not exist; `user_version` is 1 or 2 depending on whether phase-9's `002` migration is merged.

- [ ] **Step 3: Create the migration file**

Create `electron/services/db/migrations/003_ops_log.sql`:

```sql
CREATE TABLE ops_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  op TEXT NOT NULL,
  path TEXT NOT NULL,
  ts TEXT NOT NULL,
  meta_json TEXT
);
CREATE INDEX idx_ops_log_ts ON ops_log(ts DESC);
CREATE INDEX idx_ops_log_op_ts ON ops_log(op, ts DESC);
PRAGMA user_version = 3;
```

The migrations runner reads files matching `^(\d{3})_.+\.sql$` from this directory and applies them inside transactions in numeric order. The `PRAGMA user_version = 3;` MUST be the last statement.

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run electron/services/db/migrations.test.ts -t "migration 003"
```
Expected: 2 PASS.

Run the whole migrations suite to catch regressions:

```bash
npx vitest run electron/services/db/migrations.test.ts
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/services/db/migrations/003_ops_log.sql electron/services/db/migrations.test.ts
git commit -m "feat(db): migration 003 ops_log table + indexes (phase-10 1.2)"
```

---

<!-- openspec-task: 1.3 -->
### Task 3: shared `OpsItem` / `Op` types

**Files:**
- Create: `shared/ops-types.ts`

- [ ] **Step 1: Create the types file**

Create `shared/ops-types.ts`:

```ts
/**
 * Op enum — the set of operations recorded in ops_log.
 * Keep in sync with shared/ipc-contract.ts and migration 003.
 */
export type Op =
  | 'trash'
  | 'hard_delete'
  | 'conflict_resolve'
  | 'conflict_delete'
  | 'rename'

/**
 * One row of ops_log as exposed to the renderer.
 * `meta` is already JSON.parse'd (callers do not parse).
 */
export interface OpsItem {
  id: number
  op: Op
  path: string // grove-relative POSIX path; for rename this is `old_path`
  ts: string // ISO-8601 UTC, e.g. 2026-04-30T12:30:45.123Z
  meta: Record<string, unknown> | null
}

/**
 * Input shape for opsLog.record.
 * `path` is grove-relative POSIX. `meta` is serialised to JSON internally.
 */
export interface OpsLogRecordInput {
  op: Op
  path: string
  meta?: Record<string, unknown>
}

/**
 * Pagination query for ops.list.
 */
export interface OpsLogListOptions {
  limit: number
  offset: number
  op?: Op
}

export interface OpsLogListResult {
  items: OpsItem[]
  total: number
}
```

- [ ] **Step 2: Type-check passes**

```bash
npm run typecheck
```
Expected: PASS — no other module imports the new types yet, so we're confirming the file itself compiles under both `tsconfig.node.json` (main) and `tsconfig.web.json` (renderer).

- [ ] **Step 3: Commit**

```bash
git add shared/ops-types.ts
git commit -m "feat(shared): add OpsItem/Op enum and list types (phase-10 1.3)"
```

---

<!-- openspec-task: 2.1 -->
### Task 4: scaffold `electron/services/ops/log.ts` and implement `record` + internal `prune`

**Note:** Per repo convention this lives at `electron/services/ops/log.ts`, not `src/main/ops/log.ts` (the repo has no `src/main/`).

**Files:**
- Create: `electron/services/ops/log.ts`
- Create: `electron/services/ops/log.test.ts`

- [ ] **Step 1: Write the failing test**

Create `electron/services/ops/log.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { applyAll } from '../db/migrations'
import * as dbSvc from '../db'
import * as opsLog from './log'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  applyAll(db)
  vi.spyOn(dbSvc, 'getDb').mockReturnValue(db)
})

afterEach(() => {
  vi.restoreAllMocks()
  db.close()
})

describe('opsLog.record', () => {
  it('inserts a row with op/path/ts/meta_json=null when meta omitted', () => {
    opsLog.record({ op: 'trash', path: 'notes/a.md' })
    const row = db.prepare('SELECT op, path, ts, meta_json FROM ops_log').get() as {
      op: string
      path: string
      ts: string
      meta_json: string | null
    }
    expect(row.op).toBe('trash')
    expect(row.path).toBe('notes/a.md')
    expect(row.meta_json).toBeNull()
    // ts is ISO-8601
    expect(() => new Date(row.ts).toISOString()).not.toThrow()
    expect(row.ts).toBe(new Date(row.ts).toISOString())
  })

  it('serialises meta to JSON string', () => {
    opsLog.record({
      op: 'conflict_resolve',
      path: 'notes/a.md',
      meta: { id: 'c1', resolved_by: 'save_as', winner_path: 'notes/a.copy.md' }
    })
    const row = db.prepare('SELECT meta_json FROM ops_log').get() as {
      meta_json: string
    }
    const parsed = JSON.parse(row.meta_json)
    expect(parsed.id).toBe('c1')
    expect(parsed.resolved_by).toBe('save_as')
    expect(parsed.winner_path).toBe('notes/a.copy.md')
  })

  it('stores rename meta with new_path', () => {
    opsLog.record({
      op: 'rename',
      path: 'old/a.md',
      meta: { new_path: 'new/a.md' }
    })
    const row = db.prepare('SELECT op, path, meta_json FROM ops_log').get() as {
      op: string
      path: string
      meta_json: string
    }
    expect(row.op).toBe('rename')
    expect(row.path).toBe('old/a.md')
    expect(JSON.parse(row.meta_json).new_path).toBe('new/a.md')
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run electron/services/ops/log.test.ts -t "opsLog.record"
```
Expected: FAIL — module does not exist (`Cannot find module ./log`).

- [ ] **Step 3: Implement `record` + `prune` (single transaction)**

Create `electron/services/ops/log.ts`:

```ts
import { getDb } from '../db'
import { logger } from '../logger'
import type {
  Op,
  OpsItem,
  OpsLogListOptions,
  OpsLogListResult,
  OpsLogRecordInput
} from '@shared/ops-types'

/** Retention: drop entries older than 90 days. */
const PRUNE_AGE_SQL = `DELETE FROM ops_log WHERE ts < datetime('now', '-90 days')`

/** Retention: hard cap of 10000 most-recent entries. */
const PRUNE_CAP = 10000
const PRUNE_CAP_SQL = `
  DELETE FROM ops_log
  WHERE id NOT IN (
    SELECT id FROM ops_log ORDER BY ts DESC LIMIT ?
  )
`

const INSERT_SQL = `
  INSERT INTO ops_log (op, path, ts, meta_json)
  VALUES (?, ?, ?, ?)
`

/**
 * Record a single op into ops_log.
 *
 * Behaviour:
 *  - Prune-then-insert runs in a single SQLite transaction.
 *  - Prune deletes rows older than 90 days, then enforces a 10000 row cap.
 *  - meta is JSON-stringified; pass `undefined` for `meta_json=NULL`.
 *  - Failures are logged but NOT rethrown — ops_log is best-effort audit.
 */
export function record(input: OpsLogRecordInput): void {
  const db = getDb()
  const ts = new Date().toISOString()
  const metaJson = input.meta ? JSON.stringify(input.meta) : null

  const tx = db.transaction((op: Op, path: string, ts: string, metaJson: string | null) => {
    db.prepare(PRUNE_AGE_SQL).run()
    db.prepare(PRUNE_CAP_SQL).run(PRUNE_CAP)
    db.prepare(INSERT_SQL).run(op, path, ts, metaJson)
  })

  try {
    tx(input.op, input.path, ts, metaJson)
  } catch (err) {
    logger.warn('opsLog.record failed (non-fatal)', {
      op: input.op,
      path: input.path,
      message: err instanceof Error ? err.message : String(err)
    })
  }
}

/**
 * List ops_log entries. Returned in `ts DESC` order.
 *
 * `op` filter is optional. `total` is the count matching the filter
 * (NOT capped by `limit`).
 */
export function list(opts: OpsLogListOptions): OpsLogListResult {
  const db = getDb()
  const where = opts.op ? `WHERE op = ?` : ``
  const args: unknown[] = opts.op ? [opts.op] : []
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM ops_log ${where}`)
    .get(...args) as { n: number }
  const itemRows = db
    .prepare(
      `SELECT id, op, path, ts, meta_json FROM ops_log ${where}
       ORDER BY ts DESC LIMIT ? OFFSET ?`
    )
    .all(...args, opts.limit, opts.offset) as Array<{
    id: number
    op: string
    path: string
    ts: string
    meta_json: string | null
  }>
  const items: OpsItem[] = itemRows.map((r) => ({
    id: r.id,
    op: r.op as Op,
    path: r.path,
    ts: r.ts,
    meta: r.meta_json ? safeParse(r.meta_json) : null
  }))
  return { items, total: totalRow.n }
}

function safeParse(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// Internal accessors for tests
export const _internals = {
  PRUNE_CAP,
  PRUNE_AGE_SQL,
  PRUNE_CAP_SQL
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run electron/services/ops/log.test.ts -t "opsLog.record"
```
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/services/ops/log.ts electron/services/ops/log.test.ts
git commit -m "feat(ops): opsLog.record + internal prune in single transaction (phase-10 2.1)"
```

---

<!-- openspec-task: 2.2 -->
### Task 5: prune runs before each `record` in the same transaction

This task is partially done by Task 4's implementation (the `db.transaction` wrapper already groups prune-then-insert). This task adds explicit assertions for the retention behaviour.

**Files:**
- Modify: `electron/services/ops/log.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `electron/services/ops/log.test.ts`:

```ts
describe('opsLog.record prune (90-day age)', () => {
  it('drops rows older than 90 days before inserting', () => {
    // Seed an old row via direct SQL (bypassing record so prune doesn't fire)
    const oldTs = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString()
    db.prepare('INSERT INTO ops_log (op, path, ts, meta_json) VALUES (?, ?, ?, ?)').run(
      'trash',
      'old.md',
      oldTs,
      null
    )
    expect((db.prepare('SELECT COUNT(*) AS n FROM ops_log').get() as { n: number }).n).toBe(1)

    opsLog.record({ op: 'trash', path: 'fresh.md' })

    const rows = db
      .prepare('SELECT path FROM ops_log ORDER BY ts ASC')
      .all() as Array<{ path: string }>
    // The 100-day-old row was pruned; only the fresh one remains
    expect(rows.map((r) => r.path)).toEqual(['fresh.md'])
  })
})

describe('opsLog.record prune (10000 cap)', () => {
  it('enforces 10000-row cap by ts DESC', () => {
    // Seed 10005 rows with monotonically increasing ts via raw SQL
    const stmt = db.prepare(
      'INSERT INTO ops_log (op, path, ts, meta_json) VALUES (?, ?, ?, ?)'
    )
    const base = Date.now() - 60 * 60 * 1000 // 1h ago
    for (let i = 0; i < 10005; i++) {
      const ts = new Date(base + i).toISOString()
      stmt.run('trash', `seed/${i}.md`, ts, null)
    }
    expect(
      (db.prepare('SELECT COUNT(*) AS n FROM ops_log').get() as { n: number }).n
    ).toBe(10005)

    // Next record() should prune cap to 10000, then insert → final count 10000
    opsLog.record({ op: 'trash', path: 'newest.md' })

    const finalCount = (db.prepare('SELECT COUNT(*) AS n FROM ops_log').get() as {
      n: number
    }).n
    expect(finalCount).toBe(10000)
    // Newest row is preserved
    const newest = db
      .prepare('SELECT path FROM ops_log ORDER BY ts DESC LIMIT 1')
      .get() as { path: string }
    expect(newest.path).toBe('newest.md')
  })
})

describe('opsLog.record atomicity', () => {
  it('prune and insert are committed atomically (single transaction)', () => {
    // Seed an old row that should be pruned
    const oldTs = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString()
    db.prepare('INSERT INTO ops_log (op, path, ts, meta_json) VALUES (?, ?, ?, ?)').run(
      'trash',
      'old.md',
      oldTs,
      null
    )
    // After record returns, both effects (prune of old + insert of new) are visible
    opsLog.record({ op: 'trash', path: 'new.md' })
    const rows = db.prepare('SELECT path FROM ops_log').all() as Array<{ path: string }>
    expect(rows.map((r) => r.path).sort()).toEqual(['new.md'])
  })
})
```

- [ ] **Step 2: Run, confirm pass (Task 4's impl already satisfies this)**

```bash
npx vitest run electron/services/ops/log.test.ts -t "prune"
npx vitest run electron/services/ops/log.test.ts -t "atomicity"
```
Expected: 3 PASS. If any fail, the prune was not actually called inside the transaction in Task 4 — fix `record` so the `db.transaction` body invokes prune first, then insert (NOT prune outside the tx).

- [ ] **Step 3: Run the whole ops/log file to catch regressions**

```bash
npx vitest run electron/services/ops/log.test.ts
```
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add electron/services/ops/log.test.ts
git commit -m "test(ops): assert prune-in-transaction for 90-day age + 10000 cap (phase-10 2.2)"
```

---

<!-- openspec-task: 2.3 -->
### Task 6: implement `list({ limit, offset, op? })` returning `{ items, total }`

**Files:**
- Modify: `electron/services/ops/log.test.ts`

(Implementation already shipped in Task 4; this task adds the test cases.)

- [ ] **Step 1: Write the failing tests**

Append to `electron/services/ops/log.test.ts`:

```ts
describe('opsLog.list', () => {
  it('returns items in ts DESC order with total count', () => {
    opsLog.record({ op: 'trash', path: 'a.md' })
    // tiny pause so ISO ts strings differ
    const t0 = Date.now()
    while (Date.now() - t0 < 2) {
      /* spin 2ms to ensure distinct ISO ms */
    }
    opsLog.record({ op: 'rename', path: 'b.md', meta: { new_path: 'b2.md' } })
    const result = opsLog.list({ limit: 10, offset: 0 })
    expect(result.total).toBe(2)
    expect(result.items.length).toBe(2)
    // newest first
    expect(result.items[0].path).toBe('b.md')
    expect(result.items[1].path).toBe('a.md')
  })

  it('respects limit and offset', () => {
    for (let i = 0; i < 5; i++) {
      opsLog.record({ op: 'trash', path: `n${i}.md` })
      const t0 = Date.now()
      while (Date.now() - t0 < 2) {
        /* spin */
      }
    }
    const page = opsLog.list({ limit: 2, offset: 1 })
    expect(page.total).toBe(5)
    expect(page.items.length).toBe(2)
    // newest first → offset 1 means skip n4
    expect(page.items.map((i) => i.path)).toEqual(['n3.md', 'n2.md'])
  })

  it('filters by op when supplied', () => {
    opsLog.record({ op: 'trash', path: 'a.md' })
    opsLog.record({ op: 'rename', path: 'b.md', meta: { new_path: 'b2.md' } })
    opsLog.record({ op: 'trash', path: 'c.md' })
    const onlyTrash = opsLog.list({ limit: 50, offset: 0, op: 'trash' })
    expect(onlyTrash.total).toBe(2)
    expect(onlyTrash.items.every((i) => i.op === 'trash')).toBe(true)
    const onlyRename = opsLog.list({ limit: 50, offset: 0, op: 'rename' })
    expect(onlyRename.total).toBe(1)
    expect(onlyRename.items[0].path).toBe('b.md')
  })

  it('returns parsed meta object (not the raw string)', () => {
    opsLog.record({
      op: 'conflict_resolve',
      path: 'a.md',
      meta: { id: 'c1', resolved_by: 'keep_local' }
    })
    const result = opsLog.list({ limit: 1, offset: 0 })
    expect(result.items[0].meta).toEqual({ id: 'c1', resolved_by: 'keep_local' })
    // null when meta absent
    opsLog.record({ op: 'trash', path: 'b.md' })
    const all = opsLog.list({ limit: 10, offset: 0 })
    const trashItem = all.items.find((i) => i.path === 'b.md')!
    expect(trashItem.meta).toBeNull()
  })

  it('returns empty result when table empty', () => {
    const result = opsLog.list({ limit: 10, offset: 0 })
    expect(result.total).toBe(0)
    expect(result.items).toEqual([])
  })
})
```

- [ ] **Step 2: Run, confirm pass**

```bash
npx vitest run electron/services/ops/log.test.ts -t "opsLog.list"
```
Expected: 5 PASS.

- [ ] **Step 3: Commit**

```bash
git add electron/services/ops/log.test.ts
git commit -m "test(ops): list with pagination + op filter + parsed meta (phase-10 2.3)"
```

---

<!-- openspec-task: 2.4 -->
### Task 7: wire phase-9 `ConflictDialog` three branches into `opsLog.record`

**Skip-if-deferred:** If phase-9 is not yet merged (the pre-flight check showed `shared/conflict-types.ts` missing), STOP this task and return — Plan 2 will pick up the wiring when phase 9 lands.

The wiring point for the three `ConflictDialog` branches (`keep_local` / `load_remote` / `save_as`) is the **main-process** snapshot writer that phase 9 builds: `electron/services/conflicts/store.ts → writeSnapshot()`. Each call to `writeSnapshot` corresponds to exactly one resolved conflict, and `writeSnapshot` already returns `{ id }` and knows `resolved_by` and (for `save_as`) `winner_path`. We add the `opsLog.record` call right after the atomic `Promise.all` writes succeed, before `prune()`.

**Files:**
- Modify: `electron/services/conflicts/store.ts`
- Modify: `electron/services/conflicts/store.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `electron/services/conflicts/store.test.ts` (the test file already has the grove + tmp-dir scaffold from phase 9):

```ts
import * as opsLog from '../ops/log'

describe('writeSnapshot wires opsLog.record (phase-10 2.4)', () => {
  it('records op=conflict_resolve with id + resolved_by for keep_local', async () => {
    const recordSpy = vi.spyOn(opsLog, 'record')
    const { id } = await store.writeSnapshot({
      path: 'notes/a.md',
      baseText: 'B',
      localText: 'L',
      remoteText: 'R',
      resolvedBy: 'keep_local'
    })
    expect(recordSpy).toHaveBeenCalledWith({
      op: 'conflict_resolve',
      path: 'notes/a.md',
      meta: { id, resolved_by: 'keep_local' }
    })
  })

  it('records op=conflict_resolve with winner_path for save_as', async () => {
    const recordSpy = vi.spyOn(opsLog, 'record')
    const { id } = await store.writeSnapshot({
      path: 'notes/a.md',
      baseText: 'B',
      localText: 'L',
      remoteText: 'R',
      resolvedBy: 'save_as',
      winnerPath: 'notes/a.conflict.2026-04-30T12-30-45.md'
    })
    expect(recordSpy).toHaveBeenCalledWith({
      op: 'conflict_resolve',
      path: 'notes/a.md',
      meta: {
        id,
        resolved_by: 'save_as',
        winner_path: 'notes/a.conflict.2026-04-30T12-30-45.md'
      }
    })
  })

  it('records op=conflict_resolve for load_remote', async () => {
    const recordSpy = vi.spyOn(opsLog, 'record')
    const { id } = await store.writeSnapshot({
      path: 'notes/a.md',
      baseText: 'B',
      localText: 'L',
      remoteText: 'R',
      resolvedBy: 'load_remote'
    })
    expect(recordSpy).toHaveBeenCalledWith({
      op: 'conflict_resolve',
      path: 'notes/a.md',
      meta: { id, resolved_by: 'load_remote' }
    })
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run electron/services/conflicts/store.test.ts -t "phase-10 2.4"
```
Expected: 3 FAIL — `recordSpy` never called.

- [ ] **Step 3: Implement — wire `opsLog.record` into `writeSnapshot`**

Edit `electron/services/conflicts/store.ts`. Add the import near the existing imports:

```ts
import * as opsLog from '../ops/log'
```

In the `writeSnapshot` body, immediately after the four-file `Promise.all` resolves and BEFORE the prune block, add:

```ts
  // ops_log: record the resolution (id + resolved_by + winner_path?)
  opsLog.record({
    op: 'conflict_resolve',
    path: input.path,
    meta: {
      id,
      resolved_by: input.resolvedBy,
      ...(input.winnerPath ? { winner_path: input.winnerPath } : {})
    }
  })
```

`opsLog.record` is synchronous and never throws (failures are logged), so it is safe to call inline without a try/catch.

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run electron/services/conflicts/store.test.ts -t "phase-10 2.4"
```
Expected: 3 PASS.

Run the full conflicts store test file to catch regressions:

```bash
npx vitest run electron/services/conflicts/store.test.ts
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/services/conflicts/store.ts electron/services/conflicts/store.test.ts
git commit -m "feat(conflicts): record conflict_resolve into ops_log (phase-10 2.4)"
```

---

<!-- openspec-task: 2.5 -->
### Task 8: wire phase-9 banner-reload (`resolved_by='load_remote_banner'`) into `opsLog.record`

**Skip-if-deferred:** Same as Task 7 — apply only if phase 9 is merged.

The banner-reload path is phase 9's "external change detected, click to reload" handler. It does NOT go through `writeSnapshot` (no conflict resolution dialog is shown), so wiring at `writeSnapshot` is insufficient. Phase 9's `ConflictDialog` and editor store call site for the banner is `src/stores/editor.ts` (the editor store's `reloadFromDisk` action that fires when the banner is clicked) — but that runs in the **renderer**, and we want to keep ops_log writes main-side. The right move: Plan 2 will introduce an `ops.record` IPC; until then, wire the banner-reload's main-side counterpart.

If phase 9 ships with a main-side `recordBannerReload(path)` helper or similar (e.g. inside the conflict store), call `opsLog.record` from there. Otherwise, do BOTH of the following:

1. Add a thin main-side helper in `electron/services/conflicts/store.ts`:

```ts
/**
 * Record a banner-reload (no snapshot, no dialog) into ops_log.
 * Renderer reaches this via Plan 2's `ops.record` IPC; this helper
 * exists so the call shape matches `writeSnapshot`-paired writes.
 */
export function recordBannerReload(path: string): void {
  opsLog.record({
    op: 'conflict_resolve',
    path,
    meta: { resolved_by: 'load_remote_banner' }
  })
}
```

2. Mark a TODO in `src/stores/editor.ts`'s `reloadFromDisk` action (or wherever phase 9 hooks the banner click) so Plan 2 wires the IPC call.

**Files:**
- Modify: `electron/services/conflicts/store.ts`
- Modify: `electron/services/conflicts/store.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `electron/services/conflicts/store.test.ts`:

```ts
describe('recordBannerReload (phase-10 2.5)', () => {
  it('records op=conflict_resolve with resolved_by=load_remote_banner', () => {
    const recordSpy = vi.spyOn(opsLog, 'record')
    store.recordBannerReload('notes/a.md')
    expect(recordSpy).toHaveBeenCalledWith({
      op: 'conflict_resolve',
      path: 'notes/a.md',
      meta: { resolved_by: 'load_remote_banner' }
    })
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run electron/services/conflicts/store.test.ts -t "phase-10 2.5"
```
Expected: FAIL — `store.recordBannerReload` is not exported.

- [ ] **Step 3: Implement**

Add the helper exported from `electron/services/conflicts/store.ts` exactly as shown above.

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run electron/services/conflicts/store.test.ts -t "phase-10 2.5"
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/services/conflicts/store.ts electron/services/conflicts/store.test.ts
git commit -m "feat(conflicts): recordBannerReload helper for load_remote_banner ops (phase-10 2.5)"
```

---

<!-- openspec-task: 2.6 -->
### Task 9: wire phase-5 watcher rename detection into `opsLog.record`

The watcher pairs `unlink` + `add` events with matching `content_hash` into a rename in `electron/services/watcher.ts`. The pairing populates `renamedFromTo: Map<oldRel, newRel>` and immediately calls `renameFile(_db!, oldRel, newRel)`. We add `opsLog.record` right next to the existing `renameFile` call so rename events become a single audit record.

**Files:**
- Modify: `electron/services/watcher.ts`
- Modify: `electron/services/watcher.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `electron/services/watcher.test.ts` (the file already has scaffolding for tmp grove + watcher start). If your test file uses a fresh DB per test, mock `opsLog.record`:

```ts
import * as opsLog from './ops/log'

describe('watcher rename → ops_log (phase-10 2.6)', () => {
  it('records op=rename with old path + meta.new_path when rename detected', async () => {
    const recordSpy = vi.spyOn(opsLog, 'record')
    // Use the existing test scaffold: write a file with known content,
    // start the watcher, then rename via fs.rename and wait for the
    // debounce window. The exact helpers are file-local — re-use
    // whatever `await waitForRename(...)` helper already exists.
    await writeAndWait('a.md', '# hello\n')
    await renameAndWait('a.md', 'b.md')
    expect(recordSpy).toHaveBeenCalledWith({
      op: 'rename',
      path: 'a.md',
      meta: { new_path: 'b.md' }
    })
  })
})
```

If `watcher.test.ts` does not already have helpers for this, use the same mkdtemp/chokidar dance from the existing rename-detection test as a template (search for `renamedFromTo` references in the test file).

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run electron/services/watcher.test.ts -t "phase-10 2.6"
```
Expected: FAIL — `recordSpy` never called.

- [ ] **Step 3: Implement — call `opsLog.record` alongside `renameFile`**

Edit `electron/services/watcher.ts`. Add the import near existing imports:

```ts
import * as opsLog from './ops/log'
```

Find the loop that walks `renamedFromTo` and calls `renameFile` (around the lines that match the pattern `for (const [oldRel, newRel] of renamedFromTo)` immediately followed by `renameFile(_db!, oldRel, newRel)`). Inside the same loop body, append:

```ts
      opsLog.record({
        op: 'rename',
        path: oldRel,
        meta: { new_path: newRel }
      })
```

The result should look like:

```ts
    for (const [oldRel, newRel] of renamedFromTo) {
      renameFile(_db!, oldRel, newRel)
      opsLog.record({
        op: 'rename',
        path: oldRel,
        meta: { new_path: newRel }
      })
    }
```

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run electron/services/watcher.test.ts -t "phase-10 2.6"
```
Expected: PASS.

Run the full watcher suite to catch regressions:

```bash
npx vitest run electron/services/watcher.test.ts
```
Expected: all PASS.

- [ ] **Step 5: Run the entire test suite**

```bash
npm test
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/services/watcher.ts electron/services/watcher.test.ts
git commit -m "feat(watcher): record op=rename into ops_log on rename pairing (phase-10 2.6)"
```

---

## Self-Review

After all tasks pass:

1. **Spec coverage:** This plan covers tasks 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6. Confirm by grepping plan for `openspec-task`:

```bash
grep -E "openspec-task: (1\.[1-3]|2\.[1-6])" /Users/aaa/develop/workspace-ai/acornvo/docs/superpowers/plans/2026-04-30-phase-10-history-and-trash-tasks-1.1-2.6.md | sort -u
```
Expected: 9 unique labels (1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6).

2. **Prune is invoked inside the same transaction as record (Task 2.2):** look at the implementation in Task 4 — `record` builds `tx = db.transaction((...) => { db.prepare(PRUNE_AGE_SQL).run(); db.prepare(PRUNE_CAP_SQL).run(PRUNE_CAP); db.prepare(INSERT_SQL).run(...) })` and invokes `tx(...)`. The transaction body runs prune-age, prune-cap, then insert as a single atomic unit. Task 5's "atomicity" test asserts both effects (prune of old, insert of new) become visible together.

3. **No placeholders:** every step has either runnable code, a runnable command, or a commit message. No "TBD" or "implement later" language. Tasks 7 and 8 carry an explicit "Skip-if-deferred" instruction tied to a verifiable pre-flight check (`shared/conflict-types.ts` presence), not a vague deferral.

4. **Type consistency:** `Op` enum values (`'trash' | 'hard_delete' | 'conflict_resolve' | 'conflict_delete' | 'rename'`) match exactly across `shared/ops-types.ts`, the migration's lack of CHECK constraint (any string accepted at the DB layer; type system enforces), and the wiring tasks 7–9 which only emit `'conflict_resolve'` and `'rename'`.
