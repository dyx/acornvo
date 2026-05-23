# Phase 11 — Browser Tabs & Bookmarks: Plan 1 (Schema, types, WebContentsView main framework)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **OpenSpec change:** `phase-11-browser-tabs-bookmarks`
> **Task range:** OpenSpec tasks `1.1`–`2.6` (10 tasks)
> **Plan order:** 1 of 5. Subsequent plans (`3.1-5.4`, `6.1-6.7`, `7.1-9.1`, `10.1-10.17`) build on this one.
> **Status:** Not started
> **Created:** 2026-05-02
> **Branch suggestion:** `feat/phase-11-browser-tabs-bookmarks` (branch from `main` after phase-08 lands)

---

## Goal

Land the foundation for the in-app browser ("拾果"): bookmarks SQLite schema (migration 004), shared TypeScript types, packaged ad-block hosts list, and the **main-process WebContentsView lifecycle layer** — `contents.ts` factory, `manager.ts` view registry, `bounds.ts` viewport sync, plus the per-tab `webContents` event/handler wiring (state forwarding, `setWindowOpenHandler`, `onBeforeRequest` ad-block).

## Architecture

- One `WebContentsView` per tab; the parent `BrowserWindow.contentView` keeps at most one attached child at a time (`addChildView` / `removeChildView`). Renderer React DOM (`TabBar` / `AddressBar`) draws above; the WebContentsView is a native rectangle clipped to the bounds we push from renderer via `browser.setViewport` IPC.
- `manager.ts` is the single registry for `tabId → { view, webContents, savedUrl, lastActiveAt }`. `attach(id)` detaches the previously attached view, attaches the requested one, and updates `lastActiveAt`. `destroy(id)` is used both for normal close and for LRU suspension (Plan 2 task 4.4 will call it).
- `bounds.ts` is a tiny module: `setViewport(bounds)` stores the latest rect and re-applies it to the **currently attached** view; `manager.ts` calls it again whenever it attaches a new view, so re-attach uses the most recent bounds.
- Per-tab event subscriptions live in `contents.ts` and are wired at creation time. They forward to renderer through the typed event channel `browser:tabStateChanged` (added to `IpcEventContract` in Plan 2 task 5.1; this plan defines the shape via `shared/browser-types.ts` so the wiring compiles).
- Ad-block uses `session.webRequest.onBeforeRequest`; the hosts file is shipped under `public/hosts/` and copied to `resources/` at build. Plan 2 task 3.2 will load it; this plan only ships the file and stubs the loader.
- `setWindowOpenHandler` returns `{ action: 'allow' }` for `http(s)`; the new WebContents is intercepted via `webContents.setWindowOpenHandler` returning `{ action: 'allow', overrideBrowserWindowOptions: { ... }, outlivesOpener: false }` and **caught** by `app.on('web-contents-created', ...)` in `manager.ts`, which wraps it as a new tab — this is the pattern that works in Electron 39+ where `did-create-window` only fires for actual browser windows.
- `outlivesOpener` is intentionally false; if the parent tab closes the popup tab also dies (matches Chrome semantics).

## Tech Stack

- Electron 39 (`WebContentsView`, `session.fromPartition`, `webContents.setWindowOpenHandler`)
- `better-sqlite3@^12` (already installed; phase-03 owns connection mgmt)
- `vitest@^2` (existing) — unit tests where they fit; main-process WebContentsView code is tested at integration level in Plan 5 acceptance
- Node 22+

## Files Touched (this plan)

| Path                                                            | Action                  | Owner task         |
| --------------------------------------------------------------- | ----------------------- | ------------------ |
| `electron/services/db/migrations/004_bookmarks.sql`             | Create                  | 1.1                |
| `electron/services/db/migrations/004_bookmarks.test.ts`         | Create                  | 1.1                |
| `shared/browser-types.ts`                                       | Create                  | 1.2                |
| `public/hosts/block-domains.txt`                                | Create                  | 1.3                |
| `electron-builder` extraResources / vite copy plugin if present | Verify                  | 1.3                |
| `electron/browser/contents.ts`                                  | Create stub → implement | 1.4, 2.1, 2.4, 2.5 |
| `electron/browser/manager.ts`                                   | Create stub → implement | 1.4, 2.2           |
| `electron/browser/bounds.ts`                                    | Create stub → implement | 1.4, 2.3           |
| `electron/browser/adblock.ts`                                   | Create stub → implement | 1.4, 2.6           |
| `electron/ipc/browser.ts`                                       | Create stub             | 1.4                |
| `electron/ipc/bookmarks.ts`                                     | Create stub             | 1.4                |
| `src/pages/Browse.tsx`                                          | Create stub             | 1.4                |
| `src/components/browser/.gitkeep`                               | Create                  | 1.4                |
| `src/stores/browser.ts`                                         | Create stub             | 1.4                |
| `electron/browser/manager.test.ts`                              | Create                  | 2.2                |
| `electron/browser/bounds.test.ts`                               | Create                  | 2.3                |
| `electron/browser/adblock.test.ts`                              | Create                  | 2.6                |

## Pre-flight

- Phase-03 ships `electron/services/db/migrations.ts` with the `NNN_<name>.sql` convention. The runner reads `user_version`, applies the next file numerically, executes the SQL inside a transaction, then bumps `user_version`. `004_bookmarks.sql` MUST NOT include a `PRAGMA user_version = 4;` — the runner sets it.
- The `migrations/003_file_columns.sql` is the most recent existing migration. Verify the head before writing 004:
  ```bash
  ls electron/services/db/migrations | sort | tail -3
  ```
  Expected: `001_init.sql 002_fts.sql 003_file_columns.sql` (and tests). If `004_*.sql` already exists, **stop and reconcile**.
