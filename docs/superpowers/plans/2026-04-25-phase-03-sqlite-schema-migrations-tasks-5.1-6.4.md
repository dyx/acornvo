# Phase 03 — SQLite Schema & Migrations: Plan 4 (Grove Lifecycle + IPC)

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-03-sqlite-schema-migrations`
> **Task range:** OpenSpec tasks `5.1`–`6.4` (9 tasks)
> **Plan order:** 4 of 5. **Depends on Plans 1–3.**
> **Status:** Not started
> **Created:** 2026-04-25

---

## Goal

Wire `dbService` (Plan 3) into the existing grove lifecycle (`services/grove.ts`, `main.ts`) and expose the minimal IPC surface (`db.version`, `db.integrityCheck` + the `db:rebuilding` / `db:rebuilt` events).

## Architecture

- **Two integration points for db open/close in grove flow.**
  1. `services/grove.openGrove`: synchronous, inline call to `dbService.openForGrove(path)` immediately *before* `notifyChange(toSummary(grove))`. This guarantees the renderer never sees `project:changed` with no db ready.
  2. `electron/main.ts`: a defensive `groveService.onChange` subscriber that calls `dbService.openForGrove` on a non-null path (idempotent: skipped if `dbService.getCurrentGrovePath() === payload.path`) and `dbService.closeCurrent` on null. This catches future code paths that emit `project:changed` outside `openGrove`.
- **Failure rollback in `openGrove`.** If `dbService.openForGrove` throws, release the lock, do NOT update `last_opened_at` (already written before this point — see note in Task 2), do NOT register `currentGrove`, propagate the error so the IPC layer returns `E_INTERNAL`.
- **`closeGrove`** calls `dbService.closeCurrent()` *before* `lockfile.release(path)` so the wal_checkpoint runs while the lock is still held (avoids racing with another process that opens the grove during teardown).
- **`app.on('will-quit')`** in `main.ts` already calls `groveService.closeGrove()` which (after Task 3 here) cascades `dbService.closeCurrent()`. The OpenSpec task 5.4 asks for a *defensive* additional call directly to `dbService.closeCurrent()` — for the case where no grove is open but a stray db handle still exists (shouldn't happen, but the cost of the safety net is one line).
- **IPC.** Add a `db` namespace to `IpcContract` (`version`, `integrityCheck`). Both delegate to `dbService.requireCurrent()` → `IpcError('E_NOT_FOUND')` is auto-converted by `ipc/router.ts` into `{ ok: false, error: { code: 'E_NOT_FOUND', ... } }`. Add event channels `db:rebuilding` and `db:rebuilt` to `IpcEventContract` (already broadcast from `db.ts` Plan 3 task 4.4); the preload `on` API is generic and picks them up automatically.

## Tech Stack

- Existing IPC scaffold: `electron/ipc/router.ts`, `handlers.ts`, `project.ts`, `shared/ipc-contract.ts`, `preload/preload.ts`, `src/ipc/client.ts`

## Files Touched

| Path | Action | Owner task |
|---|---|---|
| `electron/services/grove.ts` | Modify (insert dbService calls in openGrove + closeGrove) | 5.1, 5.2, 5.3 |
| `electron/main.ts` | Modify (defensive will-quit + project:changed subscriber) | 5.4, 5.5 |
| `shared/ipc-contract.ts` | Modify (add `db` namespace + event channels) | 6.1, 6.2 |
| `electron/ipc/db.ts` | Create | 6.3 |
| `electron/ipc/handlers.ts` | Modify (register `db` namespace) | 6.3 |
| `preload/preload.ts` | Modify (add `db` to request client) | 6.4 |
| `src/ipc/client.ts` | Modify only if needed (the type-derives from IpcContract should auto-update) | 6.4 |
| `electron/services/grove.test.ts` (or new) | Create / extend | 5.1, 5.2, 5.3 |

---

## Tasks

<!-- openspec-task: 5.1 -->
### Task 1: `openGrove` calls `dbService.openForGrove` inline

**Files:**
- Modify: `electron/services/grove.ts` (around line 251, just before `notifyChange`)

- [ ] **Step 1: Read the current `openGrove` implementation**

```bash
sed -n '204,254p' electron/services/grove.ts
```

Confirm the structure: `pathExists` → release-other-lock → `lockfile.acquire` → `initialize` → `atomicWriteJson` (last_opened_at refresh) → register `currentGrove` → recent upsert → `notifyChange` → return.

- [ ] **Step 2: Write a failing integration test**

Create or extend `electron/services/grove.test.ts` (skip if a test file already exists in the project — extend it). Minimal scaffold below:

```ts
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as grove from './grove'
import { dbService, __resetForTest as resetDb } from './db'

