# Phase-14 Queue Persistence — Plan 2: Runner, Policy, Ops Log, IPC

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-14-queue-persistence`
> **Task range:** OpenSpec tasks `3.1`–`5.3` (10 tasks)
> **Plan order:** 2 of 4. Depends on Plan 1 (`tasks-1.1-2.4`). Plans 3 (`tasks-6.1-9.1`) and 4 (`tasks-10.1-10.14`) build on this one.
> **Status:** Not started
> **Created:** 2026-05-03
> **Branch suggestion:** continue on `feat/phase-14-queue-persistence`

---

## Goal

Build the runner loop on top of the Plan 1 store: backoff policy, kind registry with concurrency / minGap, three-branch handler-result handling, AbortSignal cancellation, the before-quit safe-exit hook, the two phase-14 handlers (`index-retry` real, `ai-review-clip` stub), `ops_log` integration on every state change, and the `jobs` IPC namespace + preload bridge + cross-renderer broadcast.

## Architecture

The runner is a single `setInterval(250ms)` tick loop that scans for due jobs per registered kind, respecting `concurrency` and `minGapMs`. Handlers receive a `ctx` with the job, parsed payload, a `log` callback, and an `AbortSignal` — the runner stores an `AbortController` per running id and aborts on cancel. Handler exceptions become retries via the policy; `{ kind: 'fail' }` is fatal; `{ kind: 'retry' }` may override the policy delay. `ops_log` is written for every state change via `opsLog.record()` (phase-10 API). The IPC bridge subscribes to `store.events.stateChanged` once at registration and forwards the payload to every renderer over `'jobs:changed'`.

## Tech Stack

- TypeScript 5, Electron 39 (`app.on('before-quit')`, `webContents.send`)
- `AbortController` / `AbortSignal` (built-in)
- Node `setInterval` / `clearInterval`
- `vitest` with fake timers (`vi.useFakeTimers()`) for the runner tests

## Cross-Plan Decisions (locked here, referenced by later plans)

1. **Tick interval** = 250ms. Configurable via `createQueueRunner({ tickMs })` so tests can drive it manually.
2. **Handler signature** matches design D3 verbatim:
   ```ts
   type JobHandler = (ctx: HandlerCtx) => Promise<JobHandlerResult>
   ```
   where `HandlerCtx = { job, payload, log, cancel }`. Handler results are the discriminated union from `shared/job-types.ts`.
3. **`{ kind: 'retry' }` delayMs semantics**: positive integer overrides policy; `0`, negative, or non-finite values fall back to `nextDelay(attempts)`. Handler-supplied delays do **not** count toward the 5-attempt cap (they're explicit), but `attempts` still increments.
4. **Fatal on `attempts >= 5`** for *unhandled* errors only — handler-supplied `{ kind: 'retry', delayMs }` never auto-fails. Rationale: design D4 + retry-policy spec — the cap is a "give up" net for code that doesn't know better.
5. **Cancellation rules** (locked by spec scenarios):
   - `pending` → immediate `markCanceled(id)`; runner skips it next tick (status filter excludes 'canceled').
   - `running` → fire AbortSignal; **wait for handler to return** (no hard kill); `markCanceled(id)` regardless of the handler's return value (its result is discarded).
   - Other → return `E_STATUS_NOT_ALLOWED`.
6. **`opsLog.record` integration**: subscribe **once** in the runner setup (not in the store) so we don't pollute store unit tests. The runner constructor takes an optional `opsLog` dep; production wiring in `electron/main.ts`.
7. **`jobs:changed` broadcast**: main forwards every `stateChanged` payload to every `BrowserWindow.getAllWindows()[i].webContents` — matches phase-10 `db:rebuilt` pattern in `electron/services/db.ts`.
8. **IPC error model**: spec uses `{ ok: true } | { error: 'E_NOT_FOUND' | 'E_STATUS_NOT_ALLOWED' }` literal union. We **return** the error envelope (no `throw`) because IPC consumers want to switch on the discriminant in renderer-friendly form. The IPC router still wraps thrown `IpcError` for unknown failures.

---

## Pre-flight

This plan assumes Plan 1 is merged:
- `electron/queue/store.ts` exists with `createJobStore` returning the full interface (CRUD + events).
- `shared/job-types.ts` exports `Job`, `JobHandlerResult`, `JobKind`, `EnqueueOpts`, `JobListFilter`.
- `shared/ipc-contract.ts` declares the `jobs` namespace and `'jobs:changed'` event.
- `npm test` is green.

It also assumes phase-10 has shipped `electron/services/ops-log.ts` with `opsLog.record({ op, path, meta? })`. If the actual file/symbol name differs (e.g. `electron/services/ops_log.ts` or default-exported), adapt the import in Task 4.1 — the runner only needs **a** function `(record: { op: string; path: string; meta?: Record<string, unknown> }) => void`.

---

## File Structure

| Path | Action | Owner task |
|---|---|---|
| `electron/queue/policy.ts` | Create | 3.1 |
| `electron/queue/policy.test.ts` | Create | 3.1 |
| `electron/queue/runner.ts` | Create | 3.2, 3.3, 3.4, 4.1 |
| `electron/queue/runner.test.ts` | Create | 3.2, 3.3, 3.4, 4.1 |
| `electron/queue/handlers/index-retry.ts` | Create | 3.5 |
| `electron/queue/handlers/index-retry.test.ts` | Create | 3.5 |
| `electron/queue/handlers/ai-review-clip.ts` | Create | 3.6 |
| `electron/queue/handlers/ai-review-clip.test.ts` | Create | 3.6 |
| `electron/queue/index.ts` | Create (barrel + main-process bootstrap) | 3.5, 3.6, 4.1 |
| `electron/ipc/jobs.ts` | Create | 5.1 |
| `electron/ipc/jobs.test.ts` | Create | 5.1 |
| `electron/ipc/handlers.ts` | Modify (register `jobs` namespace) | 5.1 |
| `preload/preload.ts` | Modify (bind `jobs.*`) | 5.2 |
| `electron/main.ts` | Modify (instantiate runner; wire ops_log; broadcast; before-quit) | 3.4, 4.1, 5.3 |

---

## Tasks

<!-- openspec-task: 3.1 -->
### Task 1: Backoff policy — `nextDelay(attempts)`

**Files:**
- Create: `electron/queue/policy.ts`
- Create: `electron/queue/policy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// electron/queue/policy.test.ts
import { describe, it, expect } from 'vitest'
import { nextDelay } from './policy'

