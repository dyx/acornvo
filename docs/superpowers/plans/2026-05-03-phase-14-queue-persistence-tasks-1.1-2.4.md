# Phase-14 Queue Persistence — Plan 1: Schema, Types & Store Layer

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-14-queue-persistence`
> **Task range:** OpenSpec tasks `1.1`–`2.4` (7 tasks)
> **Plan order:** 1 of 4. Subsequent plans (`tasks-3.1-5.3`, `tasks-6.1-9.1`, `tasks-10.1-10.14`) build on this one.
> **Status:** Not started
> **Created:** 2026-05-03
> **Branch suggestion:** `feat/phase-14-queue-persistence` (branch from `main` after phase-13 lands)

---

## Goal

Add migration `007_jobs.sql`, the `Job` / `JobStatus` / `JobKind` shared types, the `jobs` IPC contract, and the `electron/queue/store.ts` persistence layer (CRUD + dedupe + crash recovery + `stateChanged` emitter) — fully unit-tested.

## Architecture

The queue is a single SQLite table (`jobs`) per grove with a thin store wrapper. The store is the **only writer** to the table; the runner (Plan 2) and IPC handlers (Plan 2) call into it. Dedupe is implemented by injecting a synthetic `__dedupe` field into the payload JSON and querying with `json_extract(payload_json, '$.__dedupe')` so the existing `payload_json TEXT` column is enough — no extra column needed. The store exposes a Node `EventEmitter` (`stateChanged`) so the runner can react to its own writes and the IPC bridge can fan out to renderers (wired in Plan 2).

## Tech Stack

- TypeScript 5, better-sqlite3 12 (already a project dep)
- `uuid` (v4) — already a project dep, used for job ids
- `vitest` — unit tests for every helper
- Node `EventEmitter` from `node:events`

## Cross-Plan Decisions (locked here, referenced by later plans)

1. **Module layout**: queue code lives under `electron/queue/` (top-level under `electron/`), matching the design wording verbatim. Mirrors the convention phase-13 used for `electron/settings/`.
2. **Job id**: UUID v4 string. Generated in `enqueue` via the project-bundled `uuid` lib.
3. **Time format**: ISO-8601 UTC strings (`new Date().toISOString()`) for `next_run_at`, `created_at`, `updated_at`. Parsed via `Date.parse(...)` when comparing. SQLite text-comparison of ISO strings sorts correctly because the format is fixed-width.
4. **Status string set** (locked): `'pending' | 'running' | 'failed' | 'done' | 'canceled'`. Anything else is a programmer error.
5. **`__dedupe` field**: injected only when `opts.dedupeKey` is provided. Never appears in the user-visible payload returned by `list()`. The store is responsible for stripping `__dedupe` from `payload` in API responses (see Task 2.1).
6. **`stateChanged` emitter**: synchronous; payload is the **fresh** Job row read back after the write. Runners and IPC consumers must not mutate the row.
7. **DB handle**: every store function takes `db: Database.Database` (no internal singleton). Callers pass `requireCurrent()` from `electron/services/db.ts`. Keeps tests trivial (in-memory DB) and matches the phase-05 `index-queries` pattern.

---

## Pre-flight

This plan assumes phases 10–13 have shipped. In particular:

- Phase 10 has added `ops_log` and exports an `opsLog.record({ op, path, meta? })` writer. **Plan 2** integrates with it; Plan 1 does not.
- Phase 12 has shipped a `clipper/pipeline.ts` whose tail calls a no-op `clipQueue.enqueue(...)` placeholder. **Plan 3** rewires it; Plan 1 does not.
- Migrations `001_init.sql` … `006_settings.sql` are all present and `user_version=6` after running them. The next free migration number is **007**.

If migration numbering has drifted (e.g., phase-10's `ops_log` ended up at `004_ops_log.sql`, etc.), confirm `user_version=6` is the post-phase-13 baseline before writing `007_jobs.sql`. If it isn't, **stop and reconcile** with the `phase-14-queue-persistence/design.md` D1 section.

---

## File Structure

| Path                                               | Action                                                   | Owner task         |
| -------------------------------------------------- | -------------------------------------------------------- | ------------------ |
| `electron/services/db/migrations/007_jobs.sql`     | Create                                                   | 1.1                |
| `electron/services/db/migrations/007_jobs.test.ts` | Create                                                   | 1.1                |
| `shared/job-types.ts`                              | Create                                                   | 1.2                |
| `shared/job-types.test.ts`                         | Create                                                   | 1.2                |
| `shared/ipc-contract.ts`                           | Modify (add `jobs` namespace + `IpcEventContract` entry) | 1.3                |
| `electron/queue/store.ts`                          | Create                                                   | 2.1, 2.2, 2.3, 2.4 |
| `electron/queue/store.test.ts`                     | Create                                                   | 2.1, 2.2, 2.3, 2.4 |

---

## Tasks

<!-- openspec-task: 1.1 -->

### Task 1: Migration 007 — `jobs` table + indexes

**Files:**

- Create: `electron/services/db/migrations/007_jobs.sql`
- Create: `electron/services/db/migrations/007_jobs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// electron/services/db/migrations/007_jobs.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../migrations'

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url))