describe('grove.openGrove + db integration', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'grove-db-'))
  })
  afterEach(async () => {
    await grove.closeGrove().catch(() => {
      /* ignore */
    })
    resetDb()
    rmSync(dir, { recursive: true, force: true })
  })

  it('opens the grove db immediately as part of openGrove', async () => {
    const r = await grove.openGrove(dir)
    expect(r.status).toBe('opened')
    expect(existsSync(join(dir, '.acornvo', 'index.db'))).toBe(true)
    expect(dbService.getCurrent()).not.toBeNull()
    expect(dbService.getCurrentGrovePath()).toBe(dir)
  })
})
```

- [ ] **Step 3: Run — FAIL** (db is not opened anywhere yet from grove.ts)

```bash
npx vitest run electron/services/grove.test.ts
```

- [ ] **Step 4: Insert the inline call**

In `electron/services/grove.ts`, locate the block:

```ts
  notifyChange(toSummary(grove))
  logger.info('grove opened', { grove: path, id: grove.id })
  return { status: 'opened', grove: toSummary(grove) }
```

Insert *before* `notifyChange`:

```ts
  // Open the per-grove SQLite db before broadcasting project:changed.
  const { dbService } = await import('./db')
  dbService.openForGrove(path)

  notifyChange(toSummary(grove))
```

(Lazy `await import('./db')` mirrors the existing lazy `recent` import a few lines above and keeps the module load order safe.)

- [ ] **Step 5: Run — GREEN**

- [ ] **Step 6: Commit**

```bash
git add electron/services/grove.ts electron/services/grove.test.ts
git commit -m "feat(phase-03): openGrove opens dbService.openForGrove inline before broadcast"
```

---

<!-- openspec-task: 5.2 -->
### Task 2: Failure rollback — release lock, no last_opened_at update, return E_INTERNAL

**Files:**
- Modify: `electron/services/grove.ts`
- Modify: `electron/services/grove.test.ts`

> **Note:** The current `openGrove` updates `last_opened_at` (`atomicWriteJson(...refreshed)`) *before* calling `dbService.openForGrove`. To satisfy "do NOT update last_opened_at on db failure", we need to **reorder**: lock + initialize + db open + (only then) write `last_opened_at` + register currentGrove + recent upsert.
>
> If db open fails → lock released → `last_opened_at` NOT touched → currentGrove NOT set → recent NOT updated → throw → IPC returns `E_INTERNAL`.

- [ ] **Step 1: Write failing test for rollback**

Append to `electron/services/grove.test.ts`:

```ts
import { vi } from 'vitest'

