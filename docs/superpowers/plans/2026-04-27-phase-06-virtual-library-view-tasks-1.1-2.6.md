# Phase 06 — Virtual Library View: Plan 1 (Deps + IPC contract + core handlers)

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-06-virtual-library-view`
> **Task range:** OpenSpec tasks `1.1`–`2.6` (10 tasks)
> **Plan order:** 1 of 5. Subsequent plans (`tasks-2.7-3.5`, `4.1-5.5`, `6.1-7.7`, `7.8-7.14`) build on this one.
> **Status:** Not started
> **Created:** 2026-04-27
> **Branch suggestion:** `feat/phase-06-virtual-library-view` (branch from `main` after phase-05 lands)

---

## Goal

Lay the foundation for the Library view: install `@tanstack/react-virtual`, add the missing shadcn/ui primitives, scaffold the new module directories, define the renderer/main-shared `FileSummary` / `FileFilter` / `CategoryNode` / `TagCloudItem` types, extend `IpcContract` with a `files` namespace, and ship five of the seven `electron/ipc/files.ts` handlers (`list`, `get`, `getCategoryTree`, `getTagCloud`, `revealInFinder`) — each driven by a vitest unit test against an in-memory SQLite that uses the real phase-03 schema.

## Architecture

- **`shared/file-types.ts` is the single DTO source.** `FileSummary` is shared verbatim by `files.list` (Plan 1), `files.get` (Plan 1), and the future `quickSwitcher` (phase 8) and `mention` (phase 17) IPCs. Field shape is locked by spec `file-summary-dto`.
- **One SQL query per `list` call.** Per design D2, `files.list` runs a single `LEFT JOIN file_tags + GROUP BY path + COUNT(*) OVER()` query so a 50ms round-trip serves a 10K-row grove. Tags are concatenated with the unprintable `` separator and split renderer-side.
- **Sole DB-write authority remains the indexer.** `files.ts` only reads `files` / `tags` / `file_tags`. It calls `dbService.requireCurrent()` for a handle but never mutates rows (writers stay in phase-05's `index-queries.ts`).
- **`safeResolve` everywhere.** `revealInFinder` resolves the rel path against the current grove root before handing the abs path to `shell.showItemInFolder` — no path can escape the tree.
- **`is_reviewing` is a hard-coded `false`.** Per spec `file-summary-dto`, this field is reserved for phase 14 (queue table JOIN). The handler emits `false` for every row in this phase. Renderer tests assert this.

## Tech Stack

- `@tanstack/react-virtual@^3.10` (renderer; no runtime use in this plan but installed alongside scaffolding)
- `better-sqlite3@^12` (already a dep) — main-process SQL
- `electron@^39.2` — `shell.showItemInFolder`
- `vitest@^2.1` — unit tests for handlers
- shadcn/ui CLI — `npx shadcn@latest add ...`

## Files Touched (this plan)

| Path                                                            | Action                                 | Owner task   |
| --------------------------------------------------------------- | -------------------------------------- | ------------ |
| `package.json`, `package-lock.json`                             | Modify (add `@tanstack/react-virtual`) | 1.1          |
| `src/components/ui/{tooltip,scroll-area,popover,separator}.tsx` | Create (via shadcn)                    | 1.2          |
| `src/pages/Library.tsx`                                         | Create stub                            | 1.3          |
| `src/components/library/.gitkeep`                               | Create                                 | 1.3          |
| `src/stores/library.ts`                                         | Create stub                            | 1.3          |
| `electron/ipc/files.ts`                                         | Create stub → implement 5/7 handlers   | 1.3, 2.1–2.6 |
| `shared/file-types.ts`                                          | Create                                 | 1.4          |
| `shared/file-types.test.ts`                                     | Create                                 | 1.4          |
| `shared/ipc-contract.ts`                                        | Modify (add `files` namespace)         | 2.1          |
| `electron/ipc/handlers.ts`                                      | Modify (register `fileQueryHandlers`)  | 2.1          |
| `electron/ipc/files.test.ts`                                    | Create                                 | 2.2–2.6      |

## Pre-flight

This plan assumes phase-05 has landed on `main` with:

- The `files` / `tags` / `file_tags` schema from `electron/services/db/migrations/001_init.sql` populated by the indexer.
- `electron/services/indexer.ts` running on grove open and emitting `index:fileChanged` etc. (subscriptions land in Plan 2.)

If phase-05 has not landed, **stop**: the unit tests in tasks 2.2–2.5 hand-roll a SQLite schema that matches `001_init.sql`; if that file has changed in phase-05's branch, reconcile column names before writing tests.

---

## Tasks

<!-- openspec-task: 1.1 -->

### Task 1: Install @tanstack/react-virtual

**Files:**

- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Confirm not already installed**

Run:

```bash
node -e "const p=require('./package.json');console.log(p.dependencies['@tanstack/react-virtual']||p.devDependencies?.['@tanstack/react-virtual']||'absent')"
```

Expected: `absent`. If a version prints, skip Step 2.

- [ ] **Step 2: Install**

Run:

```bash
npm install @tanstack/react-virtual@^3.10
```

Expected: `package.json` `dependencies` now lists `@tanstack/react-virtual`.

- [ ] **Step 3: Verify type-check still passes**

Run:

```bash
npm run typecheck
```

Expected: PASS (no new errors). If `electron-rebuild` runs in `postinstall` and warns about better-sqlite3, that's fine.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(phase-06): add @tanstack/react-virtual dependency"
```

---

<!-- openspec-task: 1.2 -->

### Task 2: Add missing shadcn/ui primitives

**Files:**

- Create (via shadcn CLI): `src/components/ui/tooltip.tsx`, `src/components/ui/scroll-area.tsx`, `src/components/ui/popover.tsx`, `src/components/ui/separator.tsx`

- [ ] **Step 1: Inventory existing shadcn primitives**

Run:

```bash
ls src/components/ui
```

