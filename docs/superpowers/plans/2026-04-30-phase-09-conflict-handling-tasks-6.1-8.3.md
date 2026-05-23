# Phase 09 Conflict Handling — Plan 3 (Tasks 6.1–8.3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the renderer UI: ExternalModifiedBanner (yellow strip with reload/ignore), ConflictDialog (modal with 三选项 + meta + 稍后处理 + 查看差异 link), and the i18n keys both components consume. By plan end the user can resolve a conflict end-to-end with the snapshots correctly recorded under `.acornvo/conflicts/`.

**Architecture:** Two new components in `src/components/editor/`. The store actions they invoke (`reloadFromDisk`, `keepLocal`, `loadRemote`, `saveAsCopy`, `dismissDialog`) live on the editor store as new methods. Snapshot writing happens via a new IPC method `conflict.writeSnapshot` (added in this plan to keep renderer code synchronous-feeling) — alternatively we can call it inline from each store action via the existing `conflict.list/read/delete` namespace. Decision: extend the namespace with `write` so the renderer doesn't have to assemble path/meta itself.

**Tech Stack:** React 19, Radix `@radix-ui/react-dialog` (already installed), `react-i18next` (already installed), Zustand, Tailwind. Tests use `@testing-library/react` + jsdom (configured by phase 7).

---

## Pre-flight

Plans 1 + 2 must be merged. Phase 7's editor scaffold (Editor page, EditorBody, TitleBar) must exist. Verify:

```bash
test -f /Users/aaa/develop/workspace-ai/acornvo/src/stores/editor.ts && \
  grep -q "conflictState" /Users/aaa/develop/workspace-ai/acornvo/src/stores/editor.ts && echo "plan-2 OK"
test -d /Users/aaa/develop/workspace-ai/acornvo/src/components/editor && echo "phase-7 OK"
```

## File Structure

| Path                                                    | Action                                               | Owner task                   |
| ------------------------------------------------------- | ---------------------------------------------------- | ---------------------------- |
| `shared/ipc-contract.ts`                                | Modify (add `conflict.writeSnapshot` request method) | 6.2                          |
| `electron/ipc/conflicts.ts`                             | Modify (`writeSnapshot` handler)                     | 6.2                          |
| `preload/preload.ts`                                    | Modify (forward)                                     | 6.2                          |
| `src/i18n/locales/zh-CN.json`                           | Modify (`conflict.*` keys)                           | 8.1, 8.2, 8.3                |
| `src/components/editor/ExternalModifiedBanner.tsx`      | Create                                               | 6.1, 6.2, 6.3                |
| `src/components/editor/ExternalModifiedBanner.test.tsx` | Create                                               | 6.1, 6.2, 6.3                |
| `src/components/editor/ConflictDialog.tsx`              | Create                                               | 7.1, 7.2, 7.3, 7.4, 7.5      |
| `src/components/editor/ConflictDialog.test.tsx`         | Create                                               | 7.1, 7.2, 7.3, 7.4, 7.5      |
| `src/stores/editor.ts`                                  | Modify (5 new actions)                               | 6.2, 6.3, 7.2, 7.3, 7.4, 7.5 |
| `src/stores/editor.test.ts`                             | Modify                                               | 6.2, 6.3, 7.2, 7.3, 7.4, 7.5 |
| `src/pages/Editor.tsx`                                  | Modify (mount banner + dialog above editor body)     | 6.1, 7.1                     |

## Conventions reused

- Banner uses Tailwind `bg-yellow-50 border-yellow-300 text-yellow-900` for the visual.
- ConflictDialog uses `<Dialog>` from `@/components/ui/dialog` (Radix wrapper, already exists).
- All button labels go through `t('conflict.*')`. No hard-coded strings.
- Store actions:
  - `reloadFromDisk()` — used by banner "重载" and dialog "重载磁盘"
  - `keepLocal()` — dialog "保留本地"; calls `file.write` with `force: true`
  - `saveAsCopy()` — dialog "另存副本"; computes new path, writes, navigates
  - `dismissDialog()` — dialog "稍后处理"; flips `saveConflict` → `externalModified`
  - `ignoreExternalChange()` — banner "忽略"; `externalModified` → `none`, dirty preserved

---

<!-- openspec-task: 6.1 -->

### Task 22: `ExternalModifiedBanner` skeleton + visibility wiring

**Files:**

- Create: `src/components/editor/ExternalModifiedBanner.tsx`
- Create: `src/components/editor/ExternalModifiedBanner.test.tsx`
- Modify: `src/pages/Editor.tsx` (mount banner)

- [ ] **Step 1: Write failing visibility tests**

Create `src/components/editor/ExternalModifiedBanner.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ExternalModifiedBanner } from './ExternalModifiedBanner'
import { useEditorStore } from '@/stores/editor'
import '@testing-library/jest-dom/vitest'

beforeEach(() => {
  // reset store before each test (project-specific helper or manual reset)
  useEditorStore.setState({ kind: 'idle' } as any)
})

describe('ExternalModifiedBanner visibility', () => {
  it('hidden when conflictState.kind = none', () => {
    useEditorStore.setState({
      kind: 'ready',
      path: 'a.md',
      body: '',
      savedBody: '',
      frontmatter: {},
      savedFrontmatter: {},
      savedMtimeMs: 1,
      baseBody: '',
      baseFrontmatter: {},
      baseMtimeMs: 1,
      saving: false,
      conflictState: { kind: 'none' }
    } as any)
    render(<ExternalModifiedBanner />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('visible when conflictState.kind = externalModified', () => {
    useEditorStore.setState({
      kind: 'ready',
      path: 'a.md',
      body: 'x',
      savedBody: '',
      frontmatter: {},
      savedFrontmatter: {},
      savedMtimeMs: 1,
      baseBody: '',
      baseFrontmatter: {},
      baseMtimeMs: 1,
      saving: false,
      conflictState: { kind: 'externalModified', remoteMtimeMs: 999 }
    } as any)
    render(<ExternalModifiedBanner />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('hidden when conflictState.kind = saveConflict (dialog takes over)', () => {
    useEditorStore.setState({
      kind: 'ready',
      path: 'a.md',
      body: 'x',
      savedBody: '',
      frontmatter: {},
      savedFrontmatter: {},
      savedMtimeMs: 1,
      baseBody: '',
      baseFrontmatter: {},
      baseMtimeMs: 1,
      saving: false,
      conflictState: {
        kind: 'saveConflict',
        remoteMtimeMs: 999,
        remoteBody: '',
        remoteFrontmatter: {}
      }
    } as any)
    render(<ExternalModifiedBanner />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
```

- [ ] **Step 2: Add a stub that fails the tests**