describe('grove.openGrove rollback on db failure', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'grove-fail-'))
  })
  afterEach(async () => {
    await grove.closeGrove().catch(() => {
      /* ignore */
    })
    resetDb()
    vi.restoreAllMocks()
    rmSync(dir, { recursive: true, force: true })
  })

  it('releases the lock + does not register currentGrove when db open throws', async () => {
    // Force dbService.openForGrove to throw on first call.
    const dbModule = await import('./db')
    vi.spyOn(dbModule.dbService, 'openForGrove').mockImplementation(() => {
      throw new Error('boom')
    })

    let caught: unknown
    try {
      await grove.openGrove(dir)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeTruthy()
    expect(grove.getCurrent()).toBeNull()
    // The grove path should NOT show as "locked" — lock was released.
    const lockfile = await import('./lockfile')
    const probe = await lockfile.acquire(dir, {})
    expect(probe.status).toBe('acquired')
    await lockfile.release(dir)
  })

  it('does not bump last_opened_at on db failure', async () => {
    // First, successful open to seed last_opened_at.
    const r = await grove.openGrove(dir)
    expect(r.status).toBe('opened')
    const projectFile = join(dir, '.acornvo', 'project.json')
    const before = JSON.parse(require('node:fs').readFileSync(projectFile, 'utf8')).last_opened_at as string
    await grove.closeGrove()

    // Mock dbService to throw on next open.
    const dbModule = await import('./db')
    vi.spyOn(dbModule.dbService, 'openForGrove').mockImplementation(() => {
      throw new Error('boom')
    })

    await grove.openGrove(dir).catch(() => undefined)

    const after = JSON.parse(require('node:fs').readFileSync(projectFile, 'utf8')).last_opened_at as string
    expect(after).toBe(before)
  })
})
```

- [ ] **Step 2: Run — FAIL** (current order writes last_opened_at first; lock probably leaked)

- [ ] **Step 3: Reorder + add try/catch in `openGrove`**

Replace the body of `openGrove` after `lockfile.acquire`:

```ts
  const lockResult = await lockfile.acquire(path, { force: opts.force })
  if (lockResult.status === 'held') {
    return { status: 'locked', holder: lockResult.holder as LockInfo }
  }

  try {
    const initResult = await initialize(path)

    // Open db BEFORE bumping last_opened_at — failure rolls back cleanly.
    const { dbService } = await import('./db')
    dbService.openForGrove(path)

    const now = new Date().toISOString()
    const refreshed: ProjectJson = { ...initResult.project, last_opened_at: now }
    await atomicWriteJson(groveProjectFile(path), refreshed)

    const grove = toGrove(path, refreshed)
    currentGrove = grove

    const recent = await import('./recent')
    await recent.upsertToTop({
      id: grove.id,
      path: grove.path,
      name: grove.name,
      color: grove.color,
      pinned: false,
      last_opened_at: now,
      files_count: 0
    })

    if (initResult.syncProvider) {
      logger.warn('grove on cloud-sync path', {
        grove: path,
        provider: initResult.syncProvider
      })
    }

    notifyChange(toSummary(grove))
    logger.info('grove opened', { grove: path, id: grove.id })
    return { status: 'opened', grove: toSummary(grove) }
  } catch (err) {
    // Best-effort cleanup: close any partially-opened db, release lock.
    try {
      const { dbService } = await import('./db')
      dbService.closeCurrent()
    } catch {
      /* ignore */
    }
    await lockfile.release(path).catch(() => {
      /* ignore */
    })
    logger.error('openGrove failed', {
      grove: path,
      message: err instanceof Error ? err.message : String(err)
    })
    throw err
  }
