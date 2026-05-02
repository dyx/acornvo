# Phase 09 Conflict Handling — Plan 4 (Tasks 9.1–9.17)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the acceptance pass for phase-09. Convert each `9.x` line of `tasks.md` into either an integration test (preferred — automated, lives next to the editor store) or a documented manual smoke step. Capture the unit-test bundle (9.16) and finalise with `openspec validate phase-09-conflict-handling --strict` (9.17).

**Architecture:** Most acceptance scenarios already have unit tests created across Plans 1–3. This plan **does not duplicate them** — it adds:
1. A handful of true integration tests under `src/integration/conflict-handling.test.ts` (uses jsdom, mocked IPC, real Zustand store + components rendered together).
2. A manual smoke checklist in `docs/runbooks/phase-09-smoke.md` for the scenarios that need a real Electron window + real filesystem (e.g. `9.5` "log includes force-write" line — only verifiable with electron-log on disk).
3. Cross-plan unit-test consolidation (9.16) that just runs the relevant subset and confirms green.
4. The final `openspec validate ... --strict` invocation (9.17).

**Tech Stack:** Same as Plan 3 + electron-log inspection on disk for the smoke pass.

---

## Pre-flight

Plans 1, 2, and 3 must be merged. Phase 7 must be merged. Verify:
```bash
test -f /Users/aaa/develop/workspace-ai/acornvo/src/components/editor/ConflictDialog.tsx && \
test -f /Users/aaa/develop/workspace-ai/acornvo/src/components/editor/ExternalModifiedBanner.tsx && \
test -f /Users/aaa/develop/workspace-ai/acornvo/electron/services/conflicts/store.ts && \
echo "OK"
```

Also confirm `npm test` is green at HEAD before starting:
```bash
npm test
```
Expected: all PASS. Any pre-existing failure must be triaged first; do not start acceptance on a red bar.

## File Structure

| Path | Action | Owner task |
|---|---|---|
| `src/integration/conflict-handling.test.ts` | Create | 9.1, 9.2, 9.3, 9.4, 9.8, 9.9, 9.13 |
| `electron/services/conflicts/store.test.ts` | Modify (9.10 path-escape; 9.11 retention) | 9.10, 9.11 |
| `electron/services/conflicts/retention-startup.test.ts` | Create | 9.11 |
| `src/stores/editor.test.ts` | Modify (9.12, 9.14, 9.15) | 9.12, 9.14, 9.15 |
| `electron/services/fs-atomic.test.ts` | Verify (9.16 mtime tolerance — already added by Plan 1 Task 6) | 9.16 |
| `docs/runbooks/phase-09-smoke.md` | Create (manual checklist for 9.5, 9.6, 9.7) | 9.5, 9.6, 9.7 |

## Conventions reused

- Integration tests render `<ExternalModifiedBanner />` + `<ConflictDialog />` together using the real Zustand store. Mock the IPC client only.
- Mock pattern (one place for the whole file):
  ```ts
  vi.mock('@/ipc/client', () => ({ ipc: mockIpc, useIpc: () => mockIpc }))
  ```
- All `expect(...).toMatchObject({ code: '...' })` for IpcError assertions (we already use this in Plan 1).
- Manual smoke entries in `docs/runbooks/phase-09-smoke.md` follow the existing runbooks format.

---

<!-- openspec-task: 9.1 -->
### Task 33: integration test — clean editor + external change → silent reload

**Files:**
- Create: `src/integration/conflict-handling.test.ts`

- [ ] **Step 1: Create the integration test file with 9.1's scenario**