Create `src/components/editor/ExternalModifiedBanner.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '@/stores/editor'

export function ExternalModifiedBanner(): React.JSX.Element | null {
  const { t } = useTranslation()
  const conflictState = useEditorStore((s) =>
    s.kind === 'ready' ? s.conflictState : { kind: 'none' as const }
  )
  if (conflictState.kind !== 'externalModified') return null
  return (
    <div
      role="alert"
      className="border-l-4 border-yellow-300 bg-yellow-50 px-4 py-2 text-yellow-900 flex items-center justify-between gap-4"
    >
      <span>{t('conflict.banner.external_modified')}</span>
      <div className="flex gap-2">
        <button data-testid="banner-reload" className="text-sm underline">
          {t('conflict.banner.reload')}
        </button>
        <button data-testid="banner-ignore" className="text-sm underline">
          {t('conflict.banner.ignore')}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Mount in Editor page**

Edit `src/pages/Editor.tsx`. Above the body/textarea, render the banner:

```tsx
import { ExternalModifiedBanner } from '@/components/editor/ExternalModifiedBanner'
// ...
return (
  <div className="flex flex-col h-full">
    <TitleBar />
    <ExternalModifiedBanner />
    <ConflictDialog /> {/* added in Task 26 */}
    <EditorBody />
  </div>
)
```

(The `ConflictDialog` import causes a TypeScript error until Task 26. Either comment-out the import for now, or stub the component. Cleanest: add a stub `ConflictDialog.tsx` that returns `null`, replaced in Task 26.)

- [ ] **Step 4: Run, confirm pass (visibility only)**

```bash
npx vitest run src/components/editor/ExternalModifiedBanner.test.tsx -t "visibility"
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/ExternalModifiedBanner.tsx \
  src/components/editor/ExternalModifiedBanner.test.tsx \
  src/pages/Editor.tsx
git commit -m "feat(editor): ExternalModifiedBanner shows when conflictState=externalModified (phase-09 6.1)"
```

---

<!-- openspec-task: 6.2 -->

### Task 23: banner "重载" → snapshot + reload (with `conflict.writeSnapshot` IPC)

**Files:**

- Modify: `shared/ipc-contract.ts` (add `conflict.writeSnapshot`)
- Modify: `electron/ipc/conflicts.ts`
- Modify: `preload/preload.ts`
- Modify: `src/stores/editor.ts` (add `reloadFromDisk()` action)
- Modify: `src/components/editor/ExternalModifiedBanner.tsx` (wire button)
- Modify: `src/components/editor/ExternalModifiedBanner.test.tsx`

- [ ] **Step 1: Extend IPC contract**

Edit `shared/ipc-contract.ts`. In the `conflict` namespace block (added in Plan 2):

```ts
import type { ConflictResolvedBy } from './conflict-types'

  conflict: {
    list: (opts?: { limit?: number; offset?: number }) => ConflictListResult
    read: (id: string) => ConflictReadResult
    delete: (id: string) => { ok: true }
    writeSnapshot: (input: {
      path: string
      baseText: string
      localText: string
      remoteText: string
      resolvedBy: ConflictResolvedBy
      winnerPath?: string
    }) => { id: string }
  }
```

- [ ] **Step 2: Implement handler**

Edit `electron/ipc/conflicts.ts`. Add to `conflictHandlers`:

```ts
import { writeSnapshot as storeWriteSnapshot } from '../services/conflicts/store'
import type { ConflictResolvedBy } from '@shared/conflict-types'

  async writeSnapshot(input: {
    path: string
    baseText: string
    localText: string
    remoteText: string
    resolvedBy: ConflictResolvedBy
    winnerPath?: string
  }): Promise<{ id: string }> {
    if (!input?.path) throw new IpcError('E_INVALID_ARGS', 'path required')
    if (!['keep_local', 'load_remote', 'load_remote_banner', 'save_as'].includes(input.resolvedBy)) {
      throw new IpcError('E_INVALID_ARGS', `invalid resolvedBy: ${input.resolvedBy}`)
    }
    return storeWriteSnapshot(input)
  }
```

- [ ] **Step 3: Wire preload**

Edit `preload/preload.ts`. In the `conflict` block:

```ts
  conflict: {
    list: (opts) => invoke('conflict.list', opts),
    read: (id) => invoke('conflict.read', id),
    delete: (id) => invoke('conflict.delete', id),
    writeSnapshot: (input) => invoke('conflict.writeSnapshot', input)
  }
```

- [ ] **Step 4: Write failing store-action test**

Append to `src/stores/editor.test.ts`:

```ts
import { stringify as fmStringify } from '@shared/frontmatter-codec' // or wherever stringify lives in this codebase

describe('editor.reloadFromDisk (phase-09 6.2)', () => {
  it('writes snapshot resolved_by=load_remote_banner then reloads body+savedBody', async () => {
    mockIpc.files.get
      .mockResolvedValueOnce({
        summary: { path: 'a.md', mtimeMs: 1 },
        frontmatter: { title: 'old' },
        body: 'OLD'
      })
      .mockResolvedValueOnce({
        summary: { path: 'a.md', mtimeMs: 999 },
        frontmatter: { title: 'remote' },
        body: 'REMOTE'
      })
    await useEditorStore.getState().open('a.md')
    useEditorStore.getState().setBody('LOCAL')
    useEditorStore.setState((cur) => {
      if (cur.kind !== 'ready') return cur
      return { ...cur, conflictState: { kind: 'externalModified', remoteMtimeMs: 999 } }
    })
    mockIpc.conflict.writeSnapshot.mockResolvedValueOnce({ id: 'snap-1' })

    await useEditorStore.getState().reloadFromDisk()

    expect(mockIpc.conflict.writeSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'a.md',
        resolvedBy: 'load_remote_banner'
      })
    )
    const s = useEditorStore.getState()
    if (s.kind !== 'ready') throw new Error('expected ready')
    expect(s.body).toBe('REMOTE')
    expect(s.savedBody).toBe('REMOTE')
    expect(s.savedMtimeMs).toBe(999)
    expect(s.baseBody).toBe('REMOTE')
    expect(s.conflictState).toEqual({ kind: 'none' })
  })
})
```

- [ ] **Step 5: Run, confirm failure**

```bash
npx vitest run src/stores/editor.test.ts -t "phase-09 6.2"
```

Expected: FAIL.

- [ ] **Step 6: Implement `reloadFromDisk` in editor store**

Add to `src/stores/editor.ts`:

```ts
import { stringify } from '@shared/frontmatter-codec' // confirm path; see Note below