Expected output includes `button.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `input.tsx`, `toast.tsx`, `toaster.tsx`. The targets to add are: `tooltip`, `scroll-area`, `popover`, `separator`. (`button`, `input`, `dropdown-menu` already exist — task 1.2's spec says "若 phase 1 未全引入" so we only add the missing ones.)

- [ ] **Step 2: Add the four missing components**

Run:

```bash
npx shadcn@latest add tooltip scroll-area popover separator --yes --overwrite
```

Expected: Four new files appear under `src/components/ui/`. The CLI may pull `@radix-ui/react-tooltip`, `@radix-ui/react-scroll-area`, `@radix-ui/react-popover`, `@radix-ui/react-separator` into `package.json` — that is desired.

- [ ] **Step 3: Verify type-check**

Run:

```bash
npm run typecheck
```

Expected: PASS. If `tooltip.tsx` uses an import path the codebase doesn't have (e.g. legacy `@/components/ui/tooltip-provider`), open the offending file and adjust to match the existing alias scheme — the codebase uses `@/lib/utils` for `cn`.

- [ ] **Step 4: Verify lint**

Run:

```bash
npm run lint
```

Expected: PASS. Any unused-import warnings inside new shadcn files: leave alone (they ship with all icons exported).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui package.json package-lock.json
git commit -m "feat(phase-06): add tooltip / scroll-area / popover / separator shadcn primitives"
```

---

<!-- openspec-task: 1.3 -->

### Task 3: Scaffold module directories and stub files

**Files:**

- Create: `src/pages/Library.tsx`, `src/components/library/.gitkeep`, `src/stores/library.ts`, `electron/ipc/files.ts`

- [ ] **Step 1: Write the failing route-render test**

Create `src/pages/Library.test.tsx` (NEW):

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Library } from './Library'

describe('Library page (stub)', () => {
  it('renders a placeholder marker so the route is wired', () => {
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    )
    expect(screen.getByTestId('library-stub')).toBeTruthy()
  })
})
```

Run:

```bash
npx vitest run src/pages/Library.test.tsx
```

Expected: FAIL (`Cannot find module './Library'`).

> Note: if `@testing-library/react` is not yet a devDep, this test will fail at import. In that case run `npm install -D @testing-library/react @testing-library/dom @testing-library/user-event jsdom` and add `test.environment: 'jsdom'` to `vitest.config.ts` first. Verify whether the project already has these — check by running `node -e "console.log(require('./package.json').devDependencies['@testing-library/react'])"`. If `undefined`, install them.

- [ ] **Step 2: Write the stub Library page**

Create `src/pages/Library.tsx`:

```tsx
import type { JSX } from 'react'

export function Library(): JSX.Element {
  return (
    <div
      data-testid="library-stub"
      className="flex h-full items-center justify-center text-sm text-[color:var(--color-ink-3)]"
    >
      Library page — implementation lands in plans 2–5.
    </div>
  )
}
```

- [ ] **Step 3: Wire `/library` route to the new component**

Modify `src/App.tsx`:

```tsx
// Replace this line:
//   <Route path="/library" element={<Placeholder name="library" />} />
// With:
//   <Route path="/library" element={<Library />} />
```

And add the import at the top of the file:

```tsx
import { Library } from './pages/Library'
```

- [ ] **Step 4: Run the page test**

Run:

```bash
npx vitest run src/pages/Library.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Create the empty `library/` component dir**

Run:

```bash
mkdir -p src/components/library && touch src/components/library/.gitkeep
```

- [ ] **Step 6: Create the Zustand store stub**

Create `src/stores/library.ts`:

```ts
import { create } from 'zustand'

// Library store — implementation lands in plan 2 (tasks 3.1–3.5).
// This stub exists so the page module can import the hook today and the
// type signature is fixed early.
export type LibraryState = {
  // Will be filled in plan 2.
  _phase: 'stub'
}

export const useLibraryStore = create<LibraryState>(() => ({
  _phase: 'stub'
}))
```

- [ ] **Step 7: Create the IPC handler stub**

Create `electron/ipc/files.ts`:

```ts
// Library file-query IPC handlers — implementation lands in tasks 2.2–2.6.
// This stub exists so handlers.ts can register the namespace today.
export const fileQueryHandlers = {} as const
```

- [ ] **Step 8: Verify type-check and tests**

Run:

```bash
npm run typecheck && npx vitest run src/pages/Library.test.tsx
```

Expected: both PASS.

- [ ] **Step 9: Commit**

```bash
git add src/pages/Library.tsx src/pages/Library.test.tsx src/components/library/.gitkeep src/stores/library.ts electron/ipc/files.ts src/App.tsx
git commit -m "feat(phase-06): scaffold Library page / store / handlers stubs and wire /library route"
```

---

<!-- openspec-task: 1.4 -->

### Task 4: Define shared library types

**Files:**

- Create: `shared/file-types.ts`
- Test: `shared/file-types.test.ts`

- [ ] **Step 1: Write the failing type-shape test**

Create `shared/file-types.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { FileSummary, FileFilter, Pagination, CategoryNode, TagCloudItem } from './file-types'

describe('file-types', () => {
  it('FileSummary has all required fields with correct nullability', () => {
    const s: FileSummary = {
      path: 'notes/a.md',
      title: 'A',
      category: '技术',
      rating: 4,
      clipped_at: '2026-04-27T00:00:00Z',
      site: 'example.com',
      has_summary: true,
      tags: ['x', 'y'],
      is_reviewing: false
    }
    expect(s.path).toBe('notes/a.md')
  })

  it('FileSummary allows nullable fields', () => {
    const s: FileSummary = {
      path: 'notes/b.md',
      title: null,
      category: null,
      rating: null,
      clipped_at: null,
      site: null,
      has_summary: false,
      tags: [],
      is_reviewing: false
    }
    expect(s.tags).toEqual([])
  })

  it('FileFilter all fields optional', () => {
    const f1: FileFilter = {}
    const f2: FileFilter = {
      category: '技术',
      tag: 'attention',
      pathPrefix: 'inbox/',
      rating: { min: 3, max: 5 },
      q: '注意力'
    }
    expect(f1).toBeDefined()
    expect(f2.rating?.min).toBe(3)
  })

  it('Pagination accepts the two orderBy values', () => {
    const p1: Pagination = { limit: 50, offset: 0, orderBy: 'clipped_desc' }
    const p2: Pagination = { limit: 50, offset: 50, orderBy: 'title_asc' }
    expect(p1.orderBy).toBe('clipped_desc')
    expect(p2.orderBy).toBe('title_asc')
  })

  it('CategoryNode is recursive with count', () => {
    const node: CategoryNode = {
      name: '技术',
      count: 3,
      children: [{ name: '深度学习', count: 2, children: [] }]
    }
    expect(node.children[0].name).toBe('深度学习')
  })

  it('TagCloudItem has name + usage_count', () => {
    const t: TagCloudItem = { name: 'attention', usage_count: 12 }
    expect(t.usage_count).toBe(12)
  })
})
```