describe('nextDelay backoff table', () => {
  it.each([
    [0, 1_000],
    [1, 5_000],
    [2, 30_000],
    [3, 120_000],
    [4, 900_000]
  ])('attempts=%i → %i ms', (attempts, expected) => {
    expect(nextDelay(attempts)).toBe(expected)
  })

  it('returns null when attempts >= 5 (give up)', () => {
    expect(nextDelay(5)).toBe(null)
    expect(nextDelay(6)).toBe(null)
    expect(nextDelay(100)).toBe(null)
  })

  it('handles negative or non-integer attempts defensively (returns null)', () => {
    expect(nextDelay(-1)).toBe(null)
    expect(nextDelay(2.5)).toBe(null)
    expect(nextDelay(Number.NaN)).toBe(null)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- electron/queue/policy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `electron/queue/policy.ts`:

```ts
const TABLE: readonly number[] = [1_000, 5_000, 30_000, 120_000, 900_000]

/**
 * Exponential-ish backoff for queue retries.
 * Returns ms to wait before the next attempt, or `null` to indicate "give up".
 *
 *   attempts=0 →   1s
 *   attempts=1 →   5s
 *   attempts=2 →  30s
 *   attempts=3 →   2m
 *   attempts=4 →  15m
 *   attempts ≥5 → null  (runner will markFailed)
 */
export function nextDelay(attempts: number): number | null {
  if (!Number.isInteger(attempts) || attempts < 0 || attempts >= TABLE.length) return null
  return TABLE[attempts] as number
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- electron/queue/policy.test.ts`
Expected: PASS — 7 cases.

- [ ] **Step 5: Commit**

```bash
git add electron/queue/policy.ts electron/queue/policy.test.ts
git commit -m "feat(queue): nextDelay backoff policy (phase-14 3.1)"
```

---

<!-- openspec-task: 3.2 -->
### Task 2: Runner skeleton — tick loop + kind registry + concurrency + minGapMs

**Files:**
- Create: `electron/queue/runner.ts`
- Create: `electron/queue/runner.test.ts`

This task ships the runner *without* return-value handling, AbortSignal, or before-quit — those are layered in Tasks 3.3, 3.4. It establishes the `register` API and the tick loop's pick logic so we can drive it deterministically with fake timers.

- [ ] **Step 1: Write the failing test**

```ts
// electron/queue/runner.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../services/db/migrations'
import { createJobStore } from './store'
import { createQueueRunner } from './runner'

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'services',
  'db',
  'migrations'
)

function freshStore(): { db: Database.Database; store: ReturnType<typeof createJobStore> } {
  const db = new Database(':memory:')
  runMigrations(db, MIGRATIONS_DIR)
  return { db, store: createJobStore(db) }
}

describe('createQueueRunner — register + duplicate guard', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('rejects duplicate kind registration with E_DUPLICATE_KIND', () => {
    const { store } = freshStore()
    const runner = createQueueRunner({ store })
    runner.register({
      kind: 'index-retry',
      concurrency: 4,
      minGapMs: 0,
      handler: async () => ({ kind: 'ok' })
    })
    expect(() =>
      runner.register({
        kind: 'index-retry',
        concurrency: 1,
        minGapMs: 0,
        handler: async () => ({ kind: 'ok' })
      })
    ).toThrow(/E_DUPLICATE_KIND/)
  })
})

describe('createQueueRunner — tick picks due jobs', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('picks a pending job whose next_run_at <= now and runs the handler', async () => {
    vi.setSystemTime(new Date('2026-05-03T10:00:00.000Z'))
    const { store } = freshStore()
    const calls: string[] = []
    const runner = createQueueRunner({ store, tickMs: 250 })
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: async ({ payload }) => {
        calls.push((payload as { path: string }).path)
        return { kind: 'ok' }
      }
    })
    store.enqueue('index-retry', { path: 'a.md' })
    runner.start()
    await vi.advanceTimersByTimeAsync(300) // > one tick
    expect(calls).toEqual(['a.md'])
    runner.stop()
  })

  it('does NOT pick a job whose next_run_at is in the future', async () => {
    vi.setSystemTime(new Date('2026-05-03T10:00:00.000Z'))
    const { store } = freshStore()
    const calls: number = 0
    const ran: string[] = []
    const runner = createQueueRunner({ store, tickMs: 250 })
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: async ({ payload }) => {
        ran.push((payload as { path: string }).path)
        return { kind: 'ok' }
      }
    })
    store.enqueue('index-retry', { path: 'later.md' }, { delayMs: 60_000 })
    runner.start()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(ran).toEqual([])
    runner.stop()
    void calls // satisfy noUnusedLocals
  })

  it('respects concurrency: 2 handlers max for ai-review-clip', async () => {
    vi.setSystemTime(new Date('2026-05-03T10:00:00.000Z'))
    const { store } = freshStore()
    const inFlight: Set<string> = new Set()
    let maxInFlight = 0
    const release: Array<() => void> = []
    const runner = createQueueRunner({ store, tickMs: 250 })
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
    for (let i = 0; i < 5; i++) store.enqueue('ai-review-clip', { clipId: i })
    runner.start()
    await vi.advanceTimersByTimeAsync(500)
    expect(maxInFlight).toBeLessThanOrEqual(2)
    // Drain
    while (release.length) release.shift()!()
    await vi.advanceTimersByTimeAsync(2_000)
    runner.stop()
  })

  it('respects minGapMs: ai-review-clip with minGapMs=500 only picks one per 500ms window', async () => {
    vi.setSystemTime(new Date('2026-05-03T10:00:00.000Z'))
    const { store } = freshStore()
    const startedAt: number[] = []
    const runner = createQueueRunner({ store, tickMs: 100, now: () => Date.now() })
    runner.register({
      kind: 'ai-review-clip',
      concurrency: 5,
      minGapMs: 500,
      handler: async () => {
        startedAt.push(Date.now())
        return { kind: 'ok' }
      }
    })
    for (let i = 0; i < 3; i++) store.enqueue('ai-review-clip', { clipId: i })
    runner.start()
    // Advance ~1.6s so 3 windows of 500ms elapse
    await vi.advanceTimersByTimeAsync(1_600)
    expect(startedAt.length).toBe(3)
    // Each pick is at least 500ms apart
    for (let i = 1; i < startedAt.length; i++) {
      expect(startedAt[i] - startedAt[i - 1]).toBeGreaterThanOrEqual(500)
    }
    runner.stop()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- electron/queue/runner.test.ts`
Expected: FAIL — `createQueueRunner` not exported.

- [ ] **Step 3: Implement the runner skeleton**

Create `electron/queue/runner.ts`:

```ts
import type { JobHandlerResult } from '@shared/job-types'
import type { JobStore } from './store'
import type { Job } from '@shared/job-types'

export interface HandlerCtx {
  job: Job
  payload: Record<string, unknown>
  log: (level: 'debug' | 'info' | 'warn' | 'error', msg: string) => void
  cancel: AbortSignal
}

export type JobHandler = (ctx: HandlerCtx) => Promise<JobHandlerResult>

export interface RegisterOpts {
  kind: string
  concurrency: number
  minGapMs: number
  handler: JobHandler
}

export interface QueueRunner {
  register(opts: RegisterOpts): void
  start(): void
  stop(): void
  /** Cancel a job by id. See cross-plan decision #5. */
  cancel(id: string): { ok: true } | { error: 'E_NOT_FOUND' | 'E_STATUS_NOT_ALLOWED' }
  /** For Task 3.4 — drains running handlers up to `timeoutMs`. */
  drainOnQuit(timeoutMs: number): Promise<void>
}

export interface QueueRunnerDeps {
  store: JobStore
  tickMs?: number
  now?: () => number
  /** Optional ops_log writer; runner calls it on every state change. */
  opsLog?: (record: { op: string; path: string; meta?: Record<string, unknown> }) => void
  /** Optional logger. */
  log?: (level: 'debug' | 'info' | 'warn' | 'error', msg: string, ctx?: Record<string, unknown>) => void
}

interface KindEntry extends RegisterOpts {
  running: Map<string, AbortController>
  lastPickedAt: number
}

export function createQueueRunner(deps: QueueRunnerDeps): QueueRunner {
  const tickMs = deps.tickMs ?? 250
  const now = deps.now ?? (() => Date.now())
  const log = deps.log ?? (() => {})
  const kinds = new Map<string, KindEntry>()
  let timer: ReturnType<typeof setInterval> | null = null
  let acceptingNew = true

  function register(opts: RegisterOpts): void {
    if (kinds.has(opts.kind)) {
      throw new Error(`E_DUPLICATE_KIND: ${opts.kind}`)
    }
    kinds.set(opts.kind, { ...opts, running: new Map(), lastPickedAt: 0 })
  }

  function start(): void {
    if (timer) return
    timer = setInterval(tick, tickMs)
  }

  function stop(): void {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function tick(): void {
    if (!acceptingNew) return
    const nowMs = now()
    const nowIso = new Date(nowMs).toISOString()
    for (const entry of kinds.values()) {
      if (entry.running.size >= entry.concurrency) continue
      if (nowMs - entry.lastPickedAt < entry.minGapMs) continue
      const slots = entry.concurrency - entry.running.size
      // Single-pick per tick when minGapMs is set; otherwise fill all slots.
      const limit = entry.minGapMs > 0 ? 1 : slots
      const due = deps.store.list({
        kind: entry.kind,
        status: 'pending',
        limit,
        offset: 0
      })
      const ready = due.items.filter((j) => j.nextRunAt <= nowIso)
      if (ready.length === 0) continue
      entry.lastPickedAt = nowMs
      for (const job of ready) runOne(entry, job)
    }
  }

  function runOne(entry: KindEntry, job: Job): void {
    const controller = new AbortController()
    entry.running.set(job.id, controller)
    deps.store.markRunning(job.id)
    void Promise.resolve()
      .then(() =>
        entry.handler({
          job,
          payload: job.payload,
          log: (level, msg) => log(level, msg, { jobId: job.id, kind: job.kind }),
          cancel: controller.signal
        })
      )
      .then(
        (result) => settle(entry, job, controller, result, /*threw*/ null),
        (err: unknown) => settle(entry, job, controller, null, err)
      )
  }

  function settle(
    entry: KindEntry,
    job: Job,
    controller: AbortController,
    result: JobHandlerResult | null,
    threw: unknown
  ): void {
    entry.running.delete(job.id)
    // If cancel was requested, ignore handler's result and force canceled state
    if (controller.signal.aborted) {
      // The cancel() call already wrote markCanceled before firing the abort.
      return
    }
    // Plan-2 phase-2 (Task 3.3) handles result branches; phase-1 stub:
    // - exception → markRetry (next-delay) or markFailed
    // - { kind: 'ok' } → markDone
    // - { kind: 'retry' } → markRetry
    // - { kind: 'fail' } → markFailed
    // The full implementation lives in Task 3.3 — this stub keeps the test passing.
    if (threw) {
      const msg = threw instanceof Error ? threw.message : String(threw)
      deps.store.markRetry(job.id, 1000, msg)
      return
    }
    if (!result) return
    if (result.kind === 'ok') deps.store.markDone(job.id)
    else if (result.kind === 'fail') deps.store.markFailed(job.id, result.error)
    else if (result.kind === 'retry') deps.store.markRetry(job.id, result.delayMs, result.reason)
  }

  function cancel(id: string): { ok: true } | { error: 'E_NOT_FOUND' | 'E_STATUS_NOT_ALLOWED' } {
    const job = deps.store.getById(id)
    if (!job) return { error: 'E_NOT_FOUND' }
    if (job.status === 'pending') {
      deps.store.markCanceled(id)
      return { ok: true }
    }
    if (job.status === 'running') {
      const entry = kinds.get(job.kind)
      const ctl = entry?.running.get(id)
      // Mark canceled BEFORE aborting so the settle() guard picks it up.
      deps.store.markCanceled(id)
      ctl?.abort()
      return { ok: true }
    }
    return { error: 'E_STATUS_NOT_ALLOWED' }
  }

  async function drainOnQuit(timeoutMs: number): Promise<void> {
    acceptingNew = false
    stop()
    const deadline = Date.now() + timeoutMs
    // wait for all running handlers to settle
    while (Date.now() < deadline) {
      let any = false
      for (const e of kinds.values()) if (e.running.size > 0) any = true
      if (!any) return
      await new Promise((r) => setTimeout(r, 50))
    }
  }

  return { register, start, stop, cancel, drainOnQuit }
}
```

> **Note on `AbortController` ergonomics:** `Map<id, AbortController>` is the simplest way to thread the signal end-to-end. The cancel path mutates the store **before** firing abort so the post-handler `settle()` short-circuits cleanly (it sees `aborted=true` and bails).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- electron/queue/runner.test.ts`
Expected: PASS — 5 cases (duplicate-kind, due pick, future skip, concurrency, minGap).

> **If the minGap test is flaky** with `vi.advanceTimersByTimeAsync`, the issue is `Date.now()` inside the runner not advancing in lockstep with timers. Set `vi.useFakeTimers({ shouldAdvanceTime: true })` at the top of the describe block — fake timers will advance `Date.now()` along with `setInterval`.

- [ ] **Step 5: Commit**

```bash
git add electron/queue/runner.ts electron/queue/runner.test.ts
git commit -m "feat(queue): runner tick loop + kind registry + concurrency/minGap (phase-14 3.2)"
```

---

<!-- openspec-task: 3.3 -->
### Task 3: Handler return-value handling — three branches + AbortSignal threading + policy fallback

**Files:**
- Modify: `electron/queue/runner.ts`
- Modify: `electron/queue/runner.test.ts`

The Task 3.2 stub used a fixed 1000ms retry delay on exceptions. This task wires `nextDelay(attempts)` from Plan-2 Task 1, applies the "fatal at attempts ≥ 5" rule, validates handler-supplied `delayMs`, and adds the AbortSignal observation tests (handler must respect `cancel.aborted`).

- [ ] **Step 1: Append failing tests**

Append to `electron/queue/runner.test.ts`:

```ts
describe('createQueueRunner — handler result branches', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('throws → markRetry with policy.nextDelay(attempts) and the error message', async () => {
    vi.setSystemTime(new Date('2026-05-03T10:00:00.000Z'))
    const { db, store } = freshStore()
    const runner = createQueueRunner({ store, tickMs: 100 })
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => {
        throw new Error('boom')
      }
    })
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    runner.start()
    await vi.advanceTimersByTimeAsync(300)
    runner.stop()
    const row = db.prepare('SELECT * FROM jobs WHERE id=?').get(id) as {
      status: string
      attempts: number
      next_run_at: string
      last_error: string
    }
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(1)
    expect(row.last_error).toBe('boom')
    // 1s default backoff → next_run_at ≈ now + 1s
    const delta = Date.parse(row.next_run_at) - Date.parse('2026-05-03T10:00:00.000Z')
    expect(delta).toBeGreaterThanOrEqual(900)
    expect(delta).toBeLessThanOrEqual(1500)
  })

  it('throws on attempts=5 → markFailed (policy returns null)', async () => {
    vi.setSystemTime(new Date('2026-05-03T10:00:00.000Z'))
    const { db, store } = freshStore()
    // Pre-seed a job with attempts=5 via direct DB write
    const id = 'doomed'
    db.prepare(
      `INSERT INTO jobs (id, kind, payload_json, status, attempts, next_run_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(
      id,
      'index-retry',
      JSON.stringify({ path: 'x.md' }),
      'pending',
      5,
      '2026-05-03T10:00:00.000Z',
      '2026-05-03T10:00:00.000Z',
      '2026-05-03T10:00:00.000Z'
    )
    const runner = createQueueRunner({ store, tickMs: 100 })
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => {
        throw new Error('still broken')
      }
    })
    runner.start()
    await vi.advanceTimersByTimeAsync(300)
    runner.stop()
    const row = db.prepare('SELECT status, last_error FROM jobs WHERE id=?').get(id) as {
      status: string
      last_error: string
    }
    expect(row.status).toBe('failed')
    expect(row.last_error).toBe('still broken')
  })

  it('returns { kind: "fail", error } → markFailed (no retry policy)', async () => {
    const { db, store } = freshStore()
    const runner = createQueueRunner({ store, tickMs: 100 })
    runner.register({
      kind: 'ai-review-clip',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => ({ kind: 'fail', error: 'E_MISSING_PROFILE' })
    })
    const { id } = store.enqueue('ai-review-clip', { clipId: 1 })
    runner.start()
    await vi.advanceTimersByTimeAsync(300)
    runner.stop()
    const row = db.prepare('SELECT status, attempts, last_error FROM jobs WHERE id=?').get(id) as {
      status: string
      attempts: number
      last_error: string
    }
    expect(row.status).toBe('failed')
    expect(row.attempts).toBe(0) // no increment
    expect(row.last_error).toBe('E_MISSING_PROFILE')
  })

  it('returns { kind: "retry", delayMs, reason } → markRetry with that delayMs', async () => {
    vi.setSystemTime(new Date('2026-05-03T10:00:00.000Z'))
    const { db, store } = freshStore()
    const runner = createQueueRunner({ store, tickMs: 100 })
    runner.register({
      kind: 'ai-review-clip',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => ({ kind: 'retry', delayMs: 3_600_000, reason: 'E_RATE_LIMITED' })
    })
    const { id } = store.enqueue('ai-review-clip', { clipId: 1 })
    runner.start()
    await vi.advanceTimersByTimeAsync(300)
    runner.stop()
    const row = db.prepare('SELECT * FROM jobs WHERE id=?').get(id) as {
      status: string
      attempts: number
      next_run_at: string
      last_error: string
    }
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(1)
    expect(row.last_error).toBe('E_RATE_LIMITED')
    const delta = Date.parse(row.next_run_at) - Date.parse('2026-05-03T10:00:00.000Z')
    expect(delta).toBeGreaterThanOrEqual(3_600_000 - 200)
    expect(delta).toBeLessThanOrEqual(3_600_000 + 1_500)
  })

  it('handler-supplied delayMs ≤ 0 falls back to nextDelay(attempts)', async () => {
    vi.setSystemTime(new Date('2026-05-03T10:00:00.000Z'))
    const { db, store } = freshStore()
    const runner = createQueueRunner({ store, tickMs: 100 })
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => ({ kind: 'retry', delayMs: 0, reason: 'oops' })
    })
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    runner.start()
    await vi.advanceTimersByTimeAsync(300)
    runner.stop()
    const row = db.prepare('SELECT next_run_at FROM jobs WHERE id=?').get(id) as { next_run_at: string }
    const delta = Date.parse(row.next_run_at) - Date.parse('2026-05-03T10:00:00.000Z')
    expect(delta).toBeGreaterThanOrEqual(900)
    expect(delta).toBeLessThanOrEqual(1500)
  })
})

describe('createQueueRunner — cancel + AbortSignal', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('cancel pending → status=canceled immediately; runner does not pick it', async () => {
    const { db, store } = freshStore()
    const runner = createQueueRunner({ store, tickMs: 100 })
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => ({ kind: 'ok' })
    })
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    const r = runner.cancel(id)
    expect(r).toEqual({ ok: true })
    runner.start()
    await vi.advanceTimersByTimeAsync(500)
    runner.stop()
    const row = db.prepare('SELECT status FROM jobs WHERE id=?').get(id) as { status: string }
    expect(row.status).toBe('canceled')
  })

  it('cancel running → AbortSignal fires, handler co-op exits, status=canceled regardless of return', async () => {
    const { db, store } = freshStore()
    let signaled = false
    let handlerResolve!: (r: { kind: 'ok' }) => void
    const runner = createQueueRunner({ store, tickMs: 100 })
    runner.register({
      kind: 'ai-review-clip',
      concurrency: 1,
      minGapMs: 0,
      handler: ({ cancel }) => {
        cancel.addEventListener('abort', () => {
          signaled = true
        })
        return new Promise<{ kind: 'ok' }>((resolve) => {
          handlerResolve = resolve
        })
      }
    })
    const { id } = store.enqueue('ai-review-clip', { clipId: 1 })
    runner.start()
    await vi.advanceTimersByTimeAsync(200) // handler starts
    const r = runner.cancel(id)
    expect(r).toEqual({ ok: true })
    expect(signaled).toBe(true)
    handlerResolve({ kind: 'ok' }) // handler returns "ok" but we ignore it
    await vi.advanceTimersByTimeAsync(50)
    runner.stop()
    const row = db.prepare('SELECT status FROM jobs WHERE id=?').get(id) as { status: string }
    expect(row.status).toBe('canceled')
  })

  it('cancel done → E_STATUS_NOT_ALLOWED', async () => {
    const { store } = freshStore()
    const runner = createQueueRunner({ store, tickMs: 100 })
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => ({ kind: 'ok' })
    })
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    store.markDone(id)
    expect(runner.cancel(id)).toEqual({ error: 'E_STATUS_NOT_ALLOWED' })
  })

  it('cancel non-existent id → E_NOT_FOUND', () => {
    const { store } = freshStore()
    const runner = createQueueRunner({ store })
    expect(runner.cancel('nope')).toEqual({ error: 'E_NOT_FOUND' })
  })
})
```

- [ ] **Step 2: Run to verify the failing tests**

Run: `npm test -- electron/queue/runner.test.ts`
Expected: most pass (the stub already covers `ok`/`fail`/`retry` happy paths and basic cancel) but two fail:
- "policy returns null" → currently retries with 1000ms instead of failing
- "delayMs ≤ 0 falls back" → currently writes 0ms

- [ ] **Step 3: Wire policy fallback + delayMs validation in `settle`**

Modify `settle` in `electron/queue/runner.ts`:

```ts
import { nextDelay } from './policy'

  function settle(
    entry: KindEntry,
    job: Job,
    controller: AbortController,
    result: JobHandlerResult | null,
    threw: unknown
  ): void {
    entry.running.delete(job.id)
    if (controller.signal.aborted) return

    if (threw) {
      const msg = threw instanceof Error ? threw.message : String(threw)
      const delay = nextDelay(job.attempts)
      if (delay === null) deps.store.markFailed(job.id, msg)
      else deps.store.markRetry(job.id, delay, msg)
      return
    }
    if (!result) return
    if (result.kind === 'ok') {
      deps.store.markDone(job.id)
      return
    }
    if (result.kind === 'fail') {
      deps.store.markFailed(job.id, result.error)
      return
    }
    // retry
    const supplied =
      Number.isFinite(result.delayMs) && result.delayMs > 0 ? result.delayMs : null
    const delay = supplied ?? nextDelay(job.attempts)
    if (delay === null) deps.store.markFailed(job.id, result.reason)
    else deps.store.markRetry(job.id, delay, result.reason)
  }
```

- [ ] **Step 4: Run the test suite**

Run: `npm test -- electron/queue/runner.test.ts`
Expected: PASS — all branches green.

- [ ] **Step 5: Commit**

```bash
git add electron/queue/runner.ts electron/queue/runner.test.ts
git commit -m "feat(queue): handler result branches + AbortSignal threading (phase-14 3.3)"
```

---

<!-- openspec-task: 3.4 -->
### Task 4: Safe-exit hook — `before-quit` stops the loop and waits up to 5s

**Files:**
- Modify: `electron/queue/runner.test.ts`
- Modify: `electron/main.ts`

The runner already exposes `drainOnQuit(timeoutMs)`. This task verifies its behavior and wires the Electron `app.on('before-quit')` to call it.

- [ ] **Step 1: Append failing test**

Append to `electron/queue/runner.test.ts`:

```ts
describe('createQueueRunner — drainOnQuit', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('stops accepting new picks once drain starts', async () => {
    const { store } = freshStore()
    const runner = createQueueRunner({ store, tickMs: 50 })
    let started = 0
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => {
        started++
        return { kind: 'ok' }
      }
    })
    store.enqueue('index-retry', { path: 'a.md' })
    runner.start()
    await vi.advanceTimersByTimeAsync(150) // a.md runs
    expect(started).toBe(1)
    // Now enqueue another and start drain
    store.enqueue('index-retry', { path: 'b.md' })
    const drain = runner.drainOnQuit(2_000)
    await vi.advanceTimersByTimeAsync(2_500)
    await drain
    // b.md must NOT have started — drain blocked new picks
    expect(started).toBe(1)
  })

  it('waits up to timeoutMs for in-flight handlers to settle', async () => {
    const { store } = freshStore()
    let resolveHandler!: (r: { kind: 'ok' }) => void
    const runner = createQueueRunner({ store, tickMs: 50 })
    runner.register({
      kind: 'ai-review-clip',
      concurrency: 1,
      minGapMs: 0,
      handler: () => new Promise<{ kind: 'ok' }>((r) => { resolveHandler = r })
    })
    store.enqueue('ai-review-clip', { clipId: 1 })
    runner.start()
    await vi.advanceTimersByTimeAsync(100)
    const drain = runner.drainOnQuit(5_000)
    // Handler still in-flight → drain should wait
    await vi.advanceTimersByTimeAsync(200)
    resolveHandler({ kind: 'ok' })
    await vi.advanceTimersByTimeAsync(200)
    await drain
  })

  it('returns even if handlers exceed timeoutMs (best-effort)', async () => {
    const { store } = freshStore()
    const runner = createQueueRunner({ store, tickMs: 50 })
    runner.register({
      kind: 'ai-review-clip',
      concurrency: 1,
      minGapMs: 0,
      handler: () => new Promise<{ kind: 'ok' }>(() => {}) // never settles
    })
    store.enqueue('ai-review-clip', { clipId: 1 })
    runner.start()
    await vi.advanceTimersByTimeAsync(100)
    const drain = runner.drainOnQuit(500)
    await vi.advanceTimersByTimeAsync(700)
    await drain // resolves regardless
  })
})
```

- [ ] **Step 2: Run to verify they pass** (the runner already implements `drainOnQuit`)

Run: `npm test -- electron/queue/runner.test.ts`
Expected: PASS — drain tests green.

- [ ] **Step 3: Wire `before-quit` in `electron/main.ts`**

Open `electron/main.ts`. Find the existing imports and add the queue bootstrap.

Add near the other electron imports:

```ts
import type { QueueRunner } from './queue/runner'
```

Add a module-scoped runner reference:

```ts
let queueRunner: QueueRunner | null = null
```

Inside the function that runs after `dbService.openForGrove(...)` succeeds (i.e., where the indexer + watcher are started — search for `setIndexerDb` to find the right block), add:

```ts
  // phase-14: start the queue runner
  const { bootstrapQueueRunner } = await import('./queue')
  queueRunner = bootstrapQueueRunner(dbService.requireCurrent())
  queueRunner.start()
```

(The `electron/queue/index.ts` barrel that exports `bootstrapQueueRunner` is created in Task 3.5.)

In the `app` lifecycle, just before `app.quit()` paths or at the top of the `before-quit` listener, add:

```ts
app.on('before-quit', async (event) => {
  if (queueRunner) {
    event.preventDefault()
    isQuitting = true
    try {
      await queueRunner.drainOnQuit(5_000)
    } finally {
      queueRunner = null
      app.quit()
    }
  } else {
    isQuitting = true
  }
})
```

> **Note:** if `electron/main.ts` already has an `app.on('before-quit')` listener (check `electron/app-lifecycle.ts` first), extend it rather than adding a second one. Two listeners both calling `event.preventDefault()` race each other.

- [ ] **Step 4: Smoke test the wiring**

Run: `npm run dev` (or the project's standard dev command), open and close the app. Verify in `~/Library/Logs/<bundleId>/main.log` (or wherever electron-log writes) that no errors appear during shutdown.

- [ ] **Step 5: Commit**

```bash
git add electron/queue/runner.test.ts electron/main.ts
git commit -m "feat(queue): before-quit drain hook (5s) (phase-14 3.4)"
```

---

<!-- openspec-task: 3.5 -->
### Task 5: `index-retry` handler

**Files:**
- Create: `electron/queue/handlers/index-retry.ts`
- Create: `electron/queue/handlers/index-retry.test.ts`
- Create: `electron/queue/index.ts` (initial barrel — registration only; no ai-review yet)

The handler delegates to `fileIndexer.upsertFromFs(path)` from phase-05. ENOENT is treated as success (the row was already cleaned up at enqueue time per phase-14 file-indexer spec). Other errors → `retry`.

- [ ] **Step 1: Write the failing test**

```ts
// electron/queue/handlers/index-retry.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createIndexRetryHandler } from './index-retry'
import type { Job } from '@shared/job-types'

function fakeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'j-1',
    kind: 'index-retry',
    payload: { path: 'a.md' },
    status: 'running',
    attempts: 0,
    nextRunAt: '2026-05-03T10:00:00.000Z',
    lastError: null,
    createdAt: '2026-05-03T10:00:00.000Z',
    updatedAt: '2026-05-03T10:00:00.000Z',
    ...overrides
  }
}

describe('createIndexRetryHandler', () => {
  it('returns { kind: "ok" } when upsertFromFs succeeds', async () => {
    const upsertFromFs = vi.fn().mockResolvedValue(undefined)
    const handler = createIndexRetryHandler({ upsertFromFs })
    const result = await handler({
      job: fakeJob(),
      payload: { path: 'a.md' },
      log: () => {},
      cancel: new AbortController().signal
    })
    expect(upsertFromFs).toHaveBeenCalledWith('a.md')
    expect(result).toEqual({ kind: 'ok' })
  })

  it('treats ENOENT as success (file already removed from index)', async () => {
    const err = Object.assign(new Error('not found'), { code: 'ENOENT' })
    const upsertFromFs = vi.fn().mockRejectedValue(err)
    const handler = createIndexRetryHandler({ upsertFromFs })
    const result = await handler({
      job: fakeJob(),
      payload: { path: 'gone.md' },
      log: () => {},
      cancel: new AbortController().signal
    })
    expect(result).toEqual({ kind: 'ok' })
  })

  it('returns { kind: "retry" } with the error message on transient failure', async () => {
    const upsertFromFs = vi.fn().mockRejectedValue(new Error('EIO read err'))
    const handler = createIndexRetryHandler({ upsertFromFs })
    const result = await handler({
      job: fakeJob(),
      payload: { path: 'a.md' },
      log: () => {},
      cancel: new AbortController().signal
    })
    // delayMs=0 lets the runner fall back to policy.nextDelay(attempts)
    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.reason).toContain('EIO read err')
      expect(result.delayMs).toBe(0)
    }
  })

  it('throws E_INVALID_PAYLOAD if path missing', async () => {
    const handler = createIndexRetryHandler({ upsertFromFs: vi.fn() })
    await expect(
      handler({
        job: fakeJob({ payload: {} }),
        payload: {},
        log: () => {},
        cancel: new AbortController().signal
      })
    ).rejects.toThrow(/payload\.path/i)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- electron/queue/handlers/index-retry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handler**

Create `electron/queue/handlers/index-retry.ts`:

```ts
import type { JobHandler } from '../runner'

export interface IndexRetryDeps {
  upsertFromFs: (path: string) => Promise<void>
}

interface IndexRetryPayload {
  path: string
  reason?: string
}

export function createIndexRetryHandler(deps: IndexRetryDeps): JobHandler {
  return async ({ payload }) => {
    const p = payload as Partial<IndexRetryPayload>
    if (typeof p.path !== 'string' || p.path.length === 0) {
      throw new Error('index-retry handler: payload.path is required')
    }
    try {
      await deps.upsertFromFs(p.path)
      return { kind: 'ok' }
    } catch (e) {
      const code = (e as NodeJS.ErrnoException | { code?: string })?.code
      if (code === 'ENOENT') {
        // file already gone; the row was scrubbed at enqueue time
        return { kind: 'ok' }
      }
      const msg = e instanceof Error ? e.message : String(e)
      return { kind: 'retry', delayMs: 0, reason: msg }
    }
  }
}
```

- [ ] **Step 4: Create the barrel `electron/queue/index.ts`**

```ts
import type Database from 'better-sqlite3'
import { createJobStore, type JobStore } from './store'
import { createQueueRunner, type QueueRunner } from './runner'
import { createIndexRetryHandler } from './handlers/index-retry'
import { upsertFromFs } from '../services/indexer'
// ai-review handler wired in Task 3.6

export interface QueueBootstrap {
  store: JobStore
  runner: QueueRunner
}

let bootstrap: QueueBootstrap | null = null

export function bootstrapQueueRunner(
  db: Database.Database,
  opts: { opsLog?: (r: { op: string; path: string; meta?: Record<string, unknown> }) => void } = {}
): QueueRunner {
  const store = createJobStore(db)
  const runner = createQueueRunner({ store, opsLog: opts.opsLog })
  runner.register({
    kind: 'index-retry',
    concurrency: 4,
    minGapMs: 0,
    handler: createIndexRetryHandler({ upsertFromFs })
  })
  // ai-review-clip registered in Task 3.6
  bootstrap = { store, runner }
  return runner
}

export function getQueueBootstrap(): QueueBootstrap | null {
  return bootstrap
}

export function disposeQueueBootstrap(): void {
  if (bootstrap) {
    bootstrap.runner.stop()
    bootstrap = null
  }
}
```

> **Note:** if `electron/services/indexer.ts` does not export `upsertFromFs` directly (phase-05 may export it under a different name), adapt the import. Search with `grep -n "export.*upsertFromFs\b" electron/services/indexer.ts` first.

- [ ] **Step 5: Run the tests**

Run: `npm test -- electron/queue/handlers/index-retry.test.ts electron/queue/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/queue/handlers/index-retry.ts electron/queue/handlers/index-retry.test.ts electron/queue/index.ts
git commit -m "feat(queue): index-retry handler + queue bootstrap (phase-14 3.5)"
```

---

<!-- openspec-task: 3.6 -->
### Task 6: `ai-review-clip` placeholder handler — retry 1h on `E_NOT_IMPLEMENTED`

**Files:**
- Create: `electron/queue/handlers/ai-review-clip.ts`
- Create: `electron/queue/handlers/ai-review-clip.test.ts`
- Modify: `electron/queue/index.ts` (register the handler)

The placeholder reads the clip row + the on-disk md file (so phase-15's eventual real logic has the same input shape) but defers the AI call to a `aiReviewer.reviewClip(...)` module that **does not exist yet**. We import-and-call defensively: any thrown `E_NOT_IMPLEMENTED` becomes a 1-hour retry. Other errors fall through to the runner's default policy.

- [ ] **Step 1: Write the failing test**

```ts
// electron/queue/handlers/ai-review-clip.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createAiReviewClipHandler } from './ai-review-clip'

const fakeCtx = {
  job: {
    id: 'j-1',
    kind: 'ai-review-clip' as const,
    payload: { clipId: 1, path: 'inbox/202604/a.md' },
    status: 'running' as const,
    attempts: 0,
    nextRunAt: '2026-05-03T10:00:00.000Z',
    lastError: null,
    createdAt: '2026-05-03T10:00:00.000Z',
    updatedAt: '2026-05-03T10:00:00.000Z'
  },
  payload: { clipId: 1, path: 'inbox/202604/a.md' },
  log: () => {},
  cancel: new AbortController().signal
}

describe('createAiReviewClipHandler', () => {
  it('returns retry 1h when reviewClip throws E_NOT_IMPLEMENTED', async () => {
    const reviewClip = vi.fn().mockRejectedValue(
      Object.assign(new Error('phase-15 not yet implemented'), { code: 'E_NOT_IMPLEMENTED' })
    )
    const handler = createAiReviewClipHandler({
      reviewClip,
      readClipRow: vi.fn().mockReturnValue({ id: 1, title: 't', path: 'inbox/a.md' }),
      readMdFile: vi.fn().mockResolvedValue({ frontmatter: {}, body: 'hello' })
    })
    const result = await handler(fakeCtx)
    expect(result).toEqual({
      kind: 'retry',
      delayMs: 60 * 60 * 1000,
      reason: 'E_NOT_IMPLEMENTED'
    })
  })

  it('returns ok when reviewClip resolves', async () => {
    const reviewClip = vi.fn().mockResolvedValue(undefined)
    const handler = createAiReviewClipHandler({
      reviewClip,
      readClipRow: vi.fn().mockReturnValue({ id: 1, title: 't', path: 'inbox/a.md' }),
      readMdFile: vi.fn().mockResolvedValue({ frontmatter: {}, body: 'hello' })
    })
    const result = await handler(fakeCtx)
    expect(result).toEqual({ kind: 'ok' })
  })

  it('returns fail when clip row missing (E_NOT_FOUND, no point retrying)', async () => {
    const handler = createAiReviewClipHandler({
      reviewClip: vi.fn(),
      readClipRow: vi.fn().mockReturnValue(null),
      readMdFile: vi.fn()
    })
    const result = await handler(fakeCtx)
    expect(result).toEqual({ kind: 'fail', error: 'E_CLIP_NOT_FOUND' })
  })

  it('non-E_NOT_IMPLEMENTED errors bubble up so the runner applies the default backoff', async () => {
    const reviewClip = vi.fn().mockRejectedValue(new Error('rate limit'))
    const handler = createAiReviewClipHandler({
      reviewClip,
      readClipRow: vi.fn().mockReturnValue({ id: 1, title: 't', path: 'inbox/a.md' }),
      readMdFile: vi.fn().mockResolvedValue({ frontmatter: {}, body: 'hello' })
    })
    await expect(handler(fakeCtx)).rejects.toThrow(/rate limit/)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- electron/queue/handlers/ai-review-clip.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `electron/queue/handlers/ai-review-clip.ts`:

```ts
import type { JobHandler } from '../runner'

interface ClipRow {
  id: number
  title: string | null
  path: string
}

export interface AiReviewClipDeps {
  /** Look up a clip row by id from `clips` table. Returns null if missing. */
  readClipRow: (id: number) => ClipRow | null
  /** Read & parse a vault-relative md path to frontmatter + body. */
  readMdFile: (path: string) => Promise<{ frontmatter: Record<string, unknown>; body: string }>
  /**
   * Phase-15-supplied AI review entrypoint. Phase-14 expects this to throw
   * `Error & { code: 'E_NOT_IMPLEMENTED' }` until phase-15 lands.
   */
  reviewClip: (input: {
    clipId: number
    path: string
    body: string
    frontmatter: Record<string, unknown>
  }) => Promise<void>
}

interface Payload {
  clipId: number
  path: string
}

export function createAiReviewClipHandler(deps: AiReviewClipDeps): JobHandler {
  return async ({ payload }) => {
    const p = payload as Partial<Payload>
    if (typeof p.clipId !== 'number' || typeof p.path !== 'string') {
      return { kind: 'fail', error: 'E_INVALID_PAYLOAD' }
    }
    const clip = deps.readClipRow(p.clipId)
    if (!clip) return { kind: 'fail', error: 'E_CLIP_NOT_FOUND' }
    const { frontmatter, body } = await deps.readMdFile(p.path)
    try {
      await deps.reviewClip({ clipId: p.clipId, path: p.path, body, frontmatter })
      return { kind: 'ok' }
    } catch (e) {
      const code = (e as { code?: string })?.code
      if (code === 'E_NOT_IMPLEMENTED') {
        return { kind: 'retry', delayMs: 60 * 60 * 1000, reason: 'E_NOT_IMPLEMENTED' }
      }
      throw e
    }
  }
}
```

- [ ] **Step 4: Wire into the bootstrap**

Modify `electron/queue/index.ts` — extend `bootstrapQueueRunner` to register `ai-review-clip`:

```ts
import { createAiReviewClipHandler } from './handlers/ai-review-clip'
import { readClipRow } from '../services/clips' // phase-12 module
import { readParsedMdFile } from '../services/file-io' // phase-04 module — adapt name

// inside bootstrapQueueRunner, after the index-retry register:
  runner.register({
    kind: 'ai-review-clip',
    concurrency: 2,
    minGapMs: 500,
    handler: createAiReviewClipHandler({
      readClipRow: (id) => readClipRow(db, id),
      readMdFile: async (path) => {
        const parsed = await readParsedMdFile(path)
        return { frontmatter: parsed.frontmatter, body: parsed.body }
      },
      reviewClip: async () => {
        const err = new Error('phase-15 ai reviewer not yet implemented') as Error & {
          code: string
        }
        err.code = 'E_NOT_IMPLEMENTED'
        throw err
      }
    })
  })
```

> **Note on imports:** the names `readClipRow` and `readParsedMdFile` are placeholders aligning with phase-12/phase-04. Verify with:
> ```bash
> grep -n "export.*function read" electron/services/clips.ts electron/services/file-io.ts 2>/dev/null
> ```
> If phase-12 hasn't shipped a `clips.ts`, fall back to a direct prepared query inside the bootstrap and leave a TODO. **Do not invent new exports** in phase-12's module.

- [ ] **Step 5: Run the test**

Run: `npm test -- electron/queue/handlers/ai-review-clip.test.ts`
Expected: PASS — 4 cases.

- [ ] **Step 6: Commit**

```bash
git add electron/queue/handlers/ai-review-clip.ts electron/queue/handlers/ai-review-clip.test.ts electron/queue/index.ts
git commit -m "feat(queue): ai-review-clip placeholder handler (1h retry on E_NOT_IMPLEMENTED) (phase-14 3.6)"
```

---

<!-- openspec-task: 4.1 -->
### Task 7: `ops_log` integration — write `job.*` events on every state change

**Files:**
- Modify: `electron/queue/runner.ts`
- Modify: `electron/queue/runner.test.ts`
- Modify: `electron/queue/index.ts`
- Modify: `electron/main.ts`

The runner's `opsLog` dep was wired in Task 3.2 but never invoked. We subscribe to `store.events` from inside the runner and forward each event into `opsLog.record`. The `path` field in `ops_log` is best-effort: for `index-retry` use `payload.path`; for `ai-review-clip` use `payload.path` (the md path); for unknown kinds use `''`.

- [ ] **Step 1: Append failing test**

Append to `electron/queue/runner.test.ts`:

```ts
describe('createQueueRunner — ops_log integration', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('writes job.enqueued / started / succeeded for the happy path', async () => {
    const { store } = freshStore()
    const events: { op: string; path: string; meta?: Record<string, unknown> }[] = []
    const opsLog = (r: { op: string; path: string; meta?: Record<string, unknown> }) =>
      events.push(r)
    const runner = createQueueRunner({ store, tickMs: 100, opsLog })
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => ({ kind: 'ok' })
    })
    store.enqueue('index-retry', { path: 'a.md' })
    runner.start()
    await vi.advanceTimersByTimeAsync(300)
    runner.stop()
    const ops = events.map((e) => e.op)
    expect(ops).toEqual(['job.enqueued', 'job.started', 'job.succeeded'])
    expect(events.every((e) => e.path === 'a.md')).toBe(true)
    expect(events[0].meta).toMatchObject({ kind: 'index-retry' })
  })

  it('writes job.retry on retry / job.failed on fatal', async () => {
    const { store } = freshStore()
    const ops: string[] = []
    const opsLog = (r: { op: string }) => ops.push(r.op)
    const runner = createQueueRunner({ store, tickMs: 100, opsLog })
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => ({ kind: 'fail', error: 'gave up' })
    })
    store.enqueue('index-retry', { path: 'a.md' })
    runner.start()
    await vi.advanceTimersByTimeAsync(300)
    runner.stop()
    expect(ops).toEqual(['job.enqueued', 'job.started', 'job.failed'])
  })

  it('writes job.canceled on cancel', async () => {
    const { store } = freshStore()
    const ops: string[] = []
    const opsLog = (r: { op: string }) => ops.push(r.op)
    const runner = createQueueRunner({ store, tickMs: 100, opsLog })
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => ({ kind: 'ok' })
    })
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    runner.cancel(id)
    expect(ops).toContain('job.canceled')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- electron/queue/runner.test.ts`
Expected: FAIL — `opsLog` not invoked.

- [ ] **Step 3: Subscribe to `store.events` from inside the runner**

Modify `createQueueRunner` to subscribe at construction:

```ts
export function createQueueRunner(deps: QueueRunnerDeps): QueueRunner {
  // ... existing code ...

  const REASON_TO_OP: Record<string, string> = {
    enqueued: 'job.enqueued',
    running: 'job.started',
    done: 'job.succeeded',
    retry: 'job.retry',
    failed: 'job.failed',
    canceled: 'job.canceled',
    manualRetry: 'job.retry'
  }

  if (deps.opsLog) {
    deps.store.events.on('stateChanged', ({ reason, job }) => {
      const op = REASON_TO_OP[reason]
      if (!op) return
      const path = pickOpsPath(job.kind, job.payload)
      const meta: Record<string, unknown> = {
        kind: job.kind,
        id: job.id,
        attempts: job.attempts
      }
      if (job.lastError) meta.reason = job.lastError
      try {
        deps.opsLog!({ op, path, meta })
      } catch (e) {
        log('warn', 'opsLog write failed', { error: String(e) })
      }
    })
  }

  // ... rest unchanged ...
}

function pickOpsPath(kind: string, payload: Record<string, unknown>): string {
  const p = payload as { path?: unknown; clipId?: unknown }
  if (typeof p.path === 'string') return p.path
  if (kind === 'ai-review-clip' && typeof p.clipId === 'number') return `clip:${p.clipId}`
  return ''
}
```

- [ ] **Step 4: Run the test suite**

Run: `npm test -- electron/queue/runner.test.ts`
Expected: PASS — ops_log events fire as expected.

- [ ] **Step 5: Wire `opsLog.record` in the bootstrap**

Modify `electron/queue/index.ts` so `bootstrapQueueRunner` accepts an `opsLog` argument and passes it through:

```ts
export function bootstrapQueueRunner(
  db: Database.Database,
  opts: {
    opsLog?: (r: { op: string; path: string; meta?: Record<string, unknown> }) => void
  } = {}
): QueueRunner {
  const store = createJobStore(db)
  const runner = createQueueRunner({ store, opsLog: opts.opsLog })
  // ...
}
```

In `electron/main.ts`, when calling `bootstrapQueueRunner`, pass the phase-10 `opsLog.record`:

```ts
import { opsLog } from './services/ops-log' // phase-10 module

  // (where the runner is created)
  queueRunner = bootstrapQueueRunner(dbService.requireCurrent(), {
    opsLog: (r) => opsLog.record(r)
  })
```

> **Note:** if phase-10 named the module differently, fix the import. The functional contract is what matters.

- [ ] **Step 6: Commit**

```bash
git add electron/queue/runner.ts electron/queue/runner.test.ts electron/queue/index.ts electron/main.ts
git commit -m "feat(queue): write job.* events to ops_log on every state change (phase-14 4.1)"
```

---

<!-- openspec-task: 5.1 -->
### Task 8: IPC handlers — `jobs.list / retry / cancel / clearDone`

**Files:**
- Create: `electron/ipc/jobs.ts`
- Create: `electron/ipc/jobs.test.ts`
- Modify: `electron/ipc/handlers.ts`

- [ ] **Step 1: Write the failing test**

```ts
// electron/ipc/jobs.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../services/db/migrations'
import { createJobStore } from '../queue/store'
import { createJobsHandlers } from './jobs'

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'services',
  'db',
  'migrations'
)

function freshStore(): ReturnType<typeof createJobStore> {
  const db = new Database(':memory:')
  runMigrations(db, MIGRATIONS_DIR)
  return createJobStore(db)
}

describe('jobs IPC handlers', () => {
  let store: ReturnType<typeof createJobStore>
  let handlers: ReturnType<typeof createJobsHandlers>
  beforeEach(() => {
    store = freshStore()
    handlers = createJobsHandlers({
      getStore: () => store,
      cancelInRunner: (id) => {
        const job = store.getById(id)
        if (!job) return { error: 'E_NOT_FOUND' }
        if (job.status === 'pending') {
          store.markCanceled(id)
          return { ok: true }
        }
        if (job.status === 'running') {
          store.markCanceled(id)
          return { ok: true }
        }
        return { error: 'E_STATUS_NOT_ALLOWED' }
      }
    })
  })

  it('list returns items + total filtered by status', async () => {
    const a = store.enqueue('index-retry', { path: 'a.md' })
    store.enqueue('index-retry', { path: 'b.md' })
    store.markFailed(a.id, 'oops')
    const r = await handlers.list({ status: 'failed', limit: 50, offset: 0 })
    expect(r.total).toBe(1)
    expect(r.items[0].id).toBe(a.id)
  })

  it('retry on failed → resets attempts to 0 and pendings the job', async () => {
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    store.markRetry(id, 1000, 'EIO') // attempts=1
    store.markFailed(id, 'gave up')
    const r = await handlers.retry(id)
    expect(r).toEqual({ ok: true })
    const j = store.getById(id)!
    expect(j.status).toBe('pending')
    expect(j.attempts).toBe(0)
  })

  it('retry on done → E_STATUS_NOT_ALLOWED', async () => {
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    store.markDone(id)
    const r = await handlers.retry(id)
    expect(r).toEqual({ error: 'E_STATUS_NOT_ALLOWED' })
  })

  it('retry on missing → E_NOT_FOUND', async () => {
    const r = await handlers.retry('nope')
    expect(r).toEqual({ error: 'E_NOT_FOUND' })
  })

  it('cancel pending → ok', async () => {
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    const r = await handlers.cancel(id)
    expect(r).toEqual({ ok: true })
    expect(store.getById(id)?.status).toBe('canceled')
  })

  it('cancel done → E_STATUS_NOT_ALLOWED', async () => {
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    store.markDone(id)
    const r = await handlers.cancel(id)
    expect(r).toEqual({ error: 'E_STATUS_NOT_ALLOWED' })
  })

  it('clearDone removes done rows; preserves failed', async () => {
    const a = store.enqueue('index-retry', { path: 'a.md' })
    const b = store.enqueue('index-retry', { path: 'b.md' })
    const c = store.enqueue('index-retry', { path: 'c.md' })
    store.markDone(a.id)
    store.markDone(b.id)
    store.markFailed(c.id, 'oops')
    const r = await handlers.clearDone()
    expect(r).toEqual({ removed: 2 })
    const remaining = store.list({ limit: 100, offset: 0 })
    expect(remaining.total).toBe(1)
    expect(remaining.items[0].id).toBe(c.id)
  })

  it('list rejects negative limit / offset with IpcError E_INVALID_ARGS', async () => {
    await expect(handlers.list({ limit: -1, offset: 0 })).rejects.toThrow(/E_INVALID_ARGS/)
    await expect(handlers.list({ limit: 50, offset: -1 })).rejects.toThrow(/E_INVALID_ARGS/)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- electron/ipc/jobs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handlers**

Create `electron/ipc/jobs.ts`:

```ts
import { IpcError } from '@shared/ipc-contract'
import type {
  JobsListResult,
  JobsRetryResult,
  JobsCancelResult,
  JobsClearDoneResult,
  JobListFilter
} from '@shared/ipc-contract'
import type { JobStore } from '../queue/store'

export interface JobsHandlerDeps {
  getStore: () => JobStore
  /** Forward cancel through the runner (which handles AbortSignal for running jobs). */
  cancelInRunner: (id: string) => { ok: true } | { error: 'E_NOT_FOUND' | 'E_STATUS_NOT_ALLOWED' }
}

export function createJobsHandlers(deps: JobsHandlerDeps) {
  return {
    async list(filter: JobListFilter): Promise<JobsListResult> {
      if (!Number.isInteger(filter.limit) || filter.limit < 0) {
        throw new IpcError('E_INVALID_ARGS', 'limit must be a non-negative integer')
      }
      if (!Number.isInteger(filter.offset) || filter.offset < 0) {
        throw new IpcError('E_INVALID_ARGS', 'offset must be a non-negative integer')
      }
      return deps.getStore().list(filter)
    },

    async retry(id: string): Promise<JobsRetryResult> {
      if (!id || typeof id !== 'string') {
        throw new IpcError('E_INVALID_ARGS', 'id is required')
      }
      const store = deps.getStore()
      const job = store.getById(id)
      if (!job) return { error: 'E_NOT_FOUND' }
      // Spec: retry on failed → pending; retry on done/pending/running/canceled → not allowed
      if (job.status !== 'failed') return { error: 'E_STATUS_NOT_ALLOWED' }
      store.resetForManualRetry(id)
      return { ok: true }
    },

    async cancel(id: string): Promise<JobsCancelResult> {
      if (!id || typeof id !== 'string') {
        throw new IpcError('E_INVALID_ARGS', 'id is required')
      }
      return deps.cancelInRunner(id)
    },

    async clearDone(): Promise<JobsClearDoneResult> {
      return deps.getStore().clearDone()
    }
  }
}
```

- [ ] **Step 4: Wire into the handler map**

Modify `electron/ipc/handlers.ts`:

```ts
import { createJobsHandlers } from './jobs'
import { getQueueBootstrap } from '../queue'

// Lazy: the bootstrap exists only after a grove is opened.
const jobsHandlersInstance = createJobsHandlers({
  getStore: () => {
    const b = getQueueBootstrap()
    if (!b) throw new IpcError('E_NOT_FOUND', 'no grove opened (queue not initialized)')
    return b.store
  },
  cancelInRunner: (id) => {
    const b = getQueueBootstrap()
    if (!b) return { error: 'E_NOT_FOUND' }
    return b.runner.cancel(id)
  }
})

export const ipcHandlers: HandlerMap = {
  // ... existing entries ...
  jobs: jobsHandlersInstance
}
```

(Add `import { IpcError } from '@shared/ipc-contract'` if not already present.)

- [ ] **Step 5: Run the tests**

Run: `npm test -- electron/ipc/jobs.test.ts`
Expected: PASS — 8 cases.

Run also: `npm run typecheck`
Expected: PASS — the `HandlerMap` type now requires `jobs`, and our entry satisfies it.

- [ ] **Step 6: Commit**

```bash
git add electron/ipc/jobs.ts electron/ipc/jobs.test.ts electron/ipc/handlers.ts
git commit -m "feat(ipc): jobs.list / retry / cancel / clearDone handlers (phase-14 5.1)"
```

---

<!-- openspec-task: 5.2 -->
### Task 9: Preload bridge — `window.api.jobs.*`

**Files:**
- Modify: `preload/preload.ts`

The renderer accesses `jobs.*` via the same `IpcClient<IpcContract>` infrastructure as every other namespace. The `'jobs:changed'` event uses the existing `events.on(...)` API.

- [ ] **Step 1: Modify preload**

In `preload/preload.ts`, find the `request: IpcClient<IpcContract>` literal and add the `jobs` namespace alongside the others:

```ts
  jobs: {
    list: (filter) => invoke('jobs.list', filter),
    retry: (id) => invoke('jobs.retry', id),
    cancel: (id) => invoke('jobs.cancel', id),
    clearDone: () => invoke('jobs.clearDone')
  }
```

The `events.on` API is already generic over `IpcEventChannel`, so `'jobs:changed'` works out of the box for renderers — no preload change needed for events.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `IpcContract['jobs']` is satisfied; no missing methods.

- [ ] **Step 3: Run preload-related tests**

Run: `npm test -- preload`
Expected: PASS (or "no tests" — preload typically has type-test files only).

- [ ] **Step 4: Commit**

```bash
git add preload/preload.ts
git commit -m "feat(preload): expose window.api.jobs.* (phase-14 5.2)"
```

---

<!-- openspec-task: 5.3 -->
### Task 10: Main-process broadcast — `stateChanged` → `jobs:changed` to all renderers

**Files:**
- Modify: `electron/queue/index.ts`
- Modify: `electron/main.ts`

The store emits `stateChanged`; the runner subscribes for ops_log; we now also subscribe at the bootstrap level to fan out to renderer windows.

- [ ] **Step 1: Add a broadcaster wiring inside `bootstrapQueueRunner`**

Modify `electron/queue/index.ts`:

```ts
import { BrowserWindow } from 'electron'

export function bootstrapQueueRunner(
  db: Database.Database,
  opts: {
    opsLog?: (r: { op: string; path: string; meta?: Record<string, unknown> }) => void
    /** If absent, defaults to BrowserWindow.getAllWindows() at emit time. */
    getRenderers?: () => Electron.WebContents[]
  } = {}
): QueueRunner {
  const store = createJobStore(db)
  const runner = createQueueRunner({ store, opsLog: opts.opsLog })

  const getRenderers =
    opts.getRenderers ?? (() => BrowserWindow.getAllWindows().map((w) => w.webContents))

  store.events.on('stateChanged', ({ job }) => {
    for (const wc of getRenderers()) {
      try {
        wc.send('jobs:changed', job)
      } catch {
        /* renderer may have been destroyed; safe to ignore */
      }
    }
  })

  // ... existing register calls ...
  bootstrap = { store, runner }
  return runner
}
```

> **Note:** depending on phase-12 / phase-13 implementations, `electron/queue/index.ts` may already import from `electron`. If `BrowserWindow` cannot be imported from a non-main file (e.g., due to test isolation concerns), pass `getRenderers` from `electron/main.ts` instead and keep the queue module electron-API-free. The default arg keeps tests insulated.

- [ ] **Step 2: Add a test that broadcasts via the dep injection point**

Append to `electron/queue/runner.test.ts` — verifies that the bootstrap-level subscription works (we test it via direct `store.events` subscription, not the BrowserWindow path):

```ts
describe('bootstrapQueueRunner — renderer fan-out', () => {
  it('forwards each stateChanged to the supplied renderers', async () => {
    const db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)
    const sent: Array<[string, unknown]> = []
    const wc = { send: (ch: string, p: unknown) => sent.push([ch, p]) } as unknown as Electron.WebContents
    const { bootstrapQueueRunner } = await import('./index')
    const runner = bootstrapQueueRunner(db, { getRenderers: () => [wc] })
    runner.stop() // we don't need the loop running for this test
    const { store } = (await import('./index')).getQueueBootstrap()!
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    expect(sent.length).toBeGreaterThanOrEqual(1)
    expect(sent[0][0]).toBe('jobs:changed')
    expect((sent[0][1] as { id: string }).id).toBe(id)
    db.close()
  })
})
```

> **Note on test isolation:** `bootstrap` is module-scoped; if other tests in the file have already called `bootstrapQueueRunner`, the call here will reuse it. If the test file fails for that reason, export `__resetBootstrap()` from `electron/queue/index.ts` and call it in `beforeEach`. The simpler fix is to put this test in a new file `electron/queue/index.test.ts`.

- [ ] **Step 3: Run the tests**

Run: `npm test -- electron/queue`
Expected: PASS.

- [ ] **Step 4: Manual smoke (if `npm run dev` is feasible)**

1. Open the app + a grove.
2. Open devtools in the renderer and run:
   ```js
   window.api.on('jobs:changed', (j) => console.log('JOB CHANGED', j))
   await window.api.jobs.list({ limit: 50, offset: 0 })
   ```
3. From the main process console (or by triggering a clip / index-retry), confirm `JOB CHANGED { id, status: 'pending', ... }` is logged.

- [ ] **Step 5: Commit**

```bash
git add electron/queue/index.ts electron/queue/runner.test.ts electron/main.ts
git commit -m "feat(queue): broadcast jobs:changed to all renderer windows (phase-14 5.3)"
```

---

## Self-Review Checklist (before handing off to Plan 3)

- [ ] `npm test -- electron/queue/ electron/ipc/jobs.test.ts` is green.
- [ ] `npm run typecheck` is green.
- [ ] `register({ kind: 'index-retry', ... })` and `register({ kind: 'ai-review-clip', ... })` are both called by `bootstrapQueueRunner`.
- [ ] `before-quit` calls `runner.drainOnQuit(5_000)` and there is exactly one `app.on('before-quit')` listener that handles the queue.
- [ ] `nextDelay` is the single source of truth for backoff — no other file hardcodes the delay table.
- [ ] `cancel(running id)` writes `markCanceled` **before** firing `controller.abort()` so `settle` sees the cancel state.
- [ ] `'jobs:changed'` sends the **fresh** Job (with `__dedupe` stripped) — verified by Plan 1 store tests + the broadcast test here.
- [ ] `ops_log` is written for `enqueued / started / succeeded / retry / failed / canceled`. `manualRetry` (IPC `jobs.retry`) maps to `job.retry`.
- [ ] Every Task heading is preceded by `<!-- openspec-task: LABEL -->` matching tasks.md labels: `3.1`, `3.2`, `3.3`, `3.4`, `3.5`, `3.6`, `4.1`, `5.1`, `5.2`, `5.3`.

Plan 3 (`tasks-6.1-9.1`) builds the renderer UI (History.tsx 4-tab layout + JobsTab + row buttons), rewires phase-12 pipeline + phase-5 indexer to call `jobs.enqueue`, and adds i18n keys.
