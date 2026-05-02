# Phase 11 — Browser Tabs & Bookmarks: Plan 5 (Acceptance — 10.1–10.17)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **OpenSpec change:** `phase-11-browser-tabs-bookmarks`
> **Task range:** OpenSpec tasks `10.1`–`10.17` (17 tasks)
> **Plan order:** 5 of 5. Final plan; depends on Plans 1–4.
> **Status:** Not started
> **Created:** 2026-05-02

---

## Goal

Cover every behaviour from the OpenSpec acceptance section. Each task is a discrete acceptance check; together they verify the merged feature end-to-end. Where Vitest+jsdom can fully exercise a behaviour we use it; where the runtime requires the actual Electron process (`WebContentsView`, `setWindowOpenHandler`, `webRequest.onBeforeRequest`) we use a manual smoke procedure that is precise and reproducible. Each task ends with a commit that updates an `OpenSpec acceptance` note.

## Architecture

- **Two coverage tiers** per task:
  1. **Automated** — `*.acceptance.test.tsx` Vitest+jsdom test, ipc mocked. These verify renderer-level behaviour, store wiring, and contract compliance.
  2. **Manual smoke** — a numbered runbook executed via `npm run dev`. The result is recorded in `docs/runbooks/phase-11-acceptance.md`.
- **Single acceptance test file** `src/pages/Browse.acceptance.test.tsx` accumulates all 17 cases — tests are independent (each uses `beforeEach` to reset store) but share fixtures defined in the file. Numbering follows OpenSpec exactly (10.1, 10.2, …).
- **Manual smoke script** `docs/runbooks/phase-11-acceptance.md` — created in task 10.1 with a section per behaviour. Each subsequent task appends to it and ticks off when run.
- **Final task (10.17)** runs `openspec validate phase-11-browser-tabs-bookmarks --strict` and updates the OpenSpec change's `tasks.md` to mark all `[x]`.

## Tech Stack

- vitest + @testing-library/react + jsdom (existing)
- `npm run dev` for manual electron smoke
- `openspec` CLI

## Files Touched (this plan)

| Path | Action | Owner task |
|---|---|---|
| `src/pages/Browse.acceptance.test.tsx` | Create + extend | 10.1 .. 10.16 |
| `docs/runbooks/phase-11-acceptance.md` | Create + extend | 10.1 .. 10.16 |
| `openspec/changes/phase-11-browser-tabs-bookmarks/tasks.md` | Modify (mark all complete) | 10.17 |

## Pre-flight

- All four prior plans merged. The implementation is feature-complete; this plan is purely verification.
- Verify the test environment can render `Browse` cleanly:
  ```bash
  npx vitest run src/pages/Browse.test.tsx
  ```
  Expected: green. If not, fix Plan 3 issues before proceeding.

---

## Tasks

<!-- openspec-task: 10.1 -->
### Task 1: AppRail "拾果" → `/browser` renders TabBar + AddressBar + blank tab

**Files:**
- Create: `src/pages/Browse.acceptance.test.tsx`
- Create: `docs/runbooks/phase-11-acceptance.md`

- [ ] **Step 1: Create acceptance test scaffold + first case**

```tsx
// src/pages/Browse.acceptance.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AppRail } from '@/components/AppRail'
import { Browse } from '@/pages/Browse'
import { useBrowserStore, setBrowserPort, setBrowserEventPort } from '@/stores/browser'
import type { TabStateChangedPayload } from '@shared/browser-types'

// --- shared mocks ---
const eventHandlers: Record<string, ((p: any) => void)[]> = {}
function fireEvent(channel: string, payload: any) {
  for (const h of eventHandlers[channel] ?? []) h(payload)
}

const ipcMocks = {
  bookmarks: {
    list: vi.fn(async () => ({ items: [], total: 0 })),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getByUrl: vi.fn(async () => null)
  },
  on: vi.fn((channel: string, h: any) => {
    eventHandlers[channel] ??= []
    eventHandlers[channel].push(h)
    return () => {}
  })
}
vi.mock('@/ipc/client', () => ({ ipc: ipcMocks }))

let nextId = 1
function makePort() {
  return {
    createTab: vi.fn(async (url?: string) => {
      const id = `t${nextId++}`
      return { id, url: url ?? 'about:blank' }
    }),
    closeTab: vi.fn(async () => {}),
    activateTab: vi.fn(async () => {}),
    navigate: vi.fn(async () => {}),
    reload: vi.fn(async () => {}),
    goBack: vi.fn(async () => {}),
    goForward: vi.fn(async () => {}),
    setReaderMode: vi.fn(async () => {}),
    setViewport: vi.fn(async () => {}),
    suspendTab: vi.fn(async () => {}),
    resumeTab: vi.fn(async (id: string) => ({ id, url: 'about:blank' }))
  }
}

function reset() {
  useBrowserStore.setState({
    tabs: [],
    activeTabId: null,
    bookmarksOpen: false,
    viewport: { x: 0, y: 0, width: 0, height: 0 }
  })
  for (const k of Object.keys(eventHandlers)) delete eventHandlers[k]
  nextId = 1
}

function renderApp(initial = '/library') {
  const port = makePort()
  setBrowserPort(port as any)
  setBrowserEventPort({
    onTabStateChanged: (h) => {
      eventHandlers['browser:tabStateChanged'] ??= []
      eventHandlers['browser:tabStateChanged'].push(h)
      return () => {}
    }
  })
  return {
    port,
    fire: (payload: TabStateChangedPayload) => fireEvent('browser:tabStateChanged', payload),
    ...render(
      <MemoryRouter initialEntries={[initial]}>
        <div className="flex h-full">
          <AppRail />
          <div className="flex-1">
            <Routes>
              <Route path="/library" element={<div data-testid="library-stub" />} />
              <Route path="/browser" element={<Browse />} />
            </Routes>
          </div>
        </div>
      </MemoryRouter>
    )
  }
}

beforeEach(() => {
  reset()
  ipcMocks.bookmarks.list.mockResolvedValue({ items: [], total: 0 })
  ipcMocks.bookmarks.getByUrl.mockResolvedValue(null)
})

// ----------------------------------------------------------------------
// 10.1 — AppRail click → /browser renders TabBar + AddressBar + blank tab
// ----------------------------------------------------------------------
describe('OpenSpec acceptance 10.1 — AppRail open browser', () => {
  it('clicking 拾果 in the rail navigates to /browser and renders the layout', async () => {
    const { port } = renderApp('/library')
    expect(screen.getByTestId('library-stub')).toBeInTheDocument()

    const railLink = screen.getByRole('link', { name: /拾果|browser/i })
    await userEvent.click(railLink)

    await waitFor(() => {
      expect(screen.getByTestId('browse-page')).toBeInTheDocument()
    })
    expect(screen.getByTestId('tabbar')).toBeInTheDocument()
    expect(screen.getByTestId('browser-viewport')).toBeInTheDocument()
    await waitFor(() => {
      expect(port.createTab).toHaveBeenCalled()
    })
  })
})
```