Run:

```bash
npx vitest run shared/file-types.test.ts
```

Expected: FAIL (`Cannot find module './file-types'`).

- [ ] **Step 2: Implement the types**

Create `shared/file-types.ts`:

```ts
/**
 * Shared types for the Library view. Locked by OpenSpec change
 * `phase-06-virtual-library-view` (specs `file-query-api` + `file-summary-dto`).
 *
 * `FileSummary` is the single DTO source for any IPC that returns a row of
 * `files` to the renderer. Phase 8 (QuickSwitcher) and phase 17 (`@` mention
 * picker) MUST reuse this type — do not create a parallel shape.
 */

export interface FileSummary {
  /** posix-style path relative to grove root (e.g. `inbox/a.md`). */
  path: string
  /** `frontmatter.title` or basename without `.md`. */
  title: string | null
  category: string | null
  /** 1–5 or null when unrated (phase-15 will populate; today `null` means "unreviewed"). */
  rating: number | null
  /** ISO datetime of `clipped_at` or null. */
  clipped_at: string | null
  /** `frontmatter_json.site` or null. */
  site: string | null
  /** True when `files.summary IS NOT NULL AND length > 0`. */
  has_summary: boolean
  /** Tag names attached to this file. Order is insertion order from `file_tags`. */
  tags: string[]
  /**
   * Reserved for phase-15 queue JOIN.
   * Phase-06 hard-codes `false`; phase-15 wires this to
   * `LEFT JOIN queue ON ... WHERE kind='review' AND status IN ('pending','running')`.
   */
  is_reviewing: boolean
}

export interface FileFilter {
  /**
   * Matches `f.category = :category OR f.category LIKE :category || '/%'`.
   * (Prefix match across `/` levels.)
   */
  category?: string
  /** Matches `file_tags.tag = :tag`. */
  tag?: string
  /** Matches `f.path LIKE :pathPrefix || '%'`. Used for `inbox/` view. */
  pathPrefix?: string
  /** Inclusive bounds. Either side may be omitted. */
  rating?: { min?: number; max?: number }
  /** Title + path LIKE `'%' || :q || '%'`. NOT FTS5 — phase 8 owns full-text. */
  q?: string
}

export type OrderBy = 'clipped_desc' | 'title_asc'

export interface Pagination {
  limit: number
  offset: number
  orderBy: OrderBy
}

export interface CategoryNode {
  /** Last segment after `/`. Top-level nodes use the full first segment. */
  name: string
  /** Files whose category equals this node's full path. */
  count: number
  children: CategoryNode[]
}

export interface TagCloudItem {
  name: string
  usage_count: number
}
```

- [ ] **Step 3: Run the test to confirm it passes**

Run:

```bash
npx vitest run shared/file-types.test.ts
```

Expected: PASS (6 assertions).

- [ ] **Step 4: Commit**

```bash
git add shared/file-types.ts shared/file-types.test.ts
git commit -m "feat(phase-06): add FileSummary/FileFilter/Pagination/CategoryNode/TagCloudItem"
```

---

<!-- openspec-task: 2.1 -->

### Task 5: Extend IpcContract with the `files` namespace

**Files:**

- Modify: `shared/ipc-contract.ts`
- Modify: `shared/ipc-contract.type-test.ts`
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/ipc/files.ts`

- [ ] **Step 1: Add the failing type assertion**

Open `shared/ipc-contract.type-test.ts`. At the bottom of the file (preserving any existing assertions), add:

```ts
import type { FileSummary, FileFilter, Pagination, CategoryNode, TagCloudItem } from './file-types'

// files.list returns { items: FileSummary[]; total: number }
type _ListReturn = ReturnType<IpcContract['files']['list']>
const _listOk: _ListReturn = { items: [], total: 0 }
void _listOk

// files.get returns Frontmatter+body+summary
type _GetReturn = ReturnType<IpcContract['files']['get']>
const _getOk: _GetReturn = {
  summary: {
    path: 'a.md',
    title: null,
    category: null,
    rating: null,
    clipped_at: null,
    site: null,
    has_summary: false,
    tags: [],
    is_reviewing: false
  },
  frontmatter: {},
  body: ''
}
void _getOk

// getCategoryTree
type _TreeReturn = ReturnType<IpcContract['files']['getCategoryTree']>
const _treeOk: _TreeReturn = []
void _treeOk

// getTagCloud
type _CloudReturn = ReturnType<IpcContract['files']['getTagCloud']>
const _cloudOk: _CloudReturn = []
void _cloudOk

// revealInFinder
type _RevealReturn = ReturnType<IpcContract['files']['revealInFinder']>
const _revealOk: _RevealReturn = { ok: true }
void _revealOk

// Argument shape sanity
const _filter: FileFilter = {}
const _pagination: Pagination = { limit: 50, offset: 0, orderBy: 'clipped_desc' }
const _node: CategoryNode = { name: 'x', count: 0, children: [] }
const _tag: TagCloudItem = { name: 'x', usage_count: 0 }
void _filter
void _pagination
void _node
void _tag
```

Run:

```bash
npm run typecheck:node
```

Expected: FAIL (`Property 'files' does not exist on type 'IpcContract'`).

- [ ] **Step 2: Add the namespace to the contract**

Modify `shared/ipc-contract.ts`. Add at the top among the existing type imports (just after `import type { Frontmatter } from './frontmatter-schema'`):

```ts
import type { FileSummary, FileFilter, Pagination, CategoryNode, TagCloudItem } from './file-types'

