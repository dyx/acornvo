# Phase 06 — Virtual Library View: Plan 2 (IPC error tail + Library store)

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-06-virtual-library-view`
> **Task range:** OpenSpec tasks `2.7`–`3.5` (6 tasks)
> **Plan order:** 2 of 5. Depends on Plan 1 (deps + IPC contract + 5/7 handlers). Plan 3 (UI components + page assembly) consumes the store built here.
> **Status:** Not started
> **Created:** 2026-04-27
> **Branch suggestion:** `feat/phase-06-virtual-library-view` (continue branch from Plan 1)

---

## Goal

Harden the IPC layer with consistent error mapping (any SQL exception becomes `E_INTERNAL`; an empty grove returns empty results, never an error), then ship the renderer-side Zustand store that drives the Library page: filter / order / pagination state, items + total cache, selection with detail-fetch caching, and live subscriptions to `index:fileChanged|Deleted|Renamed` and `project:changed`.

## Architecture

- **Empty-grove safety** — `list` / `getCategoryTree` / `getTagCloud` MUST return `{ items: [], total: 0 }` / `[]` / `[]` even when the database is missing rows; only **SQL exceptions** are wrapped to `E_INTERNAL`. (Spec `file-query-api`.) Phase 1's `list` already short-circuits on zero rows; the test in this plan covers the same path explicitly + the error wrap.
- **Single store, no event re-publishing** — the Library store is the single subscriber to `ipc.on('index:fileChanged'|'index:fileDeleted'|'index:fileRenamed'|'project:changed')`. The page-level `useEffect` in Plan 3 just kicks off `load()` once; the store handles all reactive refresh.
- **`detailsByPath` Map cache** — `select(path)` first hits the cache; cache misses call `files.get(path)` and write back. On `fileChanged`, the affected entry is invalidated; on `fileDeleted`/`fileRenamed` (when the deleted/renamed path equals `selectedPath`), the cache entry is cleared and `selectedPath` reset.
- **`refresh()` is the single re-load entry point** — instead of re-running individual queries on each watcher event, `refresh()` re-issues `load()` + `loadCategoryTree()` + `loadTagCloud()`. Per design D4 ("simple but coarse; fine for ≤ 10K files; future optimisation: incremental list patches"). The store also exposes a private `_loadAll()` so the page mount and `project:changed` reload share one path.
- **Subscriber installation is idempotent** — `installLibrarySubscriber()` returns an unsubscribe function and uses a module-level `installed` flag, mirroring `installGroveSubscriber()` in `src/stores/grove.ts`.

## Tech Stack

- `zustand@^5` — already a project dep
- `vitest@^2` — store unit tests with mocked `ipc` client

## Files Touched (this plan)

| Path | Action | Owner task |
|---|---|---|
| `electron/ipc/files.ts` | Modify (wrap SQL errors + empty-grove paths) | 2.7 |
| `electron/ipc/files.test.ts` | Modify (add error/empty cases) | 2.7 |
| `src/stores/library.ts` | Replace stub with full slice + actions | 3.1, 3.2, 3.3, 3.4, 3.5 |
| `src/stores/library.test.ts` | Create | 3.1, 3.2, 3.3, 3.4, 3.5 |
| `shared/ipc-contract.ts` | Modify (add `index:*` event channels) | 3.4 (if missing) |

> Note: `index:fileChanged|Deleted|Renamed` events should already exist after phase-05 lands. Step 3.4 includes a defensive check; if the channels are missing, add them before subscribing.

## Pre-flight

This plan assumes Plan 1 has landed:
- `shared/file-types.ts` exports the FileSummary/FileFilter/Pagination/CategoryNode/TagCloudItem types
- `electron/ipc/files.ts` has `list`, `get`, `getCategoryTree`, `getTagCloud`, `revealInFinder` working
- `src/stores/library.ts` exists as a stub
- The `IpcContract.files` namespace is wired into `electron/ipc/handlers.ts`

If `git log --oneline` does not show all ten commits from Plan 1, **stop and complete Plan 1 first**.

---

## Tasks

<!-- openspec-task: 2.7 -->
### Task 1: Empty-grove + SQL exception fallbacks

**Files:**
- Modify: `electron/ipc/files.ts`
- Modify: `electron/ipc/files.test.ts`

Already, `list` in Plan 1 returns `{ items: [], total: 0 }` for empty groves, and SQL exceptions get wrapped in `E_INTERNAL`. This task ensures the same guarantees for `getCategoryTree`, `getTagCloud`, and `get`, and adds tests for each.

- [ ] **Step 1: Write the failing tests**

Append to `electron/ipc/files.test.ts`:

```ts
describe('fileQueryHandlers — error / empty fallbacks', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:')
    buildSchema(db)
    setDb(db)
  })
  afterEach(() => {
    db.close()
    setDb(null)
  })

  it('list: empty grove returns total=0 (not E_*)', async () => {
    const r = await fileQueryHandlers.list(
      {},
      { limit: 50, offset: 0, orderBy: 'clipped_desc' }
    )
    expect(r).toEqual({ items: [], total: 0 })
  })

  it('getCategoryTree: empty grove returns []', async () => {
    expect(await fileQueryHandlers.getCategoryTree()).toEqual([])
  })

  it('getTagCloud: empty grove returns []', async () => {
    expect(await fileQueryHandlers.getTagCloud({ limit: 30 })).toEqual([])
  })

  it('list: SQL exception → E_INTERNAL', async () => {
    db.exec('DROP TABLE files')
    await expect(
      fileQueryHandlers.list({}, { limit: 50, offset: 0, orderBy: 'clipped_desc' })
    ).rejects.toMatchObject({ code: 'E_INTERNAL' })
  })

  it('getCategoryTree: SQL exception → E_INTERNAL', async () => {
    db.exec('DROP TABLE files')
    await expect(fileQueryHandlers.getCategoryTree()).rejects.toMatchObject({
      code: 'E_INTERNAL'
    })
  })

  it('getTagCloud: SQL exception → E_INTERNAL', async () => {
    db.exec('DROP TABLE tags')
    await expect(fileQueryHandlers.getTagCloud({ limit: 30 })).rejects.toMatchObject({
      code: 'E_INTERNAL'
    })
  })
})
```

Run:
```bash
npx vitest run electron/ipc/files.test.ts -t 'error / empty fallbacks'
```

Expected: The three "empty grove" cases PASS already (Plan 1 covered them implicitly), and the three "SQL exception" cases for `getCategoryTree` / `getTagCloud` FAIL because the bare `.all()` call lets the better-sqlite3 error escape unwrapped.

- [ ] **Step 2: Wrap SQL calls in `getCategoryTree`, `getTagCloud`, `get`**

In `electron/ipc/files.ts`:

For `getCategoryTree`, wrap the `.all()` call:

```ts
let rows: Array<{ category: string; count: number }>
try {
  rows = db
    .prepare(
      `SELECT category, COUNT(*) AS count
       FROM files
       WHERE category IS NOT NULL AND category <> ''
       GROUP BY category`
    )
    .all() as Array<{ category: string; count: number }>
} catch (err) {
  throw new IpcError('E_INTERNAL', `files.getCategoryTree: ${(err as Error).message}`)
}
```

For `getTagCloud`:

```ts
let rows: TagCloudItem[]
try {
  rows = db
    .prepare(
      `SELECT name, usage_count
       FROM tags
       WHERE usage_count > 0
       ORDER BY usage_count DESC, name ASC
       LIMIT ?`
    )
    .all(opts.limit) as TagCloudItem[]
} catch (err) {
  throw new IpcError('E_INTERNAL', `files.getTagCloud: ${(err as Error).message}`)
}
return rows
```

For `get`, the SQL prepare/get block also needs wrapping (the existing code only wraps the `IpcError('E_NOT_FOUND')` from `readParsed`):

```ts
let row: Omit<ListRow, 'total'> | undefined
try {
  row = db
    .prepare(
      `SELECT f.path, f.title, f.category, f.rating, f.clipped_at,
              json_extract(f.frontmatter_json, '$.site') AS site,
              CASE WHEN f.summary IS NOT NULL AND length(f.summary) > 0 THEN 1 ELSE 0 END AS has_summary,
              GROUP_CONCAT(REPLACE(ft.tag, char(1), '?'), char(1)) AS tags_concat
       FROM files f
       LEFT JOIN file_tags ft ON ft.path = f.path
       WHERE f.path = ?
       GROUP BY f.path`
    )
    .get(path) as Omit<ListRow, 'total'> | undefined
} catch (err) {
  throw new IpcError('E_INTERNAL', `files.get: ${(err as Error).message}`)
}

