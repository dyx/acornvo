# Phase 10 History & Trash — Plan 3 (Tasks 5.1–6.5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the `/history` page — tab routing, three tabs (Trash / Conflicts / Ops), and the `ConflictDetailPanel` with side-by-side diff view. By plan end a user can navigate to `/history`, see all three tabs populated, click into a conflict, and see a side-by-side three-way diff.

**Architecture:** A single page component (`src/pages/History.tsx`) is the redirect target for `/history`; the real work lives in `src/components/history/HistoryLayout.tsx` (tabs + URL sync) and three tab components that pull data from the IPC namespaces added by Plans 1 + 2 (`ops.list`, `conflict.list`, `conflict.diff`, `conflict.delete`, `conflict.deleteAll`). The `ConflictDetailPanel` is a dumb consumer of the structured `DiffResult` returned by `conflict.diff`; renderer never imports `jsdiff`. Two new tiny IPC handlers — `file.openContainingDir(rel)` and `conflict.openSnapshotFile(id, side)` — encapsulate the "open in system file manager" buttons so the renderer never sees absolute paths.

**Tech Stack:** React 18+, react-router-dom v7 (already in `package.json`), shadcn (Tabs, ResizablePanel, AlertDialog, Button — Tabs/Resizable/AlertDialog will be added via `shadcn` CLI in Task 22), `@tanstack/react-virtual` (NOT yet installed — Task 22 adds it), `jsdiff` (already added in Plan 1; main-side only — renderer must not import), date-fns (NOT yet installed — Task 22 adds it for relative-time helper).

---

## Pre-flight

Plans 1 and 2 must be merged on `main` first. Specifically this plan assumes:

- `conflict.list` IPC works (Plan 2 of phase 9, already merged).
- `conflict.diff(id, sides)` IPC was added in Plan 2 of this phase (phase 10 — task 3.5). It returns the `DiffResult` shape from the conflict-diff-view spec.
- `conflict.delete(id)` and `conflict.deleteAll()` IPC are available (Plan 2, tasks 3.4, 3.6).
- `ops.list({ op?, limit, offset })` IPC is available (Plan 2, task 3.3).
- `OpsItem` / `Op` types are exported from `@shared/ops-types` (Plan 1 of phase 10, task 1.3).
- `ConflictItem` / `ConflictMeta` types are exported from `@shared/conflict-types` (phase 9 plan 1).
- shadcn-style scaffold is in place at `src/components/ui/` (button, dialog, dropdown-menu, input, toast/toaster already exist).
- `TitleBar.tsx` exists at `src/components/TitleBar.tsx` and currently renders a static `t('app.title')`. It does NOT yet support a per-route override; this plan introduces a tiny `useTitle()` Zustand slice rather than threading props.

Verify before starting:
```bash
grep -q "conflict.diff" /Users/aaa/develop/workspace-ai/acornvo/shared/ipc-contract.ts && echo "conflict.diff OK"
grep -q "ops.list" /Users/aaa/develop/workspace-ai/acornvo/shared/ipc-contract.ts && echo "ops.list OK"
test -f /Users/aaa/develop/workspace-ai/acornvo/shared/ops-types.ts && echo "ops-types OK"
test -f /Users/aaa/develop/workspace-ai/acornvo/shared/conflict-types.ts && echo "conflict-types OK"
```
All four must print "OK".

If any line fails, **stop**: Plans 1/2 of phase 10 (or phase 9) have not been completed. Do not attempt to add the missing IPC inside this plan — it is owned by other plans.

## File Structure

| Path | Action | Owner task |
|---|---|---|
| `package.json` | Modify (add `@tanstack/react-virtual`, `date-fns`) | 22 (preflight) |
| `src/components/ui/tabs.tsx` | Create (via `npx shadcn@latest add tabs`) | 22 |
| `src/components/ui/resizable.tsx` | Create (via `npx shadcn@latest add resizable`) | 22 |
| `src/components/ui/alert-dialog.tsx` | Create (via `npx shadcn@latest add alert-dialog`) | 22 |
| `shared/ipc-contract.ts` | Modify (add `file.openContainingDir`, `conflict.openSnapshotFile`) | 23 |
| `electron/ipc/file.ts` | Modify (add `openContainingDir` handler) | 23 |
| `electron/ipc/conflicts.ts` | Modify (add `openSnapshotFile` handler) | 23 |
| `electron/ipc/file.test.ts` | Modify (cover openContainingDir) | 23 |
| `electron/ipc/conflicts.test.ts` | Modify (cover openSnapshotFile) | 23 |
| `preload/preload.ts` | Modify (expose new methods) | 23 |
| `src/App.tsx` | Modify (register `/history` and `/history/:tab`) | 24 (5.1) |
| `src/pages/History.tsx` | Create | 24 (5.1) |
| `src/components/history/HistoryLayout.tsx` | Create | 25 (5.2) |
| `src/components/history/HistoryLayout.test.tsx` | Create | 25 (5.2) |
| `src/components/history/TrashTab.tsx` | Create | 26 (5.3) |
| `src/components/history/TrashTab.test.tsx` | Create | 26 (5.3) |
| `src/components/history/ConflictsTab.tsx` | Create | 27 (5.4) |
| `src/components/history/ConflictsTab.test.tsx` | Create | 27 (5.4) |
| `src/components/history/ConflictListItem.tsx` | Create | 27 (5.4) |
| `src/components/history/OpsTab.tsx` | Create | 28 (5.5) |
| `src/components/history/OpsTab.test.tsx` | Create | 28 (5.5) |
| `src/components/history/OpsRow.tsx` | Create | 28 (5.5) |
| `src/components/history/EmptyState.tsx` | Create | 29 (5.6) |
| `src/components/TitleBar.tsx` | Modify (read title from store) | 30 (5.7) |
| `src/stores/title.ts` | Create | 30 (5.7) |
| `src/i18n/locales/zh-CN.json` | Modify (add `history.*` keys used by tabs) | 24, 26, 27, 28, 29, 30 |
| `src/components/history/ConflictDetailPanel.tsx` | Create | 31 (6.1), 32 (6.3), 33 (6.4), 34 (6.5) |
| `src/components/history/ConflictDetailPanel.test.tsx` | Create | 31, 32, 33, 34 |
| `src/components/history/DiffView.tsx` | Create | 31 (6.1, used by 6.2) |
| `src/components/history/DiffView.test.tsx` | Create | 31 |
| `src/components/history/diff-view.test.tsx` (alt name) | — | (use `DiffView.test.tsx`) |

## Conventions reused

- Renderer never imports `jsdiff`. Diff rendering takes the structured payload returned by `conflict.diff`. This is enforced by adding an ESLint `no-restricted-imports` rule for `'diff'` in renderer scope (Task 22, optional).
- File-system actions ("打开原目录", "在系统文件管理器中打开") MUST go through IPC. The renderer never sees absolute paths.
- Virtualization: prefer `@tanstack/react-virtual` (`useVirtualizer`) when row count > 50; for ≤50 a plain mapped list is fine. The IPC limits we use (`limit: 100`) keep all lists virtualized.
- Tab/route names are URL-stable: `trash`, `conflicts`, `ops`. Anything else under `/history/:tab` redirects to `/history/trash`.
- Component tests use `@testing-library/react` (already in devDeps). For purely visual cases, assert structural rendering and route-driven side effects (e.g. clicking a row triggers a `navigate` mock call).
- Pages live under `src/pages/`. History tabs and helpers live under `src/components/history/`.
- All new strings are added to `src/i18n/locales/zh-CN.json` and looked up via `useTranslation()`. Keys are namespaced under `history.*` and `diff.*`.

---

<!-- openspec-task: pre-5.1 -->
### Task 22: install missing UI deps and add shadcn primitives

This task is the technical pre-flight for the rest of the plan. Without it, every component file fails to import. It does not own an OpenSpec task label but is a prerequisite step.

**Files:**
- Modify: `package.json`
- Create: `src/components/ui/tabs.tsx`
- Create: `src/components/ui/resizable.tsx`
- Create: `src/components/ui/alert-dialog.tsx`

- [ ] **Step 1: Install renderer deps**

```bash
npm install --save @tanstack/react-virtual date-fns
npm install --save-dev react-resizable-panels @radix-ui/react-tabs @radix-ui/react-alert-dialog
```

`react-resizable-panels` is the dep that shadcn's `resizable` primitive wraps; `@radix-ui/react-tabs` and `@radix-ui/react-alert-dialog` are already implied by shadcn but installing explicitly avoids surprises.

- [ ] **Step 2: Add shadcn primitives**

Run inside the repo root:
```bash
npx shadcn@latest add tabs
npx shadcn@latest add resizable
npx shadcn@latest add alert-dialog
```

Confirm three new files appeared:
```bash
ls /Users/aaa/develop/workspace-ai/acornvo/src/components/ui/tabs.tsx
ls /Users/aaa/develop/workspace-ai/acornvo/src/components/ui/resizable.tsx
ls /Users/aaa/develop/workspace-ai/acornvo/src/components/ui/alert-dialog.tsx
```

- [ ] **Step 3: Type-check**

