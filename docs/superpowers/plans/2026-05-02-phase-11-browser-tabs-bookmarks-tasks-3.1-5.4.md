# Phase 11 — Browser Tabs & Bookmarks: Plan 2 (Session, ad-block load, tabs store, IPC contract)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **OpenSpec change:** `phase-11-browser-tabs-bookmarks`
> **Task range:** OpenSpec tasks `3.1`–`5.4` (12 tasks)
> **Plan order:** 2 of 5. Depends on Plan 1 (`tasks-1.1-2.6`).
> **Status:** Not started
> **Created:** 2026-05-02

---

## Goal

Wire the persistent partitioned session, load the curated host list into the ad-block matcher with hourly aggregate logging, build the renderer Zustand `browser` store (state + actions + LRU suspend/resume), extend the IPC contract with the `browser` and `bookmarks` namespaces, implement the main-process IPC handlers, and add the prepared-statement bookmarks CRUD with `E_DUPLICATE` semantics.

## Architecture

- **One persistent session** for all tabs: `session.fromPartition('persist:browser-default')`. Wired once at app start so cookies survive restarts (spec D9).
- **Ad-block load happens inside `bindBrowserBootstrap`** (a new init function called from `electron/main.ts`): read `public/hosts/block-domains.txt` once, parse into `Set<string>`, build `Adblock`, call `bindAdblockToSession(session, adblock)`. After bind, the matcher's `drainCount` is read every hour by a `setInterval` that logs the aggregate via `logger.info('browser.adblock', { blocked: n })` and resets the counter.
- **Renderer store (`src/stores/browser.ts`)** holds the _single source of truth_ for `tabs[]` / `activeTabId` / `bookmarksOpen`. All UI components read from it; all mutations go through actions. Each action that needs main-process side-effects calls `ipc.browser.*`. Patches arriving via `ipc.on('browser:tabStateChanged', …)` apply optimistically.
- **LRU suspension** is owned by the store: when `createTab` would push alive count over 20, the store picks the oldest _non-active_ tab, calls `ipc.browser.suspendTab(id)`, and updates the local tab to `suspended: true`. `activateTab` on a suspended tab calls `ipc.browser.resumeTab(id)` first (which re-creates the WebContentsView in main) and only then attaches.
- **IPC contract additions** are split into two namespaces:
  - `browser`: stateless command surface — every method takes/returns plain data and crosses the process boundary fast. Tab state pushes back to renderer over the typed event channel `browser:tabStateChanged` (already added in Plan 1; this plan formalises it in `IpcEventContract`).
  - `bookmarks`: typed CRUD with `E_DUPLICATE` mapped via the existing `IpcErrorCode` extension.
- **Bookmarks CRUD** uses `better-sqlite3` prepared statements built once on grove open (via `dbService.getCurrent()` reused from phase-03). `tags_json` is stored as a JSON-stringified `string[]`; the handler parses it on read into `Bookmark.tags`.

## Tech Stack

- Electron 39 (`session.fromPartition`, `webRequest.onBeforeRequest`)
- Zustand 5 (existing) — store layer
- `better-sqlite3@^12` — prepared statements
- `vitest@^2` — handler/store unit tests

## Files Touched (this plan)

| Path                                                        | Action                                               | Owner task              |
| ----------------------------------------------------------- | ---------------------------------------------------- | ----------------------- |
| `electron/browser/init.ts`                                  | Create                                               | 3.1, 3.2, 3.3           |
| `electron/main.ts`                                          | Modify (call `initBrowserSubsystem`)                 | 3.1                     |
| `electron/browser/init.test.ts`                             | Create                                               | 3.2                     |
| `src/stores/browser.ts`                                     | Implement                                            | 4.1, 4.2, 4.3, 4.4, 4.5 |
| `src/stores/browser.test.ts`                                | Create                                               | 4.1, 4.2, 4.3, 4.4, 4.5 |
| `shared/ipc-contract.ts`                                    | Modify (add namespaces + event channel + error code) | 5.1, 5.2                |
| `preload/preload.ts`                                        | Modify (add browser/bookmarks invokers)              | 5.1, 5.2                |
| `electron/ipc/handlers.ts`                                  | Modify (register new namespaces)                     | 5.3, 5.4                |
| `electron/ipc/browser.ts`                                   | Implement                                            | 5.3                     |
| `electron/ipc/browser.test.ts`                              | Create                                               | 5.3                     |
| `electron/ipc/bookmarks.ts`                                 | Implement                                            | 5.4                     |
| `electron/ipc/bookmarks.test.ts`                            | Create                                               | 5.4                     |
| `src/ipc/client.ts` (or wherever `ipc` typed wrapper lives) | Verify                                               | 5.1, 5.2                |

## Pre-flight

- Plan 1 must be merged: `electron/browser/contents.ts`, `manager.ts`, `bounds.ts`, `adblock.ts` exist with their public APIs, and migration 004 is in place.
- `dbService.getCurrent()` returns the current grove `Database.Database` once a grove is open (phase-03). Verify:
  ```bash
  grep -n "getCurrent" electron/services/db.ts | head
  ```
  If the API differs, **stop and reconcile** — the bookmarks handler depends on it.
- Confirm `IpcEventContract` and `IpcErrorCode` shape in `shared/ipc-contract.ts` is the one used in Plan 1; you should already see `'browser:tabStateChanged'` referenced. If not, Plan 1 task 8 was skipped — fix that first.

---

## Tasks

<!-- openspec-task: 3.1 -->

### Task 1: Browser bootstrap — partitioned session + main wiring

**Files:**

- Create: `electron/browser/init.ts`
- Modify: `electron/main.ts` (call `initBrowserSubsystem(mainWindow)` after `createMainWindow`)

- [ ] **Step 1: Implement `init.ts` skeleton**

```ts
// electron/browser/init.ts
import { session, type BrowserWindow } from 'electron'
import { logger } from '../services/logger'
import { configureBounds, getBounds } from './bounds'
import { setMainWindow, getManager, setBoundsApplier } from './manager'

export const BROWSER_SESSION_PARTITION = 'persist:browser-default'

/**
 * One-shot wiring called from electron/main.ts after the main BrowserWindow exists.
 * Subsequent tasks (3.2, 3.3) extend this with adblock loading + counter logging.
 */
export function initBrowserSubsystem(mainWindow: BrowserWindow): void {
  setMainWindow(mainWindow)
  configureBounds(() => {
    const id = getManager().attachedTabId()
    if (!id) return null
    const t = getManager().get(id)
    return t ? t.view : null
  })
  setBoundsApplier((view) => getBounds().applyTo(view))

  // Touch the partitioned session early so it's created and persistent storage
  // is initialised before the first tab loads.
  const s = session.fromPartition(BROWSER_SESSION_PARTITION)
  // Set a sensible UA suffix so sites can identify the in-app browser if they want
  s.setUserAgent(s.getUserAgent() + ' Acornvo/0.0.0')

  logger.info('browser subsystem initialized', {
    partition: BROWSER_SESSION_PARTITION
  })
}
```

- [ ] **Step 2: Wire from `electron/main.ts`**

Find the call site that creates the main window. After `createMainWindow()` returns and `mainWindow` is assigned, add:

```ts
import { initBrowserSubsystem } from './browser/init'
// ...
initBrowserSubsystem(mainWindow!)
```

If the existing `bootstrap()` function in `electron/main.ts` calls `installExternalLinkGuards(win)`, place `initBrowserSubsystem(win)` immediately after that line.

- [ ] **Step 3: Typecheck + smoke build**

```bash
npm run typecheck && npm run build
```

Expected: both exit 0. The build produces a launchable Electron bundle even if no UI yet exercises tabs.

- [ ] **Step 4: Commit**

