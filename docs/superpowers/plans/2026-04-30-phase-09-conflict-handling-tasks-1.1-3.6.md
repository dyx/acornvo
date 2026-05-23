# Phase 09 Conflict Handling — Plan 1 (Tasks 1.1–3.6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the main-process foundation for conflict handling: shared types, the `.acornvo/conflicts/` directory, the snapshot store (write/list/read/delete/prune), and extend `file.write` with a `force` option that bypasses the mtime guard while still registering `selfWrites`.

**Architecture:** All work in this plan is renderer-invisible. We add three small leaf modules — `shared/conflict-types.ts` (types only), `electron/services/conflicts/store.ts` (filesystem CRUD + retention), `electron/services/fs-atomic.ts` extension (`force` branch on `writeWithVerify`) — and wire `.acornvo/conflicts/` into the existing grove `initialize()`. `electron/ipc/file.ts` plumbs `force` through `FileWriteOptions`. No IPC handler registration yet — that lands in Plan 2.

**Tech Stack:** TypeScript, Node `fs/promises`, vitest (already configured for `electron/**` and `shared/**`). Reuses existing `writeFileAtomic`, `safeResolve`, `registerSelfWrite`, `IpcError`.

---

## Pre-flight

This plan assumes phases 4 and 5 are merged on `main` (they are — see archived `phase-04-file-io-atomic` and `phase-05-indexer-watcher`). It does **not** require phase 7 (editor store) to be merged: nothing in this plan touches `src/`.

Verify before starting:

```bash
grep -q "expectedMtime" /Users/aaa/develop/workspace-ai/acornvo/electron/services/fs-atomic.ts && echo "phase-04 OK"
grep -q "registerSelfWrite" /Users/aaa/develop/workspace-ai/acornvo/electron/services/watcher.ts && echo "phase-05 OK"
```

Both must print "OK".

## File Structure

| Path                                        | Action                                                                                       | Owner task                        |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------- |
| `shared/conflict-types.ts`                  | Create                                                                                       | 1.2                               |
| `electron/services/grove.ts`                | Modify (`initialize` adds `ensureDir(conflicts)`)                                            | 1.1                               |
| `electron/services/paths.ts`                | Modify (add `groveConflictsDir(grovePath)` helper)                                           | 1.1                               |
| `electron/services/grove.test.ts`           | Modify (assert conflicts dir created)                                                        | 1.1                               |
| `electron/services/fs-atomic.ts`            | Modify (`writeWithVerify` accepts `force`, ±2ms tolerance, returns `remoteMtimeMs` in error) | 2.1, 2.2.1, 2.2.2, 2.2.3          |
| `electron/services/fs-atomic.test.ts`       | Modify (force / tolerance / concurrency cases)                                               | 2.3                               |
| `electron/ipc/file.ts`                      | Modify (forward `force` opt)                                                                 | 2.1                               |
| `shared/ipc-contract.ts`                    | Modify (`FileWriteOptions.force?: boolean`, error helper for `remoteMtimeMs`)                | 2.1                               |
| `electron/services/conflicts/store.ts`      | Create (buildId + writeSnapshot + prune + list + read + delete)                              | 1.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6 |
| `electron/services/conflicts/store.test.ts` | Create                                                                                       | 1.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6 |

## Conventions reused

- All snapshot directory operations MUST go through `safeResolve(<grove>/.acornvo/conflicts/, '<id>')` to prevent path-escape (D5/D9).
- `writeFileAtomic` from `electron/services/fs-atomic.ts` is the only allowed write primitive (no raw `writeFile` for snapshots — atomic guarantees apply).
- `IpcError` codes: `E_NOT_FOUND` (read missing id), `E_PERMISSION` (path escape on delete), `E_INVALID_ARGS` (malformed id), `E_INTERNAL` (unexpected fs error).

---

<!-- openspec-task: 1.1 -->

### Task 1: ensure `.acornvo/conflicts/` exists at grove init

**Files:**

- Modify: `electron/services/paths.ts`
- Modify: `electron/services/grove.ts:87-130` (`initialize`)
- Modify: `electron/services/grove.test.ts`

- [ ] **Step 1: Add `groveConflictsDir` helper**

Edit `electron/services/paths.ts`, append after `groveAssetsDir`:

```ts
export function groveConflictsDir(grovePath: string): string {
  return join(groveAcornDir(grovePath), 'conflicts')
}
```

- [ ] **Step 2: Write the failing test for grove init creating the conflicts dir**

Open `electron/services/grove.test.ts` and add a new test in the `initialize` describe block (find the existing block testing `.acornvo/` creation and add a sibling test — search for `'creates .acornvo'` to anchor):

```ts
import { groveConflictsDir } from './paths'
import { stat } from 'node:fs/promises'

it('initialize creates .acornvo/conflicts/', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'grove-conflicts-'))
  await initialize(tmp)
  const st = await stat(groveConflictsDir(tmp))
  expect(st.isDirectory()).toBe(true)
})
```

- [ ] **Step 3: Run the test and confirm it fails**

```bash
npx vitest run electron/services/grove.test.ts -t "creates .acornvo/conflicts"
```

Expected: FAIL with ENOENT on `.acornvo/conflicts/` (directory not yet created).

- [ ] **Step 4: Implement: add `ensureDir` call inside `initialize`**

Edit `electron/services/grove.ts:87-93`. After the line `await ensureDir(groveAssetsDir(grovePath))`, add:

```ts
await ensureDir(groveConflictsDir(grovePath))
```

And add the import at the top of the file:

```ts
import {
  groveAcornDir,
  groveAssetsDir,
  groveConflictsDir,
  groveInboxDir,
  groveProjectFile
} from './paths'
```

