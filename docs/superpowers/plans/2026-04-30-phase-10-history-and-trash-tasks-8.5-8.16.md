# Phase 10 History & Trash — Plan 5 (Tasks 8.5–8.16)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive the final acceptance pass for phase-10 — convert each `8.5–8.15` line of `tasks.md` into a component-level integration test (vitest + happy-dom + mocked IPC, with selective direct SQLite introspection), then close out with `openspec validate phase-10-history-and-trash --strict` (8.16) so the change is ready to archive.

**Architecture:** Plans 1–4 already wrote the unit-level tests for the underlying primitives (ops-log writer, conflict-diff IPC, History tabs, ConflictDetailPanel, library trash flow). This plan composes those primitives end-to-end at the component-and-IPC seam. Most tests live in `src/integration/history-and-trash.test.ts`, render real React components against mocked `@/ipc/client`, and assert both UI behaviour (rows, dialogs, navigation) and ops_log invariants (via either an `ops.list` mock that the component round-trips, or — for retention — a direct `better-sqlite3` open of the grove DB). Cross-feature wiring tests (8.14 save_as → ops_log; 8.15 watcher rename → ops_log) live next to the original feature: editor store and watcher, respectively.

**Tech Stack:** vitest + happy-dom (component-level acceptance), @testing-library/react + @testing-library/jest-dom, the repo's IPC mocks, `better-sqlite3` for direct DB introspection in 8.12, `openspec` CLI for 8.16.

---

## Pre-flight

Plans 1, 2, 3, and 4 of phase-10 must be merged. Phases 5, 7, 9 must already be archived (or at minimum on `main`) since 8.14 and 8.15 cross those boundaries. Verify:

```bash
test -f /Users/aaa/develop/workspace-ai/acornvo/src/pages/History.tsx && \
test -f /Users/aaa/develop/workspace-ai/acornvo/src/components/history/ConflictDetailPanel.tsx && \
test -f /Users/aaa/develop/workspace-ai/acornvo/electron/ipc/ops.ts && \
test -f /Users/aaa/develop/workspace-ai/acornvo/electron/ipc/trash.ts && \
test -f /Users/aaa/develop/workspace-ai/acornvo/src/main/ops/log.ts && \
echo "OK"
```

Confirm `npm test` is green at HEAD before starting:

```bash
npm test
```

Expected: all PASS. Any pre-existing failure must be triaged first; do not start acceptance on a red bar.

## File Structure

| Path | Action | Owner task |
|---|---|---|
| `src/integration/history-and-trash.test.ts` | Create | 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 8.13 |
| `src/main/ops/log.test.ts` | Modify (append 90-day prune scenario) | 8.12 |
| `src/stores/editor.test.ts` | Modify (append 8.14 save_as → ops cross-wire) | 8.14 |
| `electron/services/watcher.test.ts` | Modify (append 8.15 rename → ops cross-wire) | 8.15 |
| `openspec/changes/phase-10-history-and-trash/**` | Touch only if 8.16 strict-mode flags a real spec issue | 8.16 |

## Conventions reused

- IPC mock stub for component tests:
  ```ts
  vi.mock('@/ipc/client', () => ({ ipc: mockIpc, useIpc: () => mockIpc }))
  ```
- `MemoryRouter` wraps any test that exercises navigation (`/history/:tab`).
- Use `useNavigate` mock for assertions:
  ```ts
  const navigate = vi.fn()
  vi.mock('react-router-dom', async (orig) => ({
    ...(await orig<typeof import('react-router-dom')>()),
    useNavigate: () => navigate
  }))
  ```
- For DB-direct assertions (8.12 only), open the SQLite DB in the test:
  ```ts
  import Database from 'better-sqlite3'
  import { groveDbPath } from '@/electron/services/paths'
  const db = new Database(groveDbPath(grove.path))
  const rows = db.prepare('SELECT * FROM ops_log ORDER BY ts DESC').all()
  ```
- Each `8.x` task is essentially "prove the cross-feature wiring works". Steps follow this shortened TDD shape:
  - Step 1: Sketch the test
  - Step 2: Run it. It MAY pass already if Plans 1–4 wired everything correctly. If so, briefly break the wiring (comment out the call site) to confirm the test actually fails — then revert. Note PASS as expected outcome.
  - Step 3: Commit
- For 8.16, just run-and-pass; if it fails, follow the embedded debugging steps.

---