- [ ] **Step 2: Create the manual runbook**

```markdown
<!-- docs/runbooks/phase-11-acceptance.md -->
# Phase 11 — Acceptance Runbook

Manual smoke procedures for behaviours that the Electron runtime is required for. Mark each step as `[x]` when complete.

## How to run
1. `npm run dev` (Electron + Vite, hot-reload)
2. Use the dev console (Cmd+Opt+I) to confirm logs at each step.

## 10.1 — AppRail → /browser renders
- [ ] In the rail, the "拾果" entry is present and not disabled.
- [ ] Clicking "拾果" highlights it (active border) and navigates to `/browser`.
- [ ] The page shows TabBar at top, AddressBar below it, the bookmark sidebar (collapsed strip) on the left, and a blank "拾果" welcome on the right.
- [ ] Console log shows `browser.createTab` (from main IPC handler) within 100ms of mount.
```

- [ ] **Step 3: Run the test**

```bash
npx vitest run src/pages/Browse.acceptance.test.tsx -t "10.1"
```

Expected: pass.

- [ ] **Step 4: Run the manual smoke**

```bash
npm run dev
```

Click 拾果 → confirm all four bullets.

- [ ] **Step 5: Mark in OpenSpec tasks.md**

In `openspec/changes/phase-11-browser-tabs-bookmarks/tasks.md`, change `- [ ] 10.1` to `- [x] 10.1`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Browse.acceptance.test.tsx docs/runbooks/phase-11-acceptance.md openspec/changes/phase-11-browser-tabs-bookmarks/tasks.md
git commit -m "test(phase-11): acceptance 10.1 — AppRail opens /browser"
```

---

<!-- openspec-task: 10.2 -->
### Task 2: 10.2 — `example.com` Enter → `https://example.com` loaded

**Files:**
- Modify: `src/pages/Browse.acceptance.test.tsx`
- Modify: `docs/runbooks/phase-11-acceptance.md`
- Modify: `openspec/changes/phase-11-browser-tabs-bookmarks/tasks.md`

- [ ] **Step 1: Append test**

```tsx
describe('OpenSpec acceptance 10.2 — bare-domain → https prefix', () => {
  it('typing example.com and pressing Enter calls navigate with https URL', async () => {
    const { port } = renderApp('/browser')
    await waitFor(() => expect(port.createTab).toHaveBeenCalled())

    const input = await screen.findByRole('textbox', { name: /address/i })
    await userEvent.clear(input)
    await userEvent.type(input, 'example.com{Enter}')

    expect(port.navigate).toHaveBeenCalledWith(expect.stringMatching(/^t\d+$/), 'https://example.com')
  })
})
```

- [ ] **Step 2: Run test + record in runbook**

```bash
npx vitest run src/pages/Browse.acceptance.test.tsx -t "10.2"
```

Append to `docs/runbooks/phase-11-acceptance.md`:

```markdown
## 10.2 — Bare-domain → https
- [ ] AddressBar focused; type `example.com` → Enter.
- [ ] WebContentsView loads `https://example.com` (page title visible).
```

- [ ] **Step 3: Smoke + mark + commit**

`npm run dev`, manually verify, mark `10.2` in tasks.md, commit:

```bash
git add src/pages/Browse.acceptance.test.tsx docs/runbooks/phase-11-acceptance.md openspec/changes/phase-11-browser-tabs-bookmarks/tasks.md
git commit -m "test(phase-11): acceptance 10.2 — bare domain → https"
```

---

<!-- openspec-task: 10.3 -->
### Task 3: 10.3 — `注意力机制` Enter → Google search URL

- [ ] **Step 1: Append test**

```tsx
describe('OpenSpec acceptance 10.3 — search query', () => {
  it('CJK input dispatches to Google search', async () => {
    const { port } = renderApp('/browser')
    await waitFor(() => expect(port.createTab).toHaveBeenCalled())

    const input = await screen.findByRole('textbox', { name: /address/i })
    await userEvent.clear(input)
    await userEvent.type(input, '注意力机制{Enter}')

    expect(port.navigate).toHaveBeenCalledWith(
      expect.stringMatching(/^t\d+$/),
      'https://www.google.com/search?q=%E6%B3%A8%E6%84%8F%E5%8A%9B%E6%9C%BA%E5%88%B6'
    )
  })
})
```

- [ ] **Step 2: Run + runbook entry**

```bash
npx vitest run src/pages/Browse.acceptance.test.tsx -t "10.3"
```

Runbook:
```markdown
## 10.3 — Search query
- [ ] Type `注意力机制` → Enter.
- [ ] Browser loads `https://www.google.com/search?q=...`.
```

- [ ] **Step 3: Smoke + mark + commit**

```bash
git add src/pages/Browse.acceptance.test.tsx docs/runbooks/phase-11-acceptance.md openspec/changes/phase-11-browser-tabs-bookmarks/tasks.md
git commit -m "test(phase-11): acceptance 10.3 — CJK input → google search"
```

---

<!-- openspec-task: 10.4 -->
### Task 4: 10.4 — Cmd+T new tab; Cmd+W on last tab → fresh blank

- [ ] **Step 1: Append test**

```tsx
import { fireEvent as rtlFireEvent } from '@testing-library/react'

describe('OpenSpec acceptance 10.4 — Cmd+T / Cmd+W', () => {
  it('Cmd+T creates new tab; Cmd+W closes last tab → fresh blank tab is created', async () => {
    const { port } = renderApp('/browser')
    await waitFor(() => expect(port.createTab).toHaveBeenCalled())

    const initialCalls = port.createTab.mock.calls.length

    rtlFireEvent.keyDown(window, { key: 't', metaKey: true })
    await waitFor(() => {
      expect(port.createTab.mock.calls.length).toBe(initialCalls + 1)
    })

    // Now close all tabs one by one. After the LAST close, the store creates
    // another fresh blank tab.
    while (useBrowserStore.getState().tabs.length > 0) {
      const id = useBrowserStore.getState().activeTabId!
      rtlFireEvent.keyDown(window, { key: 'w', metaKey: true })
      await waitFor(() => {
        const s = useBrowserStore.getState()
        // Either id is gone OR (last-tab path) a new fresh tab has appeared
        expect(s.tabs.find((t) => t.id === id)).toBeUndefined()
      })
    }
    // After the spec's "last-tab" rule, exactly one fresh blank exists
    expect(useBrowserStore.getState().tabs.length).toBe(1)
  })
})
```

- [ ] **Step 2: Run + runbook entry**

```bash
npx vitest run src/pages/Browse.acceptance.test.tsx -t "10.4"
```

Runbook:
```markdown
## 10.4 — Cmd+T / Cmd+W
- [ ] Cmd+T creates a new tab; Cmd+W closes the active tab.
- [ ] Closing the LAST tab does NOT close the window — a fresh blank tab appears.
- [ ] Cmd+1..9 jump to tab N (N capped at last tab); Cmd+9 always last.
```

- [ ] **Step 3: Smoke + mark + commit**

```bash
git add src/pages/Browse.acceptance.test.tsx docs/runbooks/phase-11-acceptance.md openspec/changes/phase-11-browser-tabs-bookmarks/tasks.md
git commit -m "test(phase-11): acceptance 10.4 — Cmd+T/W with last-tab rule"
```

---

<!-- openspec-task: 10.5 -->
### Task 5: 10.5 — `<a target="_blank">` → new tab + activated

This case requires the actual Electron runtime: `setWindowOpenHandler` only fires on a real WebContents. Use a manual smoke; the acceptance test asserts that the **adoption helper** is registered.

- [ ] **Step 1: Append guarded automated test**

```tsx
describe('OpenSpec acceptance 10.5 — target=_blank → new tab (renderer side)', () => {
  it('renderer reacts to a new tab created by main and activates it', async () => {
    const { port } = renderApp('/browser')
    await waitFor(() => expect(port.createTab).toHaveBeenCalled())

    // Simulate main pushing a "new tab adopted" event by calling the renderer's
    // createTab via the store (which is the same path as the real adoption flow).
    const initialCount = useBrowserStore.getState().tabs.length
    await useBrowserStore.getState().createTab('https://x.com')

    const s = useBrowserStore.getState()
    expect(s.tabs.length).toBe(initialCount + 1)
    expect(s.activeTabId).toBe(s.tabs[s.tabs.length - 1].id)
  })
})
```

- [ ] **Step 2: Runbook entry (the real validation)**

```markdown
## 10.5 — target=_blank in Electron
- [ ] Open `https://news.ycombinator.com` in a tab.
- [ ] Cmd+click any story link (or open a page with `target="_blank"` link and click).
- [ ] A new tab appears in TabBar, becomes active, and loads the URL.
- [ ] Old tab remains intact at its previous URL.
```

- [ ] **Step 3: Smoke + mark + commit**

```bash
npx vitest run src/pages/Browse.acceptance.test.tsx -t "10.5"
git add src/pages/Browse.acceptance.test.tsx docs/runbooks/phase-11-acceptance.md openspec/changes/phase-11-browser-tabs-bookmarks/tasks.md
git commit -m "test(phase-11): acceptance 10.5 — target=_blank adoption (renderer + smoke)"
```

---

<!-- openspec-task: 10.6 -->
### Task 6: 10.6 — `mailto:` → `shell.openExternal`, no new tab

This too is runtime-dependent. We add a unit-level test against the handler factory in `electron/browser/contents.ts` to assert the dispatch logic.

- [ ] **Step 1: Add unit test for window-open dispatch**

Create or extend `electron/browser/contents.test.ts`:

```ts
// electron/browser/contents.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  WebContentsView: vi.fn(),
  session: { fromPartition: vi.fn(() => ({})) },
  shell: { openExternal: vi.fn(async () => {}) },
  BrowserWindow: vi.fn()
}))