reloadFromDisk: async (): Promise<void> => {
  const cur = get()
  if (cur.kind !== 'ready') return
  const isBanner = cur.conflictState.kind === 'externalModified'
  const resolvedBy = isBanner ? 'load_remote_banner' : 'load_remote'
  // Snapshot first (before mutating editor state) — base/local are still authoritative
  const fresh = await ipc.files.get(cur.path)
  const localText = stringify(cur.frontmatter, cur.body)
  const remoteText = stringify(fresh.frontmatter, fresh.body)
  const baseText = stringify(cur.baseFrontmatter, cur.baseBody)
  await ipc.conflict.writeSnapshot({
    path: cur.path,
    baseText,
    localText,
    remoteText,
    resolvedBy
  })
  set({
    kind: 'ready',
    path: cur.path,
    frontmatter: fresh.frontmatter,
    body: fresh.body,
    savedFrontmatter: fresh.frontmatter,
    savedBody: fresh.body,
    savedMtimeMs: fresh.summary.mtimeMs,
    baseFrontmatter: fresh.frontmatter,
    baseBody: fresh.body,
    baseMtimeMs: fresh.summary.mtimeMs,
    saving: false,
    conflictState: { kind: 'none' }
  })
}
```

> **Note on `stringify`:** phase-04's `electron/services/frontmatter.ts` exports `stringify`. The renderer needs an equivalent — either re-export through `@shared/` or duplicate (small function). If phase-07's plan-3 already created a renderer-side `stringify`, reuse it; otherwise add `shared/frontmatter-codec.ts` with a copy of the simple YAML+body composer.

- [ ] **Step 7: Wire the banner button**

Edit `src/components/editor/ExternalModifiedBanner.tsx`. Replace the `data-testid="banner-reload"` button:

```tsx
<button
  data-testid="banner-reload"
  className="text-sm underline"
  onClick={() => useEditorStore.getState().reloadFromDisk()}
>
  {t('conflict.banner.reload')}
</button>
```

- [ ] **Step 8: Add UI test for the click flow**

Append to `src/components/editor/ExternalModifiedBanner.test.tsx`:

```tsx
import { fireEvent } from '@testing-library/react'

it('clicking 重载 invokes reloadFromDisk', async () => {
  const reloadFromDisk = vi.fn().mockResolvedValue(undefined)
  useEditorStore.setState({
    kind: 'ready',
    path: 'a.md',
    body: 'x',
    savedBody: '',
    frontmatter: {},
    savedFrontmatter: {},
    savedMtimeMs: 1,
    baseBody: '',
    baseFrontmatter: {},
    baseMtimeMs: 1,
    saving: false,
    conflictState: { kind: 'externalModified', remoteMtimeMs: 999 },
    reloadFromDisk
  } as any)
  render(<ExternalModifiedBanner />)
  fireEvent.click(screen.getByTestId('banner-reload'))
  expect(reloadFromDisk).toHaveBeenCalled()
})
```

- [ ] **Step 9: Run, confirm pass**

```bash
npx vitest run src/stores/editor.test.ts -t "phase-09 6.2"
npx vitest run src/components/editor/ExternalModifiedBanner.test.tsx
npx vitest run electron/ipc/conflicts.test.ts # verify writeSnapshot handler
```

Expected: all PASS. (Add a quick test for the new `writeSnapshot` handler in `conflicts.test.ts` if not already covered.)

- [ ] **Step 10: Commit**

```bash
git add shared/ipc-contract.ts electron/ipc/conflicts.ts \
  preload/preload.ts src/stores/editor.ts \
  src/components/editor/ExternalModifiedBanner.tsx \
  src/components/editor/ExternalModifiedBanner.test.tsx \
  src/stores/editor.test.ts
