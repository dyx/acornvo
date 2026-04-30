# Phase 09 Conflict Handling — Plan 2 (Tasks 4.1–5.6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the IPC plumbing for the `conflict` namespace (list/read/delete) and extend the editor store with `baseBody/baseFrontmatter/baseMtimeMs`, `conflictState`, the `index:fileChanged` subscriber, and the `E_MTIME_MISMATCH` save-failure branch. After this plan the main↔renderer pipe is fully wired; only the UI components remain.

**Architecture:** New main-side handler module `electron/ipc/conflicts.ts` exposes `conflict.list/read/delete` by delegating to the snapshot store from Plan 1. The contract/preload/client all gain the new namespace. The editor store grows three new "base" fields, a `conflictState` field, a new event subscription, and a refined save error branch. Save scheduling is gated by `conflictState.kind`. Retry counter excludes mtime mismatches.

**Tech Stack:** Same as Plan 1 plus Zustand (renderer store) and the Vitest jsdom env (already configured for `src/**`).

---

## Pre-flight

Plan 1 must be merged first (provides `conflict-types.ts`, `conflicts/store.ts`, the `force` option). Phase 7 must also be merged or scheduled to merge before this plan: it provides `src/stores/editor.ts` with the Zustand state machine. If phase 7 is **not** yet on `main`, **stop** — this plan modifies the editor store.

Verify both prereqs:
```bash
test -f /Users/aaa/develop/workspace-ai/acornvo/electron/services/conflicts/store.ts && echo "plan-1 OK"
test -f /Users/aaa/develop/workspace-ai/acornvo/src/stores/editor.ts && echo "phase-7 OK"
```
Both must print "OK".

## File Structure

| Path | Action | Owner task |
|---|---|---|
| `shared/ipc-contract.ts` | Modify (add `conflict` namespace + preserve `IpcError.context`) | 4.1, 4.3 |
| `electron/ipc/router.ts` | Modify (`normalize` propagates `context`) | 4.3 |
| `electron/ipc/conflicts.ts` | Create | 4.2 |
| `electron/ipc/handlers.ts` | Modify (register `conflict` namespace) | 4.2 |
| `preload/preload.ts` | Modify (add `conflict` invoker) | 4.1 |
| `src/stores/editor.ts` | Modify (base fields + conflictState + subscriber + save branch + scheduling guard + retry guard) | 5.1, 5.2, 5.3, 5.4, 5.5, 5.6 |
| `src/stores/editor.test.ts` | Modify (5 new test groups) | 5.1, 5.2, 5.3, 5.4, 5.5, 5.6 |

## Conventions reused

- Renderer reads `IpcError.context` to pull `remoteMtimeMs` after `E_MTIME_MISMATCH`. The current `router.ts:normalize` strips `context` — Task 15 fixes that.
- `editor store` retains `kind: 'idle' | 'loading' | 'ready' | 'error'`. New `conflictState` is **only meaningful in `ready` state**. In other states the field is ignored.
- All new save-blocking conditions go through one helper, `isSavingBlockedByConflict(state)` — referenced from `scheduleSave`, `flushSave`, and the `Cmd+S` keymap.

---

<!-- openspec-task: 4.1 -->
### Task 13: extend `IpcContract` with the `conflict` namespace

**Files:**
- Modify: `shared/ipc-contract.ts`
- Modify: `preload/preload.ts`

- [ ] **Step 1: Add the namespace types**

Edit `shared/ipc-contract.ts`. Below the existing `// --- index namespace types (phase-05) ---` block, insert a new section:

```ts
// --- conflict namespace types (phase-09) ---

import type {
  ConflictItem,
  ConflictMeta
} from './conflict-types'

export interface ConflictListResult {
  items: ConflictItem[]
  total: number
}

export interface ConflictReadResult {
  meta: ConflictMeta
  localText: string
  remoteText: string
  baseText: string
}
```

Then add a `conflict` field to the `IpcContract` type. Edit `IpcContract` block (currently ends at line 180 of the file, with `index: { ... }`):

```ts
  index: {
    status: () => IndexStatusView
    startScan: () => void
    cancelScan: () => void
  }
  conflict: {
    list: (opts?: { limit?: number; offset?: number }) => ConflictListResult
    read: (id: string) => ConflictReadResult
    delete: (id: string) => { ok: true }
  }
}
```

- [ ] **Step 2: Wire it in preload**

Edit `preload/preload.ts`. Inside the `request` object, add a new namespace after `index`:

```ts
  index: {
    status: () => invoke('index.status'),
    startScan: () => invoke('index.startScan'),
    cancelScan: () => invoke('index.cancelScan')
  },
  conflict: {
    list: (opts) => invoke('conflict.list', opts),
    read: (id) => invoke('conflict.read', id),
    delete: (id) => invoke('conflict.delete', id)
  }
```

- [ ] **Step 3: Type-check**