if (!row) {
  throw new IpcError('E_NOT_FOUND', `files.get: ${path} not in index`)
}
```

- [ ] **Step 3: Run the tests**

Run:
```bash
npx vitest run electron/ipc/files.test.ts
```

Expected: ALL cases PASS.

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/files.ts electron/ipc/files.test.ts
git commit -m "feat(phase-06): wrap SQL exceptions to E_INTERNAL in getCategoryTree/getTagCloud/get"
```

---

<!-- openspec-task: 3.1 -->
### Task 2: Library store — slice shape and initial state

**Files:**
- Modify: `src/stores/library.ts`
- Test: `src/stores/library.test.ts`

This task defines the state shape: `filter`, `orderBy`, `pagination`, `items`, `total`, `selectedPath`, `categoryTree`, `tagCloud`, `isLoading`, `detailsByPath`. Actions land in subsequent tasks but their type signatures are declared here so consumers can see the full surface immediately.

- [ ] **Step 1: Write the failing test**

Create `src/stores/library.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/ipc/client', () => ({
  ipc: {
    files: {
      list: vi.fn(),
      get: vi.fn(),
      getCategoryTree: vi.fn(),
      getTagCloud: vi.fn(),
      revealInFinder: vi.fn()
    },
    on: vi.fn(() => () => {})
  }
}))
import { ipc } from '@/ipc/client'
import { useLibraryStore } from './library'

describe('library store — initial shape', () => {
  beforeEach(() => {
    useLibraryStore.setState(useLibraryStore.getInitialState(), true)
    vi.clearAllMocks()
  })

  it('exposes the documented slice fields with sane defaults', () => {
    const s = useLibraryStore.getState()
    expect(s.filter).toEqual({})
    expect(s.orderBy).toBe('clipped_desc')
    expect(s.pagination).toEqual({ limit: 50, offset: 0, orderBy: 'clipped_desc' })
    expect(s.items).toEqual([])
    expect(s.total).toBe(0)
    expect(s.selectedPath).toBeNull()
    expect(s.categoryTree).toEqual([])
    expect(s.tagCloud).toEqual([])
    expect(s.isLoading).toBe(false)
    expect(s.detailsByPath).toBeInstanceOf(Map)
    expect(s.detailsByPath.size).toBe(0)
  })

  it('exposes the documented action functions', () => {
    const s = useLibraryStore.getState()
    expect(typeof s.setFilter).toBe('function')
    expect(typeof s.setOrder).toBe('function')
    expect(typeof s.load).toBe('function')
    expect(typeof s.loadMore).toBe('function')
    expect(typeof s.loadCategoryTree).toBe('function')
    expect(typeof s.loadTagCloud).toBe('function')
    expect(typeof s.select).toBe('function')
    expect(typeof s.refresh).toBe('function')
  })
})
```