Create `src/integration/conflict-handling.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ExternalModifiedBanner } from '@/components/editor/ExternalModifiedBanner'
import { ConflictDialog } from '@/components/editor/ConflictDialog'
import { useEditorStore, subscribeWatcher } from '@/stores/editor'

// Hand-rolled IPC mock; same shape used in unit tests.
const mockIpc: any = {
  files: { get: vi.fn() },
  file: { write: vi.fn(), exists: vi.fn() },
  conflict: { writeSnapshot: vi.fn() },
  on: vi.fn()
}
vi.mock('@/ipc/client', () => ({ ipc: mockIpc, useIpc: () => mockIpc }))

let emitFileChanged: (p: any) => void

beforeEach(() => {
  vi.clearAllMocks()
  useEditorStore.setState({ kind: 'idle' } as any)
  mockIpc.on.mockImplementation((channel: string, h: any) => {
    if (channel === 'index:fileChanged') emitFileChanged = h
    return () => {}
  })
  subscribeWatcher()
})

afterEach(() => { vi.restoreAllMocks() })

describe('9.1 clean editor + external change → silent reload', () => {
  it('updates body without showing the banner', async () => {
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
    render(<><ExternalModifiedBanner /><ConflictDialog /></>)

    await act(async () => {
      emitFileChanged({ path: 'a.md', mtime: 2, contentHash: '', frontmatter: {} })
      await new Promise((r) => setTimeout(r, 10))
    })

    const s = useEditorStore.getState()
    if (s.kind !== 'ready') throw new Error('expected ready')
    expect(s.body).toBe('NEW')
    expect(screen.queryByRole('alert')).toBeNull() // banner not shown
    expect(screen.queryByRole('dialog')).toBeNull() // dialog not shown
  })
})
```

- [ ] **Step 2: Run, confirm pass**

```bash
npx vitest run src/integration/conflict-handling.test.ts -t "9.1"
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/integration/conflict-handling.test.ts
git commit -m "test(phase-09): integration 9.1 clean editor silent-reloads (phase-09 9.1)"
```

---

<!-- openspec-task: 9.2 -->
### Task 34: integration test — dirty editor + external change → banner; input doesn't save

**Files:**
- Modify: `src/integration/conflict-handling.test.ts`

- [ ] **Step 1: Add the test**

Append:

```ts
describe('9.2 dirty editor + external change → banner; input does NOT save', () => {
  it('renders banner; setBody during banner does not call file.write', async () => {
    mockIpc.files.get.mockResolvedValueOnce({
      summary: { path: 'a.md', mtimeMs: 1 }, frontmatter: {}, body: 'B'
    })
    await useEditorStore.getState().open('a.md')
    useEditorStore.getState().setBody('USER1') // make dirty
    render(<><ExternalModifiedBanner /><ConflictDialog /></>)

    await act(async () => {
      emitFileChanged({ path: 'a.md', mtime: 999, contentHash: '', frontmatter: {} })
    })

    expect(screen.getByRole('alert')).toBeInTheDocument()

    // Continue typing — autosave debounce window is ~1s in phase 7
    useEditorStore.getState().setBody('USER2')
    useEditorStore.getState().scheduleSave()
    await new Promise((r) => setTimeout(r, 1100))
    expect(mockIpc.file.write).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run, confirm pass**

```bash
npx vitest run src/integration/conflict-handling.test.ts -t "9.2"
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/integration/conflict-handling.test.ts
git commit -m "test(phase-09): 9.2 dirty editor shows banner and locks save (phase-09 9.2)"
```

---

<!-- openspec-task: 9.3 -->
### Task 35: integration test — banner 重载 → 4-file snapshot, local discarded

**Files:**
- Modify: `src/integration/conflict-handling.test.ts`

- [ ] **Step 1: Add the test**

Append:

```ts
import { fireEvent } from '@testing-library/react'

describe('9.3 banner 重载 → snapshot in .acornvo/conflicts/<id>/', () => {
  it('writes snapshot via IPC and discards local edits', async () => {
    mockIpc.files.get
      .mockResolvedValueOnce({
        summary: { path: 'a.md', mtimeMs: 1 },
        frontmatter: {}, body: 'B'
      })
      .mockResolvedValueOnce({
        summary: { path: 'a.md', mtimeMs: 999 },
        frontmatter: {}, body: 'REMOTE'
      })
    mockIpc.conflict.writeSnapshot.mockResolvedValueOnce({ id: 'snap-1' })

    await useEditorStore.getState().open('a.md')
    useEditorStore.getState().setBody('LOCAL')
    await act(async () => {
      emitFileChanged({ path: 'a.md', mtime: 999, contentHash: '', frontmatter: {} })
    })
    render(<><ExternalModifiedBanner /><ConflictDialog /></>)
    await act(async () => {
      fireEvent.click(screen.getByTestId('banner-reload'))
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(mockIpc.conflict.writeSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'a.md',
        resolvedBy: 'load_remote_banner',
        baseText: expect.stringContaining('B'),
        localText: expect.stringContaining('LOCAL'),
        remoteText: expect.stringContaining('REMOTE')
      })
    )
    const s = useEditorStore.getState()
    if (s.kind !== 'ready') throw new Error('expected ready')
    expect(s.body).toBe('REMOTE')
    expect(s.savedBody).toBe('REMOTE')
  })
})
```

- [ ] **Step 2: Run, commit**

```bash
npx vitest run src/integration/conflict-handling.test.ts -t "9.3"
git add src/integration/conflict-handling.test.ts
git commit -m "test(phase-09): 9.3 banner reload triggers writeSnapshot (phase-09 9.3)"
```

---

<!-- openspec-task: 9.4 -->
### Task 36: integration test — banner 忽略 + next save → ConflictDialog opens

**Files:**
- Modify: `src/integration/conflict-handling.test.ts`

- [ ] **Step 1: Add the test**

Append:

```ts
import { IpcError } from '@shared/ipc-contract'