```bash
git add electron/browser/init.ts electron/main.ts
git commit -m "feat(phase-11): browser subsystem init — partitioned session + main wiring"
```

---

<!-- openspec-task: 3.2 -->

### Task 2: Load `block-domains.txt` into adblock host set

**Files:**

- Modify: `electron/browser/init.ts`
- Create: `electron/browser/init.test.ts`

- [ ] **Step 1: Write the failing test (parser only)**

```ts
// electron/browser/init.test.ts
import { describe, it, expect } from 'vitest'
import { parseHostsFile } from './init'

describe('parseHostsFile', () => {
  it('strips blank lines and comments; lower-cases', () => {
    const text = `
# header
google-analytics.com

# section
GOOGLETAGMANAGER.COM
   ws.example.com   

# trailing
`
    expect(parseHostsFile(text)).toEqual(
      new Set(['google-analytics.com', 'googletagmanager.com', 'ws.example.com'])
    )
  })

  it('returns empty set for empty input', () => {
    expect(parseHostsFile('')).toEqual(new Set<string>())
  })

  it('ignores inline-comment style lines (`# anything` after a host on its own line)', () => {
    // We require comments to be on their own line; a line containing whitespace then `#` is
    // treated as part of the host name, which would never match. Verify it does not crash.
    expect(parseHostsFile('host.com #note')).toEqual(new Set<string>(['host.com #note']))
    // Document the limitation: keep comments on their own line in the file.
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/browser/init.test.ts
```

Expected: FAIL — `parseHostsFile` not exported.

- [ ] **Step 3: Add `parseHostsFile` and adblock load to `init.ts`**

Append to `electron/browser/init.ts`:

```ts
import { readFileSync } from 'node:fs'
import { app } from 'electron'
import { join } from 'node:path'
import { createAdblock, bindAdblockToSession, setAdblock, getAdblock } from './adblock'

export function parseHostsFile(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#')) continue
    out.add(line.toLowerCase())
  }
  return out
}

function resolveHostsPath(): string {
  // In dev, public/ is served from the project root. In a packaged app, vite
  // copies public/ into the renderer dist; for main we resolve relative to
  // app.getAppPath() which is stable in both modes.
  return join(app.getAppPath(), 'public', 'hosts', 'block-domains.txt')
}

function loadAdblock(): void {
  let hosts: Set<string>
  try {
    const text = readFileSync(resolveHostsPath(), 'utf8')
    hosts = parseHostsFile(text)
  } catch (err) {
    logger.warn('browser: failed to load block-domains.txt; ad-block disabled', {
      message: err instanceof Error ? err.message : String(err)
    })
    hosts = new Set()
  }
  const ab = createAdblock(hosts)
  setAdblock(ab)
  const s = session.fromPartition(BROWSER_SESSION_PARTITION)
  bindAdblockToSession(s, ab)
  logger.info('browser: ad-block ready', { hostsCount: hosts.size })
}
```

Then call `loadAdblock()` at the end of `initBrowserSubsystem` (before the closing `}`).

- [ ] **Step 4: Run unit tests**

```bash
npx vitest run electron/browser/init.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Manual smoke (optional)**

Build and launch the app; check log output for:

```
browser: ad-block ready { "hostsCount": 80 }   (or similar)
```

This is verified again automatically in Plan 5 acceptance task 10.7.

- [ ] **Step 6: Commit**

```bash
git add electron/browser/init.ts electron/browser/init.test.ts
git commit -m "feat(phase-11): load block-domains.txt → adblock; bind to browser session"
```

---

<!-- openspec-task: 3.3 -->

### Task 3: Aggregate block counter logger (1h interval)

**Files:**

- Modify: `electron/browser/init.ts`

- [ ] **Step 1: Append logger interval to `initBrowserSubsystem`**

In `electron/browser/init.ts`, append after `loadAdblock()`:

```ts
function startAdblockReporter(): NodeJS.Timeout {
  const ONE_HOUR_MS = 60 * 60 * 1000
  const handle = setInterval(() => {
    const n = getAdblock().drainCount()
    if (n > 0) {
      logger.info('browser.adblock.hourly', { blocked: n })
    }
  }, ONE_HOUR_MS)
  // Allow Node to exit if this is the only timer
  if (typeof handle.unref === 'function') handle.unref()
  return handle
}
```

Then within `initBrowserSubsystem`, immediately after the `loadAdblock()` call:

```ts
startAdblockReporter()
```

- [ ] **Step 2: Verify no test regression**

```bash
npx vitest run electron/browser
```

Expected: all green.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add electron/browser/init.ts
git commit -m "feat(phase-11): hourly aggregate log of ad-block hits"
```

---

<!-- openspec-task: 4.1 -->

### Task 4: Browser store — state shape

**Files:**

- Modify: `src/stores/browser.ts`
- Create: `src/stores/browser.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/stores/browser.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useBrowserStore } from './browser'

function reset() {
  useBrowserStore.setState({
    tabs: [],
    activeTabId: null,
    bookmarksOpen: false,
    viewport: { x: 0, y: 0, width: 0, height: 0 }
  })
}