```bash
npm run typecheck
```
Expected: PASS. If shadcn's generated files use a different alias than `@/lib/utils`, fix the import.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/ui/tabs.tsx src/components/ui/resizable.tsx src/components/ui/alert-dialog.tsx
git commit -m "chore(ui): add tanstack/react-virtual, date-fns, shadcn tabs/resizable/alert-dialog (phase-10 pre-5.1)"
```

---

<!-- openspec-task: pre-5.1-ipc -->
### Task 23: add `file.openContainingDir` and `conflict.openSnapshotFile` IPC

The Trash tab needs to open the directory of a now-deleted (or still-existing) file in the system file manager. The ConflictDetailPanel needs to reveal `local.md`/`remote.md`/`base.md` inside `.acornvo/conflicts/<id>/`. The renderer only has rel-paths and conflict ids — never absolute paths. We add two narrow IPC methods so renderer never resolves paths itself.

**Files:**
- Modify: `shared/ipc-contract.ts` (extend `file` and `conflict` namespaces)
- Modify: `electron/ipc/file.ts`
- Modify: `electron/ipc/conflicts.ts`
- Modify: `electron/ipc/file.test.ts`
- Modify: `electron/ipc/conflicts.test.ts`
- Modify: `preload/preload.ts`

- [ ] **Step 1: Extend the contract**

Edit `shared/ipc-contract.ts`. Add `openContainingDir` to the `file` namespace and `openSnapshotFile` to the `conflict` namespace:

```ts
  file: {
    // ... existing methods ...
    /**
     * Open the parent directory of `rel` in the OS file manager (Finder / Explorer).
     * If the directory no longer exists, returns `{ ok: false, reason: 'missing' }`.
     */
    openContainingDir: (rel: string) => { ok: true } | { ok: false; reason: 'missing' }
  }
  conflict: {
    // ... existing list/read/delete/diff/deleteAll ...
    /**
     * Reveal `local.md` | `remote.md` | `base.md` inside `.acornvo/conflicts/<id>/`
     * via `shell.showItemInFolder`. Throws `E_NOT_FOUND` if the snapshot is gone.
     */
    openSnapshotFile: (id: string, side: 'local' | 'remote' | 'base') => { ok: true }
  }
```

- [ ] **Step 2: Implement `file.openContainingDir`**

Edit `electron/ipc/file.ts`. Append a new handler:

```ts
import { shell } from 'electron'
import { dirname } from 'node:path'
import { stat as fsStat } from 'node:fs/promises'

// inside fileHandlers object:
async openContainingDir(rel: string): Promise<{ ok: true } | { ok: false; reason: 'missing' }> {
  if (!rel || typeof rel !== 'string') {
    throw new IpcError('E_INVALID_ARGS', 'rel is required')
  }
  const root = requireGroveRoot()
  const abs = safeResolve(root, rel)
  const dir = dirname(abs)
  try {
    const st = await fsStat(dir)
    if (!st.isDirectory()) return { ok: false, reason: 'missing' }
  } catch {
    return { ok: false, reason: 'missing' }
  }
  const opened = await shell.openPath(dir)
  if (opened) {
    // shell.openPath returns '' on success and an error string on failure
    throw new IpcError('E_INTERNAL', `openPath failed: ${opened}`)
  }
  return { ok: true }
}
```

- [ ] **Step 3: Implement `conflict.openSnapshotFile`**

Edit `electron/ipc/conflicts.ts`. Append:

```ts
import { shell } from 'electron'
import { join } from 'node:path'
import { stat as fsStat } from 'node:fs/promises'
import { groveConflictsDir } from '../services/paths'
import { safeResolve } from '../services/path-safety'
import * as groveSvc from '../services/grove'

// inside conflictHandlers object:
async openSnapshotFile(id: string, side: 'local' | 'remote' | 'base'): Promise<{ ok: true }> {
  if (!id || typeof id !== 'string') throw new IpcError('E_INVALID_ARGS', 'id is required')
  if (!['local', 'remote', 'base'].includes(side)) {
    throw new IpcError('E_INVALID_ARGS', `invalid side: ${side}`)
  }
  const grove = groveSvc.getCurrent()
  if (!grove) throw new IpcError('E_NOT_FOUND', 'no grove is currently open')
  const root = groveConflictsDir(grove.path)
  const dir = safeResolve(root, id)
  const file = join(dir, `${side}.md`)
  try {
    await fsStat(file)
  } catch {
    throw new IpcError('E_NOT_FOUND', `snapshot file not found: ${id}/${side}.md`)
  }
  shell.showItemInFolder(file)
  return { ok: true }
}
```

- [ ] **Step 4: Wire preload**

Edit `preload/preload.ts`. Inside the `file` namespace add:
```ts
    openContainingDir: (rel: string) => invoke('file.openContainingDir', rel),
```
Inside the `conflict` namespace add:
```ts
    openSnapshotFile: (id: string, side: 'local' | 'remote' | 'base') =>
      invoke('conflict.openSnapshotFile', id, side),
```

- [ ] **Step 5: Write failing tests**

Edit `electron/ipc/file.test.ts`. Add (mocking `shell` is required):

```ts
import { vi } from 'vitest'

vi.mock('electron', async (importOriginal) => {
  const original = (await importOriginal<typeof import('electron')>()) ?? {}
  return {
    ...original,
    shell: {
      openPath: vi.fn().mockResolvedValue(''),
      showItemInFolder: vi.fn()
    }
  }
})

describe('file.openContainingDir (phase-10 23)', () => {
  it('returns ok:true when dir exists', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'fcd-'))
    vi.spyOn(groveSvc, 'getCurrent').mockReturnValue({
      id: 'g', path: tmp, name: 'g', color: 'acorn',
      schema_version: 1, created_at: '', last_opened_at: '', sync_warning: null
    })
    await mkdir(join(tmp, 'sub'), { recursive: true })
    await writeFile(join(tmp, 'sub/x.md'), '')
    const r = await fileHandlers.openContainingDir('sub/x.md')
    expect(r).toEqual({ ok: true })
    vi.restoreAllMocks()
  })

  it('returns ok:false reason=missing when dir gone', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'fcd-'))
    vi.spyOn(groveSvc, 'getCurrent').mockReturnValue({
      id: 'g', path: tmp, name: 'g', color: 'acorn',
      schema_version: 1, created_at: '', last_opened_at: '', sync_warning: null
    })
    const r = await fileHandlers.openContainingDir('gone/x.md')
    expect(r).toEqual({ ok: false, reason: 'missing' })
    vi.restoreAllMocks()
  })

  it('rejects empty rel', async () => {
    await expect(fileHandlers.openContainingDir('')).rejects.toMatchObject({
      code: 'E_INVALID_ARGS'
    })
  })
})
```

Edit `electron/ipc/conflicts.test.ts`. Add:

```ts
describe('conflictHandlers.openSnapshotFile (phase-10 23)', () => {
  it('reveals local.md when snapshot exists', async () => {
    const { id } = await writeSnapshot({
      path: 'a.md', baseText: 'B', localText: 'L', remoteText: 'R',
      resolvedBy: 'keep_local'
    })
    const r = await conflictHandlers.openSnapshotFile(id, 'local')
    expect(r).toEqual({ ok: true })
  })

  it('rejects invalid side', async () => {
    await expect(
      conflictHandlers.openSnapshotFile('any', 'middle' as never)
    ).rejects.toMatchObject({ code: 'E_INVALID_ARGS' })
  })

  it('throws E_NOT_FOUND for missing id', async () => {
    await expect(
      conflictHandlers.openSnapshotFile('does-not-exist', 'local')
    ).rejects.toMatchObject({ code: 'E_NOT_FOUND' })
  })
})
```

- [ ] **Step 6: Run, confirm pass**

```bash
npx vitest run electron/ipc/file.test.ts -t "phase-10 23"
npx vitest run electron/ipc/conflicts.test.ts -t "phase-10 23"
```
Expected: 3 + 3 PASS.

```bash
npm run typecheck
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add shared/ipc-contract.ts electron/ipc/file.ts electron/ipc/conflicts.ts electron/ipc/file.test.ts electron/ipc/conflicts.test.ts preload/preload.ts
git commit -m "feat(ipc): file.openContainingDir + conflict.openSnapshotFile (phase-10 pre-5.1)"
```

---

<!-- openspec-task: 5.1 -->
### Task 24: register `/history` and `/history/:tab` routes

**Files:**
- Modify: `src/App.tsx`
- Create: `src/pages/History.tsx`

- [ ] **Step 1: Create the page wrapper**

Create `src/pages/History.tsx`. It is a thin shell that lets the `/history/:tab` route render `<HistoryLayout />`. The bare `/history` (no tab) redirects to `/history/trash`.

```tsx
import type { JSX } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { HistoryLayout } from '@/components/history/HistoryLayout'

const VALID_TABS = ['trash', 'conflicts', 'ops'] as const
type Tab = (typeof VALID_TABS)[number]

export function History(): JSX.Element {
  const { tab } = useParams<{ tab?: string }>()
  if (!tab || !VALID_TABS.includes(tab as Tab)) {
    return <Navigate to="/history/trash" replace />
  }
  return <HistoryLayout tab={tab as Tab} />
}
```

- [ ] **Step 2: Register routes**

Edit `src/App.tsx`. Import the page and add two routes inside `<Routes>`:

```tsx
import { History } from './pages/History'

// inside <Routes>:
  <Route path="/history" element={<Navigate to="/history/trash" replace />} />
  <Route path="/history/:tab" element={<History />} />
```

- [ ] **Step 3: Smoke test the redirect**

Append a tiny test next to App. Create `src/App.history.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom'
import { History } from './pages/History'