Note: `useLibraryStore.getInitialState()` was added in zustand v5 — confirm by running `node -e "const z=require('zustand');console.log(z.create.toString().slice(0,40))"` if unsure. If unavailable, replace with a manual reset in `beforeEach`.

Run:
```bash
npx vitest run src/stores/library.test.ts
```

Expected: FAIL — store stub from Plan 1 only exposes `_phase`.

- [ ] **Step 2: Replace the stub with the full slice**

Replace `src/stores/library.ts`:

```ts
import { create } from 'zustand'
import type {
  CategoryNode,
  FileFilter,
  FileSummary,
  Frontmatter,
  OrderBy,
  Pagination,
  TagCloudItem
} from '@shared/ipc-contract'

export interface FullDetail {
  summary: FileSummary
  frontmatter: Frontmatter
  body: string
}

export interface LibraryState {
  // --- query state ---
  filter: FileFilter
  orderBy: OrderBy
  pagination: Pagination

  // --- list view ---
  items: FileSummary[]
  total: number
  isLoading: boolean

  // --- detail / preview ---
  selectedPath: string | null
  detailsByPath: Map<string, FullDetail>

  // --- sidebar ---
  categoryTree: CategoryNode[]
  tagCloud: TagCloudItem[]

  // --- actions (implemented in subsequent tasks) ---
  setFilter: (partial: Partial<FileFilter>) => Promise<void>
  setOrder: (orderBy: OrderBy) => Promise<void>
  load: () => Promise<void>
  loadMore: () => Promise<void>
  loadCategoryTree: () => Promise<void>
  loadTagCloud: () => Promise<void>
  select: (path: string | null) => Promise<void>
  refresh: () => Promise<void>
}

const DEFAULT_PAGINATION: Pagination = {
  limit: 50,
  offset: 0,
  orderBy: 'clipped_desc'
}

const initialState = {
  filter: {} as FileFilter,
  orderBy: 'clipped_desc' as OrderBy,
  pagination: DEFAULT_PAGINATION,
  items: [] as FileSummary[],
  total: 0,
  isLoading: false,
  selectedPath: null as string | null,
  detailsByPath: new Map<string, FullDetail>(),
  categoryTree: [] as CategoryNode[],
  tagCloud: [] as TagCloudItem[]
}

export const useLibraryStore = create<LibraryState>(() => ({
  ...initialState,
  // Stubs — real implementations land in tasks 3.2–3.5.
  setFilter: async () => {},
  setOrder: async () => {},
  load: async () => {},
  loadMore: async () => {},
  loadCategoryTree: async () => {},
  loadTagCloud: async () => {},
  select: async () => {},
  refresh: async () => {}
}))

// Re-export the FullDetail shape used by FilePreviewPanel in Plan 3.
export type { FullDetail as LibraryFullDetail }
```