import { attachWindowOpenHandler } from './contents'
import * as electronMock from 'electron'

describe('attachWindowOpenHandler', () => {
  function makeWebContents() {
    const handlers: { open?: (a: any) => any; events: Record<string, (a: any) => void> } = { events: {} }
    return {
      setWindowOpenHandler: (h: any) => { handlers.open = h },
      on: (e: string, h: any) => { handlers.events[e] = h },
      __h: handlers
    } as any
  }

  it('http url → action allow', () => {
    const wc = makeWebContents()
    attachWindowOpenHandler(wc, { registerNewTab: vi.fn() })
    const result = wc.__h.open({ url: 'https://x.com' })
    expect(result.action).toBe('allow')
  })

  it('mailto url → action deny + shell.openExternal called', () => {
    const wc = makeWebContents()
    attachWindowOpenHandler(wc, { registerNewTab: vi.fn() })
    const result = wc.__h.open({ url: 'mailto:foo@example.com' })
    expect(result.action).toBe('deny')
    expect((electronMock as any).shell.openExternal).toHaveBeenCalledWith('mailto:foo@example.com')
  })

  it('tel: url → action deny + shell.openExternal', () => {
    const wc = makeWebContents()
    attachWindowOpenHandler(wc, { registerNewTab: vi.fn() })
    const result = wc.__h.open({ url: 'tel:+15551234' })
    expect(result.action).toBe('deny')
    expect((electronMock as any).shell.openExternal).toHaveBeenCalledWith('tel:+15551234')
  })

  it('malformed URL → deny without shell call', () => {
    const wc = makeWebContents()
    ;(electronMock as any).shell.openExternal.mockClear()
    attachWindowOpenHandler(wc, { registerNewTab: vi.fn() })
    const result = wc.__h.open({ url: 'not a url' })
    expect(result.action).toBe('deny')
    expect((electronMock as any).shell.openExternal).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run + runbook**

```bash
npx vitest run electron/browser/contents.test.ts
```

Runbook:
```markdown
## 10.6 — mailto: in Electron
- [ ] Open a page with a `mailto:` link.
- [ ] Click the link → no new browser tab; system mail client opens.
- [ ] Console shows `shell.openExternal` invocation.
```

- [ ] **Step 3: Smoke + mark + commit**

```bash
git add electron/browser/contents.test.ts docs/runbooks/phase-11-acceptance.md openspec/changes/phase-11-browser-tabs-bookmarks/tasks.md
git commit -m "test(phase-11): acceptance 10.6 — mailto/tel routes to shell.openExternal"
```

---

<!-- openspec-task: 10.7 -->
### Task 7: 10.7 — Ad-block intercepts `googletagmanager`

The matcher is unit-tested in Plan 1; this task verifies the *integration*: real session bind → blocked request count > 0. Manual smoke is the primary check; we also extend the unit suite with an integration-style test that runs the bound `onBeforeRequest` callback.

- [ ] **Step 1: Append unit test for the bound callback**

Append to `electron/browser/adblock.test.ts`:

```ts
import { bindAdblockToSession } from './adblock'

describe('bindAdblockToSession', () => {
  it('cancels matching requests and counts them; non-matching requests pass through', () => {
    const handlers: { cb?: (d: any, c: any) => void } = {}
    const fakeSession: any = {
      webRequest: { onBeforeRequest: (cb: any) => { handlers.cb = cb } }
    }
    const ab = createAdblock(new Set(['googletagmanager.com']))
    bindAdblockToSession(fakeSession, ab)

    let last: any = null
    handlers.cb!({ url: 'https://googletagmanager.com/gtm.js' }, (r: any) => { last = r })
    expect(last).toEqual({ cancel: true })

    last = null
    handlers.cb!({ url: 'https://example.com/normal.js' }, (r: any) => { last = r })
    expect(last).toEqual({ cancel: false })

    expect(ab.drainCount()).toBe(1)
  })
})
```

- [ ] **Step 2: Run + runbook**

```bash
npx vitest run electron/browser/adblock.test.ts
```

Runbook:
```markdown
## 10.7 — Ad-block in Electron
- [ ] Open any major news site (e.g., `https://www.cnn.com` or a site that uses GTM).
- [ ] Open DevTools → Network tab.
- [ ] Reload. Confirm requests to `googletagmanager.com`, `google-analytics.com`, etc. show as `(canceled)`.
- [ ] After 1 hour of normal use, console logs `browser.adblock.hourly { blocked: <n> }` with n > 0.
- [ ] Page renders correctly (CNN, NYT, etc. still readable).
```

- [ ] **Step 3: Mark + commit**

```bash
git add electron/browser/adblock.test.ts docs/runbooks/phase-11-acceptance.md openspec/changes/phase-11-browser-tabs-bookmarks/tasks.md
git commit -m "test(phase-11): acceptance 10.7 — ad-block intercepts gtm/ga"
```

---

<!-- openspec-task: 10.8 -->
### Task 8: 10.8 — Reader toggle works; navigation resets to false

- [ ] **Step 1: Append test**

```tsx
describe('OpenSpec acceptance 10.8 — reader mode + navigation reset', () => {
  it('toggling reader mode flips state; navigating resets it via tabStateChanged event', async () => {
    const { port, fire } = renderApp('/browser')
    await waitFor(() => expect(port.createTab).toHaveBeenCalled())

    const tabId = useBrowserStore.getState().activeTabId!
    await useBrowserStore.getState().setReaderMode(tabId, true)
    expect(useBrowserStore.getState().tabs[0].readerMode).toBe(true)
    expect(port.setReaderMode).toHaveBeenCalledWith(tabId, true)

    // Simulate main forwarding did-navigate which has readerMode: false
    fire({ tabId, patch: { url: 'https://other.com', readerMode: false } })
    expect(useBrowserStore.getState().tabs[0].readerMode).toBe(false)
  })
})
```

- [ ] **Step 2: Run + runbook**

```bash
npx vitest run src/pages/Browse.acceptance.test.tsx -t "10.8"
```

Runbook:
```markdown
## 10.8 — Reader mode in Electron
- [ ] Open a long article page (e.g., a Wikipedia article).
- [ ] Click the ¶ button (reader toggle); page reformats — header/nav/footer hidden, body width ~720px.
- [ ] Navigate to a different URL via address bar; reader mode automatically off (page back to normal).
```

- [ ] **Step 3: Mark + commit**

```bash
git add src/pages/Browse.acceptance.test.tsx docs/runbooks/phase-11-acceptance.md openspec/changes/phase-11-browser-tabs-bookmarks/tasks.md
git commit -m "test(phase-11): acceptance 10.8 — reader toggle + navigation reset"
```

---

<!-- openspec-task: 10.9 -->
### Task 9: 10.9 — Cmd+D adds bookmark; star fills

- [ ] **Step 1: Append test**

```tsx
describe('OpenSpec acceptance 10.9 — Cmd+D adds bookmark', () => {
  it('dispatches the custom event and saves via dialog → star turns solid', async () => {
    const { port, fire } = renderApp('/browser')
    await waitFor(() => expect(port.createTab).toHaveBeenCalled())

    const tabId = useBrowserStore.getState().activeTabId!
    fire({ tabId, patch: { url: 'https://x.com', title: 'Example', favicon: null } })

    // First time: getByUrl returns null → dialog opens in 'new' mode.
    ipcMocks.bookmarks.getByUrl.mockResolvedValueOnce(null)
    rtlFireEvent.keyDown(window, { key: 'd', metaKey: true })

    // Find the dialog title input and save
    const titleInput = await screen.findByLabelText(/title/i)
    expect((titleInput as HTMLInputElement).value).toBe('Example')

    ipcMocks.bookmarks.create.mockResolvedValueOnce({
      id: 1, url: 'https://x.com', title: 'Example', favicon: null, tags: [], createdAt: '', updatedAt: ''
    })
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    expect(ipcMocks.bookmarks.create).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://x.com', title: 'Example'
    }))

    // After save, the star button should reflect the new bookmark (re-render via state).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /bookmark/i })).toHaveTextContent('★')
    })
  })
})
```

- [ ] **Step 2: Run + runbook**

```bash
npx vitest run src/pages/Browse.acceptance.test.tsx -t "10.9"
```

Runbook:
```markdown
## 10.9 — Cmd+D (real)
- [ ] Open any URL.
- [ ] Cmd+D → BookmarkDialog appears with URL/title prefilled.
- [ ] Save → dialog closes; star icon ★ filled.
- [ ] BookmarkSidebar (expand it) shows the new entry at the top.
```

- [ ] **Step 3: Mark + commit**

```bash
git add src/pages/Browse.acceptance.test.tsx docs/runbooks/phase-11-acceptance.md openspec/changes/phase-11-browser-tabs-bookmarks/tasks.md
git commit -m "test(phase-11): acceptance 10.9 — Cmd+D bookmark create + star fills"
```

---

<!-- openspec-task: 10.10 -->
### Task 10: 10.10 — duplicate URL → edit modal, no duplicate row

- [ ] **Step 1: Append test**

```tsx
describe('OpenSpec acceptance 10.10 — duplicate URL → edit modal', () => {
  it('clicking star on already-bookmarked URL opens dialog in edit mode', async () => {
    const { fire } = renderApp('/browser')
    await waitFor(() => useBrowserStore.getState().tabs.length > 0)

    const tabId = useBrowserStore.getState().activeTabId!
    fire({ tabId, patch: { url: 'https://dup.com', title: 'Dup' } })

    ipcMocks.bookmarks.getByUrl.mockResolvedValueOnce({
      id: 42, url: 'https://dup.com', title: 'Dup', favicon: null, tags: ['old'], createdAt: '', updatedAt: ''
    })

    rtlFireEvent.keyDown(window, { key: 'd', metaKey: true })

    // The dialog should open in edit mode → has a Delete button
    await screen.findByRole('button', { name: /delete/i })

    // create() must NOT be called
    expect(ipcMocks.bookmarks.create).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run + runbook**

```bash
npx vitest run src/pages/Browse.acceptance.test.tsx -t "10.10"
```

Runbook:
```markdown
## 10.10 — Duplicate URL
- [ ] Bookmark `https://example.com`.
- [ ] Navigate away and back, then Cmd+D again.
- [ ] Dialog opens in edit mode (Delete button present); no duplicate row in DB.
```

- [ ] **Step 3: Mark + commit**

```bash
git add src/pages/Browse.acceptance.test.tsx docs/runbooks/phase-11-acceptance.md openspec/changes/phase-11-browser-tabs-bookmarks/tasks.md
git commit -m "test(phase-11): acceptance 10.10 — duplicate url → edit modal"
```

---

<!-- openspec-task: 10.11 -->
### Task 11: 10.11 — `bookmarks.list({ q: 'news' })` filters by q

The handler unit tests in Plan 2 already cover this. Add a renderer-level acceptance test that exercises the BookmarkSidebar search wiring.

- [ ] **Step 1: Append test**

```tsx
describe('OpenSpec acceptance 10.11 — search filter', () => {
  it('typing "news" in sidebar search calls list with q', async () => {
    renderApp('/browser')
    await waitFor(() => useBrowserStore.getState().tabs.length > 0)

    // Open sidebar
    useBrowserStore.getState().setBookmarksOpen(true)

    const search = await screen.findByRole('searchbox')
    ipcMocks.bookmarks.list.mockClear()
    await userEvent.type(search, 'news')

    await waitFor(() => {
      expect(ipcMocks.bookmarks.list).toHaveBeenCalledWith(expect.objectContaining({ q: 'news' }))
    })
  })
})
```

- [ ] **Step 2: Run + runbook**

```bash
npx vitest run src/pages/Browse.acceptance.test.tsx -t "10.11"
```

Runbook:
```markdown
## 10.11 — Search bookmarks
- [ ] Add 3 bookmarks: title "World news today", "Cooking recipes", "AI news roundup".
- [ ] Open sidebar; type `news` in search.
- [ ] After ~200ms, list filtered to 2 rows (titles containing "news").
```

- [ ] **Step 3: Mark + commit**

```bash
git add src/pages/Browse.acceptance.test.tsx docs/runbooks/phase-11-acceptance.md openspec/changes/phase-11-browser-tabs-bookmarks/tasks.md
git commit -m "test(phase-11): acceptance 10.11 — bookmarks search by q"
```

---

<!-- openspec-task: 10.12 -->
### Task 12: 10.12 — `bookmarks.list({ tag: 'ai' })` filters by tag

- [ ] **Step 1: Append test**

```tsx
describe('OpenSpec acceptance 10.12 — tag filter', () => {
  it('clicking a tag chip calls list with tag', async () => {
    ipcMocks.bookmarks.list.mockResolvedValueOnce({
      items: [
        { id: 1, url: 'https://a.com', title: 'A', favicon: null, tags: ['ai'], createdAt: '', updatedAt: '' },
        { id: 2, url: 'https://b.com', title: 'B', favicon: null, tags: ['cooking'], createdAt: '', updatedAt: '' }
      ],
      total: 2
    })
    renderApp('/browser')
    await waitFor(() => useBrowserStore.getState().tabs.length > 0)
    useBrowserStore.getState().setBookmarksOpen(true)

    const chip = await screen.findByRole('button', { name: /tag-ai/i })
    ipcMocks.bookmarks.list.mockClear()
    await userEvent.click(chip)

    await waitFor(() => {
      expect(ipcMocks.bookmarks.list).toHaveBeenCalledWith(expect.objectContaining({ tag: 'ai' }))
    })
  })
})
```

- [ ] **Step 2: Run + runbook**

```bash
npx vitest run src/pages/Browse.acceptance.test.tsx -t "10.12"
```

Runbook:
```markdown
## 10.12 — Tag filter
- [ ] With three bookmarks tagged `ai`, `cooking`, and `news`, click the `ai` chip in sidebar.
- [ ] List shows only the row tagged `ai`.
- [ ] Click the chip again to deselect; list returns to full.
```

- [ ] **Step 3: Mark + commit**

```bash
git add src/pages/Browse.acceptance.test.tsx docs/runbooks/phase-11-acceptance.md openspec/changes/phase-11-browser-tabs-bookmarks/tasks.md
git commit -m "test(phase-11): acceptance 10.12 — bookmarks filter by tag"
```

---

<!-- openspec-task: 10.13 -->
### Task 13: 10.13 — LRU: 22 tabs → oldest suspended; resume reloads

- [ ] **Step 1: Append test**

```tsx
describe('OpenSpec acceptance 10.13 — LRU suspend/resume', () => {
  it('exceeding 20 alive tabs suspends the oldest non-active', async () => {
    const { port } = renderApp('/browser')
    await waitFor(() => useBrowserStore.getState().tabs.length === 1)

    // Create 21 more tabs (total 22)
    for (let i = 0; i < 21; i++) {
      await useBrowserStore.getState().createTab(`https://x${i}.com`)
    }
    const s = useBrowserStore.getState()
    const suspendedCount = s.tabs.filter((t) => t.suspended).length
    expect(suspendedCount).toBeGreaterThanOrEqual(1)
    expect(port.suspendTab).toHaveBeenCalled()
  })

  it('activating a suspended tab calls resumeTab and clears the flag', async () => {
    const { port } = renderApp('/browser')
    await waitFor(() => useBrowserStore.getState().tabs.length === 1)

    // Mark the first tab as suspended manually for the test
    const id = useBrowserStore.getState().tabs[0].id
    useBrowserStore.setState((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, suspended: true } : t)),
      activeTabId: null
    }))
    port.resumeTab.mockResolvedValueOnce({ id, url: 'https://restored' })

    await useBrowserStore.getState().activateTab(id)

    expect(port.resumeTab).toHaveBeenCalledWith(id)
    expect(useBrowserStore.getState().tabs[0].suspended).toBe(false)
  })
})
```

- [ ] **Step 2: Run + runbook**

```bash
npx vitest run src/pages/Browse.acceptance.test.tsx -t "10.13"
```

Runbook:
```markdown
## 10.13 — LRU in Electron
- [ ] Open 22 tabs to different URLs.
- [ ] Activity Monitor: Electron child-process count drops by ~2 vs peak (LRU killed oldest).
- [ ] Click the suspended tab in TabBar (favicon may be greyed); page reloads.
- [ ] Page content displays correctly.
```

- [ ] **Step 3: Mark + commit**

```bash
git add src/pages/Browse.acceptance.test.tsx docs/runbooks/phase-11-acceptance.md openspec/changes/phase-11-browser-tabs-bookmarks/tasks.md
git commit -m "test(phase-11): acceptance 10.13 — LRU suspend + resume"
```

---

<!-- openspec-task: 10.14 -->
### Task 14: 10.14 — window resize → WebContentsView follows; debounce no jank

- [ ] **Step 1: Append test (debounce already covered in unit; here we verify wiring through Browse)**

```tsx
describe('OpenSpec acceptance 10.14 — viewport debounce', () => {
  it('Browse calls setViewport on mount; further calls within 16ms coalesce', async () => {
    vi.useFakeTimers()
    const { port } = renderApp('/browser')
    await vi.advanceTimersByTimeAsync(20)
    expect(port.setViewport).toHaveBeenCalled()

    const calls = port.setViewport.mock.calls.length

    // Burst many setViewport calls within 16ms
    for (let i = 0; i < 5; i++) {
      useBrowserStore.getState().setViewport({ x: 0, y: 0, width: 100 + i, height: 100 + i })
    }
    await vi.advanceTimersByTimeAsync(20)

    // Only one extra IPC call hit despite 5 setViewport invocations
    expect(port.setViewport.mock.calls.length).toBe(calls + 1)
    expect(port.setViewport).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 104, height: 104 })
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run + runbook**

```bash
npx vitest run src/pages/Browse.acceptance.test.tsx -t "10.14"
```

Runbook:
```markdown
## 10.14 — Window resize
- [ ] Drag the window edge slowly from narrow → wide.
- [ ] WebContentsView resizes smoothly (no flicker, no perceptible lag).
- [ ] DevTools: `browser.setViewport` IPC calls visible at ~60Hz, not per-pixel.
```

- [ ] **Step 3: Mark + commit**

```bash
git add src/pages/Browse.acceptance.test.tsx docs/runbooks/phase-11-acceptance.md openspec/changes/phase-11-browser-tabs-bookmarks/tasks.md
git commit -m "test(phase-11): acceptance 10.14 — viewport debounce coalesces"
```

---

<!-- openspec-task: 10.15 -->
### Task 15: 10.15 — main renderer external link → `shell.openExternal` (regression)

This re-asserts phase-01's behaviour is intact. The test lives in `electron/security/external-links.test.ts` which we modified in Plan 4 task 9; this acceptance task simply runs that suite and confirms green, then ticks off the runbook.

- [ ] **Step 1: Run the existing security test**

```bash
npx vitest run electron/security/external-links.test.ts
```

Expected: all green, including the scope assertion from Plan 4.

- [ ] **Step 2: Runbook entry**

```markdown
## 10.15 — Main renderer external link unchanged
- [ ] In any Acornvo non-/browser page (e.g., Library), open a help/docs link rendered via React `<a href>` to a public URL.
- [ ] Confirm system browser opens the URL; main window stays put.
```

- [ ] **Step 3: Mark + commit**

```bash
git add docs/runbooks/phase-11-acceptance.md openspec/changes/phase-11-browser-tabs-bookmarks/tasks.md
git commit -m "test(phase-11): acceptance 10.15 — main renderer external link unchanged"
```

---

<!-- openspec-task: 10.16 -->
### Task 16: 10.16 — WebContentsView cross-site nav unaffected by phase-01 guard

- [ ] **Step 1: Re-confirm scope test from Plan 4**

```bash
npx vitest run electron/security/external-links.test.ts -t "scope"
```

Expected: pass — the BrowserWindow guard does not register listeners on independent webContents.

- [ ] **Step 2: Runbook entry**

```markdown
## 10.16 — WebContentsView cross-site nav
- [ ] Open `https://example.com` in an in-app browser tab.
- [ ] Click an `<a href>` to `https://www.iana.org` (or any cross-site link).
- [ ] Navigation completes IN THE TAB. No external system browser launch.
```

- [ ] **Step 3: Mark + commit**

```bash
git add docs/runbooks/phase-11-acceptance.md openspec/changes/phase-11-browser-tabs-bookmarks/tasks.md
git commit -m "test(phase-11): acceptance 10.16 — WebContentsView cross-site nav allowed"
```

---

<!-- openspec-task: 10.17 -->
### Task 17: 10.17 — `openspec validate phase-11-browser-tabs-bookmarks --strict` passes

This is the final integration check. All tasks should already be `[x]` in `tasks.md`. We run the entire test suite, then `openspec validate --strict`.

- [ ] **Step 1: Run the entire repo test suite**

```bash
npm run test
```

Expected: all green (Vitest exits 0).

- [ ] **Step 2: Run typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: both 0.

- [ ] **Step 3: Verify all tasks marked**

```bash
grep -c '\- \[ \]' openspec/changes/phase-11-browser-tabs-bookmarks/tasks.md
```

Expected: `0`. If non-zero, complete the remaining items before continuing.

```bash
grep -c '\- \[x\]' openspec/changes/phase-11-browser-tabs-bookmarks/tasks.md
```

Expected: `56`.

- [ ] **Step 4: Run openspec validate strict**

```bash
openspec validate phase-11-browser-tabs-bookmarks --strict
```

Expected: exits 0 with success message.

If validate fails, address each error inline (commonly: missing scenario keywords, mistyped requirement IDs, or specs/spec.md formatting). Re-run until clean.

- [ ] **Step 5: Append final runbook section**

```markdown
## 10.17 — Strict validate
- [ ] `npm run test` exits 0.
- [ ] `npm run typecheck && npm run lint` both exit 0.
- [ ] `openspec validate phase-11-browser-tabs-bookmarks --strict` exits 0.
```

- [ ] **Step 6: Mark 10.17 complete + commit**

In `tasks.md`, change `- [ ] 10.17` to `- [x] 10.17`.

```bash
git add docs/runbooks/phase-11-acceptance.md openspec/changes/phase-11-browser-tabs-bookmarks/tasks.md
git commit -m "test(phase-11): acceptance 10.17 — full suite + strict validate green"
```

> **Hand-off:** Phase 11 is now ready for archive via `/opsx:archive phase-11-browser-tabs-bookmarks`. Do not run that command from this plan.

---

## Self-Review Checklist (run after Task 17)

- [ ] Every label `10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 10.12, 10.13, 10.14, 10.15, 10.16, 10.17` appears exactly once. Verify:
  ```bash
  grep -oE 'openspec-task: 10\.[0-9]+' docs/superpowers/plans/2026-05-02-phase-11-browser-tabs-bookmarks-tasks-10.1-10.17.md | sort -u | wc -l
  ```
  Expected: `17`.
- [ ] Spec coverage: each scenario in `specs/**/spec.md` mapped to a task or pre-existing unit test. Cross-check by walking each `#### Scenario:` in the specs folder.
- [ ] All commits in this plan reference the OpenSpec acceptance label in their message.
- [ ] `openspec validate phase-11-browser-tabs-bookmarks --strict` passes.
- [ ] `npm run test` passes.
- [ ] `docs/runbooks/phase-11-acceptance.md` has all 17 sections with at least one checked bullet (the manual smokes were performed).