<!-- openspec-task: 8.5 -->
### Task 50: integration test — `/history/trash` lists trashed files; "打开原目录" jumps to Finder

**Files:**
- Create: `src/integration/history-and-trash.test.ts`

- [ ] **Step 1: Create the test file with 8.5's scenario**

Create `src/integration/history-and-trash.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { History } from '@/pages/History'

const mockIpc: any = {
  ops: { list: vi.fn() },
  conflict: { list: vi.fn(), diff: vi.fn(), delete: vi.fn(), deleteAll: vi.fn() },
  file: { openContainingDir: vi.fn() }
}
vi.mock('@/ipc/client', () => ({ ipc: mockIpc, useIpc: () => mockIpc }))

beforeEach(() => {
  vi.clearAllMocks()
  // Sensible defaults — tests can override
  mockIpc.ops.list.mockResolvedValue({ items: [], total: 0 })
  mockIpc.conflict.list.mockResolvedValue({ items: [], total: 0 })
})
afterEach(() => { vi.restoreAllMocks() })

function renderHistoryAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/history/:tab" element={<History />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('8.5 /history/trash lists trashed files; 打开原目录 jumps to Finder', () => {
  it('renders trash rows from ops.list({op:trash}); button calls file.openContainingDir', async () => {
    mockIpc.ops.list.mockResolvedValueOnce({
      items: [
        { id: 1, op: 'trash', path: 'notes/a.md', ts: '2026-04-29T10:00:00Z', meta: {} },
        { id: 2, op: 'trash', path: 'notes/b.md', ts: '2026-04-29T11:00:00Z', meta: {} },
        { id: 3, op: 'trash', path: 'archive/c.md', ts: '2026-04-29T12:00:00Z', meta: {} }
      ],
      total: 3
    })

    await act(async () => { renderHistoryAt('/history/trash') })

    expect(mockIpc.ops.list).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'trash' })
    )
    expect(screen.getAllByTestId(/trash-row-/)).toHaveLength(3)

    // Click "打开原目录" on row 2 (notes/b.md)
    fireEvent.click(screen.getAllByTestId('open-containing-dir')[1])
    expect(mockIpc.file.openContainingDir).toHaveBeenCalledWith('notes/b.md')
  })
})
```

If the testid names don't match the actual `TrashTab.tsx` from Plan 3 (Task 5.3), open that component, find the actual `data-testid` values, and update the assertions accordingly. **Don't** edit the component to satisfy the test — the test must match the existing component.

- [ ] **Step 2: Run, confirm pass**

```bash
npx vitest run src/integration/history-and-trash.test.ts -t "8.5"
```
Expected: PASS. If green on first run, briefly comment out the `onClick={() => ipc.file.openContainingDir(...)}` handler in `TrashTab.tsx` and re-run — should FAIL. Revert.

- [ ] **Step 3: Commit**

```bash
git add src/integration/history-and-trash.test.ts
git commit -m "test(phase-10): integration 8.5 trash tab open-containing-dir (phase-10 8.5)"
```

---

<!-- openspec-task: 8.6 -->
### Task 51: integration test — `/history/conflicts` lists snapshots; click row → side-by-side diff on right

**Files:**
- Modify: `src/integration/history-and-trash.test.ts`

- [ ] **Step 1: Append the test**

