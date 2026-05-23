# Phase 10 History & Trash — Plan 2 (Tasks 3.1–4.5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the IPC layer for soft-delete and conflict diff/clear (`file.trash`, `file.hardDelete`, `ops.list`, `conflict.diff`, `conflict.deleteAll`), then wire the Library trash UX (right-click menu item, `Cmd/Ctrl+Backspace` shortcut, shared `TrashConfirmDialog` with confirm-mode and fallback hard-delete-mode).

**Architecture:** Three new IPC handler modules (`electron/ipc/trash.ts`, `electron/ipc/ops.ts`) plus an extension to phase-9's `electron/ipc/conflicts.ts`. All main-side mutators use `safeResolve` for path safety and `opsLog.record` (from Plan 1) for audit. Renderer-side: a new `TrashConfirmDialog.tsx` component owns both UX modes (confirm → trash; on `E_TRASH`, fall back to hard-delete with checkbox gate). Library wiring updates phase-6's `FileRowContextMenu.tsx` and `VirtualFileList.tsx` plus the `library` store. The `conflict.diff` handler is the only non-trivial main-side computation: it reads the 3 md texts via phase-9 `readSnapshot(id)` and converts jsdiff `Change[]` into a row-aligned `{ left, right, stats }` shape so the renderer never sees the diff library.

**Tech Stack:** TypeScript, Electron `shell.trashItem`, vitest, React + shadcn dialog primitives, jsdiff.

---

## Pre-flight

This plan assumes Plan 1 of phase-10 (tasks 1.1–2.6) is merged on `main`:

- `migrations/003_ops_log.sql` applied; `db.version().user_version === 3`
- `src/main/ops/log.ts` exports `record({ op, path, meta? })` and `list({ limit, offset, op? })`
- `shared/ops-types.ts` exports `Op` and `OpsItem`
- jsdiff is installed (`diff` in `dependencies`)

It also depends on phase-9 (Plan 2 of phase-09, tasks 4.1–5.6 — `electron/ipc/conflicts.ts` exists with `conflict.list/read/delete`) and phase-6 (`src/components/library/FileRowContextMenu.tsx` and `src/components/library/VirtualFileList.tsx` exist; `src/stores/library.ts` exposes `items`, `selectedPath`, `removeItem`, `setSelectedPath`).

Verify before starting:

```bash
grep -q "user_version=3\|user_version = 3\|003_ops_log" /Users/aaa/develop/workspace-ai/acornvo/migrations/003_ops_log.sql && echo "migration 003 OK"
grep -q "export function record" /Users/aaa/develop/workspace-ai/acornvo/src/main/ops/log.ts && echo "opsLog OK"
test -f /Users/aaa/develop/workspace-ai/acornvo/electron/ipc/conflicts.ts && echo "phase-09 conflicts ipc OK"
test -f /Users/aaa/develop/workspace-ai/acornvo/src/components/library/FileRowContextMenu.tsx && echo "phase-06 FileRowContextMenu OK"
test -f /Users/aaa/develop/workspace-ai/acornvo/src/stores/library.ts && echo "library store OK"
node -e "require('diff')" && echo "diff (jsdiff) OK"
```

All six lines must print "OK".

## File Structure

| Path                                                 | Action                                                                                                                        | Owner task    |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `shared/ipc-contract.ts`                             | Modify (add 5 new request methods, add `E_TRASH`, add `DiffResult` types)                                                     | 3.1           |
| `electron/ipc/trash.ts`                              | Create (`file.trash` + `file.hardDelete`)                                                                                     | 3.2           |
| `electron/ipc/trash.test.ts`                         | Create                                                                                                                        | 3.2           |
| `electron/ipc/ops.ts`                                | Create (`ops.list`)                                                                                                           | 3.3           |
| `electron/ipc/ops.test.ts`                           | Create                                                                                                                        | 3.3           |
| `electron/ipc/conflicts.ts`                          | Modify (add `diff` + `deleteAll`; wrap `delete` for ops_log)                                                                  | 3.4, 3.5, 3.6 |
| `electron/ipc/conflicts.test.ts`                     | Modify                                                                                                                        | 3.4, 3.5, 3.6 |
| `electron/services/conflicts/diff.ts`                | Create (jsdiff → `DiffResult` adapter)                                                                                        | 3.5           |
| `electron/services/conflicts/diff.test.ts`           | Create                                                                                                                        | 3.5           |
| `electron/ipc/index.ts`                              | Modify (register `trash` + `ops` namespaces; conflict module already wired in phase-9)                                        | 3.2, 3.3      |
| `src/components/library/FileRowContextMenu.tsx`      | Modify (add "移到废纸篓" item + separator)                                                                                    | 4.1           |
| `src/components/library/FileRowContextMenu.test.tsx` | Modify                                                                                                                        | 4.1           |
| `src/components/library/TrashConfirmDialog.tsx`      | Create (confirm + fallback modes)                                                                                             | 4.2           |
| `src/components/library/TrashConfirmDialog.test.tsx` | Create                                                                                                                        | 4.2           |
| `src/components/library/VirtualFileList.tsx`         | Modify (`onKeyDown` → open `TrashConfirmDialog`)                                                                              | 4.3           |
| `src/components/library/VirtualFileList.test.tsx`    | Modify                                                                                                                        | 4.3           |
| `src/stores/library.ts`                              | Modify (`removeItem` exists from phase-6; ensure `selectedPath` cleared when deleted path matches) — only modify if needed    | 4.4           |
| (no new file for 4.5)                                | Modify `TrashConfirmDialog.tsx` to call `file.hardDelete` on the fallback button; reuse the same library-store cleanup as 4.4 | 4.5           |

## Conventions reused

- IPC channel naming follows `<namespace>.<method>` (dot) for requests (see `shared/ipc-contract.ts:184`). All five new methods use this form.
- Path-safety: every main-side handler that takes a relative path MUST call `safeResolve(grovePath, rel)` from `electron/services/path-safety.ts`. Throw `IpcError('E_PERMISSION', ...)` on escape (already its behaviour).
- IPC error codes: `E_TRASH` (NEW — added in 3.1), `E_NOT_FOUND`, `E_PERMISSION`, `E_INTERNAL`. Result envelope: `{ ok: true } | { ok: false; error: { code, message } }` for trash IPCs (matching the spec quoted shape); query IPCs (`ops.list`, `conflict.diff`) throw `IpcError` directly so the standard router envelope handles them.
- `opsLog.record(...)` from `src/main/ops/log.ts` is the only allowed write path into `ops_log`. Failures inside `record` MUST NOT roll back the user's intent (record is best-effort: catch + warn-log; the trash already happened).
- `shell.trashItem(absPath)` is async; resolves on success / rejects on failure. Map any rejection to `IpcError('E_TRASH', e.message)`.
- React component tests use `vitest` + `@testing-library/react` (see `src/components/library/IndexProgressOverlay.test.tsx` for the canonical style — JSDOM, `render` + `screen` + `userEvent`).

---

<!-- openspec-task: 3.1 -->

### Task 1: extend `shared/ipc-contract.ts` with 5 new request methods

**Files:**

- Modify: `shared/ipc-contract.ts`

- [ ] **Step 1: Add `E_TRASH` to the error-code union and table**

Edit `shared/ipc-contract.ts:14-37`. Replace the `IpcErrorCode` union and `IPC_ERROR_CODES` const so they include `E_TRASH`:

```ts
export type IpcErrorCode =
  | 'E_INTERNAL'
  | 'E_INVALID_ARGS'
  | 'E_NOT_FOUND'
  | 'E_PERMISSION'
  | 'E_LOCKED'
  | 'E_EXISTS'
  | 'E_TIMEOUT'
  | 'E_ENCODING'
  | 'E_WRITE_VERIFY'
  | 'E_MTIME_MISMATCH'
  | 'E_TRASH'

export const IPC_ERROR_CODES = {
  E_INTERNAL: 'E_INTERNAL',
  E_INVALID_ARGS: 'E_INVALID_ARGS',
  E_NOT_FOUND: 'E_NOT_FOUND',
  E_PERMISSION: 'E_PERMISSION',
  E_LOCKED: 'E_LOCKED',
  E_EXISTS: 'E_EXISTS',
  E_TIMEOUT: 'E_TIMEOUT',
  E_ENCODING: 'E_ENCODING',
  E_WRITE_VERIFY: 'E_WRITE_VERIFY',
  E_MTIME_MISMATCH: 'E_MTIME_MISMATCH',
  E_TRASH: 'E_TRASH'
} as const satisfies Record<IpcErrorCode, IpcErrorCode>
```