- [ ] **Step 5: Re-run the test, confirm pass**

```bash
npx vitest run electron/services/grove.test.ts -t "creates .acornvo/conflicts"
```

Expected: PASS. Then run the entire grove test file to make sure nothing regressed:

```bash
npx vitest run electron/services/grove.test.ts
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/services/paths.ts electron/services/grove.ts electron/services/grove.test.ts
git commit -m "feat(grove): ensure .acornvo/conflicts/ on grove init (phase-09 1.1)"
```

---

<!-- openspec-task: 1.2 -->

### Task 2: shared conflict types

**Files:**

- Create: `shared/conflict-types.ts`

- [ ] **Step 1: Create the types file**

Create `shared/conflict-types.ts`:

```ts
import type { Frontmatter } from './frontmatter-schema'

export type ConflictResolvedBy = 'keep_local' | 'load_remote' | 'load_remote_banner' | 'save_as'

export interface ConflictMeta {
  /** rel-path inside the grove (POSIX, no leading slash) */
  path: string
  /** ISO-8601 UTC timestamp of resolution, e.g. 2026-04-18T12:30:45.123Z */
  ts: string
  resolved_by: ConflictResolvedBy
  /** for save_as: the rel-path of the new sibling file */
  winner_path?: string
}

export interface ConflictItem {
  id: string
  path: string
  ts: string
  resolved_by: ConflictResolvedBy
  winner_path?: string
}

/**
 * Editor-store local state. `none` is the resting state.
 * `externalModified` is set by the watcher event when dirty=true.
 * `saveConflict` is set by `save()` after `E_MTIME_MISMATCH`.
 */
export type ConflictState =
  | { kind: 'none' }
  | { kind: 'externalModified'; remoteMtimeMs: number }
  | {
      kind: 'saveConflict'
      remoteMtimeMs: number
      remoteBody: string
      remoteFrontmatter: Frontmatter
    }
```

- [ ] **Step 2: Type-check passes**

```bash
npm run typecheck
```

