# Phase-14 Queue Persistence — Plan 4: Acceptance

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-14-queue-persistence`
> **Task range:** OpenSpec tasks `10.1`–`10.14` (14 tasks)
> **Plan order:** 4 of 4. Depends on Plans 1–3. Final plan in this change.
> **Status:** Not started
> **Created:** 2026-05-03
> **Branch suggestion:** continue on `feat/phase-14-queue-persistence`

---

## Goal

Run the end-to-end acceptance suite that proves every behavior listed in `tasks.md §10` and the spec scenarios from `design.md` and the per-capability spec deltas. Most tasks are automated integration tests under `electron/queue/integration.*.test.ts` or `src/integration/phase-14-*.test.tsx`; a few require a manual smoke-test step (kill-the-app crash recovery, devtools verification).

## Architecture

This plan adds **no production code**; every task is either:
1. A new `*.test.ts` (or modification of an existing one) that exercises a real DB + real runner + real handlers (no mocks of `electron/queue/`),
2. A short manual smoke that the implementer runs and pastes output into the commit message,
3. The final `openspec validate --strict` gate (Task 10.14).

When a test in this plan is hard to automate (e.g. true crash recovery), prefer a fake-crash simulation (close the DB without `recoverRunning`, reopen, assert) over flaky real-process kills.

## Tech Stack

- Vitest with real `better-sqlite3` (in-memory or temp-file DB)
- React Testing Library for UI integration cases
- `npm run dev` for manual smokes

## Cross-Plan Decisions

1. **One integration file per category** to avoid `*.test.ts` sprawl:
   - `electron/queue/integration.queue.test.ts` for runner/store/lifecycle tasks (10.2 – 10.5, 10.7, 10.8, 10.9, 10.10, 10.12)
   - `electron/queue/integration.opslog.test.ts` for ops_log assertions (10.11)
   - `src/integration/phase-14-jobs-tab.test.tsx` for UI tasks (10.1, 10.6, 10.13)
   - `openspec validate` is a CLI invocation, not a test file (10.14)
2. **Test isolation**: each test creates a fresh `Database(':memory:')` and bootstraps a runner with `tickMs: 50` and explicit `now()`. Tests **must** call `runner.stop()` in `afterEach` to avoid leaking timers between tests.
3. **Manual smokes** (10.9 kill-the-app, 10.10 graceful quit) ship a checklist; the agent records the human-verified output in the commit message body.

---

## Pre-flight

Plans 1, 2, 3 are merged. `npm test` is green at HEAD. `npm run typecheck` is green.

If running on macOS with the watcher active, set `CHOKIDAR_USEPOLLING=1` for any `npm run dev` smoke to avoid FS-event drift causing spurious indexer activity that pollutes the test DB.

---

## File Structure

| Path | Action | Owner task |
|---|---|---|
| `electron/queue/integration.queue.test.ts` | Create | 10.2, 10.3, 10.4, 10.5, 10.7, 10.8, 10.12 |
| `electron/queue/integration.crash.test.ts` | Create | 10.9, 10.10 |
| `electron/queue/integration.opslog.test.ts` | Create | 10.11 |
| `src/integration/phase-14-jobs-tab.test.tsx` | Create | 10.1, 10.6, 10.13 |
| (no production code touched) | — | — |

---

## Tasks

<!-- openspec-task: 10.1 -->
### Task 1: `/history/jobs` route exists + default filter is running+pending+failed

**Files:**
- Create: `src/integration/phase-14-jobs-tab.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
// src/integration/phase-14-jobs-tab.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { i18n } from '@/i18n'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { History } from '@/pages/History'

const mockApi = {
  jobs: {
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    retry: vi.fn(),
    cancel: vi.fn(),
    clearDone: vi.fn()
  },
  on: vi.fn().mockReturnValue(() => {})
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as { api: typeof mockApi }).api = mockApi
})

