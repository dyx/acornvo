# Phase 03 — SQLite Schema & Migrations: Plan 1 (Deps + Migrations Runner)

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-03-sqlite-schema-migrations`
> **Task range:** OpenSpec tasks `1.1`–`2.4` (9 tasks)
> **Plan order:** 1 of 5. Subsequent plans (`tasks-3.1-3.8`, `4.1-4.8`, `5.1-6.4`, `7.1-8.8`) build on this one.
> **Status:** Not started
> **Created:** 2026-04-25
> **Branch suggestion:** `feat/phase-03-sqlite-schema-migrations` (branch from `main` after phase-02 merges)

---

## Goal

Install `better-sqlite3` with a working native rebuild, scaffold the migrations directory layout, and ship a small, well-tested `migrations.ts` runner that drives `PRAGMA user_version`-based migrations from `NNN_*.sql` files.

## Architecture

- `better-sqlite3` is a synchronous N-API native module that runs in Electron's **main process only**. It must match Electron's ABI, so the app's `postinstall` rebuilds it for Electron via `electron-builder install-app-deps` (already configured) plus an explicit `electron-rebuild -f -w better-sqlite3` chain for parity with what's stated in the OpenSpec proposal.
- `electron-vite` already runs `externalizeDepsPlugin()` for the main bundle, which auto-externalizes any package listed under `dependencies` in `package.json`. We additionally pin `better-sqlite3` in `build.rollupOptions.external` for explicit, defensive coverage (the OpenSpec contract requires it).
- The migrations runner is **pure**: it takes a `Database` handle (or filename) and a directory, reads `NNN_*.sql` files, and applies each one whose `NNN > current PRAGMA user_version` inside a single transaction that bumps `user_version` to `NNN` on commit. Failure → rollback → `MigrationError` thrown → callers (Plan 3 `db.ts`) trigger backup-and-rebuild.
- Tests use `new Database(':memory:')` for fast, isolated runs. We add `vitest` as a dev dependency and configure it for the main-process source tree only (renderer tests are not in scope for phase 3).

## Tech Stack

- `better-sqlite3@^11` (synchronous SQLite N-API binding)
- `@electron/rebuild` (dev) — explicit Electron ABI rebuild
- `electron-builder install-app-deps` (already in `postinstall`) — covers most cases
- `vitest@^2` + `@types/better-sqlite3` (dev) — unit tests for migrations runner
- Node 22+ (already pinned via `@types/node@^22`)

## Files Touched (cumulative for this plan)

| Path                                       | Action                                  | Owner task         |
| ------------------------------------------ | --------------------------------------- | ------------------ |
| `package.json`                             | Modify (add deps, extend `postinstall`) | 1.1, 1.2           |
| `electron.vite.config.ts`                  | Modify (add `external`)                 | 1.3                |
| `vitest.config.ts`                         | Create                                  | 1.5                |
| `electron/services/db/`                    | Create dir                              | 1.5                |
| `electron/services/db/migrations/`         | Create dir                              | 1.5                |
| `electron/services/db/migrations/.gitkeep` | Create                                  | 1.5                |
| `electron/services/db/errors.ts`           | Create                                  | 2.3                |
| `electron/services/db/migrations.ts`       | Create                                  | 2.1, 2.2, 2.3, 2.4 |
| `electron/services/db/migrations.test.ts`  | Create                                  | 2.1, 2.2, 2.3, 2.4 |

---

## Tasks

<!-- openspec-task: 1.1 -->

### Task 1: Install better-sqlite3 + dev tooling

**Files:**

- Modify: `package.json` (`dependencies`, `devDependencies`)

- [ ] **Step 1: Read current package.json**

```bash
cat package.json
```

Confirm `dependencies` does NOT yet contain `better-sqlite3`, and `devDependencies` does NOT yet contain `@electron/rebuild`, `vitest`, `@types/better-sqlite3`.

- [ ] **Step 2: Install runtime + dev dependencies**

```bash
npm install better-sqlite3@^11
npm install --save-dev @electron/rebuild @types/better-sqlite3 vitest@^2
```

Expected: `package.json` updated; `npm install` exits 0; `node_modules/better-sqlite3/build/Release/better_sqlite3.node` exists (it may be linked against system Node ABI at this point — that's fine, Task 2 fixes it for Electron).

- [ ] **Step 3: Verify the binding loads in Node**

```bash
node -e "const D=require('better-sqlite3'); const d=new D(':memory:'); console.log(d.prepare('SELECT sqlite_version()').get());"
```

Expected: prints `{ 'sqlite_version()': '3.x.x' }`. If this throws `NODE_MODULE_VERSION` mismatch, that's still OK for now — the rebuild step in Task 2 covers Electron's ABI.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(phase-03): install better-sqlite3 + vitest + electron-rebuild deps"
```