```

(Delete the now-duplicated lazy import + inline `dbService.openForGrove` from Task 1 — the new code path consolidates them inside the try/catch.)

- [ ] **Step 4: Run — GREEN**

- [ ] **Step 5: Verify the IPC error mapping by inspection**

`electron/ipc/router.ts:65` already maps a non-`IpcError` to `{ code: 'E_INTERNAL', ... }`. So a thrown `Error('boom')` from db open → router wraps → renderer sees `E_INTERNAL`. No additional change needed.

- [ ] **Step 6: Commit**

```bash
git add electron/services/grove.ts electron/services/grove.test.ts
git commit -m "feat(phase-03): openGrove rolls back lock + last_opened_at on db failure"
```

---

<!-- openspec-task: 5.3 -->
### Task 3: `closeGrove` calls `dbService.closeCurrent` first

**Files:**
- Modify: `electron/services/grove.ts`
- Modify: `electron/services/grove.test.ts`

- [ ] **Step 1: Write failing test**

Append to `electron/services/grove.test.ts`:

```ts
describe('grove.closeGrove + db integration', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'grove-close-'))
  })
  afterEach(() => {
    resetDb()
    rmSync(dir, { recursive: true, force: true })
  })

  it('closes the db before releasing the lock', async () => {
    await grove.openGrove(dir)
    expect(dbService.getCurrent()).not.toBeNull()
    await grove.closeGrove()
    expect(dbService.getCurrent()).toBeNull()
    expect(grove.getCurrent()).toBeNull()
  })

  it('is idempotent — calling closeGrove twice does not throw', async () => {
    await grove.openGrove(dir)
    await grove.closeGrove()
    await expect(grove.closeGrove()).resolves.not.toThrow()
  })
})
```

- [ ] **Step 2: Run — FAIL** (db is not closed by closeGrove yet)

- [ ] **Step 3: Modify `closeGrove`**

Replace the body:

```ts
export async function closeGrove(): Promise<void> {
  if (!currentGrove) return
  const path = currentGrove.path
  currentGrove = null
  try {
    const { dbService } = await import('./db')
    dbService.closeCurrent()
  } catch (err) {
    logger.error('dbService.closeCurrent during closeGrove failed', {
      grove: path,
      message: err instanceof Error ? err.message : String(err)
    })
  }
  await lockfile.release(path)
  notifyChange(null)
  logger.info('grove closed', { grove: path })
}
```

- [ ] **Step 4: Run — GREEN**

- [ ] **Step 5: Commit**

```bash
git add electron/services/grove.ts electron/services/grove.test.ts
git commit -m "feat(phase-03): closeGrove closes db before releasing lock"
```

---

<!-- openspec-task: 5.4 -->
### Task 4: Defensive `dbService.closeCurrent` on `app.on('will-quit')`

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Read the current will-quit handler**

```bash
sed -n '69,76p' electron/main.ts
```

Expected: a `groveService.closeGrove()` call already exists.

- [ ] **Step 2: Add a defensive `dbService.closeCurrent` call**

In `electron/main.ts`, after the existing `app.on('will-quit', () => { void groveService.closeGrove()... })` block, add:

```ts
  app.on('will-quit', () => {
    try {
      // Defensive: closeGrove cascades to closeCurrent, but also handle the
      // "no grove open but stray db handle" edge case.
      const { dbService } = require('./services/db') as typeof import('./services/db')
      dbService.closeCurrent()
    } catch (err) {
      logger.error('db close on will-quit failed', {
        message: err instanceof Error ? err.message : String(err)
      })
    }
  })
```

(Using `require` here mirrors the existing late-import pattern — the module is already loaded by then, this is a synchronous lookup.)

- [ ] **Step 3: Verify by manual run**

```bash
npm run dev
# Open a grove, then close the app via Cmd-Q.
# Check the log for:
#   - "grove closed" (from closeGrove)
#   - no "db close on will-quit failed" error
```

This is a manual smoke step — automated coverage of `app.on('will-quit')` requires Spectron-style integration tests not in scope.

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts
git commit -m "feat(phase-03): defensive dbService.closeCurrent on will-quit"
```

---

<!-- openspec-task: 5.5 -->
### Task 5: Subscribe `project:changed` in `main.ts` for db open/close idempotency

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Read main.ts bootstrap**

```bash
sed -n '62,82p' electron/main.ts
```

Note that `installGroveBroadcaster()` already wires `groveService.onChange` → `webContents.send('project:changed', ...)`. We add a *second* subscriber for db lifecycle.

- [ ] **Step 2: Add the db subscriber inside `bootstrap`**

In `electron/main.ts`, after `const disposeBroadcaster = installGroveBroadcaster()` add:

```ts
  const disposeDbSubscriber = groveService.onChange((payload) => {
    try {
      // Lazy require to avoid circular import surprises at module load.
      const { dbService } = require('./services/db') as typeof import('./services/db')
      if (payload === null) {
        dbService.closeCurrent()
      } else if (dbService.getCurrentGrovePath() !== payload.path) {
        // Idempotent: openGrove (Task 1) already opened the db inline; this is
        // the catch-all for future code paths that change the project without
        // going through openGrove.
        dbService.openForGrove(payload.path)
      }
    } catch (err) {
      logger.error('db subscriber failed on project:changed', {
        message: err instanceof Error ? err.message : String(err)
      })
    }
  })
  app.on('will-quit', disposeDbSubscriber)
```