describe('Acceptance 10.1 — /history/jobs route + default filter', () => {
  it('navigating to /history/jobs renders the JobsTab', async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/history/jobs']}>
          <Routes>
            <Route path="/history/*" element={<History />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    )
    await waitFor(() => {
      expect(screen.getByTestId('jobs-tab')).toBeInTheDocument()
    })
  })

  it('default filter loads jobs.list 3× with pending / running / failed', async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/history/jobs']}>
          <Routes>
            <Route path="/history/*" element={<History />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    )
    await waitFor(() => expect(mockApi.jobs.list).toHaveBeenCalledTimes(3))
    const statuses = mockApi.jobs.list.mock.calls.map(([f]) => (f as { status?: string }).status)
    expect(new Set(statuses)).toEqual(new Set(['pending', 'running', 'failed']))
  })
})
```

- [ ] **Step 2: Run**

Run: `npm test -- src/integration/phase-14-jobs-tab.test.tsx`
Expected: PASS — both cases.

- [ ] **Step 3: Commit**

```bash
git add src/integration/phase-14-jobs-tab.test.tsx
git commit -m "test(phase-14): 10.1 /history/jobs default filter (phase-14 10.1)"
```

---

<!-- openspec-task: 10.2 -->
### Task 2: Pipeline → jobs row appears `kind='ai-review-clip'`, `status='pending'`

**Files:**
- Create: `electron/queue/integration.queue.test.ts`

- [ ] **Step 1: Write the test (set up shared helper)**

```ts
// electron/queue/integration.queue.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../services/db/migrations'
import { createJobStore } from './store'
import { createQueueRunner, type QueueRunner } from './runner'
import { createIndexRetryHandler } from './handlers/index-retry'
import { createAiReviewClipHandler } from './handlers/ai-review-clip'

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'services',
  'db',
  'migrations'
)

function freshFixture() {
  const db = new Database(':memory:')
  runMigrations(db, MIGRATIONS_DIR)
  // Phase-12 clips schema must exist if we want to look up clip rows;
  // for these tests we keep clips empty and fail fast on lookup.
  const store = createJobStore(db)
  return { db, store }
}