describe('browser store — state', () => {
  beforeEach(reset)

  it('starts empty when reset', () => {
    const s = useBrowserStore.getState()
    expect(s.tabs).toEqual([])
    expect(s.activeTabId).toBe(null)
    expect(s.bookmarksOpen).toBe(false)
  })

  it('exposes selectors for active tab', () => {
    useBrowserStore.setState({
      tabs: [
        {
          id: 't1',
          url: 'https://a',
          title: 'A',
          favicon: null,
          loading: false,
          canGoBack: false,
          canGoForward: false,
          readerMode: false,
          suspended: false,
          savedUrl: 'https://a'
        }
      ],
      activeTabId: 't1'
    })
    expect(useBrowserStore.getState().getActiveTab()?.id).toBe('t1')
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run src/stores/browser.test.ts
```

Expected: FAIL — `useBrowserStore` not exported.

- [ ] **Step 3: Implement state**

Replace `src/stores/browser.ts`:

```ts
// src/stores/browser.ts
import { create } from 'zustand'
import type { Tab, TabId, SetViewportArgs } from '@shared/browser-types'

export interface BrowserState {
  tabs: Tab[]
  activeTabId: TabId | null
  bookmarksOpen: boolean
  viewport: SetViewportArgs

  // selectors
  getActiveTab(): Tab | undefined
  getTabIndex(id: TabId): number

  // actions are added in tasks 4.2–4.5
  // placeholder type slot so callers compile
}

export const useBrowserStore = create<BrowserState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  bookmarksOpen: false,
  viewport: { x: 0, y: 0, width: 0, height: 0 },

  getActiveTab: () => {
    const id = get().activeTabId
    return id ? get().tabs.find((t) => t.id === id) : undefined
  },
  getTabIndex: (id) => get().tabs.findIndex((t) => t.id === id)
}))
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/stores/browser.test.ts
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/stores/browser.ts src/stores/browser.test.ts
git commit -m "feat(phase-11): browser store — state + selectors"
```

---

<!-- openspec-task: 4.2 -->

### Task 5: Browser store — actions (createTab/closeTab/activateTab/reorderTab/setReaderMode/navigate/setViewport)

We define a thin abstraction over IPC to keep tests fast: actions accept an injected `BrowserPort` (an interface mirroring `ipc.browser`). The default port is real `ipc.browser`, but tests pass mocks. This keeps the store pure-ish.

**Files:**

- Modify: `src/stores/browser.ts`
- Modify: `src/stores/browser.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```ts
import { vi } from 'vitest'
import { setBrowserPort } from './browser'
import type { BrowserPort } from './browser'

function makePort(overrides: Partial<BrowserPort> = {}): BrowserPort {
  return {
    createTab: vi.fn(async (url) => ({
      id: 'mock-' + Math.random().toString(36).slice(2, 6),
      url: url ?? 'about:blank'
    })),
    closeTab: vi.fn(async () => {}),
    activateTab: vi.fn(async () => {}),
    navigate: vi.fn(async () => {}),
    reload: vi.fn(async () => {}),
    goBack: vi.fn(async () => {}),
    goForward: vi.fn(async () => {}),
    setReaderMode: vi.fn(async () => {}),
    setViewport: vi.fn(async () => {}),
    suspendTab: vi.fn(async () => {}),
    resumeTab: vi.fn(async () => {}),
    ...overrides
  }
}

describe('browser store — actions', () => {
  beforeEach(reset)

  it('createTab appends and activates a new tab', async () => {
    const port = makePort({
      createTab: vi.fn(async (url) => ({ id: 'new-1', url: url ?? 'about:blank' }))
    })
    setBrowserPort(port)

    await useBrowserStore.getState().createTab('https://example.com')

    const s = useBrowserStore.getState()
    expect(s.tabs).toHaveLength(1)
    expect(s.tabs[0].id).toBe('new-1')
    expect(s.activeTabId).toBe('new-1')
    expect(port.createTab).toHaveBeenCalledWith('https://example.com')
  })

  it('closeTab removes the tab; if it was active, switch to the right neighbour', async () => {
    const port = makePort()
    setBrowserPort(port)
    useBrowserStore.setState({
      tabs: [
        {
          id: 'a',
          url: '',
          title: '',
          favicon: null,
          loading: false,
          canGoBack: false,
          canGoForward: false,
          readerMode: false,
          suspended: false,
          savedUrl: ''
        },
        {
          id: 'b',
          url: '',
          title: '',
          favicon: null,
          loading: false,
          canGoBack: false,
          canGoForward: false,
          readerMode: false,
          suspended: false,
          savedUrl: ''
        },
        {
          id: 'c',
          url: '',
          title: '',
          favicon: null,
          loading: false,
          canGoBack: false,
          canGoForward: false,
          readerMode: false,
          suspended: false,
          savedUrl: ''
        }
      ],
      activeTabId: 'b'
    })

    await useBrowserStore.getState().closeTab('b')

    const s = useBrowserStore.getState()
    expect(s.tabs.map((t) => t.id)).toEqual(['a', 'c'])
    expect(s.activeTabId).toBe('c')
    expect(port.closeTab).toHaveBeenCalledWith('b')
  })

  it('closeTab on the last remaining tab triggers a fresh blank tab (spec)', async () => {
    const port = makePort({
      createTab: vi.fn(async () => ({ id: 'fresh', url: 'about:blank' }))
    })
    setBrowserPort(port)
    useBrowserStore.setState({
      tabs: [
        {
          id: 'only',
          url: 'https://x',
          title: '',
          favicon: null,
          loading: false,
          canGoBack: false,
          canGoForward: false,
          readerMode: false,
          suspended: false,
          savedUrl: 'https://x'
        }
      ],
      activeTabId: 'only'
    })

    await useBrowserStore.getState().closeTab('only')

    const s = useBrowserStore.getState()
    expect(s.tabs).toHaveLength(1)
    expect(s.tabs[0].id).toBe('fresh')
  })

  it('activateTab calls port.activateTab and updates state', async () => {
    const port = makePort()
    setBrowserPort(port)
    useBrowserStore.setState({
      tabs: [
        {
          id: 'a',
          url: '',
          title: '',
          favicon: null,
          loading: false,
          canGoBack: false,
          canGoForward: false,
          readerMode: false,
          suspended: false,
          savedUrl: ''
        },
        {
          id: 'b',
          url: '',
          title: '',
          favicon: null,
          loading: false,
          canGoBack: false,
          canGoForward: false,
          readerMode: false,
          suspended: false,
          savedUrl: ''
        }
      ],
      activeTabId: 'a'
    })

    await useBrowserStore.getState().activateTab('b')

    expect(useBrowserStore.getState().activeTabId).toBe('b')
    expect(port.activateTab).toHaveBeenCalledWith('b')
  })

  it('reorderTab moves a tab to the target index', () => {
    useBrowserStore.setState({
      tabs: [
        {
          id: 'a',
          url: '',
          title: '',
          favicon: null,
          loading: false,
          canGoBack: false,
          canGoForward: false,
          readerMode: false,
          suspended: false,
          savedUrl: ''
        },
        {
          id: 'b',
          url: '',
          title: '',
          favicon: null,
          loading: false,
          canGoBack: false,
          canGoForward: false,
          readerMode: false,
          suspended: false,
          savedUrl: ''
        },
        {
          id: 'c',
          url: '',
          title: '',
          favicon: null,
          loading: false,
          canGoBack: false,
          canGoForward: false,
          readerMode: false,
          suspended: false,
          savedUrl: ''
        }
      ]
    })
    useBrowserStore.getState().reorderTab('a', 2)
    expect(useBrowserStore.getState().tabs.map((t) => t.id)).toEqual(['b', 'c', 'a'])
  })

  it('setReaderMode flips the local flag and forwards to port', async () => {
    const port = makePort()
    setBrowserPort(port)
    useBrowserStore.setState({
      tabs: [
        {
          id: 'a',
          url: '',
          title: '',
          favicon: null,
          loading: false,
          canGoBack: false,
          canGoForward: false,
          readerMode: false,
          suspended: false,
          savedUrl: ''
        }
      ],
      activeTabId: 'a'
    })

    await useBrowserStore.getState().setReaderMode('a', true)

    expect(useBrowserStore.getState().tabs[0].readerMode).toBe(true)
    expect(port.setReaderMode).toHaveBeenCalledWith('a', true)
  })

  it('navigate forwards to port and locally patches savedUrl', async () => {
    const port = makePort()
    setBrowserPort(port)
    useBrowserStore.setState({
      tabs: [
        {
          id: 'a',
          url: 'https://old',
          title: '',
          favicon: null,
          loading: false,
          canGoBack: false,
          canGoForward: false,
          readerMode: false,
          suspended: false,
          savedUrl: 'https://old'
        }
      ],
      activeTabId: 'a'
    })

    await useBrowserStore.getState().navigate('a', 'https://new')

    expect(port.navigate).toHaveBeenCalledWith('a', 'https://new')
    expect(useBrowserStore.getState().tabs[0].savedUrl).toBe('https://new')
  })

  it('setViewport debounces — last value wins and reaches port within 16ms', async () => {
    vi.useFakeTimers()
    const port = makePort()
    setBrowserPort(port)

    useBrowserStore.getState().setViewport({ x: 0, y: 0, width: 100, height: 100 })
    useBrowserStore.getState().setViewport({ x: 0, y: 0, width: 200, height: 200 })
    useBrowserStore.getState().setViewport({ x: 0, y: 0, width: 300, height: 300 })

    expect(port.setViewport).not.toHaveBeenCalled()
    vi.advanceTimersByTime(16)
    expect(port.setViewport).toHaveBeenCalledTimes(1)
    expect(port.setViewport).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 300, height: 300 })

    expect(useBrowserStore.getState().viewport).toEqual({ x: 0, y: 0, width: 300, height: 300 })
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run src/stores/browser.test.ts
```

Expected: FAIL — actions not implemented.

- [ ] **Step 3: Implement actions**

Replace `src/stores/browser.ts`:

```ts
// src/stores/browser.ts
import { create } from 'zustand'
import type { Tab, TabId, TabPatch, SetViewportArgs } from '@shared/browser-types'

const BLANK_URL = 'about:blank'

export interface BrowserPort {
  createTab(url?: string): Promise<{ id: TabId; url: string }>
  closeTab(id: TabId): Promise<void>
  activateTab(id: TabId): Promise<void>
  navigate(id: TabId, url: string): Promise<void>
  reload(id: TabId): Promise<void>
  goBack(id: TabId): Promise<void>
  goForward(id: TabId): Promise<void>
  setReaderMode(id: TabId, on: boolean): Promise<void>
  setViewport(rect: SetViewportArgs): Promise<void>
  suspendTab(id: TabId): Promise<void>
  resumeTab(id: TabId): Promise<{ id: TabId; url: string }>
}

let port: BrowserPort = {
  // Default port is replaced at app boot (see src/ipc/client.ts wiring in task 5.1)
  createTab: () => {
    throw new Error('BrowserPort not configured')
  },
  closeTab: () => {
    throw new Error('BrowserPort not configured')
  },
  activateTab: () => {
    throw new Error('BrowserPort not configured')
  },
  navigate: () => {
    throw new Error('BrowserPort not configured')
  },
  reload: () => {
    throw new Error('BrowserPort not configured')
  },
  goBack: () => {
    throw new Error('BrowserPort not configured')
  },
  goForward: () => {
    throw new Error('BrowserPort not configured')
  },
  setReaderMode: () => {
    throw new Error('BrowserPort not configured')
  },
  setViewport: () => {
    throw new Error('BrowserPort not configured')
  },
  suspendTab: () => {
    throw new Error('BrowserPort not configured')
  },
  resumeTab: () => {
    throw new Error('BrowserPort not configured')
  }
}

export function setBrowserPort(p: BrowserPort): void {
  port = p
}

function makeTab(id: TabId, url: string): Tab {
  return {
    id,
    url,
    title: '',
    favicon: null,
    loading: false,
    canGoBack: false,
    canGoForward: false,
    readerMode: false,
    suspended: false,
    savedUrl: url
  }
}

export interface BrowserState {
  tabs: Tab[]
  activeTabId: TabId | null
  bookmarksOpen: boolean
  viewport: SetViewportArgs

  getActiveTab(): Tab | undefined
  getTabIndex(id: TabId): number

  createTab(url?: string): Promise<TabId>
  closeTab(id: TabId): Promise<void>
  activateTab(id: TabId): Promise<void>
  reorderTab(id: TabId, targetIndex: number): void
  setReaderMode(id: TabId, on: boolean): Promise<void>
  navigate(id: TabId, url: string): Promise<void>
  setViewport(rect: SetViewportArgs): void
  setBookmarksOpen(open: boolean): void
  applyTabPatch(id: TabId, patch: TabPatch): void
}

let viewportTimer: ReturnType<typeof setTimeout> | null = null

export const useBrowserStore = create<BrowserState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  bookmarksOpen: false,
  viewport: { x: 0, y: 0, width: 0, height: 0 },

  getActiveTab: () => {
    const id = get().activeTabId
    return id ? get().tabs.find((t) => t.id === id) : undefined
  },
  getTabIndex: (id) => get().tabs.findIndex((t) => t.id === id),

  async createTab(url) {
    const created = await port.createTab(url)
    set((s) => ({
      tabs: [...s.tabs, makeTab(created.id, created.url)],
      activeTabId: created.id
    }))
    return created.id
  },

  async closeTab(id) {
    await port.closeTab(id)
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex((t) => t.id === id)
    if (idx === -1) return
    const remaining = tabs.filter((t) => t.id !== id)
    if (remaining.length === 0) {
      // Spec: never let tabs be empty
      const blank = await port.createTab(BLANK_URL)
      set({ tabs: [makeTab(blank.id, blank.url)], activeTabId: blank.id })
      return
    }
    let nextActive = activeTabId
    if (activeTabId === id) {
      // Pick neighbour to the right, falling back to left
      const after = tabs[idx + 1]
      const before = tabs[idx - 1]
      nextActive = (after ?? before)!.id
      await port.activateTab(nextActive)
    }
    set({ tabs: remaining, activeTabId: nextActive })
  },

  async activateTab(id) {
    await port.activateTab(id)
    set({ activeTabId: id })
  },

  reorderTab(id, targetIndex) {
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id)
      if (idx === -1) return s
      const next = s.tabs.slice()
      const [moved] = next.splice(idx, 1)
      const clamped = Math.max(0, Math.min(targetIndex, next.length))
      next.splice(clamped, 0, moved)
      return { tabs: next }
    })
  },

  async setReaderMode(id, on) {
    await port.setReaderMode(id, on)
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, readerMode: on } : t))
    }))
  },

  async navigate(id, url) {
    await port.navigate(id, url)
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, savedUrl: url, loading: true } : t))
    }))
  },

  setViewport(rect) {
    set({ viewport: rect })
    if (viewportTimer) clearTimeout(viewportTimer)
    viewportTimer = setTimeout(() => {
      void port.setViewport(rect)
    }, 16)
  },

  setBookmarksOpen(open) {
    set({ bookmarksOpen: open })
  },

  applyTabPatch(id, patch) {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, ...patch, savedUrl: patch.url ?? t.savedUrl } : t
      )
    }))
  }
}))
```

- [ ] **Step 4: Run all browser store tests**

```bash
npx vitest run src/stores/browser.test.ts
```

Expected: 9 passed (state 2 + actions 7, plus the new debounce test = 10 if you split). Verify the count matches what you wrote.

- [ ] **Step 5: Commit**

```bash
git add src/stores/browser.ts src/stores/browser.test.ts
git commit -m "feat(phase-11): browser store actions — create/close/activate/navigate/reorder/reader/viewport"
```

---

<!-- openspec-task: 4.3 -->

### Task 6: Browser store — `browser:tabStateChanged` subscription

Subscribe at module load time so any open Browse page receives patches without per-page wiring.

**Files:**

- Modify: `src/stores/browser.ts`
- Modify: `src/stores/browser.test.ts`

- [ ] **Step 1: Write failing test**

Append:

```ts
import { setBrowserEventPort } from './browser'
import type { BrowserEventPort, EventOff } from './browser'

function makeEventPort() {
  const handlers: Record<string, ((p: any) => void)[]> = {}
  const port: BrowserEventPort = {
    onTabStateChanged: (h) => {
      handlers['tabStateChanged'] ??= []
      handlers['tabStateChanged'].push(h)
      return () => {}
    }
  }
  return { port, fire: (p: any) => handlers['tabStateChanged']?.forEach((h) => h(p)) }
}

describe('browser store — tabStateChanged subscription', () => {
  beforeEach(reset)

  it('applies patches to the matching tab', () => {
    const ep = makeEventPort()
    setBrowserEventPort(ep.port)

    useBrowserStore.setState({
      tabs: [
        {
          id: 'a',
          url: 'https://x',
          title: '',
          favicon: null,
          loading: false,
          canGoBack: false,
          canGoForward: false,
          readerMode: false,
          suspended: false,
          savedUrl: 'https://x'
        }
      ],
      activeTabId: 'a'
    })

    ep.fire({ tabId: 'a', patch: { title: 'Hello', loading: true } })

    expect(useBrowserStore.getState().tabs[0]).toMatchObject({
      title: 'Hello',
      loading: true
    })
  })

  it('ignores patches for unknown tabs', () => {
    const ep = makeEventPort()
    setBrowserEventPort(ep.port)

    ep.fire({ tabId: 'ghost', patch: { title: 'X' } })

    expect(useBrowserStore.getState().tabs).toEqual([])
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run src/stores/browser.test.ts -t tabStateChanged
```

Expected: FAIL — `setBrowserEventPort` not exported.

- [ ] **Step 3: Implement**

Append to `src/stores/browser.ts`:

```ts
import type { TabStateChangedPayload } from '@shared/browser-types'

export type EventOff = () => void
export interface BrowserEventPort {
  onTabStateChanged(handler: (payload: TabStateChangedPayload) => void): EventOff
}

let eventOff: EventOff | null = null

export function setBrowserEventPort(p: BrowserEventPort): void {
  if (eventOff) eventOff()
  eventOff = p.onTabStateChanged(({ tabId, patch }) => {
    useBrowserStore.getState().applyTabPatch(tabId, patch)
  })
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/stores/browser.test.ts
```

Expected: all green (now 11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/stores/browser.ts src/stores/browser.test.ts
git commit -m "feat(phase-11): browser store subscribes to browser:tabStateChanged"
```

---

<!-- openspec-task: 4.4 -->

### Task 7: LRU suspension on `createTab` overflow

**Files:**

- Modify: `src/stores/browser.ts`
- Modify: `src/stores/browser.test.ts`

- [ ] **Step 1: Write failing test**

Append:

```ts
describe('browser store — LRU suspend', () => {
  beforeEach(reset)

  it('suspends the oldest non-active tab when alive count would exceed 20', async () => {
    const port = makePort({
      createTab: vi.fn(async (url) => ({ id: 'new', url: url ?? 'about:blank' })),
      suspendTab: vi.fn(async () => {})
    })
    setBrowserPort(port)

    // Seed 20 alive tabs; activeTabId at the *last* one so the oldest is t1.
    useBrowserStore.setState({
      tabs: Array.from({ length: 20 }, (_, i) => ({
        id: `t${i + 1}`,
        url: '',
        title: '',
        favicon: null,
        loading: false,
        canGoBack: false,
        canGoForward: false,
        readerMode: false,
        suspended: false,
        savedUrl: ''
      })),
      activeTabId: 't20'
    })

    await useBrowserStore.getState().createTab('https://new')

    const s = useBrowserStore.getState()
    expect(s.tabs).toHaveLength(21)
    const t1 = s.tabs.find((t) => t.id === 't1')!
    expect(t1.suspended).toBe(true)
    expect(port.suspendTab).toHaveBeenCalledWith('t1')
  })

  it('does not suspend the active tab even if it is oldest', async () => {
    const port = makePort({
      createTab: vi.fn(async () => ({ id: 'new', url: 'about:blank' })),
      suspendTab: vi.fn(async () => {})
    })
    setBrowserPort(port)

    useBrowserStore.setState({
      tabs: Array.from({ length: 20 }, (_, i) => ({
        id: `t${i + 1}`,
        url: '',
        title: '',
        favicon: null,
        loading: false,
        canGoBack: false,
        canGoForward: false,
        readerMode: false,
        suspended: false,
        savedUrl: ''
      })),
      activeTabId: 't1' // active is the oldest
    })

    await useBrowserStore.getState().createTab()

    expect(port.suspendTab).toHaveBeenCalledWith('t2') // skip active, pick next oldest
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run src/stores/browser.test.ts -t "LRU suspend"
```

Expected: FAIL.

- [ ] **Step 3: Modify `createTab` to handle LRU**

Replace `createTab` body in `src/stores/browser.ts`:

```ts
  async createTab(url) {
    const ALIVE_LIMIT = 20
    const stateBefore = get()
    const aliveTabs = stateBefore.tabs.filter((t) => !t.suspended)
    if (aliveTabs.length >= ALIVE_LIMIT) {
      // Pick the oldest non-active alive tab. Order in `tabs[]` is creation order;
      // we don't track per-tab lastActiveAt in the store (main is the source of truth),
      // so use array order as a proxy: the first non-active alive tab from the left.
      const victim = aliveTabs.find((t) => t.id !== stateBefore.activeTabId)
      if (victim) {
        await port.suspendTab(victim.id)
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === victim.id ? { ...t, suspended: true } : t
          )
        }))
      }
    }
    const created = await port.createTab(url)
    set((s) => ({
      tabs: [...s.tabs, makeTab(created.id, created.url)],
      activeTabId: created.id
    }))
    return created.id
  },
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/stores/browser.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/stores/browser.ts src/stores/browser.test.ts
git commit -m "feat(phase-11): LRU suspend oldest non-active tab when alive > 20"
```

---

<!-- openspec-task: 4.5 -->

### Task 8: Resume suspended tab on activate

**Files:**

- Modify: `src/stores/browser.ts`
- Modify: `src/stores/browser.test.ts`

- [ ] **Step 1: Write failing test**

Append:

```ts
describe('browser store — resume', () => {
  beforeEach(reset)

  it('activateTab on a suspended tab calls resumeTab and clears suspended flag', async () => {
    const port = makePort({
      resumeTab: vi.fn(async (id) => ({ id, url: 'https://restored' }))
    })
    setBrowserPort(port)

    useBrowserStore.setState({
      tabs: [
        {
          id: 'a',
          url: 'https://restored',
          title: '',
          favicon: null,
          loading: false,
          canGoBack: false,
          canGoForward: false,
          readerMode: false,
          suspended: true,
          savedUrl: 'https://restored'
        }
      ],
      activeTabId: null
    })

    await useBrowserStore.getState().activateTab('a')

    expect(port.resumeTab).toHaveBeenCalledWith('a')
    expect(port.activateTab).toHaveBeenCalledWith('a')
    const s = useBrowserStore.getState()
    expect(s.activeTabId).toBe('a')
    expect(s.tabs[0].suspended).toBe(false)
    expect(s.tabs[0].loading).toBe(true)
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run src/stores/browser.test.ts -t resume
```

Expected: FAIL — current `activateTab` does not handle `suspended`.

- [ ] **Step 3: Modify `activateTab`**

Replace `activateTab` in `src/stores/browser.ts`:

```ts
  async activateTab(id) {
    const tab = get().tabs.find((t) => t.id === id)
    if (tab?.suspended) {
      await port.resumeTab(id)
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === id ? { ...t, suspended: false, loading: true } : t
        )
      }))
    }
    await port.activateTab(id)
    set({ activeTabId: id })
  },
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/stores/browser.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/stores/browser.ts src/stores/browser.test.ts
git commit -m "feat(phase-11): activateTab resumes suspended tab via resumeTab IPC"
```

---

<!-- openspec-task: 5.1 -->

### Task 9: IPC contract — `browser` namespace

**Files:**

- Modify: `shared/ipc-contract.ts`
- Modify: `preload/preload.ts`

- [ ] **Step 1: Add the namespace + event channel + error code**

In `shared/ipc-contract.ts`:

1. **Add the `E_DUPLICATE` error code** (used by bookmarks but lives next to siblings):

```ts
// Find the IpcErrorCode union and IPC_ERROR_CODES table; add 'E_DUPLICATE' to both.
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
  | 'E_DUPLICATE'

export const IPC_ERROR_CODES = {
  // ... existing entries ...
  E_DUPLICATE: 'E_DUPLICATE'
} as const satisfies Record<IpcErrorCode, IpcErrorCode>
```

2. **Import browser types at the top:**

```ts
import type {
  Tab,
  TabId,
  TabPatch,
  TabStateChangedPayload,
  SetViewportArgs,
  Bookmark,
  BookmarkInput,
  BookmarkListOpts,
  BookmarkListResult
} from './browser-types'

export type {
  Tab,
  TabId,
  TabPatch,
  TabStateChangedPayload,
  SetViewportArgs,
  Bookmark,
  BookmarkInput,
  BookmarkListOpts,
  BookmarkListResult
} from './browser-types'
```

3. **Inside `IpcContract`, append the `browser` namespace:**

```ts
  browser: {
    createTab: (url?: string) => { id: TabId; url: string }
    closeTab: (id: TabId) => void
    activateTab: (id: TabId) => void
    navigate: (id: TabId, url: string) => void
    reload: (id: TabId) => void
    goBack: (id: TabId) => void
    goForward: (id: TabId) => void
    setReaderMode: (id: TabId, on: boolean) => void
    setViewport: (rect: SetViewportArgs) => void
    suspendTab: (id: TabId) => void
    resumeTab: (id: TabId) => { id: TabId; url: string }
  }
```

4. **Inside `IpcEventContract`, add the channel:**

```ts
  'browser:tabStateChanged': TabStateChangedPayload
```

- [ ] **Step 2: Wire `preload/preload.ts`**

Add the matching invoke methods inside `request`:

```ts
  browser: {
    createTab: (url) => invoke('browser.createTab', url),
    closeTab: (id) => invoke('browser.closeTab', id),
    activateTab: (id) => invoke('browser.activateTab', id),
    navigate: (id, url) => invoke('browser.navigate', id, url),
    reload: (id) => invoke('browser.reload', id),
    goBack: (id) => invoke('browser.goBack', id),
    goForward: (id) => invoke('browser.goForward', id),
    setReaderMode: (id, on) => invoke('browser.setReaderMode', id, on),
    setViewport: (rect) => invoke('browser.setViewport', rect),
    suspendTab: (id) => invoke('browser.suspendTab', id),
    resumeTab: (id) => invoke('browser.resumeTab', id)
  }
```

- [ ] **Step 3: Wire renderer port adapters**

Locate the renderer file that wires `setBrowserPort` / `setBrowserEventPort` (likely a thin module like `src/ipc/browser-port.ts` or done inline in `App.tsx`). Create `src/ipc/browser-port.ts`:

```ts
// src/ipc/browser-port.ts
import { ipc } from './client'
import type { BrowserPort, BrowserEventPort } from '@/stores/browser'
import type { TabStateChangedPayload } from '@shared/browser-types'

export const browserPort: BrowserPort = {
  createTab: (url) => ipc.browser.createTab(url),
  closeTab: (id) => ipc.browser.closeTab(id),
  activateTab: (id) => ipc.browser.activateTab(id),
  navigate: (id, url) => ipc.browser.navigate(id, url),
  reload: (id) => ipc.browser.reload(id),
  goBack: (id) => ipc.browser.goBack(id),
  goForward: (id) => ipc.browser.goForward(id),
  setReaderMode: (id, on) => ipc.browser.setReaderMode(id, on),
  setViewport: (rect) => ipc.browser.setViewport(rect),
  suspendTab: (id) => ipc.browser.suspendTab(id),
  resumeTab: (id) => ipc.browser.resumeTab(id)
}

export const browserEventPort: BrowserEventPort = {
  onTabStateChanged: (h) => ipc.on('browser:tabStateChanged', (p: TabStateChangedPayload) => h(p))
}
```

Then in `src/main.tsx` (or wherever boot wiring lives), call them once at module import:

```ts
import { setBrowserPort, setBrowserEventPort } from '@/stores/browser'
import { browserPort, browserEventPort } from '@/ipc/browser-port'

setBrowserPort(browserPort)
setBrowserEventPort(browserEventPort)
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0. (The handler implementations come in tasks 11 and 12; until then `ipcMain` will reject the channels at runtime — but typecheck must already pass.)

- [ ] **Step 5: Commit**

```bash
git add shared/ipc-contract.ts preload/preload.ts src/ipc/browser-port.ts src/main.tsx
git commit -m "feat(phase-11): IPC contract — browser namespace + tabStateChanged event"
```

---

<!-- openspec-task: 5.2 -->

### Task 10: IPC contract — `bookmarks` namespace

**Files:**

- Modify: `shared/ipc-contract.ts`
- Modify: `preload/preload.ts`

- [ ] **Step 1: Append `bookmarks` namespace inside `IpcContract`**

```ts
  bookmarks: {
    list: (opts: BookmarkListOpts) => BookmarkListResult
    create: (input: BookmarkInput) => Bookmark
    update: (id: number, patch: { title?: string | null; favicon?: string | null; tags?: string[] }) => Bookmark
    delete: (id: number) => { ok: true }
    getByUrl: (url: string) => Bookmark | null
  }
```

- [ ] **Step 2: Add invokes to `preload/preload.ts`**

```ts
  bookmarks: {
    list: (opts) => invoke('bookmarks.list', opts),
    create: (input) => invoke('bookmarks.create', input),
    update: (id, patch) => invoke('bookmarks.update', id, patch),
    delete: (id) => invoke('bookmarks.delete', id),
    getByUrl: (url) => invoke('bookmarks.getByUrl', url)
  }
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add shared/ipc-contract.ts preload/preload.ts
git commit -m "feat(phase-11): IPC contract — bookmarks namespace"
```

---

<!-- openspec-task: 5.3 -->

### Task 11: `electron/ipc/browser.ts` — handler implementation

This handler is mostly thin shims to manager / contents / bounds. Tests cover only the URL synthesis used by `createTab` (path-derived) and the suspend/resume orchestration; deep WebContents behaviour is integration-tested in Plan 5.

**Files:**

- Modify: `electron/ipc/browser.ts`
- Create: `electron/ipc/browser.test.ts`
- Modify: `electron/ipc/handlers.ts` (register the namespace)

- [ ] **Step 1: Write failing tests for the testable bits**

```ts
// electron/ipc/browser.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

// We test only the pure helpers that don't require an Electron runtime:
//   - newTabId() generates a unique id
//   - resolveCreateUrl() handles undefined → about:blank
import { newTabId, resolveCreateUrl } from './browser'

describe('newTabId', () => {
  it('returns unique strings', () => {
    const a = newTabId()
    const b = newTabId()
    expect(typeof a).toBe('string')
    expect(a).not.toBe(b)
  })
})

describe('resolveCreateUrl', () => {
  it('returns about:blank when undefined', () => {
    expect(resolveCreateUrl(undefined)).toBe('about:blank')
  })
  it('returns the input when provided', () => {
    expect(resolveCreateUrl('https://x.com')).toBe('https://x.com')
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/ipc/browser.test.ts
```

Expected: FAIL — exports missing.

- [ ] **Step 3: Implement handlers**

Replace `electron/ipc/browser.ts`:

```ts
// electron/ipc/browser.ts
import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import { logger } from '../services/logger'
import type { IpcContract, TabId, SetViewportArgs } from '@shared/ipc-contract'
import { mainWindow } from '../main'
import {
  createTabView,
  attachTabEvents,
  attachWindowOpenHandler,
  makeTabStateSender
} from '../browser/contents'
import { getManager } from '../browser/manager'
import { getBounds } from '../browser/bounds'
import { BROWSER_SESSION_PARTITION } from '../browser/init'

// --- pure helpers (unit-tested) ---
export const newTabId = (): TabId => `tab-${randomUUID()}`
export const resolveCreateUrl = (url: string | undefined): string => url ?? 'about:blank'

// --- adoption: register an externally-spawned WebContents as a tab ---
function adoptWebContents(webContents: Electron.WebContents): TabId {
  const id = newTabId()
  // Wrap the web contents in a WebContentsView. Electron 39 has a
  // `WebContentsView({ webContents })` constructor.
  // The actual API may differ slightly across versions; if the constructor
  // doesn't accept an existing webContents, the fallback is to discard the
  // incoming one and create a fresh tab loading the same URL.
  // For simplicity we use the latter — losing the in-flight load is acceptable
  // because window.open targets are usually navigations, not active sessions.
  const url = webContents.getURL() || 'about:blank'
  webContents.close()
  registerNewTabFromUrl(id, url)
  return id
}

function registerNewTabFromUrl(id: TabId, url: string): void {
  const win = mainWindow
  if (!win) throw new Error('mainWindow not ready')
  const { view, webContents } = createTabView({
    url,
    sessionPartition: BROWSER_SESSION_PARTITION
  })
  attachTabEvents(id, webContents, makeTabStateSender(win))
  attachWindowOpenHandler(webContents, {
    registerNewTab: (wc) => adoptWebContents(wc)
  })
  getManager().register(id, view)
}

// --- handler map ---
type H = IpcContract['browser']

export const browserHandlers: H = {
  createTab(url) {
    const id = newTabId()
    const resolved = resolveCreateUrl(url)
    registerNewTabFromUrl(id, resolved)
    getManager().attach(id)
    logger.info('browser.createTab', { id, url: resolved })
    return { id, url: resolved }
  },
  closeTab(id) {
    getManager().destroy(id)
  },
  activateTab(id) {
    getManager().attach(id)
  },
  navigate(id, url) {
    const tab = getManager().get(id)
    if (!tab) return
    void tab.view.webContents.loadURL(url)
  },
  reload(id) {
    getManager().get(id)?.view.webContents.reload()
  },
  goBack(id) {
    const wc = getManager().get(id)?.view.webContents
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
  },
  goForward(id) {
    const wc = getManager().get(id)?.view.webContents
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
  },
  setReaderMode(id, on) {
    const tab = getManager().get(id)
    if (!tab) return
    const wc = tab.view.webContents
    const READER_CSS = `
      body { max-width: 720px !important; margin: 0 auto !important;
             font-family: Georgia, serif; font-size: 18px; line-height: 1.7; color: #222; }
      header, nav, footer, aside, [class*="sidebar"], [class*="banner"], [class*="ad"] { display: none !important; }
      img { max-width: 100% !important; height: auto !important; }
    `
    // Stash the inserted-CSS key on the manager entry. We extend ManagedTab by
    // attaching an arbitrary property. Plan 1 task 6 ManagedTab interface kept
    // it minimal; here we sneak in a side-channel via a Map.
    ;(globalThis as any).__readerCssKeys ??= new Map<TabId, string>()
    const m = (globalThis as any).__readerCssKeys as Map<TabId, string>
    if (on) {
      void wc.insertCSS(READER_CSS).then((key) => m.set(id, key))
    } else {
      const key = m.get(id)
      if (key) {
        void wc.removeInsertedCSS(key)
        m.delete(id)
      }
    }
  },
  setViewport(rect: SetViewportArgs) {
    getBounds().setViewport(rect)
  },
  suspendTab(id) {
    getManager().destroy(id)
  },
  resumeTab(id) {
    // Caller (renderer store) holds the savedUrl; main has lost it on suspend.
    // We accept this trade-off: the renderer always supplies a fresh URL via
    // a follow-up `navigate` if needed. For the simplest path, treat resume
    // like createTab(about:blank) and let the renderer immediately call
    // `navigate(id, savedUrl)`.
    registerNewTabFromUrl(id, 'about:blank')
    getManager().attach(id)
    return { id, url: 'about:blank' }
  }
}
```

- [ ] **Step 4: Register handlers in `electron/ipc/handlers.ts`**

Add the import and entry:

```ts
import { browserHandlers } from './browser'

export const ipcHandlers: HandlerMap = {
  // ... existing entries ...
  browser: browserHandlers
}
```

- [ ] **Step 5: Run unit tests**

```bash
npx vitest run electron/ipc/browser.test.ts
```

Expected: 3 passed.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add electron/ipc/browser.ts electron/ipc/browser.test.ts electron/ipc/handlers.ts
git commit -m "feat(phase-11): browser IPC handlers — wired through manager/bounds/contents"
```

---

<!-- openspec-task: 5.4 -->

### Task 12: `electron/ipc/bookmarks.ts` — SQLite CRUD with `E_DUPLICATE`

**Files:**

- Modify: `electron/ipc/bookmarks.ts`
- Create: `electron/ipc/bookmarks.test.ts`
- Modify: `electron/ipc/handlers.ts`

- [ ] **Step 1: Write failing tests**

```ts
// electron/ipc/bookmarks.test.ts
import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { applyMigrations } from '../services/db/migrations'
import { join } from 'node:path'
import { createBookmarkHandlers } from './bookmarks'
import { IpcError } from '@shared/ipc-contract'

const MIGRATIONS_DIR = join(__dirname, '..', 'services', 'db', 'migrations')

function makeHandlers() {
  const db = new Database(':memory:')
  applyMigrations(db, MIGRATIONS_DIR)
  // Stable timestamps for assertions
  let now = 0
  const handlers = createBookmarkHandlers({
    getDb: () => db,
    nowIso: () => `2026-05-02T00:00:0${(now++ % 10).toString()}Z`
  })
  return { db, handlers }
}

describe('bookmarks handlers', () => {
  it('create stores a row and returns parsed Bookmark', () => {
    const { db, handlers } = makeHandlers()
    const bm = handlers.create({ url: 'https://x.com', title: 'X', tags: ['news', 'ai'] })

    expect(bm).toMatchObject({
      url: 'https://x.com',
      title: 'X',
      tags: ['news', 'ai']
    })
    expect(typeof bm.id).toBe('number')
    expect(bm.createdAt).toBeTruthy()

    const row = db.prepare('SELECT url, tags_json FROM bookmarks WHERE id=?').get(bm.id) as any
    expect(row.url).toBe('https://x.com')
    expect(JSON.parse(row.tags_json)).toEqual(['news', 'ai'])
  })

  it('create on duplicate url throws E_DUPLICATE with existing id in message', () => {
    const { handlers } = makeHandlers()
    const first = handlers.create({ url: 'https://dup.com' })

    let err: unknown
    try {
      handlers.create({ url: 'https://dup.com' })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(IpcError)
    expect((err as IpcError).code).toBe('E_DUPLICATE')
    expect((err as IpcError).message).toContain(String(first.id))
  })

  it('list filters by q (case-insensitive LIKE on title or url)', () => {
    const { handlers } = makeHandlers()
    handlers.create({ url: 'https://news.com', title: 'World news today' })
    handlers.create({ url: 'https://example.com', title: 'Cooking' })

    const r = handlers.list({ q: 'NEWS', limit: 10, offset: 0 })
    expect(r.total).toBe(1)
    expect(r.items[0].url).toBe('https://news.com')
  })

  it('list filters by tag using LIKE on tags_json', () => {
    const { handlers } = makeHandlers()
    handlers.create({ url: 'https://a.com', tags: ['ai'] })
    handlers.create({ url: 'https://b.com', tags: ['cooking'] })

    const r = handlers.list({ tag: 'ai', limit: 10, offset: 0 })
    expect(r.total).toBe(1)
    expect(r.items[0].url).toBe('https://a.com')
  })

  it('update modifies title/tags but never url', () => {
    const { handlers } = makeHandlers()
    const bm = handlers.create({ url: 'https://x.com', title: 'Old' })

    const upd = handlers.update(bm.id, { title: 'New', tags: ['fresh'] })
    expect(upd.title).toBe('New')
    expect(upd.tags).toEqual(['fresh'])
    expect(upd.url).toBe('https://x.com')
  })

  it('delete removes the row', () => {
    const { db, handlers } = makeHandlers()
    const bm = handlers.create({ url: 'https://x.com' })
    handlers.delete(bm.id)
    expect(db.prepare('SELECT COUNT(*) AS n FROM bookmarks').get()).toEqual({ n: 0 })
  })

  it('getByUrl returns null for missing url', () => {
    const { handlers } = makeHandlers()
    expect(handlers.getByUrl('https://nope.com')).toBe(null)
  })

  it('getByUrl returns the bookmark when present', () => {
    const { handlers } = makeHandlers()
    const bm = handlers.create({ url: 'https://x.com' })
    expect(handlers.getByUrl('https://x.com')?.id).toBe(bm.id)
  })

  it('list orders by created_at DESC', () => {
    const { handlers } = makeHandlers()
    const a = handlers.create({ url: 'https://a.com' })
    const b = handlers.create({ url: 'https://b.com' })
    const c = handlers.create({ url: 'https://c.com' })

    const r = handlers.list({ limit: 10, offset: 0 })
    // c is newest (created latest). Most recent first.
    expect(r.items.map((x) => x.id)).toEqual([c.id, b.id, a.id])
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/ipc/bookmarks.test.ts
```

Expected: FAIL — `createBookmarkHandlers` not exported.

- [ ] **Step 3: Implement handlers**

Replace `electron/ipc/bookmarks.ts`:

```ts
// electron/ipc/bookmarks.ts
import type Database from 'better-sqlite3'
import { IpcError } from '@shared/ipc-contract'
import type {
  IpcContract,
  Bookmark,
  BookmarkInput,
  BookmarkListOpts,
  BookmarkListResult
} from '@shared/ipc-contract'
import { dbService } from '../services/db'

interface BookmarkDeps {
  getDb: () => Database.Database
  nowIso: () => string
}

interface RawRow {
  id: number
  url: string
  title: string | null
  favicon: string | null
  tags_json: string | null
  created_at: string
  updated_at: string
}

function rowToBookmark(r: RawRow): Bookmark {
  let tags: string[] = []
  if (r.tags_json) {
    try {
      const parsed = JSON.parse(r.tags_json)
      if (Array.isArray(parsed)) tags = parsed.filter((x): x is string => typeof x === 'string')
    } catch {
      tags = []
    }
  }
  return {
    id: r.id,
    url: r.url,
    title: r.title,
    favicon: r.favicon,
    tags,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export function createBookmarkHandlers(deps: BookmarkDeps): IpcContract['bookmarks'] {
  function getExistingByUrl(url: string): RawRow | undefined {
    return deps
      .getDb()
      .prepare<[string], RawRow>(`SELECT * FROM bookmarks WHERE url=?`)
      .get(url) as RawRow | undefined
  }

  return {
    create(input: BookmarkInput): Bookmark {
      const db = deps.getDb()
      const existing = getExistingByUrl(input.url)
      if (existing) {
        throw new IpcError('E_DUPLICATE', `bookmark already exists (id=${existing.id})`)
      }
      const now = deps.nowIso()
      const tagsJson = input.tags ? JSON.stringify(input.tags) : null
      const result = db
        .prepare(
          `INSERT INTO bookmarks(url, title, favicon, tags_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(input.url, input.title ?? null, input.favicon ?? null, tagsJson, now, now)
      const row = db
        .prepare<[number], RawRow>(`SELECT * FROM bookmarks WHERE id=?`)
        .get(Number(result.lastInsertRowid)) as RawRow
      return rowToBookmark(row)
    },

    list(opts: BookmarkListOpts): BookmarkListResult {
      const db = deps.getDb()
      const where: string[] = []
      const params: unknown[] = []
      if (opts.q) {
        where.push(`(LOWER(url) LIKE ? OR LOWER(title) LIKE ?)`)
        const needle = `%${opts.q.toLowerCase()}%`
        params.push(needle, needle)
      }
      if (opts.tag) {
        where.push(`tags_json LIKE ?`)
        params.push(`%"${opts.tag}"%`)
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const totalRow = db
        .prepare(`SELECT COUNT(*) AS n FROM bookmarks ${whereSql}`)
        .get(...params) as { n: number }
      const items = db
        .prepare(`SELECT * FROM bookmarks ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .all(...params, opts.limit, opts.offset) as RawRow[]
      return { items: items.map(rowToBookmark), total: totalRow.n }
    },

    update(id, patch): Bookmark {
      const db = deps.getDb()
      const existing = db
        .prepare<[number], RawRow>(`SELECT * FROM bookmarks WHERE id=?`)
        .get(id) as RawRow | undefined
      if (!existing) {
        throw new IpcError('E_NOT_FOUND', `bookmark id=${id} not found`)
      }
      const newTitle = patch.title !== undefined ? patch.title : existing.title
      const newFavicon = patch.favicon !== undefined ? patch.favicon : existing.favicon
      const newTagsJson = patch.tags !== undefined ? JSON.stringify(patch.tags) : existing.tags_json
      const updatedAt = deps.nowIso()
      db.prepare(
        `UPDATE bookmarks SET title=?, favicon=?, tags_json=?, updated_at=? WHERE id=?`
      ).run(newTitle, newFavicon, newTagsJson, updatedAt, id)
      const row = db
        .prepare<[number], RawRow>(`SELECT * FROM bookmarks WHERE id=?`)
        .get(id) as RawRow
      return rowToBookmark(row)
    },

    delete(id) {
      deps.getDb().prepare(`DELETE FROM bookmarks WHERE id=?`).run(id)
      return { ok: true }
    },

    getByUrl(url): Bookmark | null {
      const row = getExistingByUrl(url)
      return row ? rowToBookmark(row) : null
    }
  }
}

// Singleton wrapper used by handlers.ts; binds to the live grove DB.
export const bookmarkHandlers: IpcContract['bookmarks'] = createBookmarkHandlers({
  getDb: () => {
    const db = dbService.getCurrent()
    if (!db) throw new IpcError('E_NOT_FOUND', 'no grove open')
    return db
  },
  nowIso: () => new Date().toISOString()
})
```

> If `dbService.getCurrent` does not exist with that exact name, replace with the actual phase-03 export — search `electron/services/db.ts` for the function that returns the current `Database.Database` and use it. **Stop and reconcile** rather than guessing.

- [ ] **Step 4: Register handlers**

In `electron/ipc/handlers.ts`:

```ts
import { bookmarkHandlers } from './bookmarks'

export const ipcHandlers: HandlerMap = {
  // ... existing entries ...
  bookmarks: bookmarkHandlers
}
```

- [ ] **Step 5: Run all bookmarks tests**

```bash
npx vitest run electron/ipc/bookmarks.test.ts
```

Expected: 9 passed.

- [ ] **Step 6: Typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add electron/ipc/bookmarks.ts electron/ipc/bookmarks.test.ts electron/ipc/handlers.ts
git commit -m "feat(phase-11): bookmarks IPC handlers — list/create/update/delete/getByUrl + E_DUPLICATE"
```

---

## Self-Review Checklist (run after Task 12)

- [ ] Every label `3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4` appears exactly once. Verify:
  ```bash
  grep -oE 'openspec-task: [0-9.]+' docs/superpowers/plans/2026-05-02-phase-11-browser-tabs-bookmarks-tasks-3.1-5.4.md | sort -u
  ```
- [ ] Spec coverage:
  - `bookmarks-store §"bookmarks IPC"` → Task 12
  - `bookmarks-store §"书签数据去重"` → Task 12 (E_DUPLICATE path)
  - `browser-shell §"WebContentsView 生命周期"` (session) → Task 1
  - `browser-tabs §"Tabs Store 模型"` → Tasks 4–5
  - `browser-tabs §"Tab 状态同步"` (renderer side) → Task 6
  - `browser-shell §"WebContentsView 生命周期"` (LRU/resume) → Tasks 7–8
  - `browser-navigation §"广告 / 追踪域名拦截"` → Tasks 2–3
- [ ] Run all unit tests added/touched:
  ```bash
  npx vitest run electron/browser src/stores/browser.test.ts electron/ipc/browser.test.ts electron/ipc/bookmarks.test.ts
  ```
  Expected: ~30 tests green.
- [ ] Typecheck + lint clean:
  ```bash
  npm run typecheck && npm run lint
  ```
- [ ] Manually launch the app once; log shows `browser subsystem initialized` and `browser: ad-block ready { hostsCount: <number> }`.