- [ ] **Step 3: Run the test**

Run:
```bash
npx vitest run src/stores/library.test.ts
```

Expected: 2 PASS.

- [ ] **Step 4: Verify type-check**

Run:
```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/library.ts src/stores/library.test.ts
git commit -m "feat(phase-06): library store slice shape with action stubs"
```

---

<!-- openspec-task: 3.2 -->
### Task 3: Library store — `setFilter` / `setOrder` / `load` / `loadMore` / `loadCategoryTree` / `loadTagCloud`

**Files:**
- Modify: `src/stores/library.ts`
- Modify: `src/stores/library.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/stores/library.test.ts`:

```ts
import type { FileSummary } from '@shared/ipc-contract'

function makeSummary(path: string, extra: Partial<FileSummary> = {}): FileSummary {
  return {
    path,
    title: path,
    category: null,
    rating: null,
    clipped_at: null,
    site: null,
    has_summary: false,
    tags: [],
    is_reviewing: false,
    ...extra
  }
}

describe('library store — load / loadMore / order / filter', () => {
  beforeEach(() => {
    useLibraryStore.setState(useLibraryStore.getInitialState(), true)
    vi.clearAllMocks()
  })

  it('load() sets items + total and toggles isLoading', async () => {
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [makeSummary('a.md'), makeSummary('b.md')],
      total: 2
    })
    const promise = useLibraryStore.getState().load()
    expect(useLibraryStore.getState().isLoading).toBe(true)
    await promise
    const s = useLibraryStore.getState()
    expect(s.isLoading).toBe(false)
    expect(s.items.map((i) => i.path)).toEqual(['a.md', 'b.md'])
    expect(s.total).toBe(2)
    expect(ipc.files.list).toHaveBeenCalledWith(
      {},
      { limit: 50, offset: 0, orderBy: 'clipped_desc' }
    )
  })

  it('loadMore() appends with bumped offset', async () => {
    ;(ipc.files.list as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ items: [makeSummary('a.md'), makeSummary('b.md')], total: 4 })
      .mockResolvedValueOnce({ items: [makeSummary('c.md'), makeSummary('d.md')], total: 4 })
    await useLibraryStore.getState().load()
    await useLibraryStore.getState().loadMore()
    const s = useLibraryStore.getState()
    expect(s.items.map((i) => i.path)).toEqual(['a.md', 'b.md', 'c.md', 'd.md'])
    expect(s.pagination.offset).toBe(2)
    expect(ipc.files.list).toHaveBeenLastCalledWith(
      {},
      { limit: 50, offset: 2, orderBy: 'clipped_desc' }
    )
  })

  it('setFilter() merges, resets offset, and re-loads', async () => {
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [makeSummary('inbox/a.md')],
      total: 1
    })
    await useLibraryStore.getState().setFilter({ pathPrefix: 'inbox/' })
    const s = useLibraryStore.getState()
    expect(s.filter).toEqual({ pathPrefix: 'inbox/' })
    expect(s.pagination.offset).toBe(0)
    expect(s.items.map((i) => i.path)).toEqual(['inbox/a.md'])
  })

  it('setFilter() can clear a key by passing undefined', async () => {
    useLibraryStore.setState({ filter: { tag: 'attention' } })
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 })
    await useLibraryStore.getState().setFilter({ tag: undefined })
    expect(useLibraryStore.getState().filter.tag).toBeUndefined()
  })

  it('setOrder() updates pagination.orderBy and reloads', async () => {
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 })
    await useLibraryStore.getState().setOrder('title_asc')
    const s = useLibraryStore.getState()
    expect(s.orderBy).toBe('title_asc')
    expect(s.pagination.orderBy).toBe('title_asc')
    expect(s.pagination.offset).toBe(0)
  })

  it('loadCategoryTree() writes categoryTree', async () => {
    ;(ipc.files.getCategoryTree as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: '技术', count: 3, children: [] }
    ])
    await useLibraryStore.getState().loadCategoryTree()
    expect(useLibraryStore.getState().categoryTree).toEqual([
      { name: '技术', count: 3, children: [] }
    ])
  })

  it('loadTagCloud() writes tagCloud with default limit 30', async () => {
    ;(ipc.files.getTagCloud as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: 'a', usage_count: 5 }
    ])
    await useLibraryStore.getState().loadTagCloud()
    expect(useLibraryStore.getState().tagCloud).toEqual([{ name: 'a', usage_count: 5 }])
    expect(ipc.files.getTagCloud).toHaveBeenCalledWith({ limit: 30 })
  })

  it('load() flips isLoading back to false on rejection', async () => {
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'))
    await expect(useLibraryStore.getState().load()).rejects.toThrow('boom')
    expect(useLibraryStore.getState().isLoading).toBe(false)
  })
})
```