describe('Acceptance 10.2 — clip → ai-review-clip enqueued', () => {
  it('enqueueing ai-review-clip via the store reflects in the jobs table', () => {
    const { db, store } = freshFixture()
    store.enqueue(
      'ai-review-clip',
      { clipId: 1, path: 'inbox/202604/a.md' },
      { dedupeKey: 'clip:1' }
    )
    const row = db.prepare("SELECT kind, status FROM jobs LIMIT 1").get() as {
      kind: string
      status: string
    }
    expect(row).toEqual({ kind: 'ai-review-clip', status: 'pending' })
    db.close()
  })
})
```

- [ ] **Step 2: Run**

Run: `npm test -- electron/queue/integration.queue.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add electron/queue/integration.queue.test.ts
git commit -m "test(phase-14): 10.2 ai-review-clip enqueue lands in jobs table (phase-14 10.2)"
```

---

<!-- openspec-task: 10.3 -->
### Task 3: Runner → `E_NOT_IMPLEMENTED` → 1h retry, attempts=1

**Files:**
- Modify: `electron/queue/integration.queue.test.ts`

- [ ] **Step 1: Append the test**

```ts
describe('Acceptance 10.3 — ai-review-clip placeholder handler retries 1h', () => {
  let runner: QueueRunner
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => {
    runner?.stop()
    vi.useRealTimers()
  })

  it('handler catches E_NOT_IMPLEMENTED → retry 1h, attempts=1, status=pending', async () => {
    vi.setSystemTime(new Date('2026-05-03T10:00:00.000Z'))
    const { db, store } = freshFixture()
    runner = createQueueRunner({ store, tickMs: 50 })
    runner.register({
      kind: 'ai-review-clip',
      concurrency: 2,
      minGapMs: 0,
      handler: createAiReviewClipHandler({
        readClipRow: () => ({ id: 1, title: 't', path: 'inbox/a.md' }),
        readMdFile: async () => ({ frontmatter: {}, body: 'hello' }),
        reviewClip: async () => {
          const e = Object.assign(new Error('not yet'), { code: 'E_NOT_IMPLEMENTED' })
          throw e
        }
      })
    })
    const { id } = store.enqueue(
      'ai-review-clip',
      { clipId: 1, path: 'inbox/a.md' },
      { dedupeKey: 'clip:1' }
    )
    runner.start()
    await vi.advanceTimersByTimeAsync(300)
    const row = db.prepare('SELECT status, attempts, next_run_at FROM jobs WHERE id=?').get(id) as {
      status: string
      attempts: number
      next_run_at: string
    }
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(1)
    const delta = Date.parse(row.next_run_at) - Date.parse('2026-05-03T10:00:00.000Z')
    expect(delta).toBeGreaterThanOrEqual(60 * 60 * 1000 - 1_000)
    expect(delta).toBeLessThanOrEqual(60 * 60 * 1000 + 1_000)
    db.close()
  })
})
```

- [ ] **Step 2: Run**

Run: `npm test -- electron/queue/integration.queue.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add electron/queue/integration.queue.test.ts
git commit -m "test(phase-14): 10.3 ai-review-clip retries 1h on E_NOT_IMPLEMENTED (phase-14 10.3)"
```

---

<!-- openspec-task: 10.4 -->
### Task 4: Re-clip same id → dedupeKey hits, row count unchanged

**Files:**
- Modify: `electron/queue/integration.queue.test.ts`

- [ ] **Step 1: Append the test**

```ts
describe('Acceptance 10.4 — dedupeKey idempotency', () => {
  it('second enqueue with same kind + dedupeKey returns existing id and does not insert', () => {
    const { db, store } = freshFixture()
    const a = store.enqueue(
      'ai-review-clip',
      { clipId: 7, path: 'inbox/a.md' },
      { dedupeKey: 'clip:7' }
    )
    const b = store.enqueue(
      'ai-review-clip',
      { clipId: 7, path: 'inbox/a.md' },
      { dedupeKey: 'clip:7' }
    )
    expect(b.id).toBe(a.id)
    const total = (db.prepare('SELECT COUNT(*) AS n FROM jobs').get() as { n: number }).n
    expect(total).toBe(1)
    db.close()
  })
})
```

- [ ] **Step 2: Run**

Run: `npm test -- electron/queue/integration.queue.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add electron/queue/integration.queue.test.ts
git commit -m "test(phase-14): 10.4 ai-review-clip dedupe idempotency (phase-14 10.4)"
```

---

<!-- openspec-task: 10.5 -->
### Task 5: Index-retry transient failure → backoff retry → succeeds within 3 attempts

**Files:**
- Modify: `electron/queue/integration.queue.test.ts`

- [ ] **Step 1: Append the test**

```ts
describe('Acceptance 10.5 — index-retry backoff to success', () => {
  let runner: QueueRunner
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => {
    runner?.stop()
    vi.useRealTimers()
  })

  it('two transient EIOs then success → status=done, attempts=2', async () => {
    vi.setSystemTime(new Date('2026-05-03T10:00:00.000Z'))
    const { db, store } = freshFixture()
    let calls = 0
    runner = createQueueRunner({ store, tickMs: 50 })
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: createIndexRetryHandler({
        upsertFromFs: async () => {
          calls++
          if (calls < 3) throw new Error('EIO transient')
        }
      })
    })
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    runner.start()
    // Loop: drive past each backoff wall (1s + 5s + tick)
    await vi.advanceTimersByTimeAsync(7_000)
    const row = db.prepare('SELECT status, attempts FROM jobs WHERE id=?').get(id) as {
      status: string
      attempts: number
    }
    expect(row.status).toBe('done')
    expect(row.attempts).toBe(2) // first attempt set it to 1, second to 2, third succeeded so attempts stayed at 2
    expect(calls).toBe(3)
    db.close()
  })
})
```

- [ ] **Step 2: Run**

Run: `npm test -- electron/queue/integration.queue.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add electron/queue/integration.queue.test.ts
git commit -m "test(phase-14): 10.5 index-retry backoff to success (phase-14 10.5)"
```

---

<!-- openspec-task: 10.6 -->
### Task 6: `jobs.cancel` pending → status=canceled; UI hides by default

**Files:**
- Modify: `src/integration/phase-14-jobs-tab.test.tsx`

- [ ] **Step 1: Append the test**

```tsx
import userEvent from '@testing-library/user-event'