---

<!-- openspec-task: 1.2 -->

### Task 2: Chain electron-rebuild into postinstall

**Files:**

- Modify: `package.json` (`scripts.postinstall`)

- [ ] **Step 1: Read current postinstall script**

```bash
node -e "console.log(require('./package.json').scripts.postinstall)"
```

Expected output: `electron-builder install-app-deps`.

- [ ] **Step 2: Extend postinstall to also run electron-rebuild explicitly**

Edit `package.json`:

```json
"scripts": {
  "postinstall": "electron-builder install-app-deps && electron-rebuild -f -w better-sqlite3",
  ...
}
```

Note: `install-app-deps` already rebuilds native modules for Electron, but the OpenSpec proposal pins `electron-rebuild` as the canonical command. Chaining both keeps electron-builder's existing path intact while making the explicit rebuild visible in CI logs.

- [ ] **Step 3: Run postinstall manually and verify**

```bash
npm run postinstall
```

Expected: ends without error; the second command prints something like `Rebuilding better-sqlite3 for Electron 39.x.x`.

- [ ] **Step 4: Verify the binding now loads against Electron's ABI**

```bash
npx electron -e "const D=require('better-sqlite3'); const d=new D(':memory:'); console.log(d.prepare('SELECT 1').get()); process.exit(0);"
```

Expected: prints `{ '1': 1 }` and exits 0. If this throws ABI mismatch, the rebuild did not target Electron — re-check the chain order.

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "feat(phase-03): chain electron-rebuild for better-sqlite3 in postinstall"
```

---

<!-- openspec-task: 1.3 -->

### Task 3: Mark better-sqlite3 external in vite main bundle

**Files:**

- Modify: `electron.vite.config.ts` (add `build.rollupOptions.external`)

- [ ] **Step 1: Read the current vite config**

```bash
cat electron.vite.config.ts
```

Note that `main.plugins` already contains `externalizeDepsPlugin()` which auto-externalizes everything in `dependencies`. We are adding the explicit `external` array as a defensive belt-and-suspenders measure required by the OpenSpec contract — and to make the intent obvious to future readers.

- [ ] **Step 2: Edit the main section to add explicit external**

Replace the `main` block:

```ts
main: {
  plugins: [externalizeDepsPlugin()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'shared')
    }
  },
  build: {
    rollupOptions: {
      external: ['better-sqlite3']
    },
    lib: {
      entry: resolve(__dirname, 'electron/main.ts')
    }
  }
}
```

- [ ] **Step 3: Run typecheck and a build to confirm no regression**

```bash
npm run typecheck
npm run build
```

Expected: both exit 0. The build output should contain `out/main/main.js` and should NOT contain any inlined SQLite source (better-sqlite3 stays as a runtime require).

- [ ] **Step 4: Commit**

```bash
git add electron.vite.config.ts
git commit -m "feat(phase-03): mark better-sqlite3 as vite main external"
```

---

<!-- openspec-task: 1.4 -->

### Task 4: Document the cross-platform rebuild prerequisite

**Files:**

- (No code changes; this task is verification only.)

> **Note:** This project does not currently have CI workflows under `.github/workflows/`. The OpenSpec task 1.4 reads "CI（若有）..." — meaning _if CI exists_. Since it does not yet, this task reduces to a manual cross-platform check. We capture the prerequisite for the future CI change in a code comment now and run the manual checks during Plan 5 (Task 8.7).

- [ ] **Step 1: Confirm there is no `.github/workflows/` directory**

```bash
ls -la .github/workflows 2>&1 || echo "no CI yet"
```

Expected: `no CI yet` (or directory is empty / does not exist).

- [ ] **Step 2: Add a one-line guidance comment to `package.json` postinstall**

This was already covered in Task 2 — postinstall now chains both `install-app-deps` and `electron-rebuild`. No further edit needed here.

- [ ] **Step 3: Note the deferral in the plan tracker**

Mark this task complete with the note: "No CI yet; cross-platform manual verification deferred to Task 8.7." No commit needed.

---

<!-- openspec-task: 1.5 -->

### Task 5: Scaffold db service directories + vitest config

**Files:**

- Create: `electron/services/db/` (directory)
- Create: `electron/services/db/migrations/` (directory)
- Create: `electron/services/db/migrations/.gitkeep`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create the directory structure**

```bash
mkdir -p electron/services/db/migrations
touch electron/services/db/migrations/.gitkeep
```

- [ ] **Step 2: Create `vitest.config.ts` at the repo root**

```ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'shared')
    }
  },
  test: {
    include: ['electron/**/*.test.ts', 'shared/**/*.test.ts'],
    environment: 'node',
    pool: 'threads',
    testTimeout: 5000
  }
})
```

- [ ] **Step 3: Add a `test` script to package.json**

Edit `package.json` `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Sanity check vitest is wired up**