Run:
```bash
npx vitest run src/stores/library.test.ts
```

Expected: 8 new cases FAIL (stubs return immediately).

- [ ] **Step 2: Implement the actions**

In `src/stores/library.ts`, replace the stub action assignments with the real ones. The simplest pattern is to use `create<...>((set, get) => ({ ... }))` — replace the existing `create` call:

```ts
import { ipc } from '@/ipc/client'

export const useLibraryStore = create<LibraryState>((set, get) => ({
  ...initialState,

  async setFilter(partial) {
    const merged: FileFilter = { ...get().filter, ...partial }
    // Strip undefined keys so the SQL handler treats them as "absent".
    const filter: FileFilter = {}
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined) (filter as Record<string, unknown>)[k] = v
    }
    set({
      filter,
      pagination: { ...get().pagination, offset: 0 }
    })
    await get().load()
  },

  async setOrder(orderBy) {
    set({
      orderBy,
      pagination: { ...get().pagination, orderBy, offset: 0 }
    })
    await get().load()
  },

  async load() {
    set({ isLoading: true })
    try {
      const { filter, pagination } = get()
      const r = await ipc.files.list(filter, pagination)
      set({ items: r.items, total: r.total, isLoading: false })
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },

  async loadMore() {
    const { pagination, items } = get()
    const next: Pagination = {
      ...pagination,
      offset: pagination.offset + pagination.limit
    }
    set({ pagination: next, isLoading: true })
    try {
      const r = await ipc.files.list(get().filter, next)
      set({ items: [...items, ...r.items], total: r.total, isLoading: false })
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },

  async loadCategoryTree() {
    const tree = await ipc.files.getCategoryTree()
    set({ categoryTree: tree })
  },

  async loadTagCloud() {
    const cloud = await ipc.files.getTagCloud({ limit: 30 })
    set({ tagCloud: cloud })
  },

  // Stubs replaced in tasks 3.3–3.5
  select: async () => {},
  refresh: async () => {}
}))
```

The `pagination.offset` increment in `loadMore` uses `pagination.limit` rather than the count of newly fetched items — this matches the `offset = offset + limit` formula in spec `file-query-api`'s "分页" scenario. The test asserts `offset === 2` after fetching two batches of 2; ensure the `limit` was set to 2 there. The default is 50 and the tests use 50, so the fixture above is consistent. Wait — re-read: the test mocks `mockResolvedValueOnce({ items: 2 rows, total: 4 })` twice. With limit=50, `offset` would jump to 50 after `loadMore`. The test expects 2.

Adjust the test fixture *or* adjust the production code. The OpenSpec spec example uses `offset=0, limit=50` then `offset=50, limit=50`, so the production formula `offset += limit` is correct. **Update the test** to reflect this:

In the test `loadMore() appends with bumped offset`, before calling `load()`, set the limit:

```ts
useLibraryStore.setState({
  pagination: { limit: 2, offset: 0, orderBy: 'clipped_desc' }
})
```

Then the assertion `expect(s.pagination.offset).toBe(2)` matches `0 + 2`. The expectation `expect(ipc.files.list).toHaveBeenLastCalledWith({}, { limit: 2, offset: 2, orderBy: 'clipped_desc' })` also follows.

- [ ] **Step 3: Run the tests**

Run:
```bash
npx vitest run src/stores/library.test.ts
```

Expected: All cases PASS (after the test fixture update above).

- [ ] **Step 4: Commit**

```bash
git add src/stores/library.ts src/stores/library.test.ts
git commit -m "feat(phase-06): library store actions setFilter/setOrder/load/loadMore/loadCategoryTree/loadTagCloud"
```

---

<!-- openspec-task: 3.3 -->
### Task 4: Library store — `select` with `detailsByPath` cache

**Files:**
- Modify: `src/stores/library.ts`
- Modify: `src/stores/library.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/stores/library.test.ts`:

```ts
describe('library store — select / detailsByPath', () => {
  beforeEach(() => {
    useLibraryStore.setState(useLibraryStore.getInitialState(), true)
    vi.clearAllMocks()
  })

  it('select(path) calls files.get and caches the FullDetail', async () => {
    ;(ipc.files.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      summary: makeSummary('a.md', { rating: 4 }),
      frontmatter: { title: 'A' },
      body: 'hello'
    })
    await useLibraryStore.getState().select('a.md')
    const s = useLibraryStore.getState()
    expect(s.selectedPath).toBe('a.md')
    expect(s.detailsByPath.get('a.md')?.body).toBe('hello')
    expect(s.detailsByPath.get('a.md')?.summary.rating).toBe(4)
  })

  it('select(path) hits cache on second call (no extra IPC)', async () => {
    ;(ipc.files.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      summary: makeSummary('a.md'),
      frontmatter: {},
      body: 'x'
    })
    await useLibraryStore.getState().select('a.md')
    await useLibraryStore.getState().select('a.md')
    expect(ipc.files.get).toHaveBeenCalledTimes(1)
  })

  it('select(null) clears selectedPath without touching the cache', async () => {
    useLibraryStore.setState({
      selectedPath: 'a.md',
      detailsByPath: new Map([
        ['a.md', { summary: makeSummary('a.md'), frontmatter: {}, body: 'x' }]
      ])
    })
    await useLibraryStore.getState().select(null)
    const s = useLibraryStore.getState()
    expect(s.selectedPath).toBeNull()
    expect(s.detailsByPath.has('a.md')).toBe(true)
  })
})
```