describe('Acceptance 10.6 — cancel pending hides from default view', () => {
  it('clicks 取消 on a pending row, list reloads without canceled rows', async () => {
    const user = userEvent.setup()
    const pendingJob = {
      id: 'p1',
      kind: 'index-retry',
      payload: { path: 'a.md' },
      status: 'pending' as const,
      attempts: 0,
      nextRunAt: '2026-05-03T10:00:00.000Z',
      lastError: null,
      createdAt: '2026-05-03T10:00:00.000Z',
      updatedAt: '2026-05-03T10:00:00.000Z'
    }
    let cancelCalled = false
    mockApi.jobs.list.mockImplementation((f: { status?: string }) => {
      if (cancelCalled) return Promise.resolve({ items: [], total: 0 })
      if (f.status === 'pending')
        return Promise.resolve({ items: [pendingJob], total: 1 })
      return Promise.resolve({ items: [], total: 0 })
    })
    mockApi.jobs.cancel.mockImplementation(async (id: string) => {
      expect(id).toBe('p1')
      cancelCalled = true
      return { ok: true }
    })
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/history/jobs']}>
          <Routes>
            <Route path="/history/*" element={<History />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    )
    await waitFor(() => screen.getByTestId('job-row-p1'))
    await user.click(screen.getByRole('button', { name: /取消|cancel/i }))
    await waitFor(() => expect(screen.queryByTestId('job-row-p1')).not.toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run**

Run: `npm test -- src/integration/phase-14-jobs-tab.test.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/integration/phase-14-jobs-tab.test.tsx
git commit -m "test(phase-14): 10.6 cancel pending hides from default view (phase-14 10.6)"
```

---

<!-- openspec-task: 10.7 -->
### Task 7: `jobs.retry` failed → status=pending, attempts reset to 0, next_run_at=now

**Files:**
- Modify: `electron/queue/integration.queue.test.ts`

- [ ] **Step 1: Append the test**

```ts
import { createJobsHandlers } from '../ipc/jobs'

describe('Acceptance 10.7 — jobs.retry resets attempts', () => {
  it('failed → retry → pending, attempts=0, next_run_at ≈ now', async () => {
    const { db, store } = freshFixture()
    const handlers = createJobsHandlers({
      getStore: () => store,
      cancelInRunner: () => ({ error: 'E_STATUS_NOT_ALLOWED' as const })
    })
    // Seed a failed job with attempts=4
    const { id } = store.enqueue('index-retry', { path: 'x.md' })
    store.markRetry(id, 0, 'a')
    store.markRetry(id, 0, 'b')
    store.markRetry(id, 0, 'c')
    store.markRetry(id, 0, 'd')
    store.markFailed(id, 'gave up')
    const before = db.prepare('SELECT attempts, status FROM jobs WHERE id=?').get(id) as {
      attempts: number
      status: string
    }
    expect(before.attempts).toBe(4)
    expect(before.status).toBe('failed')

    const r = await handlers.retry(id)
    expect(r).toEqual({ ok: true })

    const after = db
      .prepare('SELECT attempts, status, next_run_at FROM jobs WHERE id=?')
      .get(id) as { attempts: number; status: string; next_run_at: string }
    expect(after.attempts).toBe(0)
    expect(after.status).toBe('pending')
    const ageMs = Math.abs(Date.parse(after.next_run_at) - Date.now())
    expect(ageMs).toBeLessThan(2_000)
    db.close()
  })
})
```

- [ ] **Step 2: Run**

Run: `npm test -- electron/queue/integration.queue.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add electron/queue/integration.queue.test.ts
git commit -m "test(phase-14): 10.7 jobs.retry resets attempts (phase-14 10.7)"
```

---

<!-- openspec-task: 10.8 -->
### Task 8: `jobs.clearDone` → all done deleted, failed kept, returns count

**Files:**
- Modify: `electron/queue/integration.queue.test.ts`

- [ ] **Step 1: Append the test**

```ts
describe('Acceptance 10.8 — clearDone removes done, preserves failed', () => {
  it('returns { removed } and leaves failed rows alone', async () => {
    const { db, store } = freshFixture()
    const handlers = createJobsHandlers({
      getStore: () => store,
      cancelInRunner: () => ({ ok: true as const })
    })
    const a = store.enqueue('index-retry', { path: 'a.md' })
    const b = store.enqueue('index-retry', { path: 'b.md' })
    const c = store.enqueue('index-retry', { path: 'c.md' })
    const d = store.enqueue('index-retry', { path: 'd.md' })
    store.markDone(a.id)
    store.markDone(b.id)
    store.markDone(c.id)
    store.markFailed(d.id, 'oops')

    const r = await handlers.clearDone()
    expect(r).toEqual({ removed: 3 })

    const remaining = (db.prepare('SELECT id, status FROM jobs').all()) as {
      id: string
      status: string
    }[]
    expect(remaining).toEqual([{ id: d.id, status: 'failed' }])
    db.close()
  })
})
```

- [ ] **Step 2: Run**

Run: `npm test -- electron/queue/integration.queue.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add electron/queue/integration.queue.test.ts
git commit -m "test(phase-14): 10.8 clearDone removes done, preserves failed (phase-14 10.8)"
```

---

<!-- openspec-task: 10.9 -->
### Task 9: Crash recovery — `running` → `pending` on next open

**Files:**
- Create: `electron/queue/integration.crash.test.ts`

We can't kill a real Node process inside Vitest. We simulate crash by closing the DB without a clean drain, then reopening and asserting `recoverRunning` fired (the production wiring lives in `electron/services/db.ts:openForGrove`).

- [ ] **Step 1: Write the test**

```ts
// electron/queue/integration.crash.test.ts
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  __resetForTest,
  closeCurrent,
  openForGrove,
  requireCurrent
} from '../services/db'

describe('Acceptance 10.9 — crash recovery resets running → pending', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'p14-crash-'))
    __resetForTest()
  })
  afterEach(() => {
    closeCurrent()
    __resetForTest()
    rmSync(dir, { recursive: true, force: true })
  })

  it('a running job becomes pending after grove reopen', () => {
    openForGrove(dir)
    const db1 = requireCurrent()
    db1
      .prepare(
        `INSERT INTO jobs (id, kind, payload_json, status, attempts, next_run_at, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?)`
      )
      .run(
        'crashed',
        'ai-review-clip',
        JSON.stringify({ clipId: 1, path: 'inbox/a.md' }),
        'running',
        2,
        '2026-05-03T10:00:00.000Z',
        '2026-05-03T10:00:00.000Z',
        '2026-05-03T10:00:00.000Z'
      )
    closeCurrent() // simulate crash (no drain)

    openForGrove(dir) // reopen
    const db2 = requireCurrent()
    const row = db2.prepare('SELECT status, attempts FROM jobs WHERE id=?').get('crashed') as {
      status: string
      attempts: number
    }
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(2) // attempts preserved
  })
})
```

- [ ] **Step 2: Run**

Run: `npm test -- electron/queue/integration.crash.test.ts`
Expected: PASS — relies on the Plan 1 Task 2.3 wiring.

- [ ] **Step 3: Manual smoke (optional but recommended)**

1. `npm run dev`; open a grove.
2. Trigger an ai-review-clip enqueue (clip a URL). Observe the row in `/history/jobs`.
3. Force-quit the app while the runner is mid-handler (e.g. `kill -9 $(pgrep -f acornvo)` on macOS / Linux, Task Manager on Windows).
4. Restart the app. Confirm in `/history/jobs` that the job is back in `pending` (not stuck `running`).

- [ ] **Step 4: Commit**

```bash
git add electron/queue/integration.crash.test.ts
git commit -m "$(cat <<'EOF'
test(phase-14): 10.9 crash recovery resets running → pending (phase-14 10.9)

Manual smoke verified on macOS:
  1. clipped https://example.com/post → ai-review-clip row enters pending
  2. kill -9 acornvo while job in flight
  3. relaunch → row is pending, attempts preserved
EOF
)"
```

---

<!-- openspec-task: 10.10 -->
### Task 10: Graceful quit — `before-quit` drains, no data loss

**Files:**
- Modify: `electron/queue/integration.crash.test.ts`

- [ ] **Step 1: Append the test**

```ts
import { createJobStore } from './store'
import { createQueueRunner } from './runner'
import { vi } from 'vitest'

describe('Acceptance 10.10 — before-quit drains running handlers', () => {
  it('drainOnQuit waits for in-flight handler then resolves; pending rows preserved', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const dir = mkdtempSync(join(tmpdir(), 'p14-drain-'))
    __resetForTest()
    openForGrove(dir)
    const db = requireCurrent()
    const store = createJobStore(db)
    let resolveHandler!: (r: { kind: 'ok' }) => void
    const runner = createQueueRunner({ store, tickMs: 50 })
    runner.register({
      kind: 'ai-review-clip',
      concurrency: 1,
      minGapMs: 0,
      handler: () => new Promise<{ kind: 'ok' }>((r) => { resolveHandler = r })
    })
    const { id: running } = store.enqueue('ai-review-clip', { clipId: 1, path: 'a.md' })
    const { id: pending } = store.enqueue('ai-review-clip', { clipId: 2, path: 'b.md' })
    runner.start()
    await vi.advanceTimersByTimeAsync(120) // first job starts
    const drain = runner.drainOnQuit(5_000)
    // mid-drain, finish the in-flight handler
    resolveHandler({ kind: 'ok' })
    await vi.advanceTimersByTimeAsync(200)
    await drain
    // running job is now done; pending job is still pending
    const r1 = db.prepare('SELECT status FROM jobs WHERE id=?').get(running) as { status: string }
    const r2 = db.prepare('SELECT status FROM jobs WHERE id=?').get(pending) as { status: string }
    expect(r1.status).toBe('done')
    expect(r2.status).toBe('pending') // not lost, not auto-canceled
    closeCurrent()
    rmSync(dir, { recursive: true, force: true })
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run**

Run: `npm test -- electron/queue/integration.crash.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add electron/queue/integration.crash.test.ts
git commit -m "test(phase-14): 10.10 before-quit drain preserves pending (phase-14 10.10)"
```

---

<!-- openspec-task: 10.11 -->
### Task 11: `ops_log` queryable for `op='job.succeeded' / 'job.failed'` etc.

**Files:**
- Create: `electron/queue/integration.opslog.test.ts`

- [ ] **Step 1: Write the test**

```ts
// electron/queue/integration.opslog.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../services/db/migrations'
import { createJobStore } from './store'
import { createQueueRunner, type QueueRunner } from './runner'

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'services',
  'db',
  'migrations'
)

describe('Acceptance 10.11 — ops_log row per state transition', () => {
  let runner: QueueRunner
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => {
    runner?.stop()
    vi.useRealTimers()
  })

  it('records job.enqueued / job.started / job.succeeded for the happy path', async () => {
    const db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)
    const store = createJobStore(db)
    const ops: { op: string; path: string; meta?: Record<string, unknown> }[] = []
    runner = createQueueRunner({
      store,
      tickMs: 50,
      opsLog: (r) => ops.push(r)
    })
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => ({ kind: 'ok' })
    })
    store.enqueue('index-retry', { path: 'a.md' })
    runner.start()
    await vi.advanceTimersByTimeAsync(300)
    const opNames = ops.map((o) => o.op)
    expect(opNames).toEqual(['job.enqueued', 'job.started', 'job.succeeded'])
    expect(ops.every((o) => o.path === 'a.md')).toBe(true)
    expect(ops[0].meta).toMatchObject({ kind: 'index-retry' })
    db.close()
  })

  it('records job.failed when handler returns { kind: "fail" }', async () => {
    const db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)
    const store = createJobStore(db)
    const ops: string[] = []
    runner = createQueueRunner({
      store,
      tickMs: 50,
      opsLog: (r) => ops.push(r.op)
    })
    runner.register({
      kind: 'ai-review-clip',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => ({ kind: 'fail', error: 'E_MISSING_PROFILE' })
    })
    store.enqueue('ai-review-clip', { clipId: 1, path: 'a.md' })
    runner.start()
    await vi.advanceTimersByTimeAsync(300)
    expect(ops).toContain('job.failed')
    db.close()
  })

  it('records job.canceled when cancel is called', async () => {
    const db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)
    const store = createJobStore(db)
    const ops: string[] = []
    runner = createQueueRunner({
      store,
      tickMs: 50,
      opsLog: (r) => ops.push(r.op)
    })
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => ({ kind: 'ok' })
    })
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    runner.cancel(id)
    expect(ops).toContain('job.canceled')
    db.close()
  })
})
```

- [ ] **Step 2: Run**

Run: `npm test -- electron/queue/integration.opslog.test.ts`
Expected: PASS — three ops_log scenarios.

- [ ] **Step 3: Commit**

```bash
git add electron/queue/integration.opslog.test.ts
git commit -m "test(phase-14): 10.11 ops_log records every job state change (phase-14 10.11)"
```

---

<!-- openspec-task: 10.12 -->
### Task 12: Concurrency cap — 5 enqueued ai-review-clip → max 2 running

**Files:**
- Modify: `electron/queue/integration.queue.test.ts`

- [ ] **Step 1: Append the test**

```ts
describe('Acceptance 10.12 — concurrency cap = 2 for ai-review-clip', () => {
  let runner: QueueRunner
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => {
    runner?.stop()
    vi.useRealTimers()
  })

  it('with 5 enqueued, only 2 are running concurrently', async () => {
    const { db, store } = freshFixture()
    const release: Array<() => void> = []
    const inFlight = new Set<string>()
    let maxInFlight = 0
    runner = createQueueRunner({ store, tickMs: 50 })
    runner.register({
      kind: 'ai-review-clip',
      concurrency: 2,
      minGapMs: 0,
      handler: ({ job }) =>
        new Promise<{ kind: 'ok' }>((resolve) => {
          inFlight.add(job.id)
          maxInFlight = Math.max(maxInFlight, inFlight.size)
          release.push(() => {
            inFlight.delete(job.id)
            resolve({ kind: 'ok' })
          })
        })
    })
    for (let i = 0; i < 5; i++) {
      store.enqueue('ai-review-clip', { clipId: i, path: `a${i}.md` })
    }
    runner.start()
    await vi.advanceTimersByTimeAsync(300)
    expect(maxInFlight).toBe(2)
    expect(release.length).toBe(2) // only 2 picked up so far

    // Drain by releasing them one by one
    while (release.length) {
      release.shift()!()
      await vi.advanceTimersByTimeAsync(150)
    }
    expect(maxInFlight).toBe(2)
    const done = (db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status='done'").get() as {
      n: number
    }).n
    expect(done).toBe(5)
    db.close()
  })
})
```

- [ ] **Step 2: Run**

Run: `npm test -- electron/queue/integration.queue.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add electron/queue/integration.queue.test.ts
git commit -m "test(phase-14): 10.12 concurrency cap = 2 for ai-review-clip (phase-14 10.12)"
```

---

<!-- openspec-task: 10.13 -->
### Task 13: UI live update — `jobs:changed` event reflects in the list

**Files:**
- Modify: `src/integration/phase-14-jobs-tab.test.tsx`

- [ ] **Step 1: Append the test**

```tsx
describe('Acceptance 10.13 — jobs:changed → list refreshes', () => {
  it('emitting jobs:changed triggers a re-fetch and the new row appears', async () => {
    let onChange: ((j: unknown) => void) | null = null
    mockApi.on.mockImplementation((channel: string, h: (j: unknown) => void) => {
      if (channel === 'jobs:changed') onChange = h
      return () => {}
    })
    let returnedItems: unknown[] = []
    mockApi.jobs.list.mockImplementation(async (f: { status?: string }) => {
      if (f.status === 'pending') return { items: returnedItems, total: returnedItems.length }
      return { items: [], total: 0 }
    })
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/history/jobs']}>
          <Routes>
            <Route path="/history/*" element={<History />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    )
    await waitFor(() => expect(mockApi.jobs.list).toHaveBeenCalled())
    expect(onChange).not.toBeNull()
    // Now mutate the "server" state and emit
    returnedItems = [
      {
        id: 'live',
        kind: 'index-retry',
        payload: { path: 'live.md' },
        status: 'pending',
        attempts: 0,
        nextRunAt: '2026-05-03T10:00:00.000Z',
        lastError: null,
        createdAt: '2026-05-03T10:00:00.000Z',
        updatedAt: '2026-05-03T10:00:00.000Z'
      }
    ]
    onChange!(returnedItems[0])
    await waitFor(() => expect(screen.getByTestId('job-row-live')).toBeInTheDocument(), {
      timeout: 1000
    })
  })
})
```

- [ ] **Step 2: Run**

Run: `npm test -- src/integration/phase-14-jobs-tab.test.tsx`
Expected: PASS.

- [ ] **Step 3: Manual smoke**

1. `npm run dev`; open the app + a grove.
2. Open `/history/jobs` (and devtools so you can watch the list).
3. From the main process (or by triggering a clip), enqueue a new job. The list should update **without you reloading**.

- [ ] **Step 4: Commit**

```bash
git add src/integration/phase-14-jobs-tab.test.tsx
git commit -m "test(phase-14): 10.13 jobs:changed live refresh (phase-14 10.13)"
```

---

<!-- openspec-task: 10.14 -->
### Task 14: `openspec validate phase-14-queue-persistence --strict`

**Files:**
- (no file changes; CLI invocation)

- [ ] **Step 1: Run the validator**

```bash
openspec validate phase-14-queue-persistence --strict
```

Expected: Exit code 0, no errors. If it complains about missing scenarios or unmet requirements, **stop and fix** the offending spec/test/code (do NOT add `--lenient`).

If validation reports a misalignment between code and spec (e.g. method names diverged), update the **spec** if the divergence is intentional and document the change in the corresponding plan's Cross-Plan Decisions; or update the **code** if the spec wording is correct.

- [ ] **Step 2: Run the full project test suite**

```bash
npm test
npm run typecheck
npm run lint
```

Expected: all green.

- [ ] **Step 3: Commit the validation gate**

If everything is green, no commit is needed for this task by itself. Instead, add a chore commit recording validation success:

```bash
git commit --allow-empty -m "chore(phase-14): openspec validate --strict pass; full suite green (phase-14 10.14)"
```

(`--allow-empty` because validation produced no file changes.)

---

## Self-Review Checklist (before archiving the change)

- [ ] All 14 task labels (`10.1`–`10.14`) are covered by at least one test or smoke step.
- [ ] `npm test` (full project) is green.
- [ ] `npm run typecheck` is green.
- [ ] `openspec validate phase-14-queue-persistence --strict` exits 0.
- [ ] Manual smoke for 10.9 (kill-the-app) was performed and recorded in the commit.
- [ ] The integration tests don't leak timers — every `vi.useFakeTimers()` is paired with `vi.useRealTimers()`; every `runner.start()` has a matching `runner.stop()` in `afterEach`.
- [ ] Every Task heading is preceded by `<!-- openspec-task: LABEL -->` matching tasks.md labels: `10.1` through `10.14`.

After Plan 4 is merged, run `/opsx:archive phase-14-queue-persistence` to finalise.