```bash
npx vitest run --reporter=basic
```

Expected: vitest reports "No test files found, exiting with code 0" (or similar). Exit code 0 either way at this point.

- [ ] **Step 5: Commit**

```bash
git add electron/services/db/ vitest.config.ts package.json
git commit -m "feat(phase-03): scaffold db service dirs + vitest config"
```

---

<!-- openspec-task: 2.1 -->

### Task 6: `readMigrations(dir)` — RED then GREEN

**Files:**

- Create: `electron/services/db/migrations.test.ts`
- Create: `electron/services/db/migrations.ts`

- [ ] **Step 1: Write the failing test for `readMigrations`**

Create `electron/services/db/migrations.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readMigrations } from './migrations'

describe('readMigrations', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mig-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns [] for an empty directory', () => {
    expect(readMigrations(dir)).toEqual([])
  })

  it('parses NNN_*.sql files and sorts by NNN ascending', () => {
    writeFileSync(join(dir, '002_add_col.sql'), '-- two\nSELECT 2;')
    writeFileSync(join(dir, '001_init.sql'), '-- one\nSELECT 1;')
    writeFileSync(join(dir, '010_late.sql'), 'SELECT 10;')
    const got = readMigrations(dir)
    expect(got.map((m) => m.version)).toEqual([1, 2, 10])
    expect(got.map((m) => m.name)).toEqual(['001_init.sql', '002_add_col.sql', '010_late.sql'])
    expect(got[0].sql).toContain('SELECT 1')
  })

  it('ignores files that do not match NNN_*.sql', () => {
    writeFileSync(join(dir, '001_ok.sql'), '-- ok')
    writeFileSync(join(dir, 'README.md'), 'docs')
    writeFileSync(join(dir, '1_short.sql'), '-- bad prefix')
    writeFileSync(join(dir, 'abc_init.sql'), '-- not numeric')
    const got = readMigrations(dir)
    expect(got.map((m) => m.name)).toEqual(['001_ok.sql'])
  })

  it('throws if two files share the same NNN', () => {
    writeFileSync(join(dir, '001_a.sql'), '-- a')
    writeFileSync(join(dir, '001_b.sql'), '-- b')
    expect(() => readMigrations(dir)).toThrow(/duplicate migration version/i)
  })
})
```

- [ ] **Step 2: Run the test — verify it fails with "Cannot find module"**

```bash
npx vitest run electron/services/db/migrations.test.ts
```

Expected: FAIL — `Failed to load url ./migrations` (or similar — module not found).

- [ ] **Step 3: Implement `readMigrations` minimally**

Create `electron/services/db/migrations.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface Migration {
  version: number
  name: string
  sql: string
}

const MIGRATION_RE = /^(\d{3})_.*\.sql$/

export function readMigrations(dir: string): Migration[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return []
    throw err
  }

  const out: Migration[] = []
  const seen = new Set<number>()
  for (const name of entries) {
    const m = MIGRATION_RE.exec(name)
    if (!m) continue
    const version = Number.parseInt(m[1], 10)
    if (seen.has(version)) {
      throw new Error(`duplicate migration version ${version} (file: ${name})`)
    }
    seen.add(version)
    out.push({ version, name, sql: readFileSync(join(dir, name), 'utf8') })
  }
  out.sort((a, b) => a.version - b.version)
  return out
}
```

- [ ] **Step 4: Run the tests — verify GREEN**

```bash
npx vitest run electron/services/db/migrations.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/services/db/migrations.ts electron/services/db/migrations.test.ts
git commit -m "feat(phase-03): readMigrations scans NNN_*.sql in version order"
```

---

<!-- openspec-task: 2.2 -->

### Task 7: `runMigrations(db, dir)` with single-transaction-per-migration

**Files:**

- Modify: `electron/services/db/migrations.ts`
- Modify: `electron/services/db/migrations.test.ts`