describe('9.4 banner 忽略 + next save → ConflictDialog opens', () => {
  it('after ignore, save fails with E_MTIME_MISMATCH and dialog appears', async () => {
    mockIpc.files.get
      .mockResolvedValueOnce({
        summary: { path: 'a.md', mtimeMs: 1 }, frontmatter: {}, body: 'B'
      })
      .mockResolvedValueOnce({
        summary: { path: 'a.md', mtimeMs: 999 }, frontmatter: {}, body: 'REMOTE'
      })
    await useEditorStore.getState().open('a.md')
    useEditorStore.getState().setBody('LOCAL')
    await act(async () => {
      emitFileChanged({ path: 'a.md', mtime: 999, contentHash: '', frontmatter: {} })
    })
    render(<><ExternalModifiedBanner /><ConflictDialog /></>)

    fireEvent.click(screen.getByTestId('banner-ignore'))
    expect(screen.queryByRole('alert')).toBeNull()

    mockIpc.file.write.mockRejectedValueOnce(
      new IpcError('E_MTIME_MISMATCH', 'mismatch', { remoteMtimeMs: 999 })
    )
    await act(async () => {
      await useEditorStore.getState().flushSave()
    })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, commit**

```bash
npx vitest run src/integration/conflict-handling.test.ts -t "9.4"
git add src/integration/conflict-handling.test.ts
git commit -m "test(phase-09): 9.4 ignore + save → dialog opens (phase-09 9.4)"
```

---

<!-- openspec-task: 9.5 -->
### Task 37: smoke checklist — Dialog 保留本地 → disk overwritten + force-write log

This scenario verifies the actual `electron-log` output, which only happens in a real Electron run. Document it in `docs/runbooks/phase-09-smoke.md`.

**Files:**
- Create: `docs/runbooks/phase-09-smoke.md`

- [ ] **Step 1: Create the runbook**

Create `docs/runbooks/phase-09-smoke.md`:

```markdown
# Phase 09 Conflict Handling — Manual Smoke Checklist

Run after a fresh `npm run dev`. All scenarios assume:
- A grove is opened at `~/scratch/conflict-test/`
- A file `notes/a.md` exists with body "BASE"

## 9.5 Dialog 保留本地 → disk overwritten + force-write audit

1. Open `notes/a.md` in the editor; type a few characters → dirty.
2. In a separate terminal, overwrite the file:
   ```bash
   echo 'EXTERNAL' > ~/scratch/conflict-test/notes/a.md
   ```
3. Continue typing in the editor (debounce will fire `save()` within ~1s).
4. **Expect:** ConflictDialog opens.
5. Click "保留本地".
6. **Verify:** `cat ~/scratch/conflict-test/notes/a.md` shows the editor's body (not "EXTERNAL").
7. **Verify:** `ls ~/scratch/conflict-test/.acornvo/conflicts/` lists a fresh `<id>` directory containing `local.md`, `remote.md`, `base.md`, `meta.json`. `meta.json` has `"resolved_by": "keep_local"`.
8. **Verify the force-write audit log:**
   ```bash
   tail -n 50 ~/Library/Logs/acornvo/main.log | grep force-write
   ```
   Expected: a line like `force-write { path: ".../notes/a.md", old_mtime: <number>, expected_mtime: <number> }`.

## 9.6 Dialog 重载磁盘 → editor shows remote + snapshot

1. Repeat steps 1–4 from 9.5.
2. Click "重载磁盘".
3. **Verify:** editor body now reads "EXTERNAL".
4. **Verify:** snapshot directory exists with `meta.resolved_by = "load_remote"`.
5. **Verify:** dirty indicator (TitleBar dot) is cleared.

## 9.7 Dialog 另存副本 → new sibling file + navigation

1. Repeat steps 1–4 from 9.5.
2. Click "另存副本".
3. **Verify:** the URL changes to `/editor/notes%2Fa.conflict.<TS>.md`.
4. **Verify:** `ls ~/scratch/conflict-test/notes/` lists both `a.md` (with "EXTERNAL" content) and `a.conflict.<TS>.md` (with the editor's local body).
5. **Verify:** snapshot directory exists with `meta.resolved_by = "save_as"` and `meta.winner_path = "notes/a.conflict.<TS>.md"`.

## Sign-off

Tester: __________________  Date: __________________

All boxes checked? ☐
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/phase-09-smoke.md
git commit -m "docs(runbook): phase-09 smoke checklist for 9.5/9.6/9.7 (phase-09 9.5)"
```

> **Execution note:** Plans 1–3 already covered the automated portions of 9.5, 9.6, 9.7 (store-action tests for `keepLocal`, `reloadFromDisk` with `load_remote`, `saveAsCopy`). The runbook entries above ensure the human-only checks (real `force-write` log, real navigation, real disk content) are explicitly validated before this change ships.

---

<!-- openspec-task: 9.6 -->
### Task 38: smoke checklist 9.6 — covered by Task 37

This label is fully addressed by the section "9.6 Dialog 重载磁盘" in `docs/runbooks/phase-09-smoke.md` (created by Task 37). No additional work; the checkbox below tracks confirming the runbook entry exists.

- [ ] **Step 1: Confirm the runbook section is present**

```bash
grep -q "## 9.6 Dialog 重载磁盘" /Users/aaa/develop/workspace-ai/acornvo/docs/runbooks/phase-09-smoke.md && echo OK
```
Expected: `OK`.

---

<!-- openspec-task: 9.7 -->
### Task 39: smoke checklist 9.7 — covered by Task 37

Same pattern: section "9.7 Dialog 另存副本" in `docs/runbooks/phase-09-smoke.md`.

- [ ] **Step 1: Confirm the runbook section is present**

```bash
grep -q "## 9.7 Dialog 另存副本" /Users/aaa/develop/workspace-ai/acornvo/docs/runbooks/phase-09-smoke.md && echo OK
```
Expected: `OK`.

---

<!-- openspec-task: 9.8 -->
### Task 40: integration test — Dialog 稍后处理 → dialog closes, banner reappears, save re-pops dialog next time

**Files:**
- Modify: `src/integration/conflict-handling.test.ts`

- [ ] **Step 1: Add the test**

Append:

```ts
describe('9.8 Dialog 稍后处理 → banner re-shown; next save re-opens dialog', () => {
  it('saveConflict → externalModified → save fails again → saveConflict', async () => {
    mockIpc.files.get
      .mockResolvedValueOnce({
        summary: { path: 'a.md', mtimeMs: 1 }, frontmatter: {}, body: 'B'
      })
      .mockResolvedValueOnce({
        summary: { path: 'a.md', mtimeMs: 999 }, frontmatter: {}, body: 'R'
      })
      .mockResolvedValueOnce({
        summary: { path: 'a.md', mtimeMs: 999 }, frontmatter: {}, body: 'R'
      })

    await useEditorStore.getState().open('a.md')
    useEditorStore.getState().setBody('L')
    mockIpc.file.write.mockRejectedValueOnce(
      new IpcError('E_MTIME_MISMATCH', 'mismatch', { remoteMtimeMs: 999 })
    )
    await act(async () => {
      await useEditorStore.getState().flushSave()
    })
    render(<><ExternalModifiedBanner /><ConflictDialog /></>)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Click 稍后处理
    fireEvent.click(screen.getByTestId('dlg-later'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('alert')).toBeInTheDocument() // banner reappears

    // Verify dirty preserved
    let s = useEditorStore.getState()
    if (s.kind !== 'ready') throw new Error('expected ready')
    expect(s.body).toBe('L')
    expect(s.savedBody).toBe('B')

    // Trigger save again — banner already visible blocks scheduleSave per 5.5,
    // so we have to click "忽略" first to unlock save.
    fireEvent.click(screen.getByTestId('banner-ignore'))
    mockIpc.file.write.mockRejectedValueOnce(
      new IpcError('E_MTIME_MISMATCH', 'mismatch', { remoteMtimeMs: 999 })
    )
    await act(async () => {
      await useEditorStore.getState().flushSave()
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, commit**

```bash
npx vitest run src/integration/conflict-handling.test.ts -t "9.8"
git add src/integration/conflict-handling.test.ts
git commit -m "test(phase-09): 9.8 later → banner → next save → dialog (phase-09 9.8)"
```

---

<!-- openspec-task: 9.9 -->
### Task 41: integration test — same-second 另存副本 → -1 suffix

**Files:**
- Modify: `src/integration/conflict-handling.test.ts`

- [ ] **Step 1: Add the test**

Append:

```ts
describe('9.9 同秒再次 另存副本 → -1 后缀', () => {
  it('falls back to -1 suffix when desired path exists', async () => {
    mockIpc.files.get.mockResolvedValueOnce({
      summary: { path: 'notes/a.md', mtimeMs: 1 }, frontmatter: {}, body: 'B'
    })
    await useEditorStore.getState().open('notes/a.md')
    useEditorStore.getState().setBody('L')
    useEditorStore.setState((cur) => {
      if (cur.kind !== 'ready') return cur
      return {
        ...cur,
        conflictState: {
          kind: 'saveConflict', remoteMtimeMs: 9, remoteBody: 'R', remoteFrontmatter: {}
        }
      }
    })
    mockIpc.file.exists
      .mockResolvedValueOnce(true)   // base path taken
      .mockResolvedValueOnce(false)  // -1 free
    mockIpc.file.write.mockResolvedValueOnce({ mtimeMs: 2, sha256: 'x' })
    mockIpc.conflict.writeSnapshot.mockResolvedValueOnce({ id: 's' })

    await useEditorStore.getState().saveAsCopy()

    expect(mockIpc.file.write.mock.calls[0][0]).toMatch(/-1\.md$/)
  })
})
```

- [ ] **Step 2: Run, commit**

```bash
npx vitest run src/integration/conflict-handling.test.ts -t "9.9"
git add src/integration/conflict-handling.test.ts
git commit -m "test(phase-09): 9.9 same-second 另存副本 dedupes with -1 (phase-09 9.9)"
```

---

<!-- openspec-task: 9.10 -->
### Task 42: store unit test — `conflict.delete('../../etc')` → E_PERMISSION

This is already covered by Plan 1 Task 12 step 1 (`'throws E_PERMISSION on path-escape attempt'`). Verify and add the IPC-handler-level cousin test (we already added it in Plan 2 Task 14 — `'rejects path-escape'`). Confirm both are in place.

**Files:**
- Verify: `electron/services/conflicts/store.test.ts`
- Verify: `electron/ipc/conflicts.test.ts`

- [ ] **Step 1: Verify**

```bash
grep -n "E_PERMISSION" /Users/aaa/develop/workspace-ai/acornvo/electron/services/conflicts/store.test.ts
grep -n "E_PERMISSION" /Users/aaa/develop/workspace-ai/acornvo/electron/ipc/conflicts.test.ts
```
Both should print at least one match. If either is missing, add it back per the snippets in Plan 1 Task 12 / Plan 2 Task 14.

- [ ] **Step 2: Run both files**

```bash
npx vitest run electron/services/conflicts/store.test.ts -t "path-escape"
npx vitest run electron/ipc/conflicts.test.ts -t "path-escape"
```
Expected: PASS.

- [ ] **Step 3: No commit** (verification only, no diff).

---

<!-- openspec-task: 9.11 -->
### Task 43: retention startup pass — seed 101 dirs, run prune, oldest deleted

This adds an explicit "startup-time" prune scenario. Plan 1 already exercises `prune()` directly; this task wires it into a representative startup hook (or, if no startup hook is added, just calls `prune()` on grove open).

**Files:**
- Create: `electron/services/conflicts/retention-startup.test.ts`
- (Optional) Modify: `electron/services/grove.ts` to call `prune()` at the end of `openGrove`

- [ ] **Step 1: Add a startup-time prune call**

Edit `electron/services/grove.ts:204-276` (`openGrove`). After `notifyChange(toSummary(grove))` and before the success `return`:

```ts
    // Phase-09 retention: opportunistically prune .acornvo/conflicts/
    // Failures here are non-fatal — the grove is open regardless.
    try {
      const { prune } = await import('./conflicts/store')
      await prune()
    } catch (err) {
      logger.warn('conflicts prune at openGrove failed (non-fatal)', {
        message: err instanceof Error ? err.message : String(err)
      })
    }
```

- [ ] **Step 2: Write the test**

Create `electron/services/conflicts/retention-startup.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readdir, stat, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as groveSvc from '../grove'
import { prune } from './store'

let tmp: string
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'cf-ret-'))
  vi.spyOn(groveSvc, 'getCurrent').mockReturnValue({
    id: 'g', path: tmp, name: 'g', color: 'acorn',
    schema_version: 1, created_at: '', last_opened_at: '', sync_warning: null
  })
  await mkdir(join(tmp, '.acornvo/conflicts'), { recursive: true })
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(tmp, { recursive: true, force: true })
})

