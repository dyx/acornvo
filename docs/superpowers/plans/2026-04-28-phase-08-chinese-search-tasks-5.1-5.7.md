# Phase 08 — Chinese Search: Plan 3 (QuickSwitcher modal — Cmd+P)

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-08-chinese-search`
> **Task range:** OpenSpec tasks `5.1`–`5.7` (7 tasks)
> **Plan order:** 3 of 5. Builds on Plans 1+2. Subsequent plans (`tasks-6.1-8.1`, `9.1-9.18`) build on this one.
> **Status:** Not started
> **Created:** 2026-04-28

---

## Goal

Ship the **QuickSwitcher** modal: a top-anchored 600px-wide overlay opened by `Cmd/Ctrl+P` from any page, with a search input, a candidate list (max 10 rows), keyboard-driven navigation (`↑/↓`, `Enter`, `Cmd/Ctrl+Enter`, `Esc`), 80ms input debounce, request cancellation, and an in-memory recent-files LRU shown when the query is empty. The component reads from `ipc.search.quickSwitch` (built in Plan 2) and navigates via `react-router-dom@7`.

## Architecture

- **One component, one store, one hotkey hook.**
  - `src/components/search/QuickSwitcher.tsx` — the modal UI; pure render of store state + dispatches actions.
  - `src/stores/search.ts` — Zustand slice owning `quickSwitcher: { open, q, items, selectedIndex, recent, requestId }` plus actions.
  - `src/hooks/useGlobalHotkeys.ts` (extended/created here) — registers `Cmd/Ctrl+P` and `Cmd/Ctrl+Shift+F` (the latter is for Plan 4 but the hook is created here so both plans share it).
- **Modal uses `@radix-ui/react-dialog`** (already a dep). Radix gives us focus trapping + ARIA + Esc-handling for free; we only override the open/close trigger to be hotkey-driven, not click-driven.
- **Debounce + cancellation.** Each keystroke increments `requestId`. The store's `runQuery()` action awaits `ipc.search.quickSwitch(q, { limit: 10 })` and only commits results when `result.requestId === currentRequestId` at resolution time. This is the simplest "abort previous" without relying on `AbortController` (which the existing IPC client may not surface — confirm via `grep ipc.client.ts`).
- **Recent LRU is renderer-memory only.** `recent: string[]` (paths). When the editor opens a file (phase-07's `editor` store action), we'll add a `searchStore.pushRecent(path)` call — but for this plan we accept that recent is empty unless the user pre-populates it. We expose a public `pushRecent(path)` action so phase-07's editor / phase-06's library can call it.
- **Esc closes** via Radix Dialog's built-in handler. We *don't* duplicate the Esc binding in our hotkey hook — that would double-dispatch.
- **`Cmd+Enter` lands the user in `/library` with `selectedPath` pre-set.** That requires phase-06's library store to expose `setSelectedPath(path)`. If unavailable in this codebase, this plan stubs it: navigate to `/library?focus=<encodedPath>` and let the library page handle the query param when phase-06 lands.

## Tech Stack

- `@radix-ui/react-dialog@^1.1` (already a dep) — modal shell
- `react-router-dom@^7.14` (already a dep) — `useNavigate`
- `zustand@^5.0` (already a dep) — store
- `react-i18next@^17.0` (already a dep) — placeholder + a11y labels
- Plan 2's `ipc.search.quickSwitch` — IPC client method

## Files Touched (this plan)

| Path | Action | Owner task |
|---|---|---|
| `src/components/search/QuickSwitcher.tsx` | Create | 5.1, 5.5, 5.7 |
| `src/components/search/QuickSwitcher.test.tsx` | Create | 5.1, 5.5 |
| `src/stores/search.ts` | Create | 5.2, 5.4, 5.6 |
| `src/stores/search.test.ts` | Create | 5.2, 5.4, 5.6 |
| `src/hooks/useGlobalHotkeys.ts` | Create | 5.3 |
| `src/hooks/useGlobalHotkeys.test.tsx` | Create | 5.3 |
| `src/App.tsx` | Modify (mount `<QuickSwitcher />` + register hotkeys) | 5.3 |
| `vitest.config.ts` | Verify includes `src/**/*.test.{ts,tsx}` (no change if Plan 7-prior phases set it) | 5.1 |

## Pre-flight

This plan assumes Plans 1+2 have merged. Required artefacts:
- `ipc.search.quickSwitch(q, opts)` returns `Promise<FileSummary[]>` via `IpcClient<IpcContract>`.
- `shared/file-types.ts` exports `FileSummary` (phase-06).
- `@/ipc/client` exposes a typed `ipc` object with `ipc.search.quickSwitch(...)` (phase-01 IPC client wires every namespace from `shared/ipc-contract.ts`).
- The renderer build resolves `@/` to `src/` (electron-vite default).
- `vitest.config.ts` includes `src/**/*.test.{ts,tsx}` (existing config — phase-07 sets this; if not, the first task adds it).

```bash
grep -n "test:" /Users/aaa/develop/workspace-ai/acornvo/vitest.config.ts 2>/dev/null
```

If `src/**/*.test.tsx` is missing, add it to `test.include` in the first task's setup step.

> Phase-06 has not landed yet on `main` in this branch's plan history — it produces `src/stores/library.ts` exposing a `setSelectedPath(path)` action. **If phase-06 has not landed when this plan starts**, replace the `Cmd+Enter` action's call `useLibraryStore.setSelectedPath(path)` with `navigate(\`/library?focus=${encodeURIComponent(path)}\`)`. Plan 4 task 6.7's "Cmd+Click" branch uses the same fallback.

---

## Tasks

<!-- openspec-task: 5.2 -->
### Task 1: `src/stores/search.ts` — Zustand slice for QuickSwitcher state

We start with the store because the component (task 2) consumes it. This inverts OpenSpec's task numbering (5.1 → 5.2) but matches the dependency order: build the data layer, then the UI.

**Files:**
- Create: `src/stores/search.ts`
- Create: `src/stores/search.test.ts`

- [ ] **Step 1: Failing test**

Create `src/stores/search.test.ts`:

```tsx
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useSearchStore, _resetSearchStoreForTest } from './search'

vi.mock('@/ipc/client', () => ({
  ipc: {
    search: {
      quickSwitch: vi.fn()
    }
  }
}))

import { ipc } from '@/ipc/client'

const stub = (path: string) => ({
  path, title: path, category: null, rating: null, clipped_at: null,
  site: null, has_summary: false, tags: [], is_reviewing: false
})

describe('useSearchStore.quickSwitcher', () => {
  beforeEach(() => {
    _resetSearchStoreForTest()
    vi.mocked(ipc.search.quickSwitch).mockReset()
  })

  afterEach(() => { vi.useRealTimers() })

  it('open() flips open=true and clears q', () => {
    useSearchStore.getState().quickSwitcher.open()
    expect(useSearchStore.getState().quickSwitcher.openState).toBe(true)
    expect(useSearchStore.getState().quickSwitcher.q).toBe('')
  })

  it('close() resets state', () => {
    const s = useSearchStore.getState().quickSwitcher
    s.open()
    s.setQuery('foo')
    s.close()
    expect(useSearchStore.getState().quickSwitcher.openState).toBe(false)
    expect(useSearchStore.getState().quickSwitcher.q).toBe('')
    expect(useSearchStore.getState().quickSwitcher.items).toEqual([])
    expect(useSearchStore.getState().quickSwitcher.selectedIndex).toBe(0)
  })

  it('runQuery commits results when requestId matches', async () => {
    vi.mocked(ipc.search.quickSwitch).mockResolvedValueOnce([stub('a.md'), stub('b.md')])
    await useSearchStore.getState().quickSwitcher.runQuery('attention')
    expect(useSearchStore.getState().quickSwitcher.items.map((i) => i.path)).toEqual(['a.md', 'b.md'])
  })

  it('runQuery ignores stale results (cancelled by newer query)', async () => {
    let firstResolve: ((v: typeof stub.prototype[]) => void) | null = null
    vi.mocked(ipc.search.quickSwitch).mockImplementationOnce(
      () => new Promise((res) => { firstResolve = res })
    )
    vi.mocked(ipc.search.quickSwitch).mockResolvedValueOnce([stub('newer.md')])

    const slow = useSearchStore.getState().quickSwitcher.runQuery('att')
    const fast = useSearchStore.getState().quickSwitcher.runQuery('attention')
    await fast
    firstResolve?.([stub('older.md')])
    await slow

    expect(useSearchStore.getState().quickSwitcher.items.map((i) => i.path)).toEqual(['newer.md'])
  })

  it('moveSelection clamps within bounds', () => {
    const s = useSearchStore.getState().quickSwitcher
    s.open()
    useSearchStore.setState((prev) => ({
      ...prev,
      quickSwitcher: { ...prev.quickSwitcher, items: [stub('a.md'), stub('b.md'), stub('c.md')] }
    }))

    s.moveSelection(1)
    expect(useSearchStore.getState().quickSwitcher.selectedIndex).toBe(1)
    s.moveSelection(1)
    expect(useSearchStore.getState().quickSwitcher.selectedIndex).toBe(2)
    s.moveSelection(1)  // past end → clamps
    expect(useSearchStore.getState().quickSwitcher.selectedIndex).toBe(2)
    s.moveSelection(-99)
    expect(useSearchStore.getState().quickSwitcher.selectedIndex).toBe(0)
  })

  it('pushRecent prepends and dedupes (max 10)', () => {
    const s = useSearchStore.getState().quickSwitcher
    for (let i = 0; i < 12; i++) s.pushRecent(`f${i}.md`)
    expect(useSearchStore.getState().quickSwitcher.recent.length).toBe(10)
    expect(useSearchStore.getState().quickSwitcher.recent[0]).toBe('f11.md')

    s.pushRecent('f5.md')
    expect(useSearchStore.getState().quickSwitcher.recent[0]).toBe('f5.md')
    expect(useSearchStore.getState().quickSwitcher.recent.filter((p) => p === 'f5.md').length).toBe(1)
  })
})
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npx vitest run src/stores/search.test.ts
```

- [ ] **Step 3: Implement**

Create `src/stores/search.ts`:

```ts
import { create } from 'zustand'
import { ipc } from '@/ipc/client'
import type { FileSummary } from '@shared/file-types'

interface QuickSwitcherSlice {
  openState: boolean
  q: string
  items: FileSummary[]
  selectedIndex: number
  recent: string[]
  requestId: number

  open: () => void
  close: () => void
  setQuery: (q: string) => void
  runQuery: (q: string) => Promise<void>
  moveSelection: (delta: number) => void
  setSelectedIndex: (i: number) => void
  pushRecent: (path: string) => void
}

interface SearchStore {
  quickSwitcher: QuickSwitcherSlice
}

const QUICK_SWITCH_LIMIT = 10
const RECENT_MAX = 10

export const useSearchStore = create<SearchStore>((set, get) => ({
  quickSwitcher: {
    openState: false,
    q: '',
    items: [],
    selectedIndex: 0,
    recent: [],
    requestId: 0,

    open: () => set((prev) => ({
      quickSwitcher: {
        ...prev.quickSwitcher,
        openState: true,
        q: '',
        items: [],
        selectedIndex: 0
      }
    })),

    close: () => set((prev) => ({
      quickSwitcher: {
        ...prev.quickSwitcher,
        openState: false,
        q: '',
        items: [],
        selectedIndex: 0
      }
    })),

    setQuery: (q: string) => set((prev) => ({
      quickSwitcher: { ...prev.quickSwitcher, q, selectedIndex: 0 }
    })),

    runQuery: async (q: string) => {
      const myId = get().quickSwitcher.requestId + 1
      set((prev) => ({ quickSwitcher: { ...prev.quickSwitcher, requestId: myId } }))
      const items = q.length === 0 ? [] : await ipc.search.quickSwitch(q, { limit: QUICK_SWITCH_LIMIT })
      const cur = get().quickSwitcher.requestId
      if (cur !== myId) return  // stale
      set((prev) => ({
        quickSwitcher: {
          ...prev.quickSwitcher,
          items,
          selectedIndex: 0
        }
      }))
    },

    moveSelection: (delta: number) => set((prev) => {
      const max = Math.max(0, prev.quickSwitcher.items.length - 1)
      const next = Math.min(max, Math.max(0, prev.quickSwitcher.selectedIndex + delta))
      return { quickSwitcher: { ...prev.quickSwitcher, selectedIndex: next } }
    }),

    setSelectedIndex: (i: number) => set((prev) => ({
      quickSwitcher: { ...prev.quickSwitcher, selectedIndex: i }
    })),

    pushRecent: (path: string) => set((prev) => {
      const next = [path, ...prev.quickSwitcher.recent.filter((p) => p !== path)].slice(0, RECENT_MAX)
      return { quickSwitcher: { ...prev.quickSwitcher, recent: next } }
    })
  }
}))

export function _resetSearchStoreForTest(): void {
  useSearchStore.setState({
    quickSwitcher: {
      ...useSearchStore.getState().quickSwitcher,
      openState: false,
      q: '',
      items: [],
      selectedIndex: 0,
      recent: [],
      requestId: 0
    }
  })
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npx vitest run src/stores/search.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/stores/search.ts src/stores/search.test.ts
git commit -m "feat(phase-08): search store — quickSwitcher slice with stale-request cancellation"
```

---

<!-- openspec-task: 5.4 -->
### Task 2: 80ms debounce wired into the store's runQuery flow

The store's `runQuery` is fire-immediately. The debounce lives at the **call site** (the component) — but to keep timing logic testable in isolation, we add `scheduleQuery(q)` to the store that owns the debounce timer.

**Files:**
- Modify: `src/stores/search.ts`
- Modify: `src/stores/search.test.ts`

- [ ] **Step 1: Failing test**

Append to `src/stores/search.test.ts`:

```ts
describe('quickSwitcher.scheduleQuery debounce', () => {
  beforeEach(() => {
    _resetSearchStoreForTest()
    vi.useFakeTimers()
    vi.mocked(ipc.search.quickSwitch).mockReset()
  })
  afterEach(() => { vi.useRealTimers() })

  it('coalesces three keystrokes into one IPC call', async () => {
    vi.mocked(ipc.search.quickSwitch).mockResolvedValue([])
    const s = useSearchStore.getState().quickSwitcher
    s.scheduleQuery('a')
    s.scheduleQuery('at')
    s.scheduleQuery('att')
    expect(ipc.search.quickSwitch).not.toHaveBeenCalled()
    vi.advanceTimersByTime(80)
    await Promise.resolve()
    await Promise.resolve()
    expect(ipc.search.quickSwitch).toHaveBeenCalledTimes(1)
    expect(ipc.search.quickSwitch).toHaveBeenLastCalledWith('att', { limit: 10 })
  })
})
```

- [ ] **Step 2: Run, expect FAIL** (no `scheduleQuery` yet)

```bash
npx vitest run src/stores/search.test.ts -t scheduleQuery
```

- [ ] **Step 3: Implement**

Edit `src/stores/search.ts`. Add at module scope (above the `create` call):

```ts
let _quickSwitcherDebounceTimer: ReturnType<typeof setTimeout> | null = null
const QUICK_SWITCH_DEBOUNCE_MS = 80
```

Add the action inside `quickSwitcher`:

```ts
scheduleQuery: (q: string) => {
  // setQuery synchronously so the input field can re-render
  set((prev) => ({ quickSwitcher: { ...prev.quickSwitcher, q, selectedIndex: 0 } }))
  if (_quickSwitcherDebounceTimer) clearTimeout(_quickSwitcherDebounceTimer)
  _quickSwitcherDebounceTimer = setTimeout(() => {
    _quickSwitcherDebounceTimer = null
    void get().quickSwitcher.runQuery(q)
  }, QUICK_SWITCH_DEBOUNCE_MS)
}
```

Add to the `QuickSwitcherSlice` interface:
```ts
scheduleQuery: (q: string) => void
```

In `_resetSearchStoreForTest`, also clear the timer:
```ts
if (_quickSwitcherDebounceTimer) {
  clearTimeout(_quickSwitcherDebounceTimer)
  _quickSwitcherDebounceTimer = null
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npx vitest run src/stores/search.test.ts -t scheduleQuery
```

- [ ] **Step 5: Commit**

```bash
git add src/stores/search.ts src/stores/search.test.ts
git commit -m "feat(phase-08): scheduleQuery 80ms debounce coalescing"
```

---

<!-- openspec-task: 5.6 -->
### Task 3: Recent-LRU is exposed as a public action and wired to a `pushRecent` exporter

The store already has `pushRecent`. This task verifies it remains stable across component lifecycle and re-exports a tiny imperative helper for callers outside the React tree (e.g., the editor's `open(path)` action which lives in another store).

**Files:**
- Modify: `src/stores/search.ts`
- Modify: `src/stores/search.test.ts`

- [ ] **Step 1: Add an imperative helper**

Append to `src/stores/search.ts`:

```ts
/** Imperative helper for non-React callers (other stores, IPC event handlers). */
export function pushRecentFile(path: string): void {
  useSearchStore.getState().quickSwitcher.pushRecent(path)
}
```

- [ ] **Step 2: Add a test for the helper**

Append to `src/stores/search.test.ts`:

```ts
import { pushRecentFile } from './search'

describe('pushRecentFile (imperative)', () => {
  beforeEach(() => { _resetSearchStoreForTest() })

  it('forwards to the store action', () => {
    pushRecentFile('a.md')
    pushRecentFile('b.md')
    pushRecentFile('a.md')  // dedupe
    expect(useSearchStore.getState().quickSwitcher.recent).toEqual(['a.md', 'b.md'])
  })
})
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run src/stores/search.test.ts -t pushRecentFile
git add src/stores/search.ts src/stores/search.test.ts
git commit -m "feat(phase-08): pushRecentFile imperative helper for cross-store calls"
```

---

<!-- openspec-task: 5.3 -->
### Task 4: `useGlobalHotkeys` hook + register Cmd/Ctrl+P (and Cmd/Ctrl+Shift+F placeholder for Plan 4)

**Files:**
- Create: `src/hooks/useGlobalHotkeys.ts`
- Create: `src/hooks/useGlobalHotkeys.test.tsx`
- Modify: `src/App.tsx` (call `useGlobalHotkeys()` + render `<QuickSwitcher />`)

- [ ] **Step 1: Failing test**

Create `src/hooks/useGlobalHotkeys.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useGlobalHotkeys } from './useGlobalHotkeys'
import { useSearchStore, _resetSearchStoreForTest } from '@/stores/search'

describe('useGlobalHotkeys', () => {
  beforeEach(() => { _resetSearchStoreForTest() })

  function press(opts: KeyboardEventInit): void {
    window.dispatchEvent(new KeyboardEvent('keydown', opts))
  }

  it('Cmd+P opens QuickSwitcher and prevents default', () => {
    renderHook(() => useGlobalHotkeys())
    const ev = new KeyboardEvent('keydown', { key: 'p', metaKey: true, cancelable: true })
    let prevented = false
    Object.defineProperty(ev, 'preventDefault', { value: () => { prevented = true } })
    window.dispatchEvent(ev)
    expect(useSearchStore.getState().quickSwitcher.openState).toBe(true)
    expect(prevented).toBe(true)
  })

  it('Ctrl+P also opens (windows/linux)', () => {
    renderHook(() => useGlobalHotkeys())
    press({ key: 'p', ctrlKey: true })
    expect(useSearchStore.getState().quickSwitcher.openState).toBe(true)
  })

  it('plain P does NOT open', () => {
    renderHook(() => useGlobalHotkeys())
    press({ key: 'p' })
    expect(useSearchStore.getState().quickSwitcher.openState).toBe(false)
  })

  it('cleans up the listener on unmount', () => {
    const { unmount } = renderHook(() => useGlobalHotkeys())
    unmount()
    press({ key: 'p', metaKey: true })
    expect(useSearchStore.getState().quickSwitcher.openState).toBe(false)
  })
})
```

> Note: this test requires `@testing-library/react` and a jsdom-enabled vitest config. If `@testing-library/react` is not yet a dep (phase-07 adds it), add it now:

```bash
node -e "const p=require('./package.json');console.log(p.devDependencies?.['@testing-library/react']||'absent')"
```

If `absent`, run `npm install --save-dev @testing-library/react @testing-library/dom` and update `vitest.config.ts` to use `environment: 'jsdom'` for `src/**` tests. Phase-07 plan 1 already does this — confirm via:

```bash
grep -n "jsdom\|testing-library" vitest.config.ts package.json
```

If still missing, add a small setup as part of this step before continuing.

- [ ] **Step 2: Run, expect FAIL**

```bash
npx vitest run src/hooks/useGlobalHotkeys.test.tsx
```

- [ ] **Step 3: Implement**

Create `src/hooks/useGlobalHotkeys.ts`:

```ts
import { useEffect } from 'react'
import { useSearchStore } from '@/stores/search'

/**
 * Global hotkey listener. Registers once per app lifetime — call this from <App />.
 *
 * - Cmd/Ctrl+P → open QuickSwitcher (preventDefault to override browser/system print)
 * - Cmd/Ctrl+Shift+F → reserved for Plan 4 (full-text search panel)
 */
export function useGlobalHotkeys(): void {
  const openQuickSwitcher = useSearchStore((s) => s.quickSwitcher.open)

  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent): void {
      const mod = ev.metaKey || ev.ctrlKey
      if (!mod) return
      const key = ev.key.toLowerCase()
      if (key === 'p' && !ev.shiftKey) {
        ev.preventDefault()
        openQuickSwitcher()
        return
      }
      // Plan 4: Cmd+Shift+F handled there (does not call openQuickSwitcher)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openQuickSwitcher])
}
```

- [ ] **Step 4: Re-run the test**

```bash
npx vitest run src/hooks/useGlobalHotkeys.test.tsx
```

Expected: PASS for all four cases.

- [ ] **Step 5: Mount the hook + the (yet-empty) QuickSwitcher in App.tsx**

Edit `src/App.tsx`. Add imports:
```tsx
import { useGlobalHotkeys } from '@/hooks/useGlobalHotkeys'
import { QuickSwitcher } from '@/components/search/QuickSwitcher'
```

Inside `App()`, add a hook call near the top (after `useToast()`):
```tsx
useGlobalHotkeys()
```

Render `<QuickSwitcher />` near `<Toaster />`:
```tsx
<DbRebuildOverlay visible={isRebuilding} />
<QuickSwitcher />
<Toaster />
```

> The component file does not exist yet — typecheck will fail until task 5 lands. That's acceptable: we commit App.tsx + hook together with a "(component-pending)" message so the next task owns the component skeleton.

Actually, to keep each task's diff working: create a placeholder QuickSwitcher.tsx now to avoid a broken intermediate state.

Create `src/components/search/QuickSwitcher.tsx` with a minimal export (we'll flesh it out in tasks 5–7):

```tsx
import type { JSX } from 'react'
import { useSearchStore } from '@/stores/search'

export function QuickSwitcher(): JSX.Element | null {
  const open = useSearchStore((s) => s.quickSwitcher.openState)
  if (!open) return null
  // Real UI lands in the next task — this stub at least mounts so hotkey hookup is testable.
  return <div data-testid="quickswitcher-placeholder" style={{ position: 'fixed', inset: 0 }} />
}
```

- [ ] **Step 6: Typecheck + run all renderer tests**

```bash
npm run typecheck
npx vitest run src/
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useGlobalHotkeys.ts src/hooks/useGlobalHotkeys.test.tsx src/components/search/QuickSwitcher.tsx src/App.tsx
git commit -m "feat(phase-08): global Cmd/Ctrl+P hotkey opens QuickSwitcher placeholder"
```

---

<!-- openspec-task: 5.1 -->
### Task 5: Flesh out `QuickSwitcher.tsx` UI shell — Radix Dialog, top-anchored 600px modal, input + list scaffolding

**Files:**
- Modify: `src/components/search/QuickSwitcher.tsx`
- Modify: `src/components/search/QuickSwitcher.test.tsx` (create)

- [ ] **Step 1: Failing test**

Create `src/components/search/QuickSwitcher.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { QuickSwitcher } from './QuickSwitcher'
import { useSearchStore, _resetSearchStoreForTest } from '@/stores/search'

vi.mock('@/ipc/client', () => ({
  ipc: { search: { quickSwitch: vi.fn().mockResolvedValue([]) } }
}))

describe('QuickSwitcher (UI shell)', () => {
  beforeEach(() => { _resetSearchStoreForTest() })

  it('renders nothing when closed', () => {
    render(<QuickSwitcher />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders dialog with input and empty list when open', () => {
    render(<QuickSwitcher />)
    act(() => useSearchStore.getState().quickSwitcher.open())
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('typing updates store via scheduleQuery', () => {
    render(<QuickSwitcher />)
    act(() => useSearchStore.getState().quickSwitcher.open())
    const input = screen.getByRole('textbox') as HTMLInputElement
    act(() => {
      input.value = 'attention'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(useSearchStore.getState().quickSwitcher.q).toBe('attention')
  })

  it('Esc closes via Radix Dialog onOpenChange', () => {
    render(<QuickSwitcher />)
    act(() => useSearchStore.getState().quickSwitcher.open())
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    })
    // Radix listens for Escape; expect close after a tick
    expect(useSearchStore.getState().quickSwitcher.openState).toBe(false)
  })
})
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npx vitest run src/components/search/QuickSwitcher.test.tsx
```

- [ ] **Step 3: Implement the shell**

Replace `src/components/search/QuickSwitcher.tsx`:

```tsx
import type { JSX } from 'react'
import { useEffect, useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useTranslation } from 'react-i18next'
import { useSearchStore } from '@/stores/search'

export function QuickSwitcher(): JSX.Element {
  const { t } = useTranslation()
  const open = useSearchStore((s) => s.quickSwitcher.openState)
  const q = useSearchStore((s) => s.quickSwitcher.q)
  const items = useSearchStore((s) => s.quickSwitcher.items)
  const close = useSearchStore((s) => s.quickSwitcher.close)
  const scheduleQuery = useSearchStore((s) => s.quickSwitcher.scheduleQuery)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      // Focus the input on next tick after Radix mounts the portal
      const id = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(id)
    }
  }, [open])

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) close() }}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50 bg-background/40 backdrop-blur-sm"
          aria-hidden="true"
        />
        <Dialog.Content
          className="fixed left-1/2 top-[15vh] z-50 -translate-x-1/2 w-[600px] max-w-[90vw] rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
        >
          <Dialog.Title className="sr-only">QuickSwitcher</Dialog.Title>
          <Dialog.Description className="sr-only">{t('search.placeholder_quick')}</Dialog.Description>
          <div className="border-b border-border p-3">
            <input
              ref={inputRef}
              type="text"
              role="textbox"
              value={q}
              onChange={(e) => scheduleQuery(e.target.value)}
              placeholder={t('search.placeholder_quick')}
              className="w-full bg-transparent outline-none text-base"
              aria-label={t('search.placeholder_quick')}
            />
          </div>
          <ul className="max-h-[480px] overflow-y-auto" role="listbox" aria-label="results">
            {items.length === 0 && q.length === 0 ? null : null /* row rendering in task 7 */}
            {items.length === 0 && q.length > 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                {t('search.no_results')}
              </li>
            ) : null}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

- [ ] **Step 4: Add the i18n keys (placeholder set)**

Find the existing i18n setup (likely `src/i18n/zh.ts` or `src/i18n/index.ts`). Add the keys to whichever locale file the renderer's i18n bootstrap loads:

```ts
search: {
  placeholder_quick: '搜索文件名 / 路径',
  no_results: '无匹配结果',
  recent: '最近打开'
}
```

Plan 4 task 8.1 lands the full set; this task only needs `placeholder_quick`, `no_results`, `recent`.

If your i18n is keyed via `react-i18next` with a flat namespace, use:
```ts
'search.placeholder_quick': '搜索文件名 / 路径',
'search.no_results': '无匹配结果',
'search.recent': '最近打开'
```

```bash
grep -n "i18next.init\|react-i18next" src/i18n/*.ts src/i18n/index.ts 2>/dev/null
```

Use the output to find the right file and add the keys. If the project does not yet have an i18n setup, fall back to inlining the strings as fallbacks via `t('key', { defaultValue: '中文' })`.

- [ ] **Step 5: Re-run the test**

```bash
npx vitest run src/components/search/QuickSwitcher.test.tsx
```

Expected: PASS for all four cases. If the Esc test flakes due to Radix portal timing, wrap the dispatch in `await act(async () => { ... })` and add `await new Promise((r) => setTimeout(r, 10))`.

- [ ] **Step 6: Commit**

```bash
git add src/components/search/QuickSwitcher.tsx src/components/search/QuickSwitcher.test.tsx src/i18n/*.ts
git commit -m "feat(phase-08): QuickSwitcher Radix shell + input + empty-state"
```

---

<!-- openspec-task: 5.5 -->
### Task 6: Keyboard navigation — `↑/↓` move; `Enter` opens editor; `Cmd/Ctrl+Enter` library focus

**Files:**
- Modify: `src/components/search/QuickSwitcher.tsx`
- Modify: `src/components/search/QuickSwitcher.test.tsx`

- [ ] **Step 1: Failing test**

Append to `src/components/search/QuickSwitcher.test.tsx`:

```tsx
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

const stub = (path: string) => ({
  path, title: path, category: null, rating: null, clipped_at: null,
  site: null, has_summary: false, tags: [], is_reviewing: false
})

describe('QuickSwitcher keyboard nav', () => {
  beforeEach(() => {
    _resetSearchStoreForTest()
    navigateMock.mockReset()
    act(() => {
      useSearchStore.getState().quickSwitcher.open()
      useSearchStore.setState((prev) => ({
        quickSwitcher: { ...prev.quickSwitcher, items: [stub('a.md'), stub('b.md'), stub('c.md')], q: 'x' }
      }))
    })
  })

  it('Down arrow moves selectedIndex', () => {
    render(<MemoryRouter><QuickSwitcher /></MemoryRouter>)
    const dialog = screen.getByRole('dialog')
    act(() => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    })
    expect(useSearchStore.getState().quickSwitcher.selectedIndex).toBe(1)
  })

  it('Enter navigates to /editor/<encodedPath> and closes', () => {
    render(<MemoryRouter><QuickSwitcher /></MemoryRouter>)
    const dialog = screen.getByRole('dialog')
    act(() => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    expect(navigateMock).toHaveBeenCalledWith('/editor/' + encodeURIComponent('a.md'))
    expect(useSearchStore.getState().quickSwitcher.openState).toBe(false)
  })

  it('Cmd+Enter navigates to /library?focus=<path> and closes', () => {
    render(<MemoryRouter><QuickSwitcher /></MemoryRouter>)
    const dialog = screen.getByRole('dialog')
    act(() => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true }))
    })
    expect(navigateMock).toHaveBeenCalledWith('/library?focus=' + encodeURIComponent('a.md'))
  })
})
```

- [ ] **Step 2: Run, expect FAIL** (no keydown handler on dialog)

```bash
npx vitest run src/components/search/QuickSwitcher.test.tsx -t "keyboard nav"
```

- [ ] **Step 3: Implement keyboard handlers**

Edit `src/components/search/QuickSwitcher.tsx`. Add `useNavigate` import:
```tsx
import { useNavigate } from 'react-router-dom'
```

Add inside the component body:
```tsx
const navigate = useNavigate()
const moveSelection = useSearchStore((s) => s.quickSwitcher.moveSelection)
const selectedIndex = useSearchStore((s) => s.quickSwitcher.selectedIndex)
const pushRecent = useSearchStore((s) => s.quickSwitcher.pushRecent)
```

Add an `onKeyDown` handler on the `<Dialog.Content>` (or the input):
```tsx
function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
  const mod = e.metaKey || e.ctrlKey
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    moveSelection(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    moveSelection(-1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const target = items[selectedIndex]
    if (!target) return
    pushRecent(target.path)
    if (mod) {
      navigate('/library?focus=' + encodeURIComponent(target.path))
    } else {
      navigate('/editor/' + encodeURIComponent(target.path))
    }
    close()
  }
}
```

Wire it on `<Dialog.Content>`:
```tsx
<Dialog.Content
  onKeyDown={handleKeyDown}
  className="fixed left-1/2 top-[15vh] z-50 -translate-x-1/2 w-[600px] max-w-[90vw] rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
>
```

- [ ] **Step 4: Re-run the test**

```bash
npx vitest run src/components/search/QuickSwitcher.test.tsx -t "keyboard nav"
```

Expected: PASS for all three cases.

- [ ] **Step 5: Commit**

```bash
git add src/components/search/QuickSwitcher.tsx src/components/search/QuickSwitcher.test.tsx
git commit -m "feat(phase-08): QuickSwitcher keyboard nav (↑↓ Enter Cmd+Enter)"
```

---

<!-- openspec-task: 5.7 -->
### Task 7: Row rendering — title + path + clipped_at, selected-row visual state

**Files:**
- Modify: `src/components/search/QuickSwitcher.tsx`
- Modify: `src/components/search/QuickSwitcher.test.tsx`

- [ ] **Step 1: Failing test**

Append:

```tsx
describe('QuickSwitcher row render', () => {
  beforeEach(() => { _resetSearchStoreForTest() })

  it('renders title, path, clipped_at; highlights selected', () => {
    act(() => {
      useSearchStore.getState().quickSwitcher.open()
      useSearchStore.setState((prev) => ({
        quickSwitcher: {
          ...prev.quickSwitcher,
          q: 'x',
          items: [
            { path: 'a.md', title: 'Title A', category: null, rating: null,
              clipped_at: '2026-04-01', site: null, has_summary: false, tags: [], is_reviewing: false },
            { path: 'b.md', title: 'Title B', category: null, rating: null,
              clipped_at: null, site: null, has_summary: false, tags: [], is_reviewing: false }
          ],
          selectedIndex: 1
        }
      }))
    })
    render(<MemoryRouter><QuickSwitcher /></MemoryRouter>)

    expect(screen.getByText('Title A')).toBeTruthy()
    expect(screen.getByText('Title B')).toBeTruthy()
    expect(screen.getByText('a.md')).toBeTruthy()
    expect(screen.getByText('b.md')).toBeTruthy()
    expect(screen.getByText('2026-04-01')).toBeTruthy()

    const rows = screen.getAllByRole('option')
    expect(rows[1].getAttribute('aria-selected')).toBe('true')
    expect(rows[0].getAttribute('aria-selected')).toBe('false')
  })

  it('shows recent list when q is empty', () => {
    act(() => {
      useSearchStore.getState().quickSwitcher.open()
      useSearchStore.setState((prev) => ({
        quickSwitcher: { ...prev.quickSwitcher, recent: ['recent-a.md', 'recent-b.md'] }
      }))
    })
    render(<MemoryRouter><QuickSwitcher /></MemoryRouter>)

    expect(screen.getByText('recent-a.md')).toBeTruthy()
    expect(screen.getByText('recent-b.md')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run, expect FAIL** (rows not yet rendered)

```bash
npx vitest run src/components/search/QuickSwitcher.test.tsx -t "row render"
```

- [ ] **Step 3: Implement the row render**

Replace the `<ul>` block in `QuickSwitcher.tsx` with:

```tsx
<ul className="max-h-[480px] overflow-y-auto" role="listbox" aria-label="results">
  {q.length === 0 && items.length === 0 ? (
    <>
      <li className="px-3 py-1 text-xs text-muted-foreground uppercase tracking-wide">
        {t('search.recent')}
      </li>
      {useSearchStore.getState().quickSwitcher.recent.length === 0 ? (
        <li className="px-3 py-2 text-sm text-muted-foreground">{t('search.no_results')}</li>
      ) : (
        useSearchStore.getState().quickSwitcher.recent.map((p, i) => (
          <li
            key={p}
            role="option"
            aria-selected={i === selectedIndex ? 'true' : 'false'}
            className={
              'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ' +
              (i === selectedIndex ? 'bg-accent text-accent-foreground border-l-2 border-primary' : '')
            }
            onMouseEnter={() => useSearchStore.getState().quickSwitcher.setSelectedIndex(i)}
            onClick={() => {
              navigate('/editor/' + encodeURIComponent(p))
              close()
            }}
          >
            <span className="truncate">{p}</span>
          </li>
        ))
      )}
    </>
  ) : items.length === 0 ? (
    <li className="px-3 py-2 text-sm text-muted-foreground">{t('search.no_results')}</li>
  ) : (
    items.map((it, i) => (
      <li
        key={it.path}
        role="option"
        aria-selected={i === selectedIndex ? 'true' : 'false'}
        className={
          'flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer ' +
          (i === selectedIndex ? 'bg-accent text-accent-foreground border-l-2 border-primary' : '')
        }
        onMouseEnter={() => useSearchStore.getState().quickSwitcher.setSelectedIndex(i)}
        onClick={() => {
          pushRecent(it.path)
          navigate('/editor/' + encodeURIComponent(it.path))
          close()
        }}
      >
        <div className="flex flex-col min-w-0">
          <span className="font-medium truncate">{it.title ?? it.path}</span>
          <span className="text-xs text-muted-foreground truncate">{it.path}</span>
        </div>
        {it.clipped_at ? (
          <span className="text-xs text-muted-foreground shrink-0">{it.clipped_at}</span>
        ) : null}
      </li>
    ))
  )}
</ul>
```

- [ ] **Step 4: Re-run the test**

```bash
npx vitest run src/components/search/QuickSwitcher.test.tsx
```

Expected: PASS for all tests in the file.

- [ ] **Step 5: Manual smoke test**

```bash
npm run dev
```

In the running app:
- Press Cmd+P (or Ctrl+P) — modal opens centered, 600px wide, anchored 15vh from top.
- Type something — input updates; if no grove is open, list shows "无匹配结果".
- Press Esc — modal closes.

If the app errors on startup because Plan 2's IPC channel `search.quickSwitch` isn't registered, scroll back to Plan 2 task 6 step 5 and confirm the channel is wired.

- [ ] **Step 6: Commit**

```bash
git add src/components/search/QuickSwitcher.tsx src/components/search/QuickSwitcher.test.tsx
git commit -m "feat(phase-08): QuickSwitcher row render + selected-state visual + recent fallback"
```

---

## Self-review checklist

- [ ] `useSearchStore` has the actions: `open`, `close`, `setQuery`, `runQuery`, `scheduleQuery`, `moveSelection`, `setSelectedIndex`, `pushRecent`.
- [ ] `runQuery` discards stale results when `requestId` mismatches.
- [ ] `scheduleQuery` debounces 80ms and only fires the latest query.
- [ ] `pushRecent` dedupes and caps at 10; `pushRecentFile` is the imperative export.
- [ ] `useGlobalHotkeys` registers Cmd+P (preventDefault) and is mounted in `<App />`.
- [ ] QuickSwitcher uses Radix Dialog for portal + focus trap + Esc handling.
- [ ] Modal is 600px wide, anchored 15vh from top.
- [ ] `↑/↓` move selection; `Enter` → `/editor/<encodedPath>`; `Cmd/Ctrl+Enter` → `/library?focus=<encodedPath>`; row `onClick` mirrors Enter.
- [ ] Empty `q` shows "最近打开" header + recent paths; non-empty `q` with no results shows "无匹配结果".
- [ ] All seven OpenSpec labels (5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7) appear exactly once as `<!-- openspec-task: ... -->` annotations.