```ts
describe('8.6 /history/conflicts lists snapshots; click row → side-by-side diff', () => {
  it('renders left list and right DiffView when a row is clicked', async () => {
    mockIpc.conflict.list.mockResolvedValueOnce({
      items: [
        { id: 'cid-1', path: 'notes/a.md', ts: '2026-04-29T10:00:00Z', resolved_by: 'keep_local' },
        { id: 'cid-2', path: 'notes/b.md', ts: '2026-04-29T11:00:00Z', resolved_by: 'load_remote' }
      ],
      total: 2
    })
    mockIpc.conflict.diff.mockResolvedValueOnce({
      left: ['line A', 'line B'],
      right: ['line A', 'line C'],
      markers: [
        { kind: 'eq', li: 0, ri: 0 },
        { kind: 'replace', li: 1, ri: 1 }
      ]
    })

    await act(async () => { renderHistoryAt('/history/conflicts') })
    expect(screen.getAllByTestId(/conflict-row-/)).toHaveLength(2)

    await act(async () => {
      fireEvent.click(screen.getByTestId('conflict-row-cid-1'))
    })

    expect(mockIpc.conflict.diff).toHaveBeenCalledWith('cid-1', 'local-remote')
    expect(screen.getByTestId('diff-view')).toBeInTheDocument()
    expect(screen.getByText('line C')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, confirm pass**

```bash
npx vitest run src/integration/history-and-trash.test.ts -t "8.6"
```
Expected: PASS. If green, comment out the `useEffect` in `ConflictDetailPanel` that triggers `conflict.diff` to confirm test fails. Revert.

- [ ] **Step 3: Commit**

```bash
git add src/integration/history-and-trash.test.ts
git commit -m "test(phase-10): 8.6 conflicts list + side-by-side diff render (phase-10 8.6)"
```

---

<!-- openspec-task: 8.7 -->
### Task 52: integration test — toggle "local ↔ base" → diff re-renders

**Files:**
- Modify: `src/integration/history-and-trash.test.ts`

- [ ] **Step 1: Append the test**

```ts
describe('8.7 toggle local↔base re-renders diff', () => {
  it('clicking local-base toggle calls conflict.diff with new sides arg', async () => {
    mockIpc.conflict.list.mockResolvedValueOnce({
      items: [{ id: 'cid-1', path: 'a.md', ts: '2026-04-29T10:00:00Z', resolved_by: 'keep_local' }],
      total: 1
    })
    mockIpc.conflict.diff
      .mockResolvedValueOnce({ left: ['L'], right: ['R'], markers: [] })   // local-remote
      .mockResolvedValueOnce({ left: ['L'], right: ['B'], markers: [] })   // local-base

    await act(async () => { renderHistoryAt('/history/conflicts') })
    await act(async () => {
      fireEvent.click(screen.getByTestId('conflict-row-cid-1'))
    })
    expect(mockIpc.conflict.diff).toHaveBeenLastCalledWith('cid-1', 'local-remote')

    await act(async () => {
      fireEvent.click(screen.getByTestId('diff-toggle-local-base'))
    })
    expect(mockIpc.conflict.diff).toHaveBeenLastCalledWith('cid-1', 'local-base')
    // Right column updated
    expect(screen.getByText('B')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, commit**

```bash
npx vitest run src/integration/history-and-trash.test.ts -t "8.7"
git add src/integration/history-and-trash.test.ts
git commit -m "test(phase-10): 8.7 diff toggle local-base re-renders (phase-10 8.7)"
```

---

<!-- openspec-task: 8.8 -->
### Task 53: integration test — "删除此快照" → confirm → row disappears + ops_log gets `conflict_delete`

**Files:**
- Modify: `src/integration/history-and-trash.test.ts`

- [ ] **Step 1: Append the test**

```ts
describe('8.8 删除此快照 → confirm → row removed; ops_log conflict_delete written', () => {
  it('confirm flow calls conflict.delete and removes the row', async () => {
    mockIpc.conflict.list
      .mockResolvedValueOnce({
        items: [
          { id: 'cid-1', path: 'a.md', ts: '2026-04-29T10:00:00Z', resolved_by: 'keep_local' },
          { id: 'cid-2', path: 'b.md', ts: '2026-04-29T11:00:00Z', resolved_by: 'save_as' }
        ],
        total: 2
      })
      .mockResolvedValueOnce({
        items: [
          { id: 'cid-2', path: 'b.md', ts: '2026-04-29T11:00:00Z', resolved_by: 'save_as' }
        ],
        total: 1
      })
    mockIpc.conflict.diff.mockResolvedValue({ left: [], right: [], markers: [] })
    mockIpc.conflict.delete.mockResolvedValueOnce({ ok: true })
    mockIpc.ops.list.mockResolvedValue({
      items: [
        { id: 9, op: 'conflict_delete', path: 'a.md', ts: '2026-04-29T12:00:00Z', meta: { id: 'cid-1' } }
      ],
      total: 1
    })

    await act(async () => { renderHistoryAt('/history/conflicts') })
    await act(async () => { fireEvent.click(screen.getByTestId('conflict-row-cid-1')) })
    await act(async () => { fireEvent.click(screen.getByTestId('delete-snapshot')) })
    // AlertDialog opens
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByTestId('delete-snapshot-confirm')) })

    expect(mockIpc.conflict.delete).toHaveBeenCalledWith('cid-1')
    // List refreshed and cid-1 is gone
    expect(screen.queryByTestId('conflict-row-cid-1')).toBeNull()
    expect(screen.getByTestId('conflict-row-cid-2')).toBeInTheDocument()
  })
})
```

The `ops_log` `conflict_delete` row is written by the IPC handler (Plan 2 task 3.6). This test only asserts the IPC call; the audit-row write itself is unit-tested in `electron/ipc/conflicts.test.ts` (Plan 2). Note that fact in the commit message.

- [ ] **Step 2: Run, commit**

```bash
npx vitest run src/integration/history-and-trash.test.ts -t "8.8"
git add src/integration/history-and-trash.test.ts
git commit -m "test(phase-10): 8.8 delete-snapshot confirm flow (phase-10 8.8)"
```

---

<!-- openspec-task: 8.9 -->
### Task 54: integration test — `/history/ops` lists by ts DESC; "trash" filter chip narrows

**Files:**
- Modify: `src/integration/history-and-trash.test.ts`

- [ ] **Step 1: Append the test**

```ts
describe('8.9 /history/ops lists by ts DESC; trash chip filters', () => {
  it('filter chip toggles ops.list({op:trash})', async () => {
    mockIpc.ops.list
      .mockResolvedValueOnce({
        items: [
          { id: 3, op: 'rename', path: 'old.md', ts: '2026-04-29T12:00:00Z', meta: { new_path: 'new.md' } },
          { id: 2, op: 'conflict_resolve', path: 'a.md', ts: '2026-04-29T11:00:00Z', meta: { id: 'cid-1', resolved_by: 'keep_local' } },
          { id: 1, op: 'trash', path: 'b.md', ts: '2026-04-29T10:00:00Z', meta: {} }
        ],
        total: 3
      })
      .mockResolvedValueOnce({
        items: [
          { id: 1, op: 'trash', path: 'b.md', ts: '2026-04-29T10:00:00Z', meta: {} }
        ],
        total: 1
      })

    await act(async () => { renderHistoryAt('/history/ops') })
    expect(screen.getAllByTestId(/ops-row-/)).toHaveLength(3)
    // Top row is the latest (rename)
    expect(screen.getAllByTestId(/ops-row-/)[0]).toHaveAttribute('data-testid', 'ops-row-3')

    await act(async () => { fireEvent.click(screen.getByTestId('ops-filter-trash')) })
    expect(mockIpc.ops.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ op: 'trash' })
    )
    expect(screen.getAllByTestId(/ops-row-/)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run, commit**

```bash
npx vitest run src/integration/history-and-trash.test.ts -t "8.9"
git add src/integration/history-and-trash.test.ts
git commit -m "test(phase-10): 8.9 ops list ts-desc + trash chip filter (phase-10 8.9)"
```

---

<!-- openspec-task: 8.10 -->
### Task 55: integration test — Ops `conflict_resolve` row click → navigates and highlights

**Files:**
- Modify: `src/integration/history-and-trash.test.ts`

- [ ] **Step 1: Append the test**

Add the `useNavigate` mock at the top of the file (above the existing imports' usage; `vi.mock` is hoisted), then append the spec:

```ts
const navigate = vi.fn()
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate
}))

describe('8.10 click ops conflict_resolve row → /history/conflicts?id=<id> highlighted', () => {
  it('navigates with id query and selects that snapshot', async () => {
    mockIpc.ops.list.mockResolvedValueOnce({
      items: [
        { id: 7, op: 'conflict_resolve', path: 'a.md', ts: '2026-04-29T12:00:00Z',
          meta: { id: 'cid-77', resolved_by: 'save_as', winner_path: 'a.conflict.20260429T120000.md' } }
      ],
      total: 1
    })
    await act(async () => { renderHistoryAt('/history/ops') })
    await act(async () => { fireEvent.click(screen.getByTestId('ops-row-7')) })
    expect(navigate).toHaveBeenCalledWith('/history/conflicts?id=cid-77')
  })

  it('on /history/conflicts?id=cid-77 the matching row is selected', async () => {
    mockIpc.conflict.list.mockResolvedValueOnce({
      items: [
        { id: 'cid-77', path: 'a.md', ts: '2026-04-29T12:00:00Z', resolved_by: 'save_as' },
        { id: 'cid-99', path: 'b.md', ts: '2026-04-29T13:00:00Z', resolved_by: 'keep_local' }
      ],
      total: 2
    })
    mockIpc.conflict.diff.mockResolvedValue({ left: [], right: [], markers: [] })

    await act(async () => { renderHistoryAt('/history/conflicts?id=cid-77') })
    expect(screen.getByTestId('conflict-row-cid-77')).toHaveAttribute('data-selected', 'true')
    expect(mockIpc.conflict.diff).toHaveBeenCalledWith('cid-77', 'local-remote')
  })
})
```

If the actual component uses a different selected-state attribute (e.g. `aria-selected`), align with that. The two-step assertion (navigate + downstream selection) covers both halves of 8.10.

- [ ] **Step 2: Run, commit**

```bash
npx vitest run src/integration/history-and-trash.test.ts -t "8.10"
git add src/integration/history-and-trash.test.ts
git commit -m "test(phase-10): 8.10 ops→conflict deep link and select (phase-10 8.10)"
```

---

<!-- openspec-task: 8.11 -->
### Task 56: integration test — `conflict.deleteAll` → list empty + N `conflict_delete` ops rows

**Files:**
- Modify: `src/integration/history-and-trash.test.ts`

- [ ] **Step 1: Append the test**

```ts
describe('8.11 conflict.deleteAll → list empty; ops gets N conflict_delete rows', () => {
  it('clear-all confirm flow empties list and writes N audit rows', async () => {
    const fiveItems = Array.from({ length: 5 }, (_, i) => ({
      id: `cid-${i}`,
      path: `f${i}.md`,
      ts: `2026-04-29T1${i}:00:00Z`,
      resolved_by: 'keep_local'
    }))
    mockIpc.conflict.list
      .mockResolvedValueOnce({ items: fiveItems, total: 5 })
      .mockResolvedValueOnce({ items: [], total: 0 })
    mockIpc.conflict.deleteAll.mockResolvedValueOnce({ ok: true, deleted: 5 })
    mockIpc.ops.list.mockResolvedValue({
      items: fiveItems.map((c, i) => ({
        id: 100 + i, op: 'conflict_delete', path: c.path,
        ts: '2026-04-29T20:00:00Z', meta: { id: c.id }
      })),
      total: 5
    })

    await act(async () => { renderHistoryAt('/history/conflicts') })
    expect(screen.getAllByTestId(/conflict-row-/)).toHaveLength(5)

    await act(async () => { fireEvent.click(screen.getByTestId('clear-all-snapshots')) })
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByTestId('clear-all-confirm')) })

    expect(mockIpc.conflict.deleteAll).toHaveBeenCalledWith()
    expect(screen.queryAllByTestId(/conflict-row-/)).toHaveLength(0)
    // friendly empty-state appears
    expect(screen.getByTestId('conflicts-empty')).toBeInTheDocument()
  })
})
```

The N audit rows are written by the `conflict.deleteAll` handler (Plan 2 task 3.6). The integration test only asserts the IPC call + UI clear; the per-row audit behavior is unit-tested in `electron/ipc/conflicts.test.ts`.

- [ ] **Step 2: Run, commit**

```bash
npx vitest run src/integration/history-and-trash.test.ts -t "8.11"
git add src/integration/history-and-trash.test.ts
git commit -m "test(phase-10): 8.11 clear-all snapshots empties list (phase-10 8.11)"
```

---

<!-- openspec-task: 8.12 -->
### Task 57: ops_log unit — rows older than 90 days auto-prune on next `record(...)`

**Files:**
- Modify: `src/main/ops/log.test.ts`

- [ ] **Step 1: Append the test**

Append to `src/main/ops/log.test.ts`:

```ts
import Database from 'better-sqlite3'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('8.12 90-day retention prunes on next record', () => {
  let tmp: string
  let db: Database.Database

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'ops-prune-'))
    db = new Database(join(tmp, 'index.sqlite3'))
    // Apply migration 003 (or import the migration runner). Inline shape used here:
    db.exec(`
      CREATE TABLE ops_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        op TEXT NOT NULL,
        path TEXT NOT NULL,
        ts TEXT NOT NULL,
        meta_json TEXT
      );
      CREATE INDEX idx_ops_log_ts ON ops_log(ts DESC);
      CREATE INDEX idx_ops_log_op_ts ON ops_log(op, ts DESC);
    `)
  })
  afterEach(async () => {
    db.close()
    await rm(tmp, { recursive: true, force: true })
  })

  it('row dated 100 days ago is gone after the next record() call', async () => {
    // Manually insert a row dated 100 days ago
    db.prepare(`INSERT INTO ops_log (op, path, ts, meta_json) VALUES (?, ?, datetime('now', '-100 days'), ?)`)
      .run('trash', 'old.md', '{}')
    const before = db.prepare('SELECT COUNT(*) AS n FROM ops_log').get() as { n: number }
    expect(before.n).toBe(1)

    // record() must internally invoke prune() before the INSERT
    const { record } = await import('@/main/ops/log')
    // The real record() resolves the DB via getCurrentGroveDb(); inject db handle via the
    // same seam Plan 1 used (e.g. an exported __setDbForTests). If no such seam exists,
    // wrap the test in vi.mock for the db-resolver module.
    ;(record as any).__setDbForTests?.(db)
    await record({ op: 'trash', path: 'fresh.md' })

    const rows = db.prepare('SELECT path, ts FROM ops_log ORDER BY ts DESC').all() as any[]
    expect(rows.find((r) => r.path === 'old.md')).toBeUndefined()
    expect(rows.find((r) => r.path === 'fresh.md')).toBeDefined()
  })
})
```

If `record()` does not yet expose a test seam for the DB handle, this task includes adding one (a single internal export `__setDbForTests` guarded by `if (process.env.NODE_ENV === 'test')`). Plan 1 (task 2.1) is the natural place that seam was introduced — verify before adding a duplicate.

- [ ] **Step 2: Run, commit**

```bash
npx vitest run src/main/ops/log.test.ts -t "8.12"
git add src/main/ops/log.ts src/main/ops/log.test.ts
git commit -m "test(ops-log): 8.12 90-day prune drops old rows on next record (phase-10 8.12)"
```

---

<!-- openspec-task: 8.13 -->
### Task 58: integration test — brand-new grove → all three tabs show friendly empty-state

**Files:**
- Modify: `src/integration/history-and-trash.test.ts`

- [ ] **Step 1: Append the test**

```ts
describe('8.13 brand-new grove → empty-state on all 3 tabs', () => {
  it('Trash tab empty-state', async () => {
    mockIpc.ops.list.mockResolvedValueOnce({ items: [], total: 0 })
    await act(async () => { renderHistoryAt('/history/trash') })
    expect(screen.getByTestId('trash-empty')).toBeInTheDocument()
  })
  it('Conflicts tab empty-state', async () => {
    mockIpc.conflict.list.mockResolvedValueOnce({ items: [], total: 0 })
    await act(async () => { renderHistoryAt('/history/conflicts') })
    expect(screen.getByTestId('conflicts-empty')).toBeInTheDocument()
  })
  it('Ops tab empty-state', async () => {
    mockIpc.ops.list.mockResolvedValueOnce({ items: [], total: 0 })
    await act(async () => { renderHistoryAt('/history/ops') })
    expect(screen.getByTestId('ops-empty')).toBeInTheDocument()
  })
})
```

The empty-state testid names should match Plan 3 task 5.6 (`history.trash.empty` / `history.conflicts.empty` / `history.ops.empty` i18n keys). If the components were built without `data-testid` for the empty-state element, this task adds them — that's the smallest change and isolates the integration from i18n wording. A pure `getByText(/还没有/)` substring assertion is acceptable as a fallback only if the test author confirms the wording is stable.

- [ ] **Step 2: Run, commit**

```bash
npx vitest run src/integration/history-and-trash.test.ts -t "8.13"
git add src/integration/history-and-trash.test.ts src/pages/History.tsx src/components/history
git commit -m "test(phase-10): 8.13 friendly empty-states on all history tabs (phase-10 8.13)"
```

---

<!-- openspec-task: 8.14 -->
### Task 59: cross-phase test — phase-9 "另存副本" → ops.list yields conflict_resolve row with correct winner_path

**Files:**
- Modify: `src/stores/editor.test.ts`

This exercises the Plan 1 task 2.4 wire-up: the editor store's `saveAsCopy()` action must call `opsLog.record({ op:'conflict_resolve', path, meta:{ id, resolved_by:'save_as', winner_path } })` after the IPC `conflict.writeSnapshot` resolves.

- [ ] **Step 1: Append the test**

```ts
describe('8.14 phase-9 save_as → ops.list returns conflict_resolve row with winner_path', () => {
  it('records ops_log entry with meta.winner_path = sibling path', async () => {
    mockIpc.files.get.mockResolvedValueOnce({
      summary: { path: 'notes/a.md', mtimeMs: 1 }, frontmatter: {}, body: 'B'
    })
    await useEditorStore.getState().open('notes/a.md')
    useEditorStore.getState().setBody('LOCAL')
    useEditorStore.setState((cur) => {
      if (cur.kind !== 'ready') return cur
      return {
        ...cur,
        conflictState: {
          kind: 'saveConflict',
          remoteMtimeMs: 9, remoteBody: 'REMOTE', remoteFrontmatter: {}
        }
      }
    })
    mockIpc.file.exists.mockResolvedValueOnce(false) // base sibling path is free
    mockIpc.file.write.mockResolvedValueOnce({ mtimeMs: 2, sha256: 'x' })
    mockIpc.conflict.writeSnapshot.mockResolvedValueOnce({ id: 'cid-42' })
    // Capture the ops.record call regardless of where it's wired (store action or IPC handler)
    mockIpc.ops = mockIpc.ops || {}
    mockIpc.ops.record = vi.fn().mockResolvedValue({ ok: true })

    await useEditorStore.getState().saveAsCopy()

    // Assert exactly one record() with op=conflict_resolve, resolved_by=save_as,
    // and winner_path matching the .conflict.<ts>.md sibling regex.
    expect(mockIpc.ops.record).toHaveBeenCalledTimes(1)
    const arg = mockIpc.ops.record.mock.calls[0][0]
    expect(arg.op).toBe('conflict_resolve')
    expect(arg.path).toBe('notes/a.md')
    expect(arg.meta.id).toBe('cid-42')
    expect(arg.meta.resolved_by).toBe('save_as')
    expect(arg.meta.winner_path).toMatch(/^notes\/a\.conflict\.[\dT]+\.md$/)
  })
})
```

If Plan 1 wired the audit write inside `electron/ipc/conflicts.ts` (i.e. server-side, not via the renderer store), then move this test to `electron/ipc/conflicts.test.ts` and assert against the in-memory ops_log table directly. Either location is acceptable; what matters is the cross-phase invariant is exercised end-to-end.

- [ ] **Step 2: Run, commit**

```bash
npx vitest run src/stores/editor.test.ts -t "8.14"
git add src/stores/editor.test.ts
git commit -m "test(editor): 8.14 save_as records conflict_resolve ops with winner_path (phase-10 8.14)"
```

---

<!-- openspec-task: 8.15 -->
### Task 60: cross-phase test — watcher rename → `ops.list` shows `op='rename'` with correct `meta.new_path`

**Files:**
- Modify: `electron/services/watcher.test.ts`

Plan 1 task 2.6 wired `opsLog.record({op:'rename', ...})` into the watcher's rename detection path. Phase-5 watcher tests already simulate paired `unlink + add` events for the same content-hash to trigger rename detection; reuse that fixture.

- [ ] **Step 1: Append the test**

```ts
describe('phase-10 8.15 watcher-detected rename writes ops_log row', () => {
  it('paired unlink+add for same hash yields one ops row op=rename, meta.new_path correct', async () => {
    // Reuse the fixture pattern from the existing 'rename' describe block —
    // most likely a helper like `simulateRename(oldPath, newPath, content)`.
    // If not extracted, copy the relevant block here.
    const { startWatcher } = await import('./watcher')
    const opsRecord = vi.fn().mockResolvedValue({ ok: true })
    vi.doMock('@/main/ops/log', () => ({ record: opsRecord }))

    const stop = await startWatcher(/* test grove handle */)
    try {
      // Emit unlink('old.md') then add('new.md') with same content hash within debounce window
      await emitFsEvent('unlink', 'old.md')
      await emitFsEvent('add', 'new.md', { contentHash: 'abc123' })
      await flushDebounce()

      expect(opsRecord).toHaveBeenCalledTimes(1)
      const call = opsRecord.mock.calls[0][0]
      expect(call.op).toBe('rename')
      expect(call.path).toBe('old.md')
      expect(call.meta.new_path).toBe('new.md')
    } finally {
      await stop()
    }
  })
})
```

The exact fixture helpers (`emitFsEvent`, `flushDebounce`) come from the existing watcher test scaffolding in `electron/services/watcher.test.ts` — adapt to whatever is actually exported. If rename detection is in a sibling module (`electron/services/indexer/rename.ts` or similar), put the test next to it instead.

- [ ] **Step 2: Run, commit**

```bash
npx vitest run electron/services/watcher.test.ts -t "8.15"
git add electron/services/watcher.test.ts
git commit -m "test(watcher): 8.15 rename detection records ops row (phase-10 8.15)"
```

---

<!-- openspec-task: 8.16 -->
### Task 61: `openspec validate phase-10-history-and-trash --strict`

**Files:** none under normal conditions. If validation flags a real issue, the offending file under `openspec/changes/phase-10-history-and-trash/**` (or its specs) is patched in this task; this is the only task in this plan permitted to touch openspec files.

- [ ] **Step 1: Run the validator**

```bash
cd /Users/aaa/develop/workspace-ai/acornvo
openspec validate phase-10-history-and-trash --strict
```

Expected: exit 0, with all artifacts validated (`proposal.md`, `design.md`, `tasks.md`, all 7 spec deltas under `specs/`).

If exit non-zero, **debug**:

```bash
openspec show phase-10-history-and-trash --json | jq '.errors // .'
```

Common strict-mode failures and the fix:
- **"Requirement has no scenarios"** → open the offending `specs/<capability>/spec.md`; add at least one `### Scenario:` block under each `### Requirement:` heading.
- **"MODIFIED Requirements references unknown delta target"** → the parent capability spec is owned by a not-yet-archived phase. Verify the dependency phase is on `main`; if not, coordinate with that phase owner before archive.
- **"Schema version mismatch"** → compare the change layout to a recently-archived phase (e.g. `openspec/changes/archive/phase-09-conflict-handling/`); align headings and front-matter.
- **"Task line N has no `## N.x` block"** → ensure every checkbox in `tasks.md` lives under a numbered task header; orphan checkboxes will fail strict.

Apply the minimum spec or tasks.md fix; **do not** introduce new requirements or scenarios beyond what's needed to pass strict.

- [ ] **Step 2: Re-run after any fix**

```bash
openspec validate phase-10-history-and-trash --strict
```
Expected: exit 0.

- [ ] **Step 3: Mark all tasks complete in `tasks.md`**

This is what `/opsx:executing-plans` does automatically. Only do it manually if you're not using that command:

```bash
openspec mark-complete phase-10-history-and-trash --all
```
(or edit `tasks.md` checkboxes by hand — `[ ]` → `[x]`)

- [ ] **Step 4: Final commit**

```bash
git add openspec/changes/phase-10-history-and-trash
git commit -m "chore(phase-10): all openspec validation passes"
```

After this commit, phase-10 is ready to archive (the archival itself is a separate `/opsx:archive` command and is **not** part of this plan).

---

## Self-Review

1. **Spec coverage:** Plan 5 owns labels 8.5–8.16 (12 unique labels). Verify:

```bash
grep -E "openspec-task: 8\.(5|6|7|8|9|10|11|12|13|14|15|16)" \
  /Users/aaa/develop/workspace-ai/acornvo/docs/superpowers/plans/2026-04-30-phase-10-history-and-trash-tasks-8.5-8.16.md \
  | sort -u | wc -l
```
Expected: `12`.

2. **Each acceptance asserts both UI and ops_log invariants:**
   - 8.5 — UI: trash rows render; IPC: `file.openContainingDir` called with rel path.
   - 8.6 — UI: side-by-side rendered; IPC: `conflict.diff(id, 'local-remote')` called.
   - 8.7 — UI: right column re-renders; IPC: `conflict.diff` called with new sides arg.
   - 8.8 — UI: row removed; IPC: `conflict.delete(id)` called (audit row written by handler, unit-tested in Plan 2).
   - 8.9 — UI: rows in ts DESC; IPC: `ops.list({op:'trash'})` called when chip clicked.
   - 8.10 — UI: row clicked navigates; on target tab, matching row is `data-selected`.
   - 8.11 — UI: list empty + empty-state visible; IPC: `conflict.deleteAll()` called.
   - 8.12 — DB: 100-day-old row gone after next `record()`; direct SQLite assertion.
   - 8.13 — UI: `data-testid="*-empty"` present for empty mocks on all 3 tabs.
   - 8.14 — Cross-phase: `ops.record` called with `op=conflict_resolve`, `winner_path` matching sibling regex.
   - 8.15 — Cross-phase: watcher's rename detection emits `ops.record` with `op=rename`, `meta.new_path` correct.
   - 8.16 — Validation gate; spec edits permitted only if strict-mode flags an actual issue.

3. **8.16 is the final gate:** if it fails, the task continues with debugging steps (`openspec show ... --json`) rather than ending the plan.

4. **No "Execution Handoff" section, no Skill tool calls, no proactive openspec edits.**

5. **No placeholders.** Each test sketch contains concrete assertions a human can read and check against the actual component testid names; the few testid placeholders (`trash-row-*`, `conflict-row-*`, etc.) are explicitly flagged in each step as "if these don't match, align with the component, don't change the component".