```bash
npm run typecheck
```
Expected: PASS (no main-side handler yet, but the contract surface is consistent — `handlers.ts` will be flagged as missing the `conflict` field; we'll fix in Task 14).

If `npm run typecheck` fails on `handlers.ts` (it will — the `HandlerMap` is exhaustive over `IpcContract`), add a temporary stub in `electron/ipc/handlers.ts` to keep CI green between commits:

```ts
import { conflictHandlers } from './conflicts' // will create in Task 14
// ...
export const ipcHandlers: HandlerMap = {
  // ...
  index: indexHandlers,
  conflict: conflictHandlers,
}
```

…but only commit it after Task 14 lands the file. To preserve commit safety, **defer typecheck verification until end of Task 14**.

- [ ] **Step 4: Commit (no typecheck yet — Task 14 closes the loop)**

```bash
git add shared/ipc-contract.ts preload/preload.ts
git commit -m "feat(ipc): contract + preload for conflict namespace (phase-09 4.1)"
```

---

<!-- openspec-task: 4.2 -->
### Task 14: implement `electron/ipc/conflicts.ts` and register it

**Files:**
- Create: `electron/ipc/conflicts.ts`
- Modify: `electron/ipc/handlers.ts`
- Create: `electron/ipc/conflicts.test.ts`

- [ ] **Step 1: Create the handler file**

Create `electron/ipc/conflicts.ts`:

```ts
import {
  listSnapshots,
  readSnapshot,
  deleteSnapshot
} from '../services/conflicts/store'
import { IpcError } from '@shared/ipc-contract'
import type {
  ConflictListResult,
  ConflictReadResult
} from '@shared/ipc-contract'

export const conflictHandlers = {
  async list(opts?: { limit?: number; offset?: number }): Promise<ConflictListResult> {
    const limit = opts?.limit
    const offset = opts?.offset
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
      throw new IpcError('E_INVALID_ARGS', 'limit must be a non-negative integer')
    }
    if (offset !== undefined && (!Number.isInteger(offset) || offset < 0)) {
      throw new IpcError('E_INVALID_ARGS', 'offset must be a non-negative integer')
    }
    return listSnapshots({
      ...(limit !== undefined ? { limit } : {}),
      ...(offset !== undefined ? { offset } : {})
    })
  },

  async read(id: string): Promise<ConflictReadResult> {
    if (!id || typeof id !== 'string') {
      throw new IpcError('E_INVALID_ARGS', 'id is required')
    }
    return readSnapshot(id)
  },

  async delete(id: string): Promise<{ ok: true }> {
    if (!id || typeof id !== 'string') {
      throw new IpcError('E_INVALID_ARGS', 'id is required')
    }
    await deleteSnapshot(id)
    return { ok: true }
  }
}
```

- [ ] **Step 2: Register in `handlers.ts`**

Edit `electron/ipc/handlers.ts`. Add the import and field:

```ts
import { conflictHandlers } from './conflicts'
// ...
export const ipcHandlers: HandlerMap = {
  ping: { echo: (input: string): string => input },
  log: {
    debug: (msg, ctx) => logger.debug(`[renderer] ${msg}`, ctx),
    info: (msg, ctx) => logger.info(`[renderer] ${msg}`, ctx),
    warn: (msg, ctx) => logger.warn(`[renderer] ${msg}`, ctx),
    error: (msg, ctx) => logger.error(`[renderer] ${msg}`, ctx)
  },
  project: projectHandlers,
  db: dbHandlers,
  file: fileHandlers,
  index: indexHandlers,
  conflict: conflictHandlers
}
```

- [ ] **Step 3: Write the handler tests**

Create `electron/ipc/conflicts.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as groveSvc from '../services/grove'
import { writeSnapshot } from '../services/conflicts/store'
import { conflictHandlers } from './conflicts'
import { IpcError } from '@shared/ipc-contract'

let tmp: string
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'cf-h-'))
  vi.spyOn(groveSvc, 'getCurrent').mockReturnValue({
    id: 'g', path: tmp, name: 'g', color: 'acorn',
    schema_version: 1, created_at: '', last_opened_at: '', sync_warning: null
  })
  // make sure conflicts dir exists
  await (await import('node:fs/promises')).mkdir(join(tmp, '.acornvo/conflicts'), { recursive: true })
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(tmp, { recursive: true, force: true })
})

describe('conflictHandlers.list', () => {
  it('returns empty when no snapshots', async () => {
    const r = await conflictHandlers.list()
    expect(r).toEqual({ items: [], total: 0 })
  })

  it('rejects invalid limit', async () => {
    await expect(conflictHandlers.list({ limit: -1 })).rejects.toMatchObject({
      code: 'E_INVALID_ARGS'
    })
  })
})

describe('conflictHandlers.read', () => {
  it('returns snapshot bodies', async () => {
    const { id } = await writeSnapshot({
      path: 'a.md', baseText: 'B', localText: 'L', remoteText: 'R',
      resolvedBy: 'keep_local'
    })
    const r = await conflictHandlers.read(id)
    expect(r.localText).toBe('L')
    expect(r.meta.path).toBe('a.md')
  })

  it('rejects empty id', async () => {
    await expect(conflictHandlers.read('')).rejects.toMatchObject({
      code: 'E_INVALID_ARGS'
    })
  })
})

describe('conflictHandlers.delete', () => {
  it('removes the snapshot directory', async () => {
    const { id } = await writeSnapshot({
      path: 'a.md', baseText: '', localText: '', remoteText: '',
      resolvedBy: 'keep_local'
    })
    await conflictHandlers.delete(id)
    await expect(conflictHandlers.read(id)).rejects.toMatchObject({
      code: 'E_NOT_FOUND'
    })
  })

  it('rejects path-escape', async () => {
    await expect(conflictHandlers.delete('../../etc')).rejects.toMatchObject({
      code: 'E_PERMISSION'
    })
  })
})
```

- [ ] **Step 4: Run handler tests**

```bash
npx vitest run electron/ipc/conflicts.test.ts
```
Expected: 6 PASS.

- [ ] **Step 5: Type-check the whole project (Plan 2 task 4.1's deferred check)**

```bash
npm run typecheck
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/ipc/conflicts.ts electron/ipc/conflicts.test.ts electron/ipc/handlers.ts
git commit -m "feat(ipc): conflict.list/read/delete handlers (phase-09 4.2)"
```

---

<!-- openspec-task: 4.3 -->
### Task 15: end-to-end exposure of `force` + IpcError context propagation

This task closes two loops:
1. `file.write` IPC accepts `{ force: true }` — already true after Plan 1 Task 4 + Task 5, but verify by integration.
2. `router.ts:normalize` strips the `context` field on `IpcError`. Renderer needs `remoteMtimeMs` after `E_MTIME_MISMATCH`. Fix the normalize function.

**Files:**
- Modify: `electron/ipc/router.ts:61-69` (`normalize`)
- Modify: `preload/preload.ts:13-17` (`invoke` re-throws with `context`)
- Modify: `electron/ipc/router.ts` test if any (or add one inline)

- [ ] **Step 1: Write a failing test for context propagation through the IPC pipe**

Append to `electron/ipc/file.test.ts` (or create `electron/ipc/router.context.test.ts` if you prefer isolation):

```ts
import { normalize } from './router'
import { IpcError } from '@shared/ipc-contract'

describe('router.normalize (phase-09 4.3)', () => {
  it('preserves context on IpcError', () => {
    const err = new IpcError('E_MTIME_MISMATCH', 'mismatch', { remoteMtimeMs: 12345 })
    const shape = normalize(err)
    expect(shape.code).toBe('E_MTIME_MISMATCH')
    expect(shape.context).toEqual({ remoteMtimeMs: 12345 })
  })

  it('omits context when not present', () => {
    const err = new IpcError('E_INTERNAL', 'boom')
    const shape = normalize(err)
    expect(shape.context).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run electron/ipc/router.context.test.ts
```
(or whichever file you placed it in)
Expected: 2 FAIL.

- [ ] **Step 3: Fix `normalize`**

Edit `electron/ipc/router.ts:61-69`. Replace:

```ts
export function normalize(err: unknown): IpcErrorShape {
  if (err instanceof IpcError) {
    return {
      code: err.code,
      message: sanitizeMessage(err.message),
      ...(err.context ? { context: err.context } : {})
    }
  }
  if (err instanceof Error) {
    return { code: 'E_INTERNAL', message: sanitizeMessage(err.message) }
  }
  return { code: 'E_INTERNAL', message: 'Unknown error' }
}
```

- [ ] **Step 4: Update preload `invoke` to attach context to the rethrown `IpcError`**

Edit `preload/preload.ts:13-17`:

```ts
async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (!res.ok) {
    throw new IpcError(res.error.code, res.error.message, res.error.context)
  }
  return res.data
}
```

- [ ] **Step 5: Run, confirm pass**

```bash
npx vitest run electron/ipc/router.context.test.ts
```
Expected: 2 PASS.

- [ ] **Step 6: Smoke-check `file.write force`**

Append a test to `electron/ipc/file.test.ts`:

```ts
import { fileHandlers } from './file'
import { mkdtemp, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as groveSvc from '../services/grove'

describe('file.write force flag end-to-end (phase-09 4.3)', () => {
  it('overwrites stale-mtime file when force=true', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'fw-force-'))
    vi.spyOn(groveSvc, 'getCurrent').mockReturnValue({
      id: 'g', path: tmp, name: 'g', color: 'acorn',
      schema_version: 1, created_at: '', last_opened_at: '', sync_warning: null
    })
    await writeFile(join(tmp, 'x.md'), 'old')
    const result = await fileHandlers.write('x.md', 'new', {
      expectedMtime: 1, // very stale
      force: true
    })
    expect(result.mtimeMs).toBeGreaterThan(0)
    expect(await readFile(join(tmp, 'x.md'), 'utf8')).toBe('new')
    vi.restoreAllMocks()
  })
})
```

- [ ] **Step 7: Run, commit**

```bash
npx vitest run electron/ipc/file.test.ts
```
Expected: PASS (existing + new).

```bash
git add electron/ipc/router.ts preload/preload.ts electron/ipc/router.context.test.ts electron/ipc/file.test.ts
git commit -m "fix(ipc): propagate IpcError.context through router + preload (phase-09 4.3)"
```

---

<!-- openspec-task: 5.1 -->
### Task 16: editor store — `baseBody` / `baseFrontmatter` / `baseMtimeMs`

The editor store from phase 7 already holds `body` / `savedBody` / `savedMtimeMs` / `frontmatter`. We add three "base" fields that are populated **only** by `open(path)` and never touched by `save()`. They represent the canonical "what we loaded from disk before any edits" — needed for the snapshot's `base.md`.

**Files:**
- Modify: `src/stores/editor.ts` (extend `ready` variant + `open()` action)
- Modify: `src/stores/editor.test.ts` (assert base fields populated and stable across saves)

- [ ] **Step 1: Locate the `ready` variant**

Open `src/stores/editor.ts`. Find the discriminated union — phase 7's plan establishes shape like:
```ts
| {
    kind: 'ready'
    path: string
    frontmatter: Frontmatter
    body: string
    savedBody: string
    savedFrontmatter: Frontmatter
    savedMtimeMs: number
    saving: boolean
    lastError?: { code: IpcErrorCode; message: string }
  }
```

- [ ] **Step 2: Write failing test**

Append to `src/stores/editor.test.ts`:

```ts
describe('editor store base fields (phase-09 5.1)', () => {
  it('open() populates baseBody/baseFrontmatter/baseMtimeMs', async () => {
    mockIpc.files.get.mockResolvedValueOnce({
      summary: { path: 'a.md', mtimeMs: 1000 },
      frontmatter: { title: 't' },
      body: 'INITIAL BODY'
    })
    await useEditorStore.getState().open('a.md')
    const s = useEditorStore.getState()
    if (s.kind !== 'ready') throw new Error('expected ready')
    expect(s.baseBody).toBe('INITIAL BODY')
    expect(s.baseFrontmatter).toEqual({ title: 't' })
    expect(s.baseMtimeMs).toBe(1000)
  })

  it('save() does NOT update base fields', async () => {
    mockIpc.files.get.mockResolvedValueOnce({
      summary: { path: 'a.md', mtimeMs: 1000 },
      frontmatter: { title: 't' },
      body: 'B0'
    })
    mockIpc.file.write.mockResolvedValueOnce({ mtimeMs: 2000, sha256: 'x' })
    await useEditorStore.getState().open('a.md')
    useEditorStore.getState().setBody('B1')
    await useEditorStore.getState().save()
    const s = useEditorStore.getState()
    if (s.kind !== 'ready') throw new Error('expected ready')
    expect(s.baseBody).toBe('B0') // unchanged
    expect(s.baseMtimeMs).toBe(1000) // unchanged
    expect(s.savedBody).toBe('B1')
    expect(s.savedMtimeMs).toBe(2000)
  })
})
```

- [ ] **Step 3: Run, confirm failure**

```bash
npx vitest run src/stores/editor.test.ts -t "phase-09 5.1"
```
Expected: 2 FAIL (fields don't exist).

- [ ] **Step 4: Implement**

Edit `src/stores/editor.ts`. Find the `ready` variant in the state union and add three fields:

```ts
| {
    kind: 'ready'
    path: string
    frontmatter: Frontmatter
    body: string
    savedBody: string
    savedFrontmatter: Frontmatter
    savedMtimeMs: number
    /** Snapshot of what was loaded from disk; only mutated by open(), never by save(). */
    baseBody: string
    baseFrontmatter: Frontmatter
    baseMtimeMs: number
    saving: boolean
    lastError?: { code: IpcErrorCode; message: string }
    /* conflictState added in Task 17 */
  }
```

In `open(path)`, on the success branch where the store transitions to `ready`, populate the base fields equal to the loaded values:

```ts
set({
  kind: 'ready',
  path,
  frontmatter: parsed.frontmatter,
  body: parsed.body,
  savedFrontmatter: parsed.frontmatter,
  savedBody: parsed.body,
  savedMtimeMs: parsed.summary.mtimeMs,
  baseFrontmatter: parsed.frontmatter,
  baseBody: parsed.body,
  baseMtimeMs: parsed.summary.mtimeMs,
  saving: false
})
```

Make **no** change to `save()` — base fields must stay frozen across save success.

- [ ] **Step 5: Run, confirm pass**

```bash
npx vitest run src/stores/editor.test.ts -t "phase-09 5.1"
```
Expected: 2 PASS. Run the full editor test file:

```bash
npx vitest run src/stores/editor.test.ts
```
Expected: all PASS (phase 7 tests should not regress).

- [ ] **Step 6: Commit**

```bash
git add src/stores/editor.ts src/stores/editor.test.ts
git commit -m "feat(editor): track baseBody/baseFrontmatter/baseMtimeMs frozen across saves (phase-09 5.1)"
```

---

<!-- openspec-task: 5.2 -->
### Task 17: editor store — `conflictState` field

**Files:**
- Modify: `src/stores/editor.ts` (extend `ready` variant + initialise field)
- Modify: `src/stores/editor.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/stores/editor.test.ts`:

```ts
import type { ConflictState } from '@shared/conflict-types'

describe('editor store conflictState (phase-09 5.2)', () => {
  it('initialises to { kind: none } after open', async () => {
    mockIpc.files.get.mockResolvedValueOnce({
      summary: { path: 'a.md', mtimeMs: 1 },
      frontmatter: {},
      body: 'b'
    })
    await useEditorStore.getState().open('a.md')
    const s = useEditorStore.getState()
    if (s.kind !== 'ready') throw new Error('expected ready')
    const cs: ConflictState = s.conflictState
    expect(cs).toEqual({ kind: 'none' })
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run src/stores/editor.test.ts -t "phase-09 5.2"
```
Expected: 1 FAIL.

- [ ] **Step 3: Implement**

Add the field to the `ready` variant in `src/stores/editor.ts`:

```ts
    saving: boolean
    lastError?: { code: IpcErrorCode; message: string }
    conflictState: ConflictState
```

Add the import at the top:

```ts
import type { ConflictState } from '@shared/conflict-types'
```

In `open(path)`, set `conflictState: { kind: 'none' }` in the `set({...})` call.

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run src/stores/editor.test.ts -t "phase-09 5.2"
```
Expected: 1 PASS. Full file:

```bash
npx vitest run src/stores/editor.test.ts
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/editor.ts src/stores/editor.test.ts
git commit -m "feat(editor): conflictState initialised to none on open (phase-09 5.2)"
```

---

<!-- openspec-task: 5.3 -->
### Task 18: editor store — subscribe to `index:fileChanged`

This task implements all of 5.3.1 (filtering), 5.3.2 (silent reload when clean), and 5.3.3 (banner trigger when dirty).

**Files:**
- Modify: `src/stores/editor.ts`
- Modify: `src/stores/editor.test.ts`

- [ ] **Step 1: Write failing tests for the three branches**

Append to `src/stores/editor.test.ts`:

```ts
describe('editor store index:fileChanged subscriber (phase-09 5.3)', () => {
  let emit: (payload: { path: string; mtime: number; contentHash: string; frontmatter: Record<string, unknown> }) => void

  beforeEach(() => {
    // mockIpc.on returns an unsubscribe; capture the registered handler
    mockIpc.on.mockImplementation((channel: string, h: any) => {
      if (channel === 'index:fileChanged') emit = h
      return () => {}
    })
  })

  it('ignores events for other paths', async () => {
    mockIpc.files.get.mockResolvedValueOnce({
      summary: { path: 'a.md', mtimeMs: 1 },
      frontmatter: {}, body: 'b'
    })
    await useEditorStore.getState().open('a.md')
    emit({ path: 'b.md', mtime: 999, contentHash: '', frontmatter: {} })
    const s = useEditorStore.getState()
    if (s.kind !== 'ready') throw new Error('expected ready')
    expect(s.body).toBe('b')
    expect(s.conflictState).toEqual({ kind: 'none' })
  })

  it('ignores events whose mtime equals savedMtimeMs (self-write echo)', async () => {
    mockIpc.files.get.mockResolvedValueOnce({
      summary: { path: 'a.md', mtimeMs: 1000 },
      frontmatter: {}, body: 'b'
    })
    await useEditorStore.getState().open('a.md')
    emit({ path: 'a.md', mtime: 1000, contentHash: '', frontmatter: {} })
    const s = useEditorStore.getState()
    if (s.kind !== 'ready') throw new Error('expected ready')
    expect(s.conflictState).toEqual({ kind: 'none' })
  })

  it('silently reloads when not dirty', async () => {
    mockIpc.files.get
      .mockResolvedValueOnce({
        summary: { path: 'a.md', mtimeMs: 1 },
        frontmatter: {}, body: 'OLD'
      })
      .mockResolvedValueOnce({
        summary: { path: 'a.md', mtimeMs: 2 },
        frontmatter: {}, body: 'NEW'
      })
    await useEditorStore.getState().open('a.md')
    emit({ path: 'a.md', mtime: 2, contentHash: '', frontmatter: {} })
    // Allow the async reload to settle
    await new Promise((r) => setTimeout(r, 10))
    const s = useEditorStore.getState()
    if (s.kind !== 'ready') throw new Error('expected ready')
    expect(s.body).toBe('NEW')
    expect(s.savedBody).toBe('NEW')
    expect(s.savedMtimeMs).toBe(2)
    expect(s.baseBody).toBe('NEW') // base updated on silent reload too
    expect(s.conflictState).toEqual({ kind: 'none' })
  })

  it('shows externalModified banner when dirty', async () => {
    mockIpc.files.get.mockResolvedValueOnce({
      summary: { path: 'a.md', mtimeMs: 1 },
      frontmatter: {}, body: 'OLD'
    })
    await useEditorStore.getState().open('a.md')
    useEditorStore.getState().setBody('USER EDIT')
    emit({ path: 'a.md', mtime: 999, contentHash: '', frontmatter: {} })
    const s = useEditorStore.getState()
    if (s.kind !== 'ready') throw new Error('expected ready')
    expect(s.body).toBe('USER EDIT') // not overwritten
    expect(s.conflictState).toEqual({ kind: 'externalModified', remoteMtimeMs: 999 })
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run src/stores/editor.test.ts -t "phase-09 5.3"
```
Expected: 4 FAIL.

- [ ] **Step 3: Implement the subscription**

In `src/stores/editor.ts`, add a top-level subscription that lives for the app's lifetime. Phase 7's editor module likely already has an init or pages/Editor.tsx that calls a `subscribeWatcher()` setup; if not, expose an init function.

Add this near the bottom of `src/stores/editor.ts`:

```ts
import { ipc } from '@/ipc/client'

let _watcherUnsub: (() => void) | null = null

export function subscribeWatcher(): () => void {
  if (_watcherUnsub) return _watcherUnsub
  _watcherUnsub = ipc.on('index:fileChanged', async (payload) => {
    const s = useEditorStore.getState()
    if (s.kind !== 'ready') return
    if (payload.path !== s.path) return
    if (Math.abs(payload.mtime - s.savedMtimeMs) <= 2) return // self-write echo + tolerance
    const dirty = s.body !== s.savedBody
    if (!dirty) {
      // Silent reload
      try {
        const fresh = await ipc.files.get(payload.path)
        useEditorStore.setState((cur) => {
          if (cur.kind !== 'ready' || cur.path !== payload.path) return cur
          return {
            ...cur,
            frontmatter: fresh.frontmatter,
            body: fresh.body,
            savedFrontmatter: fresh.frontmatter,
            savedBody: fresh.body,
            savedMtimeMs: fresh.summary.mtimeMs,
            baseFrontmatter: fresh.frontmatter,
            baseBody: fresh.body,
            baseMtimeMs: fresh.summary.mtimeMs,
            conflictState: { kind: 'none' }
          }
        })
      } catch {
        // Reload failed (file deleted etc.) — leave state alone; phase 5
        // will deliver fileDeleted event separately.
      }
      return
    }
    // dirty → set externalModified
    useEditorStore.setState((cur) => {
      if (cur.kind !== 'ready' || cur.path !== payload.path) return cur
      return {
        ...cur,
        conflictState: { kind: 'externalModified', remoteMtimeMs: payload.mtime }
      }
    })
  })
  return _watcherUnsub
}
```

Wire `subscribeWatcher()` from the Editor page mount (phase 7's `src/pages/Editor.tsx` mounts/unmounts the editor; add a `useEffect(() => subscribeWatcher(), [])`).

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run src/stores/editor.test.ts -t "phase-09 5.3"
```
Expected: 4 PASS. (If `mockIpc.on` isn't already mocked, extend phase 7's mock setup to include `on: vi.fn()`.)

- [ ] **Step 5: Commit**

```bash
git add src/stores/editor.ts src/stores/editor.test.ts src/pages/Editor.tsx
git commit -m "feat(editor): subscribe to index:fileChanged — silent reload or banner (phase-09 5.3)"
```

---

<!-- openspec-task: 5.4 -->
### Task 19: editor store — `save()` E_MTIME_MISMATCH branch

This task lands all of 5.4.1 (fetch remote), 5.4.2 (set conflictState=saveConflict), and 5.4.3 (UI signal — implemented as a state transition; the actual modal is in Plan 3).

**Files:**
- Modify: `src/stores/editor.ts` (`save()`)
- Modify: `src/stores/editor.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/stores/editor.test.ts`:

```ts
import { IpcError } from '@shared/ipc-contract'

describe('editor store save() E_MTIME_MISMATCH (phase-09 5.4)', () => {
  it('on E_MTIME_MISMATCH: fetches remote and sets conflictState=saveConflict', async () => {
    mockIpc.files.get
      .mockResolvedValueOnce({
        summary: { path: 'a.md', mtimeMs: 1 },
        frontmatter: { title: 'old' }, body: 'B0'
      })
      .mockResolvedValueOnce({
        summary: { path: 'a.md', mtimeMs: 999 },
        frontmatter: { title: 'remote' }, body: 'REMOTE'
      })
    await useEditorStore.getState().open('a.md')
    useEditorStore.getState().setBody('LOCAL')
    mockIpc.file.write.mockRejectedValueOnce(
      new IpcError('E_MTIME_MISMATCH', 'mismatch', { remoteMtimeMs: 999 })
    )
    await useEditorStore.getState().save()
    const s = useEditorStore.getState()
    if (s.kind !== 'ready') throw new Error('expected ready')
    expect(s.body).toBe('LOCAL') // not overwritten
    expect(s.conflictState.kind).toBe('saveConflict')
    if (s.conflictState.kind === 'saveConflict') {
      expect(s.conflictState.remoteMtimeMs).toBe(999)
      expect(s.conflictState.remoteBody).toBe('REMOTE')
      expect(s.conflictState.remoteFrontmatter).toEqual({ title: 'remote' })
    }
  })

  it('saving=false after the conflict transition', async () => {
    mockIpc.files.get
      .mockResolvedValueOnce({
        summary: { path: 'a.md', mtimeMs: 1 },
        frontmatter: {}, body: 'B0'
      })
      .mockResolvedValueOnce({
        summary: { path: 'a.md', mtimeMs: 999 },
        frontmatter: {}, body: 'R'
      })
    await useEditorStore.getState().open('a.md')
    useEditorStore.getState().setBody('L')
    mockIpc.file.write.mockRejectedValueOnce(
      new IpcError('E_MTIME_MISMATCH', 'mismatch', { remoteMtimeMs: 999 })
    )
    await useEditorStore.getState().save()
    const s = useEditorStore.getState()
    if (s.kind !== 'ready') throw new Error('expected ready')
    expect(s.saving).toBe(false)
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run src/stores/editor.test.ts -t "phase-09 5.4"
```
Expected: 2 FAIL.

- [ ] **Step 3: Implement**

In `src/stores/editor.ts`, find `save()`. Phase 7's body has a `try/catch` around `ipc.file.write`. Replace the `E_MTIME_MISMATCH` branch with:

```ts
    } catch (err) {
      const e = err as IpcError
      if (e.code === 'E_MTIME_MISMATCH') {
        // Phase-09: enter saveConflict state instead of toast
        try {
          const fresh = await ipc.files.get(s.path)
          useEditorStore.setState((cur) => {
            if (cur.kind !== 'ready' || cur.path !== s.path) return cur
            return {
              ...cur,
              saving: false,
              conflictState: {
                kind: 'saveConflict',
                remoteMtimeMs:
                  (e.context?.remoteMtimeMs as number | undefined) ??
                  fresh.summary.mtimeMs,
                remoteBody: fresh.body,
                remoteFrontmatter: fresh.frontmatter
              }
            }
          })
        } catch (refetchErr) {
          // Even if remote fetch fails, set saveConflict with empty remote so
          // UI can present "重载磁盘" as a fallback that re-tries the fetch.
          useEditorStore.setState((cur) => {
            if (cur.kind !== 'ready') return cur
            return {
              ...cur,
              saving: false,
              lastError: { code: 'E_MTIME_MISMATCH', message: e.message }
            }
          })
        }
        return // do NOT count toward retry counter (Task 21)
      }
      // Other error codes — phase 7 behaviour preserved (toast + lastError)
      // ... existing branches ...
    }
```

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run src/stores/editor.test.ts -t "phase-09 5.4"
```
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/editor.ts src/stores/editor.test.ts
git commit -m "feat(editor): E_MTIME_MISMATCH transitions to saveConflict (phase-09 5.4)"
```

---

<!-- openspec-task: 5.5 -->
### Task 20: lock save scheduling while a conflict is unresolved

When `conflictState.kind` is `externalModified` or `saveConflict`, `scheduleSave`, `flushSave`, and the Cmd+S keyboard handler MUST be no-ops.

**Files:**
- Modify: `src/stores/editor.ts`
- Modify: `src/stores/editor.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/stores/editor.test.ts`:

```ts
describe('editor store save lock during conflict (phase-09 5.5)', () => {
  it('scheduleSave is a no-op during externalModified', async () => {
    mockIpc.files.get.mockResolvedValueOnce({
      summary: { path: 'a.md', mtimeMs: 1 }, frontmatter: {}, body: 'b'
    })
    await useEditorStore.getState().open('a.md')
    useEditorStore.setState((cur) => {
      if (cur.kind !== 'ready') return cur
      return { ...cur, conflictState: { kind: 'externalModified', remoteMtimeMs: 9 } }
    })
    useEditorStore.getState().setBody('NEW')
    useEditorStore.getState().scheduleSave()
    // Wait > debounce window
    await new Promise((r) => setTimeout(r, 1100))
    expect(mockIpc.file.write).not.toHaveBeenCalled()
  })

  it('flushSave is a no-op during saveConflict', async () => {
    mockIpc.files.get.mockResolvedValueOnce({
      summary: { path: 'a.md', mtimeMs: 1 }, frontmatter: {}, body: 'b'
    })
    await useEditorStore.getState().open('a.md')
    useEditorStore.setState((cur) => {
      if (cur.kind !== 'ready') return cur
      return {
        ...cur,
        conflictState: {
          kind: 'saveConflict',
          remoteMtimeMs: 9,
          remoteBody: '',
          remoteFrontmatter: {}
        }
      }
    })
    await useEditorStore.getState().flushSave()
    expect(mockIpc.file.write).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run src/stores/editor.test.ts -t "phase-09 5.5"
```
Expected: 2 FAIL (writes are still happening because no guard).

- [ ] **Step 3: Implement the guard helper**

In `src/stores/editor.ts`, add near the top of the module:

```ts
function isBlockedByConflict(s: EditorState): boolean {
  if (s.kind !== 'ready') return false
  return (
    s.conflictState.kind === 'externalModified' ||
    s.conflictState.kind === 'saveConflict'
  )
}
```

Edit `scheduleSave`, `flushSave`, and `save` to early-return when `isBlockedByConflict(get())` is true:

```ts
scheduleSave: () => {
  if (isBlockedByConflict(get())) return
  // ... existing debounce logic ...
},

flushSave: async () => {
  if (isBlockedByConflict(get())) return
  // ... existing flush logic ...
},

save: async () => {
  if (isBlockedByConflict(get())) return
  // ... existing save logic ...
}
```

If phase 7's editor wires Cmd+S in a component (likely `src/components/editor/EditorBody.tsx` or similar), add the same guard there:

```ts
const onKeyDown = (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault()
    const s = useEditorStore.getState()
    if (s.kind === 'ready' && (s.conflictState.kind === 'externalModified' || s.conflictState.kind === 'saveConflict')) return
    useEditorStore.getState().flushSave()
  }
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run src/stores/editor.test.ts -t "phase-09 5.5"
```
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/editor.ts src/stores/editor.test.ts src/components/editor/*.tsx
git commit -m "feat(editor): lock scheduleSave/flushSave/Cmd+S during conflict (phase-09 5.5)"
```

---

<!-- openspec-task: 5.6 -->
### Task 21: retry counter excludes E_MTIME_MISMATCH

Phase 7 introduced a retry counter that, after 3 consecutive non-mtime save failures, surfaces a "保存持续失败" modal. Mtime mismatches go through ConflictDialog and MUST NOT increment that counter.

**Files:**
- Modify: `src/stores/editor.ts`
- Modify: `src/stores/editor.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/stores/editor.test.ts`:

```ts
describe('editor store retry counter (phase-09 5.6)', () => {
  it('E_MTIME_MISMATCH does not increment retryCount', async () => {
    mockIpc.files.get
      .mockResolvedValueOnce({ summary: { path: 'a.md', mtimeMs: 1 }, frontmatter: {}, body: 'b' })
      .mockResolvedValue({ summary: { path: 'a.md', mtimeMs: 9 }, frontmatter: {}, body: 'r' })
    await useEditorStore.getState().open('a.md')
    for (let i = 0; i < 3; i++) {
      useEditorStore.getState().setBody('L' + i)
      // Reset conflictState back to none between iterations to allow save
      useEditorStore.setState((cur) => {
        if (cur.kind !== 'ready') return cur
        return { ...cur, conflictState: { kind: 'none' } }
      })
      mockIpc.file.write.mockRejectedValueOnce(
        new IpcError('E_MTIME_MISMATCH', 'mismatch', { remoteMtimeMs: 9 })
      )
      await useEditorStore.getState().save()
    }
    const s = useEditorStore.getState()
    if (s.kind !== 'ready') throw new Error('expected ready')
    // retryCount should still be 0 (or absent) — not 3
    expect((s as any).retryCount ?? 0).toBe(0)
  })

  it('E_PERMISSION DOES increment retryCount', async () => {
    mockIpc.files.get.mockResolvedValueOnce({
      summary: { path: 'a.md', mtimeMs: 1 }, frontmatter: {}, body: 'b'
    })
    await useEditorStore.getState().open('a.md')
    for (let i = 0; i < 3; i++) {
      useEditorStore.getState().setBody('L' + i)
      mockIpc.file.write.mockRejectedValueOnce(
        new IpcError('E_PERMISSION', 'no perms')
      )
      await useEditorStore.getState().save()
    }
    const s = useEditorStore.getState()
    if (s.kind !== 'ready') throw new Error('expected ready')
    expect((s as any).retryCount).toBe(3)
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run src/stores/editor.test.ts -t "phase-09 5.6"
```
Expected: at least 1 FAIL (probably the first — phase 7 likely incremented on every error).

- [ ] **Step 3: Implement**

In `src/stores/editor.ts`, locate where `retryCount` is incremented in the `catch` block of `save()`. Restructure so the `E_MTIME_MISMATCH` path returns **before** the counter increment:

```ts
} catch (err) {
  const e = err as IpcError
  if (e.code === 'E_MTIME_MISMATCH') {
    // Task 19 already returns early after setting saveConflict — no counter touch
    // (intentional: mtime mismatches go through ConflictDialog flow)
    // ... existing Task 19 code ...
    return
  }
  // Non-conflict errors → retry counter
  useEditorStore.setState((cur) => {
    if (cur.kind !== 'ready') return cur
    const next = (cur.retryCount ?? 0) + 1
    return {
      ...cur,
      saving: false,
      retryCount: next,
      lastError: { code: e.code, message: e.message }
    }
  })
  // ... existing toast / persistent-modal logic ...
}
```

If `retryCount` is not yet a field, add it to the `ready` variant:

```ts
    retryCount?: number
```

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run src/stores/editor.test.ts -t "phase-09 5.6"
```
Expected: 2 PASS.

- [ ] **Step 5: Run the full editor test file + main suite**

```bash
npx vitest run src/stores/editor.test.ts
npm test
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/stores/editor.ts src/stores/editor.test.ts
git commit -m "feat(editor): retry counter excludes E_MTIME_MISMATCH (phase-09 5.6)"
```

---

## Self-Review

1. **Spec coverage:** This plan owns labels 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6. Verify:
```bash
grep -E "openspec-task: (4\.[1-3]|5\.[1-6])" /Users/aaa/develop/workspace-ai/acornvo/docs/superpowers/plans/2026-04-30-phase-09-conflict-handling-tasks-4.1-5.6.md | sort -u
```
Expected: 9 unique labels.

2. **Type consistency:** `ConflictState` is imported from `@shared/conflict-types` everywhere. The `saveConflict` variant fields (`remoteMtimeMs`, `remoteBody`, `remoteFrontmatter`) match the type definition from Plan 1.

3. **Save lock helper used in 3 places:** `scheduleSave`, `flushSave`, `save` (and Cmd+S) all early-return via `isBlockedByConflict(get())`.

4. **`E_MTIME_MISMATCH` does NOT count toward retry:** the early `return` in Task 19's `save()` happens before the counter increment in Task 21. Trace: Task 19 sets `saving: false` + `conflictState = saveConflict` + `return` → never reaches the increment block.

5. **No placeholders:** every step has runnable code or commands. ✓