- [ ] **Step 1: Write failing tests for `runMigrations`**

Append to `electron/services/db/migrations.test.ts`:

```ts
import Database from 'better-sqlite3'
import { runMigrations } from './migrations'

describe('runMigrations', () => {
  let dir: string
  let db: Database.Database
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mig-run-'))
    db = new Database(':memory:')
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('runs all migrations on a fresh db (user_version=0)', () => {
    writeFileSync(join(dir, '001_init.sql'), 'CREATE TABLE a (x INTEGER);')
    writeFileSync(join(dir, '002_more.sql'), 'CREATE TABLE b (y INTEGER);')
    runMigrations(db, dir)
    expect(db.pragma('user_version', { simple: true })).toBe(2)
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as Array<{ name: string }>
    expect(tables.map((t) => t.name)).toEqual(['a', 'b'])
  })

  it('runs only the migrations greater than current user_version', () => {
    writeFileSync(join(dir, '001_init.sql'), 'CREATE TABLE a (x INTEGER);')
    writeFileSync(join(dir, '002_more.sql'), 'CREATE TABLE b (y INTEGER);')
    db.exec('CREATE TABLE a (x INTEGER);')
    db.pragma('user_version = 1')
    runMigrations(db, dir)
    expect(db.pragma('user_version', { simple: true })).toBe(2)
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as Array<{ name: string }>
    expect(tables.map((t) => t.name)).toEqual(['a', 'b'])
  })

  it('is a no-op when user_version is already at the latest', () => {
    writeFileSync(join(dir, '001_init.sql'), 'CREATE TABLE a (x INTEGER);')
    db.exec('CREATE TABLE a (x INTEGER);')
    db.pragma('user_version = 1')
    runMigrations(db, dir)
    expect(db.pragma('user_version', { simple: true })).toBe(1)
  })
})
```

- [ ] **Step 2: Run — verify FAIL ("runMigrations is not a function")**

```bash
npx vitest run electron/services/db/migrations.test.ts
```

Expected: 3 new tests fail with import error.

- [ ] **Step 3: Implement `runMigrations`**

Append to `electron/services/db/migrations.ts`:

```ts
import type Database from 'better-sqlite3'

export function runMigrations(db: Database.Database, dir: string): Migration[] {
  const all = readMigrations(dir)
  const current = db.pragma('user_version', { simple: true }) as number
  const pending = all.filter((m) => m.version > current)
  const applied: Migration[] = []
  for (const m of pending) {
    const tx = db.transaction(() => {
      db.exec(m.sql)
      db.pragma(`user_version = ${m.version}`)
    })
    tx()
    applied.push(m)
  }
  return applied
}
```

- [ ] **Step 4: Run — verify GREEN**

```bash
npx vitest run electron/services/db/migrations.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/services/db/migrations.ts electron/services/db/migrations.test.ts
git commit -m "feat(phase-03): runMigrations applies pending NNNs in single transactions"
```

---

<!-- openspec-task: 2.3 -->

### Task 8: `MigrationError` with version + cause; rollback on failure

**Files:**

- Create: `electron/services/db/errors.ts`
- Modify: `electron/services/db/migrations.ts`
- Modify: `electron/services/db/migrations.test.ts`

- [ ] **Step 1: Write failing test for the error path**

Append to `electron/services/db/migrations.test.ts`:

```ts
import { MigrationError } from './errors'

describe('runMigrations error handling', () => {
  let dir: string
  let db: Database.Database
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mig-err-'))
    db = new Database(':memory:')
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('throws MigrationError with version + cause and rolls back user_version', () => {
    writeFileSync(join(dir, '001_init.sql'), 'CREATE TABLE a (x INTEGER);')
    writeFileSync(join(dir, '002_bad.sql'), 'CREATE TABLE a (x INTEGER); -- duplicate, should fail')
    let caught: unknown
    try {
      runMigrations(db, dir)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(MigrationError)
    const e = caught as MigrationError
    expect(e.version).toBe(2)
    expect(e.cause).toBeInstanceOf(Error)
    // user_version stays at 1 because tx 002 rolled back
    expect(db.pragma('user_version', { simple: true })).toBe(1)
  })
})
```

- [ ] **Step 2: Run — verify FAIL**

```bash
npx vitest run electron/services/db/migrations.test.ts
```

Expected: import error / not-a-class error on `MigrationError`.

- [ ] **Step 3: Create the error class**

Create `electron/services/db/errors.ts`:

```ts
export class MigrationError extends Error {
  public readonly version: number
  public override readonly cause: unknown
  constructor(version: number, message: string, cause: unknown) {
    super(message)
    this.name = 'MigrationError'
    this.version = version
    this.cause = cause
  }
}
```

- [ ] **Step 4: Wrap the loop in try/catch and rethrow as `MigrationError`**

Edit the `for (const m of pending)` block in `electron/services/db/migrations.ts`:

```ts
import { MigrationError } from './errors'

// ...inside runMigrations:
for (const m of pending) {
  const tx = db.transaction(() => {
    db.exec(m.sql)
    db.pragma(`user_version = ${m.version}`)
  })
  try {
    tx()
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : String(cause)
    throw new MigrationError(m.version, `migration ${m.name} failed: ${msg}`, cause)
  }
  applied.push(m)
}
```

- [ ] **Step 5: Run — verify GREEN**

```bash
npx vitest run electron/services/db/migrations.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 6: Commit**

```bash
git add electron/services/db/errors.ts electron/services/db/migrations.ts electron/services/db/migrations.test.ts
git commit -m "feat(phase-03): MigrationError carries version + cause; rollback verified"
```

---

<!-- openspec-task: 2.4 -->

### Task 9: `listApplied(db, dir)` — what's been run

**Files:**

- Modify: `electron/services/db/migrations.ts`
- Modify: `electron/services/db/migrations.test.ts`

- [ ] **Step 1: Write failing test**

Append to `electron/services/db/migrations.test.ts`:

```ts
import { listApplied } from './migrations'

describe('listApplied', () => {
  let dir: string
  let db: Database.Database
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mig-list-'))
    db = new Database(':memory:')
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns user_version 0 and [] when nothing applied', () => {
    writeFileSync(join(dir, '001_init.sql'), 'CREATE TABLE a (x);')
    expect(listApplied(db, dir)).toEqual({ user_version: 0, migrations_applied: [] })
  })

  it('returns user_version + names of files with version <= current', () => {
    writeFileSync(join(dir, '001_init.sql'), 'CREATE TABLE a (x);')
    writeFileSync(join(dir, '002_more.sql'), 'CREATE TABLE b (y);')
    writeFileSync(join(dir, '003_future.sql'), 'CREATE TABLE c (z);')
    runMigrations(db, dir)
    db.pragma('user_version = 2') // simulate "we only got to 2"
    expect(listApplied(db, dir)).toEqual({
      user_version: 2,
      migrations_applied: ['001_init.sql', '002_more.sql']
    })
  })
})
```

- [ ] **Step 2: Run — verify FAIL**

```bash
npx vitest run electron/services/db/migrations.test.ts
```

Expected: `listApplied is not a function`.

- [ ] **Step 3: Implement `listApplied`**

Append to `electron/services/db/migrations.ts`:

```ts
export interface AppliedSummary {
  user_version: number
  migrations_applied: string[]
}

export function listApplied(db: Database.Database, dir: string): AppliedSummary {
  const user_version = db.pragma('user_version', { simple: true }) as number
  const all = readMigrations(dir)
  const migrations_applied = all.filter((m) => m.version <= user_version).map((m) => m.name)
  return { user_version, migrations_applied }
}
```

- [ ] **Step 4: Run — verify GREEN**

```bash
npx vitest run electron/services/db/migrations.test.ts
```

Expected: all 10 tests pass.

- [ ] **Step 5: Run the full test suite + typecheck for regression**

```bash
npm test
npm run typecheck
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add electron/services/db/migrations.ts electron/services/db/migrations.test.ts
git commit -m "feat(phase-03): listApplied returns user_version + applied filenames"
```

---

## Plan 1 Verification Checklist

- [ ] `npm install` exits 0 on a fresh clone (postinstall rebuilds for Electron)
- [ ] `npx electron -e "require('better-sqlite3')"` works without ABI mismatch
- [ ] `npm test` runs the migrations.test.ts suite (10 tests, all pass)
- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds; `out/main/main.js` does not inline better-sqlite3
- [ ] `electron/services/db/` and `electron/services/db/migrations/` directories exist (with .gitkeep in the latter)
- [ ] `electron/services/db/migrations.ts` exports `readMigrations`, `runMigrations`, `listApplied`, `MigrationError` (last via `./errors`)

When all boxes are checked, mark OpenSpec tasks 1.1–2.4 done and proceed to Plan 2 (`tasks-3.1-3.8` — the 001_init.sql schema).