- [ ] **Step 3: Manual verification**

```bash
npm run dev
# Open Grove A → DevTools console: window.api.db.version() → { user_version: 1, ... }
# (Plan 5 covers the full smoke; here we just sanity-check no startup error.)
```

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts
git commit -m "feat(phase-03): main.ts subscribes project:changed for idempotent db open/close"
```

---

<!-- openspec-task: 6.1 -->
### Task 6: Add `db` namespace to `IpcContract`

**Files:**
- Modify: `shared/ipc-contract.ts`

- [ ] **Step 1: Read the current contract**

```bash
sed -n '50,72p' shared/ipc-contract.ts
```

- [ ] **Step 2: Add the `db` namespace**

In `shared/ipc-contract.ts`, append to the `IpcContract` type:

```ts
export type DbVersionInfo = {
  user_version: number
  migrations_applied: string[]
}

export type IpcContract = {
  ping: { /* unchanged */ }
  log: { /* unchanged */ }
  project: { /* unchanged */ }
  db: {
    version: () => DbVersionInfo
    integrityCheck: () => string
  }
}
```

(Be sure to leave the existing namespaces intact; only the `db` block is new. Also export `DbVersionInfo`.)

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: now FAILS in `electron/ipc/handlers.ts` (the `HandlerMap` is missing `db`) and `preload/preload.ts` (`request` is missing `db`). That is intended — Tasks 6.3 / 6.4 fix it. Do not commit yet; chain through.

> **For convenience, you may temporarily add stub `db: {} as never` shims and commit. But the cleanest path is to land Tasks 6.1 → 6.3 → 6.4 in one commit each, with typecheck failing in between. The CI gate is the final commit, and that's the one we run typecheck against. We commit incrementally for review history.**

- [ ] **Step 4: Commit (typecheck still failing — that's OK between tasks 6.1 and 6.3/6.4)**

```bash
git add shared/ipc-contract.ts
git commit -m "feat(phase-03): add db namespace + DbVersionInfo to IpcContract"
```

---

<!-- openspec-task: 6.2 -->
### Task 7: Add `db:rebuilding` / `db:rebuilt` event channels

**Files:**
- Modify: `shared/ipc-contract.ts`

- [ ] **Step 1: Add to `IpcEventContract`**

In `shared/ipc-contract.ts`:

```ts
export type IpcEventContract = {
  'project:changed': GroveSummary | null
  'bootstrap:ready': {
    initialRoute: '/picker' | '/library'
    recent: RecentItemView[]
    locked?: { path: string; holder: LockInfo }
  }
  'db:rebuilding': void
  'db:rebuilt': void
}
```

- [ ] **Step 2: Verify the preload `on` API picks them up automatically**

```bash
sed -n '40,52p' preload/preload.ts
```

The `events.on<K extends IpcEventChannel>` is generic — no preload changes needed for the new channels.

- [ ] **Step 3: Typecheck (will still fail on missing `db` handlers / preload — addressed in 6.3 / 6.4)**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add shared/ipc-contract.ts
git commit -m "feat(phase-03): declare db:rebuilding / db:rebuilt event channels"
```

---

<!-- openspec-task: 6.3 -->
### Task 8: `electron/ipc/db.ts` handlers + register

**Files:**
- Create: `electron/ipc/db.ts`
- Modify: `electron/ipc/handlers.ts`

- [ ] **Step 1: Create the handlers module**

Create `electron/ipc/db.ts`:

```ts
import type { IpcContract, DbVersionInfo } from '@shared/ipc-contract'
import { dbService } from '../services/db'
import { listApplied } from '../services/db/migrations'
import { migrationsDir } from '../services/db/migrations/index'
import { integrityCheck as runIntegrityCheck } from '../services/db'

type DbHandlers = {
  [M in keyof IpcContract['db']]: IpcContract['db'][M] extends (...args: infer A) => infer R
    ? (...args: A) => R | Promise<Awaited<R>>
    : never
}

function version(): DbVersionInfo {
  const db = dbService.requireCurrent()
  return listApplied(db, migrationsDir())
}

function integrityCheck(): string {
  const db = dbService.requireCurrent()
  return runIntegrityCheck(db)
}

export const dbHandlers = {
  version,
  integrityCheck
} satisfies DbHandlers
```

- [ ] **Step 2: Register in `handlers.ts`**

Edit `electron/ipc/handlers.ts`:

```ts
import { dbHandlers } from './db'
// ...
export const ipcHandlers: HandlerMap = {
  ping: { /* unchanged */ },
  log: { /* unchanged */ },
  project: projectHandlers,
  db: dbHandlers
}
```

- [ ] **Step 3: Typecheck — should now pass for the main side**

```bash
npm run typecheck
```

If it fails on `preload/preload.ts`, that's the next task.

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/db.ts electron/ipc/handlers.ts
git commit -m "feat(phase-03): db.version + db.integrityCheck handlers, registered"
```

---

<!-- openspec-task: 6.4 -->
### Task 9: Renderer client typings + preload wiring

**Files:**
- Modify: `preload/preload.ts`
- Modify: `src/ipc/client.ts` (verification only — should compile without changes)

- [ ] **Step 1: Add `db` to the preload `request` client**

In `preload/preload.ts`, add to the `request` object:

```ts
const request: IpcClient<IpcContract> = {
  ping: { /* unchanged */ },
  log: { /* unchanged */ },
  project: { /* unchanged */ },
  db: {
    version: () => invoke('db.version'),
    integrityCheck: () => invoke('db.integrityCheck')
  }
}
```

- [ ] **Step 2: Verify renderer client types**

`src/ipc/client.ts` derives from `IpcClient<IpcContract>`, so the `db` namespace appears automatically on `ipc.db.*`. No edit needed — but verify:

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Verify event channel types**

In a renderer file (e.g., open `src/App.tsx` in your editor), confirm autocomplete on `ipc.on('db:rebuil...` works without manual typing additions. If TS complains, the issue is in `IpcEventContract` (Task 7) — re-check.

- [ ] **Step 4: Run dev to smoke-check the wiring**

```bash
npm run dev
# In DevTools:
#   window.api.db.version()        → Promise resolving to { user_version: 1, migrations_applied: [...] }
#   window.api.db.integrityCheck() → Promise resolving to 'ok'
```

If `window.api.db` is `undefined`, the preload didn't pick up the change — kill `npm run dev` and restart.

- [ ] **Step 5: Run the full suite + typecheck**

```bash
npm test
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add preload/preload.ts
git commit -m "feat(phase-03): preload wires db.version / db.integrityCheck"
```

---

## Plan 4 Verification Checklist

- [ ] `services/grove.openGrove` opens the db before broadcasting `project:changed`
- [ ] `services/grove.openGrove` rolls back lock + does not bump `last_opened_at` if db open throws
- [ ] `services/grove.closeGrove` closes the db **before** releasing the lock
- [ ] `app.on('will-quit')` defensively calls `dbService.closeCurrent()`
- [ ] `electron/main.ts` subscribes to `groveService.onChange` and idempotently opens/closes the db
- [ ] `shared/ipc-contract.ts` declares `db` namespace + `db:rebuilding` / `db:rebuilt` events
- [ ] `electron/ipc/db.ts` exports `dbHandlers` (version, integrityCheck), registered in `ipcHandlers`
- [ ] `preload/preload.ts` exposes `db.version` and `db.integrityCheck` via `invoke`
- [ ] `npm run typecheck` clean; `npm test` green
- [ ] Manual: `npm run dev` → open grove → DevTools `window.api.db.version()` returns `{ user_version: 1, migrations_applied: ['001_init.sql'] }`

When all boxes are checked, mark OpenSpec tasks 5.1–6.4 done and proceed to Plan 5 (`tasks-7.1-8.8` — renderer UX + acceptance).