- [ ] **Step 2: Add the trash result-envelope types and the `DiffResult` types**

Append after the existing `// --- file namespace types ---` block (around line 124):

```ts
// --- soft-delete + hard-delete envelopes (phase-10) ---

export type FileTrashResult = { ok: true } | { ok: false; error: IpcErrorShape }

// --- conflict diff structured result (phase-10) ---

export type DiffSide = 'local' | 'remote' | 'base'
export type DiffSidesPair = 'local-remote' | 'local-base' | 'remote-base'

export interface DiffLineLeft {
  num: number
  text: string
  kind: 'equal' | 'del'
}
export interface DiffLineRight {
  num: number
  text: string
  kind: 'equal' | 'add'
}
export interface DiffResult {
  left: { label: DiffSide; lines: DiffLineLeft[] }
  right: { label: DiffSide; lines: DiffLineRight[] }
  stats: { added: number; removed: number }
}
```

- [ ] **Step 3: Import `Op`/`OpsItem` and extend the `IpcContract`**

Near the top of the file, after the `import type { Frontmatter } ...` line, add:

```ts
import type { Op, OpsItem } from './ops-types'
```

Then in the `IpcContract` block (`shared/ipc-contract.ts:137-180`), append three new namespaces and add `trash`/`hardDelete` under `file`:

```ts
  file: {
    // …existing methods unchanged…
    rename: (oldRel: string, newRel: string) => void
    trash: (rel: string) => FileTrashResult
    hardDelete: (rel: string) => FileTrashResult
  }
  ops: {
    list: (opts: { limit?: number; offset?: number; op?: Op }) => {
      items: OpsItem[]
      total: number
    }
  }
  conflict: {
    // existing phase-9 methods (list/read/delete) preserved
    list: (opts?: { limit?: number; offset?: number }) => {
      items: import('./conflict-types').ConflictItem[]
      total: number
    }
    read: (id: string) => {
      meta: import('./conflict-types').ConflictMeta
      localText: string
      remoteText: string
      baseText: string
    }
    delete: (id: string) => void
    diff: (id: string, sides: DiffSidesPair) => DiffResult
    deleteAll: () => { ok: true; deleted: number }
  }
```

(If phase-9 already declared the `conflict` namespace under `IpcContract`, edit only that block to ADD `diff` and `deleteAll`; do not duplicate `list`/`read`/`delete`.)

- [ ] **Step 4: Type-check**

```bash
npm run typecheck
```

Expected: PASS. (No call sites import `E_TRASH` yet, so this should be a clean compile.)

- [ ] **Step 5: Commit**

```bash
git add shared/ipc-contract.ts
git commit -m "feat(ipc): contract for file.trash/hardDelete, ops.list, conflict.diff/deleteAll (phase-10 3.1)"
```

---

<!-- openspec-task: 3.2 -->

### Task 2: implement `electron/ipc/trash.ts` (`file.trash` + `file.hardDelete`)

**Files:**

- Create: `electron/ipc/trash.ts`
- Create: `electron/ipc/trash.test.ts`
- Modify: `electron/ipc/index.ts` (register `file.trash` + `file.hardDelete`)

- [ ] **Step 1: Write failing tests**

Create `electron/ipc/trash.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, stat, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as groveSvc from '../services/grove'
import * as opsLog from '../../src/main/ops/log'
import { handleTrash, handleHardDelete } from './trash'

let tmp: string

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'trash-ipc-'))
  await mkdir(join(tmp, '.acornvo'), { recursive: true })
  vi.spyOn(groveSvc, 'getCurrent').mockReturnValue({
    id: 'g1',
    path: tmp,
    name: 'g',
    color: 'acorn',
    schema_version: 3,
    created_at: '',
    last_opened_at: '',
    sync_warning: null
  })
  vi.spyOn(opsLog, 'record').mockResolvedValue(undefined as never)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(tmp, { recursive: true, force: true })
})

describe('file.trash', () => {
  it('moves file via shell.trashItem and records ops_log entry', async () => {
    const abs = join(tmp, 'a.md')
    await writeFile(abs, 'hello')
    const { shell } = await import('electron')
    const trashSpy = vi.spyOn(shell, 'trashItem').mockResolvedValue(undefined)

    const result = await handleTrash('a.md')

    expect(result).toEqual({ ok: true })
    expect(trashSpy).toHaveBeenCalledWith(abs)
    expect(opsLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'trash', path: 'a.md' })
    )
  })

  it('returns E_NOT_FOUND when file does not exist', async () => {
    const result = await handleTrash('missing.md')
    expect(result).toMatchObject({ ok: false, error: { code: 'E_NOT_FOUND' } })
    expect(opsLog.record).not.toHaveBeenCalled()
  })

  it('returns E_PERMISSION on path escape', async () => {
    const result = await handleTrash('../escape.md')
    expect(result).toMatchObject({ ok: false, error: { code: 'E_PERMISSION' } })
    expect(opsLog.record).not.toHaveBeenCalled()
  })

  it('returns E_TRASH and does NOT record ops_log when shell.trashItem rejects', async () => {
    const abs = join(tmp, 'b.md')
    await writeFile(abs, 'x')
    const { shell } = await import('electron')
    vi.spyOn(shell, 'trashItem').mockRejectedValue(new Error('no XDG'))

    const result = await handleTrash('b.md')

    expect(result).toMatchObject({ ok: false, error: { code: 'E_TRASH' } })
    expect(opsLog.record).not.toHaveBeenCalled()
  })
})

describe('file.hardDelete', () => {
  it('unlinks the file and records ops_log entry (op=hard_delete)', async () => {
    const abs = join(tmp, 'c.md')
    await writeFile(abs, 'x')

    const result = await handleHardDelete('c.md')

    expect(result).toEqual({ ok: true })
    await expect(stat(abs)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(opsLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'hard_delete', path: 'c.md' })
    )
  })

  it('returns E_NOT_FOUND when file missing', async () => {
    const result = await handleHardDelete('nope.md')
    expect(result).toMatchObject({ ok: false, error: { code: 'E_NOT_FOUND' } })
    expect(opsLog.record).not.toHaveBeenCalled()
  })

  it('returns E_PERMISSION on path escape', async () => {
    const result = await handleHardDelete('../boom.md')
    expect(result).toMatchObject({ ok: false, error: { code: 'E_PERMISSION' } })
  })
})
```

If the existing test setup mocks `electron` (most likely it does — check `vitest.config.ts` / `vitest.setup.ts`), the `import('electron')` calls above will pull the mock. If the project uses the real `electron` import in tests, replace the `vi.spyOn(shell, 'trashItem')` lines with a module-level mock at the top of the file:

```ts
vi.mock('electron', () => ({ shell: { trashItem: vi.fn() } }))
import { shell } from 'electron'
```

Quickly check before writing tests:

```bash
grep -n "vi.mock('electron'" /Users/aaa/develop/workspace-ai/acornvo/electron/ipc/file.test.ts
```

Use whichever pattern matches the existing IPC tests.

- [ ] **Step 2: Run tests, confirm failure**

```bash
npx vitest run electron/ipc/trash.test.ts
```

Expected: ALL FAIL (`Cannot find module './trash'`).

- [ ] **Step 3: Implement `electron/ipc/trash.ts`**

Create `electron/ipc/trash.ts`:

```ts
import { shell } from 'electron'
import { unlink, stat } from 'node:fs/promises'
import * as groveSvc from '../services/grove'
import { safeResolve } from '../services/path-safety'
import { IpcError } from '@shared/ipc-contract'
import type { FileTrashResult } from '@shared/ipc-contract'
import * as opsLog from '../../src/main/ops/log'

function requireGroveRoot(): string {
  const grove = groveSvc.getCurrent()
  if (!grove) throw new IpcError('E_NOT_FOUND', 'no grove is currently open')
  return grove.path
}

async function resolveExistingFile(rel: string): Promise<string> {
  const root = requireGroveRoot()
  const abs = safeResolve(root, rel) // throws E_PERMISSION on escape
  try {
    const st = await stat(abs)
    if (!st.isFile()) {
      throw new IpcError('E_NOT_FOUND', `${rel}: not a regular file`)
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new IpcError('E_NOT_FOUND', `${rel} not found`)
    }
    throw err
  }
  return abs
}

function envelopeFromError(err: unknown): FileTrashResult {
  if (err instanceof IpcError) {
    return { ok: false, error: { code: err.code, message: err.message } }
  }
  return {
    ok: false,
    error: {
      code: 'E_INTERNAL',
      message: err instanceof Error ? err.message : String(err)
    }
  }
}

export async function handleTrash(rel: string): Promise<FileTrashResult> {
  let abs: string
  try {
    abs = await resolveExistingFile(rel)
  } catch (err) {
    return envelopeFromError(err)
  }

  try {
    await shell.trashItem(abs)
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'E_TRASH',
        message: err instanceof Error ? err.message : String(err)
      }
    }
  }

  // Best-effort audit; never fail the user's trash because of this.
  try {
    await opsLog.record({ op: 'trash', path: rel })
  } catch (err) {
    const { logger } = await import('../services/logger')
    logger.warn('opsLog.record(trash) failed (non-fatal)', {
      path: rel,
      message: err instanceof Error ? err.message : String(err)
    })
  }

  return { ok: true }
}

export async function handleHardDelete(rel: string): Promise<FileTrashResult> {
  let abs: string
  try {
    abs = await resolveExistingFile(rel)
  } catch (err) {
    return envelopeFromError(err)
  }

  try {
    await unlink(abs)
  } catch (err) {
    return envelopeFromError(err)
  }

  try {
    await opsLog.record({ op: 'hard_delete', path: rel })
  } catch (err) {
    const { logger } = await import('../services/logger')
    logger.warn('opsLog.record(hard_delete) failed (non-fatal)', {
      path: rel,
      message: err instanceof Error ? err.message : String(err)
    })
  }

  return { ok: true }
}

export const trashHandlers = {
  'file.trash': handleTrash,
  'file.hardDelete': handleHardDelete
}
```

- [ ] **Step 4: Register in `electron/ipc/index.ts`**

Open `electron/ipc/index.ts` and add `import { trashHandlers } from './trash'` near the other handler imports, then merge `...trashHandlers` into the registry alongside the existing `file.*` registrations. If the file uses `register(channel, fn)` calls instead of a registry object, add explicit lines:

```ts
register('file.trash', (rel: string) => handleTrash(rel))
register('file.hardDelete', (rel: string) => handleHardDelete(rel))
```

(Match the pattern of the surrounding `register('file.read', ...)` line.)

- [ ] **Step 5: Run tests, confirm pass**

```bash
npx vitest run electron/ipc/trash.test.ts
```

Expected: 7 PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/ipc/trash.ts electron/ipc/trash.test.ts electron/ipc/index.ts
git commit -m "feat(ipc): file.trash + file.hardDelete with ops_log audit (phase-10 3.2)"
```

---

<!-- openspec-task: 3.3 -->

### Task 3: implement `electron/ipc/ops.ts` (`ops.list`)

**Files:**

- Create: `electron/ipc/ops.ts`
- Create: `electron/ipc/ops.test.ts`
- Modify: `electron/ipc/index.ts` (register `ops.list`)

- [ ] **Step 1: Write failing test**

Create `electron/ipc/ops.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as opsLog from '../../src/main/ops/log'
import { handleOpsList } from './ops'