Run:
```bash
npx vitest run src/stores/library.test.ts -t 'select / detailsByPath'
```

Expected: 3 FAIL (`select` is still a stub).

- [ ] **Step 2: Implement `select`**

In `src/stores/library.ts`, replace the `select` stub:

```ts
  async select(path) {
    if (path === null) {
      set({ selectedPath: null })
      return
    }
    const cache = get().detailsByPath
    if (cache.has(path)) {
      set({ selectedPath: path })
      return
    }
    const detail = await ipc.files.get(path)
    const next = new Map(cache)
    next.set(path, detail)
    set({ selectedPath: path, detailsByPath: next })
  }
```

- [ ] **Step 3: Run the tests**

Run:
```bash
npx vitest run src/stores/library.test.ts -t 'select / detailsByPath'
```

Expected: 3 PASS.

- [ ] **Step 4: Commit**

```bash
git add src/stores/library.ts src/stores/library.test.ts
git commit -m "feat(phase-06): library store select(path) with detailsByPath cache"
```

---

<!-- openspec-task: 3.4 -->
### Task 5: Library store — index event subscriptions + `refresh`

**Files:**
- Modify: `shared/ipc-contract.ts` (only if `index:*` channels are missing post-phase-05)
- Modify: `src/stores/library.ts`
- Modify: `src/stores/library.test.ts`

- [ ] **Step 1: Verify `index:*` event channels exist**

Run:
```bash
grep -n "index:fileChanged\|index:fileDeleted\|index:fileRenamed" shared/ipc-contract.ts
```