export type {
  FileSummary,
  FileFilter,
  Pagination,
  OrderBy,
  CategoryNode,
  TagCloudItem
} from './file-types'
```

Then in the `IpcContract` map, after the `file:` namespace, add:

```ts
  files: {
    list: (
      filter: FileFilter,
      pagination: Pagination
    ) => { items: FileSummary[]; total: number }
    get: (path: string) => {
      summary: FileSummary
      frontmatter: Frontmatter
      body: string
    }
    getCategoryTree: () => CategoryNode[]
    getTagCloud: (opts: { limit: number }) => TagCloudItem[]
    revealInFinder: (path: string) => { ok: true }
  }
```

- [ ] **Step 3: Update the `files.ts` stub to satisfy the new namespace**

Replace the contents of `electron/ipc/files.ts` with:

```ts
import type { IpcContract } from '@shared/ipc-contract'

type FileQueryHandlers = {
  [M in keyof IpcContract['files']]: IpcContract['files'][M] extends (...args: infer A) => infer R
    ? (...args: A) => R | Promise<Awaited<R>>
    : never
}

// Stub bodies that throw — replaced in tasks 2.2–2.6.
function notImplemented(): never {
  throw new Error('not implemented')
}

export const fileQueryHandlers: FileQueryHandlers = {
  list: notImplemented,
  get: notImplemented,
  getCategoryTree: notImplemented,
  getTagCloud: notImplemented,
  revealInFinder: notImplemented
}
```

- [ ] **Step 4: Register the handlers**

Modify `electron/ipc/handlers.ts`:

Add the import:

```ts
import { fileQueryHandlers } from './files'
```

Add to the `ipcHandlers` map (alongside `file: fileHandlers`):

```ts
files: fileQueryHandlers
```

- [ ] **Step 5: Run the type assertions**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Run the existing IPC contract test to confirm nothing else broke**

Run:

```bash
npx vitest run shared/ipc-contract.test.ts
```

Expected: PASS (no fail). The stub `notImplemented` throws — but the tests only assert the _shape_ of `IpcContract`, not behaviour.

- [ ] **Step 7: Commit**

```bash
git add shared/ipc-contract.ts shared/ipc-contract.type-test.ts electron/ipc/files.ts electron/ipc/handlers.ts
git commit -m "feat(phase-06): extend IpcContract with files namespace and register stub handlers"
```

---

<!-- openspec-task: 2.2 -->

### Task 6: Implement `files.list` handler

**Files:**

- Modify: `electron/ipc/files.ts`
- Test: `electron/ipc/files.test.ts`

The list handler runs the parametrised SQL from design D2: a single LEFT JOIN with `COUNT(*) OVER()` for total. Filter clauses are conditional on whether each parameter is present.

- [ ] **Step 1: Write the test scaffold + first failing test**

Create `electron/ipc/files.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('../services/grove', () => ({ getCurrent: vi.fn() }))
vi.mock('../services/db', () => ({
  dbService: { requireCurrent: vi.fn() }
}))

import * as groveSvc from '../services/grove'
import { dbService } from '../services/db'
import { fileQueryHandlers } from './files'

function setGroveRoot(root: string | null): void {
  ;(groveSvc.getCurrent as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
    root ? { path: root } : null
  )
}

function setDb(db: Database.Database | null): void {
  ;(dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>).mockReturnValue(db!)
}

function buildSchema(db: Database.Database): void {
  // Mirror electron/services/db/migrations/001_init.sql for the rows we touch.
  db.exec(`
    CREATE TABLE files (
      path TEXT PRIMARY KEY, title TEXT, url TEXT, category TEXT,
      rating INTEGER, summary TEXT, clipped_at TEXT, reviewed_at TEXT,
      mtime INTEGER NOT NULL, content_hash TEXT, frontmatter_json TEXT
    );
    CREATE TABLE tags (name TEXT PRIMARY KEY, usage_count INTEGER DEFAULT 0);
    CREATE TABLE file_tags (
      path TEXT NOT NULL, tag TEXT NOT NULL,
      PRIMARY KEY (path, tag),
      FOREIGN KEY (path) REFERENCES files(path) ON DELETE CASCADE
    );
  `)
}

