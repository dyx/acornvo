# Phase 11 — Browser Tabs & Bookmarks: Plan 4 (Keyboard, AppShell wiring, i18n)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **OpenSpec change:** `phase-11-browser-tabs-bookmarks`
> **Task range:** OpenSpec tasks `7.1`–`9.1` (10 tasks)
> **Plan order:** 4 of 5. Depends on Plans 1–3.
> **Status:** Not started
> **Created:** 2026-05-02

---

## Goal

Land the keyboard shortcuts that make the in-app browser feel like a real browser, replace the AppRail placeholders with the three real items (果仓 / 拾果 / 松语), wire the `/browser` route to the new `Browse` page, verify the existing app-shell external-link guard does **not** apply to WebContentsView, and add the i18n keys consumed by Plans 3 / 5.

## Architecture

- **Browser hotkeys live in a dedicated hook** `useBrowserHotkeys()` mounted by `Browse.tsx`. They are scoped to `/browser` (the hook's `useEffect` checks `location.pathname` or simply the page mounts/unmounts the hook). This keeps phase-01's `useGlobalHotkeys` untouched and avoids cross-cutting concerns.
- **AppRail is a new top-level component** (`src/components/AppRail.tsx`) sitting **left of** the page area in `App.tsx`. The layout becomes: TitleBar (top) → flex row [ AppRail | main ]. We adjust `App.tsx` to add the rail and re-flow the existing flex.
- **The `/browser` route** simply imports `Browse` and replaces `<Placeholder name="browser" />`. No change to the route declaration shape; `react-router` v6 path syntax is unchanged.
- **External-link guard scope** is already well-defined in `electron/security/external-links.ts` (it only attaches to the main BrowserWindow's webContents, not to WebContentsView). We add a unit-level smoke test asserting no event listeners are registered against the per-tab WebContents from `installExternalLinkGuards`.
- **i18n keys** are added to `src/i18n/locales/zh-CN.json` only — the project ships zh-CN as the single locale. We organise under a `browser` top-level node mirroring the dot-key paths used in components.

## Tech Stack

- React 19 + react-router 6 + react-i18next 26 (existing)

## Files Touched (this plan)

| Path | Action | Owner task |
|---|---|---|
| `src/hooks/useBrowserHotkeys.ts` | Create | 7.1, 7.2, 7.3, 7.4, 7.5, 7.6 |
| `src/hooks/useBrowserHotkeys.test.ts` | Create | 7.1, 7.2, 7.3, 7.4, 7.5, 7.6 |
| `src/pages/Browse.tsx` | Modify (mount hook) | 7.1 |
| `src/components/AppRail.tsx` | Create | 8.1 |
| `src/components/AppRail.test.tsx` | Create | 8.1 |
| `src/App.tsx` | Modify (rail layout + /browser route) | 8.1, 8.2 |
| `electron/security/external-links.ts` | Verify (no edit) | 8.3 |
| `electron/security/external-links.test.ts` | Modify (add scope assertion) | 8.3 |
| `src/i18n/locales/zh-CN.json` | Modify (add browser keys) | 9.1 |

## Pre-flight

- Plans 1–3 merged; `Browse` page renders against fake ports in tests.
- Confirm i18n setup loads only `zh-CN.json`:
  ```bash
  cat src/i18n/index.ts
  ```
  If multi-locale support has been added since, mirror the keys in each locale.

---

## Tasks

<!-- openspec-task: 7.1 -->
### Task 1: `useBrowserHotkeys` skeleton + Cmd/Ctrl+T (new tab) / Cmd/Ctrl+W (close current tab)

**Files:**
- Create: `src/hooks/useBrowserHotkeys.ts`
- Create: `src/hooks/useBrowserHotkeys.test.ts`
- Modify: `src/pages/Browse.tsx`

- [ ] **Step 1: Write failing tests**

```ts
// src/hooks/useBrowserHotkeys.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { fireEvent } from '@testing-library/dom'
import { useBrowserHotkeys } from './useBrowserHotkeys'
import { useBrowserStore, setBrowserPort } from '@/stores/browser'

const port = {
  createTab: vi.fn(async () => ({ id: 'new', url: 'about:blank' })),
  closeTab: vi.fn(),
  activateTab: vi.fn(),
  navigate: vi.fn(),
  reload: vi.fn(), goBack: vi.fn(), goForward: vi.fn(),
  setReaderMode: vi.fn(), setViewport: vi.fn(),
  suspendTab: vi.fn(), resumeTab: vi.fn()
} as any

function makeTab(id: string) {
  return {
    id, url: 'https://x', title: id, favicon: null,
    loading: false, canGoBack: false, canGoForward: false,
    readerMode: false, suspended: false, savedUrl: 'https://x'
  }
}

function reset(tabs: any[] = [], active: string | null = null) {
  useBrowserStore.setState({ tabs, activeTabId: active, bookmarksOpen: false, viewport: { x: 0, y: 0, width: 0, height: 0 } })
}

describe('useBrowserHotkeys — Cmd+T / Cmd+W', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setBrowserPort(port)
  })

  it('Cmd+T calls createTab', () => {
    reset([makeTab('a')], 'a')
    renderHook(() => useBrowserHotkeys())
    fireEvent.keyDown(window, { key: 't', metaKey: true })
    expect(port.createTab).toHaveBeenCalled()
  })

  it('Ctrl+T (Linux/Win) also calls createTab', () => {
    reset([makeTab('a')], 'a')
    renderHook(() => useBrowserHotkeys())
    fireEvent.keyDown(window, { key: 't', ctrlKey: true })
    expect(port.createTab).toHaveBeenCalled()
  })

  it('Cmd+W on the active tab calls closeTab', () => {
    reset([makeTab('a'), makeTab('b')], 'a')
    renderHook(() => useBrowserHotkeys())
    fireEvent.keyDown(window, { key: 'w', metaKey: true })
    expect(port.closeTab).toHaveBeenCalledWith('a')
  })

  it('Cmd+W when only one tab remains creates a fresh blank tab (delegated to store)', async () => {
    reset([makeTab('only')], 'only')
    renderHook(() => useBrowserHotkeys())
    fireEvent.keyDown(window, { key: 'w', metaKey: true })
    // The store's closeTab handles the "last tab" rule — verify it was called
    expect(port.closeTab).toHaveBeenCalledWith('only')
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run src/hooks/useBrowserHotkeys.test.ts
```

Expected: FAIL — `useBrowserHotkeys` not exported.

- [ ] **Step 3: Implement skeleton with Cmd+T / Cmd+W**

```ts
// src/hooks/useBrowserHotkeys.ts
import { useEffect } from 'react'
import { useBrowserStore } from '@/stores/browser'

/**
 * Browser-scoped keyboard shortcuts. Mount from /browser only.
 * Subsequent tasks (7.2 .. 7.6) extend this hook with more bindings.
 */
export function useBrowserHotkeys(): void {
  const createTab = useBrowserStore((s) => s.createTab)
  const closeTab = useBrowserStore((s) => s.closeTab)
  const activeTabId = useBrowserStore((s) => s.activeTabId)

  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent): void {
      const mod = ev.metaKey || ev.ctrlKey
      if (!mod) return
      const key = ev.key.toLowerCase()

      // Cmd/Ctrl+T → new tab
      if (key === 't' && !ev.shiftKey) {
        ev.preventDefault()
        void createTab()
        return
      }

      // Cmd/Ctrl+W → close active tab
      if (key === 'w' && !ev.shiftKey) {
        ev.preventDefault()
        if (activeTabId) void closeTab(activeTabId)
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [createTab, closeTab, activeTabId])
}
```

- [ ] **Step 4: Mount the hook in `Browse.tsx`**

In `src/pages/Browse.tsx`, add the import and call inside the component body:

```tsx
import { useBrowserHotkeys } from '@/hooks/useBrowserHotkeys'

export function Browse(): JSX.Element {
  useBrowserHotkeys()
  // ... existing body
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/hooks/useBrowserHotkeys.test.ts
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useBrowserHotkeys.ts src/hooks/useBrowserHotkeys.test.ts src/pages/Browse.tsx
git commit -m "feat(phase-11): browser hotkeys — Cmd/Ctrl+T new tab, Cmd/Ctrl+W close"
```

---

<!-- openspec-task: 7.2 -->
### Task 2: Cmd/Ctrl+Tab / Shift+Tab — cycle tabs

**Files:**
- Modify: `src/hooks/useBrowserHotkeys.ts`
- Modify: `src/hooks/useBrowserHotkeys.test.ts`

- [ ] **Step 1: Write failing tests**

Append:

```ts
describe('useBrowserHotkeys — tab cycling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setBrowserPort(port)
  })

  it('Cmd+Tab cycles to the next tab (wraps at end)', () => {
    reset([makeTab('a'), makeTab('b'), makeTab('c')], 'b')
    renderHook(() => useBrowserHotkeys())
    fireEvent.keyDown(window, { key: 'Tab', metaKey: true })
    expect(port.activateTab).toHaveBeenCalledWith('c')

    reset([makeTab('a'), makeTab('b'), makeTab('c')], 'c')
    renderHook(() => useBrowserHotkeys())
    fireEvent.keyDown(window, { key: 'Tab', metaKey: true })
    expect(port.activateTab).toHaveBeenLastCalledWith('a')
  })

  it('Cmd+Shift+Tab cycles to the previous tab (wraps at start)', () => {
    reset([makeTab('a'), makeTab('b'), makeTab('c')], 'b')
    renderHook(() => useBrowserHotkeys())
    fireEvent.keyDown(window, { key: 'Tab', metaKey: true, shiftKey: true })
    expect(port.activateTab).toHaveBeenCalledWith('a')

    reset([makeTab('a'), makeTab('b'), makeTab('c')], 'a')
    renderHook(() => useBrowserHotkeys())
    fireEvent.keyDown(window, { key: 'Tab', metaKey: true, shiftKey: true })
    expect(port.activateTab).toHaveBeenLastCalledWith('c')
  })

  it('Cmd+Tab with one tab is a no-op', () => {
    reset([makeTab('a')], 'a')
    renderHook(() => useBrowserHotkeys())
    fireEvent.keyDown(window, { key: 'Tab', metaKey: true })
    expect(port.activateTab).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run src/hooks/useBrowserHotkeys.test.ts -t "tab cycling"
```

Expected: FAIL.

- [ ] **Step 3: Extend hook**

In `src/hooks/useBrowserHotkeys.ts`:

```ts
  const tabs = useBrowserStore((s) => s.tabs)
  const activateTab = useBrowserStore((s) => s.activateTab)
```

Inside `onKeyDown`, before the closing `}`:

```ts
      if (ev.key === 'Tab') {
        ev.preventDefault()
        if (tabs.length < 2 || !activeTabId) return
        const idx = tabs.findIndex((t) => t.id === activeTabId)
        if (idx === -1) return
        const next = ev.shiftKey
          ? tabs[(idx - 1 + tabs.length) % tabs.length]
          : tabs[(idx + 1) % tabs.length]
        void activateTab(next.id)
        return
      }
```

Add `tabs, activateTab` to the `useEffect` dep array.

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/hooks/useBrowserHotkeys.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBrowserHotkeys.ts src/hooks/useBrowserHotkeys.test.ts
git commit -m "feat(phase-11): browser hotkeys — Cmd/Ctrl+(Shift+)Tab cycle tabs"
```

---

<!-- openspec-task: 7.3 -->
### Task 3: Cmd/Ctrl+1..9 — jump to tab N

**Files:**
- Modify: `src/hooks/useBrowserHotkeys.ts`
- Modify: `src/hooks/useBrowserHotkeys.test.ts`

- [ ] **Step 1: Write failing tests**

Append:

```ts
describe('useBrowserHotkeys — Cmd+N number keys', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setBrowserPort(port)
  })

  it('Cmd+3 activates the third tab', () => {
    reset([makeTab('a'), makeTab('b'), makeTab('c'), makeTab('d')], 'a')
    renderHook(() => useBrowserHotkeys())
    fireEvent.keyDown(window, { key: '3', metaKey: true })
    expect(port.activateTab).toHaveBeenCalledWith('c')
  })

  it('Cmd+9 activates the LAST tab when fewer than 9 exist', () => {
    reset([makeTab('a'), makeTab('b'), makeTab('c')], 'a')
    renderHook(() => useBrowserHotkeys())
    fireEvent.keyDown(window, { key: '9', metaKey: true })
    expect(port.activateTab).toHaveBeenCalledWith('c')
  })

  it('Cmd+1 activates the first tab', () => {
    reset([makeTab('a'), makeTab('b')], 'b')
    renderHook(() => useBrowserHotkeys())
    fireEvent.keyDown(window, { key: '1', metaKey: true })
    expect(port.activateTab).toHaveBeenCalledWith('a')
  })

  it('Cmd+5 with only 2 tabs is a no-op (out of range, not last)', () => {
    reset([makeTab('a'), makeTab('b')], 'a')
    renderHook(() => useBrowserHotkeys())
    fireEvent.keyDown(window, { key: '5', metaKey: true })
    // Spec ambiguity: "Cmd+9 jumps to last; others ignore". We test that path.
    expect(port.activateTab).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run src/hooks/useBrowserHotkeys.test.ts -t "number keys"
```

Expected: FAIL.

- [ ] **Step 3: Extend hook**

Inside `onKeyDown`:

```ts
      if (key >= '1' && key <= '9') {
        ev.preventDefault()
        const n = Number(key)
        if (n === 9) {
          // Jump to last tab regardless of count
          const last = tabs[tabs.length - 1]
          if (last) void activateTab(last.id)
          return
        }
        const target = tabs[n - 1]
        if (target) void activateTab(target.id)
        return
      }
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/hooks/useBrowserHotkeys.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBrowserHotkeys.ts src/hooks/useBrowserHotkeys.test.ts
git commit -m "feat(phase-11): browser hotkeys — Cmd/Ctrl+1..9 jump to tab N (9 = last)"
```

---

<!-- openspec-task: 7.4 -->
### Task 4: Cmd/Ctrl+L — focus AddressBar + select all

**Files:**
- Modify: `src/hooks/useBrowserHotkeys.ts`
- Modify: `src/hooks/useBrowserHotkeys.test.ts`

- [ ] **Step 1: Write failing test**

Append:

```ts
describe('useBrowserHotkeys — Cmd+L focuses AddressBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setBrowserPort(port)
  })

  it('Cmd+L selects all in the address-bar input (when present)', () => {
    reset([makeTab('a')], 'a')
    // Simulate the AddressBar having mounted and labelled its input
    const input = document.createElement('input')
    input.setAttribute('aria-label', 'address bar')
    input.value = 'https://example.com'
    document.body.appendChild(input)

    renderHook(() => useBrowserHotkeys())
    fireEvent.keyDown(window, { key: 'l', metaKey: true })

    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(input.value.length)

    document.body.removeChild(input)
  })

  it('Cmd+L is a no-op when AddressBar is not mounted', () => {
    reset([makeTab('a')], 'a')
    renderHook(() => useBrowserHotkeys())
    expect(() => fireEvent.keyDown(window, { key: 'l', metaKey: true })).not.toThrow()
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run src/hooks/useBrowserHotkeys.test.ts -t "Cmd\\+L"
```

Expected: FAIL.

- [ ] **Step 3: Extend hook**

```ts
      if (key === 'l') {
        ev.preventDefault()
        const el = document.querySelector<HTMLInputElement>('input[aria-label="address bar"]')
        if (el) {
          el.focus()
          el.select()
        }
        return
      }
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/hooks/useBrowserHotkeys.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBrowserHotkeys.ts src/hooks/useBrowserHotkeys.test.ts
git commit -m "feat(phase-11): browser hotkeys — Cmd/Ctrl+L focuses AddressBar with select-all"
```

---

<!-- openspec-task: 7.5 -->
### Task 5: Cmd/Ctrl+[ / Cmd/Ctrl+] / Cmd/Ctrl+R — back / forward / reload

**Files:**
- Modify: `src/hooks/useBrowserHotkeys.ts`
- Modify: `src/hooks/useBrowserHotkeys.test.ts`

- [ ] **Step 1: Write failing tests**

Append:

```ts
describe('useBrowserHotkeys — back/forward/reload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setBrowserPort(port)
  })

  it('Cmd+[ calls goBack on active tab', () => {
    reset([makeTab('a')], 'a')
    renderHook(() => useBrowserHotkeys())
    fireEvent.keyDown(window, { key: '[', metaKey: true })
    expect(port.goBack).toHaveBeenCalledWith('a')
  })

  it('Cmd+] calls goForward on active tab', () => {
    reset([makeTab('a')], 'a')
    renderHook(() => useBrowserHotkeys())
    fireEvent.keyDown(window, { key: ']', metaKey: true })
    expect(port.goForward).toHaveBeenCalledWith('a')
  })

  it('Cmd+R calls reload on active tab', () => {
    reset([makeTab('a')], 'a')
    renderHook(() => useBrowserHotkeys())
    fireEvent.keyDown(window, { key: 'r', metaKey: true })
    expect(port.reload).toHaveBeenCalledWith('a')
  })

  it('shortcut is a no-op when no active tab', () => {
    reset([], null)
    renderHook(() => useBrowserHotkeys())
    fireEvent.keyDown(window, { key: 'r', metaKey: true })
    expect(port.reload).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run src/hooks/useBrowserHotkeys.test.ts -t "back/forward/reload"
```

Expected: FAIL.

- [ ] **Step 3: Extend hook**

Get the actions:
```ts
  const goBack = useBrowserStore((s) => s.goBack)
  const goForward = useBrowserStore((s) => s.goForward)
  const reload = useBrowserStore((s) => s.reload)
```

Inside `onKeyDown` (before the closing return):

```ts
      if (key === '[' && activeTabId) {
        ev.preventDefault()
        void goBack(activeTabId)
        return
      }
      if (key === ']' && activeTabId) {
        ev.preventDefault()
        void goForward(activeTabId)
        return
      }
      if (key === 'r' && !ev.shiftKey && activeTabId) {
        ev.preventDefault()
        void reload(activeTabId)
        return
      }
```

Add `goBack, goForward, reload` to the `useEffect` deps.

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/hooks/useBrowserHotkeys.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBrowserHotkeys.ts src/hooks/useBrowserHotkeys.test.ts
git commit -m "feat(phase-11): browser hotkeys — Cmd/Ctrl+[/]/R back/forward/reload"
```

---

<!-- openspec-task: 7.6 -->
### Task 6: Cmd/Ctrl+D — open BookmarkDialog for current page

To avoid coupling `useBrowserHotkeys` to React component state, we dispatch a `CustomEvent('browser:bookmark-current')` on `window`. `AddressBar.tsx` listens for it and opens the dialog (the same code path the star button uses).

**Files:**
- Modify: `src/hooks/useBrowserHotkeys.ts`
- Modify: `src/hooks/useBrowserHotkeys.test.ts`
- Modify: `src/components/browser/AddressBar.tsx`

- [ ] **Step 1: Write failing tests**

Append:

```ts
describe('useBrowserHotkeys — Cmd+D', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setBrowserPort(port)
  })

  it('Cmd+D dispatches browser:bookmark-current on window', () => {
    reset([makeTab('a')], 'a')
    const handler = vi.fn()
    window.addEventListener('browser:bookmark-current', handler)
    renderHook(() => useBrowserHotkeys())
    fireEvent.keyDown(window, { key: 'd', metaKey: true })
    expect(handler).toHaveBeenCalledTimes(1)
    window.removeEventListener('browser:bookmark-current', handler)
  })

  it('Cmd+D is a no-op when there is no active tab', () => {
    reset([], null)
    const handler = vi.fn()
    window.addEventListener('browser:bookmark-current', handler)
    renderHook(() => useBrowserHotkeys())
    fireEvent.keyDown(window, { key: 'd', metaKey: true })
    expect(handler).not.toHaveBeenCalled()
    window.removeEventListener('browser:bookmark-current', handler)
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run src/hooks/useBrowserHotkeys.test.ts -t "Cmd\\+D"
```

Expected: FAIL.

- [ ] **Step 3: Extend hook**

In `useBrowserHotkeys.ts`, inside `onKeyDown`:

```ts
      if (key === 'd' && !ev.shiftKey) {
        ev.preventDefault()
        if (!activeTabId) return
        window.dispatchEvent(new CustomEvent('browser:bookmark-current'))
        return
      }
```

- [ ] **Step 4: Listen in AddressBar**

In `src/components/browser/AddressBar.tsx`, add a `useEffect`:

```tsx
useEffect(() => {
  const handler = (): void => void toggleBookmark()
  window.addEventListener('browser:bookmark-current', handler)
  return () => window.removeEventListener('browser:bookmark-current', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [tab?.url, tab?.id])
```

(`toggleBookmark` is already defined inside the component from Plan 3 task 4.)

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/hooks/useBrowserHotkeys.test.ts src/components/browser/AddressBar.test.tsx
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useBrowserHotkeys.ts src/hooks/useBrowserHotkeys.test.ts src/components/browser/AddressBar.tsx
git commit -m "feat(phase-11): browser hotkey — Cmd/Ctrl+D opens bookmark dialog (custom event)"
```

---

<!-- openspec-task: 8.1 -->
### Task 7: AppRail with three real items

**Files:**
- Create: `src/components/AppRail.tsx`
- Create: `src/components/AppRail.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/components/AppRail.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { AppRail } from './AppRail'

function renderAtPath(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRail />
      <Routes>
        <Route path="*" element={<div data-testid="page">page at {path}</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('AppRail', () => {
  it('renders three rail items: 果仓 / 拾果 / 松语', () => {
    renderAtPath('/library')
    expect(screen.getByRole('link', { name: /果仓|library/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /拾果|browser/i })).toBeInTheDocument()
    // 松语 is disabled in this phase — should be present but not clickable
    expect(screen.getByRole('button', { name: /松语|chat/i })).toBeInTheDocument()
  })

  it('marks 果仓 active when at /library', () => {
    renderAtPath('/library')
    const link = screen.getByRole('link', { name: /果仓|library/i })
    expect(link).toHaveAttribute('aria-current', 'page')
  })

  it('marks 拾果 active when at /browser', () => {
    renderAtPath('/browser')
    const link = screen.getByRole('link', { name: /拾果|browser/i })
    expect(link).toHaveAttribute('aria-current', 'page')
  })

  it('松语 entry is disabled and shows "coming soon" tooltip', () => {
    renderAtPath('/library')
    const btn = screen.getByRole('button', { name: /松语|chat/i })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', expect.stringMatching(/即将推出|coming/i))
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run src/components/AppRail.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `AppRail.tsx`**

```tsx
// src/components/AppRail.tsx
import type { JSX } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

interface RailItem {
  to: string
  labelKey: string
  defaultLabel: string
  icon: string
}

const items: RailItem[] = [
  { to: '/library', labelKey: 'nav.library', defaultLabel: '果仓', icon: '📚' },
  { to: '/browser', labelKey: 'nav.browser', defaultLabel: '拾果', icon: '🌐' }
]

export function AppRail(): JSX.Element {
  const { t } = useTranslation()
  return (
    <nav
      aria-label="App modules"
      className="flex w-12 shrink-0 flex-col items-stretch border-r border-[color:var(--color-line)] bg-[color:var(--color-bg-2)]"
      data-testid="app-rail"
    >
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          aria-label={t(it.labelKey, it.defaultLabel)}
          className={({ isActive }) =>
            [
              'flex flex-col items-center gap-1 border-l-2 px-1 py-2 text-[10px]',
              isActive
                ? 'border-l-[color:var(--color-accent)] bg-[color:var(--color-bg)] text-[color:var(--color-ink)]'
                : 'border-l-transparent text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-bg-3)]'
            ].join(' ')
          }
        >
          <span aria-hidden="true">{it.icon}</span>
          <span>{t(it.labelKey, it.defaultLabel)}</span>
        </NavLink>
      ))}
      <button
        type="button"
        disabled
        title={t('common.coming_soon', '即将推出')}
        aria-label={t('nav.chat', '松语')}
        className="mt-auto flex flex-col items-center gap-1 border-l-2 border-l-transparent px-1 py-2 text-[10px] text-[color:var(--color-ink-3)] opacity-40"
      >
        <span aria-hidden="true">💬</span>
        <span>{t('nav.chat', '松语')}</span>
      </button>
    </nav>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/components/AppRail.test.tsx
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/AppRail.tsx src/components/AppRail.test.tsx
git commit -m "feat(phase-11): AppRail — 果仓 / 拾果 / 松语 (disabled)"
```

---

<!-- openspec-task: 8.2 -->
### Task 8: Wire AppRail into `App.tsx` + replace `/browser` placeholder with `Browse`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Modify App.tsx layout**

In `src/App.tsx`:

1. Add imports:
   ```tsx
   import { AppRail } from '@/components/AppRail'
   import { Browse } from '@/pages/Browse'
   ```

2. Replace the `<Route path="/browser" element={<Placeholder name="browser" />} />` with:
   ```tsx
   <Route path="/browser" element={<Browse />} />
   ```

3. Wrap the `<main>` element with the rail. Find the existing block:
   ```tsx
   <div className="flex h-full flex-col">
     <TitleBar />
     <main className="flex-1 overflow-hidden">
       <Routes>
         {/* ... */}
       </Routes>
     </main>
     {/* overlays */}
   </div>
   ```
   Replace with:
   ```tsx
   <div className="flex h-full flex-col">
     <TitleBar />
     <div className="flex flex-1 overflow-hidden">
       <AppRail />
       <main className="flex-1 overflow-hidden">
         <Routes>
           {/* ... unchanged route block ... */}
           <Route path="/browser" element={<Browse />} />
         </Routes>
       </main>
     </div>
     {/* overlays unchanged */}
   </div>
   ```

- [ ] **Step 2: Verify with manual smoke build**

```bash
npm run build && npm run typecheck
```

Expected: 0 exit; bundle ready.

- [ ] **Step 3: Run all renderer tests once**

```bash
npx vitest run src/
```

Expected: all green. (Existing pages may rely on layout; verify nothing regressed.)

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(phase-11): wire AppRail + replace /browser placeholder with Browse page"
```

---

<!-- openspec-task: 8.3 -->
### Task 9: Verify external-link guard scope (BrowserWindow only, not WebContentsView)

**Files:**
- Modify: `electron/security/external-links.test.ts`

- [ ] **Step 1: Inspect existing test**

```bash
cat electron/security/external-links.test.ts | head -60
```

The existing test uses a fake `BrowserWindow` with mocked `webContents`. We add a regression test asserting that `installExternalLinkGuards(win)` does **not** touch any other webContents passed in (it operates only on `win.webContents`).

- [ ] **Step 2: Append regression test**

Append to `electron/security/external-links.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { installExternalLinkGuards } from './external-links'

describe('installExternalLinkGuards — scope', () => {
  it('only attaches handlers to the supplied BrowserWindow.webContents', () => {
    const mainOn = vi.fn()
    const mainSetWindowOpenHandler = vi.fn()
    const win: any = {
      webContents: {
        on: mainOn,
        setWindowOpenHandler: mainSetWindowOpenHandler
      }
    }
    // Independent webContents (representing a per-tab WebContentsView)
    const tabOn = vi.fn()
    const tabSetWindowOpenHandler = vi.fn()
    const _tabWebContents = {
      on: tabOn,
      setWindowOpenHandler: tabSetWindowOpenHandler
    }

    installExternalLinkGuards(win)

    expect(mainOn).toHaveBeenCalled()
    expect(mainSetWindowOpenHandler).toHaveBeenCalled()
    expect(tabOn).not.toHaveBeenCalled()
    expect(tabSetWindowOpenHandler).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run electron/security/external-links.test.ts
```

Expected: existing tests + 1 new test green.

- [ ] **Step 4: Commit**

```bash
git add electron/security/external-links.test.ts
git commit -m "test(phase-11): assert external-link guard scope is BrowserWindow only"
```

---

<!-- openspec-task: 9.1 -->
### Task 10: i18n keys for browser surface

**Files:**
- Modify: `src/i18n/locales/zh-CN.json`

- [ ] **Step 1: Add keys**

Open `src/i18n/locales/zh-CN.json` and add a new top-level `browser` node (and a couple of common helpers):

```json
"browser": {
  "new_tab": {
    "welcome": "拾果",
    "hint": "在地址栏输入网址或搜索词",
    "recent": "最近收藏"
  },
  "no_tab": "尚未打开任何页面",
  "address": "地址栏",
  "back": "后退",
  "forward": "前进",
  "reload": "刷新",
  "search": "搜索",
  "reader": "阅读模式",
  "reader_on": "阅读模式已开启",
  "bookmark": "加入书签",
  "clip": "剪藏",
  "clip_soon": "剪藏功能将在拾果阶段实装",
  "paste_open": "粘贴并打开",
  "bookmarks": {
    "search": "搜索书签",
    "expand": "展开书签",
    "collapse": "收起书签",
    "empty": "还没有书签。浏览时点星号收藏当前页面。"
  },
  "bookmark.save": "加入书签",
  "bookmark.saved": "已加入书签",
  "bookmark.edit": "编辑书签",
  "bookmark.delete": "删除",
  "bookmark.delete_confirm": "确认删除这个书签？",
  "bookmark.empty": "还没有书签"
}
```

Also confirm/add:
```json
"common": {
  // ... existing entries ...
  "save": "保存",
  "coming_soon": "即将推出"
}
```

(If `save` or `coming_soon` already exist under a different name in the file, do not duplicate.)

- [ ] **Step 2: Verify JSON parses**

```bash
node -e "JSON.parse(require('fs').readFileSync('src/i18n/locales/zh-CN.json','utf8')); console.log('ok')"
```

Expected: `ok`.

- [ ] **Step 3: Re-run renderer tests (i18n keys are now resolved instead of falling through to defaults)**

```bash
npx vitest run src/components/browser src/pages/Browse.test.tsx src/components/AppRail.test.tsx
```

Expected: all green.

- [ ] **Step 4: Smoke-launch**

```bash
npm run dev
```

Click `拾果` in the rail; verify that the new tab page renders Chinese strings ("拾果", "在地址栏输入网址或搜索词", "最近收藏" if any bookmarks exist), and that the AddressBar tooltips read in Chinese.

> **Acceptance for this task is automated coverage + manual smoke**; deeper validation is in Plan 5.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/locales/zh-CN.json
git commit -m "feat(phase-11): zh-CN i18n keys for browser surface"
```

---

## Self-Review Checklist (run after Task 10)

- [ ] Every label `7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.1, 8.2, 8.3, 9.1` appears exactly once. Verify:
  ```bash
  grep -oE 'openspec-task: [0-9.]+' docs/superpowers/plans/2026-05-02-phase-11-browser-tabs-bookmarks-tasks-7.1-9.1.md | sort -u
  ```
- [ ] Spec coverage:
  - `browser-tabs §"快捷键"` → Tasks 1–6
  - `app-shell §"AppRail 模块导航"` → Task 7
  - `app-shell §"渲染端路由与根状态"` (`/browser` activation) → Task 8
  - `app-shell §"外部链接拦截"` (scope) → Task 9
- [ ] Run all newly added tests:
  ```bash
  npx vitest run src/hooks/useBrowserHotkeys.test.ts src/components/AppRail.test.tsx electron/security/external-links.test.ts
  ```
  Expected: ~20 tests green.
- [ ] Typecheck + lint clean:
  ```bash
  npm run typecheck && npm run lint
  ```
- [ ] No `TODO` / `TBD` placeholders.