Expected: PASS (no other file imports the new types yet, so we're just making sure the file itself compiles in both `tsconfig.node.json` and `tsconfig.web.json`).

- [ ] **Step 3: Commit**

```bash
git add shared/conflict-types.ts
git commit -m "feat(shared): add ConflictMeta/Item/State types (phase-09 1.2)"
```

---

<!-- openspec-task: 1.3 -->

### Task 3: scaffold `electron/services/conflicts/store.ts`

This task creates the file with stubs and one passing smoke test. Each subsequent function is filled in by tasks 3.1–3.6 (TDD, one function per task).

**Files:**

- Create: `electron/services/conflicts/store.ts`
- Create: `electron/services/conflicts/store.test.ts`

- [ ] **Step 1: Create the stub module**

Create `electron/services/conflicts/store.ts`:

```ts
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import * as groveSvc from '../grove'
import { groveConflictsDir } from '../paths'
import { safeResolve } from '../path-safety'
import { writeFileAtomic } from '../fs-atomic'
import { IpcError } from '@shared/ipc-contract'
import type { ConflictItem, ConflictMeta, ConflictResolvedBy } from '@shared/conflict-types'

const MAX_KEEP = 100
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

function requireConflictsRoot(): string {
  const grove = groveSvc.getCurrent()
  if (!grove) throw new IpcError('E_NOT_FOUND', 'no grove is currently open')
  return groveConflictsDir(grove.path)
}

// --- public API (filled by tasks 3.1–3.6) ---

export function buildId(path: string, isoTs: string): string {
  throw new Error('not implemented')
}

export interface WriteSnapshotInput {
  path: string
  baseText: string
  localText: string
  remoteText: string
  resolvedBy: ConflictResolvedBy
  winnerPath?: string
}

export async function writeSnapshot(_input: WriteSnapshotInput): Promise<{ id: string }> {
  throw new Error('not implemented')
}

export async function prune(): Promise<{ deleted: number }> {
  throw new Error('not implemented')
}

export async function listSnapshots(_opts?: {
  limit?: number
  offset?: number
}): Promise<{ items: ConflictItem[]; total: number }> {
  throw new Error('not implemented')
}

export interface ReadSnapshotResult {
  meta: ConflictMeta
  localText: string
  remoteText: string
  baseText: string
}

export async function readSnapshot(_id: string): Promise<ReadSnapshotResult> {
  throw new Error('not implemented')
}

export async function deleteSnapshot(_id: string): Promise<void> {
  throw new Error('not implemented')
}

// --- internal helpers exported for testing ---

export const _internals = {
  MAX_KEEP,
  MAX_AGE_MS,
  requireConflictsRoot
}
```

- [ ] **Step 2: Create the test scaffold with a smoke test**

Create `electron/services/conflicts/store.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as groveSvc from '../grove'
import * as store from './store'

let tmp: string

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'conflict-store-'))
  vi.spyOn(groveSvc, 'getCurrent').mockReturnValue({
    id: 'g1',
    path: tmp,
    name: 'g',
    color: 'acorn',
    schema_version: 1,
    created_at: '',
    last_opened_at: '',
    sync_warning: null
  })
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(tmp, { recursive: true, force: true })
})

describe('conflicts/store smoke', () => {
  it('module exports the public API', () => {
    expect(typeof store.buildId).toBe('function')
    expect(typeof store.writeSnapshot).toBe('function')
    expect(typeof store.prune).toBe('function')
    expect(typeof store.listSnapshots).toBe('function')
    expect(typeof store.readSnapshot).toBe('function')
    expect(typeof store.deleteSnapshot).toBe('function')
  })
})
```

- [ ] **Step 3: Run the smoke test**

```bash
npx vitest run electron/services/conflicts/store.test.ts
```

Expected: PASS (1 test).

- [ ] **Step 4: Commit**

```bash
git add electron/services/conflicts/store.ts electron/services/conflicts/store.test.ts
git commit -m "feat(conflicts): scaffold conflict snapshot store (phase-09 1.3)"
```

---

<!-- openspec-task: 2.1 -->

### Task 4: extend `FileWriteOptions` with `force` and forward through `file.write`

**Files:**

- Modify: `shared/ipc-contract.ts`
- Modify: `electron/ipc/file.ts:75-86` (`write` handler)

- [ ] **Step 1: Add `force` to `FileWriteOptions`**

Edit `shared/ipc-contract.ts:94-97`. Replace the existing `FileWriteOptions` block:

```ts
export interface FileWriteOptions {
  eol?: 'lf' | 'crlf'
  expectedMtime?: number
  /**
   * When true, skip the mtime guard and overwrite unconditionally.
   * The main-side handler MUST emit a `force-write` audit log entry.
   * `force: true` and `expectedMtime` may be set together; `force` wins.
   */
  force?: boolean
}
```

- [ ] **Step 2: Add `remoteMtimeMs` to `IpcError` payload (extension contract)**

`E_MTIME_MISMATCH` already exists in `IpcErrorCode`. The renderer needs to read `remoteMtimeMs` off the error. Extend `IpcErrorShape` with an optional context bag:

Edit `shared/ipc-contract.ts:41-44`:

```ts
export interface IpcErrorShape {
  code: IpcErrorCode
  message: string
  /** Error-specific extra fields. For E_MTIME_MISMATCH: `{ remoteMtimeMs: number }`. */
  context?: Record<string, unknown>
}
```

And update the `IpcError` class to accept and propagate it. Replace lines 50-63:

```ts
export class IpcError extends Error {
  public readonly code: IpcErrorCode
  public readonly context?: Record<string, unknown>

  constructor(
    codeOrShape: IpcErrorCode | IpcErrorShape,
    message?: string,
    context?: Record<string, unknown>
  ) {
    if (typeof codeOrShape === 'string') {
      super(message ?? '')
      this.code = codeOrShape
      this.context = context
    } else {
      super(codeOrShape.message)
      this.code = codeOrShape.code
      this.context = codeOrShape.context
    }
    this.name = 'IpcError'
  }
}
```

- [ ] **Step 3: Forward `force` from `file.write` IPC handler**

The handler already passes `opts` through to `writeWithVerify` (`electron/ipc/file.ts:75-86`). The forward is implicit because `WriteWithVerifyOptions` will be widened in Task 5. No code change here, but **add a comment** above the call to document the contract:

```ts
async write(
  rel: string,
  content: string,
  opts: FileWriteOptions = {}
): Promise<FileWriteResult> {
  const root = requireGroveRoot()
  const abs = safeResolve(root, rel)
  // opts.force / opts.expectedMtime / opts.eol all flow through to writeWithVerify,
  // which is responsible for the mtime guard and force-write audit.
  const result = await writeWithVerify(abs, content, opts)
  const finalStat = await fsStat(abs)
  registerSelfWrite(abs, finalStat.mtimeMs)
  return result
}
```

- [ ] **Step 4: Type-check**

```bash
npm run typecheck
```

Expected: PASS. (`writeWithVerify` accepts the new field via TypeScript structural widening; we extend `WriteWithVerifyOptions` in Task 5.)

- [ ] **Step 5: Commit**

```bash
git add shared/ipc-contract.ts electron/ipc/file.ts
git commit -m "feat(ipc): add FileWriteOptions.force + IpcError.context (phase-09 2.1)"
```

---

<!-- openspec-task: 2.2 -->

### Task 5: implement `force` + ±2ms tolerance + `remoteMtimeMs` in `writeWithVerify`

**Files:**

- Modify: `electron/services/fs-atomic.ts:76-79` (`WriteWithVerifyOptions`)
- Modify: `electron/services/fs-atomic.ts:145-187` (`writeWithVerify`)
- Modify: `electron/services/logger.ts` (no schema change — we just call `info`)

- [ ] **Step 1: Write failing tests for the three new behaviours**

Append to `electron/services/fs-atomic.test.ts`:

```ts
import { writeWithVerify } from './fs-atomic'
import { IpcError } from '@shared/ipc-contract'
import { mkdtemp, writeFile, stat, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('writeWithVerify (phase-09 2.2)', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'wwv-09-'))
  })

  it('force: true bypasses mtime guard and succeeds', async () => {
    const abs = join(tmp, 'a.md')
    await writeFile(abs, 'old')
    const before = (await stat(abs)).mtimeMs
    // pretend caller has stale mtime
    const result = await writeWithVerify(abs, 'new', {
      expectedMtime: before - 5000,
      force: true
    })
    expect(result.mtimeMs).toBeGreaterThan(before - 1) // monotonic-ish
  })

  it('mtime tolerance ±2ms: 1ms drift is treated as match', async () => {
    const abs = join(tmp, 'b.md')
    await writeFile(abs, 'x')
    const real = (await stat(abs)).mtimeMs
    // expectedMtime within 1ms of real → must succeed
    await expect(writeWithVerify(abs, 'y', { expectedMtime: real - 1 })).resolves.toBeTruthy()
  })

  it('mtime mismatch >2ms throws E_MTIME_MISMATCH with remoteMtimeMs in context', async () => {
    const abs = join(tmp, 'c.md')
    await writeFile(abs, 'x')
    const real = (await stat(abs)).mtimeMs
    let caught: IpcError | undefined
    try {
      await writeWithVerify(abs, 'y', { expectedMtime: real - 5000 })
    } catch (e) {
      caught = e as IpcError
    }
    expect(caught).toBeInstanceOf(IpcError)
    expect(caught!.code).toBe('E_MTIME_MISMATCH')
    expect(caught!.context?.remoteMtimeMs).toBeCloseTo(real, 0)
  })

  it('force + concurrent writes serialised by per-path lock', async () => {
    const abs = join(tmp, 'd.md')
    await writeFile(abs, 'init')
    await Promise.all([
      writeWithVerify(abs, 'A', { force: true }),
      writeWithVerify(abs, 'B', { force: true })
    ])
    // last writer wins; file must contain one of the two values, never garbled
    const got = await (await import('node:fs/promises')).readFile(abs, 'utf8')
    expect(['A', 'B']).toContain(got)
  })
})
```

- [ ] **Step 2: Run them to confirm failure**

```bash
npx vitest run electron/services/fs-atomic.test.ts -t "phase-09 2.2"
```

Expected: 3 of 4 FAIL (force test fails because option not honored; tolerance test fails because exact-equals; mismatch test fails because `context` not populated). The concurrent-writes test may pass already via `withPathLock`, that's fine.

- [ ] **Step 3: Implement — widen `WriteWithVerifyOptions` and rewrite the guard**

Edit `electron/services/fs-atomic.ts:76-79`:

```ts
export interface WriteWithVerifyOptions {
  eol?: 'lf' | 'crlf'
  expectedMtime?: number
  /** Skip the mtime guard. Logs a `force-write` audit entry. */
  force?: boolean
}

const MTIME_TOLERANCE_MS = 2
```

Edit `electron/services/fs-atomic.ts:145-187` (the `writeWithVerify` body) — replace the existing `// 3.7.1 mtime preflight` block (lines 153-169) with:

```ts
// 3.7.1 mtime preflight (force bypasses; otherwise ±2ms tolerance)
let preWriteMtime: number | undefined
try {
  preWriteMtime = (await stat(abs)).mtimeMs
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
}

if (opts.force === true) {
  // Audit log: include both old and stated-expected mtimes so we can
  // reconstruct the diff if a user complains about lost remote edits.
  const { logger } = await import('./logger')
  logger.info('force-write', {
    path: abs,
    old_mtime: preWriteMtime ?? null,
    expected_mtime: opts.expectedMtime ?? null
  })
} else if (opts.expectedMtime !== undefined) {
  if (preWriteMtime === undefined) {
    // File vanished between caller's read and our write
    throw new IpcError(
      'E_MTIME_MISMATCH',
      `${abs}: file not found (expected mtime ${opts.expectedMtime})`,
      { remoteMtimeMs: 0 }
    )
  }
  if (Math.abs(preWriteMtime - opts.expectedMtime) > MTIME_TOLERANCE_MS) {
    throw new IpcError(
      'E_MTIME_MISMATCH',
      `${abs}: mtime is ${preWriteMtime}, expected ${opts.expectedMtime}`,
      { remoteMtimeMs: preWriteMtime }
    )
  }
}
```

- [ ] **Step 4: Run the new tests, confirm pass**

```bash
npx vitest run electron/services/fs-atomic.test.ts -t "phase-09 2.2"
```

Expected: all 4 PASS.

Run the full file to catch regressions in the existing tests:

```bash
npx vitest run electron/services/fs-atomic.test.ts
```

Expected: all PASS. (Note: any existing test that asserted "exact mtime equality required" needs reading — the new behaviour is "±2ms equality required". Update those tests in this commit.)

- [ ] **Step 5: Verify the existing `selfWrites` registration still happens**

Quickly grep:

```bash
grep -n "registerSelfWrite" /Users/aaa/develop/workspace-ai/acornvo/electron/ipc/file.ts
```

Expected: line `registerSelfWrite(abs, finalStat.mtimeMs)` still present in `file.write` handler. The `force: true` path goes through `writeWithVerify` → `writeFileAtomic` → returns to handler → `registerSelfWrite`. No change needed.

- [ ] **Step 6: Commit**

```bash
git add electron/services/fs-atomic.ts electron/services/fs-atomic.test.ts
git commit -m "feat(fs-atomic): force-write + ±2ms tolerance + remoteMtimeMs in error (phase-09 2.2)"
```

---

<!-- openspec-task: 2.3 -->

### Task 6: tighten unit tests — boundary cases for tolerance, force ordering, race

The previous task's tests cover the headline cases. This task adds the explicit boundary tests called out in tasks.md 2.3 and 9.16 (we'll re-reference them from Plan 4's acceptance task).

**Files:**

- Modify: `electron/services/fs-atomic.test.ts`

- [ ] **Step 1: Add boundary tests**

Append to `electron/services/fs-atomic.test.ts`:

```ts
describe('writeWithVerify tolerance boundaries (phase-09 2.3)', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'wwv-bound-'))
  })

  it('exactly 2ms drift: PASS', async () => {
    const abs = join(tmp, 'a.md')
    await writeFile(abs, 'x')
    const real = (await stat(abs)).mtimeMs
    await expect(writeWithVerify(abs, 'y', { expectedMtime: real - 2 })).resolves.toBeTruthy()
  })

  it('exactly 3ms drift: FAIL with mismatch', async () => {
    const abs = join(tmp, 'b.md')
    await writeFile(abs, 'x')
    const real = (await stat(abs)).mtimeMs
    await expect(writeWithVerify(abs, 'y', { expectedMtime: real - 3 })).rejects.toMatchObject({
      code: 'E_MTIME_MISMATCH'
    })
  })

  it('force + expectedMtime stale: force wins, audit logs both', async () => {
    const abs = join(tmp, 'c.md')
    await writeFile(abs, 'x')
    await expect(
      writeWithVerify(abs, 'y', {
        expectedMtime: 1, // very stale
        force: true
      })
    ).resolves.toBeTruthy()
  })
})
```

- [ ] **Step 2: Run, confirm pass**

```bash
npx vitest run electron/services/fs-atomic.test.ts -t "phase-09 2.3"
```

Expected: 3 PASS.

- [ ] **Step 3: Commit**

```bash
git add electron/services/fs-atomic.test.ts
git commit -m "test(fs-atomic): boundary cases for ±2ms tolerance + force (phase-09 2.3)"
```

---

<!-- openspec-task: 3.1 -->

### Task 7: implement `buildId(path, isoTs)`

**Files:**

- Modify: `electron/services/conflicts/store.ts`
- Modify: `electron/services/conflicts/store.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `electron/services/conflicts/store.test.ts`:

```ts
import { buildId } from './store'

describe('buildId', () => {
  it('replaces : in timestamp and slugifies path', () => {
    const id = buildId('notes/a.md', '2026-04-18T12:30:45.123Z')
    expect(id).toBe('2026-04-18T12-30-45.123Z-notes_a.md')
  })

  it('caps the slug at 40 chars', () => {
    const longPath = 'a/'.repeat(40) + 'final.md' // > 80 chars total
    const id = buildId(longPath, '2026-04-18T12:30:45.000Z')
    // Format: <ISO with - instead of :>-<slug capped to 40>
    const slug = id.split('Z-')[1]
    expect(slug.length).toBeLessThanOrEqual(40)
  })

  it('replaces illegal chars in path', () => {
    const id = buildId('a b/c?d.md', '2026-04-18T12:30:45.000Z')
    expect(id).toBe('2026-04-18T12-30-45.000Z-a-b_c-d.md')
  })

  it('strict ISO timestamps with milliseconds preserved (only : replaced)', () => {
    const id = buildId('x.md', '2026-04-18T12:30:45.999Z')
    expect(id.startsWith('2026-04-18T12-30-45.999Z-')).toBe(true)
  })
})
```

- [ ] **Step 2: Run them, confirm failure**

```bash
npx vitest run electron/services/conflicts/store.test.ts -t buildId
```

Expected: 4 FAIL ("not implemented").

- [ ] **Step 3: Implement `buildId`**

Edit `electron/services/conflicts/store.ts`. Replace the stub `export function buildId` with:

```ts
const SLUG_CAP = 40
const ILLEGAL = /[^A-Za-z0-9._-]/g

function slugifyPath(path: string): string {
  // POSIX-only: convert '/' → '_', other illegal chars → '-'
  const normalised = path.replace(/\//g, '_').replace(ILLEGAL, '-')
  return normalised.length > SLUG_CAP ? normalised.slice(0, SLUG_CAP) : normalised
}

export function buildId(path: string, isoTs: string): string {
  const safeTs = isoTs.replace(/:/g, '-')
  return `${safeTs}-${slugifyPath(path)}`
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run electron/services/conflicts/store.test.ts -t buildId
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/services/conflicts/store.ts electron/services/conflicts/store.test.ts
git commit -m "feat(conflicts): buildId(path, ts) with slug cap and char sanitisation (phase-09 3.1)"
```

---

<!-- openspec-task: 3.2 -->

### Task 8: implement `writeSnapshot`

**Files:**

- Modify: `electron/services/conflicts/store.ts`
- Modify: `electron/services/conflicts/store.test.ts`

- [ ] **Step 1: Write failing test**

Append to `electron/services/conflicts/store.test.ts`:

```ts
import { writeSnapshot, _internals } from './store'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

describe('writeSnapshot', () => {
  it('writes 4 files into <conflictsDir>/<id>/', async () => {
    const { id } = await writeSnapshot({
      path: 'notes/a.md',
      baseText: 'BASE',
      localText: 'LOCAL',
      remoteText: 'REMOTE',
      resolvedBy: 'keep_local'
    })
    const dir = join(_internals.requireConflictsRoot(), id)
    expect(await readFile(join(dir, 'local.md'), 'utf8')).toBe('LOCAL')
    expect(await readFile(join(dir, 'remote.md'), 'utf8')).toBe('REMOTE')
    expect(await readFile(join(dir, 'base.md'), 'utf8')).toBe('BASE')
    const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'))
    expect(meta).toMatchObject({
      path: 'notes/a.md',
      resolved_by: 'keep_local'
    })
    expect(typeof meta.ts).toBe('string')
  })

  it('records winner_path for save_as', async () => {
    const { id } = await writeSnapshot({
      path: 'notes/a.md',
      baseText: 'B',
      localText: 'L',
      remoteText: 'R',
      resolvedBy: 'save_as',
      winnerPath: 'notes/a.conflict.2026-04-18T12-30-45.md'
    })
    const dir = join(_internals.requireConflictsRoot(), id)
    const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'))
    expect(meta.winner_path).toBe('notes/a.conflict.2026-04-18T12-30-45.md')
  })

  it('triggers prune after write', async () => {
    // We assert this behaviour explicitly in Task 9 (3.3).
    // Here we just confirm writeSnapshot doesn't throw with a single entry.
    await expect(
      writeSnapshot({
        path: 'x.md',
        baseText: '',
        localText: '',
        remoteText: '',
        resolvedBy: 'load_remote'
      })
    ).resolves.toMatchObject({ id: expect.any(String) })
  })
})
```

- [ ] **Step 2: Run them, confirm failure**

```bash
npx vitest run electron/services/conflicts/store.test.ts -t writeSnapshot
```

Expected: 3 FAIL.

- [ ] **Step 3: Implement `writeSnapshot`**

Edit `electron/services/conflicts/store.ts`. Replace the stub:

```ts
export async function writeSnapshot(input: WriteSnapshotInput): Promise<{ id: string }> {
  const root = requireConflictsRoot()
  const ts = new Date().toISOString()
  const id = buildId(input.path, ts)
  const dir = safeResolve(root, id)
  await mkdir(dir, { recursive: true })

  const meta: ConflictMeta = {
    path: input.path,
    ts,
    resolved_by: input.resolvedBy,
    ...(input.winnerPath ? { winner_path: input.winnerPath } : {})
  }

  await Promise.all([
    writeFileAtomic(join(dir, 'local.md'), input.localText),
    writeFileAtomic(join(dir, 'remote.md'), input.remoteText),
    writeFileAtomic(join(dir, 'base.md'), input.baseText),
    writeFileAtomic(join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')
  ])

  // Best-effort prune; failures here MUST NOT break the write.
  try {
    await prune()
  } catch (err) {
    const { logger } = await import('../logger')
    logger.warn('conflict prune failed (non-fatal)', {
      message: err instanceof Error ? err.message : String(err)
    })
  }

  return { id }
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run electron/services/conflicts/store.test.ts -t writeSnapshot
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/services/conflicts/store.ts electron/services/conflicts/store.test.ts
git commit -m "feat(conflicts): writeSnapshot writes 4 files atomically (phase-09 3.2)"
```

---

<!-- openspec-task: 3.3 -->

### Task 9: implement `prune` (cap 100, age 30d)

**Files:**

- Modify: `electron/services/conflicts/store.ts`
- Modify: `electron/services/conflicts/store.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `electron/services/conflicts/store.test.ts`:

```ts
import { prune, listSnapshots } from './store'
import { mkdir, utimes } from 'node:fs/promises'

async function seedSnapshot(opts: { ts: string; path: string; ageDays?: number }): Promise<string> {
  const id = buildId(opts.path, opts.ts)
  const dir = join(_internals.requireConflictsRoot(), id)
  await mkdir(dir, { recursive: true })
  await Promise.all([
    writeFileAtomic(join(dir, 'local.md'), 'L'),
    writeFileAtomic(join(dir, 'remote.md'), 'R'),
    writeFileAtomic(join(dir, 'base.md'), 'B'),
    writeFileAtomic(
      join(dir, 'meta.json'),
      JSON.stringify({ path: opts.path, ts: opts.ts, resolved_by: 'keep_local' })
    )
  ])
  if (opts.ageDays !== undefined) {
    const t = (Date.now() - opts.ageDays * 24 * 60 * 60 * 1000) / 1000
    await utimes(dir, t, t)
  }
  return id
}

// Need to also import these to build snapshots
import { writeFileAtomic } from '../fs-atomic'
import { buildId } from './store'

describe('prune', () => {
  it('deletes oldest entries when count > 100', async () => {
    // Seed 102 snapshots — distinct TS so distinct ids
    for (let i = 0; i < 102; i++) {
      await seedSnapshot({
        ts: new Date(Date.now() + i).toISOString(),
        path: `n/${i}.md`
      })
    }
    const result = await prune()
    expect(result.deleted).toBe(2)
    const { total } = await listSnapshots({ limit: 200 })
    expect(total).toBe(100)
  })

  it('deletes entries older than 30 days', async () => {
    await seedSnapshot({
      ts: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
      path: 'old.md',
      ageDays: 31
    })
    await seedSnapshot({
      ts: new Date().toISOString(),
      path: 'new.md'
    })
    const result = await prune()
    expect(result.deleted).toBe(1)
    const { items } = await listSnapshots({ limit: 10 })
    expect(items.map((i) => i.path)).toEqual(['new.md'])
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run electron/services/conflicts/store.test.ts -t prune
```

Expected: 2 FAIL (and `listSnapshots` may also fail since not implemented — that's fine, we'll fix that in Task 10; for now, the prune FAILs are the signal).

- [ ] **Step 3: Implement `prune`**

Edit `electron/services/conflicts/store.ts`. Replace the stub:

```ts
export async function prune(): Promise<{ deleted: number }> {
  const root = requireConflictsRoot()
  let entries: string[]
  try {
    entries = await readdir(root)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { deleted: 0 }
    throw err
  }

  // Stat each entry, drop missing/invalid
  const stats: Array<{ id: string; mtimeMs: number }> = []
  for (const id of entries) {
    try {
      const st = await stat(join(root, id))
      if (st.isDirectory()) stats.push({ id, mtimeMs: st.mtimeMs })
    } catch {
      /* skip */
    }
  }

  // Sort newest first
  stats.sort((a, b) => b.mtimeMs - a.mtimeMs)

  const cutoff = Date.now() - MAX_AGE_MS
  const toDelete: string[] = []

  // Age-based prune: anything older than cutoff
  for (const e of stats) {
    if (e.mtimeMs < cutoff) toDelete.push(e.id)
  }
  // Count-based prune: keep at most MAX_KEEP newest (after age filter)
  const keepers = stats.filter((e) => e.mtimeMs >= cutoff)
  if (keepers.length > MAX_KEEP) {
    for (const e of keepers.slice(MAX_KEEP)) toDelete.push(e.id)
  }

  for (const id of toDelete) {
    const target = safeResolve(root, id)
    await rm(target, { recursive: true, force: true })
  }
  return { deleted: toDelete.length }
}
```

- [ ] **Step 4: Run, confirm pass**

The prune-only tests should pass; `listSnapshots`-dependent assertions will still fail until Task 10. Run only the prune tests:

```bash
npx vitest run electron/services/conflicts/store.test.ts -t "prune deletes oldest"
npx vitest run electron/services/conflicts/store.test.ts -t "prune deletes entries older"
```

For now, comment out the `listSnapshots` assertion lines (or accept those failures and they'll resolve after Task 10). The cleanest path: convert the `listSnapshots(...).total` check into a direct `readdir` count:

```ts
import { readdir } from 'node:fs/promises'
// inside test:
const remaining = await readdir(_internals.requireConflictsRoot())
expect(remaining.length).toBe(100)
```

Update both prune tests to use `readdir` instead of `listSnapshots`. Re-run:

```bash
npx vitest run electron/services/conflicts/store.test.ts -t prune
```

Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/services/conflicts/store.ts electron/services/conflicts/store.test.ts
git commit -m "feat(conflicts): prune retention policy (100 newest, 30d cap) (phase-09 3.3)"
```

---

<!-- openspec-task: 3.4 -->

### Task 10: implement `listSnapshots`

**Files:**

- Modify: `electron/services/conflicts/store.ts`
- Modify: `electron/services/conflicts/store.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `electron/services/conflicts/store.test.ts`:

```ts
describe('listSnapshots', () => {
  it('returns items sorted by ts descending with total', async () => {
    await writeSnapshot({
      path: 'a.md',
      baseText: '',
      localText: '',
      remoteText: '',
      resolvedBy: 'keep_local'
    })
    await new Promise((r) => setTimeout(r, 5)) // ensure distinct ts
    await writeSnapshot({
      path: 'b.md',
      baseText: '',
      localText: '',
      remoteText: '',
      resolvedBy: 'load_remote'
    })
    const { items, total } = await listSnapshots({})
    expect(total).toBe(2)
    expect(items[0].path).toBe('b.md') // newest first
    expect(items[1].path).toBe('a.md')
    expect(items[0].resolved_by).toBe('load_remote')
  })

  it('respects limit + offset', async () => {
    for (let i = 0; i < 5; i++) {
      await writeSnapshot({
        path: `n${i}.md`,
        baseText: '',
        localText: '',
        remoteText: '',
        resolvedBy: 'keep_local'
      })
      await new Promise((r) => setTimeout(r, 2))
    }
    const { items, total } = await listSnapshots({ limit: 2, offset: 1 })
    expect(total).toBe(5)
    expect(items.length).toBe(2)
    // newest first → offset 1 means skip the newest one
    expect(items[0].path).toBe('n3.md')
    expect(items[1].path).toBe('n2.md')
  })

  it('skips entries with corrupt meta.json (does not throw)', async () => {
    await writeSnapshot({
      path: 'good.md',
      baseText: '',
      localText: '',
      remoteText: '',
      resolvedBy: 'keep_local'
    })
    // Inject a corrupt entry
    const root = _internals.requireConflictsRoot()
    const badDir = join(root, 'corrupt-id')
    await mkdir(badDir, { recursive: true })
    await writeFileAtomic(join(badDir, 'meta.json'), 'not json {{{')
    const { items, total } = await listSnapshots({})
    expect(total).toBe(1)
    expect(items[0].path).toBe('good.md')
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run electron/services/conflicts/store.test.ts -t listSnapshots
```

Expected: 3 FAIL.

- [ ] **Step 3: Implement**

Edit `electron/services/conflicts/store.ts`. Replace the stub:

```ts
export async function listSnapshots(
  opts: { limit?: number; offset?: number } = {}
): Promise<{ items: ConflictItem[]; total: number }> {
  const root = requireConflictsRoot()
  let dirEntries: string[]
  try {
    dirEntries = await readdir(root)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { items: [], total: 0 }
    }
    throw err
  }

  const items: ConflictItem[] = []
  for (const id of dirEntries) {
    const dir = join(root, id)
    try {
      const st = await stat(dir)
      if (!st.isDirectory()) continue
      const raw = await readFile(join(dir, 'meta.json'), 'utf8')
      const meta = JSON.parse(raw) as ConflictMeta
      items.push({
        id,
        path: meta.path,
        ts: meta.ts,
        resolved_by: meta.resolved_by,
        ...(meta.winner_path ? { winner_path: meta.winner_path } : {})
      })
    } catch {
      // Skip corrupt or unreadable entries (logged at higher levels if needed)
      continue
    }
  }

  items.sort((a, b) => b.ts.localeCompare(a.ts))
  const total = items.length
  const offset = opts.offset ?? 0
  const limit = opts.limit ?? Number.MAX_SAFE_INTEGER
  const slice = items.slice(offset, offset + limit)
  return { items: slice, total }
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run electron/services/conflicts/store.test.ts -t listSnapshots
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/services/conflicts/store.ts electron/services/conflicts/store.test.ts
git commit -m "feat(conflicts): listSnapshots with pagination + corrupt-entry tolerance (phase-09 3.4)"
```

---

<!-- openspec-task: 3.5 -->

### Task 11: implement `readSnapshot`

**Files:**

- Modify: `electron/services/conflicts/store.ts`
- Modify: `electron/services/conflicts/store.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `electron/services/conflicts/store.test.ts`:

```ts
import { readSnapshot } from './store'

describe('readSnapshot', () => {
  it('returns meta + 3 text bodies', async () => {
    const { id } = await writeSnapshot({
      path: 'a.md',
      baseText: 'B',
      localText: 'L',
      remoteText: 'R',
      resolvedBy: 'keep_local'
    })
    const result = await readSnapshot(id)
    expect(result.localText).toBe('L')
    expect(result.remoteText).toBe('R')
    expect(result.baseText).toBe('B')
    expect(result.meta.path).toBe('a.md')
    expect(result.meta.resolved_by).toBe('keep_local')
  })

  it('throws E_NOT_FOUND for missing id', async () => {
    await expect(readSnapshot('does-not-exist')).rejects.toMatchObject({
      code: 'E_NOT_FOUND'
    })
  })

  it('throws E_PERMISSION on path-escape attempt', async () => {
    await expect(readSnapshot('../../etc/passwd')).rejects.toMatchObject({
      code: 'E_PERMISSION'
    })
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run electron/services/conflicts/store.test.ts -t readSnapshot
```

Expected: 3 FAIL.

- [ ] **Step 3: Implement**

Edit `electron/services/conflicts/store.ts`. Replace the stub:

```ts
export async function readSnapshot(id: string): Promise<ReadSnapshotResult> {
  const root = requireConflictsRoot()
  let dir: string
  try {
    dir = safeResolve(root, id)
  } catch (err) {
    // safeResolve throws on escape; map to E_PERMISSION
    if (err instanceof IpcError) throw err
    throw new IpcError('E_PERMISSION', `invalid snapshot id: ${id}`)
  }
  try {
    const [metaRaw, localText, remoteText, baseText] = await Promise.all([
      readFile(join(dir, 'meta.json'), 'utf8'),
      readFile(join(dir, 'local.md'), 'utf8'),
      readFile(join(dir, 'remote.md'), 'utf8'),
      readFile(join(dir, 'base.md'), 'utf8')
    ])
    return {
      meta: JSON.parse(metaRaw) as ConflictMeta,
      localText,
      remoteText,
      baseText
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new IpcError('E_NOT_FOUND', `conflict snapshot ${id} not found`)
    }
    throw err
  }
}
```

Confirm `safeResolve` throws `E_PERMISSION` for `../`. Open `electron/services/path-safety.ts` to verify; if it throws a different code, adapt the catch in `readSnapshot` and `deleteSnapshot` (Task 12).

```bash
grep -n "throw" /Users/aaa/develop/workspace-ai/acornvo/electron/services/path-safety.ts
```

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run electron/services/conflicts/store.test.ts -t readSnapshot
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/services/conflicts/store.ts electron/services/conflicts/store.test.ts
git commit -m "feat(conflicts): readSnapshot returns meta + 3 bodies, E_NOT_FOUND/E_PERMISSION (phase-09 3.5)"
```

---

<!-- openspec-task: 3.6 -->

### Task 12: implement `deleteSnapshot`

**Files:**

- Modify: `electron/services/conflicts/store.ts`
- Modify: `electron/services/conflicts/store.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `electron/services/conflicts/store.test.ts`:

```ts
import { deleteSnapshot } from './store'

describe('deleteSnapshot', () => {
  it('removes the directory recursively', async () => {
    const { id } = await writeSnapshot({
      path: 'a.md',
      baseText: '',
      localText: '',
      remoteText: '',
      resolvedBy: 'keep_local'
    })
    await deleteSnapshot(id)
    await expect(readSnapshot(id)).rejects.toMatchObject({ code: 'E_NOT_FOUND' })
  })

  it('throws E_PERMISSION on path-escape attempt', async () => {
    await expect(deleteSnapshot('../../etc')).rejects.toMatchObject({
      code: 'E_PERMISSION'
    })
  })

  it('is idempotent: deleting non-existent id resolves OK', async () => {
    // Spec defines E_NOT_FOUND for read, but delete is best-effort idempotent.
    // Our impl uses fs.rm({ force: true }) so missing dirs do not throw.
    await expect(deleteSnapshot('does-not-exist')).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run electron/services/conflicts/store.test.ts -t deleteSnapshot
```

Expected: 3 FAIL.

- [ ] **Step 3: Implement**

Edit `electron/services/conflicts/store.ts`. Replace the stub:

```ts
export async function deleteSnapshot(id: string): Promise<void> {
  const root = requireConflictsRoot()
  let target: string
  try {
    target = safeResolve(root, id)
  } catch (err) {
    if (err instanceof IpcError) throw err
    throw new IpcError('E_PERMISSION', `invalid snapshot id: ${id}`)
  }
  await rm(target, { recursive: true, force: true })
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run electron/services/conflicts/store.test.ts -t deleteSnapshot
```

Expected: 3 PASS.

- [ ] **Step 5: Run the full conflict store test file**

```bash
npx vitest run electron/services/conflicts/store.test.ts
```

Expected: all PASS (smoke + buildId + writeSnapshot + prune + listSnapshots + readSnapshot + deleteSnapshot).

- [ ] **Step 6: Run the full unit suite to catch regressions**

```bash
npm test
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add electron/services/conflicts/store.ts electron/services/conflicts/store.test.ts
git commit -m "feat(conflicts): deleteSnapshot with safeResolve guard + idempotency (phase-09 3.6)"
```

---

## Self-Review

After all tasks pass:

1. **Spec coverage:** This plan covers tasks 1.1, 1.2, 1.3, 2.1, 2.2 (and the 2.2.1/2.2.2/2.2.3 sub-bullets via Task 5), 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6. Confirm by grepping plan for `openspec-task`:

```bash
grep -E "openspec-task: (1\.[1-3]|2\.[1-3]|3\.[1-6])" /Users/aaa/develop/workspace-ai/acornvo/docs/superpowers/plans/2026-04-30-phase-09-conflict-handling-tasks-1.1-3.6.md | sort -u
```

Expected: 12 unique labels.

2. **`writeSnapshot` calls `prune` (task 3.2 → 3.3):** look at the implementation in Task 8 — yes, the `try { await prune() }` block is present.

3. **No placeholders:** every step has either runnable code, a runnable command, or a commit message. ✓

4. **Type consistency:** `ConflictResolvedBy` enum is used consistently as `'keep_local' | 'load_remote' | 'load_remote_banner' | 'save_as'` across `shared/conflict-types.ts`, `writeSnapshot` input, and tests.