function insertFile(
  db: Database.Database,
  row: Partial<{
    path: string
    title: string | null
    category: string | null
    rating: number | null
    summary: string | null
    clipped_at: string | null
    site: string | null
    tags: string[]
  }>
): void {
  const fm = row.site ? JSON.stringify({ site: row.site }) : null
  db.prepare(
    `INSERT INTO files (path,title,category,rating,summary,clipped_at,mtime,content_hash,frontmatter_json)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(
    row.path,
    row.title ?? null,
    row.category ?? null,
    row.rating ?? null,
    row.summary ?? null,
    row.clipped_at ?? null,
    1,
    'h',
    fm
  )
  for (const t of row.tags ?? []) {
    db.prepare('INSERT OR IGNORE INTO tags(name,usage_count) VALUES (?,1)').run(t)
    db.prepare('INSERT INTO file_tags(path,tag) VALUES (?,?)').run(row.path, t)
  }
}

describe('fileQueryHandlers.list', () => {
  let dir: string
  let db: Database.Database
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'libfiles-'))
    setGroveRoot(dir)
    db = new Database(':memory:')
    buildSchema(db)
    setDb(db)
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
    setGroveRoot(null)
    setDb(null)
  })

  it('returns empty result + total=0 on empty grove', async () => {
    const r = await fileQueryHandlers.list({}, { limit: 50, offset: 0, orderBy: 'clipped_desc' })
    expect(r.items).toEqual([])
    expect(r.total).toBe(0)
  })
})
```

Run:

```bash
npx vitest run electron/ipc/files.test.ts
```

Expected: FAIL — `notImplemented` throws.

- [ ] **Step 2: Add the rest of the test cases**

Append inside the same `describe` block, after the empty-grove test:

```ts
it('basic list orders by clipped_at desc and reports correct total', async () => {
  insertFile(db, { path: 'a.md', title: 'A', clipped_at: '2026-01-01T00:00:00Z' })
  insertFile(db, { path: 'b.md', title: 'B', clipped_at: '2026-01-03T00:00:00Z' })
  insertFile(db, { path: 'c.md', title: 'C', clipped_at: '2026-01-02T00:00:00Z' })
  const r = await fileQueryHandlers.list({}, { limit: 50, offset: 0, orderBy: 'clipped_desc' })
  expect(r.items.map((i) => i.path)).toEqual(['b.md', 'c.md', 'a.md'])
  expect(r.total).toBe(3)
})

it('paginates with limit/offset and total stays the full count', async () => {
  for (let i = 0; i < 5; i++) {
    insertFile(db, {
      path: `f${i}.md`,
      title: `T${i}`,
      clipped_at: `2026-01-0${i + 1}T00:00:00Z`
    })
  }
  const p1 = await fileQueryHandlers.list({}, { limit: 2, offset: 0, orderBy: 'clipped_desc' })
  const p2 = await fileQueryHandlers.list({}, { limit: 2, offset: 2, orderBy: 'clipped_desc' })
  expect(p1.items.length).toBe(2)
  expect(p2.items.length).toBe(2)
  expect(p1.total).toBe(5)
  expect(p2.total).toBe(5)
  const p1set = new Set(p1.items.map((i) => i.path))
  const p2set = new Set(p2.items.map((i) => i.path))
  expect([...p1set].some((p) => p2set.has(p))).toBe(false)
})

it('filters by category prefix (matches "技术" and "技术/深度学习")', async () => {
  insertFile(db, { path: 't1.md', title: 'T1', category: '技术' })
  insertFile(db, { path: 't2.md', title: 'T2', category: '技术/深度学习' })
  insertFile(db, { path: 'p1.md', title: 'P1', category: '产品' })
  const r = await fileQueryHandlers.list(
    { category: '技术' },
    { limit: 50, offset: 0, orderBy: 'clipped_desc' }
  )
  expect(new Set(r.items.map((i) => i.path))).toEqual(new Set(['t1.md', 't2.md']))
})

it('filters by tag', async () => {
  insertFile(db, { path: 'a.md', title: 'A', tags: ['attention'] })
  insertFile(db, { path: 'b.md', title: 'B', tags: ['other'] })
  const r = await fileQueryHandlers.list(
    { tag: 'attention' },
    { limit: 50, offset: 0, orderBy: 'clipped_desc' }
  )
  expect(r.items.map((i) => i.path)).toEqual(['a.md'])
  expect(r.items[0].tags).toContain('attention')
})

it('filters by rating range', async () => {
  insertFile(db, { path: 'a.md', title: 'A', rating: 2 })
  insertFile(db, { path: 'b.md', title: 'B', rating: 4 })
  insertFile(db, { path: 'c.md', title: 'C', rating: 5 })
  const r = await fileQueryHandlers.list(
    { rating: { min: 4 } },
    { limit: 50, offset: 0, orderBy: 'clipped_desc' }
  )
  expect(new Set(r.items.map((i) => i.path))).toEqual(new Set(['b.md', 'c.md']))
})

it('filters by q across title and path', async () => {
  insertFile(db, { path: 'notes/x.md', title: '注意力机制' })
  insertFile(db, { path: 'misc/zhuyili.md', title: 'Other' })
  insertFile(db, { path: 'notes/y.md', title: 'Y' })
  const r = await fileQueryHandlers.list(
    { q: '注意力' },
    { limit: 50, offset: 0, orderBy: 'clipped_desc' }
  )
  expect(new Set(r.items.map((i) => i.path))).toEqual(new Set(['notes/x.md']))
})

it('filters by pathPrefix (inbox view)', async () => {
  insertFile(db, { path: 'inbox/a.md', title: 'A' })
  insertFile(db, { path: 'inbox/b.md', title: 'B' })
  insertFile(db, { path: 'notes/c.md', title: 'C' })
  const r = await fileQueryHandlers.list(
    { pathPrefix: 'inbox/' },
    { limit: 50, offset: 0, orderBy: 'clipped_desc' }
  )
  expect(new Set(r.items.map((i) => i.path))).toEqual(new Set(['inbox/a.md', 'inbox/b.md']))
})

it('orders by title_asc when requested', async () => {
  insertFile(db, { path: 'c.md', title: 'Carrot' })
  insertFile(db, { path: 'a.md', title: 'Apple' })
  insertFile(db, { path: 'b.md', title: 'Banana' })
  const r = await fileQueryHandlers.list({}, { limit: 50, offset: 0, orderBy: 'title_asc' })
  expect(r.items.map((i) => i.title)).toEqual(['Apple', 'Banana', 'Carrot'])
})

it('returns FileSummary shape with is_reviewing=false and has_summary correct', async () => {
  insertFile(db, {
    path: 'a.md',
    title: 'A',
    rating: 4,
    summary: 's',
    site: 'example.com',
    tags: ['x', 'y']
  })
  insertFile(db, { path: 'b.md', title: 'B' })
  const r = await fileQueryHandlers.list({}, { limit: 50, offset: 0, orderBy: 'title_asc' })
  const a = r.items.find((i) => i.path === 'a.md')!
  const b = r.items.find((i) => i.path === 'b.md')!
  expect(a.has_summary).toBe(true)
  expect(b.has_summary).toBe(false)
  expect(a.site).toBe('example.com')
  expect(new Set(a.tags)).toEqual(new Set(['x', 'y']))
  expect(a.is_reviewing).toBe(false)
  expect(b.is_reviewing).toBe(false)
})
```

Run:

```bash
npx vitest run electron/ipc/files.test.ts
```

Expected: All 9 cases FAIL (still hitting `notImplemented`).

- [ ] **Step 3: Implement `list`**

Replace `electron/ipc/files.ts` with:

```ts
import { dbService } from '../services/db'
import { IpcError } from '@shared/ipc-contract'
import type { FileSummary, FileFilter, Pagination, IpcContract } from '@shared/ipc-contract'

type FileQueryHandlers = {
  [M in keyof IpcContract['files']]: IpcContract['files'][M] extends (...args: infer A) => infer R
    ? (...args: A) => R | Promise<Awaited<R>>
    : never
}

const TAG_SEP = ''

interface ListRow {
  path: string
  title: string | null
  category: string | null
  rating: number | null
  clipped_at: string | null
  site: string | null
  has_summary: number
  tags_concat: string | null
  total: number
}

async function list(
  filter: FileFilter,
  pagination: Pagination
): Promise<{ items: FileSummary[]; total: number }> {
  const db = dbService.requireCurrent()
  const sql = `
    SELECT
      f.path,
      f.title,
      f.category,
      f.rating,
      f.clipped_at,
      json_extract(f.frontmatter_json, '$.site') AS site,
      CASE WHEN f.summary IS NOT NULL AND length(f.summary) > 0 THEN 1 ELSE 0 END AS has_summary,
      GROUP_CONCAT(REPLACE(ft.tag, char(1), '?'), char(1)) AS tags_concat,
      COUNT(*) OVER() AS total
    FROM files f
    LEFT JOIN file_tags ft ON ft.path = f.path
    WHERE
      (:category IS NULL OR f.category = :category OR f.category LIKE :category || '/%')
      AND (:pathPrefix IS NULL OR f.path LIKE :pathPrefix || '%')
      AND (:minRating IS NULL OR f.rating >= :minRating)
      AND (:maxRating IS NULL OR f.rating <= :maxRating)
      AND (:q IS NULL OR f.title LIKE '%' || :q || '%' OR f.path LIKE '%' || :q || '%')
      AND (:tag IS NULL OR f.path IN (SELECT path FROM file_tags WHERE tag = :tag))
    GROUP BY f.path
    ORDER BY
      CASE WHEN :orderBy = 'clipped_desc' THEN f.clipped_at END DESC,
      CASE WHEN :orderBy = 'title_asc' THEN f.title END ASC
    LIMIT :limit OFFSET :offset
  `

  const params = {
    category: filter.category ?? null,
    tag: filter.tag ?? null,
    pathPrefix: filter.pathPrefix ?? null,
    minRating: filter.rating?.min ?? null,
    maxRating: filter.rating?.max ?? null,
    q: filter.q ?? null,
    orderBy: pagination.orderBy,
    limit: pagination.limit,
    offset: pagination.offset
  }

  let rows: ListRow[]
  try {
    rows = db.prepare(sql).all(params) as ListRow[]
  } catch (err) {
    throw new IpcError('E_INTERNAL', `files.list: ${(err as Error).message}`)
  }

  if (rows.length === 0) return { items: [], total: 0 }

  const total = rows[0].total
  const items: FileSummary[] = rows.map((r) => ({
    path: r.path,
    title: r.title,
    category: r.category,
    rating: r.rating,
    clipped_at: r.clipped_at,
    site: r.site,
    has_summary: r.has_summary === 1,
    tags: r.tags_concat ? r.tags_concat.split(TAG_SEP).filter(Boolean) : [],
    is_reviewing: false
  }))
  return { items, total }
}

function notImplemented(): never {
  throw new Error('not implemented')
}

export const fileQueryHandlers: FileQueryHandlers = {
  list,
  get: notImplemented,
  getCategoryTree: notImplemented,
  getTagCloud: notImplemented,
  revealInFinder: notImplemented
}
```

- [ ] **Step 4: Run the tests**

Run:

```bash
npx vitest run electron/ipc/files.test.ts
```

Expected: All 9 `list` tests PASS. The other tests in this file (later tasks) don't exist yet.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/files.ts electron/ipc/files.test.ts
git commit -m "feat(phase-06): implement files.list with single-query SQL + tag concat"
```

---

<!-- openspec-task: 2.3 -->

### Task 7: Implement `files.get` handler

**Files:**

- Modify: `electron/ipc/files.ts`
- Modify: `electron/ipc/files.test.ts`

`files.get` returns the SQL summary row + `frontmatter` + `body` (parsed via `fileHandlers.readParsed`).

- [ ] **Step 1: Add failing tests**

Append to `electron/ipc/files.test.ts` (outside the `describe('fileQueryHandlers.list', ...)` block):

```ts
import { writeFileSync } from 'node:fs'
import { stringify } from '../services/frontmatter'

describe('fileQueryHandlers.get', () => {
  let dir: string
  let db: Database.Database
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'libget-'))
    setGroveRoot(dir)
    db = new Database(':memory:')
    buildSchema(db)
    setDb(db)
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
    setGroveRoot(null)
    setDb(null)
  })

  it('returns summary + frontmatter + body when path exists', async () => {
    insertFile(db, {
      path: 'a.md',
      title: 'A',
      rating: 4,
      summary: 's',
      site: 'example.com',
      tags: ['x']
    })
    const md = stringify({ title: 'A', rating: 4 }, '# Hello\n\nbody')
    writeFileSync(join(dir, 'a.md'), md)

    const r = await fileQueryHandlers.get('a.md')
    expect(r.summary.path).toBe('a.md')
    expect(r.summary.rating).toBe(4)
    expect(r.summary.tags).toContain('x')
    expect(r.summary.is_reviewing).toBe(false)
    expect(r.frontmatter.title).toBe('A')
    expect(r.body).toContain('Hello')
  })

  it('throws E_NOT_FOUND when path is not in SQLite', async () => {
    await expect(fileQueryHandlers.get('missing.md')).rejects.toMatchObject({
      code: 'E_NOT_FOUND'
    })
  })

  it('throws E_NOT_FOUND when SQLite has the row but file is missing on disk', async () => {
    insertFile(db, { path: 'a.md', title: 'A' })
    // No file written to disk
    await expect(fileQueryHandlers.get('a.md')).rejects.toMatchObject({
      code: 'E_NOT_FOUND'
    })
  })
})
```

Run:

```bash
npx vitest run electron/ipc/files.test.ts -t 'fileQueryHandlers.get'
```

Expected: 3 tests FAIL (`get: notImplemented`).

- [ ] **Step 2: Implement `get`**

In `electron/ipc/files.ts`, add the import for the file handler:

```ts
import { fileHandlers } from './file'
import type { Frontmatter } from '@shared/frontmatter-schema'
```

Add the handler (placed above the `fileQueryHandlers` object, after `list`):

```ts
async function get(path: string): Promise<{
  summary: FileSummary
  frontmatter: Frontmatter
  body: string
}> {
  const db = dbService.requireCurrent()
  const row = db
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

  if (!row) {
    throw new IpcError('E_NOT_FOUND', `files.get: ${path} not in index`)
  }

  const parsed = await fileHandlers.readParsed(path)

  const summary: FileSummary = {
    path: row.path,
    title: row.title,
    category: row.category,
    rating: row.rating,
    clipped_at: row.clipped_at,
    site: row.site,
    has_summary: row.has_summary === 1,
    tags: row.tags_concat ? row.tags_concat.split(TAG_SEP).filter(Boolean) : [],
    is_reviewing: false
  }
  return { summary, frontmatter: parsed.frontmatter, body: parsed.body }
}
```

Update the `fileQueryHandlers` object:

```ts
export const fileQueryHandlers: FileQueryHandlers = {
  list,
  get,
  getCategoryTree: notImplemented,
  getTagCloud: notImplemented,
  revealInFinder: notImplemented
}
```

- [ ] **Step 3: Run the tests**

Run:

```bash
npx vitest run electron/ipc/files.test.ts -t 'fileQueryHandlers.get'
```

Expected: 3 PASS.

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/files.ts electron/ipc/files.test.ts
git commit -m "feat(phase-06): implement files.get returning summary + frontmatter + body"
```