If missing, add to `IpcEventContract` (and re-confirm with phase-05's contract):

```ts
'index:fileChanged': { path: string; contentHash: string; mtime: number; frontmatter: Frontmatter }
'index:fileDeleted': { path: string }
'index:fileRenamed': { oldPath: string; newPath: string }
```

If they're already present, skip ahead.

- [ ] **Step 2: Write failing tests**

Append to `src/stores/library.test.ts`:

```ts
import type { IpcEventChannel, IpcEventContract } from '@shared/ipc-contract'

describe('library store — refresh + index event subscriptions', () => {
  let handlers: Partial<{
    [K in IpcEventChannel]: (payload: IpcEventContract[K]) => void
  }>

  beforeEach(() => {
    useLibraryStore.setState(useLibraryStore.getInitialState(), true)
    vi.clearAllMocks()
    handlers = {}
    ;(ipc.on as ReturnType<typeof vi.fn>).mockImplementation(
      <K extends IpcEventChannel>(
        ch: K,
        h: (p: IpcEventContract[K]) => void
      ) => {
        handlers[ch] = h
        return () => {
          delete handlers[ch]
        }
      }
    )
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [],
      total: 0
    })
    ;(ipc.files.getCategoryTree as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(ipc.files.getTagCloud as ReturnType<typeof vi.fn>).mockResolvedValue([])
  })

  it('refresh() re-runs list + categoryTree + tagCloud', async () => {
    await useLibraryStore.getState().refresh()
    expect(ipc.files.list).toHaveBeenCalledTimes(1)
    expect(ipc.files.getCategoryTree).toHaveBeenCalledTimes(1)
    expect(ipc.files.getTagCloud).toHaveBeenCalledTimes(1)
  })

  it('installLibrarySubscriber() subscribes to index events', async () => {
    const { installLibrarySubscriber } = await import('./library')
    const unsub = installLibrarySubscriber()
    expect(ipc.on).toHaveBeenCalledWith('index:fileChanged', expect.any(Function))
    expect(ipc.on).toHaveBeenCalledWith('index:fileDeleted', expect.any(Function))
    expect(ipc.on).toHaveBeenCalledWith('index:fileRenamed', expect.any(Function))
    unsub()
  })

  it('index:fileChanged → refresh()', async () => {
    const { installLibrarySubscriber } = await import('./library')
    installLibrarySubscriber()
    handlers['index:fileChanged']?.({
      path: 'a.md',
      contentHash: 'x',
      mtime: 1,
      frontmatter: {}
    })
    // refresh() is async; flush microtasks
    await Promise.resolve()
    await Promise.resolve()
    expect(ipc.files.list).toHaveBeenCalled()
  })

  it('index:fileDeleted → refresh + clears selectedPath if it matches', async () => {
    useLibraryStore.setState({ selectedPath: 'a.md' })
    const { installLibrarySubscriber } = await import('./library')
    installLibrarySubscriber()
    handlers['index:fileDeleted']?.({ path: 'a.md' })
    await Promise.resolve()
    await Promise.resolve()
    expect(useLibraryStore.getState().selectedPath).toBeNull()
  })

  it('index:fileDeleted does not clear selectedPath when paths differ', async () => {
    useLibraryStore.setState({ selectedPath: 'b.md' })
    const { installLibrarySubscriber } = await import('./library')
    installLibrarySubscriber()
    handlers['index:fileDeleted']?.({ path: 'a.md' })
    await Promise.resolve()
    expect(useLibraryStore.getState().selectedPath).toBe('b.md')
  })

  it('index:fileRenamed updates selectedPath when oldPath matches', async () => {
    useLibraryStore.setState({ selectedPath: 'a.md' })
    const { installLibrarySubscriber } = await import('./library')
    installLibrarySubscriber()
    handlers['index:fileRenamed']?.({ oldPath: 'a.md', newPath: 'a-renamed.md' })
    await Promise.resolve()
    await Promise.resolve()
    expect(useLibraryStore.getState().selectedPath).toBe('a-renamed.md')
  })

  it('installLibrarySubscriber is idempotent', async () => {
    const { installLibrarySubscriber } = await import('./library')
    installLibrarySubscriber()
    const callsAfterFirst = (ipc.on as ReturnType<typeof vi.fn>).mock.calls.length
    installLibrarySubscriber()
    expect((ipc.on as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterFirst)
  })
})
```

Run:
```bash
npx vitest run src/stores/library.test.ts -t 'refresh \\+ index'
```

Expected: 7 FAIL.

- [ ] **Step 3: Implement `refresh` + `installLibrarySubscriber`**

In `src/stores/library.ts`, replace the `refresh` stub with:

```ts
  async refresh() {
    await Promise.all([
      get().load(),
      get().loadCategoryTree(),
      get().loadTagCloud()
    ])
  }
```

At the end of the file (outside the `create` call), add the subscription installer:

```ts
let subscriberInstalled = false

export function installLibrarySubscriber(): () => void {
  if (subscriberInstalled) return () => {}
  subscriberInstalled = true

  const offChanged = ipc.on('index:fileChanged', () => {
    void useLibraryStore.getState().refresh()
  })
  const offDeleted = ipc.on('index:fileDeleted', (payload) => {
    if (useLibraryStore.getState().selectedPath === payload.path) {
      useLibraryStore.setState({ selectedPath: null })
    }
    // Also evict from cache
    const cache = useLibraryStore.getState().detailsByPath
    if (cache.has(payload.path)) {
      const next = new Map(cache)
      next.delete(payload.path)
      useLibraryStore.setState({ detailsByPath: next })
    }
    void useLibraryStore.getState().refresh()
  })
  const offRenamed = ipc.on('index:fileRenamed', (payload) => {
    if (useLibraryStore.getState().selectedPath === payload.oldPath) {
      useLibraryStore.setState({ selectedPath: payload.newPath })
    }
    // Move cache entry
    const cache = useLibraryStore.getState().detailsByPath
    if (cache.has(payload.oldPath)) {
      const next = new Map(cache)
      const detail = next.get(payload.oldPath)
      next.delete(payload.oldPath)
      if (detail) next.set(payload.newPath, detail)
      useLibraryStore.setState({ detailsByPath: next })
    }
    void useLibraryStore.getState().refresh()
  })

  return () => {
    subscriberInstalled = false
    offChanged()
    offDeleted()
    offRenamed()
  }
}
```

- [ ] **Step 4: Run the tests**

Run:
```bash
npx vitest run src/stores/library.test.ts -t 'refresh \\+ index'
```

Expected: 7 PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/ipc-contract.ts src/stores/library.ts src/stores/library.test.ts
git commit -m "feat(phase-06): library store refresh + index event subscriptions (idempotent installer)"
```

---

<!-- openspec-task: 3.5 -->
### Task 6: Library store — `project:changed` reset

**Files:**
- Modify: `src/stores/library.ts`
- Modify: `src/stores/library.test.ts`

When the user switches groves, all library state must clear and reload. The subscriber from task 3.4 also handles this channel.

- [ ] **Step 1: Write failing tests**

Append to `src/stores/library.test.ts`:

```ts
describe('library store — project:changed reset', () => {
  let handlers: Partial<{
    [K in IpcEventChannel]: (payload: IpcEventContract[K]) => void
  }>

  beforeEach(() => {
    useLibraryStore.setState(useLibraryStore.getInitialState(), true)
    vi.clearAllMocks()
    handlers = {}
    ;(ipc.on as ReturnType<typeof vi.fn>).mockImplementation(
      <K extends IpcEventChannel>(
        ch: K,
        h: (p: IpcEventContract[K]) => void
      ) => {
        handlers[ch] = h
        return () => {}
      }
    )
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [],
      total: 0
    })
    ;(ipc.files.getCategoryTree as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(ipc.files.getTagCloud as ReturnType<typeof vi.fn>).mockResolvedValue([])
  })

  it('subscribes to project:changed', async () => {
    const { installLibrarySubscriber } = await import('./library')
    installLibrarySubscriber()
    expect(ipc.on).toHaveBeenCalledWith('project:changed', expect.any(Function))
  })

  it('project:changed clears items / detailsByPath / selectedPath / categoryTree / tagCloud', async () => {
    useLibraryStore.setState({
      items: [makeSummary('a.md')],
      total: 1,
      selectedPath: 'a.md',
      detailsByPath: new Map([
        ['a.md', { summary: makeSummary('a.md'), frontmatter: {}, body: '' }]
      ]),
      categoryTree: [{ name: 'x', count: 1, children: [] }],
      tagCloud: [{ name: 't', usage_count: 1 }],
      filter: { tag: 'x' },
      pagination: { limit: 50, offset: 100, orderBy: 'title_asc' }
    })

    const { installLibrarySubscriber } = await import('./library')
    installLibrarySubscriber()
    handlers['project:changed']?.(null)
    // Wait for the async refresh chain
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    const s = useLibraryStore.getState()
    expect(s.items).toEqual([])
    expect(s.total).toBe(0)
    expect(s.selectedPath).toBeNull()
    expect(s.detailsByPath.size).toBe(0)
    expect(s.categoryTree).toEqual([])
    expect(s.tagCloud).toEqual([])
    // filter and pagination reset to defaults
    expect(s.filter).toEqual({})
    expect(s.pagination.offset).toBe(0)
  })

  it('project:changed triggers reload of list / categoryTree / tagCloud', async () => {
    const { installLibrarySubscriber } = await import('./library')
    installLibrarySubscriber()
    handlers['project:changed']?.(null)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(ipc.files.list).toHaveBeenCalled()
    expect(ipc.files.getCategoryTree).toHaveBeenCalled()
    expect(ipc.files.getTagCloud).toHaveBeenCalled()
  })
})
```

Run:
```bash
npx vitest run src/stores/library.test.ts -t 'project:changed reset'
```

Expected: 3 FAIL (no `project:changed` subscription yet).

- [ ] **Step 2: Add `project:changed` handler in the subscriber**

In `src/stores/library.ts`, in `installLibrarySubscriber`, add another subscription before the `return`:

```ts
  const offProject = ipc.on('project:changed', () => {
    // Reset state to initial defaults, then reload everything.
    useLibraryStore.setState({
      filter: {},
      orderBy: 'clipped_desc',
      pagination: DEFAULT_PAGINATION,
      items: [],
      total: 0,
      selectedPath: null,
      detailsByPath: new Map(),
      categoryTree: [],
      tagCloud: [],
      isLoading: false
    })
    void useLibraryStore.getState().refresh()
  })
