# Phase 03 — SQLite Schema & Migrations: Plan 3 (`db.ts` Service Singleton)

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-03-sqlite-schema-migrations`
> **Task range:** OpenSpec tasks `4.1`–`4.8` (8 tasks)
> **Plan order:** 3 of 5. **Depends on Plans 1 + 2** (migrations runner + 001_init.sql must exist).
> **Status:** Not started
> **Created:** 2026-04-25

---

## Goal

Build `electron/services/db.ts`: a module-scoped singleton that owns the per-grove SQLite handle. It applies pragmas, runs `integrity_check`, recovers from corruption (rename + rebuild empty), runs migrations, and exposes `dbService` to the rest of the main process.

## Architecture

- **Module-scoped state.** Two private variables: `current: Database.Database | null` and `currentGrovePath: string | null`. No DI; this is the singleton everyone reads from. The `dbService` export is just a typed object pointing at the module functions — same pattern as `services/grove.ts`'s `currentGrove`.
- **Lifecycle.** `openForGrove(path)` orchestrates: `closeCurrent()` → `mkdir .acornvo` (defensive; phase 2 already does this) → `new Database(...)` → `applyPragmas` → `integrityCheck` → if not `'ok'` → `backupAndRebuild` → `runMigrations` → register `current/currentGrovePath`.
- **Corruption recovery.** `backupAndRebuild` does **not** itself open a db; it (1) closes any open handle, (2) renames `index.db*` → `index.db.corrupt-<ISO ts>*`, (3) emits `db:rebuilding` on `mainWindow.webContents`, (4) returns. The caller (`openForGrove`) then proceeds with a fresh `new Database` + migrations on the now-empty path. After migrations succeed, `db:rebuilt` is emitted.
- **Webcontents access.** Use a small late-binding helper `getMainWindow()` that imports `./main` lazily, mirroring the existing `services/recent.ts` lazy-import pattern in `grove.ts:233`. This avoids circular import issues at module load.
- **Tests.** Use `tmpdir()` for an on-disk grove path so we can exercise rename + WAL files. Mock or stub `getMainWindow` for the rebuild test (we'll inject a setter `__setMainWindowForTest`). UI tests are deferred to Plan 5 manual smoke (8.5).

## Tech Stack

- `better-sqlite3` (Plan 1)
- `node:fs/promises` for renames
- vitest with on-disk tmp dirs

## Files Touched

| Path                                       | Action | Owner task                                      |
| ------------------------------------------ | ------ | ----------------------------------------------- |
| `electron/services/db.ts`                  | Create | 4.1–4.8                                         |
| `electron/services/db.test.ts`             | Create | 4.2–4.7                                         |
| `electron/services/db/migrations/index.ts` | Create | 4.5 (helper for migrations dir path resolution) |

---

## Tasks

<!-- openspec-task: 4.1 -->

### Task 1: Module skeleton + private state

**Files:**

- Create: `electron/services/db.ts`

- [ ] **Step 1: Create the file with module-scoped state and a stub export**

```ts
// electron/services/db.ts
import type Database from 'better-sqlite3'

let current: Database.Database | null = null
let currentGrovePath: string | null = null

export function getCurrent(): Database.Database | null {
  return current
}

// Stubs (filled in by later tasks)
export const dbService = {
  getCurrent
}

// Test-only escape hatch — removed in production builds via tree-shaking when unused.
export function __resetForTest(): void {
  if (current) {
    try {
      current.close()
    } catch {
      /* ignore */
    }
  }
  current = null
  currentGrovePath = null
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add electron/services/db.ts
git commit -m "feat(phase-03): db.ts skeleton with module-scoped current/currentGrovePath"
```

---

<!-- openspec-task: 4.2 -->

### Task 2: `applyPragmas(db)` — RED then GREEN

**Files:**

- Create: `electron/services/db.test.ts`
- Modify: `electron/services/db.ts`

- [ ] **Step 1: Write failing test**

Create `electron/services/db.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyPragmas } from './db'