git commit -m "feat(editor): banner 重载 writes load_remote_banner snapshot then reloads (phase-09 6.2)"
```

---

<!-- openspec-task: 6.3 -->

### Task 24: banner "忽略" → conflictState=none, dirty preserved, save unlocked

**Files:**

- Modify: `src/stores/editor.ts` (add `ignoreExternalChange()`)
- Modify: `src/components/editor/ExternalModifiedBanner.tsx`
- Modify: `src/components/editor/ExternalModifiedBanner.test.tsx`
- Modify: `src/stores/editor.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/stores/editor.test.ts`:

```ts
describe('editor.ignoreExternalChange (phase-09 6.3)', () => {
  it('flips conflictState to none and preserves dirty', async () => {
    mockIpc.files.get.mockResolvedValueOnce({
      summary: { path: 'a.md', mtimeMs: 1 },
      frontmatter: {},
      body: 'B0'
    })
    await useEditorStore.getState().open('a.md')
    useEditorStore.getState().setBody('USER')
    useEditorStore.setState((cur) => {
      if (cur.kind !== 'ready') return cur
      return { ...cur, conflictState: { kind: 'externalModified', remoteMtimeMs: 9 } }
    })
    useEditorStore.getState().ignoreExternalChange()
    const s = useEditorStore.getState()
    if (s.kind !== 'ready') throw new Error('expected ready')
    expect(s.conflictState).toEqual({ kind: 'none' })
    expect(s.body).toBe('USER')
    expect(s.savedBody).toBe('B0') // dirty preserved
  })

  it('after ignore, scheduleSave is no longer locked', async () => {
    mockIpc.files.get.mockResolvedValueOnce({
      summary: { path: 'a.md', mtimeMs: 1 },
      frontmatter: {},
      body: 'B0'
    })
    mockIpc.file.write.mockResolvedValueOnce({ mtimeMs: 2, sha256: 'x' })
    await useEditorStore.getState().open('a.md')
    useEditorStore.getState().setBody('USER')
    useEditorStore.setState((cur) => {
      if (cur.kind !== 'ready') return cur
      return { ...cur, conflictState: { kind: 'externalModified', remoteMtimeMs: 9 } }
    })
    useEditorStore.getState().ignoreExternalChange()
    await useEditorStore.getState().flushSave()
    expect(mockIpc.file.write).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run src/stores/editor.test.ts -t "phase-09 6.3"
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Add to `src/stores/editor.ts`:

```ts
ignoreExternalChange: () => {
  set((cur) => {
    if (cur.kind !== 'ready') return cur
    return { ...cur, conflictState: { kind: 'none' } }
  })
}
```

- [ ] **Step 4: Wire button**

Edit `src/components/editor/ExternalModifiedBanner.tsx`. Replace the `data-testid="banner-ignore"` button:

```tsx
<button
  data-testid="banner-ignore"
  className="text-sm underline"
  onClick={() => useEditorStore.getState().ignoreExternalChange()}
>
  {t('conflict.banner.ignore')}
</button>
```

- [ ] **Step 5: Add banner UI test**

Append to `src/components/editor/ExternalModifiedBanner.test.tsx`:

```tsx
it('clicking 忽略 invokes ignoreExternalChange', () => {
  const ignoreExternalChange = vi.fn()
  useEditorStore.setState({
    kind: 'ready',
    path: 'a.md',
    body: 'x',
    savedBody: '',
    frontmatter: {},
    savedFrontmatter: {},
    savedMtimeMs: 1,
    baseBody: '',
    baseFrontmatter: {},
    baseMtimeMs: 1,
    saving: false,
    conflictState: { kind: 'externalModified', remoteMtimeMs: 999 },
    ignoreExternalChange
  } as any)
  render(<ExternalModifiedBanner />)
  fireEvent.click(screen.getByTestId('banner-ignore'))
  expect(ignoreExternalChange).toHaveBeenCalled()
})
```

- [ ] **Step 6: Run, confirm pass**

```bash
npx vitest run src/stores/editor.test.ts -t "phase-09 6.3"
npx vitest run src/components/editor/ExternalModifiedBanner.test.tsx
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/stores/editor.ts src/components/editor/ExternalModifiedBanner.tsx \
  src/components/editor/ExternalModifiedBanner.test.tsx src/stores/editor.test.ts
git commit -m "feat(editor): banner 忽略 unlocks save with dirty preserved (phase-09 6.3)"
```

---

<!-- openspec-task: 7.1 -->

### Task 25: `ConflictDialog` skeleton + visibility + meta rendering

**Files:**

- Create: `src/components/editor/ConflictDialog.tsx`
- Create: `src/components/editor/ConflictDialog.test.tsx`
- Modify: `src/pages/Editor.tsx` (already mounts the dialog from Task 22)

- [ ] **Step 1: Write visibility + meta tests**

Create `src/components/editor/ConflictDialog.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { ConflictDialog } from './ConflictDialog'
import { useEditorStore } from '@/stores/editor'
import '@testing-library/jest-dom/vitest'

beforeEach(() => {
  useEditorStore.setState({ kind: 'idle' } as any)
})

function setSaveConflict(opts?: { localBody?: string }) {
  useEditorStore.setState({
    kind: 'ready',
    path: 'notes/a.md',
    frontmatter: {},
    body: opts?.localBody ?? 'L',
    savedFrontmatter: {},
    savedBody: 'B',
    savedMtimeMs: 1,
    baseFrontmatter: {},
    baseBody: 'B',
    baseMtimeMs: 1,
    saving: false,
    conflictState: {
      kind: 'saveConflict',
      remoteMtimeMs: 1700000000000,
      remoteBody: 'R',
      remoteFrontmatter: {}
    }
  } as any)
}

describe('ConflictDialog visibility', () => {
  it('hidden when conflictState.kind != saveConflict', () => {
    useEditorStore.setState({
      kind: 'ready',
      path: 'a.md',
      body: '',
      savedBody: '',
      frontmatter: {},
      savedFrontmatter: {},
      savedMtimeMs: 1,
      baseBody: '',
      baseFrontmatter: {},
      baseMtimeMs: 1,
      saving: false,
      conflictState: { kind: 'none' }
    } as any)
    render(<ConflictDialog />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('visible when conflictState.kind = saveConflict', () => {
    setSaveConflict()
    render(<ConflictDialog />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('ConflictDialog meta', () => {
  it('shows file path', () => {
    setSaveConflict()
    render(<ConflictDialog />)
    expect(screen.getByText(/notes\/a\.md/)).toBeInTheDocument()
  })

  it('shows three primary buttons + diff link + 稍后处理', () => {
    setSaveConflict()
    render(<ConflictDialog />)
    expect(screen.getByTestId('dlg-keep-local')).toBeInTheDocument()
    expect(screen.getByTestId('dlg-load-remote')).toBeInTheDocument()
    expect(screen.getByTestId('dlg-save-as')).toBeInTheDocument()
    expect(screen.getByTestId('dlg-diff-link')).toBeInTheDocument()
    expect(screen.getByTestId('dlg-later')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Implement the component**

Create `src/components/editor/ConflictDialog.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useEditorStore } from '@/stores/editor'

function formatRemote(ts: number): string {
  return new Date(ts).toLocaleString()
}

function wordsCount(s: string): number {
  // Rough: count CJK chars + Latin words. Good enough for "本地未保存字数" hint.
  const cjk = (s.match(/[一-鿿]/g) ?? []).length
  const latin = (s.match(/[A-Za-z0-9]+/g) ?? []).length
  return cjk + latin
}

export function ConflictDialog(): React.JSX.Element | null {
  const { t } = useTranslation()
  const state = useEditorStore((s) => (s.kind === 'ready' ? s : null))
  if (!state) return null
  const cs = state.conflictState
  if (cs.kind !== 'saveConflict') return null

  const localUnsaved = wordsCount(state.body) - wordsCount(state.savedBody)
  const onLater = (): void => useEditorStore.getState().dismissDialog()

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onLater()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('conflict.dialog.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 text-sm text-muted-foreground">
          <div>{t('conflict.dialog.meta_path', { path: state.path })}</div>
          <div>{t('conflict.dialog.meta_words', { count: Math.abs(localUnsaved) })}</div>
          <div>
            {t('conflict.dialog.meta_remote_time', { time: formatRemote(cs.remoteMtimeMs) })}
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <button
            data-testid="dlg-keep-local"
            className="rounded border border-red-500 text-red-700 px-4 py-2 text-left"
            onClick={() => useEditorStore.getState().keepLocal()}
          >
            <div className="font-medium">{t('conflict.dialog.keep_local')}</div>
            <div className="text-xs opacity-70">{t('conflict.dialog.keep_local_sub')}</div>
          </button>
          <button
            data-testid="dlg-load-remote"
            className="rounded bg-blue-600 text-white px-4 py-2 text-left"
            onClick={() => useEditorStore.getState().reloadFromDisk()}
          >
            <div className="font-medium">{t('conflict.dialog.load_remote')}</div>
            <div className="text-xs opacity-90">{t('conflict.dialog.load_remote_sub')}</div>
          </button>
          <button
            data-testid="dlg-save-as"
            className="rounded border px-4 py-2 text-left"
            onClick={() => useEditorStore.getState().saveAsCopy()}
          >
            <div className="font-medium">{t('conflict.dialog.save_as')}</div>
            <div className="text-xs opacity-70">{t('conflict.dialog.save_as_sub')}</div>
          </button>
        </div>
        <div className="mt-3 flex justify-between text-xs">
          <span
            data-testid="dlg-diff-link"
            className="text-muted-foreground cursor-not-allowed"
            title={t('conflict.dialog.diff_soon')}
          >
            {t('conflict.dialog.view_diff')}
          </span>
          <button
            data-testid="dlg-later"
            className="text-muted-foreground underline"
            onClick={onLater}
          >
            {t('conflict.dialog.later')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Add stub i18n keys (just enough for tests to render)**

Open `src/i18n/locales/zh-CN.json` and append a `conflict` block (full content lands in Tasks 30–32; here we add stubs):

```json
  "conflict": {
    "dialog": {
      "title": "这个文件在 Acornvo 之外被修改过。你想怎么处理？",
      "meta_path": "{{path}}",
      "meta_words": "本地未保存：{{count}} 字",
      "meta_remote_time": "远端修改：{{time}}",
      "keep_local": "保留本地",
      "keep_local_sub": "stub",
      "load_remote": "重载磁盘",
      "load_remote_sub": "stub",
      "save_as": "另存副本",
      "save_as_sub": "stub",
      "view_diff": "查看差异",
      "diff_soon": "stub",
      "later": "稍后处理"
    },
    "banner": {
      "external_modified": "这个文件在外部被修改了。",
      "reload": "重载",
      "ignore": "忽略"
    }
  }
```

- [ ] **Step 4: Run visibility + meta tests**

```bash
npx vitest run src/components/editor/ConflictDialog.test.tsx
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/ConflictDialog.tsx \
  src/components/editor/ConflictDialog.test.tsx \
  src/i18n/locales/zh-CN.json
git commit -m "feat(editor): ConflictDialog skeleton + meta + 3 buttons + later (phase-09 7.1)"
```

---

<!-- openspec-task: 7.2 -->

### Task 26: ConflictDialog 保留本地 → snapshot + force write

**Files:**

- Modify: `src/stores/editor.ts` (add `keepLocal()`)
- Modify: `src/stores/editor.test.ts`
- Modify: `src/components/editor/ConflictDialog.test.tsx`

- [ ] **Step 1: Write failing store-action test**

Append to `src/stores/editor.test.ts`:

```ts
describe('editor.keepLocal (phase-09 7.2)', () => {
  it('writes snapshot then file.write force=true; updates saved* and resets conflictState', async () => {
    mockIpc.files.get.mockResolvedValueOnce({
      summary: { path: 'a.md', mtimeMs: 1 },
      frontmatter: { title: 't' },
      body: 'B'
    })
    await useEditorStore.getState().open('a.md')
    useEditorStore.getState().setBody('LOCAL')
    useEditorStore.setState((cur) => {
      if (cur.kind !== 'ready') return cur
      return {
        ...cur,
        conflictState: {
          kind: 'saveConflict',
          remoteMtimeMs: 999,
          remoteBody: 'REMOTE',
          remoteFrontmatter: { title: 't' }
        }
      }
    })
    mockIpc.conflict.writeSnapshot.mockResolvedValueOnce({ id: 'snap' })
    mockIpc.file.write.mockResolvedValueOnce({ mtimeMs: 1500, sha256: 'x' })

    await useEditorStore.getState().keepLocal()

    expect(mockIpc.conflict.writeSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ resolvedBy: 'keep_local', path: 'a.md' })
    )
    expect(mockIpc.file.write).toHaveBeenCalledWith(
      'a.md',
      expect.any(String),
      expect.objectContaining({ force: true })
    )
    const s = useEditorStore.getState()
    if (s.kind !== 'ready') throw new Error('expected ready')
    expect(s.savedBody).toBe('LOCAL')
    expect(s.savedMtimeMs).toBe(1500)
    expect(s.conflictState).toEqual({ kind: 'none' })
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run src/stores/editor.test.ts -t "phase-09 7.2"
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Add to `src/stores/editor.ts`:

```ts
keepLocal: async (): Promise<void> => {
  const cur = get()
  if (cur.kind !== 'ready' || cur.conflictState.kind !== 'saveConflict') return
  const remote = cur.conflictState
  const localText = stringify(cur.frontmatter, cur.body)
  const remoteText = stringify(remote.remoteFrontmatter, remote.remoteBody)
  const baseText = stringify(cur.baseFrontmatter, cur.baseBody)
  await ipc.conflict.writeSnapshot({
    path: cur.path,
    baseText,
    localText,
    remoteText,
    resolvedBy: 'keep_local'
  })
  const result = await ipc.file.write(cur.path, localText, { force: true })
  set((cur2) => {
    if (cur2.kind !== 'ready' || cur2.path !== cur.path) return cur2
    return {
      ...cur2,
      savedBody: cur2.body,
      savedFrontmatter: cur2.frontmatter,
      savedMtimeMs: result.mtimeMs,
      saving: false,
      conflictState: { kind: 'none' }
    }
  })
}
```

- [ ] **Step 4: Add UI test**

Append to `src/components/editor/ConflictDialog.test.tsx`:

```tsx
import { fireEvent } from '@testing-library/react'

it('clicking 保留本地 calls keepLocal()', () => {
  const keepLocal = vi.fn().mockResolvedValue(undefined)
  useEditorStore.setState({
    kind: 'ready',
    path: 'a.md',
    body: 'L',
    savedBody: 'B',
    frontmatter: {},
    savedFrontmatter: {},
    savedMtimeMs: 1,
    baseBody: 'B',
    baseFrontmatter: {},
    baseMtimeMs: 1,
    saving: false,
    conflictState: {
      kind: 'saveConflict',
      remoteMtimeMs: 9,
      remoteBody: 'R',
      remoteFrontmatter: {}
    },
    keepLocal
  } as any)
  render(<ConflictDialog />)
  fireEvent.click(screen.getByTestId('dlg-keep-local'))
  expect(keepLocal).toHaveBeenCalled()
})
```

- [ ] **Step 5: Run, confirm pass**

```bash
npx vitest run src/stores/editor.test.ts -t "phase-09 7.2"
npx vitest run src/components/editor/ConflictDialog.test.tsx -t "保留本地"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/stores/editor.ts src/stores/editor.test.ts \
  src/components/editor/ConflictDialog.test.tsx
git commit -m "feat(editor): keepLocal writes snapshot + force-overwrites disk (phase-09 7.2)"
```

---

<!-- openspec-task: 7.3 -->

### Task 27: ConflictDialog 重载磁盘 → snapshot + reload

The store action `reloadFromDisk` already supports both banner and dialog branches (Task 23 sets `resolved_by` based on `conflictState.kind`). When called from `saveConflict`, it writes `resolved_by: 'load_remote'`.

**Files:**

- Modify: `src/components/editor/ConflictDialog.test.tsx`
- Modify: `src/stores/editor.test.ts`

- [ ] **Step 1: Verify the resolvedBy switch**

The implementation in Task 23 step 6:

```ts
const isBanner = cur.conflictState.kind === 'externalModified'
const resolvedBy = isBanner ? 'load_remote_banner' : 'load_remote'
```

Add a regression test to `src/stores/editor.test.ts`:

```ts
describe('editor.reloadFromDisk from saveConflict (phase-09 7.3)', () => {
  it('uses resolved_by=load_remote (not load_remote_banner)', async () => {
    mockIpc.files.get
      .mockResolvedValueOnce({
        summary: { path: 'a.md', mtimeMs: 1 },
        frontmatter: {},
        body: 'B'
      })
      .mockResolvedValueOnce({
        summary: { path: 'a.md', mtimeMs: 999 },
        frontmatter: {},
        body: 'R'
      })
    await useEditorStore.getState().open('a.md')
    useEditorStore.getState().setBody('L')
    useEditorStore.setState((cur) => {
      if (cur.kind !== 'ready') return cur
      return {
        ...cur,
        conflictState: {
          kind: 'saveConflict',
          remoteMtimeMs: 999,
          remoteBody: 'R',
          remoteFrontmatter: {}
        }
      }
    })
    mockIpc.conflict.writeSnapshot.mockResolvedValueOnce({ id: 'snap' })

    await useEditorStore.getState().reloadFromDisk()

    expect(mockIpc.conflict.writeSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ resolvedBy: 'load_remote' })
    )
  })
})
```

- [ ] **Step 2: Run, confirm pass (no impl change needed)**

```bash
npx vitest run src/stores/editor.test.ts -t "phase-09 7.3"
```

Expected: PASS.

- [ ] **Step 3: Add UI test for the dialog button**

Append to `src/components/editor/ConflictDialog.test.tsx`:

```tsx
it('clicking 重载磁盘 calls reloadFromDisk()', () => {
  const reloadFromDisk = vi.fn().mockResolvedValue(undefined)
  useEditorStore.setState({
    kind: 'ready',
    path: 'a.md',
    body: 'L',
    savedBody: 'B',
    frontmatter: {},
    savedFrontmatter: {},
    savedMtimeMs: 1,
    baseBody: 'B',
    baseFrontmatter: {},
    baseMtimeMs: 1,
    saving: false,
    conflictState: {
      kind: 'saveConflict',
      remoteMtimeMs: 9,
      remoteBody: 'R',
      remoteFrontmatter: {}
    },
    reloadFromDisk
  } as any)
  render(<ConflictDialog />)
  fireEvent.click(screen.getByTestId('dlg-load-remote'))
  expect(reloadFromDisk).toHaveBeenCalled()
})
```

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run src/components/editor/ConflictDialog.test.tsx -t "重载磁盘"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/editor.test.ts src/components/editor/ConflictDialog.test.tsx
git commit -m "test(editor): reloadFromDisk from saveConflict uses load_remote (phase-09 7.3)"
```

---

<!-- openspec-task: 7.4 -->

### Task 28: ConflictDialog 另存副本 → unique path + snapshot + navigate

**Files:**

- Modify: `src/stores/editor.ts` (add `saveAsCopy()`)
- Modify: `src/stores/editor.test.ts`
- Modify: `src/components/editor/ConflictDialog.test.tsx`

- [ ] **Step 1: Write failing store tests**

Append to `src/stores/editor.test.ts`:

```ts
describe('editor.saveAsCopy (phase-09 7.4)', () => {
  beforeEach(() => {
    mockIpc.file.exists.mockReset()
  })

  it('builds path notes/a.conflict.<ts>.md and writes + snapshots + navigates', async () => {
    mockIpc.files.get.mockResolvedValueOnce({
      summary: { path: 'notes/a.md', mtimeMs: 1 },
      frontmatter: { title: 't' },
      body: 'B'
    })
    await useEditorStore.getState().open('notes/a.md')
    useEditorStore.getState().setBody('L')
    useEditorStore.setState((cur) => {
      if (cur.kind !== 'ready') return cur
      return {
        ...cur,
        conflictState: {
          kind: 'saveConflict',
          remoteMtimeMs: 9,
          remoteBody: 'R',
          remoteFrontmatter: {}
        }
      }
    })
    mockIpc.file.exists.mockResolvedValue(false) // first slot free
    mockIpc.file.write.mockResolvedValueOnce({ mtimeMs: 2, sha256: 'x' })
    mockIpc.conflict.writeSnapshot.mockResolvedValueOnce({ id: 'snap' })
    const navigateMock = vi.fn()
    vi.spyOn(await import('react-router-dom'), 'useNavigate' as any).mockReturnValue(navigateMock)

    await useEditorStore.getState().saveAsCopy()

    const writeCall = mockIpc.file.write.mock.calls[0]
    expect(writeCall[0]).toMatch(/^notes\/a\.conflict\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.md$/)
    expect(mockIpc.conflict.writeSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        resolvedBy: 'save_as',
        winnerPath: writeCall[0]
      })
    )
  })

  it('appends -1 / -2 suffix when target exists', async () => {
    mockIpc.files.get.mockResolvedValueOnce({
      summary: { path: 'notes/a.md', mtimeMs: 1 },
      frontmatter: {},
      body: 'B'
    })
    await useEditorStore.getState().open('notes/a.md')
    useEditorStore.getState().setBody('L')
    useEditorStore.setState((cur) => {
      if (cur.kind !== 'ready') return cur
      return {
        ...cur,
        conflictState: {
          kind: 'saveConflict',
          remoteMtimeMs: 9,
          remoteBody: 'R',
          remoteFrontmatter: {}
        }
      }
    })
    // First slot taken, second taken, third free
    mockIpc.file.exists
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    mockIpc.file.write.mockResolvedValueOnce({ mtimeMs: 2, sha256: 'x' })
    mockIpc.conflict.writeSnapshot.mockResolvedValueOnce({ id: 'snap' })

    await useEditorStore.getState().saveAsCopy()

    const writeCall = mockIpc.file.write.mock.calls[0]
    expect(writeCall[0]).toMatch(/-2\.md$/) // -1 also taken, jumped to -2
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run src/stores/editor.test.ts -t "phase-09 7.4"
```

Expected: FAIL.

- [ ] **Step 3: Implement `saveAsCopy`**

Add to `src/stores/editor.ts`:

```ts
function buildCopyPath(originalPath: string, ts: string): string {
  // notes/a.md → notes/a.conflict.<ts>.md
  const dotIdx = originalPath.lastIndexOf('.')
  const slashIdx = originalPath.lastIndexOf('/')
  const stem = dotIdx > slashIdx ? originalPath.slice(0, dotIdx) : originalPath
  const ext = dotIdx > slashIdx ? originalPath.slice(dotIdx) : '.md'
  return `${stem}.conflict.${ts}${ext}`
}

async function findFreeCopyPath(basePath: string): Promise<string> {
  if (!(await ipc.file.exists(basePath))) return basePath
  for (let i = 1; i < 100; i++) {
    const dotIdx = basePath.lastIndexOf('.')
    const stem = basePath.slice(0, dotIdx)
    const ext = basePath.slice(dotIdx)
    const cand = `${stem}-${i}${ext}`
    if (!(await ipc.file.exists(cand))) return cand
  }
  throw new Error(`no free copy slot for ${basePath}`)
}

saveAsCopy: async (): Promise<void> => {
  const cur = get()
  if (cur.kind !== 'ready' || cur.conflictState.kind !== 'saveConflict') return
  const remote = cur.conflictState
  const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
  const desired = buildCopyPath(cur.path, ts)
  const newPath = await findFreeCopyPath(desired)

  const localText = stringify(cur.frontmatter, cur.body)
  const remoteText = stringify(remote.remoteFrontmatter, remote.remoteBody)
  const baseText = stringify(cur.baseFrontmatter, cur.baseBody)
  // Write the new file FIRST so the snapshot's winner_path points to a real
  // file. New file → no expectedMtime guard.
  await ipc.file.write(newPath, localText)
  await ipc.conflict.writeSnapshot({
    path: cur.path,
    baseText,
    localText,
    remoteText,
    resolvedBy: 'save_as',
    winnerPath: newPath
  })
  // Reset editor to the original path's remote state, then navigate.
  // The Editor page subscribes to navigation via react-router; we cannot call
  // useNavigate from the store. Instead, expose the new path as a "pending
  // navigation" that the page picks up:
  set((cur2) => {
    if (cur2.kind !== 'ready') return cur2
    return {
      ...cur2,
      // Drop conflict state; the Editor page useEffect watches `pendingNavigateTo`.
      conflictState: { kind: 'none' },
      pendingNavigateTo: newPath
    }
  })
}
```

Add `pendingNavigateTo?: string` to the `ready` variant. In `src/pages/Editor.tsx`, add a `useEffect` that watches it:

```tsx
const pendingNav = useEditorStore((s) => (s.kind === 'ready' ? s.pendingNavigateTo : undefined))
const navigate = useNavigate()
useEffect(() => {
  if (pendingNav) {
    useEditorStore.setState((cur) => {
      if (cur.kind !== 'ready') return cur
      return { ...cur, pendingNavigateTo: undefined }
    })
    navigate('/editor/' + encodeURIComponent(pendingNav))
  }
}, [pendingNav, navigate])
```

- [ ] **Step 4: Add UI dialog test**

Append to `src/components/editor/ConflictDialog.test.tsx`:

```tsx
it('clicking 另存副本 calls saveAsCopy()', () => {
  const saveAsCopy = vi.fn().mockResolvedValue(undefined)
  useEditorStore.setState({
    kind: 'ready',
    path: 'a.md',
    body: 'L',
    savedBody: 'B',
    frontmatter: {},
    savedFrontmatter: {},
    savedMtimeMs: 1,
    baseBody: 'B',
    baseFrontmatter: {},
    baseMtimeMs: 1,
    saving: false,
    conflictState: {
      kind: 'saveConflict',
      remoteMtimeMs: 9,
      remoteBody: 'R',
      remoteFrontmatter: {}
    },
    saveAsCopy
  } as any)
  render(<ConflictDialog />)
  fireEvent.click(screen.getByTestId('dlg-save-as'))
  expect(saveAsCopy).toHaveBeenCalled()
})
```

- [ ] **Step 5: Run, confirm pass**

```bash
npx vitest run src/stores/editor.test.ts -t "phase-09 7.4"
npx vitest run src/components/editor/ConflictDialog.test.tsx -t "另存副本"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/stores/editor.ts src/stores/editor.test.ts \
  src/components/editor/ConflictDialog.test.tsx \
  src/pages/Editor.tsx
git commit -m "feat(editor): saveAsCopy with -N suffix dedup + navigate (phase-09 7.4)"
```

---

<!-- openspec-task: 7.5 -->

### Task 29: ConflictDialog 稍后处理 / Esc → externalModified + banner re-shown

**Files:**

- Modify: `src/stores/editor.ts` (add `dismissDialog()`)
- Modify: `src/stores/editor.test.ts`
- Modify: `src/components/editor/ConflictDialog.test.tsx`

- [ ] **Step 1: Write failing tests**

Append to `src/stores/editor.test.ts`:

```ts
describe('editor.dismissDialog (phase-09 7.5)', () => {
  it('saveConflict → externalModified (banner shows; dirty preserved)', async () => {
    mockIpc.files.get.mockResolvedValueOnce({
      summary: { path: 'a.md', mtimeMs: 1 },
      frontmatter: {},
      body: 'B'
    })
    await useEditorStore.getState().open('a.md')
    useEditorStore.getState().setBody('L')
    useEditorStore.setState((cur) => {
      if (cur.kind !== 'ready') return cur
      return {
        ...cur,
        conflictState: {
          kind: 'saveConflict',
          remoteMtimeMs: 9,
          remoteBody: 'R',
          remoteFrontmatter: {}
        }
      }
    })
    useEditorStore.getState().dismissDialog()
    const s = useEditorStore.getState()
    if (s.kind !== 'ready') throw new Error('expected ready')
    expect(s.conflictState).toEqual({ kind: 'externalModified', remoteMtimeMs: 9 })
    expect(s.body).toBe('L')
    expect(s.savedBody).toBe('B') // dirty preserved
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run src/stores/editor.test.ts -t "phase-09 7.5"
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Add to `src/stores/editor.ts`:

```ts
dismissDialog: () => {
  set((cur) => {
    if (cur.kind !== 'ready' || cur.conflictState.kind !== 'saveConflict') return cur
    return {
      ...cur,
      conflictState: { kind: 'externalModified', remoteMtimeMs: cur.conflictState.remoteMtimeMs }
    }
  })
}
```

- [ ] **Step 4: Add UI test**

Append to `src/components/editor/ConflictDialog.test.tsx`:

```tsx
it('clicking 稍后处理 calls dismissDialog()', () => {
  const dismissDialog = vi.fn()
  useEditorStore.setState({
    kind: 'ready',
    path: 'a.md',
    body: 'L',
    savedBody: 'B',
    frontmatter: {},
    savedFrontmatter: {},
    savedMtimeMs: 1,
    baseBody: 'B',
    baseFrontmatter: {},
    baseMtimeMs: 1,
    saving: false,
    conflictState: {
      kind: 'saveConflict',
      remoteMtimeMs: 9,
      remoteBody: 'R',
      remoteFrontmatter: {}
    },
    dismissDialog
  } as any)
  render(<ConflictDialog />)
  fireEvent.click(screen.getByTestId('dlg-later'))
  expect(dismissDialog).toHaveBeenCalled()
})

it('Esc/onOpenChange(false) also calls dismissDialog()', () => {
  const dismissDialog = vi.fn()
  useEditorStore.setState({
    kind: 'ready',
    path: 'a.md',
    body: 'L',
    savedBody: 'B',
    frontmatter: {},
    savedFrontmatter: {},
    savedMtimeMs: 1,
    baseBody: 'B',
    baseFrontmatter: {},
    baseMtimeMs: 1,
    saving: false,
    conflictState: {
      kind: 'saveConflict',
      remoteMtimeMs: 9,
      remoteBody: 'R',
      remoteFrontmatter: {}
    },
    dismissDialog
  } as any)
  render(<ConflictDialog />)
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(dismissDialog).toHaveBeenCalled()
})
```

- [ ] **Step 5: Run, confirm pass**

```bash
npx vitest run src/stores/editor.test.ts -t "phase-09 7.5"
npx vitest run src/components/editor/ConflictDialog.test.tsx -t "稍后处理"
npx vitest run src/components/editor/ConflictDialog.test.tsx -t "Esc"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/stores/editor.ts src/stores/editor.test.ts \
  src/components/editor/ConflictDialog.test.tsx
git commit -m "feat(editor): dismissDialog reverts saveConflict → externalModified (phase-09 7.5)"
```

---

<!-- openspec-task: 8.1 -->

### Task 30: i18n — dialog meta keys

**Files:**

- Modify: `src/i18n/locales/zh-CN.json`

- [ ] **Step 1: Replace stub keys with real text**

Open `src/i18n/locales/zh-CN.json`. Replace the `conflict.dialog` block with:

```json
    "dialog": {
      "title": "这个文件在 Acornvo 之外被修改过。你想怎么处理？",
      "meta_path": "文件：{{path}}",
      "meta_words": "本地未保存：约 {{count}} 字",
      "meta_remote_time": "远端修改时间：{{time}}",
      "keep_local": "保留本地",
      "keep_local_sub": "将覆盖磁盘上的外部修改。快照仍会保留。",
      "load_remote": "重载磁盘",
      "load_remote_sub": "丢弃你在 Acornvo 中未保存的修改。",
      "save_as": "另存副本",
      "save_as_sub": "把你的修改另存为 <name>.conflict.<ts>.md。磁盘原文件保留外部版本。",
      "view_diff": "查看差异",
      "diff_soon": "差异视图将于后续版本提供",
      "later": "稍后处理"
    }
```

- [ ] **Step 2: Re-run dialog UI tests**

```bash
npx vitest run src/components/editor/ConflictDialog.test.tsx
```

Expected: all PASS (meta_path test now sees "文件：notes/a.md" prefix; if the regex `/notes\/a\.md/` is too narrow it still matches the substring — fine).

- [ ] **Step 3: Commit**

```bash
git add src/i18n/locales/zh-CN.json
git commit -m "i18n(conflict): dialog meta + button strings (phase-09 8.1)"
```

---

<!-- openspec-task: 8.2 -->

### Task 31: i18n — banner + button副说明 final pass

**Files:**

- Modify: `src/i18n/locales/zh-CN.json`

- [ ] **Step 1: Replace banner stubs**

Edit `src/i18n/locales/zh-CN.json`. Replace the `conflict.banner` block with:

```json
    "banner": {
      "external_modified": "这个文件在 Acornvo 之外被修改了。",
      "reload": "重载（丢弃我的修改）",
      "ignore": "忽略（我自己处理）"
    }
```

- [ ] **Step 2: Re-run banner UI tests**

```bash
npx vitest run src/components/editor/ExternalModifiedBanner.test.tsx
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/i18n/locales/zh-CN.json
git commit -m "i18n(conflict): banner copy with risk hints (phase-09 8.2)"
```

---

<!-- openspec-task: 8.3 -->

### Task 32: i18n — later + diff_soon explicit verification

The keys `conflict.dialog.later` ("稍后处理") and `conflict.dialog.diff_soon` ("差异视图将于后续版本提供") were added in Task 30. This task is a coverage verification: assert the diff link is present, disabled-styled, and carries the tooltip.

**Files:**

- Modify: `src/components/editor/ConflictDialog.test.tsx`

- [ ] **Step 1: Add explicit tests**

Append to `src/components/editor/ConflictDialog.test.tsx`:

```tsx
import { useTranslation } from 'react-i18next'

it('diff link is non-clickable and shows diff_soon tooltip', () => {
  useEditorStore.setState({
    kind: 'ready',
    path: 'a.md',
    body: 'L',
    savedBody: 'B',
    frontmatter: {},
    savedFrontmatter: {},
    savedMtimeMs: 1,
    baseBody: 'B',
    baseFrontmatter: {},
    baseMtimeMs: 1,
    saving: false,
    conflictState: {
      kind: 'saveConflict',
      remoteMtimeMs: 9,
      remoteBody: 'R',
      remoteFrontmatter: {}
    }
  } as any)
  render(<ConflictDialog />)
  const link = screen.getByTestId('dlg-diff-link')
  expect(link).toHaveAttribute('title', '差异视图将于后续版本提供')
  expect(link.tagName).toBe('SPAN') // not a button — non-interactive
})

it('later button has the 稍后处理 label from i18n', () => {
  useEditorStore.setState({
    kind: 'ready',
    path: 'a.md',
    body: 'L',
    savedBody: 'B',
    frontmatter: {},
    savedFrontmatter: {},
    savedMtimeMs: 1,
    baseBody: 'B',
    baseFrontmatter: {},
    baseMtimeMs: 1,
    saving: false,
    conflictState: {
      kind: 'saveConflict',
      remoteMtimeMs: 9,
      remoteBody: 'R',
      remoteFrontmatter: {}
    }
  } as any)
  render(<ConflictDialog />)
  expect(screen.getByTestId('dlg-later')).toHaveTextContent('稍后处理')
})
```

- [ ] **Step 2: Run, confirm pass (no implementation change needed)**

```bash
npx vitest run src/components/editor/ConflictDialog.test.tsx -t "diff link"
npx vitest run src/components/editor/ConflictDialog.test.tsx -t "稍后处理"
```

Expected: PASS.

- [ ] **Step 3: Run the entire test suite to catch any regression**

```bash
npm test
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/editor/ConflictDialog.test.tsx
git commit -m "test(conflict): later + diff_soon i18n coverage (phase-09 8.3)"
```

---

## Self-Review

1. **Spec coverage:** Plan 3 owns labels 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3. Verify:

```bash
grep -E "openspec-task: ([678]\.[1-5])" /Users/aaa/develop/workspace-ai/acornvo/docs/superpowers/plans/2026-04-30-phase-09-conflict-handling-tasks-6.1-8.3.md | sort -u
```

Expected: 11 unique labels.

2. **Type consistency:** all snapshot writes use `resolvedBy` (camelCase) on the IPC boundary, which the main handler converts to `resolved_by` (snake_case) when writing `meta.json` (per Plan 1 Task 8 — `writeSnapshot` builds `meta` with `resolved_by`).

3. **`reloadFromDisk` is shared by banner (Task 23) and dialog (Task 27).** The `resolvedBy` switch is in the store action, not in the components. ✓

4. **`saveAsCopy` writes the new file BEFORE the snapshot** so the snapshot's `winner_path` is guaranteed to exist. ✓

5. **All copy is i18n'd** — no hard-coded strings in components. The diff link's `title` attribute uses `t('conflict.dialog.diff_soon')`. ✓

6. **No placeholders.** ✓