```

Update the `return`:

```ts
  return () => {
    subscriberInstalled = false
    offChanged()
    offDeleted()
    offRenamed()
    offProject()
  }
```

- [ ] **Step 3: Run the tests**

Run:
```bash
npx vitest run src/stores/library.test.ts
```

Expected: All cases PASS.

- [ ] **Step 4: Run the full unit suite**

Run:
```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/library.ts src/stores/library.test.ts
git commit -m "feat(phase-06): library store resets on project:changed and reloads"
```

---

## Plan-2 Acceptance

After all 6 tasks complete:
- [ ] `npm run typecheck` PASSES
- [ ] `npm test` PASSES
- [ ] `npm run lint` PASSES
- [ ] `electron/ipc/files.ts` correctly maps every SQL exception to `E_INTERNAL` and returns empty results for empty groves (verified by tests)
- [ ] `src/stores/library.ts` exposes the full slice + `setFilter` / `setOrder` / `load` / `loadMore` / `loadCategoryTree` / `loadTagCloud` / `select` / `refresh` actions
- [ ] `installLibrarySubscriber()` is idempotent and subscribes to `index:fileChanged` / `index:fileDeleted` / `index:fileRenamed` / `project:changed`
- [ ] `git log --oneline` shows six commits, each scoped to one OpenSpec task