describe('applyPragmas', () => {
  let dir: string
  let db: Database.Database
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'db-prg-'))
    db = new Database(join(dir, 'test.db'))
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('sets WAL / synchronous=NORMAL / foreign_keys=ON / busy_timeout=5000 / temp_store=MEMORY', () => {
    applyPragmas(db)
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(db.pragma('synchronous', { simple: true })).toBe(1) // NORMAL = 1
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(db.pragma('busy_timeout', { simple: true })).toBe(5000)
    expect(db.pragma('temp_store', { simple: true })).toBe(2) // MEMORY = 2
    // cache_size negative = KiB; -20000 = 20 MB
    expect(db.pragma('cache_size', { simple: true })).toBe(-20000)
    // mmap_size returned in bytes
    expect(db.pragma('mmap_size', { simple: true })).toBe(268435456)
  })
})
```

- [ ] **Step 2: Run — FAIL**

```bash
npx vitest run electron/services/db.test.ts
```

Expected: `applyPragmas is not a function`.

- [ ] **Step 3: Implement**

Append to `electron/services/db.ts`:

```ts
export function applyPragmas(db: Database.Database): void {
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.pragma('temp_store = MEMORY')
  db.pragma('cache_size = -20000')
  db.pragma('mmap_size = 268435456')
}
```

- [ ] **Step 4: Run — GREEN**

- [ ] **Step 5: Commit**

```bash
git add electron/services/db.ts electron/services/db.test.ts
git commit -m "feat(phase-03): applyPragmas configures WAL + perf knobs"
```

---

<!-- openspec-task: 4.3 -->

### Task 3: `integrityCheck(db)` — returns `'ok'` or error string

**Files:**

- Modify: `electron/services/db.ts`
- Modify: `electron/services/db.test.ts`

- [ ] **Step 1: Write failing test**

Append to `electron/services/db.test.ts`:

```ts
import { integrityCheck } from './db'

describe('integrityCheck', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'db-ic-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns "ok" on a healthy db', () => {
    const db = new Database(join(dir, 'h.db'))
    expect(integrityCheck(db)).toBe('ok')
    db.close()
  })

  // Note: forging a corrupt-in-memory db is non-trivial. We rely on the on-disk
  // smoke check in Plan 5 (Task 8.5) for the corrupt-path coverage. Here we just
  // verify the contract: a non-'ok' result is returned as a string.
  it('returns a string for any result', () => {
    const db = new Database(join(dir, 'h2.db'))
    const result = integrityCheck(db)
    expect(typeof result).toBe('string')
    db.close()
  })
})
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

Append to `electron/services/db.ts`:

```ts
export function integrityCheck(db: Database.Database): string {
  const r = db.pragma('integrity_check', { simple: true }) as string
  return r
}
```

- [ ] **Step 4: Run — GREEN**

- [ ] **Step 5: Commit**

```bash
git add electron/services/db.ts electron/services/db.test.ts
git commit -m "feat(phase-03): integrityCheck wraps PRAGMA integrity_check"
```

---

<!-- openspec-task: 4.4 -->

### Task 4: `backupAndRebuild(grovePath)` — rename + emit IPC events

**Files:**

- Modify: `electron/services/db.ts`
- Modify: `electron/services/db.test.ts`

> **Important:** This task implements the **rename + emit** primitive. It deliberately does NOT itself open a fresh db — that is `openForGrove`'s responsibility. The two compose in Task 5.

- [ ] **Step 1: Write failing test (rename behavior + late-bound webContents)**

Append to `electron/services/db.test.ts`:

```ts
import { existsSync, writeFileSync, readdirSync } from 'node:fs'
import { backupCorruptDb, __setMainWindowForTest } from './db'

describe('backupCorruptDb', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'db-bk-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    __setMainWindowForTest(null)
  })

  it('renames index.db + sidecars to index.db.corrupt-<ts>* and emits db:rebuilding', () => {
    // Set up a fake "db" file plus -wal / -shm sidecars
    const acorn = join(dir, '.acornvo')
    require('node:fs').mkdirSync(acorn, { recursive: true })
    writeFileSync(join(acorn, 'index.db'), 'garbage')
    writeFileSync(join(acorn, 'index.db-wal'), 'wal')
    writeFileSync(join(acorn, 'index.db-shm'), 'shm')

    const sent: Array<{ channel: string; payload?: unknown }> = []
    __setMainWindowForTest({
      webContents: { send: (channel: string, payload?: unknown) => sent.push({ channel, payload }) }
    } as unknown as { webContents: { send: (c: string, p?: unknown) => void } })

    backupCorruptDb(dir)

    const left = readdirSync(acorn)
    expect(left.some((n) => n === 'index.db')).toBe(false)
    expect(left.some((n) => /^index\.db\.corrupt-.+$/.test(n))).toBe(true)
    expect(left.some((n) => /^index\.db\.corrupt-.+-wal$/.test(n))).toBe(true)
    expect(left.some((n) => /^index\.db\.corrupt-.+-shm$/.test(n))).toBe(true)
    expect(sent.find((e) => e.channel === 'db:rebuilding')).toBeTruthy()
  })

  it('is a no-op (does not throw) when index.db does not exist', () => {
    const acorn = join(dir, '.acornvo')
    require('node:fs').mkdirSync(acorn, { recursive: true })
    expect(() => backupCorruptDb(dir)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `backupCorruptDb` + the late-bound mainWindow getter**

Append to `electron/services/db.ts`:

```ts
import { renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'

type WindowLike = { webContents: { send: (channel: string, payload?: unknown) => void } }

let mainWindowForTest: WindowLike | null = null
export function __setMainWindowForTest(win: WindowLike | null): void {
  mainWindowForTest = win
}

function getMainWindow(): WindowLike | null {
  if (mainWindowForTest) return mainWindowForTest
  // Late require to avoid circular import with ./main (which imports this module via grove integration).
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const main = require('../main') as { mainWindow: WindowLike | null }
    return main.mainWindow ?? null
  } catch {
    return null
  }
}

function emit(channel: 'db:rebuilding' | 'db:rebuilt'): void {
  const win = getMainWindow()
  try {
    win?.webContents.send(channel)
  } catch {
    /* renderer may have been destroyed; safe to ignore */
  }
}

export function backupCorruptDb(grovePath: string): void {
  const acorn = join(grovePath, '.acornvo')
  const base = join(acorn, 'index.db')
  if (!existsSync(base)) return
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  for (const suffix of ['', '-wal', '-shm']) {
    const src = base + suffix
    if (existsSync(src)) {
      const dst = join(acorn, `index.db.corrupt-${stamp}${suffix}`)
      renameSync(src, dst)
    }
  }
  emit('db:rebuilding')
}

export function emitRebuilt(): void {
  emit('db:rebuilt')
}
```

- [ ] **Step 4: Run — GREEN**

- [ ] **Step 5: Commit**

```bash
git add electron/services/db.ts electron/services/db.test.ts
git commit -m "feat(phase-03): backupCorruptDb renames index.db* + emits db:rebuilding"
```

---

<!-- openspec-task: 4.5 -->

### Task 5: `openForGrove(grovePath)` — full pipeline

**Files:**

- Create: `electron/services/db/migrations/index.ts` (helper to resolve migrations dir from inside the bundled main)
- Modify: `electron/services/db.ts`
- Modify: `electron/services/db.test.ts`

> **Why a separate `migrations/index.ts`?** When electron-vite bundles the main process, `__dirname` points at `out/main/`. The migrations `.sql` files are NOT bundled — they live alongside source. We need a path that works in both `dev` (pointing at source) and `prod` (the .sql files must be copied to a known location during build, or we ship them via `extraResources`). For phase 3 we use `app.getAppPath()` + a known relative path. To keep this testable, the helper takes an injected `resolver` parameter.

- [ ] **Step 1: Write failing test for the full pipeline**

Append to `electron/services/db.test.ts`:

```ts
import { mkdirSync } from 'node:fs'
import { openForGrove, __resetForTest } from './db'