- Electron 39 exposes `WebContentsView` from `electron`. Verify:
  ```bash
  node -e "console.log(require('electron/package.json').version)"
  ```
  Expected: `39.x` or higher.

---

## Tasks

<!-- openspec-task: 1.1 -->

### Task 1: Migration 004 — `bookmarks` table

**Files:**

- Create: `electron/services/db/migrations/004_bookmarks.sql`
- Create: `electron/services/db/migrations/004_bookmarks.test.ts`

- [ ] **Step 1: Write the failing migration test**

```ts
// electron/services/db/migrations/004_bookmarks.test.ts
import Database from 'better-sqlite3'
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { applyMigrations } from '../migrations'

const MIGRATIONS_DIR = join(__dirname)

describe('migration 004_bookmarks', () => {
  it('creates bookmarks table with correct schema and bumps user_version to 4', () => {
    const db = new Database(':memory:')
    applyMigrations(db, MIGRATIONS_DIR)

    expect(db.pragma('user_version', { simple: true })).toBe(4)

    const cols = db.prepare(`PRAGMA table_info(bookmarks)`).all() as {
      name: string
      type: string
      notnull: number
      pk: number
    }[]
    const byName = Object.fromEntries(cols.map((c) => [c.name, c]))
    expect(byName.id).toMatchObject({ type: 'INTEGER', pk: 1 })
    expect(byName.url).toMatchObject({ type: 'TEXT', notnull: 1 })
    expect(byName.title?.type).toBe('TEXT')
    expect(byName.favicon?.type).toBe('TEXT')
    expect(byName.tags_json?.type).toBe('TEXT')
    expect(byName.created_at).toMatchObject({ type: 'TEXT', notnull: 1 })
    expect(byName.updated_at).toMatchObject({ type: 'TEXT', notnull: 1 })
  })

  it('UNIQUE constraint on url rejects duplicates', () => {
    const db = new Database(':memory:')
    applyMigrations(db, MIGRATIONS_DIR)

    const insert = db.prepare(
      `INSERT INTO bookmarks(url, title, favicon, tags_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    insert.run(
      'https://example.com',
      'Ex',
      null,
      null,
      '2026-05-02T00:00:00Z',
      '2026-05-02T00:00:00Z'
    )
    expect(() =>
      insert.run(
        'https://example.com',
        'Dup',
        null,
        null,
        '2026-05-02T00:00:00Z',
        '2026-05-02T00:00:00Z'
      )
    ).toThrow(/UNIQUE/)
  })

  it('idx_bookmarks_created and idx_bookmarks_url exist', () => {
    const db = new Database(':memory:')
    applyMigrations(db, MIGRATIONS_DIR)

    const idx = db.prepare(`PRAGMA index_list(bookmarks)`).all() as { name: string }[]
    const names = idx.map((i) => i.name)
    expect(names).toContain('idx_bookmarks_created')
    expect(names).toContain('idx_bookmarks_url')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run electron/services/db/migrations/004_bookmarks.test.ts
```

Expected: FAIL — file `004_bookmarks.sql` not found OR `bookmarks` table does not exist.

- [ ] **Step 3: Create the migration SQL**

```sql
-- electron/services/db/migrations/004_bookmarks.sql
-- migration: 004_bookmarks
-- Adds the `bookmarks` table for phase-11 in-app browser.
-- The runner sets PRAGMA user_version = 4 after applying this file.

CREATE TABLE bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT UNIQUE NOT NULL,
  title TEXT,
  favicon TEXT,
  tags_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_bookmarks_created ON bookmarks(created_at DESC);
CREATE INDEX idx_bookmarks_url ON bookmarks(url);
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run electron/services/db/migrations/004_bookmarks.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Run the full migrations suite to ensure no regression**

```bash
npx vitest run electron/services/db
```

Expected: all migration tests green (001/002/003/004).

- [ ] **Step 6: Commit**

```bash
git add electron/services/db/migrations/004_bookmarks.sql electron/services/db/migrations/004_bookmarks.test.ts
git commit -m "feat(phase-11): migration 004 — bookmarks table + indices"
```

---

<!-- openspec-task: 1.2 -->

### Task 2: Shared browser types

**Files:**

- Create: `shared/browser-types.ts`

- [ ] **Step 1: Create the types file**

```ts
// shared/browser-types.ts
// Types shared between main, preload, and renderer for the in-app browser.

export type TabId = string

export interface Tab {
  id: TabId
  url: string
  title: string
  favicon: string | null
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  readerMode: boolean
  suspended: boolean // true when WebContents has been destroyed (LRU)
  savedUrl: string // last-known url; used to restore on resume
}

export type TabPatch = Partial<
  Pick<Tab, 'url' | 'title' | 'favicon' | 'loading' | 'canGoBack' | 'canGoForward' | 'readerMode'>
>

export interface TabStateChangedPayload {
  tabId: TabId
  patch: TabPatch
}

export interface SetViewportArgs {
  x: number
  y: number
  width: number
  height: number
}

export interface Bookmark {
  id: number
  url: string
  title: string | null
  favicon: string | null
  tags: string[] // parsed from tags_json
  createdAt: string
  updatedAt: string
}

export interface BookmarkInput {
  url: string
  title?: string | null
  favicon?: string | null
  tags?: string[]
}

export interface BookmarkListOpts {
  q?: string
  tag?: string
  limit: number
  offset: number
}

export interface BookmarkListResult {
  items: Bookmark[]
  total: number
}

// Error code returned by bookmarks.create when url already exists.
// This rides on top of the existing IpcErrorCode union via the standard envelope.
export interface BookmarkDuplicateDetail {
  existingId: number
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add shared/browser-types.ts
git commit -m "feat(phase-11): shared Tab / Bookmark / SetViewportArgs types"
```

---

<!-- openspec-task: 1.3 -->

### Task 3: Ship `block-domains.txt`

**Files:**

- Create: `public/hosts/block-domains.txt`

- [ ] **Step 1: Verify `public/` is bundled**

```bash
grep -E '"(public|extraResources|files)"' package.json electron-builder.* electron.vite.config.ts vite.config.ts 2>/dev/null | head -20
```

Expected: at least one config bundles `public/` (vite default copies `public/` to dist root). If not, **stop** and add a copy step before continuing — Plan 2 task 3.2 reads this file at runtime via `app.getAppPath()`.

- [ ] **Step 2: Create the hosts list (curated subset, ~80 lines)**

```text
# public/hosts/block-domains.txt
# Curated subset of Steven Black's unified hosts list.
# Format: one hostname per line. Lines starting with `#` are comments.
# Loaded into a Set<string>; matched against new URL(req.url).hostname.

# --- Trackers (Google) ---
google-analytics.com
www.google-analytics.com
ssl.google-analytics.com
googletagmanager.com
www.googletagmanager.com
googletagservices.com
googleadservices.com
googlesyndication.com
adservice.google.com
pagead2.googlesyndication.com
stats.g.doubleclick.net
ad.doubleclick.net

# --- Trackers (Meta/Facebook) ---
connect.facebook.net
www.facebook.com/tr

# --- Trackers (Twitter/X) ---
analytics.twitter.com
ads-twitter.com

# --- Trackers (Microsoft) ---
bat.bing.com
clarity.ms

# --- Trackers (TikTok) ---
analytics.tiktok.com
business-api.tiktok.com

# --- Trackers (LinkedIn) ---
px.ads.linkedin.com

# --- Generic ad networks ---
adnxs.com
ib.adnxs.com
casalemedia.com
rubiconproject.com
openx.net
pubmatic.com
contextweb.com
3lift.com
adform.net
indexww.com
yieldmo.com
mediavine.com

# --- Mobile ad SDKs ---
adcolony.com
applovin.com
unityads.unity3d.com
tapjoy.com

# --- Common analytics ---
mixpanel.com
segment.io
api.segment.io
amplitude.com
api.amplitude.com
heap.io
heapanalytics.com
hotjar.com
static.hotjar.com
fullstory.com
rs.fullstory.com
intercom.io
api.intercom.io

# --- Chinese trackers (added for zh-CN audience) ---
hm.baidu.com
push.zhanzhang.baidu.com
cnzz.com
w1.cnzz.com
umeng.com
plus1.umeng.com
jpush.cn

# --- Crash/error reporting (often optional) ---
api.bugsnag.com
sentry.io
o.sentry.io

# End of list.
```

- [ ] **Step 3: Verify line count and file size**

```bash
wc -l public/hosts/block-domains.txt && ls -la public/hosts/block-domains.txt
```

Expected: ~80–100 lines, well under 100KB. (Spec D5 caps at ~100KB; this is far smaller and acceptable as the curated subset.)

- [ ] **Step 4: Smoke-load via Node**

```bash
node -e "const fs=require('fs');const lines=fs.readFileSync('public/hosts/block-domains.txt','utf8').split('\n').filter(l=>l && !l.startsWith('#'));console.log('hosts:', lines.length); console.log('sample:', lines.slice(0,3))"
```

Expected: prints a count > 50 and three sample hostnames.

- [ ] **Step 5: Commit**

```bash
git add public/hosts/block-domains.txt
git commit -m "feat(phase-11): bundle curated ad-block hosts list"
```

---

<!-- openspec-task: 1.4 -->

### Task 4: Scaffold module stubs

Create empty placeholder modules so subsequent tasks compile cleanly. Each stub exports a no-op token and is replaced by later tasks.

**Files:**

- Create: `electron/browser/contents.ts`
- Create: `electron/browser/manager.ts`
- Create: `electron/browser/bounds.ts`
- Create: `electron/browser/adblock.ts`
- Create: `electron/ipc/browser.ts`
- Create: `electron/ipc/bookmarks.ts`
- Create: `src/pages/Browse.tsx`
- Create: `src/components/browser/.gitkeep`
- Create: `src/stores/browser.ts`

- [ ] **Step 1: Create `electron/browser/contents.ts` stub**

```ts
// electron/browser/contents.ts — implemented in Plan 1 tasks 2.1, 2.4, 2.5
export const __browserContentsStub = true
```

- [ ] **Step 2: Create `electron/browser/manager.ts` stub**

```ts
// electron/browser/manager.ts — implemented in Plan 1 task 2.2
export const __browserManagerStub = true
```

- [ ] **Step 3: Create `electron/browser/bounds.ts` stub**

```ts
// electron/browser/bounds.ts — implemented in Plan 1 task 2.3
export const __browserBoundsStub = true
```

- [ ] **Step 4: Create `electron/browser/adblock.ts` stub**

```ts
// electron/browser/adblock.ts — implemented in Plan 1 task 2.6 + Plan 2 task 3.2
export const __browserAdblockStub = true
```

- [ ] **Step 5: Create `electron/ipc/browser.ts` stub**

```ts
// electron/ipc/browser.ts — implemented in Plan 2 task 5.3
export const __browserIpcStub = true
```

- [ ] **Step 6: Create `electron/ipc/bookmarks.ts` stub**

```ts
// electron/ipc/bookmarks.ts — implemented in Plan 2 task 5.4
export const __bookmarksIpcStub = true
```

- [ ] **Step 7: Create `src/pages/Browse.tsx` stub (replaces Placeholder later)**

```tsx
// src/pages/Browse.tsx — implemented in Plan 3 task 6.1
import type { JSX } from 'react'

export function Browse(): JSX.Element {
  return <div data-testid="browse-stub">Browse (stub)</div>
}
```

- [ ] **Step 8: Create `src/components/browser/.gitkeep`**

```bash
mkdir -p src/components/browser && touch src/components/browser/.gitkeep
```

- [ ] **Step 9: Create `src/stores/browser.ts` stub**

```ts
// src/stores/browser.ts — implemented in Plan 2 tasks 4.1–4.5
export const __browserStoreStub = true
```

- [ ] **Step 10: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 11: Commit**

```bash
git add electron/browser/ electron/ipc/browser.ts electron/ipc/bookmarks.ts src/pages/Browse.tsx src/components/browser/.gitkeep src/stores/browser.ts
git commit -m "feat(phase-11): scaffold browser/* + ipc + page/store stubs"
```

---

<!-- openspec-task: 2.1 -->

### Task 5: `createTabView()` in `electron/browser/contents.ts`

Single factory that creates a `WebContentsView` with the locked-down webPreferences and a designated session partition. Per-tab event subscription and `setWindowOpenHandler` are wired in tasks 2.4 and 2.5; this task delivers only the construction primitive.

**Files:**

- Modify: `electron/browser/contents.ts`

- [ ] **Step 1: Implement `createTabView`**

Replace the contents:

```ts
// electron/browser/contents.ts
import { WebContentsView, session } from 'electron'

export interface CreateTabViewOpts {
  url: string
  sessionPartition: string // e.g., 'persist:browser-default'
}

export interface CreatedTabView {
  view: WebContentsView
  webContents: Electron.WebContents
}

/**
 * Create a sandboxed WebContentsView for one browser tab.
 * - sandbox: true / contextIsolation: true / nodeIntegration: false
 * - no preload (the in-app browser does not expose window.api to the page)
 * - shared persistent session via the supplied partition
 *
 * Per-tab event subscription and setWindowOpenHandler are attached by
 * `manager.attach` (task 2.4 + 2.5), not here, so this factory stays pure.
 */
export function createTabView(opts: CreateTabViewOpts): CreatedTabView {
  const partitionedSession = session.fromPartition(opts.sessionPartition)
  const view = new WebContentsView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Empty string disables preload entirely.
      preload: '',
      session: partitionedSession,
      webSecurity: true,
      spellcheck: false
    }
  })
  void view.webContents.loadURL(opts.url)
  return { view, webContents: view.webContents }
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add electron/browser/contents.ts
git commit -m "feat(phase-11): createTabView factory with sandboxed webPreferences"
```

> **Note:** No unit test. `WebContentsView` requires the Electron runtime; the integration coverage lands in Plan 5 acceptance task 10.1.

---

<!-- openspec-task: 2.2 -->

### Task 6: `manager.ts` — tab registry with attach / detach / destroy

The manager holds the `Map<TabId, ManagedTab>`, knows which tab is currently attached to the parent `BrowserWindow.contentView`, and is the only module that calls `addChildView` / `removeChildView`. It does not own the window — `setMainWindow(win)` is called once at startup. To keep the manager unit-testable we split it into a pure `createManager(deps)` factory plus a singleton wrapper.

**Files:**

- Modify: `electron/browser/manager.ts`
- Create: `electron/browser/manager.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// electron/browser/manager.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createManager, type ManagerDeps } from './manager'

