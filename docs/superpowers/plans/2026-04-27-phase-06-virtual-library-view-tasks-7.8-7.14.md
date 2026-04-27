# Phase 06 — Virtual Library View: Plan 5 (Smoke 7.8–7.14)

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-06-virtual-library-view`
> **Task range:** OpenSpec tasks `7.8`–`7.14` (7 tasks)
> **Plan order:** 5 of 5. Depends on Plans 1–4. After this plan the change is ready to archive via `/opsx:archive`.
> **Status:** Not started
> **Created:** 2026-04-27
> **Branch suggestion:** `feat/phase-06-virtual-library-view`

---

## Goal

Finish the OpenSpec acceptance suite: 理果中 state for unrated files, right-click → Reveal in Finder, live indexer events (`fileChanged` / `fileDeleted`), the `scanning` banner, the project switch reset, and finally `openspec validate phase-06-virtual-library-view --strict`.

## Architecture

- **All scenarios use the `Library.acceptance.test.tsx` harness** built in Plan 4 (mocked `ipc.files.*` + `ipc.on` event capture). No real Electron / SQLite is started in tests.
- **For event-driven scenarios** (7.10, 7.11, 7.12, 7.13) the test grabs the handler registered via `ipc.on(channel, handler)` and invokes it directly to simulate the main-process push.
- **Manual smoke checklists** stay attached to each task — they confirm the feature works against a real grove.
- **Final validate task** runs `openspec validate phase-06-virtual-library-view --strict` and pastes the output. If it fails, fix the spec/proposal/design files until it passes.

## Tech Stack

- `@testing-library/react`, `@testing-library/user-event`
- `vitest@^2`
- `openspec` CLI

## Files Touched (this plan)

| Path | Action | Owner task |
|---|---|---|
| `src/pages/Library.acceptance.test.tsx` | Modify (append scenarios 7.8–7.13) | 7.8, 7.9, 7.10, 7.11, 7.12, 7.13 |
| `openspec/changes/phase-06-virtual-library-view/*` | Modify only if `validate --strict` flags issues | 7.14 |

## Pre-flight

Plan 4 fully merged. `Library.acceptance.test.tsx` already imports the helpers used here. The `__resetSubscriberForTest()` helper added in Plan 3 is required — confirm it exists:

```bash
grep -n '__resetSubscriberForTest' src/stores/library.ts
```

If missing, return to Plan 3 task 9 and add it before continuing.

---

## Tasks

<!-- openspec-task: 7.8 -->
### Task 1: Acceptance — `rating IS NULL` shows "理果中" in row + preview

**Files:**
- Modify: `src/pages/Library.acceptance.test.tsx`

- [ ] **Step 1: Failing test**

Append to `src/pages/Library.acceptance.test.tsx`:

```ts
describe('OpenSpec acceptance 7.8 — rating IS NULL shows 理果中 in row and preview', () => {
  it('row renders the · 理果中 placeholder when rating is null', async () => {
    const fixture = sortByClippedDesc(
      buildSummaries([{ path: 'a.md', title: 'Unrated', rating: null }])
    )
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: fixture,
      total: 1
    })
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(screen.getAllByText(/理果中/).length).toBeGreaterThanOrEqual(1)
  })

  it('preview shows reviewing loader card when summary is missing', async () => {
    const fixture = sortByClippedDesc(
      buildSummaries([{ path: 'a.md', rating: null, has_summary: false }])
    )
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: fixture,
      total: 1
    })
    ;(ipc.files.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      summary: fixture[0],
      frontmatter: {},
      body: ''
    })
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    const row = document.querySelector('[data-testid="file-row"]') as HTMLElement
    await userEvent.click(row)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(screen.getByTestId('preview-reviewing-loader')).toBeTruthy()
  })
})
```

Run:
```bash
npx vitest run src/pages/Library.acceptance.test.tsx -t '7.8'
```

Expected: PASS.

- [ ] **Step 2: Manual smoke**

Open a grove file with empty `rating:` frontmatter. Confirm the row shows `· 理果中` and the preview pane shows the dashed loader card.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Library.acceptance.test.tsx
git commit -m "test(phase-06): acceptance 7.8 — rating IS NULL shows 理果中 in row + preview"
```

---

<!-- openspec-task: 7.9 -->
### Task 2: Acceptance — right-click → Reveal in Finder works

**Files:**
- Modify: `src/components/library/VirtualFileList.tsx` (wire context menu hook)
- Modify: `src/pages/Library.acceptance.test.tsx`

- [ ] **Step 1: Failing test**

Append to `src/pages/Library.acceptance.test.tsx`:

```ts
describe('OpenSpec acceptance 7.9 — right-click → Reveal in Finder', () => {
  it('right-click opens the menu, "在 Finder 中显示" calls files.revealInFinder', async () => {
    const fixture = sortByClippedDesc(buildSummaries([{ path: 'a.md', title: 'A' }]))
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: fixture,
      total: 1
    })
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    const row = document.querySelector('[data-testid="file-row"]') as HTMLElement
    fireEvent.contextMenu(row, { clientX: 50, clientY: 50 })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    const menu = screen.getByTestId('file-row-menu')
    expect(menu).toBeTruthy()
    await userEvent.click(screen.getByText(/在 Finder 中显示/))
    await act(async () => {
      await Promise.resolve()
    })
    expect(ipc.files.revealInFinder).toHaveBeenCalledWith('a.md')
  })
})
```

Add the missing import at the top of the file:

```ts
import { fireEvent } from '@testing-library/react'
```

Run:
```bash
npx vitest run src/pages/Library.acceptance.test.tsx -t '7.9'
```

Expected: FAIL — the row does not yet open a context menu.

- [ ] **Step 2: Wire the context menu into `VirtualFileList`**

Modify `src/components/library/VirtualFileList.tsx`:

Add the import:

```tsx
import { FileRowContextMenu } from './FileRowContextMenu'
import { useState } from 'react'
```

Inside the component, add a context-menu state:

```tsx
const [menu, setMenu] = useState<{ x: number; y: number; path: string } | null>(null)
```

Pass `onContextMenu` into `FileRow`:

```tsx
<FileRow
  file={file}
  active={file.path === selectedPath}
  onClick={() => void select(file.path)}
  onDoubleClick={() => navigate(`/editor/${encodeURIComponent(file.path)}`)}
  onContextMenu={(e) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, path: file.path })
  }}
/>
```

At the bottom of the component (sibling to the virtualizer wrapper), render the menu:

```tsx
{menu ? (
  <FileRowContextMenu
    open
    x={menu.x}
    y={menu.y}
    path={menu.path}
    onClose={() => setMenu(null)}
  />
) : null}
```

- [ ] **Step 3: Run the test**

Run:
```bash
npx vitest run src/pages/Library.acceptance.test.tsx -t '7.9'
```

Expected: PASS.

- [ ] **Step 4: Manual smoke**

In `npm run dev`, right-click any file row → menu appears → "在 Finder 中显示" pops the OS file viewer at the file's location.

- [ ] **Step 5: Commit**

```bash
git add src/components/library/VirtualFileList.tsx src/pages/Library.acceptance.test.tsx
git commit -m "feat(phase-06): wire FileRow context menu in VirtualFileList; acceptance 7.9 passes"
```

---

<!-- openspec-task: 7.10 -->
### Task 3: Acceptance — external new md → list reflects within 1s

**Files:**
- Modify: `src/pages/Library.acceptance.test.tsx`

The store subscribes to `index:fileChanged` and calls `refresh()`. We simulate by capturing the handler and invoking it.

- [ ] **Step 1: Failing test**

Append:

```ts
describe('OpenSpec acceptance 7.10 — external new md → list updates via index:fileChanged', () => {
  it('index:fileChanged triggers a re-list', async () => {
    const before = sortByClippedDesc(buildSummaries([{ path: 'a.md' }]))
    const after = sortByClippedDesc(buildSummaries([{ path: 'a.md' }, { path: 'b.md' }]))

    let listCallCount = 0
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      listCallCount++
      return listCallCount === 1 ? { items: before, total: 1 } : { items: after, total: 2 }
    })

    let onChanged: ((p: { path: string; contentHash: string; mtime: number; frontmatter: unknown }) => void) | null =
      null
    ;(ipc.on as ReturnType<typeof vi.fn>).mockImplementation((channel, h) => {
      if (channel === 'index:fileChanged') onChanged = h as typeof onChanged
      return () => {}
    })

    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(useLibraryStore.getState().items.length).toBe(1)

    await act(async () => {
      onChanged?.({ path: 'b.md', contentHash: 'x', mtime: 1, frontmatter: {} })
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(useLibraryStore.getState().items.length).toBe(2)
  })
})
```

Run:
```bash
npx vitest run src/pages/Library.acceptance.test.tsx -t '7.10'
```

Expected: PASS.

- [ ] **Step 2: Manual smoke**

In a running `npm run dev`, run `echo '---\ntitle: New\n---\n' > /path/to/grove/notes/new.md`. Within 1 second the list should add the new row.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Library.acceptance.test.tsx
git commit -m "test(phase-06): acceptance 7.10 — index:fileChanged refreshes the library list"
```

---

<!-- openspec-task: 7.11 -->
### Task 4: Acceptance — external delete of selected file → row + preview clear

**Files:**
- Modify: `src/pages/Library.acceptance.test.tsx`

- [ ] **Step 1: Failing test**

Append:

```ts
describe('OpenSpec acceptance 7.11 — external delete of selected file clears row + preview', () => {
  it('index:fileDeleted clears selectedPath and re-fetches list', async () => {
    const before = sortByClippedDesc(buildSummaries([{ path: 'a.md' }, { path: 'b.md' }]))
    const after = sortByClippedDesc(buildSummaries([{ path: 'b.md' }]))

    let listCallCount = 0
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      listCallCount++
      return listCallCount === 1 ? { items: before, total: 2 } : { items: after, total: 1 }
    })
    ;(ipc.files.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      summary: before[0],
      frontmatter: {},
      body: ''
    })

    let onDeleted: ((p: { path: string }) => void) | null = null
    ;(ipc.on as ReturnType<typeof vi.fn>).mockImplementation((channel, h) => {
      if (channel === 'index:fileDeleted') onDeleted = h as typeof onDeleted
      return () => {}
    })

    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // Select 'a.md'
    await act(async () => {
      await useLibraryStore.getState().select('a.md')
    })
    expect(useLibraryStore.getState().selectedPath).toBe('a.md')

    // Externally delete 'a.md'
    await act(async () => {
      onDeleted?.({ path: 'a.md' })
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(useLibraryStore.getState().selectedPath).toBeNull()
    expect(useLibraryStore.getState().items.map((i) => i.path)).toEqual(['b.md'])
    expect(screen.getByTestId('preview-empty')).toBeTruthy()
  })
})
```

Run:
```bash
npx vitest run src/pages/Library.acceptance.test.tsx -t '7.11'
```

Expected: PASS.

- [ ] **Step 2: Manual smoke**

In `npm run dev`: select a file, then `rm <grove>/<path>.md` from a terminal. The row disappears from the list and the preview pane returns to its empty state.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Library.acceptance.test.tsx
git commit -m "test(phase-06): acceptance 7.11 — external delete clears selectedPath and preview"
```

---

<!-- openspec-task: 7.12 -->
### Task 5: Acceptance — index `scanning` state shows banner

**Files:**
- Modify: `src/pages/Library.acceptance.test.tsx`

- [ ] **Step 1: Failing test**

Append:

```ts
describe('OpenSpec acceptance 7.12 — index scanning shows banner', () => {
  it('index:stateChange={state:"scanning"} renders the scanning banner', async () => {
    let onState: ((p: { state: string }) => void) | null = null
    ;(ipc.on as ReturnType<typeof vi.fn>).mockImplementation((channel, h) => {
      if (channel === 'index:stateChange') onState = h as typeof onState
      return () => {}
    })
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 })

    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // No banner yet (idle/default)
    expect(screen.queryByText(/索引中/)).toBeNull()

    await act(async () => {
      onState?.({ state: 'scanning' })
    })
    expect(screen.getByText(/索引中/)).toBeTruthy()

    await act(async () => {
      onState?.({ state: 'watching' })
    })
    expect(screen.queryByText(/索引中/)).toBeNull()
  })
})
```

Run:
```bash
npx vitest run src/pages/Library.acceptance.test.tsx -t '7.12'
```

Expected: PASS.

> Note: depends on `IpcEventContract` having `'index:stateChange'`. Verify with:
> ```bash
> grep -n "index:stateChange" shared/ipc-contract.ts
> ```
> If missing, add to phase-06's contract — only an additive change to phase-05's existing channel set:
> ```ts
> 'index:stateChange': { state: 'idle' | 'scanning' | 'ready' | 'watching' | 'error' }
> ```

- [ ] **Step 2: Manual smoke**

In `npm run dev`, open a large grove and use the "back-process index" option (phase 5 introduces this) — the yellow banner should appear at the top of `/library`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Library.acceptance.test.tsx shared/ipc-contract.ts
git commit -m "test(phase-06): acceptance 7.12 — scanning state shows IndexBanner"
```

---

<!-- openspec-task: 7.13 -->
### Task 6: Acceptance — switching grove resets and reloads

**Files:**
- Modify: `src/pages/Library.acceptance.test.tsx`

- [ ] **Step 1: Failing test**

Append:

```ts
describe('OpenSpec acceptance 7.13 — switching grove resets library state', () => {
  it('project:changed clears items / cache and reloads', async () => {
    const groveA = sortByClippedDesc(buildSummaries([{ path: 'a.md' }]))
    const groveB = sortByClippedDesc(
      buildSummaries([{ path: 'x.md' }, { path: 'y.md' }])
    )
    let callCount = 0
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount++
      return callCount === 1
        ? { items: groveA, total: 1 }
        : { items: groveB, total: 2 }
    })
    ;(ipc.files.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      summary: groveA[0],
      frontmatter: {},
      body: ''
    })

    let onProject: ((p: unknown) => void) | null = null
    ;(ipc.on as ReturnType<typeof vi.fn>).mockImplementation((channel, h) => {
      if (channel === 'project:changed') onProject = h as typeof onProject
      return () => {}
    })

    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    await act(async () => {
      await useLibraryStore.getState().select('a.md')
    })
    expect(useLibraryStore.getState().selectedPath).toBe('a.md')
    expect(useLibraryStore.getState().detailsByPath.size).toBe(1)

    // Switch grove
    await act(async () => {
      onProject?.({ id: 'new', path: '/new', name: 'New', color: null, sync_warning: null })
      await new Promise((r) => setTimeout(r, 50))
    })

    const s = useLibraryStore.getState()
    expect(s.selectedPath).toBeNull()
    expect(s.detailsByPath.size).toBe(0)
    expect(s.items.map((i) => i.path)).toEqual(['x.md', 'y.md'])
    expect(s.filter).toEqual({})
  })
})
```

Run:
```bash
npx vitest run src/pages/Library.acceptance.test.tsx -t '7.13'
```

Expected: PASS.

- [ ] **Step 2: Manual smoke**

In `npm run dev`, use the GroveSwitcher to open a different grove → confirm `/library` clears and re-populates with the new tree's files.

- [ ] **Step 3: Run the full test suite + lint + typecheck**

Run:
```bash
npm test && npm run lint && npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Library.acceptance.test.tsx
git commit -m "test(phase-06): acceptance 7.13 — project:changed resets library and reloads"
```

---

<!-- openspec-task: 7.14 -->
### Task 7: `openspec validate phase-06-virtual-library-view --strict` passes

**Files:**
- Possibly modify: `openspec/changes/phase-06-virtual-library-view/proposal.md`, `design.md`, `tasks.md`, `specs/**/*.md` — only if the validator reports issues

- [ ] **Step 1: Run strict validate**

Run:
```bash
openspec validate phase-06-virtual-library-view --strict
```

Expected (target state): exits `0` with no warnings.

If it errors:
- Read the message carefully — typical issues are missing `## Why` / `## What Changes` headers, malformed `### Requirement:` blocks, unparseable `#### Scenario:` lists, or non-additive spec changes that should be marked `MODIFIED`.
- Fix only the flagged file. Do not restructure passing files.