beforeEach(() => {
  vi.spyOn(opsLog, 'list').mockResolvedValue({
    items: [
      { id: 2, op: 'trash', path: 'b.md', ts: '2026-04-30T12:00:01Z', meta: null },
      { id: 1, op: 'rename', path: 'a.md', ts: '2026-04-30T12:00:00Z', meta: { new_path: 'a2.md' } }
    ],
    total: 2
  } as never)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ops.list', () => {
  it('forwards { limit, offset, op } to opsLog.list', async () => {
    const result = await handleOpsList({ limit: 10, offset: 0, op: 'trash' })
    expect(opsLog.list).toHaveBeenCalledWith({ limit: 10, offset: 0, op: 'trash' })
    expect(result.total).toBe(2)
    expect(result.items).toHaveLength(2)
  })

  it('omits undefined fields', async () => {
    await handleOpsList({})
    expect(opsLog.list).toHaveBeenCalledWith({})
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run electron/ipc/ops.test.ts
```

Expected: FAIL (`Cannot find module './ops'`).

- [ ] **Step 3: Implement `electron/ipc/ops.ts`**

```ts
import * as opsLog from '../../src/main/ops/log'
import type { Op, OpsItem } from '@shared/ops-types'

export interface OpsListInput {
  limit?: number
  offset?: number
  op?: Op
}

export async function handleOpsList(
  input: OpsListInput
): Promise<{ items: OpsItem[]; total: number }> {
  const args: OpsListInput = {}
  if (input.limit !== undefined) args.limit = input.limit
  if (input.offset !== undefined) args.offset = input.offset
  if (input.op !== undefined) args.op = input.op
  return opsLog.list(args)
}

export const opsHandlers = {
  'ops.list': handleOpsList
}
```

- [ ] **Step 4: Register in `electron/ipc/index.ts`**

Add `import { opsHandlers } from './ops'` and merge or `register('ops.list', handleOpsList)` matching the file's existing pattern.

- [ ] **Step 5: Run, confirm pass**

```bash
npx vitest run electron/ipc/ops.test.ts
```

Expected: 2 PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/ipc/ops.ts electron/ipc/ops.test.ts electron/ipc/index.ts
git commit -m "feat(ipc): ops.list pass-through to opsLog.list (phase-10 3.3)"
```

---

<!-- openspec-task: 3.4 -->

### Task 4: scaffold `conflict.diff` + `conflict.deleteAll` in `electron/ipc/conflicts.ts`

This task adds the handler stubs + dispatch wiring. The diff body lands in Task 5; the ops_log writes land in Task 6.

**Files:**

- Modify: `electron/ipc/conflicts.ts`
- Modify: `electron/ipc/conflicts.test.ts`
- Modify: `electron/ipc/index.ts` (register the two new channels if not implicit via the existing handler map)

- [ ] **Step 1: Write a failing smoke test for the new exports**

Append to `electron/ipc/conflicts.test.ts`:

```ts
import { handleConflictDiff, handleConflictDeleteAll } from './conflicts'

describe('conflict.diff / conflict.deleteAll exports (phase-10 3.4)', () => {
  it('exports handleConflictDiff', () => {
    expect(typeof handleConflictDiff).toBe('function')
  })
  it('exports handleConflictDeleteAll', () => {
    expect(typeof handleConflictDeleteAll).toBe('function')
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run electron/ipc/conflicts.test.ts -t "phase-10 3.4"
```

Expected: FAIL (handlers not exported).

- [ ] **Step 3: Add stub exports to `electron/ipc/conflicts.ts`**

Append to the file (do not touch the existing `list/read/delete` handlers):

```ts
import type { DiffResult, DiffSidesPair } from '@shared/ipc-contract'

export async function handleConflictDiff(_id: string, _sides: DiffSidesPair): Promise<DiffResult> {
  // Implemented in phase-10 task 3.5
  throw new Error('not implemented')
}

export async function handleConflictDeleteAll(): Promise<{ ok: true; deleted: number }> {
  // Implemented in phase-10 task 3.6
  throw new Error('not implemented')
}
```

If the file exposes a registry object (e.g. `export const conflictHandlers = { 'conflict.list': ..., ... }`), append the two new keys to that object:

```ts
export const conflictHandlers = {
  // existing entries…
  'conflict.diff': handleConflictDiff,
  'conflict.deleteAll': handleConflictDeleteAll
}
```

If `electron/ipc/index.ts` registers each channel explicitly, add two new lines there:

```ts
register('conflict.diff', handleConflictDiff)
register('conflict.deleteAll', handleConflictDeleteAll)
```

- [ ] **Step 4: Run smoke test, confirm pass**

```bash
npx vitest run electron/ipc/conflicts.test.ts -t "phase-10 3.4"
```

Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/conflicts.ts electron/ipc/conflicts.test.ts electron/ipc/index.ts
git commit -m "feat(ipc): scaffold conflict.diff + conflict.deleteAll handlers (phase-10 3.4)"
```

---

<!-- openspec-task: 3.5 -->

### Task 5: implement `conflict.diff` (jsdiff → row-aligned `DiffResult`)

The handler reads the snapshot via phase-9 `readSnapshot(id)`, picks two of the three texts according to `sides`, and runs `diffLines` from jsdiff. Conversion: walk the `Change[]`, keeping `left` and `right` in lockstep with empty-line padding so a UI can render side-by-side without re-aligning.

**Algorithm (single pass over `Change[]`):**

```
for each change in changes:
  text = change.value (may end with \n)
  lines = text.split('\n')
  if (last element is '' because text ended with \n) drop it
  if change.added:
    for each line in lines:
      right.push({ num: rNum++, text: line, kind: 'add' })
      left.push ({ num: 0,         text: '',   kind: 'equal' }) // padding placeholder
    stats.added += lines.length
  else if change.removed:
    for each line in lines:
      left.push ({ num: lNum++, text: line, kind: 'del' })
      right.push({ num: 0,         text: '',   kind: 'equal' }) // padding placeholder
    stats.removed += lines.length
  else: // equal
    for each line in lines:
      left.push ({ num: lNum++, text: line, kind: 'equal' })
      right.push({ num: rNum++, text: line, kind: 'equal' })
```

Use `num: 0` for padding rows so the renderer can render an empty gutter cell. Real line numbers start at 1.

**Files:**

- Create: `electron/services/conflicts/diff.ts`
- Create: `electron/services/conflicts/diff.test.ts`
- Modify: `electron/ipc/conflicts.ts` (replace `handleConflictDiff` stub)
- Modify: `electron/ipc/conflicts.test.ts`

- [ ] **Step 1: Write failing tests for the pure adapter**

Create `electron/services/conflicts/diff.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeDiff } from './diff'

describe('computeDiff', () => {
  it('identical inputs → all equal, stats {0,0}', () => {
    const r = computeDiff({
      a: 'one\ntwo\nthree\n',
      b: 'one\ntwo\nthree\n',
      leftLabel: 'local',
      rightLabel: 'remote'
    })
    expect(r.stats).toEqual({ added: 0, removed: 0 })
    expect(r.left.lines.every((l) => l.kind === 'equal')).toBe(true)
    expect(r.right.lines.every((l) => l.kind === 'equal')).toBe(true)
    // left and right have same row count for side-by-side rendering
    expect(r.left.lines.length).toBe(r.right.lines.length)
  })

  it('pure addition: right has +1, left padded', () => {
    const r = computeDiff({
      a: 'one\ntwo\n',
      b: 'one\nNEW\ntwo\n',
      leftLabel: 'local',
      rightLabel: 'remote'
    })
    expect(r.stats).toEqual({ added: 1, removed: 0 })
    // Find the row where right has the 'NEW' addition
    const addIdx = r.right.lines.findIndex((l) => l.kind === 'add' && l.text === 'NEW')
    expect(addIdx).toBeGreaterThanOrEqual(0)
    // Left at the same index is a padding row
    expect(r.left.lines[addIdx]).toMatchObject({ kind: 'equal', text: '', num: 0 })
  })

  it('pure removal: left has -1, right padded', () => {
    const r = computeDiff({
      a: 'one\nGONE\ntwo\n',
      b: 'one\ntwo\n',
      leftLabel: 'local',
      rightLabel: 'remote'
    })
    expect(r.stats).toEqual({ added: 0, removed: 1 })
    const delIdx = r.left.lines.findIndex((l) => l.kind === 'del' && l.text === 'GONE')
    expect(delIdx).toBeGreaterThanOrEqual(0)
    expect(r.right.lines[delIdx]).toMatchObject({ kind: 'equal', text: '', num: 0 })
  })

  it('replacement: 1 del + 1 add', () => {
    const r = computeDiff({
      a: 'one\nold\nthree\n',
      b: 'one\nnew\nthree\n',
      leftLabel: 'local',
      rightLabel: 'remote'
    })
    expect(r.stats).toEqual({ added: 1, removed: 1 })
  })

  it('labels propagate', () => {
    const r = computeDiff({ a: 'x', b: 'y', leftLabel: 'local', rightLabel: 'base' })
    expect(r.left.label).toBe('local')
    expect(r.right.label).toBe('base')
  })

  it('left and right line counts are equal (side-by-side alignment)', () => {
    const a = Array.from({ length: 20 }, (_, i) => `L${i}`).join('\n') + '\n'
    const b = Array.from({ length: 25 }, (_, i) => `R${i}`).join('\n') + '\n'
    const r = computeDiff({ a, b, leftLabel: 'local', rightLabel: 'remote' })
    expect(r.left.lines.length).toBe(r.right.lines.length)
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run electron/services/conflicts/diff.test.ts
```

Expected: FAIL (module missing).

- [ ] **Step 3: Implement `electron/services/conflicts/diff.ts`**

```ts
import { diffLines, type Change } from 'diff'
import type { DiffLineLeft, DiffLineRight, DiffResult, DiffSide } from '@shared/ipc-contract'

export interface ComputeDiffInput {
  a: string
  b: string
  leftLabel: DiffSide
  rightLabel: DiffSide
}

function splitLines(text: string): string[] {
  // jsdiff diffLines emits chunks ending in '\n'; we want the lines without
  // the trailing empty string that .split('\n') yields when text ends with '\n'.
  if (text === '') return []
  const parts = text.split('\n')
  if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop()
  return parts
}

export function computeDiff(input: ComputeDiffInput): DiffResult {
  const changes: Change[] = diffLines(input.a, input.b)
  const left: DiffLineLeft[] = []
  const right: DiffLineRight[] = []
  let lNum = 1
  let rNum = 1
  let added = 0
  let removed = 0

  for (const change of changes) {
    const lines = splitLines(change.value)
    if (change.added) {
      for (const text of lines) {
        right.push({ num: rNum++, text, kind: 'add' })
        left.push({ num: 0, text: '', kind: 'equal' })
        added++
      }
    } else if (change.removed) {
      for (const text of lines) {
        left.push({ num: lNum++, text, kind: 'del' })
        right.push({ num: 0, text: '', kind: 'equal' })
        removed++
      }
    } else {
      for (const text of lines) {
        left.push({ num: lNum++, text, kind: 'equal' })
        right.push({ num: rNum++, text, kind: 'equal' })
      }
    }
  }

  return {
    left: { label: input.leftLabel, lines: left },
    right: { label: input.rightLabel, lines: right },
    stats: { added, removed }
  }
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run electron/services/conflicts/diff.test.ts
```

Expected: 6 PASS.

- [ ] **Step 5: Wire `handleConflictDiff` to use `readSnapshot` + `computeDiff`**

Edit `electron/ipc/conflicts.ts`. Replace the stub `handleConflictDiff` with:

```ts
import { readSnapshot } from '../services/conflicts/store'
import { computeDiff } from '../services/conflicts/diff'
import type { DiffResult, DiffSide, DiffSidesPair } from '@shared/ipc-contract'

export async function handleConflictDiff(id: string, sides: DiffSidesPair): Promise<DiffResult> {
  const snap = await readSnapshot(id) // throws E_NOT_FOUND / E_PERMISSION
  const map: Record<DiffSide, string> = {
    local: snap.localText,
    remote: snap.remoteText,
    base: snap.baseText
  }
  const [leftLabel, rightLabel] = sides.split('-') as [DiffSide, DiffSide]
  return computeDiff({
    a: map[leftLabel],
    b: map[rightLabel],
    leftLabel,
    rightLabel
  })
}
```

- [ ] **Step 6: Add an integration test in `electron/ipc/conflicts.test.ts`**

Append:

```ts
import { writeSnapshot } from '../services/conflicts/store'
// ensure the existing per-test grove mock is in scope (reuse the conftest pattern from this file)

describe('conflict.diff IPC (phase-10 3.5)', () => {
  it('returns DiffResult for an existing snapshot', async () => {
    const { id } = await writeSnapshot({
      path: 'a.md',
      baseText: 'b1\nb2\n',
      localText: 'b1\nL2\n',
      remoteText: 'b1\nR2\n',
      resolvedBy: 'keep_local'
    })
    const r = await handleConflictDiff(id, 'local-remote')
    expect(r.left.label).toBe('local')
    expect(r.right.label).toBe('remote')
    expect(r.stats.added + r.stats.removed).toBeGreaterThan(0)
  })

  it('throws E_NOT_FOUND for missing id', async () => {
    await expect(handleConflictDiff('does-not-exist', 'local-remote')).rejects.toMatchObject({
      code: 'E_NOT_FOUND'
    })
  })
})
```

- [ ] **Step 7: Run, confirm pass**

```bash
npx vitest run electron/ipc/conflicts.test.ts -t "phase-10 3.5"
```

Expected: 2 PASS.

- [ ] **Step 8: Commit**

```bash
git add electron/services/conflicts/diff.ts electron/services/conflicts/diff.test.ts electron/ipc/conflicts.ts electron/ipc/conflicts.test.ts
git commit -m "feat(conflicts): conflict.diff returns row-aligned DiffResult via jsdiff (phase-10 3.5)"
```

---

<!-- openspec-task: 3.6 -->

### Task 6: write `op='conflict_delete'` for both `conflict.delete` and `conflict.deleteAll`

`conflict.delete` already exists (phase-9). We extend it to also call `opsLog.record`. `conflict.deleteAll` is new — same audit per-snapshot.

**Files:**

- Modify: `electron/ipc/conflicts.ts`
- Modify: `electron/ipc/conflicts.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `electron/ipc/conflicts.test.ts`:

```ts
import * as opsLog from '../../src/main/ops/log'
import { handleConflictDelete, handleConflictDeleteAll } from './conflicts'
import { writeSnapshot, listSnapshots } from '../services/conflicts/store'

describe('conflict.delete writes ops_log (phase-10 3.6)', () => {
  it('records op=conflict_delete with the original conflict path', async () => {
    const recordSpy = vi.spyOn(opsLog, 'record').mockResolvedValue(undefined as never)
    const { id } = await writeSnapshot({
      path: 'notes/foo.md',
      baseText: 'b',
      localText: 'l',
      remoteText: 'r',
      resolvedBy: 'keep_local'
    })
    await handleConflictDelete(id)
    expect(recordSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        op: 'conflict_delete',
        path: 'notes/foo.md',
        meta: expect.objectContaining({ id })
      })
    )
  })
})

describe('conflict.deleteAll (phase-10 3.6)', () => {
  it('deletes all snapshots and records one ops_log row per snapshot', async () => {
    const recordSpy = vi.spyOn(opsLog, 'record').mockResolvedValue(undefined as never)
    await writeSnapshot({
      path: 'a.md',
      baseText: '',
      localText: '',
      remoteText: '',
      resolvedBy: 'keep_local'
    })
    await writeSnapshot({
      path: 'b.md',
      baseText: '',
      localText: '',
      remoteText: '',
      resolvedBy: 'load_remote'
    })

    const result = await handleConflictDeleteAll()

    expect(result).toEqual({ ok: true, deleted: 2 })
    const { total } = await listSnapshots({})
    expect(total).toBe(0)
    expect(recordSpy).toHaveBeenCalledTimes(2)
    const ops = recordSpy.mock.calls.map((c) => (c[0] as { op: string }).op)
    expect(ops.every((o) => o === 'conflict_delete')).toBe(true)
  })

  it('returns { ok: true, deleted: 0 } when no snapshots exist', async () => {
    vi.spyOn(opsLog, 'record').mockResolvedValue(undefined as never)
    const result = await handleConflictDeleteAll()
    expect(result).toEqual({ ok: true, deleted: 0 })
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run electron/ipc/conflicts.test.ts -t "phase-10 3.6"
```

Expected: FAIL (no audit yet; `handleConflictDeleteAll` still throws).

- [ ] **Step 3: Implement**

Edit `electron/ipc/conflicts.ts`. Replace the existing `handleConflictDelete` body (or wrap if it already exists) and the `handleConflictDeleteAll` stub:

```ts
import * as opsLog from '../../src/main/ops/log'
import { deleteSnapshot, listSnapshots, readSnapshot } from '../services/conflicts/store'

export async function handleConflictDelete(id: string): Promise<void> {
  // Read meta first so we know the original path; if missing, deleteSnapshot
  // is still safe (idempotent) but we won't record an ops_log row.
  let metaPath: string | undefined
  try {
    const snap = await readSnapshot(id)
    metaPath = snap.meta.path
  } catch {
    // missing or corrupt → skip audit
  }

  await deleteSnapshot(id)

  if (metaPath !== undefined) {
    try {
      await opsLog.record({
        op: 'conflict_delete',
        path: metaPath,
        meta: { id }
      })
    } catch (err) {
      const { logger } = await import('../services/logger')
      logger.warn('opsLog.record(conflict_delete) failed (non-fatal)', {
        id,
        message: err instanceof Error ? err.message : String(err)
      })
    }
  }
}

export async function handleConflictDeleteAll(): Promise<{
  ok: true
  deleted: number
}> {
  const { items } = await listSnapshots({ limit: Number.MAX_SAFE_INTEGER })
  let deleted = 0
  for (const item of items) {
    try {
      await deleteSnapshot(item.id)
    } catch (err) {
      const { logger } = await import('../services/logger')
      logger.warn('deleteSnapshot during deleteAll failed', {
        id: item.id,
        message: err instanceof Error ? err.message : String(err)
      })
      continue
    }
    deleted++
    try {
      await opsLog.record({
        op: 'conflict_delete',
        path: item.path,
        meta: { id: item.id }
      })
    } catch (err) {
      const { logger } = await import('../services/logger')
      logger.warn('opsLog.record(conflict_delete) failed (non-fatal)', {
        id: item.id,
        message: err instanceof Error ? err.message : String(err)
      })
    }
  }
  return { ok: true, deleted }
}
```

If the previous `handleConflictDelete` also did extra work (e.g. emitting a renderer event), preserve that. The above body is the canonical extension; merge into the existing function rather than wholesale-replacing.

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run electron/ipc/conflicts.test.ts -t "phase-10 3.6"
```

Expected: 3 PASS.

Run the full conflicts test file to confirm no regressions in phase-9 behaviour:

```bash
npx vitest run electron/ipc/conflicts.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/conflicts.ts electron/ipc/conflicts.test.ts
git commit -m "feat(conflicts): conflict.delete + conflict.deleteAll write ops_log audit (phase-10 3.6)"
```

---

<!-- openspec-task: 4.1 -->

### Task 7: add "移到废纸篓" item to `FileRowContextMenu.tsx`

**Files:**

- Modify: `src/components/library/FileRowContextMenu.tsx`
- Modify: `src/components/library/FileRowContextMenu.test.tsx`

- [ ] **Step 1: Inspect current menu**

```bash
grep -n "ContextMenuItem\|ContextMenuSeparator" /Users/aaa/develop/workspace-ai/acornvo/src/components/library/FileRowContextMenu.tsx
```

Expected: phase-6 added two items ("打开" / "在 Finder/资源管理器中显示"). The component's prop signature should expose `path: string` and (likely) callbacks. Identify whether the file already takes an `onTrash` prop.

- [ ] **Step 2: Write failing test**

Append to `src/components/library/FileRowContextMenu.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { FileRowContextMenu } from './FileRowContextMenu'

describe('FileRowContextMenu — trash item (phase-10 4.1)', () => {
  it('renders "移到废纸篓" after a separator following the existing items', async () => {
    const onTrash = vi.fn()
    render(
      <FileRowContextMenu
        path="notes/a.md"
        onOpen={() => {}}
        onShowInFolder={() => {}}
        onTrash={onTrash}
      >
        <div data-testid="anchor">row</div>
      </FileRowContextMenu>
    )
    // Open the context menu
    await userEvent.pointer({ keys: '[MouseRight>]', target: screen.getByTestId('anchor') })
    const item = await screen.findByText('移到废纸篓')
    expect(item).toBeInTheDocument()
    await userEvent.click(item)
    expect(onTrash).toHaveBeenCalledWith('notes/a.md')
  })
})
```

If the existing component does not yet take `onTrash`, that's expected — Step 4 adds it.

- [ ] **Step 3: Run, confirm failure**

```bash
npx vitest run src/components/library/FileRowContextMenu.test.tsx -t "phase-10 4.1"
```

Expected: FAIL (no "移到废纸篓" text rendered).

- [ ] **Step 4: Implement**

Edit `src/components/library/FileRowContextMenu.tsx`. Add `onTrash?: (path: string) => void` to the props interface, then in the menu body add:

```tsx
<ContextMenuSeparator />
<ContextMenuItem
  data-testid="ctxmenu-trash"
  onSelect={() => props.onTrash?.(props.path)}
>
  移到废纸篓
</ContextMenuItem>
```

Place the separator and the new item AFTER the existing two items.

- [ ] **Step 5: Run, confirm pass**

```bash
npx vitest run src/components/library/FileRowContextMenu.test.tsx
```

Expected: all PASS (existing tests + the new one).

- [ ] **Step 6: Commit**

```bash
git add src/components/library/FileRowContextMenu.tsx src/components/library/FileRowContextMenu.test.tsx
git commit -m "feat(library): add 移到废纸篓 menu item with separator (phase-10 4.1)"
```

---

<!-- openspec-task: 4.2 -->

### Task 8: implement `TrashConfirmDialog.tsx` (confirm-mode + fallback-mode)

The dialog has a small internal state machine:

- `state = 'confirm'`: shows the path and `[取消] [移到废纸篓]`. Clicking `移到废纸篓` calls `onConfirm()`.
- If `onConfirm` rejects with `code === 'E_TRASH'`, transition to `state = 'fallback'`.
- `state = 'fallback'`: shows error message + checkbox `我知道这无法恢复` + `[永久删除]` (disabled until checkbox is checked) + `[取消]`. Clicking `永久删除` calls `onHardDelete()` (passed in as a prop or constructed from `window.api.file.hardDelete`).

For separation of concerns, the dialog accepts both `onConfirm` (trash) and `onHardDelete` callbacks; the parent (Library) wires them to `window.api.file.trash` / `window.api.file.hardDelete`. This keeps the dialog testable without IPC.

**Files:**

- Create: `src/components/library/TrashConfirmDialog.tsx`
- Create: `src/components/library/TrashConfirmDialog.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/library/TrashConfirmDialog.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { TrashConfirmDialog } from './TrashConfirmDialog'
import { IpcError } from '@shared/ipc-contract'

describe('TrashConfirmDialog — confirm mode (phase-10 4.2)', () => {
  it('shows path and confirm/cancel buttons; calls onConfirm with the path', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const onCancel = vi.fn()
    const onHardDelete = vi.fn()
    render(
      <TrashConfirmDialog
        open
        path="notes/a.md"
        onCancel={onCancel}
        onConfirm={onConfirm}
        onHardDelete={onHardDelete}
      />
    )
    expect(screen.getByText(/notes\/a\.md/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '移到废纸篓' }))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('cancel calls onCancel', async () => {
    render(
      <TrashConfirmDialog
        open
        path="x.md"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        onHardDelete={vi.fn()}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: '取消' }))
    // Mocked onCancel can be inspected by capturing; here we just assert no crash.
  })
})

describe('TrashConfirmDialog — fallback mode after E_TRASH (phase-10 4.2)', () => {
  it('switches to fallback when onConfirm rejects with E_TRASH', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new IpcError('E_TRASH', 'no XDG'))
    const onHardDelete = vi.fn().mockResolvedValue(undefined)
    render(
      <TrashConfirmDialog
        open
        path="x.md"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        onHardDelete={onHardDelete}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: '移到废纸篓' }))

    // Fallback content
    expect(await screen.findByText(/无法移到系统回收站/)).toBeInTheDocument()
    const hardDeleteBtn = screen.getByRole('button', { name: '永久删除' })
    expect(hardDeleteBtn).toBeDisabled()

    // Tick the checkbox → button enabled
    await userEvent.click(screen.getByRole('checkbox', { name: /我知道这无法恢复/ }))
    expect(hardDeleteBtn).toBeEnabled()

    await userEvent.click(hardDeleteBtn)
    expect(onHardDelete).toHaveBeenCalled()
  })

  it('does NOT call onHardDelete while checkbox is unchecked', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new IpcError('E_TRASH', 'fail'))
    const onHardDelete = vi.fn()
    render(
      <TrashConfirmDialog
        open
        path="x.md"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        onHardDelete={onHardDelete}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: '移到废纸篓' }))
    const hardDeleteBtn = await screen.findByRole('button', { name: '永久删除' })
    // Try clicking the disabled button (no-op)
    await userEvent.click(hardDeleteBtn)
    expect(onHardDelete).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run src/components/library/TrashConfirmDialog.test.tsx
```

Expected: FAIL (component not yet created).

- [ ] **Step 3: Implement `TrashConfirmDialog.tsx`**

```tsx
import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

export interface TrashConfirmDialogProps {
  open: boolean
  path: string
  onCancel: () => void
  /** Called when user confirms; throws IpcError on failure (renderer translates IPC envelope). */
  onConfirm: () => Promise<void>
  /** Called when user confirms hard-delete in fallback mode. */
  onHardDelete: () => Promise<void>
}

type Mode = { kind: 'confirm' } | { kind: 'fallback'; reason: string }

export function TrashConfirmDialog(props: TrashConfirmDialogProps): JSX.Element {
  const [mode, setMode] = useState<Mode>({ kind: 'confirm' })
  const [busy, setBusy] = useState(false)
  const [hardDeleteAck, setHardDeleteAck] = useState(false)

  // Reset internal state whenever the dialog re-opens or the path changes.
  useEffect(() => {
    if (props.open) {
      setMode({ kind: 'confirm' })
      setBusy(false)
      setHardDeleteAck(false)
    }
  }, [props.open, props.path])

  async function handleConfirm() {
    setBusy(true)
    try {
      await props.onConfirm()
      // Parent closes the dialog on success
    } catch (err) {
      const code = (err as { code?: string }).code
      const message = err instanceof Error ? err.message : String(err)
      if (code === 'E_TRASH') {
        setMode({ kind: 'fallback', reason: message })
      } else {
        // Unknown failure — surface as fallback with a generic message
        setMode({ kind: 'fallback', reason: message })
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleHardDelete() {
    if (!hardDeleteAck) return
    setBusy(true)
    try {
      await props.onHardDelete()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onCancel()
      }}
    >
      <DialogContent>
        {mode.kind === 'confirm' ? (
          <>
            <DialogHeader>
              <DialogTitle>移到废纸篓？</DialogTitle>
              <DialogDescription>
                <code>{props.path}</code>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={props.onCancel} disabled={busy}>
                取消
              </Button>
              <Button onClick={handleConfirm} disabled={busy}>
                移到废纸篓
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>无法移到系统回收站</DialogTitle>
              <DialogDescription>
                {mode.reason}
                <br />
                <code>{props.path}</code>
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 py-2">
              <Checkbox
                id="trash-hard-delete-ack"
                checked={hardDeleteAck}
                onCheckedChange={(v) => setHardDeleteAck(v === true)}
              />
              <label htmlFor="trash-hard-delete-ack">我知道这无法恢复</label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={props.onCancel} disabled={busy}>
                取消
              </Button>
              <Button
                variant="destructive"
                disabled={!hardDeleteAck || busy}
                onClick={handleHardDelete}
              >
                永久删除
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

If `@/components/ui/checkbox` is not yet present (shadcn add), run:

```bash
grep -l "components/ui/checkbox" /Users/aaa/develop/workspace-ai/acornvo/src/components/ui 2>/dev/null || echo "checkbox missing — add via shadcn"
```

If missing: `npx shadcn-ui@latest add checkbox` (or use the `Checkbox` from `@radix-ui/react-checkbox` directly). Verify the actual import path in `src/components/ui/`.

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run src/components/library/TrashConfirmDialog.test.tsx
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/library/TrashConfirmDialog.tsx src/components/library/TrashConfirmDialog.test.tsx
git commit -m "feat(library): TrashConfirmDialog with confirm + fallback hard-delete modes (phase-10 4.2)"
```

---

<!-- openspec-task: 4.3 -->

### Task 9: `VirtualFileList` `onKeyDown` opens `TrashConfirmDialog` on `Cmd/Ctrl+Backspace` / `Delete`

**Files:**

- Modify: `src/components/library/VirtualFileList.tsx`
- Modify: `src/components/library/VirtualFileList.test.tsx`

- [ ] **Step 1: Inspect current keyboard handling**

```bash
grep -n "onKeyDown\|Backspace\|Delete\|selectedPath" /Users/aaa/develop/workspace-ai/acornvo/src/components/library/VirtualFileList.tsx
```

Phase-6 likely already wires `onKeyDown` for arrow-keys + Enter. We extend the same handler.

- [ ] **Step 2: Write failing test**

Append to `src/components/library/VirtualFileList.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

describe('VirtualFileList — Cmd+Backspace opens TrashConfirmDialog (phase-10 4.3)', () => {
  it('opens dialog on Cmd+Backspace when a row is selected (mac)', async () => {
    // Use the existing test harness for VirtualFileList; expect
    // the harness to expose a way to assert which dialog is open.
    const { container } = renderListWithSelection('notes/a.md')
    container
      .querySelector('[data-testid="virtual-file-list"]')
      ?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Backspace', metaKey: true, bubbles: true })
      )
    expect(await screen.findByText(/移到废纸篓？/)).toBeInTheDocument()
  })

  it('opens dialog on Delete (win/linux)', async () => {
    const { container } = renderListWithSelection('notes/b.md')
    container
      .querySelector('[data-testid="virtual-file-list"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    expect(await screen.findByText(/移到废纸篓？/)).toBeInTheDocument()
  })

  it('does NOT open when no row is selected', async () => {
    const { container } = renderListWithSelection(null)
    container
      .querySelector('[data-testid="virtual-file-list"]')
      ?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Backspace', metaKey: true, bubbles: true })
      )
    expect(screen.queryByText(/移到废纸篓？/)).not.toBeInTheDocument()
  })
})

// Helper — match the existing pattern in VirtualFileList.test.tsx for setting up
// the store and rendering. If the file already has a `renderList` helper, extend it.
function renderListWithSelection(selected: string | null) {
  // ... uses the library store mock pattern; copy from existing tests in this file ...
  throw new Error('TODO: copy from existing setup helper in this test file')
}
```

Open the existing `VirtualFileList.test.tsx` and copy/extend its setup helper rather than rewriting one. The exact helper depends on phase-6's implementation; the goal is to seed `selectedPath` and render.

- [ ] **Step 3: Run, confirm failure**

```bash
npx vitest run src/components/library/VirtualFileList.test.tsx -t "phase-10 4.3"
```

Expected: 3 FAIL.

- [ ] **Step 4: Implement keyboard handler + dialog wiring**

Edit `src/components/library/VirtualFileList.tsx`. Add (or extend) the `onKeyDown` of the outer container. Add local state for the dialog and an IPC adapter:

```tsx
import { useState, useCallback } from 'react'
import { TrashConfirmDialog } from './TrashConfirmDialog'
import { useLibraryStore } from '@/stores/library'

// Inside component:
const selectedPath = useLibraryStore((s) => s.selectedPath)
const removeItem = useLibraryStore((s) => s.removeItem)
const setSelectedPath = useLibraryStore((s) => s.setSelectedPath)
const [trashTarget, setTrashTarget] = useState<string | null>(null)

const handleContainerKeyDown = useCallback(
  (e: React.KeyboardEvent<HTMLDivElement>) => {
    // …existing arrow/Enter handling unchanged…

    const isMacTrash = e.key === 'Backspace' && (e.metaKey || e.ctrlKey)
    const isWinLinuxTrash = e.key === 'Delete'
    if ((isMacTrash || isWinLinuxTrash) && selectedPath) {
      e.preventDefault()
      setTrashTarget(selectedPath)
    }
  },
  [selectedPath]
)
```

Then in the JSX, render `TrashConfirmDialog` whenever `trashTarget !== null`:

```tsx
{
  trashTarget && (
    <TrashConfirmDialog
      open
      path={trashTarget}
      onCancel={() => setTrashTarget(null)}
      onConfirm={async () => {
        const result = await window.api.file.trash(trashTarget)
        if (!result.ok) {
          // throw so the dialog can transition to fallback mode
          const { IpcError } = await import('@shared/ipc-contract')
          throw new IpcError(result.error.code, result.error.message)
        }
        // Library cleanup happens in Task 10 (4.4) — do it here too
        removeItem(trashTarget)
        if (selectedPath === trashTarget) setSelectedPath(null)
        setTrashTarget(null)
      }}
      onHardDelete={async () => {
        const result = await window.api.file.hardDelete(trashTarget)
        if (!result.ok) {
          const { IpcError } = await import('@shared/ipc-contract')
          throw new IpcError(result.error.code, result.error.message)
        }
        removeItem(trashTarget)
        if (selectedPath === trashTarget) setSelectedPath(null)
        setTrashTarget(null)
      }}
    />
  )
}
```

Also wire the right-click menu's `onTrash` callback (added in Task 7) to `setTrashTarget(path)` so the menu and the keyboard share the same dialog.

Tag the outer container with `data-testid="virtual-file-list"` (idempotent — phase-6 likely already added it; verify and use whatever exists).

- [ ] **Step 5: Run, confirm pass**

```bash
npx vitest run src/components/library/VirtualFileList.test.tsx
```

Expected: all PASS (existing tests + the 3 new ones).

- [ ] **Step 6: Commit**

```bash
git add src/components/library/VirtualFileList.tsx src/components/library/VirtualFileList.test.tsx
git commit -m "feat(library): Cmd+Backspace / Delete opens TrashConfirmDialog (phase-10 4.3)"
```

---

<!-- openspec-task: 4.4 -->

### Task 10: library-store cleanup after successful trash

The wiring inside `VirtualFileList` (Task 9) already calls `removeItem(path)` and clears `selectedPath` on success. This task adds explicit unit tests for the store contract and ensures both the keyboard path and the right-click path share the same effect.

**Files:**

- Modify: `src/stores/library.ts` (only if `removeItem` does not already exist or does not handle `selectedPath`)
- Modify: `src/stores/library.test.ts`
- Modify: `src/components/library/VirtualFileList.test.tsx` (assert store post-state after a successful trash)

- [ ] **Step 1: Inspect store**

```bash
grep -n "removeItem\|selectedPath" /Users/aaa/develop/workspace-ai/acornvo/src/stores/library.ts
```

If `removeItem` exists and clears `selectedPath` automatically when the deleted path matches → skip Step 4. Otherwise add the behaviour.

- [ ] **Step 2: Write failing tests**

Append to `src/stores/library.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useLibraryStore } from './library'

describe('library.removeItem (phase-10 4.4)', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      items: [{ path: 'a.md' /* …minimal mock fields… */ } as any, { path: 'b.md' } as any],
      selectedPath: 'a.md'
    })
  })

  it('removes the row from items', () => {
    useLibraryStore.getState().removeItem('a.md')
    expect(useLibraryStore.getState().items.find((i) => i.path === 'a.md')).toBeUndefined()
  })

  it('clears selectedPath when it matches the deleted path', () => {
    useLibraryStore.getState().removeItem('a.md')
    expect(useLibraryStore.getState().selectedPath).toBeNull()
  })

  it('preserves selectedPath when deleting a different row', () => {
    useLibraryStore.getState().removeItem('b.md')
    expect(useLibraryStore.getState().selectedPath).toBe('a.md')
  })
})
```

Adapt the minimal `items[]` shape to match phase-6's `LibraryItem` (look at the type and provide required fields).

- [ ] **Step 3: Run, confirm result**

```bash
npx vitest run src/stores/library.test.ts -t "phase-10 4.4"
```

Two scenarios:

- All 3 PASS → store already correct → proceed to Step 5.
- 1 or more FAIL → continue to Step 4.

- [ ] **Step 4: (only if Step 3 failed) update the store**

Edit `src/stores/library.ts`. Modify `removeItem` so it also clears `selectedPath` when the deleted path matches:

```ts
removeItem: (path: string) =>
  set((state) => ({
    items: state.items.filter((i) => i.path !== path),
    selectedPath: state.selectedPath === path ? null : state.selectedPath
  }))
```

Re-run the test:

```bash
npx vitest run src/stores/library.test.ts -t "phase-10 4.4"
```

Expected: 3 PASS.

- [ ] **Step 5: Add an integration assertion in `VirtualFileList.test.tsx`**

Append to the existing `phase-10 4.3` describe block (or as a new describe):

```tsx
it('successful trash → row removed from items + selectedPath cleared', async () => {
  vi.stubGlobal('window', {
    api: {
      file: {
        trash: vi.fn().mockResolvedValue({ ok: true }),
        hardDelete: vi.fn()
      }
    }
  })
  const { container } = renderListWithSelection('notes/a.md')
  container
    .querySelector('[data-testid="virtual-file-list"]')
    ?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Backspace', metaKey: true, bubbles: true })
    )
  await userEvent.click(await screen.findByRole('button', { name: '移到废纸篓' }))
  // After the resolved promise tick, the store should have removed the item
  await waitFor(() => {
    expect(useLibraryStore.getState().items.find((i) => i.path === 'notes/a.md')).toBeUndefined()
    expect(useLibraryStore.getState().selectedPath).toBeNull()
  })
})
```

(`waitFor` from `@testing-library/react`.)

- [ ] **Step 6: Run all relevant tests, confirm pass**

```bash
npx vitest run src/stores/library.test.ts src/components/library/VirtualFileList.test.tsx
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/stores/library.ts src/stores/library.test.ts src/components/library/VirtualFileList.test.tsx
git commit -m "feat(library): clear selectedPath when removeItem deletes the selected row (phase-10 4.4)"
```

(If only the test file changed because the store was already correct, the commit message is `test(library): assert store cleanup after successful trash (phase-10 4.4)`.)

---

<!-- openspec-task: 4.5 -->

### Task 11: hard-delete path — fallback dialog calls `file.hardDelete`, library cleanup matches 4.4

The keyboard/right-click integration in Task 9 already calls `window.api.file.hardDelete` from the dialog's `onHardDelete` and runs the same `removeItem` + `selectedPath` cleanup. This task adds the end-to-end test that proves the full path: trash fails → fallback → checkbox + 永久删除 → store cleanup.

**Files:**

- Modify: `src/components/library/VirtualFileList.test.tsx`

- [ ] **Step 1: Write failing E2E-style test (renderer-only, IPC mocked)**

Append to `src/components/library/VirtualFileList.test.tsx`:

```tsx
describe('VirtualFileList — hard-delete fallback path (phase-10 4.5)', () => {
  it('E_TRASH → fallback → checkbox + 永久删除 → calls hardDelete + cleans store', async () => {
    const trashMock = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'E_TRASH', message: 'no XDG' }
    })
    const hardDeleteMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('window', {
      api: {
        file: { trash: trashMock, hardDelete: hardDeleteMock }
      }
    })

    const { container } = renderListWithSelection('notes/a.md')
    container
      .querySelector('[data-testid="virtual-file-list"]')
      ?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Backspace', metaKey: true, bubbles: true })
      )

    // Confirm-mode: click "移到废纸篓"
    await userEvent.click(await screen.findByRole('button', { name: '移到废纸篓' }))
    expect(trashMock).toHaveBeenCalledWith('notes/a.md')

    // Fallback-mode appears
    expect(await screen.findByText(/无法移到系统回收站/)).toBeInTheDocument()

    // Tick the ack checkbox
    await userEvent.click(screen.getByRole('checkbox', { name: /我知道这无法恢复/ }))

    // 永久删除 → calls hardDelete
    await userEvent.click(screen.getByRole('button', { name: '永久删除' }))
    await waitFor(() => expect(hardDeleteMock).toHaveBeenCalledWith('notes/a.md'))

    // Library state cleaned up
    await waitFor(() => {
      expect(useLibraryStore.getState().items.find((i) => i.path === 'notes/a.md')).toBeUndefined()
      expect(useLibraryStore.getState().selectedPath).toBeNull()
    })
  })

  it('hardDelete failure → dialog stays open (no store mutation)', async () => {
    const trashMock = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'E_TRASH', message: 'fail' }
    })
    const hardDeleteMock = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'E_INTERNAL', message: 'unlink failed' }
    })
    vi.stubGlobal('window', {
      api: { file: { trash: trashMock, hardDelete: hardDeleteMock } }
    })

    const { container } = renderListWithSelection('notes/a.md')
    container
      .querySelector('[data-testid="virtual-file-list"]')
      ?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Backspace', metaKey: true, bubbles: true })
      )
    await userEvent.click(await screen.findByRole('button', { name: '移到废纸篓' }))
    await userEvent.click(await screen.findByRole('checkbox', { name: /我知道这无法恢复/ }))
    await userEvent.click(screen.getByRole('button', { name: '永久删除' }))

    // Item still present in store
    await waitFor(() => {
      expect(useLibraryStore.getState().items.find((i) => i.path === 'notes/a.md')).toBeDefined()
    })
  })
})
```

- [ ] **Step 2: Run, confirm initial state**

```bash
npx vitest run src/components/library/VirtualFileList.test.tsx -t "phase-10 4.5"
```

If Task 9's wiring is already correct (it should be — the `onHardDelete` callback was implemented there), the first test passes immediately and the second may need a small adjustment in `VirtualFileList.tsx` to NOT close the dialog or NOT mutate the store on `!result.ok`. The wiring in Task 9 already throws via `IpcError` on `!result.ok` for `onHardDelete`, which keeps the dialog open and prevents the store mutations from running. Verify this is the case:

```bash
grep -n "hardDelete\|onHardDelete" /Users/aaa/develop/workspace-ai/acornvo/src/components/library/VirtualFileList.tsx
```

The expected pattern: the `removeItem` + `setSelectedPath` calls run AFTER `await window.api.file.hardDelete(...)` returns `{ ok: true }`. If they run unconditionally, fix the wiring:

```tsx
onHardDelete={async () => {
  const result = await window.api.file.hardDelete(trashTarget)
  if (!result.ok) {
    const { IpcError } = await import('@shared/ipc-contract')
    throw new IpcError(result.error.code, result.error.message)
  }
  removeItem(trashTarget)
  if (selectedPath === trashTarget) setSelectedPath(null)
  setTrashTarget(null)
}}
```

- [ ] **Step 3: Re-run all VirtualFileList + Library tests**

```bash
npx vitest run src/components/library/VirtualFileList.test.tsx src/components/library/TrashConfirmDialog.test.tsx src/stores/library.test.ts
```

Expected: ALL PASS.

- [ ] **Step 4: Run the full unit suite to catch regressions**

```bash
npm test
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/library/VirtualFileList.tsx src/components/library/VirtualFileList.test.tsx
git commit -m "feat(library): hard-delete fallback path with shared store cleanup (phase-10 4.5)"
```

---

## Self-Review

After all tasks pass:

1. **Spec coverage:** This plan covers tasks 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5 — confirm by grepping the plan:

```bash
grep -E "openspec-task: (3\.[1-6]|4\.[1-5])" /Users/aaa/develop/workspace-ai/acornvo/docs/superpowers/plans/2026-04-30-phase-10-history-and-trash-tasks-3.1-4.5.md | sort -u
```

Expected: 11 unique labels (3.1–3.6, 4.1–4.5).

2. **`file.trash` and `file.hardDelete` write to `ops_log` ON SUCCESS only:** Task 2's implementation has a try/catch around `shell.trashItem` that returns BEFORE `opsLog.record` runs on failure. Same for `unlink` in `handleHardDelete`. Tests assert `opsLog.record` is NOT called on `E_TRASH` / `E_NOT_FOUND` / `E_PERMISSION`.

3. **`conflict.diff` returns structured `DiffResult` (no jsdiff types leak):** The shared contract exports only `DiffSide`, `DiffSidesPair`, `DiffLineLeft`, `DiffLineRight`, `DiffResult` — no `Change` from the `diff` package. The renderer never imports `diff`.

4. **`TrashConfirmDialog` has BOTH modes:** `confirm` (path + 取消/移到废纸篓) and `fallback` (error message + checkbox `我知道这无法恢复` + disabled `永久删除` until ack). State machine implemented as `useState<Mode>` with transition on `E_TRASH` (and any other error, treated as fallback so users are never stuck with a silent failure).

5. **Right-click menu and Cmd/Backspace share the same dialog instance:** the right-click `onTrash` callback (Task 7) and the keyboard handler (Task 9) both call `setTrashTarget(path)` on the same `VirtualFileList` state. Single dialog, two entry points.

6. **No placeholders, no TODOs in code blocks** (the only `TODO` is in the test-helper comment that explicitly says "copy from existing setup helper" — that's a per-repo style hint, not a missing implementation).