// Stub the layout to avoid pulling all tabs into this smoke
vi.mock('@/components/history/HistoryLayout', () => ({
  HistoryLayout: ({ tab }: { tab: string }) => <div data-testid="layout">{tab}</div>
}))

describe('History routing (phase-10 5.1)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('/history redirects to /history/trash', () => {
    render(
      <MemoryRouter initialEntries={['/history']}>
        <Routes>
          <Route path="/history" element={<Navigate to="/history/trash" replace />} />
          <Route path="/history/:tab" element={<History />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByTestId('layout').textContent).toBe('trash')
  })

  it('/history/conflicts renders conflicts tab', () => {
    render(
      <MemoryRouter initialEntries={['/history/conflicts']}>
        <Routes>
          <Route path="/history/:tab" element={<History />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByTestId('layout').textContent).toBe('conflicts')
  })

  it('/history/garbage redirects to /history/trash', () => {
    render(
      <MemoryRouter initialEntries={['/history/garbage']}>
        <Routes>
          <Route path="/history/:tab" element={<History />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByTestId('layout').textContent).toBe('trash')
  })
})
```

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run src/App.history.test.tsx
```
Expected: 3 PASS. Note: tests 1 and 3 redirect to `/history/trash` and the second route in the test wrapper renders `History`, which mounts the stubbed `HistoryLayout`.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/pages/History.tsx src/App.history.test.tsx
git commit -m "feat(history): /history → /history/trash redirect + /history/:tab route (phase-10 5.1)"
```

---

<!-- openspec-task: 5.2 -->
### Task 25: `HistoryLayout.tsx` — Tabs with URL sync

**Files:**
- Create: `src/components/history/HistoryLayout.tsx`
- Create: `src/components/history/HistoryLayout.test.tsx`
- Modify: `src/i18n/locales/zh-CN.json` (add `history.tabs.trash` / `.conflicts` / `.ops`)

- [ ] **Step 1: Add the i18n keys**

Edit `src/i18n/locales/zh-CN.json`. Find the top-level object and merge in:

```json
"history": {
  "tabs": {
    "trash": "回收站",
    "conflicts": "冲突",
    "ops": "操作"
  }
}
```

If a `history` key already exists, merge sub-keys without overwriting siblings.

- [ ] **Step 2: Write failing test**

Create `src/components/history/HistoryLayout.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { HistoryLayout } from './HistoryLayout'