function makeView(label: string) {
  return { __label: label, webContents: { destroy: vi.fn(), isDestroyed: () => false } } as any
}

function makeDeps(): ManagerDeps & {
  contentView: {
    addChildView: ReturnType<typeof vi.fn>
    removeChildView: ReturnType<typeof vi.fn>
    children: any[]
  }
} {
  const children: any[] = []
  const contentView = {
    children,
    addChildView: vi.fn((v: any) => {
      children.push(v)
    }),
    removeChildView: vi.fn((v: any) => {
      const i = children.indexOf(v)
      if (i !== -1) children.splice(i, 1)
    })
  }
  return {
    contentView,
    getContentView: () => contentView as any,
    applyBoundsToView: vi.fn(),
    nowMs: () => 1000
  }
}

describe('manager', () => {
  let deps: ReturnType<typeof makeDeps>

  beforeEach(() => {
    deps = makeDeps()
  })

  it('register adds a tab; attach makes it the only child', () => {
    const m = createManager(deps)
    const v = makeView('a')
    m.register('t1', v)

    expect(m.has('t1')).toBe(true)
    expect(deps.contentView.children).toHaveLength(0) // register does not attach

    m.attach('t1')

    expect(deps.contentView.addChildView).toHaveBeenCalledWith(v)
    expect(deps.contentView.children).toEqual([v])
    expect(deps.applyBoundsToView).toHaveBeenCalledWith(v)
  })

  it('attach detaches the previously attached view first', () => {
    const m = createManager(deps)
    const v1 = makeView('a')
    const v2 = makeView('b')
    m.register('t1', v1)
    m.register('t2', v2)

    m.attach('t1')
    m.attach('t2')

    expect(deps.contentView.children).toEqual([v2])
    expect(deps.contentView.removeChildView).toHaveBeenCalledWith(v1)
  })

  it('destroy removes from registry and detaches if currently attached', () => {
    const m = createManager(deps)
    const v = makeView('a')
    m.register('t1', v)
    m.attach('t1')

    m.destroy('t1')

    expect(m.has('t1')).toBe(false)
    expect(deps.contentView.removeChildView).toHaveBeenCalledWith(v)
    expect(v.webContents.destroy).toHaveBeenCalled()
  })

  it('destroy on non-attached tab does not call removeChildView', () => {
    const m = createManager(deps)
    const v1 = makeView('a')
    const v2 = makeView('b')
    m.register('t1', v1)
    m.register('t2', v2)
    m.attach('t1')

    m.destroy('t2')

    expect(deps.contentView.removeChildView).not.toHaveBeenCalledWith(v2)
    expect(v2.webContents.destroy).toHaveBeenCalled()
  })

  it('attach updates lastActiveAt; pickLruTabId returns the oldest', () => {
    let now = 1000
    deps.nowMs = () => now
    const m = createManager(deps)
    m.register('t1', makeView('a'))
    m.register('t2', makeView('b'))
    m.register('t3', makeView('c'))

    now = 100
    m.attach('t1')
    now = 300
    m.attach('t2')
    now = 200
    m.attach('t3') // out of order

    expect(m.pickLruTabId()).toBe('t1')
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/browser/manager.test.ts
```

Expected: FAIL — `createManager` not exported.

- [ ] **Step 3: Implement `manager.ts`**

```ts
// electron/browser/manager.ts
import type { WebContentsView, BrowserWindow } from 'electron'
import type { TabId } from '@shared/browser-types'

export interface ManagedTab {
  view: WebContentsView
  lastActiveAt: number
}

export interface ManagerDeps {
  /** Returns the parent BrowserWindow.contentView. Lazy because the window may not exist yet. */
  getContentView: () => Electron.View
  /** Re-applies the latest viewport bounds to the given view. Implemented by bounds.ts (task 2.3). */
  applyBoundsToView: (view: WebContentsView) => void
  /** Source of monotonic time for LRU; injectable so tests are deterministic. */
  nowMs: () => number
}

export interface Manager {
  register(tabId: TabId, view: WebContentsView): void
  attach(tabId: TabId): void
  detach(tabId: TabId): void
  destroy(tabId: TabId): void
  has(tabId: TabId): boolean
  get(tabId: TabId): ManagedTab | undefined
  attachedTabId(): TabId | null
  /** Oldest by lastActiveAt; null when registry is empty. */
  pickLruTabId(): TabId | null
  size(): number
}

export function createManager(deps: ManagerDeps): Manager {
  const tabs = new Map<TabId, ManagedTab>()
  let attachedId: TabId | null = null

  function attach(tabId: TabId): void {
    const tab = tabs.get(tabId)
    if (!tab) return
    if (attachedId && attachedId !== tabId) {
      const prev = tabs.get(attachedId)
      if (prev) deps.getContentView().removeChildView(prev.view)
    }
    deps.getContentView().addChildView(tab.view)
    deps.applyBoundsToView(tab.view)
    tab.lastActiveAt = deps.nowMs()
    attachedId = tabId
  }

  function detach(tabId: TabId): void {
    const tab = tabs.get(tabId)
    if (!tab) return
    if (attachedId === tabId) {
      deps.getContentView().removeChildView(tab.view)
      attachedId = null
    }
  }

  function destroy(tabId: TabId): void {
    const tab = tabs.get(tabId)
    if (!tab) return
    detach(tabId)
    if (!tab.view.webContents.isDestroyed()) {
      tab.view.webContents.close()
    }
    tabs.delete(tabId)
  }

  return {
    register(tabId, view) {
      tabs.set(tabId, { view, lastActiveAt: deps.nowMs() })
    },
    attach,
    detach,
    destroy,
    has: (tabId) => tabs.has(tabId),
    get: (tabId) => tabs.get(tabId),
    attachedTabId: () => attachedId,
    pickLruTabId() {
      let oldestId: TabId | null = null
      let oldest = Number.POSITIVE_INFINITY
      for (const [id, tab] of tabs) {
        if (tab.lastActiveAt < oldest) {
          oldest = tab.lastActiveAt
          oldestId = id
        }
      }
      return oldestId
    },
    size: () => tabs.size
  }
}

// --- Singleton wiring (used by IPC handlers; tests use createManager directly) ---

let mainWindowRef: BrowserWindow | null = null
let singleton: Manager | null = null

export function setMainWindow(win: BrowserWindow): void {
  mainWindowRef = win
  singleton = null // force rebuild on next access
}

export function getManager(): Manager {
  if (!singleton) {
    if (!mainWindowRef) {
      throw new Error('manager: setMainWindow must be called before getManager')
    }
    // applyBoundsToView is wired in task 2.3 (bounds.ts); for now keep a no-op fallback
    // that bounds.ts will replace via setBoundsApplier(). We keep the seam so the cycle
    // browser/manager <-> browser/bounds is broken.
    singleton = createManager({
      getContentView: () => mainWindowRef!.contentView,
      applyBoundsToView: (view) => boundsApplier(view),
      nowMs: () => Date.now()
    })
  }
  return singleton
}

let boundsApplier: (view: WebContentsView) => void = () => {}
export function setBoundsApplier(fn: (view: WebContentsView) => void): void {
  boundsApplier = fn
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/browser/manager.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add electron/browser/manager.ts electron/browser/manager.test.ts
git commit -m "feat(phase-11): browser manager — register/attach/destroy + LRU pick"
```

---

<!-- openspec-task: 2.3 -->

### Task 7: `bounds.ts` — viewport sync

`bounds.ts` stores the **single latest** viewport rectangle and re-applies it to whichever view is currently attached. The IPC handler (Plan 2) calls `setViewport`; the manager (task 2.2) calls `applyTo(view)` whenever it attaches a new view, via the seam established by `setBoundsApplier`.

**Files:**

- Modify: `electron/browser/bounds.ts`
- Create: `electron/browser/bounds.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// electron/browser/bounds.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createBounds, type BoundsDeps } from './bounds'

function makeView() {
  return { setBounds: vi.fn() } as any
}

describe('bounds', () => {
  let deps: BoundsDeps
  let getAttached: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getAttached = vi.fn(() => null)
    deps = { getAttachedView: getAttached as any }
  })

  it('setViewport stores rect; applyTo writes setBounds (rounded ints)', () => {
    const b = createBounds(deps)
    b.setViewport({ x: 10.4, y: 60.6, width: 800.5, height: 600.2 })

    const v = makeView()
    b.applyTo(v)
    expect(v.setBounds).toHaveBeenCalledWith({ x: 10, y: 61, width: 801, height: 600 })
  })

  it('setViewport re-applies to the currently attached view immediately', () => {
    const v = makeView()
    getAttached.mockReturnValue(v)
    const b = createBounds(deps)

    b.setViewport({ x: 0, y: 60, width: 800, height: 600 })

    expect(v.setBounds).toHaveBeenCalledWith({ x: 0, y: 60, width: 800, height: 600 })
  })

  it('applyTo before setViewport uses zeroed rect (safe default)', () => {
    const b = createBounds(deps)
    const v = makeView()
    b.applyTo(v)
    expect(v.setBounds).toHaveBeenCalledWith({ x: 0, y: 0, width: 0, height: 0 })
  })

  it('clamps negative width/height to 0', () => {
    const b = createBounds(deps)
    b.setViewport({ x: 0, y: 0, width: -10, height: -5 })
    const v = makeView()
    b.applyTo(v)
    expect(v.setBounds).toHaveBeenCalledWith({ x: 0, y: 0, width: 0, height: 0 })
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/browser/bounds.test.ts
```

Expected: FAIL — `createBounds` not exported.

- [ ] **Step 3: Implement `bounds.ts`**

```ts
// electron/browser/bounds.ts
import type { WebContentsView } from 'electron'
import type { SetViewportArgs } from '@shared/browser-types'

export interface BoundsDeps {
  /** Returns the currently attached view, or null. Wired to manager.attachedTabId+get(). */
  getAttachedView: () => WebContentsView | null
}

export interface Bounds {
  setViewport(rect: SetViewportArgs): void
  applyTo(view: WebContentsView): void
}

export function createBounds(deps: BoundsDeps): Bounds {
  let current: SetViewportArgs = { x: 0, y: 0, width: 0, height: 0 }

  function normalize(r: SetViewportArgs): SetViewportArgs {
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.max(0, Math.round(r.width)),
      height: Math.max(0, Math.round(r.height))
    }
  }

  return {
    setViewport(rect) {
      current = normalize(rect)
      const v = deps.getAttachedView()
      if (v) v.setBounds(current)
    },
    applyTo(view) {
      view.setBounds(current)
    }
  }
}

// --- Singleton wiring used by ipc/browser.ts and manager.ts ---

let singleton: Bounds | null = null
let attachedViewGetter: () => WebContentsView | null = () => null

export function configureBounds(getAttachedView: () => WebContentsView | null): void {
  attachedViewGetter = getAttachedView
  singleton = null
}

export function getBounds(): Bounds {
  if (!singleton) {
    singleton = createBounds({ getAttachedView: () => attachedViewGetter() })
  }
  return singleton
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/browser/bounds.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add electron/browser/bounds.ts electron/browser/bounds.test.ts
git commit -m "feat(phase-11): browser bounds — viewport rect cache + apply"
```

---

<!-- openspec-task: 2.4 -->

### Task 8: Per-tab `webContents` event subscription → `browser:tabStateChanged`

Wire WebContents events on creation so renderer can patch its store. We extend `contents.ts` with `attachTabEvents(tabId, webContents, send)` where `send` is the typed event-channel emitter (a thin wrapper on `BrowserWindow.webContents.send`).

**Files:**

- Modify: `electron/browser/contents.ts`

- [ ] **Step 1: Add `attachTabEvents` to `contents.ts`**

Append to `electron/browser/contents.ts`:

```ts
import type { TabId, TabPatch, TabStateChangedPayload } from '@shared/browser-types'

export type SendTabStateChanged = (payload: TabStateChangedPayload) => void

/**
 * Subscribe to the standard set of WebContents events for one tab and
 * forward TabPatch deltas via the supplied `send` function. Returns an
 * unsubscribe handle that the manager calls on destroy.
 */
export function attachTabEvents(
  tabId: TabId,
  webContents: Electron.WebContents,
  send: SendTabStateChanged
): () => void {
  const emit = (patch: TabPatch): void => send({ tabId, patch })

  const onStartLoading = (): void => emit({ loading: true })
  const onStopLoading = (): void =>
    emit({
      loading: false,
      canGoBack: webContents.navigationHistory.canGoBack(),
      canGoForward: webContents.navigationHistory.canGoForward()
    })
  const onTitleUpdated = (_e: Electron.Event, title: string): void => emit({ title })
  const onFaviconUpdated = (_e: Electron.Event, favicons: string[]): void => {
    emit({ favicon: favicons[0] ?? null })
  }
  const onDidNavigate = (_e: Electron.Event, url: string): void => {
    emit({
      url,
      readerMode: false, // spec: navigation resets reader mode
      canGoBack: webContents.navigationHistory.canGoBack(),
      canGoForward: webContents.navigationHistory.canGoForward()
    })
  }
  const onDidNavigateInPage = (_e: Electron.Event, url: string): void => {
    emit({
      url,
      canGoBack: webContents.navigationHistory.canGoBack(),
      canGoForward: webContents.navigationHistory.canGoForward()
    })
  }

  webContents.on('did-start-loading', onStartLoading)
  webContents.on('did-stop-loading', onStopLoading)
  webContents.on('page-title-updated', onTitleUpdated)
  webContents.on('page-favicon-updated', onFaviconUpdated)
  webContents.on('did-navigate', onDidNavigate)
  webContents.on('did-navigate-in-page', onDidNavigateInPage)

  return () => {
    webContents.off('did-start-loading', onStartLoading)
    webContents.off('did-stop-loading', onStopLoading)
    webContents.off('page-title-updated', onTitleUpdated)
    webContents.off('page-favicon-updated', onFaviconUpdated)
    webContents.off('did-navigate', onDidNavigate)
    webContents.off('did-navigate-in-page', onDidNavigateInPage)
  }
}
```

- [ ] **Step 2: Add `IpcEventContract['browser:tabStateChanged']` shape declaration**

We do **not** edit `shared/ipc-contract.ts` here (Plan 2 task 5.1 owns the full namespace); but to make `attachTabEvents` callers compile we route them through a typed wrapper. Add at the bottom of `contents.ts`:

```ts
import { BrowserWindow } from 'electron'

/**
 * Returns a `send` closure that posts to the renderer's main BrowserWindow,
 * via the typed event channel name `browser:tabStateChanged`.
 *
 * In Plan 2, the channel is added to IpcEventContract; until then we keep the
 * channel name in one place to avoid drift.
 */
export const TAB_STATE_CHANGED_CHANNEL = 'browser:tabStateChanged' as const

export function makeTabStateSender(window: BrowserWindow): SendTabStateChanged {
  return (payload) => {
    if (!window.isDestroyed()) {
      window.webContents.send(TAB_STATE_CHANGED_CHANNEL, payload)
    }
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add electron/browser/contents.ts
git commit -m "feat(phase-11): attachTabEvents forwards webContents events to renderer"
```

> **Note:** WebContents-driven events require the Electron runtime; integration coverage is Plan 5 acceptance task 10.4 (tab state) + 10.5 (favicon/title).

---

<!-- openspec-task: 2.5 -->

### Task 9: `setWindowOpenHandler` — http(s) → new tab; other → `shell.openExternal`

Per spec D4: same-window `<a href>` keeps default behavior; `target=_blank` / `window.open` go to the handler. http(s) returns `allow` (which produces a new WebContents we adopt as a new tab); non-http(s) returns `deny` and we shell-open.

**Files:**

- Modify: `electron/browser/contents.ts`

- [ ] **Step 1: Add `attachWindowOpenHandler` and `attachWebContentsCreatedAdoption`**

Append to `electron/browser/contents.ts`:

```ts
import { shell } from 'electron'

export interface AdoptionContext {
  /** Called by the adoption hook to register a freshly-spawned popup as a new tab. */
  registerNewTab: (newWebContents: Electron.WebContents) => void
}

/**
 * Per-tab window-open handler:
 *  - http(s)  → allow + adopt as a new tab via `app.on('web-contents-created')` listener
 *  - other    → deny + shell.openExternal(url)
 */
export function attachWindowOpenHandler(
  webContents: Electron.WebContents,
  ctx: AdoptionContext
): void {
  webContents.setWindowOpenHandler(({ url }) => {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return { action: 'deny' }
    }
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          show: false, // we never actually show the spawned BrowserWindow; we adopt the WebContents
          webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            preload: ''
          }
        },
        outlivesOpener: false
      }
    }
    void shell.openExternal(url).catch(() => {})
    return { action: 'deny' }
  })

  webContents.on('did-create-window', (childWindow) => {
    // Adopt: hide the auto-spawned window, then register its WebContents as a new tab
    // and close the BrowserWindow shell. The WebContents stays alive because we keep
    // a reference to it via the manager.
    childWindow.hide()
    ctx.registerNewTab(childWindow.webContents)
    // We do NOT call childWindow.close() — it would also destroy the WebContents.
    // Instead, leave the empty BrowserWindow until the tab closes; manager.destroy(tabId)
    // calls webContents.close(), which causes the host BrowserWindow to also dispose.
  })
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add electron/browser/contents.ts
git commit -m "feat(phase-11): setWindowOpenHandler — http(s) new tab; else shell.openExternal"
```

> **Integration coverage:** Plan 5 task 10.5 (`target=_blank` → new tab) and 10.6 (`mailto:` → openExternal).

---

<!-- openspec-task: 2.6 -->

### Task 10: `adblock.ts` — onBeforeRequest cancel-by-hostname (with hosts injection seam)

We split the ad-block module into a pure matcher (`createAdblock(hosts)` returns `{ shouldBlock(url), markBlocked(), drainCount() }`) plus a session-binding helper (`bindToSession(session, adblock)`). Plan 2 task 3.2 supplies the loaded host set; this task ships the matcher + binder.

**Files:**

- Modify: `electron/browser/adblock.ts`
- Create: `electron/browser/adblock.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// electron/browser/adblock.test.ts
import { describe, it, expect } from 'vitest'
import { createAdblock } from './adblock'

describe('adblock', () => {
  it('shouldBlock matches exact hostname (case-insensitive)', () => {
    const ab = createAdblock(new Set(['google-analytics.com']))
    expect(ab.shouldBlock('https://google-analytics.com/collect')).toBe(true)
    expect(ab.shouldBlock('https://GOOGLE-ANALYTICS.COM/x')).toBe(true)
    expect(ab.shouldBlock('https://example.com/')).toBe(false)
  })

  it('shouldBlock returns false for malformed URLs', () => {
    const ab = createAdblock(new Set(['x.com']))
    expect(ab.shouldBlock('not a url')).toBe(false)
    expect(ab.shouldBlock('')).toBe(false)
  })

  it('markBlocked + drainCount counts blocks and resets', () => {
    const ab = createAdblock(new Set(['x.com']))
    ab.markBlocked()
    ab.markBlocked()
    ab.markBlocked()
    expect(ab.drainCount()).toBe(3)
    expect(ab.drainCount()).toBe(0)
  })

  it('subdomains do NOT match a hostname-only entry (exact match)', () => {
    // Spec D5: hostname match. Subdomain coverage requires explicit entries
    // (Steven Black list includes them); we keep the matcher strict.
    const ab = createAdblock(new Set(['google-analytics.com']))
    expect(ab.shouldBlock('https://www.google-analytics.com/x')).toBe(false)
  })

  it('empty host set never blocks', () => {
    const ab = createAdblock(new Set())
    expect(ab.shouldBlock('https://anywhere.com/')).toBe(false)
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/browser/adblock.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `adblock.ts`**

Replace contents:

```ts
// electron/browser/adblock.ts
import type { Session } from 'electron'

export interface Adblock {
  shouldBlock(url: string): boolean
  markBlocked(): void
  drainCount(): number
}

export function createAdblock(hosts: Set<string>): Adblock {
  // Normalise hosts to lower-case for case-insensitive comparison
  const normalised = new Set<string>()
  for (const h of hosts) normalised.add(h.toLowerCase())

  let blockedCount = 0

  return {
    shouldBlock(url) {
      let host: string
      try {
        host = new URL(url).hostname.toLowerCase()
      } catch {
        return false
      }
      return normalised.has(host)
    },
    markBlocked() {
      blockedCount++
    },
    drainCount() {
      const n = blockedCount
      blockedCount = 0
      return n
    }
  }
}

/**
 * Wires onBeforeRequest on the given session. Should be called once per
 * partitioned session; binds to the singleton ad-block matcher.
 */
export function bindAdblockToSession(s: Session, adblock: Adblock): void {
  s.webRequest.onBeforeRequest((details, callback) => {
    if (adblock.shouldBlock(details.url)) {
      adblock.markBlocked()
      callback({ cancel: true })
      return
    }
    callback({ cancel: false })
  })
}

// --- singleton wiring (host set populated by Plan 2 task 3.2) ---
let singleton: Adblock | null = null
export function setAdblock(ab: Adblock): void {
  singleton = ab
}
export function getAdblock(): Adblock {
  if (!singleton) singleton = createAdblock(new Set())
  return singleton
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/browser/adblock.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add electron/browser/adblock.ts electron/browser/adblock.test.ts
git commit -m "feat(phase-11): adblock matcher + session binder (host set wired in Plan 2)"
```

---

## Self-Review Checklist (run after Task 10)

- [ ] Every label `1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6` appears exactly once. Verify:
  ```bash
  grep -oE 'openspec-task: [0-9.]+' docs/superpowers/plans/2026-05-02-phase-11-browser-tabs-bookmarks-tasks-1.1-2.6.md | sort -u
  ```
  Expected output:
  ```
  openspec-task: 1.1
  openspec-task: 1.2
  openspec-task: 1.3
  openspec-task: 1.4
  openspec-task: 2.1
  openspec-task: 2.2
  openspec-task: 2.3
  openspec-task: 2.4
  openspec-task: 2.5
  openspec-task: 2.6
  ```
- [ ] All 10 tasks have a final commit step.
- [ ] No `TODO` / `TBD` / `fill in` / `appropriate error handling` placeholders.
- [ ] Run all unit tests added in this plan:
  ```bash
  npx vitest run electron/services/db/migrations/004_bookmarks.test.ts electron/browser
  ```
  Expected: 17+ tests green (3 migration + 5 manager + 4 bounds + 5 adblock).
- [ ] Spec coverage:
  - `bookmarks-store §"bookmarks Schema"` → Task 1
  - `browser-shell §"WebContentsView 生命周期"` → Tasks 5–6
  - `browser-shell §"主布局同步 bounds"` → Task 7
  - `browser-tabs §"Tab 状态同步"` → Task 8
  - `browser-navigation §"外链策略"` → Task 9
  - `browser-navigation §"广告 / 追踪域名拦截"` → Task 10
- [ ] Typecheck + lint clean:
  ```bash
  npm run typecheck && npm run lint
  ```
  Expected: both exit 0.