describe('9.11 retention: 101 dirs → prune drops the oldest', () => {
  it('after prune() only 100 remain', async () => {
    const root = join(tmp, '.acornvo/conflicts')
    for (let i = 0; i < 101; i++) {
      const dir = join(root, `2026-04-18T12-30-${String(i).padStart(2, '0')}-x`)
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'meta.json'), JSON.stringify({
        path: 'x.md',
        ts: `2026-04-18T12:30:${String(i).padStart(2, '0')}.000Z`,
        resolved_by: 'keep_local'
      }))
      await writeFile(join(dir, 'local.md'), '')
      await writeFile(join(dir, 'remote.md'), '')
      await writeFile(join(dir, 'base.md'), '')
      // mtime increases monotonically per index — oldest is index 0
      const t = (Date.now() / 1000) + i
      await utimes(dir, t, t)
    }
    const result = await prune()
    expect(result.deleted).toBe(1)
    const after = await readdir(root)
    expect(after).toHaveLength(100)
    // Confirm the oldest (-00) is the one that's gone
    expect(after).not.toContain('2026-04-18T12-30-00-x')
  })
})
```

- [ ] **Step 3: Run, confirm pass**

```bash
npx vitest run electron/services/conflicts/retention-startup.test.ts
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add electron/services/grove.ts electron/services/conflicts/retention-startup.test.ts
git commit -m "feat(grove): prune conflicts at openGrove + 101→100 retention test (phase-09 9.11)"
```

---

<!-- openspec-task: 9.12 -->
### Task 44: explicit test — base.md content equals editor-load-time content across multiple saves

Plan 2 Task 16 already proved `baseBody` is stable across one save. This adds a multi-save assertion.

**Files:**
- Modify: `src/stores/editor.test.ts`

- [ ] **Step 1: Add test**

Append:

```ts
describe('9.12 base fields stable across multiple saves', () => {
  it('after 3 saves, baseBody/baseFrontmatter/baseMtimeMs == values at open()', async () => {
    mockIpc.files.get.mockResolvedValueOnce({
      summary: { path: 'a.md', mtimeMs: 1 },
      frontmatter: { title: 'load' }, body: 'INITIAL'
    })
    await useEditorStore.getState().open('a.md')
    for (let i = 0; i < 3; i++) {
      useEditorStore.getState().setBody(`v${i}`)
      mockIpc.file.write.mockResolvedValueOnce({ mtimeMs: 100 + i, sha256: 'x' })
      await useEditorStore.getState().save()
    }
    const s = useEditorStore.getState()
    if (s.kind !== 'ready') throw new Error('expected ready')
    expect(s.baseBody).toBe('INITIAL')
    expect(s.baseFrontmatter).toEqual({ title: 'load' })
    expect(s.baseMtimeMs).toBe(1)
    expect(s.savedMtimeMs).toBe(102) // last save's result
  })
})
```

- [ ] **Step 2: Run, commit**

```bash
npx vitest run src/stores/editor.test.ts -t "9.12"
git add src/stores/editor.test.ts
git commit -m "test(editor): 9.12 base fields stable across 3 saves (phase-09 9.12)"
```

---

<!-- openspec-task: 9.13 -->
### Task 45: integration test — Dialog 打开期间 Cmd+S 不触发 save; 输入不触发 debounce save

**Files:**
- Modify: `src/integration/conflict-handling.test.ts`

- [ ] **Step 1: Add test**

Append:

```ts
describe('9.13 Dialog 打开期间 Cmd+S/输入 都不触发 save', () => {
  it('Cmd+S during saveConflict does not call file.write', async () => {
    mockIpc.files.get
      .mockResolvedValueOnce({
        summary: { path: 'a.md', mtimeMs: 1 }, frontmatter: {}, body: 'B'
      })
      .mockResolvedValueOnce({
        summary: { path: 'a.md', mtimeMs: 9 }, frontmatter: {}, body: 'R'
      })
    await useEditorStore.getState().open('a.md')
    useEditorStore.getState().setBody('L')
    mockIpc.file.write.mockRejectedValueOnce(
      new IpcError('E_MTIME_MISMATCH', 'mismatch', { remoteMtimeMs: 9 })
    )
    await act(async () => {
      await useEditorStore.getState().flushSave()
    })
    mockIpc.file.write.mockClear()

    // Now in saveConflict — try to flush again (simulates Cmd+S)
    await useEditorStore.getState().flushSave()
    await new Promise((r) => setTimeout(r, 1100))
    // Also schedule
    useEditorStore.getState().scheduleSave()
    await new Promise((r) => setTimeout(r, 1100))

    expect(mockIpc.file.write).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run, commit**

```bash
npx vitest run src/integration/conflict-handling.test.ts -t "9.13"
git add src/integration/conflict-handling.test.ts
git commit -m "test(phase-09): 9.13 dialog open locks Cmd+S and debounce save (phase-09 9.13)"
```

---

<!-- openspec-task: 9.14 -->
### Task 46: editor unit — 3x E_MTIME_MISMATCH does NOT pop "保存持续失败" modal

**Files:**
- Modify: `src/stores/editor.test.ts`

- [ ] **Step 1: Add test**

Append:

```ts
describe('9.14 3x E_MTIME_MISMATCH → no persistent-failure modal', () => {
  it('persistentFailure flag stays false after 3 mismatches each followed by 稍后处理', async () => {
    mockIpc.files.get
      .mockResolvedValueOnce({
        summary: { path: 'a.md', mtimeMs: 1 }, frontmatter: {}, body: 'B'
      })
      .mockResolvedValue({
        summary: { path: 'a.md', mtimeMs: 9 }, frontmatter: {}, body: 'R'
      })
    await useEditorStore.getState().open('a.md')
    for (let i = 0; i < 3; i++) {
      useEditorStore.getState().setBody(`v${i}`)
      mockIpc.file.write.mockRejectedValueOnce(
        new IpcError('E_MTIME_MISMATCH', 'mismatch', { remoteMtimeMs: 9 })
      )
      await useEditorStore.getState().save()
      // user picks 稍后处理 → conflictState back to externalModified, then 忽略
      useEditorStore.getState().dismissDialog()
      useEditorStore.getState().ignoreExternalChange()
    }
    const s = useEditorStore.getState()
    if (s.kind !== 'ready') throw new Error('expected ready')
    expect((s as any).persistentFailure).toBeFalsy()
  })
})
```

If the editor store has no `persistentFailure` field yet, this is the spot to add it (along with the corresponding modal trigger from phase 7). For the assertion: it should be `false` / absent after 3 mismatches.

- [ ] **Step 2: Run, commit**

```bash
npx vitest run src/stores/editor.test.ts -t "9.14"
git add src/stores/editor.test.ts
git commit -m "test(editor): 9.14 mtime mismatches do not trigger persistent-failure modal (phase-09 9.14)"
```

---

<!-- openspec-task: 9.15 -->
### Task 47: editor unit — 3x E_PERMISSION DOES pop "保存持续失败" modal

**Files:**
- Modify: `src/stores/editor.test.ts`

- [ ] **Step 1: Add test**

Append:

```ts
describe('9.15 3x E_PERMISSION → persistent-failure modal flips on', () => {
  it('persistentFailure becomes true after 3 non-mtime errors', async () => {
    mockIpc.files.get.mockResolvedValueOnce({
      summary: { path: 'a.md', mtimeMs: 1 }, frontmatter: {}, body: 'B'
    })
    await useEditorStore.getState().open('a.md')
    for (let i = 0; i < 3; i++) {
      useEditorStore.getState().setBody(`v${i}`)
      mockIpc.file.write.mockRejectedValueOnce(
        new IpcError('E_PERMISSION', 'no perms')
      )
      await useEditorStore.getState().save()
    }
    const s = useEditorStore.getState()
    if (s.kind !== 'ready') throw new Error('expected ready')
    expect((s as any).persistentFailure).toBe(true)
  })
})
```

- [ ] **Step 2: Run, commit**

```bash
npx vitest run src/stores/editor.test.ts -t "9.15"
git add src/stores/editor.test.ts
git commit -m "test(editor): 9.15 3x E_PERMISSION trips persistent-failure flag (phase-09 9.15)"
```

---

<!-- openspec-task: 9.16 -->
### Task 48: unit-test bundle — mtime tolerance, copy-name dedup, prune

This is a verification gate, not new tests. The three buckets are owned by:
- mtime ±2ms tolerance: `electron/services/fs-atomic.test.ts` (Plan 1 Task 5 + Task 6)
- copy-name dedup: `src/stores/editor.test.ts` (Plan 3 Task 28) + `src/integration/conflict-handling.test.ts` (Task 41)
- prune: `electron/services/conflicts/store.test.ts` (Plan 1 Task 9) + `retention-startup.test.ts` (Task 43)

- [ ] **Step 1: Run all three buckets in one shot**

```bash
npx vitest run \
  electron/services/fs-atomic.test.ts \
  electron/services/conflicts/store.test.ts \
  electron/services/conflicts/retention-startup.test.ts \
  src/stores/editor.test.ts \
  src/integration/conflict-handling.test.ts
```
Expected: all PASS. Note any flakes; if any test depends on real timing, increase the timeout in vitest config or rewrite.

- [ ] **Step 2: Run the full suite once more**

```bash
npm test
```
Expected: all PASS.

- [ ] **Step 3: No commit** (verification only).

---

<!-- openspec-task: 9.17 -->
### Task 49: `openspec validate phase-09-conflict-handling --strict`

**Files:** none (validation only)

- [ ] **Step 1: Run the validator**

```bash
openspec validate phase-09-conflict-handling --strict
```
Expected: exit 0 with all artifacts validated. If validator complains:
- Missing requirement coverage in tasks → re-check `tasks.md` lines all reference a `## N.x` numbered task block.
- Schema mismatch → ensure `proposal.md` / `design.md` / `specs/**/spec.md` follow the OpenSpec conventions (compare to a recently-archived phase like phase-05).
- Spec deltas reference a capability that doesn't exist on `main` (e.g. `editor-autosave` is owned by phase-07; if phase-07 hasn't archived yet, the validator may complain about the MODIFIED Requirements pointing at unknown specs — coordinate with the phase-07 owner before archive).

- [ ] **Step 2: If validation passes, mark all tasks complete in `tasks.md`**

This is what `/opsx:executing-plans` does automatically. Only do it manually if you're not using that command:

```bash
openspec mark-complete phase-09-conflict-handling --all
```
(or edit `tasks.md` checkboxes by hand — `[ ]` → `[x]`)

- [ ] **Step 3: Final commit**

```bash
git add openspec/changes/phase-09-conflict-handling/tasks.md
git commit -m "chore(openspec): mark phase-09 tasks complete after validation (phase-09 9.17)"
```

---

## Self-Review

1. **Spec coverage:** Plan 4 owns labels 9.1–9.17 (17 labels). Verify:

```bash
grep -E "openspec-task: 9\.[0-9]+" /Users/aaa/develop/workspace-ai/acornvo/docs/superpowers/plans/2026-04-30-phase-09-conflict-handling-tasks-9.1-9.17.md | sort -u
```
Expected: 17 unique labels.

2. **Manual smoke vs. automated:** 9.5/9.6/9.7 are runbook entries because they verify electron-log/disk content/router URL — easier and more honest as manual checks than as fragile e2e. Their automated cousins (the corresponding store actions) are tested in Plan 3.

3. **9.10 marked as "verify only":** The path-escape test was already added by Plan 1 Task 12 + Plan 2 Task 14. Re-stating in Task 42 prevents duplicate test code.

4. **9.11 includes a real impl change:** `openGrove` now invokes `prune()`. This is intentional — without it, the retention policy never executes for already-open groves on reopen.

5. **9.16 is a gate, not new code.** Listed as a single combined `vitest run` invocation.

6. **No placeholders.** ✓