---

<!-- openspec-task: 2.4 -->

### Task 8: Implement `files.getCategoryTree` handler

**Files:**

- Modify: `electron/ipc/files.ts`
- Modify: `electron/ipc/files.test.ts`

The handler runs a `SELECT category, COUNT(*) ...` and assembles a tree (max 3 levels) by splitting on `/`.

- [ ] **Step 1: Add failing tests**

Append to `electron/ipc/files.test.ts`:

```ts
describe('fileQueryHandlers.getCategoryTree', () => {
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

  it('returns empty array on empty grove', async () => {
    expect(await fileQueryHandlers.getCategoryTree()).toEqual([])
  })

  it('aggregates simple top-level categories', async () => {
    insertFile(db, { path: 'a.md', category: '技术' })
    insertFile(db, { path: 'b.md', category: '产品' })
    insertFile(db, { path: 'c.md', category: '产品' })
    const tree = await fileQueryHandlers.getCategoryTree()
    expect(tree.find((n) => n.name === '产品')?.count).toBe(2)
    expect(tree.find((n) => n.name === '技术')?.count).toBe(1)
  })

  it('builds a 2-level tree with parent counts that include children', async () => {
    insertFile(db, { path: 'a.md', category: '技术/深度学习' })
    insertFile(db, { path: 'b.md', category: '技术/深度学习' })
    insertFile(db, { path: 'c.md', category: '技术/工具链' })
    insertFile(db, { path: 'd.md', category: '产品' })

    const tree = await fileQueryHandlers.getCategoryTree()
    const tech = tree.find((n) => n.name === '技术')!
    expect(tech.count).toBe(3)
    const dl = tech.children.find((n) => n.name === '深度学习')!
    const tools = tech.children.find((n) => n.name === '工具链')!
    expect(dl.count).toBe(2)
    expect(tools.count).toBe(1)
    expect(tree.find((n) => n.name === '产品')?.count).toBe(1)
  })

  it('caps at 3 levels — deeper segments are flattened into the third level', async () => {
    insertFile(db, { path: 'a.md', category: 'a/b/c/d/e' })
    const tree = await fileQueryHandlers.getCategoryTree()
    const a = tree.find((n) => n.name === 'a')!
    const b = a.children.find((n) => n.name === 'b')!
    const c = b.children.find((n) => n.name === 'c')!
    expect(c.children).toEqual([])
  })

  it('skips rows where category IS NULL', async () => {
    insertFile(db, { path: 'a.md', category: null })
    insertFile(db, { path: 'b.md', category: 'X' })
    const tree = await fileQueryHandlers.getCategoryTree()
    expect(tree.length).toBe(1)
    expect(tree[0].name).toBe('X')
  })
})
```