// Stub child tabs to keep the test focused
vi.mock('./TrashTab', () => ({ TrashTab: () => <div data-testid="trash">trash</div> }))
vi.mock('./ConflictsTab', () => ({ ConflictsTab: () => <div data-testid="conflicts">conflicts</div> }))
vi.mock('./OpsTab', () => ({ OpsTab: () => <div data-testid="ops">ops</div> }))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/history/:tab" element={<HistoryLayout tab={path.split('/')[2] as any} />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('HistoryLayout (phase-10 5.2)', () => {
  it('renders three tabs with localized labels', () => {
    renderAt('/history/trash')
    expect(screen.getByRole('tab', { name: /回收站/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /冲突/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /操作/ })).toBeInTheDocument()
  })

  it('shows the trash tab content when tab="trash"', () => {
    renderAt('/history/trash')
    expect(screen.getByTestId('trash')).toBeInTheDocument()
  })

  it('shows the conflicts content when tab="conflicts"', () => {
    renderAt('/history/conflicts')
    expect(screen.getByTestId('conflicts')).toBeInTheDocument()
  })

  it('navigates when a tab trigger is clicked', async () => {
    const user = userEvent.setup()
    renderAt('/history/trash')
    await user.click(screen.getByRole('tab', { name: /冲突/ }))
    // Tabs in this layout drive a navigate(); useNavigate is mocked-by-router
    // and the URL should now be /history/conflicts. We assert via location.
    // react-router's MemoryRouter exposes the location in its context — we
    // verify via the rendered tab content swap.
    expect(screen.getByTestId('conflicts')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run, confirm failure**

```bash
npx vitest run src/components/history/HistoryLayout.test.tsx
```
Expected: 4 FAIL (file does not exist).

- [ ] **Step 4: Implement**

Create `src/components/history/HistoryLayout.tsx`:

```tsx
import type { JSX } from 'react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { TrashTab } from './TrashTab'
import { ConflictsTab } from './ConflictsTab'
import { OpsTab } from './OpsTab'
import { useTitleStore } from '@/stores/title'

export type HistoryTab = 'trash' | 'conflicts' | 'ops'

export function HistoryLayout({ tab }: { tab: HistoryTab }): JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setTitle = useTitleStore((s) => s.setTitle)

  useEffect(() => {
    setTitle(t('history.title', '历史'))
    return () => setTitle(null)
  }, [setTitle, t])

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => navigate(`/history/${v}`)}
      className="flex h-full flex-col"
    >
      <TabsList className="mx-4 mt-3 self-start">
        <TabsTrigger value="trash">{t('history.tabs.trash')}</TabsTrigger>
        <TabsTrigger value="conflicts">{t('history.tabs.conflicts')}</TabsTrigger>
        <TabsTrigger value="ops">{t('history.tabs.ops')}</TabsTrigger>
      </TabsList>
      <TabsContent value="trash" className="flex-1 overflow-hidden">
        <TrashTab />
      </TabsContent>
      <TabsContent value="conflicts" className="flex-1 overflow-hidden">
        <ConflictsTab />
      </TabsContent>
      <TabsContent value="ops" className="flex-1 overflow-hidden">
        <OpsTab />
      </TabsContent>
    </Tabs>
  )
}
```

Note: `useTitleStore` is created in Task 30 (5.7). For the test in this task to pass, stub the store import with vitest's mock OR — preferably — create the store now (one tiny file). Easiest path: create `src/stores/title.ts` here as a minimal Zustand slice; Task 30 will only modify `TitleBar.tsx` to read from it. Add this file before running the test:

Create `src/stores/title.ts`:

```ts
import { create } from 'zustand'

interface TitleState {
  title: string | null
  setTitle: (t: string | null) => void
}

export const useTitleStore = create<TitleState>((set) => ({
  title: null,
  setTitle: (title) => set({ title })
}))
```

The TrashTab / ConflictsTab / OpsTab files do not yet exist — the tests above mock them. Implementation files land in Tasks 26–28. **In this task, create three minimal stubs so HistoryLayout compiles**:

```bash
mkdir -p /Users/aaa/develop/workspace-ai/acornvo/src/components/history
```

Create `src/components/history/TrashTab.tsx`, `src/components/history/ConflictsTab.tsx`, `src/components/history/OpsTab.tsx` each with:

```tsx
import type { JSX } from 'react'
export function TrashTab(): JSX.Element { return <div /> }
// (Same shape, just rename the export for the other two.)
```

These stubs will be replaced in Tasks 26–28.

- [ ] **Step 5: Run, confirm pass**

```bash
npx vitest run src/components/history/HistoryLayout.test.tsx
```
Expected: 4 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/history/HistoryLayout.tsx src/components/history/HistoryLayout.test.tsx src/components/history/TrashTab.tsx src/components/history/ConflictsTab.tsx src/components/history/OpsTab.tsx src/stores/title.ts src/i18n/locales/zh-CN.json
git commit -m "feat(history): HistoryLayout with shadcn Tabs + URL sync (phase-10 5.2)"
```

---

<!-- openspec-task: 5.3 -->
### Task 26: `TrashTab.tsx` — virtualized list of `op='trash'` rows

**Files:**
- Modify: `src/components/history/TrashTab.tsx` (replace stub)
- Create: `src/components/history/TrashTab.test.tsx`
- Modify: `src/i18n/locales/zh-CN.json` (add `history.trash.notice`, `history.trash.openDir`, `history.trash.dirMissing`)

- [ ] **Step 1: Add i18n keys**

Edit `src/i18n/locales/zh-CN.json`. Inside the `history` block:

```json
"trash": {
  "notice": "Acornvo 不管理系统回收站。要恢复文件，请到系统的废纸篓查找。",
  "openDir": "打开原目录",
  "dirMissing": "目录不存在",
  "empty": "没有已删除的文件"
},
```

- [ ] **Step 2: Write failing tests**

Create `src/components/history/TrashTab.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TrashTab } from './TrashTab'

const mockList = vi.fn()
const mockOpenDir = vi.fn()
vi.mock('@/ipc/client', () => ({
  ipc: {
    ops: { list: (...args: unknown[]) => mockList(...args) },
    file: { openContainingDir: (...args: unknown[]) => mockOpenDir(...args) }
  }
}))

beforeEach(() => {
  mockList.mockReset()
  mockOpenDir.mockReset()
})

describe('TrashTab (phase-10 5.3)', () => {
  it('shows notice + 3 rows', async () => {
    mockList.mockResolvedValueOnce({
      total: 3,
      items: [
        { id: 1, op: 'trash', path: 'a.md', ts: '2026-04-25T10:00:00Z', meta: {} },
        { id: 2, op: 'trash', path: 'sub/b.md', ts: '2026-04-26T10:00:00Z', meta: {} },
        { id: 3, op: 'trash', path: 'c.md', ts: '2026-04-27T10:00:00Z', meta: {} }
      ]
    })
    render(<TrashTab />)
    expect(await screen.findByText(/系统的废纸篓/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText(/\.md$/).length).toBeGreaterThanOrEqual(3))
  })

  it('shows empty state when list is empty', async () => {
    mockList.mockResolvedValueOnce({ total: 0, items: [] })
    render(<TrashTab />)
    expect(await screen.findByText('没有已删除的文件')).toBeInTheDocument()
  })

  it('clicking 打开原目录 calls file.openContainingDir', async () => {
    mockList.mockResolvedValueOnce({
      total: 1,
      items: [{ id: 1, op: 'trash', path: 'sub/x.md', ts: '2026-04-28T10:00:00Z', meta: {} }]
    })
    mockOpenDir.mockResolvedValueOnce({ ok: true })
    const user = userEvent.setup()
    render(<TrashTab />)
    const btn = await screen.findByRole('button', { name: /打开原目录/ })
    await user.click(btn)
    expect(mockOpenDir).toHaveBeenCalledWith('sub/x.md')
  })

  it('disables 打开原目录 when reason=missing', async () => {
    mockList.mockResolvedValueOnce({
      total: 1,
      items: [{ id: 1, op: 'trash', path: 'gone/x.md', ts: '2026-04-28T10:00:00Z', meta: {} }]
    })
    mockOpenDir.mockResolvedValueOnce({ ok: false, reason: 'missing' })
    const user = userEvent.setup()
    render(<TrashTab />)
    const btn = await screen.findByRole('button', { name: /打开原目录/ })
    await user.click(btn)
    // After click, the button reflects the missing state via disabled/title.
    await waitFor(() => expect(btn).toBeDisabled())
  })
})
```

- [ ] **Step 3: Run, confirm failure**

```bash
npx vitest run src/components/history/TrashTab.test.tsx
```
Expected: 4 FAIL (component is still the stub).

- [ ] **Step 4: Implement**

Replace `src/components/history/TrashTab.tsx`:

```tsx
import type { JSX } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { ipc } from '@/ipc/client'
import { Button } from '@/components/ui/button'
import { EmptyState } from './EmptyState'
import type { OpsItem } from '@shared/ops-types'

export function TrashTab(): JSX.Element {
  const { t } = useTranslation()
  const [items, setItems] = useState<OpsItem[]>([])
  const [loading, setLoading] = useState(true)
  // per-row dir-missing state populated lazily after a click attempt
  const [missing, setMissing] = useState<Record<number, true>>({})

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ipc.ops
      .list({ op: 'trash', limit: 100, offset: 0 })
      .then((res) => {
        if (!cancelled) setItems(res.items)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const parentRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 8
  })

  const onOpenDir = async (item: OpsItem): Promise<void> => {
    try {
      const res = await ipc.file.openContainingDir(item.path)
      if (!res.ok && res.reason === 'missing') {
        setMissing((m) => ({ ...m, [item.id]: true }))
      }
    } catch {
      setMissing((m) => ({ ...m, [item.id]: true }))
    }
  }

  if (loading) return <div className="p-4 text-sm text-muted-foreground">…</div>
  if (items.length === 0) return <EmptyState text={t('history.trash.empty')} />

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-3 text-xs text-muted-foreground border-b border-[color:var(--color-line)]">
        {t('history.trash.notice')}
      </div>
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((vi) => {
            const item = items[vi.index]
            const isMissing = !!missing[item.id]
            return (
              <div
                key={item.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: vi.size,
                  transform: `translateY(${vi.start}px)`
                }}
                className="flex items-center gap-3 px-4 py-2 border-b border-[color:var(--color-line)]"
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm">{item.path}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(item.ts), { addSuffix: true, locale: zhCN })}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isMissing}
                  title={isMissing ? t('history.trash.dirMissing') : undefined}
                  onClick={() => onOpenDir(item)}
                >
                  {t('history.trash.openDir')}
                </Button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

`EmptyState` lands in Task 29 — for tests in this task to pass, **create a minimal stub now**:

Create `src/components/history/EmptyState.tsx`:

```tsx
import type { JSX } from 'react'
export function EmptyState({ text }: { text: string }): JSX.Element {
  return <div className="p-8 text-center text-sm text-muted-foreground">{text}</div>
}
```

Task 29 expands this with optional sub-text and an icon slot.

- [ ] **Step 5: Run, confirm pass**

```bash
npx vitest run src/components/history/TrashTab.test.tsx
```
Expected: 4 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/history/TrashTab.tsx src/components/history/TrashTab.test.tsx src/components/history/EmptyState.tsx src/i18n/locales/zh-CN.json
git commit -m "feat(history): TrashTab with virtualized list + open-dir button (phase-10 5.3)"
```

---

<!-- openspec-task: 5.4 -->
### Task 27: `ConflictsTab.tsx` — resizable left list / right detail + "清空所有快照"

**Files:**
- Modify: `src/components/history/ConflictsTab.tsx` (replace stub)
- Create: `src/components/history/ConflictsTab.test.tsx`
- Create: `src/components/history/ConflictListItem.tsx`
- Modify: `src/i18n/locales/zh-CN.json` (add `history.conflicts.*` keys)

- [ ] **Step 1: Add i18n keys**

Edit `src/i18n/locales/zh-CN.json`. Inside `history`:

```json
"conflicts": {
  "clearAll": "清空所有快照",
  "clearAllConfirmTitle": "清空所有冲突快照？",
  "clearAllConfirmBody": "此操作不可撤销。所有 .acornvo/conflicts/ 下的快照将被永久删除。",
  "clearAllConfirmOk": "确认清空",
  "cancel": "取消",
  "empty": "没有冲突历史。你的文件在 Acornvo 与外部工具之间同步良好。"
},
```

- [ ] **Step 2: Build the row component**

Create `src/components/history/ConflictListItem.tsx`:

```tsx
import type { JSX } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { ConflictItem } from '@shared/conflict-types'

export function ConflictListItem({
  item,
  selected,
  onClick
}: {
  item: ConflictItem
  selected: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <div
      role="button"
      onClick={onClick}
      data-selected={selected}
      className={[
        'flex flex-col gap-1 px-3 py-2 cursor-pointer border-b border-[color:var(--color-line)]',
        selected ? 'bg-accent' : 'hover:bg-accent/50'
      ].join(' ')}
    >
      <div className="truncate text-sm">{item.path}</div>
      <div className="flex gap-2 text-xs text-muted-foreground">
        <span>{formatDistanceToNow(new Date(item.ts), { addSuffix: true, locale: zhCN })}</span>
        <span className="rounded bg-muted px-1 py-px font-mono text-[10px]">
          {item.resolved_by}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write failing tests for ConflictsTab**

Create `src/components/history/ConflictsTab.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ConflictsTab } from './ConflictsTab'

const mockListConflicts = vi.fn()
const mockDeleteAll = vi.fn()
vi.mock('@/ipc/client', () => ({
  ipc: {
    conflict: {
      list: (...args: unknown[]) => mockListConflicts(...args),
      deleteAll: (...args: unknown[]) => mockDeleteAll(...args)
    }
  }
}))

vi.mock('./ConflictDetailPanel', () => ({
  ConflictDetailPanel: ({ id }: { id: string | null }) => (
    <div data-testid="detail">{id ?? 'none'}</div>
  )
}))

beforeEach(() => {
  mockListConflicts.mockReset()
  mockDeleteAll.mockReset()
})

function renderAt(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/history/conflicts" element={<ConflictsTab />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ConflictsTab (phase-10 5.4)', () => {
  it('renders 5 rows; selects first by default', async () => {
    mockListConflicts.mockResolvedValueOnce({
      total: 5,
      items: [1, 2, 3, 4, 5].map((i) => ({
        id: `c${i}`,
        path: `n${i}.md`,
        ts: `2026-04-2${i}T10:00:00Z`,
        resolved_by: 'keep_local' as const
      }))
    })
    renderAt('/history/conflicts')
    await waitFor(() => expect(screen.getByTestId('detail')).toHaveTextContent('c1'))
    expect(screen.getAllByRole('button')).toHaveLength(6) // 5 rows + clearAll
  })

  it('honors ?id= deep link', async () => {
    mockListConflicts.mockResolvedValueOnce({
      total: 3,
      items: ['a', 'b', 'c'].map((id, i) => ({
        id,
        path: `${id}.md`,
        ts: `2026-04-2${i}T10:00:00Z`,
        resolved_by: 'load_remote' as const
      }))
    })
    renderAt('/history/conflicts?id=b')
    await waitFor(() => expect(screen.getByTestId('detail')).toHaveTextContent('b'))
  })

  it('shows empty state when list is empty', async () => {
    mockListConflicts.mockResolvedValueOnce({ total: 0, items: [] })
    renderAt('/history/conflicts')
    expect(await screen.findByText(/没有冲突历史/)).toBeInTheDocument()
  })

  it('清空所有快照 → confirm → calls deleteAll', async () => {
    mockListConflicts
      .mockResolvedValueOnce({
        total: 2,
        items: [
          { id: 'a', path: 'a.md', ts: '2026-04-20T10:00:00Z', resolved_by: 'keep_local' as const },
          { id: 'b', path: 'b.md', ts: '2026-04-21T10:00:00Z', resolved_by: 'keep_local' as const }
        ]
      })
      .mockResolvedValueOnce({ total: 0, items: [] })
    mockDeleteAll.mockResolvedValueOnce({ deleted: 2 })
    const user = userEvent.setup()
    renderAt('/history/conflicts')
    await screen.findByTestId('detail')
    await user.click(screen.getByRole('button', { name: /清空所有快照/ }))
    await user.click(screen.getByRole('button', { name: /确认清空/ }))
    expect(mockDeleteAll).toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText(/没有冲突历史/)).toBeInTheDocument())
  })
})
```

- [ ] **Step 4: Run, confirm failure**

```bash
npx vitest run src/components/history/ConflictsTab.test.tsx
```
Expected: 4 FAIL.

- [ ] **Step 5: Implement**

Replace `src/components/history/ConflictsTab.tsx`:

```tsx
import type { JSX } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ipc } from '@/ipc/client'
import { Button } from '@/components/ui/button'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle
} from '@/components/ui/resizable'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import type { ConflictItem } from '@shared/conflict-types'
import { ConflictListItem } from './ConflictListItem'
import { ConflictDetailPanel } from './ConflictDetailPanel'
import { EmptyState } from './EmptyState'

export function ConflictsTab(): JSX.Element {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const [items, setItems] = useState<ConflictItem[]>([])
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0) // bump to force re-fetch

  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ipc.conflict
      .list({ limit: 100, offset: 0 })
      .then((res) => {
        if (!cancelled) setItems(res.items)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [version])

  const urlId = params.get('id')
  const selectedId = urlId && items.some((i) => i.id === urlId) ? urlId : items[0]?.id ?? null
  const selectId = (id: string): void => {
    setParams((p) => {
      const next = new URLSearchParams(p)
      next.set('id', id)
      return next
    })
  }

  const parentRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
    overscan: 8
  })

  const onClearAll = async (): Promise<void> => {
    await ipc.conflict.deleteAll()
    refresh()
  }

  if (loading) return <div className="p-4 text-sm text-muted-foreground">…</div>
  if (items.length === 0) return <EmptyState text={t('history.conflicts.empty')} />

  return (
    <div className="flex h-full flex-col">
      <div className="flex justify-end px-4 py-2 border-b border-[color:var(--color-line)]">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm">
              {t('history.conflicts.clearAll')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('history.conflicts.clearAllConfirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('history.conflicts.clearAllConfirmBody')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('history.conflicts.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={onClearAll}>
                {t('history.conflicts.clearAllConfirmOk')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={30} minSize={20}>
          <div ref={parentRef} className="h-full overflow-auto">
            <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map((vi) => {
                const item = items[vi.index]
                return (
                  <div
                    key={item.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      transform: `translateY(${vi.start}px)`
                    }}
                  >
                    <ConflictListItem
                      item={item}
                      selected={item.id === selectedId}
                      onClick={() => selectId(item.id)}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={70} minSize={40}>
          <ConflictDetailPanel id={selectedId} onDeleted={refresh} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
```

`ConflictDetailPanel` lands in Task 31. The test mocks it; runtime needs a stub. **Create a minimal stub now**:

Create `src/components/history/ConflictDetailPanel.tsx` (stub — Tasks 31–34 will replace):

```tsx
import type { JSX } from 'react'
export function ConflictDetailPanel({ id }: { id: string | null; onDeleted?: () => void }): JSX.Element {
  return <div data-testid="conflict-detail-stub">{id ?? 'none'}</div>
}
```

- [ ] **Step 6: Run, confirm pass**

```bash
npx vitest run src/components/history/ConflictsTab.test.tsx
```
Expected: 4 PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/history/ConflictsTab.tsx src/components/history/ConflictsTab.test.tsx src/components/history/ConflictListItem.tsx src/components/history/ConflictDetailPanel.tsx src/i18n/locales/zh-CN.json
git commit -m "feat(history): ConflictsTab with resizable layout + clear-all action (phase-10 5.4)"
```

---

<!-- openspec-task: 5.5 -->
### Task 28: `OpsTab.tsx` — filter chips + virtualized list + click-through

**Files:**
- Modify: `src/components/history/OpsTab.tsx` (replace stub)
- Create: `src/components/history/OpsTab.test.tsx`
- Create: `src/components/history/OpsRow.tsx`
- Modify: `src/i18n/locales/zh-CN.json` (add `history.ops.*` + `ops.op.*` keys)

- [ ] **Step 1: Add i18n keys**

Inside `src/i18n/locales/zh-CN.json`, add under `history`:

```json
"ops": {
  "filter": {
    "all": "全部",
    "trash": "回收站",
    "conflict_resolve": "冲突解决",
    "conflict_delete": "删除快照",
    "rename": "重命名",
    "hard_delete": "永久删除"
  },
  "empty": "还没有任何操作记录"
},
```

And at the top level (sibling of `history`):

```json
"ops": {
  "op": {
    "trash": "移到回收站",
    "hard_delete": "永久删除",
    "conflict_resolve": "解决冲突（{{by}}）",
    "conflict_delete": "删除冲突快照",
    "rename": "重命名 → {{to}}"
  }
},
```

(If a top-level `ops` already exists from earlier phase, merge sub-keys.)

- [ ] **Step 2: Row component**

Create `src/components/history/OpsRow.tsx`:

```tsx
import type { JSX } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'
import type { OpsItem } from '@shared/ops-types'

export function OpsRow({
  item,
  onClick
}: {
  item: OpsItem
  onClick?: () => void
}): JSX.Element {
  const { t } = useTranslation()
  let summary: string
  switch (item.op) {
    case 'conflict_resolve':
      summary = t('ops.op.conflict_resolve', { by: (item.meta as { resolved_by?: string })?.resolved_by ?? '?' })
      break
    case 'rename':
      summary = t('ops.op.rename', { to: (item.meta as { new_path?: string })?.new_path ?? '?' })
      break
    default:
      summary = t(`ops.op.${item.op}`, { defaultValue: item.op })
  }
  const clickable = !!onClick
  return (
    <div
      role={clickable ? 'button' : undefined}
      onClick={onClick}
      className={[
        'flex items-center gap-3 px-4 py-2 border-b border-[color:var(--color-line)]',
        clickable ? 'cursor-pointer hover:bg-accent/50' : ''
      ].join(' ')}
    >
      <span className="rounded bg-muted px-1.5 py-px font-mono text-[10px] uppercase">
        {item.op}
      </span>
      <div className="flex-1 min-w-0">
        <div className="truncate text-sm">{summary}</div>
        <div className="text-xs text-muted-foreground">
          {item.path} · {formatDistanceToNow(new Date(item.ts), { addSuffix: true, locale: zhCN })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write failing tests**

Create `src/components/history/OpsTab.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { OpsTab } from './OpsTab'

const mockOpsList = vi.fn()
const mockNavigate = vi.fn()
vi.mock('@/ipc/client', () => ({
  ipc: { ops: { list: (...args: unknown[]) => mockOpsList(...args) } }
}))
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

beforeEach(() => {
  mockOpsList.mockReset()
  mockNavigate.mockReset()
})

function wrap(ui: React.ReactNode) {
  return (
    <MemoryRouter>
      <Routes>
        <Route path="/" element={ui} />
      </Routes>
    </MemoryRouter>
  )
}

describe('OpsTab (phase-10 5.5)', () => {
  it('renders rows + filter chips', async () => {
    mockOpsList.mockResolvedValueOnce({
      total: 2,
      items: [
        { id: 1, op: 'trash', path: 'a.md', ts: '2026-04-25T10:00:00Z', meta: {} },
        { id: 2, op: 'conflict_resolve', path: 'b.md', ts: '2026-04-26T10:00:00Z', meta: { id: 'cid-1', resolved_by: 'keep_local' } }
      ]
    })
    render(wrap(<OpsTab />))
    expect(await screen.findByRole('button', { name: /全部/ })).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText(/\.md/).length).toBeGreaterThanOrEqual(2))
  })

  it('clicking trash chip refetches with op=trash', async () => {
    mockOpsList
      .mockResolvedValueOnce({ total: 0, items: [] })
      .mockResolvedValueOnce({ total: 0, items: [] })
    const user = userEvent.setup()
    render(wrap(<OpsTab />))
    await screen.findByRole('button', { name: /全部/ })
    await user.click(screen.getByRole('button', { name: /^回收站$/ }))
    await waitFor(() => expect(mockOpsList).toHaveBeenLastCalledWith({ op: 'trash', limit: 200, offset: 0 }))
  })

  it('clicking a conflict_resolve row navigates to /history/conflicts?id=<meta.id>', async () => {
    mockOpsList.mockResolvedValueOnce({
      total: 1,
      items: [
        { id: 9, op: 'conflict_resolve', path: 'b.md', ts: '2026-04-26T10:00:00Z', meta: { id: 'cid-X', resolved_by: 'load_remote' } }
      ]
    })
    const user = userEvent.setup()
    render(wrap(<OpsTab />))
    const row = await screen.findByRole('button', { name: /b\.md/ })
    await user.click(row)
    expect(mockNavigate).toHaveBeenCalledWith('/history/conflicts?id=cid-X')
  })

  it('shows empty state when no rows', async () => {
    mockOpsList.mockResolvedValueOnce({ total: 0, items: [] })
    render(wrap(<OpsTab />))
    expect(await screen.findByText(/还没有任何操作记录/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run, confirm failure**

```bash
npx vitest run src/components/history/OpsTab.test.tsx
```
Expected: 4 FAIL.

- [ ] **Step 5: Implement**

Replace `src/components/history/OpsTab.tsx`:

```tsx
import type { JSX } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ipc } from '@/ipc/client'
import { Button } from '@/components/ui/button'
import { OpsRow } from './OpsRow'
import { EmptyState } from './EmptyState'
import type { Op, OpsItem } from '@shared/ops-types'

const FILTER_OPS: Array<Op | 'all'> = [
  'all',
  'trash',
  'conflict_resolve',
  'conflict_delete',
  'rename',
  'hard_delete'
]

export function OpsTab(): JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Op | 'all'>('all')
  const [items, setItems] = useState<OpsItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const args =
      filter === 'all'
        ? { limit: 200, offset: 0 }
        : { op: filter, limit: 200, offset: 0 }
    ipc.ops
      .list(args)
      .then((res) => {
        if (!cancelled) setItems(res.items)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filter])

  const parentRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 8
  })

  const onRowClick = (item: OpsItem): (() => void) | undefined => {
    if (item.op === 'conflict_resolve') {
      const id = (item.meta as { id?: string } | undefined)?.id
      if (id) return () => navigate(`/history/conflicts?id=${id}`)
    }
    return undefined
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-2 border-b border-[color:var(--color-line)] px-4 py-2">
        {FILTER_OPS.map((op) => (
          <Button
            key={op}
            variant={filter === op ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(op)}
          >
            {t(`history.ops.filter.${op}`)}
          </Button>
        ))}
      </div>
      {loading ? (
        <div className="p-4 text-sm text-muted-foreground">…</div>
      ) : items.length === 0 ? (
        <EmptyState text={t('history.ops.empty')} />
      ) : (
        <div ref={parentRef} className="flex-1 overflow-auto">
          <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((vi) => {
              const item = items[vi.index]
              const onClick = onRowClick(item)
              return (
                <div
                  key={item.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${vi.start}px)`
                  }}
                >
                  <OpsRow item={item} onClick={onClick} />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Run, confirm pass**

```bash
npx vitest run src/components/history/OpsTab.test.tsx
```
Expected: 4 PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/history/OpsTab.tsx src/components/history/OpsTab.test.tsx src/components/history/OpsRow.tsx src/i18n/locales/zh-CN.json
git commit -m "feat(history): OpsTab with filter chips + click-through to conflicts (phase-10 5.5)"
```

---

<!-- openspec-task: 5.6 -->
### Task 29: empty states polish

`EmptyState.tsx` was created as a stub in Task 26. This task expands it with optional sub-text and an icon slot, and verifies all three tabs render the right copy when their data sources are empty.

**Files:**
- Modify: `src/components/history/EmptyState.tsx`
- Create: `src/components/history/EmptyState.test.tsx`

- [ ] **Step 1: Replace EmptyState**

```tsx
import type { JSX, ReactNode } from 'react'

export function EmptyState({
  text,
  subText,
  icon
}: {
  text: string
  subText?: string
  icon?: ReactNode
}): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      {icon ?? null}
      <div className="text-sm font-medium text-foreground">{text}</div>
      {subText ? <div className="text-xs text-muted-foreground">{subText}</div> : null}
    </div>
  )
}
```

- [ ] **Step 2: Test**

Create `src/components/history/EmptyState.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState } from './EmptyState'

describe('EmptyState (phase-10 5.6)', () => {
  it('renders text', () => {
    render(<EmptyState text="hello" />)
    expect(screen.getByText('hello')).toBeInTheDocument()
  })
  it('renders subText when provided', () => {
    render(<EmptyState text="t" subText="sub" />)
    expect(screen.getByText('sub')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run, commit**

```bash
npx vitest run src/components/history/EmptyState.test.tsx
```
Expected: 2 PASS.

```bash
npx vitest run src/components/history/TrashTab.test.tsx src/components/history/ConflictsTab.test.tsx src/components/history/OpsTab.test.tsx
```
Expected: empty-state assertions in all three still PASS.

```bash
git add src/components/history/EmptyState.tsx src/components/history/EmptyState.test.tsx
git commit -m "feat(history): EmptyState with optional subText/icon (phase-10 5.6)"
```

---

<!-- openspec-task: 5.7 -->
### Task 30: TitleBar shows "历史" on `/history/*`

Phase 10 says the title bar reads "历史" while on this route. We expose a Zustand `title` slot (created in Task 25 as `src/stores/title.ts`) and have `TitleBar.tsx` read from it.

**Files:**
- Modify: `src/components/TitleBar.tsx`
- Modify: `src/i18n/locales/zh-CN.json` (add `history.title` if not already present)

- [ ] **Step 1: Add the i18n key (if missing)**

Inside `src/i18n/locales/zh-CN.json`, ensure under `history`:
```json
"title": "历史",
```

- [ ] **Step 2: Replace TitleBar**

Edit `src/components/TitleBar.tsx`:

```tsx
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { GroveSwitcher } from './GroveSwitcher'
import { useTitleStore } from '@/stores/title'

export function TitleBar(): JSX.Element {
  const { t } = useTranslation()
  const override = useTitleStore((s) => s.title)
  const display = override ?? t('app.title')
  return (
    <header
      className="flex h-10 shrink-0 items-center justify-between border-b border-[color:var(--color-line)] px-3"
      data-testid="titlebar"
    >
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[color:var(--color-ink-3)]">
        {display}
      </div>
      <GroveSwitcher />
    </header>
  )
}
```

- [ ] **Step 3: Smoke test**

Append to (or create) `src/components/TitleBar.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TitleBar } from './TitleBar'
import { useTitleStore } from '@/stores/title'

describe('TitleBar (phase-10 5.7)', () => {
  beforeEach(() => {
    useTitleStore.setState({ title: null })
  })
  it('shows app title by default', () => {
    render(<TitleBar />)
    expect(screen.getByTestId('titlebar')).toBeInTheDocument()
  })
  it('shows the override when set', () => {
    useTitleStore.setState({ title: '历史' })
    render(<TitleBar />)
    expect(screen.getByText('历史')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run, commit**

```bash
npx vitest run src/components/TitleBar.test.tsx
```
Expected: 2 PASS.

```bash
git add src/components/TitleBar.tsx src/components/TitleBar.test.tsx src/i18n/locales/zh-CN.json
git commit -m "feat(titlebar): per-route title override; '历史' on /history/* (phase-10 5.7)"
```

---

<!-- openspec-task: 6.1 -->
### Task 31: `ConflictDetailPanel.tsx` — header + view toggle + diff body + bottom actions; `DiffView.tsx`

This task builds the full layout. Tasks 32–34 then refine specific behaviours (toggle re-fetch, system-FM open, delete with confirm).

**Files:**
- Modify: `src/components/history/ConflictDetailPanel.tsx` (replace stub)
- Create: `src/components/history/ConflictDetailPanel.test.tsx`
- Create: `src/components/history/DiffView.tsx`
- Create: `src/components/history/DiffView.test.tsx`
- Modify: `src/i18n/locales/zh-CN.json` (add `diff.view.*`, `diff.equal`, `history.conflicts.detail.*` keys)

- [ ] **Step 1: Add i18n keys**

Inside `src/i18n/locales/zh-CN.json` at top level (sibling of `history`):

```json
"diff": {
  "view": {
    "local_remote": "local ↔ remote",
    "local_base": "local ↔ base",
    "remote_base": "remote ↔ base"
  },
  "equal": "两份内容完全一致"
},
```

Inside `history.conflicts`:
```json
"detail": {
  "openLocal": "在系统文件管理器中打开 local.md",
  "openRemote": "在系统文件管理器中打开 remote.md",
  "openBase": "在系统文件管理器中打开 base.md",
  "delete": "删除此快照",
  "deleteConfirmTitle": "删除此快照？",
  "deleteConfirmBody": "此操作不可撤销。",
  "deleteConfirmOk": "确认删除",
  "winnerPath": "另存为：{{path}}"
},
```

- [ ] **Step 2: Build `DiffView`**

Create `src/components/history/DiffView.tsx`:

```tsx
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

export interface DiffSideLine {
  num: number
  text: string
  kind: 'equal' | 'del' | 'add'
}

export interface DiffSide {
  label: string
  lines: DiffSideLine[]
}

export interface DiffViewProps {
  left: DiffSide
  right: DiffSide
  /** When true (e.g. left and right are byte-equal), render an "equal" placeholder. */
  identical?: boolean
}

function lineClass(kind: DiffSideLine['kind']): string {
  switch (kind) {
    case 'del':
      return 'bg-red-500/10 text-red-700 dark:text-red-300'
    case 'add':
      return 'bg-green-500/10 text-green-700 dark:text-green-300'
    default:
      return ''
  }
}

function Column({ side }: { side: DiffSide }): JSX.Element {
  return (
    <div className="flex-1 overflow-auto font-mono text-[12px]">
      <div className="sticky top-0 border-b border-[color:var(--color-line)] bg-background px-3 py-1 text-xs font-medium">
        {side.label}
      </div>
      <table className="w-full border-collapse">
        <tbody>
          {side.lines.map((ln, i) => (
            <tr key={i} className={lineClass(ln.kind)}>
              <td
                className="select-none border-r border-[color:var(--color-line)] px-2 text-right text-muted-foreground"
                style={{ width: '3.5rem' }}
              >
                {ln.num || ''}
              </td>
              <td className="whitespace-pre-wrap break-all px-2">{ln.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function DiffView({ left, right, identical }: DiffViewProps): JSX.Element {
  const { t } = useTranslation()
  if (identical) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        {t('diff.equal')}
      </div>
    )
  }
  return (
    <div className="flex h-full">
      <Column side={left} />
      <div className="w-px bg-[color:var(--color-line)]" />
      <Column side={right} />
    </div>
  )
}
```

- [ ] **Step 3: DiffView tests**

Create `src/components/history/DiffView.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DiffView } from './DiffView'

describe('DiffView (phase-10 6.2)', () => {
  it('renders two column labels', () => {
    render(
      <DiffView
        left={{ label: 'L', lines: [{ num: 1, text: 'a', kind: 'equal' }] }}
        right={{ label: 'R', lines: [{ num: 1, text: 'a', kind: 'equal' }] }}
      />
    )
    expect(screen.getByText('L')).toBeInTheDocument()
    expect(screen.getByText('R')).toBeInTheDocument()
  })
  it('shows identical placeholder', () => {
    render(
      <DiffView
        identical
        left={{ label: 'L', lines: [] }}
        right={{ label: 'R', lines: [] }}
      />
    )
    expect(screen.getByText('两份内容完全一致')).toBeInTheDocument()
  })
  it('applies kind classes', () => {
    const { container } = render(
      <DiffView
        left={{ label: 'L', lines: [{ num: 1, text: 'x', kind: 'del' }] }}
        right={{ label: 'R', lines: [{ num: 1, text: 'y', kind: 'add' }] }}
      />
    )
    expect(container.querySelector('.bg-red-500\\/10')).toBeTruthy()
    expect(container.querySelector('.bg-green-500\\/10')).toBeTruthy()
  })
})
```

- [ ] **Step 4: Build `ConflictDetailPanel`**

Replace `src/components/history/ConflictDetailPanel.tsx`:

```tsx
import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { ipc } from '@/ipc/client'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { DiffView, type DiffSide } from './DiffView'
import type { ConflictMeta } from '@shared/conflict-types'

type Sides = 'local-remote' | 'local-base' | 'remote-base'

interface DiffResult {
  left: DiffSide
  right: DiffSide
  stats: { added: number; removed: number }
}

export function ConflictDetailPanel({
  id,
  onDeleted
}: {
  id: string | null
  onDeleted?: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [sides, setSides] = useState<Sides>('local-remote')
  const [meta, setMeta] = useState<ConflictMeta | null>(null)
  const [diff, setDiff] = useState<DiffResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [missing, setMissing] = useState(false)

  // Reset side when id changes
  useEffect(() => {
    setSides('local-remote')
    setMissing(false)
  }, [id])

  // Fetch meta on id change
  useEffect(() => {
    if (!id) {
      setMeta(null)
      setDiff(null)
      return
    }
    let cancelled = false
    ipc.conflict
      .read(id)
      .then((r) => {
        if (!cancelled) setMeta(r.meta)
      })
      .catch(() => {
        if (!cancelled) {
          setMeta(null)
          setMissing(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [id])

  // Fetch diff on (id, sides) change
  useEffect(() => {
    if (!id) {
      setDiff(null)
      return
    }
    let cancelled = false
    setLoading(true)
    ipc.conflict
      .diff(id, sides)
      .then((r) => {
        if (!cancelled) setDiff(r as DiffResult)
      })
      .catch(() => {
        if (!cancelled) setDiff(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, sides])

  if (!id) {
    return <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">—</div>
  }
  if (missing) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        快照已被删除
      </div>
    )
  }

  const onOpenSide = (side: 'local' | 'remote' | 'base'): void => {
    void ipc.conflict.openSnapshotFile(id, side)
  }

  const onDelete = async (): Promise<void> => {
    await ipc.conflict.delete(id)
    onDeleted?.()
  }

  const identical =
    !!diff && diff.stats.added === 0 && diff.stats.removed === 0

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="flex flex-col gap-1 border-b border-[color:var(--color-line)] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="truncate text-sm font-medium">{meta?.path}</div>
          <span className="rounded bg-muted px-1 py-px font-mono text-[10px]">
            {meta?.resolved_by}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          {meta?.ts ? formatDistanceToNow(new Date(meta.ts), { addSuffix: true, locale: zhCN }) : ''}
        </div>
        {meta?.winner_path ? (
          <div className="text-xs text-muted-foreground">
            {t('history.conflicts.detail.winnerPath', { path: meta.winner_path })}
          </div>
        ) : null}
      </div>

      {/* view-toggle */}
      <div className="flex gap-1 border-b border-[color:var(--color-line)] px-4 py-2">
        {(['local-remote', 'local-base', 'remote-base'] as const).map((s) => (
          <Button
            key={s}
            variant={sides === s ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSides(s)}
          >
            {t(`diff.view.${s.replace('-', '_')}`)}
          </Button>
        ))}
      </div>

      {/* diff body */}
      <div className="flex-1 overflow-hidden">
        {loading || !diff ? (
          <div className="p-4 text-sm text-muted-foreground">…</div>
        ) : (
          <DiffView left={diff.left} right={diff.right} identical={identical} />
        )}
      </div>

      {/* bottom actions */}
      <div className="flex flex-wrap gap-2 border-t border-[color:var(--color-line)] px-4 py-2">
        <Button variant="outline" size="sm" onClick={() => onOpenSide('local')}>
          {t('history.conflicts.detail.openLocal')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => onOpenSide('remote')}>
          {t('history.conflicts.detail.openRemote')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => onOpenSide('base')}>
          {t('history.conflicts.detail.openBase')}
        </Button>
        <div className="flex-1" />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              {t('history.conflicts.detail.delete')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('history.conflicts.detail.deleteConfirmTitle')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('history.conflicts.detail.deleteConfirmBody')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('history.conflicts.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>
                {t('history.conflicts.detail.deleteConfirmOk')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Tests for ConflictDetailPanel structure (6.1)**

Create `src/components/history/ConflictDetailPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ConflictDetailPanel } from './ConflictDetailPanel'

const mockRead = vi.fn()
const mockDiff = vi.fn()
const mockDelete = vi.fn()
const mockOpenFile = vi.fn()
vi.mock('@/ipc/client', () => ({
  ipc: {
    conflict: {
      read: (...a: unknown[]) => mockRead(...a),
      diff: (...a: unknown[]) => mockDiff(...a),
      delete: (...a: unknown[]) => mockDelete(...a),
      openSnapshotFile: (...a: unknown[]) => mockOpenFile(...a)
    }
  }
}))

beforeEach(() => {
  mockRead.mockReset()
  mockDiff.mockReset()
  mockDelete.mockReset()
  mockOpenFile.mockReset()
})

const META = {
  path: 'a.md',
  ts: '2026-04-25T10:00:00Z',
  resolved_by: 'keep_local' as const
}
const DIFF = {
  left: { label: 'local', lines: [{ num: 1, text: 'a', kind: 'equal' as const }] },
  right: { label: 'remote', lines: [{ num: 1, text: 'b', kind: 'add' as const }] },
  stats: { added: 1, removed: 0 }
}

describe('ConflictDetailPanel (phase-10 6.1)', () => {
  it('renders header / 3 toggles / diff / 4 bottom buttons', async () => {
    mockRead.mockResolvedValueOnce({ meta: META, localText: '', remoteText: '', baseText: '' })
    mockDiff.mockResolvedValueOnce(DIFF)
    render(<ConflictDetailPanel id="cid-1" />)
    await screen.findByText('a.md')
    expect(screen.getByText('keep_local')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /local ↔ remote/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /local ↔ base/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remote ↔ base/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /local\.md/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remote\.md/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /base\.md/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /删除此快照/ })).toBeInTheDocument()
  })

  it('shows "快照已被删除" when read fails', async () => {
    mockRead.mockRejectedValueOnce(new Error('gone'))
    render(<ConflictDetailPanel id="missing" />)
    await waitFor(() => expect(screen.getByText('快照已被删除')).toBeInTheDocument())
  })

  it('renders nothing when id is null', () => {
    render(<ConflictDetailPanel id={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run, commit**

```bash
npx vitest run src/components/history/DiffView.test.tsx src/components/history/ConflictDetailPanel.test.tsx
```
Expected: 3 + 3 PASS.

```bash
git add src/components/history/DiffView.tsx src/components/history/DiffView.test.tsx src/components/history/ConflictDetailPanel.tsx src/components/history/ConflictDetailPanel.test.tsx src/i18n/locales/zh-CN.json
git commit -m "feat(history): ConflictDetailPanel + DiffView side-by-side (phase-10 6.1, 6.2)"
```

This commit covers both 6.1 (header/toggle/diff/actions) and 6.2 (DiffView two columns + line numbers + coloring).

---

<!-- openspec-task: 6.2 -->
### Task 31b: confirm 6.2 coverage

`DiffView` was created in Task 31. Spec 6.2 requires:
- side-by-side double column → `<DiffView>` renders two `<Column>` flex children with a 1px divider. ✓
- line numbers + coloring (equal/del/add) → table rows include `td` line-number gutter; row class derived from `kind`. ✓

This task has no new code — it is a verification checkpoint. No commit required if Task 31 already passes.

- [ ] **Step 1: Re-run DiffView tests**

```bash
npx vitest run src/components/history/DiffView.test.tsx
```
Expected: 3 PASS. (kind classes asserted, two labels asserted, identical placeholder asserted.)

---

<!-- openspec-task: 6.3 -->
### Task 32: re-fetch `conflict.diff(id, sides)` on toggle change

Task 31 already wired `useEffect([id, sides], ...)` to call `ipc.conflict.diff`. This task adds an explicit assertion that toggle clicks change the IPC arg.

**Files:**
- Modify: `src/components/history/ConflictDetailPanel.test.tsx`

- [ ] **Step 1: Append a behavioural test**

```tsx
import userEvent from '@testing-library/user-event'

describe('ConflictDetailPanel toggle re-fetch (phase-10 6.3)', () => {
  it('clicking local↔base re-calls conflict.diff with sides=local-base', async () => {
    mockRead.mockResolvedValueOnce({ meta: META, localText: '', remoteText: '', baseText: '' })
    mockDiff
      .mockResolvedValueOnce(DIFF) // initial local-remote
      .mockResolvedValueOnce(DIFF) // after toggle
    const user = userEvent.setup()
    render(<ConflictDetailPanel id="cid-1" />)
    await screen.findByText('a.md')
    await user.click(screen.getByRole('button', { name: /local ↔ base/ }))
    await waitFor(() => {
      const calls = mockDiff.mock.calls.map((c) => c[1])
      expect(calls).toContain('local-base')
    })
  })

  it('initial sides is local-remote', async () => {
    mockRead.mockResolvedValueOnce({ meta: META, localText: '', remoteText: '', baseText: '' })
    mockDiff.mockResolvedValueOnce(DIFF)
    render(<ConflictDetailPanel id="cid-1" />)
    await screen.findByText('a.md')
    await waitFor(() => {
      expect(mockDiff).toHaveBeenCalledWith('cid-1', 'local-remote')
    })
  })
})
```

- [ ] **Step 2: Run, commit**

```bash
npx vitest run src/components/history/ConflictDetailPanel.test.tsx -t "phase-10 6.3"
```
Expected: 2 PASS.

```bash
git add src/components/history/ConflictDetailPanel.test.tsx
git commit -m "test(history): toggle re-calls conflict.diff with new sides (phase-10 6.3)"
```

---

<!-- openspec-task: 6.4 -->
### Task 33: "在系统文件管理器中打开 local/remote/base" wired to `conflict.openSnapshotFile`

Task 31 already wires the three buttons through to `ipc.conflict.openSnapshotFile(id, side)`. This task adds the behavioural assertions.

**Files:**
- Modify: `src/components/history/ConflictDetailPanel.test.tsx`

- [ ] **Step 1: Append tests**

```tsx
describe('ConflictDetailPanel openSnapshotFile (phase-10 6.4)', () => {
  it('clicking local.md button calls openSnapshotFile(id, "local")', async () => {
    mockRead.mockResolvedValueOnce({ meta: META, localText: '', remoteText: '', baseText: '' })
    mockDiff.mockResolvedValueOnce(DIFF)
    mockOpenFile.mockResolvedValueOnce({ ok: true })
    const user = userEvent.setup()
    render(<ConflictDetailPanel id="cid-1" />)
    await screen.findByText('a.md')
    await user.click(screen.getByRole('button', { name: /local\.md/ }))
    expect(mockOpenFile).toHaveBeenCalledWith('cid-1', 'local')
  })

  it('clicking remote.md → side="remote"', async () => {
    mockRead.mockResolvedValueOnce({ meta: META, localText: '', remoteText: '', baseText: '' })
    mockDiff.mockResolvedValueOnce(DIFF)
    mockOpenFile.mockResolvedValueOnce({ ok: true })
    const user = userEvent.setup()
    render(<ConflictDetailPanel id="cid-1" />)
    await screen.findByText('a.md')
    await user.click(screen.getByRole('button', { name: /remote\.md/ }))
    expect(mockOpenFile).toHaveBeenCalledWith('cid-1', 'remote')
  })

  it('clicking base.md → side="base"', async () => {
    mockRead.mockResolvedValueOnce({ meta: META, localText: '', remoteText: '', baseText: '' })
    mockDiff.mockResolvedValueOnce(DIFF)
    mockOpenFile.mockResolvedValueOnce({ ok: true })
    const user = userEvent.setup()
    render(<ConflictDetailPanel id="cid-1" />)
    await screen.findByText('a.md')
    await user.click(screen.getByRole('button', { name: /base\.md/ }))
    expect(mockOpenFile).toHaveBeenCalledWith('cid-1', 'base')
  })
})
```

- [ ] **Step 2: Run, commit**

```bash
npx vitest run src/components/history/ConflictDetailPanel.test.tsx -t "phase-10 6.4"
```
Expected: 3 PASS.

```bash
git add src/components/history/ConflictDetailPanel.test.tsx
git commit -m "test(history): three open-in-FM buttons call conflict.openSnapshotFile (phase-10 6.4)"
```

---

<!-- openspec-task: 6.5 -->
### Task 34: "删除此快照" + secondary confirm → `conflict.delete(id)` → close detail / refresh list

Task 31 wired the delete button to an `AlertDialog` with confirm. This task adds the behavioural assertions and verifies that `onDeleted` is invoked (so the parent `ConflictsTab` can refresh).

**Files:**
- Modify: `src/components/history/ConflictDetailPanel.test.tsx`

- [ ] **Step 1: Append tests**

```tsx
describe('ConflictDetailPanel delete (phase-10 6.5)', () => {
  it('clicking 删除此快照 → 确认删除 → calls conflict.delete + onDeleted', async () => {
    mockRead.mockResolvedValueOnce({ meta: META, localText: '', remoteText: '', baseText: '' })
    mockDiff.mockResolvedValueOnce(DIFF)
    mockDelete.mockResolvedValueOnce({ ok: true })
    const onDeleted = vi.fn()
    const user = userEvent.setup()
    render(<ConflictDetailPanel id="cid-1" onDeleted={onDeleted} />)
    await screen.findByText('a.md')
    await user.click(screen.getByRole('button', { name: /删除此快照/ }))
    await user.click(screen.getByRole('button', { name: /确认删除/ }))
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('cid-1'))
    expect(onDeleted).toHaveBeenCalled()
  })

  it('cancelling the confirm leaves snapshot intact', async () => {
    mockRead.mockResolvedValueOnce({ meta: META, localText: '', remoteText: '', baseText: '' })
    mockDiff.mockResolvedValueOnce(DIFF)
    const onDeleted = vi.fn()
    const user = userEvent.setup()
    render(<ConflictDetailPanel id="cid-1" onDeleted={onDeleted} />)
    await screen.findByText('a.md')
    await user.click(screen.getByRole('button', { name: /删除此快照/ }))
    await user.click(screen.getByRole('button', { name: /^取消$/ }))
    expect(mockDelete).not.toHaveBeenCalled()
    expect(onDeleted).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run, integrate, commit**

```bash
npx vitest run src/components/history/ConflictDetailPanel.test.tsx
```
Expected: all PASS (Task 31 + 32 + 33 + 34 specs combined).

Then run the entire history test surface to be sure:

```bash
npx vitest run src/components/history/ src/App.history.test.tsx src/components/TitleBar.test.tsx
```
Expected: all PASS.

Finally, the full suite:

```bash
npm test
```
Expected: all PASS. (If a phase-7 / phase-9 test broke, debug — this plan should not have touched any of those files except via additive imports.)

```bash
git add src/components/history/ConflictDetailPanel.test.tsx
git commit -m "test(history): delete snapshot with confirm; refreshes parent list (phase-10 6.5)"
```

---

## Self-Review

After all tasks pass:

1. **Spec coverage:** This plan covers labels 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 6.4, 6.5 — 12 unique labels. Verify:

   ```bash
   grep -E "openspec-task: (5\.[1-7]|6\.[1-5])" /Users/aaa/develop/workspace-ai/acornvo/docs/superpowers/plans/2026-04-30-phase-10-history-and-trash-tasks-5.1-6.5.md | sort -u
   ```
   Expected: 12 unique labels. (Tasks 22, 23, 31b are technical preflight / verification checkpoints and are intentionally not in the OpenSpec list — they have non-numeric labels prefixed `pre-` or `6.2` reused as a checkpoint.)

2. **Three tabs render and respond to URL changes.** `HistoryLayout` reads `tab` from props (which itself comes from `useParams` in `History.tsx`) and on `Tabs.onValueChange` calls `navigate('/history/<v>')`. `MemoryRouter`-backed test asserts both directions.

3. **Deep link `?id=<cid>` selects the right conflict.** `ConflictsTab` reads `useSearchParams().get('id')` and prefers it; falls back to `items[0].id`. Test "honors ?id= deep link" validates.

4. **DiffView is purely presentational.** It accepts `{left, right, identical}` and renders. No imports of `diff` (jsdiff) — verified by absence in `DiffView.tsx`. The structured `DiffResult` is built main-side by `conflict.diff` (Plan 2).

5. **"打开系统文件管理器" wired to existing or newly-added IPC.** Two new IPCs added in Task 23:
   - `file.openContainingDir(rel)` for Trash tab "打开原目录"
   - `conflict.openSnapshotFile(id, side)` for ConflictDetailPanel three buttons.

6. **Empty states polished.** `EmptyState.tsx` is shared by all three tabs (Tasks 26, 27, 28) and confirmed to render the right copy in the empty-state test of each tab plus the dedicated `EmptyState.test.tsx`.

7. **TitleBar shows "历史" only on `/history/*`.** `HistoryLayout`'s `useEffect` sets the override on mount and clears it on unmount (returned cleanup). `TitleBar` reads `useTitleStore`. Outside `/history/*` the store stays `null` so the default `t('app.title')` is used.

8. **No placeholders:** every step has either runnable code, a runnable command, or a commit message.

9. **No renderer-side jsdiff import:** verified by grepping after final task — search for `from 'diff'` in `src/`:
   ```bash
   ! grep -rn "from 'diff'" /Users/aaa/develop/workspace-ai/acornvo/src/
   ```
   Expected: command succeeds with no matches → exit 0.