- [ ] **Step 2: Sync OpenSpec tasks.md to mark phase-06 complete**

After all 41 tasks are committed across plans 1–5, mark them done in `tasks.md`:

The simplest way is to edit `openspec/changes/phase-06-virtual-library-view/tasks.md` and replace each `- [ ]` with `- [x]`. Verify by re-running:

```bash
openspec status --change 'phase-06-virtual-library-view' --json | jq .progress
```

Expected: `{ "total": 41, "complete": 41, "remaining": 0 }`.

- [ ] **Step 3: Run final validate**

Run:
```bash
openspec validate phase-06-virtual-library-view --strict
```

Expected: PASS with exit 0.

- [ ] **Step 4: Run full project quality gates**

Run:
```bash
npm test && npm run lint && npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add openspec/changes/phase-06-virtual-library-view/tasks.md
git commit -m "chore(phase-06): sync tasks.md as complete; openspec validate --strict passes"
```

- [ ] **Step 6: Hand-off**

Phase 06 is complete. Next steps (out-of-scope for this plan):
- `git checkout main && git merge feat/phase-06-virtual-library-view --no-ff`
- `/opsx:archive phase-06-virtual-library-view` to move the change into `openspec/changes/archive/`
- Phase 07 (Vditor editor + autosave) builds on the `/editor/:path` placeholder created here

---

## Plan-5 Acceptance

After all 7 tasks complete:
- [ ] `npm test` PASSES (acceptance scenarios 7.8–7.13 plus EditorPlaceholder + all earlier tests)
- [ ] `npm run typecheck` PASSES
- [ ] `npm run lint` PASSES
- [ ] `openspec validate phase-06-virtual-library-view --strict` exits 0
- [ ] `openspec status --change phase-06-virtual-library-view --json` reports 41/41 complete
- [ ] Manual smoke against a real grove confirms each scenario behaves correctly
- [ ] `git log --oneline` for the branch shows commits for all 41 OpenSpec tasks (10 + 6 + 10 + 8 + 7)