describe('migration 007 — jobs', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)
  })
  afterEach(() => db.close())

  it('bumps user_version to 7', () => {
    expect(db.pragma('user_version', { simple: true }) as number).toBe(7)
  })

  it('creates jobs table with the expected columns + types', () => {
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    ).map((r) => r.name)
    expect(tables).toContain('jobs')

    const info = db.pragma("table_info('jobs')") as {
      name: string
      type: string
      notnull: number
      pk: number
      dflt_value: string | null
    }[]
    const byName = Object.fromEntries(info.map((c) => [c.name, c]))

    expect(byName.id?.pk).toBe(1)
    expect(byName.id?.type.toUpperCase()).toBe('TEXT')
    expect(byName.kind?.notnull).toBe(1)
    expect(byName.payload_json?.notnull).toBe(1)
    expect(byName.status?.notnull).toBe(1)
    expect(byName.attempts?.notnull).toBe(1)
    expect(byName.attempts?.dflt_value).toBe('0')
    expect(byName.next_run_at?.notnull).toBe(1)
    expect(byName.last_error?.notnull).toBe(0) // nullable
    expect(byName.created_at?.notnull).toBe(1)
    expect(byName.updated_at?.notnull).toBe(1)
  })

  it('creates the two expected indexes', () => {
    const indexes = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as { name: string }[]
    ).map((r) => r.name)
    expect(indexes).toContain('idx_jobs_status_next_run')
    expect(indexes).toContain('idx_jobs_kind_status')
  })

  it('allows inserting a representative pending row', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO jobs (id, kind, payload_json, status, attempts, next_run_at, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?)`
        )
        .run(
          'j-1',
          'index-retry',
          JSON.stringify({ path: 'a.md' }),
          'pending',
          0,
          '2026-05-03T00:00:00.000Z',
          '2026-05-03T00:00:00.000Z',
          '2026-05-03T00:00:00.000Z'
        )
    ).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- electron/services/db/migrations/007_jobs.test.ts`
Expected: FAIL with `user_version` returning `6`, not `7` (no migration file yet).

- [ ] **Step 3: Write the migration SQL**

Create `electron/services/db/migrations/007_jobs.sql`:

```sql
-- migration: 007_jobs
-- Persistent job queue (phase-14). One table per grove, one runner.
-- Status set: 'pending' | 'running' | 'failed' | 'done' | 'canceled'.

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_run_at TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_jobs_status_next_run ON jobs(status, next_run_at);
CREATE INDEX idx_jobs_kind_status ON jobs(kind, status);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- electron/services/db/migrations/007_jobs.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Run the full migration test suite to ensure no regressions**

Run: `npm test -- electron/services/db`
Expected: PASS — all migration tests still green; `user_version` chain `0 → 1 → 2 → 3 → 4 → 5 → 6 → 7` all walks cleanly.

- [ ] **Step 6: Commit**

```bash
git add electron/services/db/migrations/007_jobs.sql electron/services/db/migrations/007_jobs.test.ts
git commit -m "feat(db): migration 007 — jobs table + indexes (phase-14 1.1)"
```

---

<!-- openspec-task: 1.2 -->

### Task 2: Shared types — `Job`, `JobKind`, `JobStatus`, handler result, enqueue opts

**Files:**

- Create: `shared/job-types.ts`
- Create: `shared/job-types.test.ts`

These types are used by main, preload, and renderer, so they live under `shared/`. The handler-result and enqueue-opts types are also exported from here so the runner (Plan 2) and the IPC contract (Task 1.3) can both reference them.

- [ ] **Step 1: Write the failing test**

```ts
// shared/job-types.test.ts
import { describe, it, expect } from 'vitest'
import {
  JOB_STATUSES,
  isJobStatus,
  isJobKind,
  type Job,
  type JobHandlerResult,
  type EnqueueOpts
} from './job-types'

describe('JOB_STATUSES set', () => {
  it('contains the five locked statuses', () => {
    expect(new Set(JOB_STATUSES)).toEqual(
      new Set(['pending', 'running', 'failed', 'done', 'canceled'])
    )
  })
})

describe('isJobStatus type guard', () => {
  it('returns true for known statuses', () => {
    for (const s of JOB_STATUSES) expect(isJobStatus(s)).toBe(true)
  })
  it('returns false for unknown values', () => {
    expect(isJobStatus('queued')).toBe(false)
    expect(isJobStatus(undefined)).toBe(false)
    expect(isJobStatus(42 as unknown)).toBe(false)
  })
})

describe('isJobKind type guard', () => {
  it('accepts the two phase-14 kinds', () => {
    expect(isJobKind('ai-review-clip')).toBe(true)
    expect(isJobKind('index-retry')).toBe(true)
  })
  it('rejects unknown kinds', () => {
    expect(isJobKind('email-blast')).toBe(false)
  })
})

describe('Job shape', () => {
  it('compiles with required fields', () => {
    const j: Job = {
      id: 'j-1',
      kind: 'index-retry',
      payload: { path: 'a.md' },
      status: 'pending',
      attempts: 0,
      nextRunAt: '2026-05-03T00:00:00.000Z',
      lastError: null,
      createdAt: '2026-05-03T00:00:00.000Z',
      updatedAt: '2026-05-03T00:00:00.000Z'
    }
    expect(j.id).toBe('j-1')
  })
})

describe('JobHandlerResult shape', () => {
  it('discriminates on `kind`', () => {
    const ok: JobHandlerResult = { kind: 'ok' }
    const retry: JobHandlerResult = { kind: 'retry', delayMs: 1000, reason: 'EIO' }
    const fail: JobHandlerResult = { kind: 'fail', error: 'E_MISSING_PROFILE' }
    expect(ok.kind).toBe('ok')
    expect(retry.kind).toBe('retry')
    expect(fail.kind).toBe('fail')
  })
})

describe('EnqueueOpts shape', () => {
  it('allows delayMs and dedupeKey to be optional', () => {
    const a: EnqueueOpts = {}
    const b: EnqueueOpts = { delayMs: 5000 }
    const c: EnqueueOpts = { dedupeKey: 'clip:1' }
    const d: EnqueueOpts = { delayMs: 5000, dedupeKey: 'clip:1' }
    expect([a, b, c, d].length).toBe(4)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- shared/job-types.test.ts`
Expected: FAIL — `Cannot find module './job-types'`.

- [ ] **Step 3: Implement the module**

Create `shared/job-types.ts`:

```ts
/**
 * Phase-14 queue persistence — shared types.
 * Used by main (store + runner + IPC), preload (bridge), and renderer (UI).
 */

export const JOB_STATUSES = ['pending', 'running', 'failed', 'done', 'canceled'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export function isJobStatus(v: unknown): v is JobStatus {
  return typeof v === 'string' && (JOB_STATUSES as readonly string[]).includes(v)
}

/** Phase-14 ships these two; later phases may register more. */
export const JOB_KINDS = ['ai-review-clip', 'index-retry'] as const
export type JobKind = (typeof JOB_KINDS)[number]

export function isJobKind(v: unknown): v is JobKind {
  return typeof v === 'string' && (JOB_KINDS as readonly string[]).includes(v)
}

/**
 * The user-facing Job row. Mirrors the SQL schema except:
 *  - `payload_json` is parsed back to `payload` (Record<string, unknown>)
 *  - the `__dedupe` synthetic field is stripped
 *  - timestamps are passed through as ISO-8601 strings
 */
export interface Job {
  id: string
  kind: string // not narrowed to JobKind so unknown future kinds round-trip
  payload: Record<string, unknown>
  status: JobStatus
  attempts: number
  nextRunAt: string
  lastError: string | null
  createdAt: string
  updatedAt: string
}

/** Discriminated union returned by handlers. */
export type JobHandlerResult =
  | { kind: 'ok' }
  | { kind: 'retry'; delayMs: number; reason: string }
  | { kind: 'fail'; error: string }

export interface EnqueueOpts {
  /** Defer the first run; default 0. */
  delayMs?: number
  /** When set, an existing pending/running (kind, dedupeKey) returns its id without inserting. */
  dedupeKey?: string
}

/** Filter shape for `jobs.list`. Used by IPC + store. */
export interface JobListFilter {
  kind?: string
  status?: JobStatus
  limit: number
  offset: number
  /** Default `'next_run_at'`; ascending. */
  orderBy?: 'next_run_at' | 'updated_at' | 'created_at'
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- shared/job-types.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/job-types.ts shared/job-types.test.ts
git commit -m "feat(types): job-types shared module (phase-14 1.2)"
```

---

<!-- openspec-task: 1.3 -->

### Task 3: IPC contract — `jobs` namespace + `jobs:changed` event

**Files:**

- Modify: `shared/ipc-contract.ts`

We add the `jobs` request namespace and the `jobs:changed` push event channel. The Plan 2 IPC handlers and Plan 3 renderer subscription both consume these types.

- [ ] **Step 1: Read the current contract to find the right insertion points**

```bash
grep -n "// --- conflict namespace types\|// --- index namespace types\|export type IpcContract = {\|export type IpcEventContract = {" shared/ipc-contract.ts
```

Expected: lines for the conflict types block, the IpcContract definition, and IpcEventContract definition.

- [ ] **Step 2: Add jobs-namespace types just above `IpcContract`**

Insert before `export type IpcContract = {`:

```ts
// --- jobs namespace types (phase-14) ---

import type { Job, JobStatus, EnqueueOpts, JobListFilter } from './job-types'

export type { Job, JobStatus, EnqueueOpts, JobListFilter, JobKind } from './job-types'

export interface JobsListResult {
  items: Job[]
  total: number
}

export type JobsRetryError = 'E_NOT_FOUND' | 'E_STATUS_NOT_ALLOWED'
export type JobsCancelError = 'E_NOT_FOUND' | 'E_STATUS_NOT_ALLOWED'

export type JobsRetryResult = { ok: true } | { error: JobsRetryError }
export type JobsCancelResult = { ok: true } | { error: JobsCancelError }
export type JobsClearDoneResult = { removed: number }
```

- [ ] **Step 3: Add the `jobs` namespace inside `IpcContract`**

Inside the `IpcContract` object literal (after `search:` block, before the closing `}`):

```ts
jobs: {
  list: (filter: JobListFilter) => JobsListResult
  retry: (id: string) => JobsRetryResult
  cancel: (id: string) => JobsCancelResult
  clearDone: () => JobsClearDoneResult
}
```

- [ ] **Step 4: Add the `jobs:changed` event channel**

Inside `IpcEventContract`:

```ts
  'jobs:changed': Job
```

- [ ] **Step 5: Add a typecheck-only test entry**

Modify `shared/ipc-contract.type-test.ts` (append at bottom; if the file already exports a `_typeAssert` block, extend it):

```ts
import type { IpcContract, IpcEventContract } from './ipc-contract'
import type { Job } from './job-types'

// jobs namespace round-trip
type _ListReturn = ReturnType<IpcContract['jobs']['list']>
type _Items = _ListReturn extends { items: infer I } ? I : never
const _itemsCheck: _Items = [] as Job[]
void _itemsCheck

// jobs:changed event channel
type _Evt = IpcEventContract['jobs:changed']
const _evtCheck: _Evt = {} as Job
void _evtCheck
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Run existing IPC contract tests**

Run: `npm test -- shared/ipc-contract.test.ts`
Expected: PASS — no regression in earlier-phase IPC types.

- [ ] **Step 8: Commit**

```bash
git add shared/ipc-contract.ts shared/ipc-contract.type-test.ts
git commit -m "feat(ipc): add jobs namespace + jobs:changed event (phase-14 1.3)"
```

---

<!-- openspec-task: 2.1 -->

### Task 4: Store core — `enqueue` (no dedupe yet) + `markRunning` / `markDone` / `markRetry` / `markFailed` / `markCanceled` / `list` / `getById`

**Files:**

- Create: `electron/queue/store.ts`
- Create: `electron/queue/store.test.ts`

This task implements the no-dedupe path (single-row insert) and all status-mutation methods. Dedupe is added in Task 2.2; startup recovery in Task 2.3; the EventEmitter wiring in Task 2.4 — but the test file is built up incrementally from here.

- [ ] **Step 1: Write the failing test (core CRUD only)**

Create `electron/queue/store.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../services/db/migrations'
import { createJobStore } from './store'

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'services',
  'db',
  'migrations'
)

function freshDb(): Database.Database {
  const db = new Database(':memory:')
  runMigrations(db, MIGRATIONS_DIR)
  return db
}

describe('createJobStore — enqueue (no dedupe)', () => {
  let db: Database.Database
  beforeEach(() => {
    db = freshDb()
  })
  afterEach(() => db.close())

  it('inserts a pending job with attempts=0 and next_run_at ≈ now', () => {
    const store = createJobStore(db, { now: () => new Date('2026-05-03T10:00:00.000Z') })
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    expect(typeof id).toBe('string')
    expect(id).toMatch(/^[0-9a-f-]{36}$/i) // uuid v4 shape

    const row = db.prepare('SELECT * FROM jobs WHERE id=?').get(id) as {
      kind: string
      payload_json: string
      status: string
      attempts: number
      next_run_at: string
      last_error: string | null
    }
    expect(row.kind).toBe('index-retry')
    expect(JSON.parse(row.payload_json)).toEqual({ path: 'a.md' })
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(0)
    expect(row.next_run_at).toBe('2026-05-03T10:00:00.000Z')
    expect(row.last_error).toBe(null)
  })

  it('respects opts.delayMs', () => {
    const store = createJobStore(db, { now: () => new Date('2026-05-03T10:00:00.000Z') })
    const { id } = store.enqueue('index-retry', { path: 'a.md' }, { delayMs: 5000 })
    const row = db.prepare('SELECT next_run_at FROM jobs WHERE id=?').get(id) as {
      next_run_at: string
    }
    expect(row.next_run_at).toBe('2026-05-03T10:00:05.000Z')
  })
})

describe('createJobStore — status mutations', () => {
  let db: Database.Database
  beforeEach(() => {
    db = freshDb()
  })
  afterEach(() => db.close())

  it('markRunning sets status=running + bumps updated_at', () => {
    const t0 = new Date('2026-05-03T10:00:00.000Z')
    const t1 = new Date('2026-05-03T10:00:01.000Z')
    let now = t0
    const store = createJobStore(db, { now: () => now })
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    now = t1
    store.markRunning(id)
    const row = db.prepare('SELECT status, updated_at FROM jobs WHERE id=?').get(id) as {
      status: string
      updated_at: string
    }
    expect(row.status).toBe('running')
    expect(row.updated_at).toBe('2026-05-03T10:00:01.000Z')
  })

  it('markDone sets status=done', () => {
    const store = createJobStore(db)
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    store.markDone(id)
    const row = db.prepare('SELECT status FROM jobs WHERE id=?').get(id) as { status: string }
    expect(row.status).toBe('done')
  })

  it('markRetry increments attempts, sets next_run_at, updates last_error, status=pending', () => {
    const t0 = new Date('2026-05-03T10:00:00.000Z')
    const t1 = new Date('2026-05-03T10:00:30.000Z')
    let now = t0
    const store = createJobStore(db, { now: () => now })
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    store.markRunning(id)
    now = t1
    store.markRetry(id, 30_000, 'E_NET')
    const row = db.prepare('SELECT * FROM jobs WHERE id=?').get(id) as {
      status: string
      attempts: number
      next_run_at: string
      last_error: string
    }
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(1)
    expect(row.next_run_at).toBe('2026-05-03T10:01:00.000Z') // t1 + 30s
    expect(row.last_error).toBe('E_NET')
  })

  it('markFailed sets status=failed + last_error', () => {
    const store = createJobStore(db)
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    store.markFailed(id, 'gave up')
    const row = db.prepare('SELECT status, last_error FROM jobs WHERE id=?').get(id) as {
      status: string
      last_error: string
    }
    expect(row.status).toBe('failed')
    expect(row.last_error).toBe('gave up')
  })

  it('markCanceled sets status=canceled', () => {
    const store = createJobStore(db)
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    store.markCanceled(id)
    const row = db.prepare('SELECT status FROM jobs WHERE id=?').get(id) as { status: string }
    expect(row.status).toBe('canceled')
  })
})

describe('createJobStore — list & getById', () => {
  let db: Database.Database
  beforeEach(() => {
    db = freshDb()
  })
  afterEach(() => db.close())

  it('list filters by kind and status, returns items + total', () => {
    const store = createJobStore(db)
    const a = store.enqueue('index-retry', { path: 'a.md' })
    const b = store.enqueue('index-retry', { path: 'b.md' })
    const c = store.enqueue('ai-review-clip', { clipId: 1 })
    store.markFailed(a.id, 'oops')

    const failed = store.list({ status: 'failed', limit: 50, offset: 0 })
    expect(failed.total).toBe(1)
    expect(failed.items.map((j) => j.id)).toEqual([a.id])

    const aiOnly = store.list({ kind: 'ai-review-clip', limit: 50, offset: 0 })
    expect(aiOnly.total).toBe(1)
    expect(aiOnly.items[0].id).toBe(c.id)

    const all = store.list({ limit: 50, offset: 0 })
    expect(all.total).toBe(3)
    // pending rows ordered ascending by next_run_at — both pending share the same now-stamp,
    // so just assert b is in the result set (no ordering crash)
    expect(all.items.map((j) => j.id)).toContain(b.id)
  })

  it('list strips the synthetic __dedupe field from payload', () => {
    const store = createJobStore(db)
    const { id } = store.enqueue('index-retry', { path: 'a.md' }, { dedupeKey: 'idx:a.md' })
    const out = store.list({ limit: 50, offset: 0 })
    const row = out.items.find((j) => j.id === id)!
    expect('__dedupe' in row.payload).toBe(false)
    expect(row.payload).toEqual({ path: 'a.md' })
  })

  it('getById returns the parsed Job or null', () => {
    const store = createJobStore(db)
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    const job = store.getById(id)
    expect(job?.id).toBe(id)
    expect(job?.payload).toEqual({ path: 'a.md' })
    expect(store.getById('does-not-exist')).toBe(null)
  })

  it('list orders by next_run_at ASC by default', () => {
    const t0 = new Date('2026-05-03T10:00:00.000Z')
    let now = t0
    const store = createJobStore(db, { now: () => now })
    const { id: first } = store.enqueue('index-retry', { path: 'a.md' })
    now = new Date('2026-05-03T10:00:05.000Z')
    const { id: second } = store.enqueue('index-retry', { path: 'b.md' })
    const out = store.list({ limit: 50, offset: 0 })
    expect(out.items.map((j) => j.id)).toEqual([first, second])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- electron/queue/store.test.ts`
Expected: FAIL — `Cannot find module './store'`.

- [ ] **Step 3: Implement the store (no dedupe yet)**

Create `electron/queue/store.ts`:

```ts
import type Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import {
  isJobStatus,
  type EnqueueOpts,
  type Job,
  type JobListFilter,
  type JobStatus
} from '@shared/job-types'

interface JobsRow {
  id: string
  kind: string
  payload_json: string
  status: string
  attempts: number
  next_run_at: string
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface JobStoreDeps {
  /** Inject `now()` for tests; defaults to `() => new Date()`. */
  now?: () => Date
  /** Inject id generator for tests; defaults to uuid v4. */
  uuid?: () => string
}

export interface JobStore {
  enqueue(kind: string, payload: Record<string, unknown>, opts?: EnqueueOpts): { id: string }
  markRunning(id: string): void
  markDone(id: string): void
  markRetry(id: string, delayMs: number, reason: string): void
  markFailed(id: string, reason: string): void
  markCanceled(id: string): void
  /** Special path for IPC `jobs.retry`: reset attempts to 0 and re-pending now. */
  resetForManualRetry(id: string): void
  list(filter: JobListFilter): { items: Job[]; total: number }
  getById(id: string): Job | null
  /** Delete all rows with status='done'; returns delete count. */
  clearDone(): { removed: number }
  /** Crash-recovery sweep — see Task 2.3. */
  recoverRunning(): { restored: number }
}

export function createJobStore(db: Database.Database, deps: JobStoreDeps = {}): JobStore {
  const now = deps.now ?? (() => new Date())
  const uuid = deps.uuid ?? uuidv4

  function rowToJob(row: JobsRow): Job {
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>
    if ('__dedupe' in payload) delete (payload as { __dedupe?: unknown }).__dedupe
    if (!isJobStatus(row.status)) {
      throw new Error(`unexpected job status from db: ${row.status}`)
    }
    return {
      id: row.id,
      kind: row.kind,
      payload,
      status: row.status as JobStatus,
      attempts: row.attempts,
      nextRunAt: row.next_run_at,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  function enqueue(
    kind: string,
    payload: Record<string, unknown>,
    opts: EnqueueOpts = {}
  ): { id: string } {
    const id = uuid()
    const ts = now().toISOString()
    const nextRunAt = new Date(now().getTime() + (opts.delayMs ?? 0)).toISOString()
    const stored: Record<string, unknown> = { ...payload }
    if (opts.dedupeKey) stored.__dedupe = opts.dedupeKey
    db.prepare(
      `INSERT INTO jobs (id, kind, payload_json, status, attempts, next_run_at, last_error, created_at, updated_at)
       VALUES (?,?,?,?,?,?,NULL,?,?)`
    ).run(id, kind, JSON.stringify(stored), 'pending', 0, nextRunAt, ts, ts)
    return { id }
  }

  function markRunning(id: string): void {
    const ts = now().toISOString()
    db.prepare('UPDATE jobs SET status=?, updated_at=? WHERE id=?').run('running', ts, id)
  }

  function markDone(id: string): void {
    const ts = now().toISOString()
    db.prepare('UPDATE jobs SET status=?, updated_at=? WHERE id=?').run('done', ts, id)
  }

  function markRetry(id: string, delayMs: number, reason: string): void {
    const ts = now().toISOString()
    const nextRunAt = new Date(now().getTime() + delayMs).toISOString()
    db.prepare(
      `UPDATE jobs
       SET status='pending', attempts = attempts + 1, next_run_at = ?, last_error = ?, updated_at = ?
       WHERE id = ?`
    ).run(nextRunAt, reason, ts, id)
  }

  function markFailed(id: string, reason: string): void {
    const ts = now().toISOString()
    db.prepare('UPDATE jobs SET status=?, last_error=?, updated_at=? WHERE id=?').run(
      'failed',
      reason,
      ts,
      id
    )
  }

  function markCanceled(id: string): void {
    const ts = now().toISOString()
    db.prepare('UPDATE jobs SET status=?, updated_at=? WHERE id=?').run('canceled', ts, id)
  }

  function resetForManualRetry(id: string): void {
    const ts = now().toISOString()
    db.prepare(
      `UPDATE jobs
       SET status='pending', attempts = 0, next_run_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(ts, ts, id)
  }

  function list(filter: JobListFilter): { items: Job[]; total: number } {
    const where: string[] = []
    const params: unknown[] = []
    if (filter.kind) {
      where.push('kind = ?')
      params.push(filter.kind)
    }
    if (filter.status) {
      where.push('status = ?')
      params.push(filter.status)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const orderCol = filter.orderBy ?? 'next_run_at'
    const total = (
      db.prepare(`SELECT COUNT(*) AS n FROM jobs ${whereSql}`).get(...params) as { n: number }
    ).n
    const rows = db
      .prepare(`SELECT * FROM jobs ${whereSql} ORDER BY ${orderCol} ASC LIMIT ? OFFSET ?`)
      .all(...params, filter.limit, filter.offset) as JobsRow[]
    return { items: rows.map(rowToJob), total }
  }

  function getById(id: string): Job | null {
    const row = db.prepare('SELECT * FROM jobs WHERE id=?').get(id) as JobsRow | undefined
    return row ? rowToJob(row) : null
  }

  function clearDone(): { removed: number } {
    const info = db.prepare("DELETE FROM jobs WHERE status='done'").run()
    return { removed: info.changes }
  }

  function recoverRunning(): { restored: number } {
    const ts = now().toISOString()
    const info = db
      .prepare("UPDATE jobs SET status='pending', updated_at=? WHERE status='running'")
      .run(ts)
    return { restored: info.changes }
  }

  return {
    enqueue,
    markRunning,
    markDone,
    markRetry,
    markFailed,
    markCanceled,
    resetForManualRetry,
    list,
    getById,
    clearDone,
    recoverRunning
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- electron/queue/store.test.ts`
Expected: PASS — 11 tests covering enqueue + status mutations + list + getById.

- [ ] **Step 5: Commit**

```bash
git add electron/queue/store.ts electron/queue/store.test.ts
git commit -m "feat(queue): JobStore CRUD + status mutations + list (phase-14 2.1)"
```

---

<!-- openspec-task: 2.2 -->

### Task 5: Enqueue dedupe (`__dedupe` injection + `json_extract` query)

**Files:**

- Modify: `electron/queue/store.ts`
- Modify: `electron/queue/store.test.ts`

The `enqueue` from Task 2.1 already injects `__dedupe` into the stored payload. This task adds the **dedupe lookup** so a second enqueue with the same `(kind, dedupeKey)` while a pending/running row exists returns the existing id instead of inserting.

- [ ] **Step 1: Append failing test cases**

Append to `electron/queue/store.test.ts`:

```ts
describe('createJobStore — enqueue dedupe', () => {
  let db: Database.Database
  beforeEach(() => {
    db = freshDb()
  })
  afterEach(() => db.close())

  it('returns the existing id when a pending row matches kind + dedupeKey', () => {
    const store = createJobStore(db)
    const a = store.enqueue('ai-review-clip', { clipId: 1 }, { dedupeKey: 'clip:1' })
    const b = store.enqueue('ai-review-clip', { clipId: 1 }, { dedupeKey: 'clip:1' })
    expect(b.id).toBe(a.id)
    const total = (db.prepare('SELECT COUNT(*) AS n FROM jobs').get() as { n: number }).n
    expect(total).toBe(1)
  })

  it('also dedupes when the existing row is running', () => {
    const store = createJobStore(db)
    const a = store.enqueue('ai-review-clip', { clipId: 1 }, { dedupeKey: 'clip:1' })
    store.markRunning(a.id)
    const b = store.enqueue('ai-review-clip', { clipId: 1 }, { dedupeKey: 'clip:1' })
    expect(b.id).toBe(a.id)
    const total = (db.prepare('SELECT COUNT(*) AS n FROM jobs').get() as { n: number }).n
    expect(total).toBe(1)
  })

  it('does NOT dedupe when the existing row is done/failed/canceled', () => {
    const store = createJobStore(db)
    const a = store.enqueue('ai-review-clip', { clipId: 1 }, { dedupeKey: 'clip:1' })
    store.markDone(a.id)
    const b = store.enqueue('ai-review-clip', { clipId: 1 }, { dedupeKey: 'clip:1' })
    expect(b.id).not.toBe(a.id)
    const total = (db.prepare('SELECT COUNT(*) AS n FROM jobs').get() as { n: number }).n
    expect(total).toBe(2)
  })

  it('does NOT dedupe across different kinds', () => {
    const store = createJobStore(db)
    const a = store.enqueue('ai-review-clip', { clipId: 1 }, { dedupeKey: 'shared' })
    const b = store.enqueue('index-retry', { path: 'a.md' }, { dedupeKey: 'shared' })
    expect(b.id).not.toBe(a.id)
  })

  it('does NOT dedupe when no dedupeKey is supplied', () => {
    const store = createJobStore(db)
    const a = store.enqueue('index-retry', { path: 'a.md' })
    const b = store.enqueue('index-retry', { path: 'a.md' })
    expect(b.id).not.toBe(a.id)
    const total = (db.prepare('SELECT COUNT(*) AS n FROM jobs').get() as { n: number }).n
    expect(total).toBe(2)
  })
})
```

- [ ] **Step 2: Run to verify the failing tests**

Run: `npm test -- electron/queue/store.test.ts`
Expected: FAIL — the second enqueue inserts a new row instead of returning the existing id (5 new tests; some pass, the dedupe-positive ones fail).

- [ ] **Step 3: Add the dedupe lookup to `enqueue`**

In `electron/queue/store.ts`, modify the `enqueue` function:

```ts
function enqueue(
  kind: string,
  payload: Record<string, unknown>,
  opts: EnqueueOpts = {}
): { id: string } {
  if (opts.dedupeKey) {
    const existing = db
      .prepare(
        `SELECT id FROM jobs
           WHERE kind = ?
             AND status IN ('pending','running')
             AND json_extract(payload_json, '$.__dedupe') = ?
           LIMIT 1`
      )
      .get(kind, opts.dedupeKey) as { id: string } | undefined
    if (existing) return { id: existing.id }
  }
  const id = uuid()
  const ts = now().toISOString()
  const nextRunAt = new Date(now().getTime() + (opts.delayMs ?? 0)).toISOString()
  const stored: Record<string, unknown> = { ...payload }
  if (opts.dedupeKey) stored.__dedupe = opts.dedupeKey
  db.prepare(
    `INSERT INTO jobs (id, kind, payload_json, status, attempts, next_run_at, last_error, created_at, updated_at)
       VALUES (?,?,?,?,?,?,NULL,?,?)`
  ).run(id, kind, JSON.stringify(stored), 'pending', 0, nextRunAt, ts, ts)
  return { id }
}
```

- [ ] **Step 4: Run the test suite to verify all dedupe cases pass**

Run: `npm test -- electron/queue/store.test.ts`
Expected: PASS — all dedupe tests now green; existing tests still green.

- [ ] **Step 5: Commit**

```bash
git add electron/queue/store.ts electron/queue/store.test.ts
git commit -m "feat(queue): enqueue dedupe via __dedupe + json_extract (phase-14 2.2)"
```

---

<!-- openspec-task: 2.3 -->

### Task 6: Crash recovery sweep — `recoverRunning()` reset on grove open

**Files:**

- Modify: `electron/queue/store.test.ts`
- Modify: `electron/services/db.ts` (call `createJobStore(db).recoverRunning()` after migrations land)

The store already exposes `recoverRunning()` (Task 2.1). This task wires it into grove-open so any job stuck in `running` from a crash is reset to `pending`, and verifies the behavior via tests + grove-open integration.

- [ ] **Step 1: Append the recovery test**

Append to `electron/queue/store.test.ts`:

```ts
describe('createJobStore — recoverRunning', () => {
  let db: Database.Database
  beforeEach(() => {
    db = freshDb()
  })
  afterEach(() => db.close())

  it('resets stuck running jobs to pending without changing attempts', () => {
    const store = createJobStore(db, { now: () => new Date('2026-05-03T10:00:00.000Z') })
    const a = store.enqueue('index-retry', { path: 'a.md' })
    const b = store.enqueue('index-retry', { path: 'b.md' })
    store.markRunning(a.id)
    store.markRunning(b.id)
    store.markRetry(a.id, 0, 'transient') // a now pending, attempts=1
    store.markRunning(a.id) // back to running
    // Simulate crash: just call recoverRunning
    const result = store.recoverRunning()
    expect(result.restored).toBe(2) // a and b
    const after = db.prepare('SELECT id, status, attempts FROM jobs ORDER BY id').all() as {
      id: string
      status: string
      attempts: number
    }[]
    for (const r of after) expect(r.status).toBe('pending')
    const aRow = after.find((r) => r.id === a.id)!
    expect(aRow.attempts).toBe(1) // attempts preserved
  })

  it('does not touch pending/done/failed/canceled rows', () => {
    const store = createJobStore(db)
    const p = store.enqueue('index-retry', { path: 'p.md' })
    const d = store.enqueue('index-retry', { path: 'd.md' })
    const f = store.enqueue('index-retry', { path: 'f.md' })
    const c = store.enqueue('index-retry', { path: 'c.md' })
    store.markDone(d.id)
    store.markFailed(f.id, 'oops')
    store.markCanceled(c.id)
    const before = db.prepare('SELECT id, status FROM jobs ORDER BY id').all() as {
      id: string
      status: string
    }[]
    store.recoverRunning()
    const after = db.prepare('SELECT id, status FROM jobs ORDER BY id').all() as {
      id: string
      status: string
    }[]
    expect(after).toEqual(before)
    expect(p.id && d.id && f.id && c.id).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to confirm it passes** (`recoverRunning` already implemented in Task 2.1)

Run: `npm test -- electron/queue/store.test.ts`
Expected: PASS — recovery tests green; nothing else breaks.

- [ ] **Step 3: Wire `recoverRunning` into grove open**

The grove-open path in `electron/services/db.ts:openForGrove` runs migrations, so it's the natural insertion point. Modify `electron/services/db.ts`:

Find the two places where `runMigrations(db, migrationsDir())` is called (corrupt-rebuild branch + normal branch). After **each** of them, add:

```ts
// phase-14: reset jobs left in 'running' status from a previous crash
try {
  const { createJobStore } = require('../queue/store') as typeof import('../queue/store')
  createJobStore(db).recoverRunning()
} catch {
  /* table may not exist on a fresh corrupt rebuild before its migration runs;
       the runMigrations call above guarantees it does, so this catch is purely
       defensive against future ordering changes. */
}
```

(`require` is intentional — `electron/services/db.ts` already uses `require` for cyclic-dep avoidance with `main.ts`. Stay consistent with the file's idiom.)

- [ ] **Step 4: Add an integration assertion in `electron/services/db.test.ts`**

Append to `electron/services/db.test.ts`:

```ts
describe('openForGrove — phase-14 crash recovery', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'db-recover-'))
    __resetForTest()
  })
  afterEach(() => {
    closeCurrent()
    rmSync(dir, { recursive: true, force: true })
    __resetForTest()
  })

  it('resets stuck running jobs on grove open', () => {
    // First open: insert a running job
    openForGrove(dir)
    const db1 = requireCurrent()
    db1
      .prepare(
        `INSERT INTO jobs (id, kind, payload_json, status, attempts, next_run_at, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?)`
      )
      .run(
        'crashed',
        'index-retry',
        JSON.stringify({ path: 'a.md' }),
        'running',
        2,
        '2026-05-03T00:00:00.000Z',
        '2026-05-03T00:00:00.000Z',
        '2026-05-03T00:00:00.000Z'
      )
    closeCurrent()

    // Second open: recoverRunning should fire
    openForGrove(dir)
    const db2 = requireCurrent()
    const row = db2.prepare('SELECT status, attempts FROM jobs WHERE id=?').get('crashed') as {
      status: string
      attempts: number
    }
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(2) // preserved
  })
})
```

- [ ] **Step 5: Run both test suites to verify**

Run: `npm test -- electron/queue/store.test.ts electron/services/db.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/queue/store.ts electron/queue/store.test.ts electron/services/db.ts electron/services/db.test.ts
git commit -m "feat(queue): crash recovery — reset running→pending on grove open (phase-14 2.3)"
```

---

<!-- openspec-task: 2.4 -->

### Task 7: `stateChanged` EventEmitter

**Files:**

- Modify: `electron/queue/store.ts`
- Modify: `electron/queue/store.test.ts`

Every status-mutating method (`enqueue`, `markRunning`, `markDone`, `markRetry`, `markFailed`, `markCanceled`, `resetForManualRetry`, `clearDone`) MUST emit `stateChanged` with the **fresh** row read back after the write. Plan 2 wires this emitter to the IPC `jobs:changed` broadcast.

For `clearDone`, emit a single `cleared` summary event (different shape) — see implementation below.

- [ ] **Step 1: Append failing tests**

Append to `electron/queue/store.test.ts`:

```ts
describe('createJobStore — stateChanged emitter', () => {
  let db: Database.Database
  beforeEach(() => {
    db = freshDb()
  })
  afterEach(() => db.close())

  it('emits stateChanged on enqueue with the inserted Job', () => {
    const store = createJobStore(db)
    const events: { reason: string; jobId: string }[] = []
    store.events.on('stateChanged', (e) => events.push({ reason: e.reason, jobId: e.job.id }))
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ reason: 'enqueued', jobId: id })
  })

  it('emits stateChanged on each status mutation', () => {
    const store = createJobStore(db)
    const events: string[] = []
    store.events.on('stateChanged', (e) => events.push(e.reason))
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    store.markRunning(id)
    store.markDone(id)
    expect(events).toEqual(['enqueued', 'running', 'done'])
  })

  it('payload contains the up-to-date Job (status reflects the just-applied write)', () => {
    const store = createJobStore(db)
    const seen: string[] = []
    store.events.on('stateChanged', (e) => seen.push(`${e.reason}:${e.job.status}`))
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    store.markRunning(id)
    store.markRetry(id, 1000, 'EIO')
    expect(seen).toEqual(['enqueued:pending', 'running:running', 'retry:pending'])
  })

  it('does NOT emit stateChanged when enqueue dedupe hits the existing row', () => {
    const store = createJobStore(db)
    store.enqueue('ai-review-clip', { clipId: 1 }, { dedupeKey: 'clip:1' })
    const events: string[] = []
    store.events.on('stateChanged', (e) => events.push(e.reason))
    store.enqueue('ai-review-clip', { clipId: 1 }, { dedupeKey: 'clip:1' })
    expect(events).toEqual([]) // dedupe path returns silently
  })

  it('clearDone emits a `cleared` event with the count', () => {
    const store = createJobStore(db)
    const a = store.enqueue('index-retry', { path: 'a.md' })
    const b = store.enqueue('index-retry', { path: 'b.md' })
    store.markDone(a.id)
    store.markDone(b.id)
    const events: { reason: string; removed?: number }[] = []
    store.events.on('cleared', (e) => events.push(e))
    const result = store.clearDone()
    expect(result.removed).toBe(2)
    expect(events).toEqual([{ reason: 'clearedDone', removed: 2 }])
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- electron/queue/store.test.ts`
Expected: FAIL — `store.events` is undefined.

- [ ] **Step 3: Add the EventEmitter to `electron/queue/store.ts`**

At the top of the file, add an import:

```ts
import { EventEmitter } from 'node:events'
```

Define the event payload types (export them so Plan 2 can consume them):

```ts
export type StateChangedReason =
  | 'enqueued'
  | 'running'
  | 'done'
  | 'retry'
  | 'failed'
  | 'canceled'
  | 'manualRetry'

export interface StateChangedEvent {
  reason: StateChangedReason
  job: Job
}

export interface ClearedEvent {
  reason: 'clearedDone'
  removed: number
}

export interface JobStoreEvents {
  on(event: 'stateChanged', listener: (e: StateChangedEvent) => void): this
  on(event: 'cleared', listener: (e: ClearedEvent) => void): this
  off(event: 'stateChanged', listener: (e: StateChangedEvent) => void): this
  off(event: 'cleared', listener: (e: ClearedEvent) => void): this
}
```

Extend the `JobStore` interface to expose `events: JobStoreEvents`. Inside `createJobStore`, instantiate an emitter and emit on every write:

```ts
const emitter = new EventEmitter() as EventEmitter & JobStoreEvents

function emitState(reason: StateChangedReason, id: string): void {
  const job = getById(id)
  if (job) emitter.emit('stateChanged', { reason, job })
}
```

Then update each mutator to call `emitState` after the write:

```ts
  function enqueue(...): { id: string } {
    if (opts.dedupeKey) {
      const existing = ... as { id: string } | undefined
      if (existing) return { id: existing.id }   // dedupe path: NO emit
    }
    // ... insert ...
    emitState('enqueued', id)
    return { id }
  }

  function markRunning(id: string) {
    db.prepare(...).run('running', ts, id)
    emitState('running', id)
  }
  function markDone(id: string) {
    db.prepare(...).run('done', ts, id)
    emitState('done', id)
  }
  function markRetry(id: string, delayMs: number, reason: string) {
    db.prepare(...).run(nextRunAt, reason, ts, id)
    emitState('retry', id)
  }
  function markFailed(id: string, reason: string) {
    db.prepare(...).run('failed', reason, ts, id)
    emitState('failed', id)
  }
  function markCanceled(id: string) {
    db.prepare(...).run('canceled', ts, id)
    emitState('canceled', id)
  }
  function resetForManualRetry(id: string) {
    db.prepare(...).run(ts, ts, id)
    emitState('manualRetry', id)
  }
  function clearDone(): { removed: number } {
    const info = db.prepare("DELETE FROM jobs WHERE status='done'").run()
    emitter.emit('cleared', { reason: 'clearedDone', removed: info.changes })
    return { removed: info.changes }
  }
```

Expose the emitter:

```ts
return {
  enqueue,
  markRunning,
  markDone,
  markRetry,
  markFailed,
  markCanceled,
  resetForManualRetry,
  list,
  getById,
  clearDone,
  recoverRunning,
  events: emitter as unknown as JobStoreEvents
}
```

`recoverRunning` is intentionally **silent** — it runs once at boot, before any subscriber exists, and the resulting pending rows will be naturally re-emitted when the runner picks them up.

- [ ] **Step 4: Run the test suite**

Run: `npm test -- electron/queue/store.test.ts`
Expected: PASS — all events fire as expected; dedupe path stays silent; `recoverRunning` does not emit.

- [ ] **Step 5: Re-run the typecheck (the JobStore interface grew)**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/queue/store.ts electron/queue/store.test.ts
git commit -m "feat(queue): JobStore stateChanged + cleared events (phase-14 2.4)"
```

---

## Self-Review Checklist (before handing off to Plan 2)

- [ ] `npm test -- electron/queue/ shared/job-types.test.ts electron/services/db/migrations/007_jobs.test.ts` is green.
- [ ] `npm run typecheck` is green.
- [ ] `electron/queue/store.ts` does not directly call `electron/services/db.ts:requireCurrent()` — it takes `db` as a parameter, matching `index-queries.ts`.
- [ ] `__dedupe` is stripped from the `payload` field of every `Job` returned by `list` / `getById` — verified by an explicit test.
- [ ] `recoverRunning` does not emit `stateChanged` — verified by the recovery test running with no subscribers.
- [ ] Migration `007_jobs.sql` walks cleanly from `user_version=0` (test creates a fresh in-memory DB and runs all migrations 001 → 007).
- [ ] `JobStatus` is the only place the literal status strings appear in code — `markRunning` etc. write the literal but the **type** is sourced from `JobStatus`.
- [ ] Every Task heading is preceded by `<!-- openspec-task: LABEL -->` with no blank line between, matching tasks.md labels `1.1`, `1.2`, `1.3`, `2.1`, `2.2`, `2.3`, `2.4`.

Plan 2 (`tasks-3.1-5.3`) builds the runner, retry policy, ops_log integration, and IPC bridge on top of this store.