describe('openForGrove', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'db-open-'))
    mkdirSync(join(dir, '.acornvo'), { recursive: true })
  })
  afterEach(() => {
    __resetForTest()
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates index.db, applies pragmas, runs 001 migration', () => {
    openForGrove(dir)
    expect(existsSync(join(dir, '.acornvo', 'index.db'))).toBe(true)
    const db = require('./db').getCurrent() as Database.Database
    expect(db.pragma('user_version', { simple: true })).toBe(1)
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    // files table exists from 001_init
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='files'")
      .all()
    expect(tables.length).toBe(1)
  })

  it('closes a previous handle before opening a new one', () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'db-open2-'))
    mkdirSync(join(dir2, '.acornvo'), { recursive: true })
    try {
      openForGrove(dir)
      const first = require('./db').getCurrent() as Database.Database
      expect(first.open).toBe(true)
      openForGrove(dir2)
      expect(first.open).toBe(false)
      const second = require('./db').getCurrent() as Database.Database
      expect(second).not.toBe(first)
    } finally {
      rmSync(dir2, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Create the migrations dir resolver**

Create `electron/services/db/migrations/index.ts`:

```ts
import { join } from 'node:path'

/**
 * Returns the absolute path of the `migrations/` directory.
 *
 * In dev (electron-vite): __dirname resolves to `electron/services/db/migrations/`
 * which is exactly where the .sql files live.
 *
 * In prod (after electron-vite build): the bundled `main.js` lives in `out/main/`.
 * The .sql files must be copied to `out/main/migrations/` by the build step
 * (electron-builder `files` config — see Plan 5 packaging notes for the
 * deferred copy step). For phase 3, dev workflow only is required.
 */
export function migrationsDir(): string {
  return __dirname
}
```

- [ ] **Step 4: Wire `openForGrove` and `closeCurrent` skeleton**

Append/replace in `electron/services/db.ts`:

```ts
import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { runMigrations } from './db/migrations'
import { migrationsDir } from './db/migrations/index'

export function closeCurrent(): void {
  if (!current) return
  try {
    try {
      current.pragma('wal_checkpoint(TRUNCATE)')
    } catch {
      try {
        current.pragma('wal_checkpoint(PASSIVE)')
      } catch {
        /* ignore */
      }
    }
    current.close()
  } finally {
    current = null
    currentGrovePath = null
  }
}

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
    return
  }
  runMigrations(db, migrationsDir())
  current = db
  currentGrovePath = grovePath
}
```

> **Note:** the import `Database from 'better-sqlite3'` (default import) is what gives us the constructor — the namespaced `import type Database` from Task 1 stays for the type. You may need to consolidate the two:
>
> ```ts
> import Database from 'better-sqlite3'
> // Database (the default) is the constructor; Database.Database is the instance type.
> ```

- [ ] **Step 5: Run — GREEN**

```bash
npx vitest run electron/services/db.test.ts
```

Expected: all openForGrove tests pass.

- [ ] **Step 6: Commit**

```bash
git add electron/services/db.ts electron/services/db.test.ts electron/services/db/migrations/index.ts
git commit -m "feat(phase-03): openForGrove pipeline (pragmas → integrity → migrate)"
```

---

<!-- openspec-task: 4.6 -->

### Task 6: `closeCurrent()` — wal_checkpoint TRUNCATE → PASSIVE → close

**Files:**

- Modify: `electron/services/db.test.ts`

> The `closeCurrent` implementation already landed in Task 5. This task is the **dedicated test** that pins the contract.

- [ ] **Step 1: Write failing/regression test**

Append to `electron/services/db.test.ts`:

```ts
import { closeCurrent, getCurrent } from './db'

describe('closeCurrent', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'db-close-'))
    mkdirSync(join(dir, '.acornvo'), { recursive: true })
  })
  afterEach(() => {
    __resetForTest()
    rmSync(dir, { recursive: true, force: true })
  })

  it('is a no-op when nothing is open', () => {
    expect(() => closeCurrent()).not.toThrow()
    expect(getCurrent()).toBeNull()
  })

  it('closes current handle, truncates WAL, clears state', () => {
    openForGrove(dir)
    const db = getCurrent() as Database.Database
    expect(db.open).toBe(true)
    // create some WAL pages
    db.exec("INSERT INTO files (path, mtime) VALUES ('p', 0)")
    closeCurrent()
    expect(db.open).toBe(false)
    expect(getCurrent()).toBeNull()
    // -wal file should be 0 bytes or absent after TRUNCATE checkpoint
    const wal = join(dir, '.acornvo', 'index.db-wal')
    if (existsSync(wal)) {
      const size = require('node:fs').statSync(wal).size
      expect(size).toBe(0)
    }
  })
})
```

- [ ] **Step 2: Run — should already be GREEN (impl from Task 5)**

```bash
npx vitest run electron/services/db.test.ts
```

If RED, the impl from Task 5 has a bug — fix.

- [ ] **Step 3: Commit**

```bash
git add electron/services/db.test.ts
git commit -m "test(phase-03): closeCurrent truncates WAL + clears singleton"
```

---

<!-- openspec-task: 4.7 -->

### Task 7: `getCurrent()` / `requireCurrent()`

**Files:**

- Modify: `electron/services/db.ts`
- Modify: `electron/services/db.test.ts`

- [ ] **Step 1: Write failing test for `requireCurrent`**

Append to `electron/services/db.test.ts`:

```ts
import { requireCurrent } from './db'
import { IpcError } from '@shared/ipc-contract'

describe('requireCurrent', () => {
  afterEach(() => __resetForTest())

  it('returns the current db when open', () => {
    const dir = mkdtempSync(join(tmpdir(), 'db-req-'))
    mkdirSync(join(dir, '.acornvo'), { recursive: true })
    try {
      openForGrove(dir)
      expect(requireCurrent()).toBe(getCurrent())
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('throws IpcError(E_NOT_FOUND) when nothing is open', () => {
    let caught: unknown
    try {
      requireCurrent()
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(IpcError)
    expect((caught as IpcError).code).toBe('E_NOT_FOUND')
  })
})
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

Append to `electron/services/db.ts`:

```ts
import { IpcError } from '@shared/ipc-contract'

export function requireCurrent(): Database.Database {
  if (!current) {
    throw new IpcError('E_NOT_FOUND', 'no grove opened')
  }
  return current
}

export function getCurrentGrovePath(): string | null {
  return currentGrovePath
}
```

- [ ] **Step 4: Run — GREEN**

- [ ] **Step 5: Commit**

```bash
git add electron/services/db.ts electron/services/db.test.ts
git commit -m "feat(phase-03): requireCurrent throws E_NOT_FOUND when no grove open"
```

---

<!-- openspec-task: 4.8 -->

### Task 8: Export typed `dbService` singleton

**Files:**

- Modify: `electron/services/db.ts`
- Modify: `electron/services/db.test.ts`

- [ ] **Step 1: Write failing test verifying the public surface**

Append to `electron/services/db.test.ts`:

```ts
import { dbService } from './db'

describe('dbService surface', () => {
  it('exposes the documented methods', () => {
    expect(typeof dbService.openForGrove).toBe('function')
    expect(typeof dbService.closeCurrent).toBe('function')
    expect(typeof dbService.getCurrent).toBe('function')
    expect(typeof dbService.requireCurrent).toBe('function')
    expect(typeof dbService.integrityCheck).toBe('function')
    expect(typeof dbService.getCurrentGrovePath).toBe('function')
  })
})
```

- [ ] **Step 2: Run — FAIL** (the stub from Task 1 only contained `getCurrent`)

- [ ] **Step 3: Replace the `dbService` stub with the full export**

In `electron/services/db.ts`, replace the `export const dbService = { getCurrent }` line:

```ts
export const dbService = {
  openForGrove,
  closeCurrent,
  getCurrent,
  requireCurrent,
  getCurrentGrovePath,
  integrityCheck: (): string => {
    const db = requireCurrent()
    return integrityCheck(db)
  }
}
```

- [ ] **Step 4: Run the full suite + typecheck**

```bash
npm test
npm run typecheck
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add electron/services/db.ts electron/services/db.test.ts
git commit -m "feat(phase-03): export dbService singleton (full public surface)"
```

---

## Plan 3 Verification Checklist

- [ ] `electron/services/db.ts` exports `dbService`, `applyPragmas`, `integrityCheck`, `backupCorruptDb`, `openForGrove`, `closeCurrent`, `getCurrent`, `requireCurrent`, `getCurrentGrovePath`
- [ ] `npm test` passes (~12 tests across migrations + db suites)
- [ ] `npm run typecheck` passes
- [ ] `electron/services/db/migrations/index.ts` exports `migrationsDir()` returning the absolute path of the migrations directory
- [ ] No circular import warnings on `npm run build`
- [ ] `dbService` has methods `openForGrove`, `closeCurrent`, `getCurrent`, `requireCurrent`, `getCurrentGrovePath`, `integrityCheck`

When all boxes are checked, mark OpenSpec tasks 4.1–4.8 done and proceed to Plan 4 (`tasks-5.1-6.4` — grove lifecycle wiring + IPC).