Run:

```bash
npx vitest run electron/ipc/files.test.ts -t 'getCategoryTree'
```

Expected: 5 FAIL.

- [ ] **Step 2: Implement `getCategoryTree`**

Add to `electron/ipc/files.ts` (above `fileQueryHandlers`):

```ts
import type { CategoryNode } from '@shared/ipc-contract'

const MAX_TREE_DEPTH = 3

async function getCategoryTree(): Promise<CategoryNode[]> {
  const db = dbService.requireCurrent()
  const rows = db
    .prepare(
      `SELECT category, COUNT(*) AS count
       FROM files
       WHERE category IS NOT NULL AND category <> ''
       GROUP BY category`
    )
    .all() as Array<{ category: string; count: number }>

  const root: CategoryNode = { name: '', count: 0, children: [] }

  for (const r of rows) {
    const segments = r.category.split('/').slice(0, MAX_TREE_DEPTH)
    let cursor = root
    for (let i = 0; i < segments.length; i++) {
      const name = segments[i]
      let next = cursor.children.find((c) => c.name === name)
      if (!next) {
        next = { name, count: 0, children: [] }
        cursor.children.push(next)
      }
      // Every ancestor of the leaf gets the count rolled up.
      next.count += r.count
      cursor = next
    }
  }
  return root.children
}
```

Wire into the export:

```ts
export const fileQueryHandlers: FileQueryHandlers = {
  list,
  get,
  getCategoryTree,
  getTagCloud: notImplemented,
  revealInFinder: notImplemented
}
```

- [ ] **Step 3: Run the tests**

Run:

```bash
npx vitest run electron/ipc/files.test.ts -t 'getCategoryTree'
```

Expected: 5 PASS.

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/files.ts electron/ipc/files.test.ts
git commit -m "feat(phase-06): implement files.getCategoryTree with rolled-up counts (max depth 3)"
```

---

<!-- openspec-task: 2.5 -->

### Task 9: Implement `files.getTagCloud` handler

**Files:**

- Modify: `electron/ipc/files.ts`
- Modify: `electron/ipc/files.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `electron/ipc/files.test.ts`:

```ts
describe('fileQueryHandlers.getTagCloud', () => {
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

  it('returns empty when no tags', async () => {
    expect(await fileQueryHandlers.getTagCloud({ limit: 30 })).toEqual([])
  })

  it('orders by usage_count desc and respects limit', async () => {
    db.prepare('INSERT INTO tags(name,usage_count) VALUES (?,?)').run('a', 10)
    db.prepare('INSERT INTO tags(name,usage_count) VALUES (?,?)').run('b', 1)
    db.prepare('INSERT INTO tags(name,usage_count) VALUES (?,?)').run('c', 5)
    const r = await fileQueryHandlers.getTagCloud({ limit: 2 })
    expect(r.map((t) => t.name)).toEqual(['a', 'c'])
    expect(r[0].usage_count).toBe(10)
  })

  it('skips tags with usage_count = 0', async () => {
    db.prepare('INSERT INTO tags(name,usage_count) VALUES (?,?)').run('zero', 0)
    db.prepare('INSERT INTO tags(name,usage_count) VALUES (?,?)').run('one', 1)
    const r = await fileQueryHandlers.getTagCloud({ limit: 30 })
    expect(r.map((t) => t.name)).toEqual(['one'])
  })
})
```

Run:

```bash
npx vitest run electron/ipc/files.test.ts -t 'getTagCloud'
```

Expected: 3 FAIL.

- [ ] **Step 2: Implement `getTagCloud`**

Add to `electron/ipc/files.ts`:

```ts
import type { TagCloudItem } from '@shared/ipc-contract'

async function getTagCloud(opts: { limit: number }): Promise<TagCloudItem[]> {
  const db = dbService.requireCurrent()
  const rows = db
    .prepare(
      `SELECT name, usage_count
       FROM tags
       WHERE usage_count > 0
       ORDER BY usage_count DESC, name ASC
       LIMIT ?`
    )
    .all(opts.limit) as TagCloudItem[]
  return rows
}
```

Wire into the export:

```ts
export const fileQueryHandlers: FileQueryHandlers = {
  list,
  get,
  getCategoryTree,
  getTagCloud,
  revealInFinder: notImplemented
}
```

- [ ] **Step 3: Run the tests**

Run:

```bash
npx vitest run electron/ipc/files.test.ts -t 'getTagCloud'
```

Expected: 3 PASS.

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/files.ts electron/ipc/files.test.ts
git commit -m "feat(phase-06): implement files.getTagCloud (DESC by usage_count, > 0 filter)"
```

---

<!-- openspec-task: 2.6 -->

### Task 10: Implement `files.revealInFinder` handler

**Files:**

- Modify: `electron/ipc/files.ts`
- Modify: `electron/ipc/files.test.ts`

`revealInFinder` resolves the rel path against grove root (using `safeResolve`) and calls `shell.showItemInFolder`. We mock `electron.shell` to assert the spy.

- [ ] **Step 1: Add failing tests**

Append to `electron/ipc/files.test.ts`:

```ts
import { writeFileSync as wfs } from 'node:fs'

vi.mock('electron', () => ({
  shell: { showItemInFolder: vi.fn() }
}))
import { shell } from 'electron'

describe('fileQueryHandlers.revealInFinder', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'libreveal-'))
    setGroveRoot(dir)
    ;(shell.showItemInFolder as unknown as ReturnType<typeof vi.fn>).mockClear()
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    setGroveRoot(null)
  })

  it('returns { ok: true } and calls shell.showItemInFolder with the abs path', async () => {
    wfs(join(dir, 'a.md'), 'x')
    const r = await fileQueryHandlers.revealInFinder('a.md')
    expect(r).toEqual({ ok: true })
    expect(shell.showItemInFolder).toHaveBeenCalledTimes(1)
    expect(shell.showItemInFolder).toHaveBeenCalledWith(join(dir, 'a.md'))
  })

  it('rejects path traversal with E_PERMISSION', async () => {
    await expect(fileQueryHandlers.revealInFinder('../escape')).rejects.toMatchObject({
      code: 'E_PERMISSION'
    })
    expect(shell.showItemInFolder).not.toHaveBeenCalled()
  })

  it('throws E_NOT_FOUND when no grove is open', async () => {
    setGroveRoot(null)
    await expect(fileQueryHandlers.revealInFinder('a.md')).rejects.toMatchObject({
      code: 'E_NOT_FOUND'
    })
  })
})
```

Run:

```bash
npx vitest run electron/ipc/files.test.ts -t 'revealInFinder'
```

Expected: 3 FAIL.

- [ ] **Step 2: Implement `revealInFinder`**

Add to `electron/ipc/files.ts`:

```ts
import { shell } from 'electron'
import { safeResolve } from '../services/path-safety'
import * as groveSvc from '../services/grove'

function requireGroveRoot(): string {
  const grove = groveSvc.getCurrent()
  if (!grove) throw new IpcError('E_NOT_FOUND', 'no grove is currently open')
  return grove.path
}

async function revealInFinder(path: string): Promise<{ ok: true }> {
  const root = requireGroveRoot()
  const abs = safeResolve(root, path)
  shell.showItemInFolder(abs)
  return { ok: true }
}
```

Wire into the export:

```ts
export const fileQueryHandlers: FileQueryHandlers = {
  list,
  get,
  getCategoryTree,
  getTagCloud,
  revealInFinder
}
```

- [ ] **Step 3: Run the tests**

Run:

```bash
npx vitest run electron/ipc/files.test.ts
```

Expected: All cases PASS (the `electron` mock now applies to the whole file; if any earlier test fails because of the late `vi.mock`, hoist the mock to the top of the file as the first `vi.mock` call).

- [ ] **Step 4: Run the full unit suite to confirm nothing else broke**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/files.ts electron/ipc/files.test.ts
git commit -m "feat(phase-06): implement files.revealInFinder using safeResolve + shell.showItemInFolder"
```

---

## Plan-1 Acceptance

After all 10 tasks complete:

- [ ] `npm run typecheck` PASSES
- [ ] `npm test` PASSES (new file `electron/ipc/files.test.ts` ≥ 23 cases; new file `shared/file-types.test.ts` ≥ 6 cases; new file `src/pages/Library.test.tsx` ≥ 1 case)
- [ ] `npm run lint` PASSES
- [ ] Five of seven IPC handlers implemented; remaining two (`empty-grove fallback` for `get`/`getCategoryTree`/`getTagCloud` and the `E_INTERNAL` wrap for SQL exceptions) land in plan 2 task 2.7
- [ ] `electron/ipc/files.ts` is a non-stub module returning real data when `dbService.requireCurrent()` is wired in dev runs (manual verification deferred to plan 4)
- [ ] `git log --oneline` shows ten commits, each scoped to one OpenSpec task
