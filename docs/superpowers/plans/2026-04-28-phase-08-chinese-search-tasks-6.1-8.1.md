# Phase 08 — Chinese Search: Plan 4 (FullTextSearchPanel + IndexBanner + i18n)

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-08-chinese-search`
> **Task range:** OpenSpec tasks `6.1`–`8.1` (12 tasks)
> **Plan order:** 4 of 5. Builds on Plans 1+2+3. Subsequent plan (`tasks-9.1-9.18`) is the acceptance phase.
> **Status:** Not started
> **Created:** 2026-04-28

---

## Goal

Ship the **`/search` route page** (`Cmd+Shift+F` opens it; URL `?q=...` is the source of truth), the **IndexBanner** that surfaces FTS rebuild progress as a top-of-app banner, and the **i18n keys** wiring everything. The page reads from `ipc.search.fullText`; debounces input at 200ms; cancels stale requests; renders snippet HTML safely (whitelisted `<mark>` only); and degrades gracefully when the index is rebuilding (banner + "构建完成后将自动重试" empty state).

## Architecture

- **`/search?q=...` is a route page, not a modal.** Per design D7 + spec, the URL `q` parameter is the source of truth; navigating in/out preserves the query. `useSearchParams` from react-router-dom@7 keeps state in URL. Browser back/forward + opening a new window with the URL "just works".
- **Cmd+Shift+F is a router-aware hotkey.** When the user is _already on `/search`_, the hotkey selects all text in the input (UX: re-issue refined search). Otherwise it `navigate('/search')`. We extend the `useGlobalHotkeys` hook from Plan 3 task 4 to handle this.
- **Snippet HTML is feed via `dangerouslySetInnerHTML`.** Service-side guarantee (Plan 2 task 3.1's `escapeForFts`): `body` content is HTML-entity-escaped at insert time. SQLite's `snippet()` then wraps matched substrings with `<mark>` and `</mark>` (literal — these are the only `<` / `>` characters that survive). Renderer therefore trusts the snippet. We add a defensive smoke test that asserts no `<script>` ever leaks through.
- **IndexBanner** is a thin component subscribed to a renderer-side store. The main process emits `index:rebuildProgress { done, total }` and `index:rebuildDone { total }` events (Plan 1 task 4 created `rebuildEvents` on the main side; this plan wires them through preload to the renderer via existing `IpcEventContract`). The banner shows "索引构建中 3200 / 8000" and disappears on `done`.
- **Recent searches are renderer-memory only.** `recentSearches: string[]` in the same `useSearchStore` (Plan 3) — limit 5. Pushed every successful `runFullText` call (where `q` is non-empty and at least one result returned).
- **Cancellation pattern matches Plan 3.** Each `runFullText` increments `fullTextRequestId`; results commit only when the resolve sees its own id.
- **i18n keys are added to a single locale file.** The renderer's i18next is configured with one resource bundle (likely `src/i18n/zh.ts`); we add ~10 keys.

## Tech Stack

- `react-router-dom@^7.14` (already a dep) — `useSearchParams`, `useNavigate`, `useLocation`
- `@radix-ui/*` (already a dep) — for any accessible widgets
- `react-i18next@^17.0` (already a dep) — translations
- `zustand@^5.0` (already a dep) — store extension
- Plan 2's `ipc.search.fullText` — IPC client method
- Main-side `index:rebuildProgress` / `index:rebuildDone` events (added here)

## Files Touched (this plan)

| Path                                                | Action                                                                          | Owner task              |
| --------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------- |
| `src/pages/Search.tsx`                              | Create                                                                          | 6.1, 6.2, 6.3, 6.6, 6.7 |
| `src/pages/Search.test.tsx`                         | Create                                                                          | 6.1, 6.2, 6.6           |
| `src/components/search/FullTextResultList.tsx`      | Create                                                                          | 6.3, 6.4                |
| `src/components/search/FullTextResultList.test.tsx` | Create                                                                          | 6.3, 6.4                |
| `src/stores/search.ts`                              | Modify (add fullText slice + recentSearches)                                    | 6.8, 6.9                |
| `src/stores/search.test.ts`                         | Modify                                                                          | 6.8, 6.9                |
| `src/hooks/useGlobalHotkeys.ts`                     | Modify (add Cmd+Shift+F branch)                                                 | 6.5                     |
| `src/hooks/useGlobalHotkeys.test.tsx`               | Modify                                                                          | 6.5                     |
| `src/App.tsx`                                       | Modify (add `<Route path="/search" element={<Search/>} />`)                     | 6.1                     |
| `src/components/IndexBanner.tsx`                    | Create                                                                          | 7.1                     |
| `src/components/IndexBanner.test.tsx`               | Create                                                                          | 7.1, 7.2                |
| `src/stores/indexBanner.ts`                         | Create                                                                          | 7.1, 7.2                |
| `electron/services/search/rebuild.ts`               | Modify (broadcast events to renderer)                                           | 7.1                     |
| `shared/ipc-contract.ts`                            | Modify (add `index:rebuildProgress`, `index:rebuildDone` to `IpcEventContract`) | 7.1                     |
| `electron/preload/index.ts` (or equivalent)         | Verify event channel passthrough                                                | 7.1                     |
| `src/i18n/<locale>.ts` (existing locale file)       | Modify (add keys)                                                               | 8.1                     |

## Pre-flight

This plan assumes Plans 1+2+3 have merged. Required artefacts:

- `ipc.search.fullText(q, opts)` returns `Promise<{ items, total, pending }>`.
- `useSearchStore` from Plan 3 with `quickSwitcher` slice; we add a sibling `fullText` slice.
- `useGlobalHotkeys` from Plan 3; we extend it.
- Renderer event subscription pattern: `ipc.on('<channel>', handler)` returning an unsubscribe (from `IpcEventContract` in `shared/ipc-contract.ts:170-188`).
- Preload script forwards every channel name in `IpcEventContract` — confirm via:

```bash
grep -n "ipcRenderer.on\|on(channel" electron/preload/*.ts 2>/dev/null
```

If preload manually whitelists channels (rather than dynamically forwarding all), the new `index:rebuildProgress` and `index:rebuildDone` channels need adding there too. Task 7.1 covers this.

---

## Tasks

<!-- openspec-task: 6.1 -->

### Task 1: `/search` route + page skeleton

**Files:**

- Create: `src/pages/Search.tsx`
- Create: `src/pages/Search.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Failing test**

Create `src/pages/Search.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Search from './Search'
import { useSearchStore, _resetSearchStoreForTest } from '@/stores/search'

vi.mock('@/ipc/client', () => ({
  ipc: {
    search: {
      fullText: vi.fn().mockResolvedValue({ items: [], total: 0, pending: false })
    },
    on: vi.fn().mockReturnValue(() => {})
  }
}))

describe('Search page (skeleton)', () => {
  beforeEach(() => {
    _resetSearchStoreForTest()
  })

  it('renders an input and the phrase hint', () => {
    render(
      <MemoryRouter initialEntries={['/search']}>
        <Search />
      </MemoryRouter>
    )
    expect(screen.getByRole('searchbox')).toBeTruthy()
    expect(screen.getByText(/精确短语/)).toBeTruthy()
  })

  it('shows "输入关键词开始搜索" when q is empty', () => {
    render(
      <MemoryRouter initialEntries={['/search']}>
        <Search />
      </MemoryRouter>
    )
    expect(screen.getByText(/输入关键词开始搜索/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npx vitest run src/pages/Search.test.tsx
```

- [ ] **Step 3: Implement the skeleton**

Create `src/pages/Search.tsx`:

```tsx
import type { JSX } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function Search(): JSX.Element {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const q = params.get('q') ?? ''

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <input
          type="search"
          role="searchbox"
          defaultValue={q}
          placeholder={t('search.placeholder_full', { defaultValue: '搜索全文（支持中文分词）' })}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
          aria-label={t('search.placeholder_full', { defaultValue: '搜索全文' })}
        />
        <div className="mt-1 text-xs text-muted-foreground">
          {t('search.phrase_hint', { defaultValue: '输入 "xxxx" 做精确短语搜索' })}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {q.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {t('search.empty_q', { defaultValue: '输入关键词开始搜索（支持中文分词）' })}
          </div>
        ) : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire the route in `src/App.tsx`**

Add the import:

```tsx
import Search from './pages/Search'
```

Add the route inside `<Routes>`:

```tsx
<Route path="/search" element={<Search />} />
```

- [ ] **Step 5: Re-run the test**

```bash
npx vitest run src/pages/Search.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Search.tsx src/pages/Search.test.tsx src/App.tsx
git commit -m "feat(phase-08): /search route skeleton with phrase hint"
```

---

<!-- openspec-task: 6.2 -->

### Task 2: URL `q` two-way sync (`useSearchParams`)

**Files:**

- Modify: `src/pages/Search.tsx`
- Modify: `src/pages/Search.test.tsx`

- [ ] **Step 1: Failing test**

Append to `src/pages/Search.test.tsx`:

```tsx
import { fireEvent, act } from '@testing-library/react'

describe('Search page q sync', () => {
  beforeEach(() => {
    _resetSearchStoreForTest()
  })

  it('renders input pre-filled from URL q', () => {
    render(
      <MemoryRouter initialEntries={['/search?q=注意力']}>
        <Search />
      </MemoryRouter>
    )
    const input = screen.getByRole('searchbox') as HTMLInputElement
    expect(input.value).toBe('注意力')
  })

  it('typing updates URL q via useSearchParams (debounced commit)', async () => {
    const TestApp = (): React.ReactElement => {
      const [params] = useSearchParams()
      return (
        <>
          <Search />
          <div data-testid="url-q">{params.get('q') ?? ''}</div>
        </>
      )
    }
    render(
      <MemoryRouter initialEntries={['/search']}>
        <TestApp />
      </MemoryRouter>
    )
    const input = screen.getByRole('searchbox') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: '注意力' } })
    })
    // Wait the 200ms debounce
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250))
    })
    expect(screen.getByTestId('url-q').textContent).toBe('注意力')
  })
})

// add to imports at top of test file
import { useSearchParams } from 'react-router-dom'
import type React from 'react'
```

- [ ] **Step 2: Run, expect FAIL** (no debounce; the input is uncontrolled with `defaultValue`)

```bash
npx vitest run src/pages/Search.test.tsx -t "q sync"
```

- [ ] **Step 3: Implement controlled input + debounce-then-update-URL**

Replace the body of `src/pages/Search.tsx`:

```tsx
import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const FULL_TEXT_DEBOUNCE_MS = 200

export default function Search(): JSX.Element {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const urlQ = params.get('q') ?? ''
  const [q, setQ] = useState(urlQ)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // URL → state when navigating externally (back/forward)
  useEffect(() => {
    setQ(urlQ)
  }, [urlQ])

  // state → URL (debounced)
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const next = new URLSearchParams(params)
      if (q.length === 0) next.delete('q')
      else next.set('q', q)
      setParams(next, { replace: true })
    }, FULL_TEXT_DEBOUNCE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [q, params, setParams])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <input
          type="search"
          role="searchbox"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('search.placeholder_full', { defaultValue: '搜索全文（支持中文分词）' })}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
          aria-label={t('search.placeholder_full', { defaultValue: '搜索全文' })}
        />
        <div className="mt-1 text-xs text-muted-foreground">
          {t('search.phrase_hint', { defaultValue: '输入 "xxxx" 做精确短语搜索' })}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {q.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {t('search.empty_q', { defaultValue: '输入关键词开始搜索（支持中文分词）' })}
          </div>
        ) : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Re-run the test**

```bash
npx vitest run src/pages/Search.test.tsx
```

Expected: PASS for all three test cases.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Search.tsx src/pages/Search.test.tsx
git commit -m "feat(phase-08): URL q ↔ Search input two-way sync (200ms debounce)"
```

---

<!-- openspec-task: 6.9 -->

### Task 3: `useSearchStore.fullText` slice (request, results, recentSearches, cancellation)

**Files:**

- Modify: `src/stores/search.ts`
- Modify: `src/stores/search.test.ts`

- [ ] **Step 1: Failing test**

Append to `src/stores/search.test.ts`:

```ts
describe('fullText slice', () => {
  beforeEach(() => {
    _resetSearchStoreForTest()
    vi.mocked(ipc.search.fullText).mockReset()
  })

  it('runFullText commits results when not stale', async () => {
    vi.mocked(ipc.search.fullText).mockResolvedValueOnce({
      items: [{ summary: stub('a.md'), snippet: '<mark>x</mark>' }],
      total: 1,
      pending: false
    })
    await useSearchStore.getState().fullText.runFullText('attention', { limit: 50, offset: 0 })
    expect(useSearchStore.getState().fullText.items.length).toBe(1)
    expect(useSearchStore.getState().fullText.total).toBe(1)
    expect(useSearchStore.getState().fullText.pending).toBe(false)
  })

  it('runFullText drops stale resolution', async () => {
    let firstResolve: ((v: never) => void) | null = null
    vi.mocked(ipc.search.fullText)
      .mockImplementationOnce(
        () =>
          new Promise((res) => {
            firstResolve = res as never
          })
      )
      .mockResolvedValueOnce({
        items: [{ summary: stub('newer.md'), snippet: '' }],
        total: 1,
        pending: false
      })

    const slow = useSearchStore.getState().fullText.runFullText('a')
    const fast = useSearchStore.getState().fullText.runFullText('attention')
    await fast
    firstResolve?.({
      items: [{ summary: stub('older.md'), snippet: '' }],
      total: 1,
      pending: false
    } as never)
    await slow

    expect(useSearchStore.getState().fullText.items[0].summary.path).toBe('newer.md')
  })

  it('successful run with results pushes recentSearches (max 5, dedup)', async () => {
    vi.mocked(ipc.search.fullText).mockResolvedValue({
      items: [{ summary: stub('a.md'), snippet: '' }],
      total: 1,
      pending: false
    })
    for (const q of ['a', 'b', 'c', 'd', 'e', 'f', 'a']) {
      await useSearchStore.getState().fullText.runFullText(q)
    }
    const recent = useSearchStore.getState().fullText.recentSearches
    expect(recent.length).toBe(5)
    expect(recent[0]).toBe('a') // most recent first
    expect(recent.filter((r) => r === 'a').length).toBe(1)
  })

  it('does NOT push to recent on empty q or zero results', async () => {
    vi.mocked(ipc.search.fullText).mockResolvedValue({ items: [], total: 0, pending: false })
    await useSearchStore.getState().fullText.runFullText('')
    await useSearchStore.getState().fullText.runFullText('asdfghjkl')
    expect(useSearchStore.getState().fullText.recentSearches).toEqual([])
  })
})
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npx vitest run src/stores/search.test.ts -t "fullText slice"
```

- [ ] **Step 3: Implement the slice**

Edit `src/stores/search.ts`. Add types:

```ts
import type { FileSummary } from '@shared/file-types'

interface FullTextSlice {
  q: string
  items: { summary: FileSummary; snippet: string }[]
  total: number
  pending: boolean
  syntaxError: boolean
  requestId: number
  recentSearches: string[]

  runFullText: (q: string, opts?: { limit?: number; offset?: number }) => Promise<void>
  setQuery: (q: string) => void
  pushRecentSearch: (q: string) => void
}

interface SearchStore {
  quickSwitcher: QuickSwitcherSlice
  fullText: FullTextSlice
}

const FULL_TEXT_LIMIT = 50
const RECENT_SEARCHES_MAX = 5
```

Update `useSearchStore` to add the second slice:

```ts
export const useSearchStore = create<SearchStore>((set, get) => ({
  quickSwitcher: {
    // ... unchanged ...
  },
  fullText: {
    q: '',
    items: [],
    total: 0,
    pending: false,
    syntaxError: false,
    requestId: 0,
    recentSearches: [],

    setQuery: (q: string) => set((prev) => ({ fullText: { ...prev.fullText, q } })),

    runFullText: async (q: string, opts: { limit?: number; offset?: number } = {}) => {
      const myId = get().fullText.requestId + 1
      set((prev) => ({ fullText: { ...prev.fullText, requestId: myId, q } }))
      if (q.length === 0) {
        if (get().fullText.requestId === myId) {
          set((prev) => ({
            fullText: { ...prev.fullText, items: [], total: 0, pending: false, syntaxError: false }
          }))
        }
        return
      }
      try {
        const result = await ipc.search.fullText(q, {
          limit: opts.limit ?? FULL_TEXT_LIMIT,
          offset: opts.offset ?? 0
        })
        if (get().fullText.requestId !== myId) return
        set((prev) => ({
          fullText: {
            ...prev.fullText,
            items: result.items,
            total: result.total,
            pending: result.pending,
            syntaxError: false
          }
        }))
        if (result.items.length > 0 && q.length > 0) {
          get().fullText.pushRecentSearch(q)
        }
      } catch {
        if (get().fullText.requestId !== myId) return
        set((prev) => ({
          fullText: { ...prev.fullText, items: [], total: 0, pending: false, syntaxError: true }
        }))
      }
    },

    pushRecentSearch: (q: string) =>
      set((prev) => {
        const next = [q, ...prev.fullText.recentSearches.filter((r) => r !== q)].slice(
          0,
          RECENT_SEARCHES_MAX
        )
        return { fullText: { ...prev.fullText, recentSearches: next } }
      })
  }
}))
```

Update `_resetSearchStoreForTest` to also reset the fullText slice.

- [ ] **Step 4: Re-run the test**

```bash
npx vitest run src/stores/search.test.ts -t "fullText slice"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/search.ts src/stores/search.test.ts
git commit -m "feat(phase-08): fullText store slice (cancellation + recentSearches)"
```

---

<!-- openspec-task: 6.3 -->

### Task 4: `FullTextResultList` component — virtualized-friendly result rows

**Files:**

- Create: `src/components/search/FullTextResultList.tsx`
- Create: `src/components/search/FullTextResultList.test.tsx`
- Modify: `src/pages/Search.tsx` (consume the list)

- [ ] **Step 1: Failing test**

Create `src/components/search/FullTextResultList.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { FullTextResultList } from './FullTextResultList'

const stub = (path: string, snippet: string) => ({
  summary: {
    path,
    title: path,
    category: null,
    rating: null,
    clipped_at: null,
    site: null,
    has_summary: false,
    tags: [],
    is_reviewing: false
  },
  snippet
})

describe('FullTextResultList', () => {
  it('renders title, path, and snippet', () => {
    render(
      <MemoryRouter>
        <FullTextResultList items={[stub('notes/a.md', 'foo <mark>bar</mark> baz')]} q="bar" />
      </MemoryRouter>
    )
    expect(screen.getByText('notes/a.md')).toBeTruthy()
    expect(screen.getByText('notes/a.md').parentElement?.querySelector('mark')?.textContent).toBe(
      'bar'
    )
  })

  it('shows total + pagination footer when total provided', () => {
    render(
      <MemoryRouter>
        <FullTextResultList items={[stub('a.md', 'snippet')]} q="bar" total={120} />
      </MemoryRouter>
    )
    expect(screen.getByText(/120 条结果/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npx vitest run src/components/search/FullTextResultList.test.tsx
```

- [ ] **Step 3: Implement**

Create `src/components/search/FullTextResultList.tsx`:

```tsx
import type { JSX } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { FileSummary } from '@shared/file-types'

interface ResultItem {
  summary: FileSummary
  snippet: string
}

export function FullTextResultList({
  items,
  q,
  total
}: {
  items: ResultItem[]
  q: string
  total?: number
}): JSX.Element {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-3">
      {typeof total === 'number' ? (
        <div className="text-sm text-muted-foreground">
          {t('search.total_count', { defaultValue: '{{count}} 条结果', count: total })}
        </div>
      ) : null}
      <ul className="flex flex-col gap-2">
        {items.map((it) => (
          <li
            key={it.summary.path}
            className="rounded-md border border-border bg-card p-3 cursor-pointer hover:border-primary"
            onClick={(e) => {
              const mod = e.metaKey || e.ctrlKey
              if (mod) {
                navigate('/library?focus=' + encodeURIComponent(it.summary.path))
              } else {
                navigate(
                  '/editor/' +
                    encodeURIComponent(it.summary.path) +
                    '#match=' +
                    encodeURIComponent(q)
                )
              }
            }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium truncate">{it.summary.title ?? it.summary.path}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {it.summary.clipped_at ?? ''}
              </span>
            </div>
            <div className="text-xs text-muted-foreground truncate">{it.summary.path}</div>
            <div
              className="mt-2 text-sm leading-relaxed text-foreground"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: it.snippet }}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Re-run the test**

```bash
npx vitest run src/components/search/FullTextResultList.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Wire it into the Search page**

Edit `src/pages/Search.tsx`. Add imports:

```tsx
import { useEffect } from 'react'
import { FullTextResultList } from '@/components/search/FullTextResultList'
import { useSearchStore } from '@/stores/search'
```

In the component body, replace the `<div className="flex-1 overflow-y-auto p-4">...</div>` block with:

```tsx
<div className="flex-1 overflow-y-auto p-4">
  <SearchResults q={q} />
</div>
```

Add a sub-component below the page export:

```tsx
function SearchResults({ q }: { q: string }): JSX.Element {
  const { t } = useTranslation()
  const items = useSearchStore((s) => s.fullText.items)
  const total = useSearchStore((s) => s.fullText.total)
  const pending = useSearchStore((s) => s.fullText.pending)
  const syntaxError = useSearchStore((s) => s.fullText.syntaxError)
  const runFullText = useSearchStore((s) => s.fullText.runFullText)
  const recentSearches = useSearchStore((s) => s.fullText.recentSearches)

  useEffect(() => {
    void runFullText(q)
  }, [q, runFullText])

  if (q.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="text-sm text-muted-foreground">
          {t('search.empty_q', { defaultValue: '输入关键词开始搜索（支持中文分词）' })}
        </div>
        {recentSearches.length > 0 ? (
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              {t('search.recent_searches', { defaultValue: '最近搜索' })}
            </div>
            <ul className="flex flex-col gap-1">
              {recentSearches.map((rq) => (
                <li key={rq} className="text-sm">
                  <a
                    className="text-primary hover:underline cursor-pointer"
                    href={`/search?q=${encodeURIComponent(rq)}`}
                  >
                    {rq}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    )
  }

  if (pending) {
    return (
      <div className="text-sm text-muted-foreground">
        {t('search.pending', { defaultValue: '索引构建中，请稍候…构建完成后将自动重试' })}
      </div>
    )
  }

  if (syntaxError) {
    return (
      <div className="text-sm text-destructive">
        {t('search.syntax_error', { defaultValue: '搜索语法错误' })}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        {t('search.no_results_full', {
          defaultValue: '无匹配结果。尝试减少关键词 / 使用引号做精确短语'
        })}
      </div>
    )
  }

  return <FullTextResultList items={items} q={q} total={total} />
}
```

- [ ] **Step 6: Run all tests**

```bash
npx vitest run src/pages/Search.test.tsx src/components/search/FullTextResultList.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/search/FullTextResultList.tsx src/components/search/FullTextResultList.test.tsx src/pages/Search.tsx
git commit -m "feat(phase-08): FullTextResultList + SearchResults dispatch (loading/empty/error)"
```

---

<!-- openspec-task: 6.4 -->

### Task 5: Snippet HTML rendering — verify only `<mark>` tags survive

**Files:**

- Modify: `src/components/search/FullTextResultList.test.tsx`

This is purely a defensive test that locks in the contract: service-side escapes body before insert; SQLite adds `<mark>...</mark>`; renderer trusts that.

- [ ] **Step 1: Add the test**

Append:

```tsx
it('does not execute scripts in snippet (HTML escaped server-side)', () => {
  // The snippet string here represents what the server returns AFTER
  // (1) body was HTML-escaped at insert (Plan 2 task 3.1's escapeForFts)
  // (2) SQLite wrapped the match with <mark>
  // So `<` and `>` in body content arrive escaped; only literal <mark> + </mark> exist.
  const escapedScript = '&lt;script&gt;alert(1)&lt;/script&gt; <mark>注意力</mark>'
  render(
    <MemoryRouter>
      <FullTextResultList items={[stub('a.md', escapedScript)]} q="注意力" />
    </MemoryRouter>
  )
  // Verify no <script> element was created in the DOM
  expect(document.querySelector('script')).toBeNull()
  expect(screen.getByText(/<script>/, { exact: false })).toBeTruthy() // text rendered as text
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/components/search/FullTextResultList.test.tsx
git add src/components/search/FullTextResultList.test.tsx
git commit -m "test(phase-08): assert snippet HTML cannot inject script (server-side escape)"
```

---

<!-- openspec-task: 6.5 -->

### Task 6: Cmd+Shift+F hotkey — navigate to `/search` or `select-all` if already there

**Files:**

- Modify: `src/hooks/useGlobalHotkeys.ts`
- Modify: `src/hooks/useGlobalHotkeys.test.tsx`

- [ ] **Step 1: Failing test**

Append to `src/hooks/useGlobalHotkeys.test.tsx`:

```tsx
const navigateMock = vi.fn()
const locationMock: { pathname: string } = { pathname: '/library' }
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => locationMock
  }
})

describe('useGlobalHotkeys Cmd+Shift+F', () => {
  beforeEach(() => {
    _resetSearchStoreForTest()
    navigateMock.mockReset()
    locationMock.pathname = '/library'
  })

  it('navigates to /search when not already there', () => {
    renderHook(() => useGlobalHotkeys())
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'f',
        metaKey: true,
        shiftKey: true,
        cancelable: true
      })
    )
    expect(navigateMock).toHaveBeenCalledWith('/search')
  })

  it('does not re-navigate when already on /search; selects input text', () => {
    locationMock.pathname = '/search'
    const input = document.createElement('input')
    input.setAttribute('role', 'searchbox')
    document.body.appendChild(input)
    const selectSpy = vi.spyOn(input, 'select')

    renderHook(() => useGlobalHotkeys())
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'f',
        metaKey: true,
        shiftKey: true,
        cancelable: true
      })
    )
    expect(navigateMock).not.toHaveBeenCalled()
    expect(selectSpy).toHaveBeenCalled()
    input.remove()
  })
})
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npx vitest run src/hooks/useGlobalHotkeys.test.tsx -t "Cmd\+Shift\+F"
```

- [ ] **Step 3: Implement**

Edit `src/hooks/useGlobalHotkeys.ts`. Replace the body of `useGlobalHotkeys`:

```ts
import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useSearchStore } from '@/stores/search'

export function useGlobalHotkeys(): void {
  const openQuickSwitcher = useSearchStore((s) => s.quickSwitcher.open)
  const navigate = useNavigate()
  const location = useLocation()

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
      if (key === 'f' && ev.shiftKey) {
        ev.preventDefault()
        if (location.pathname === '/search') {
          const el = document.querySelector<HTMLInputElement>('[role="searchbox"]')
          el?.select()
        } else {
          navigate('/search')
        }
        return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openQuickSwitcher, navigate, location.pathname])
}
```

- [ ] **Step 4: Re-run the test**

```bash
npx vitest run src/hooks/useGlobalHotkeys.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGlobalHotkeys.ts src/hooks/useGlobalHotkeys.test.tsx
git commit -m "feat(phase-08): Cmd/Ctrl+Shift+F hotkey opens or refocuses /search"
```

---

<!-- openspec-task: 6.6 -->

### Task 7: Empty / pending / error states — final pass to lock all branches

This task is a **regression-test sweep**. Tasks 1–4 already implement the branches; we add explicit assertions for each.

**Files:**

- Modify: `src/pages/Search.test.tsx`

- [ ] **Step 1: Add comprehensive state tests**

Append to `src/pages/Search.test.tsx`:

```tsx
import { useSearchStore as Store } from '@/stores/search'

describe('Search page state branches', () => {
  beforeEach(() => {
    _resetSearchStoreForTest()
  })

  it('shows pending banner state when fullText.pending=true', () => {
    Store.setState((prev) => ({
      fullText: { ...prev.fullText, q: '注意力', pending: true, items: [] }
    }))
    render(
      <MemoryRouter initialEntries={['/search?q=%E6%B3%A8%E6%84%8F%E5%8A%9B']}>
        <Search />
      </MemoryRouter>
    )
    expect(screen.getByText(/索引构建中/)).toBeTruthy()
  })

  it('shows syntax-error message when syntaxError=true', () => {
    Store.setState((prev) => ({
      fullText: { ...prev.fullText, q: 'foo:', syntaxError: true, items: [] }
    }))
    render(
      <MemoryRouter initialEntries={['/search?q=foo%3A']}>
        <Search />
      </MemoryRouter>
    )
    expect(screen.getByText(/搜索语法错误/)).toBeTruthy()
  })

  it('shows zero-results message when items=[] and q is non-empty', async () => {
    vi.mocked((await import('@/ipc/client')).ipc.search.fullText).mockResolvedValueOnce({
      items: [],
      total: 0,
      pending: false
    })
    render(
      <MemoryRouter initialEntries={['/search?q=asdfghjkl']}>
        <Search />
      </MemoryRouter>
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(screen.getByText(/无匹配结果/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/pages/Search.test.tsx
git add src/pages/Search.test.tsx
git commit -m "test(phase-08): Search page pending/syntax-error/zero-result states"
```

---

<!-- openspec-task: 6.7 -->

### Task 8: Click row → navigate `/editor/<encodedPath>#match=<q>`; Cmd+Click → `/library?focus=<path>`

This is already implemented in `FullTextResultList` (task 4). This task adds an explicit test.

**Files:**

- Modify: `src/components/search/FullTextResultList.test.tsx`

- [ ] **Step 1: Test**

Append:

```tsx
it('plain click navigates to /editor/<encodedPath>#match=<q>', () => {
  const navigateSpy = vi.fn()
  vi.doMock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
    return { ...actual, useNavigate: () => navigateSpy }
  })

  // Re-import after mock
  return import('./FullTextResultList').then(({ FullTextResultList: Fresh }) => {
    render(
      <MemoryRouter>
        <Fresh items={[stub('notes/x.md', 'snippet <mark>注意力</mark>')]} q="注意力" />
      </MemoryRouter>
    )
    const row = screen.getByText('notes/x.md').closest('li') as HTMLElement
    row.click()
    expect(navigateSpy).toHaveBeenCalledWith(
      '/editor/' + encodeURIComponent('notes/x.md') + '#match=' + encodeURIComponent('注意力')
    )
  })
})
```

> If `vi.doMock` interactions get awkward, simplify the test by reading the link's intended `href` from a `data-href` attribute the component renders for testability. Example refactor: replace the click with a helper `function buildClickTarget(...)` exported from `FullTextResultList.tsx` that returns the URL string; test the helper directly.

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/components/search/FullTextResultList.test.tsx
git add src/components/search/FullTextResultList.test.tsx
git commit -m "test(phase-08): result row click navigates to editor with #match=q"
```

---

<!-- openspec-task: 6.8 -->

### Task 9: Recent searches list visible on empty `q` (already implemented; add test)

**Files:**

- Modify: `src/pages/Search.test.tsx`

- [ ] **Step 1: Test**

Append:

```tsx
it('lists recentSearches when q is empty', () => {
  Store.setState((prev) => ({
    fullText: { ...prev.fullText, recentSearches: ['注意力', 'attention'], q: '' }
  }))
  render(
    <MemoryRouter initialEntries={['/search']}>
      <Search />
    </MemoryRouter>
  )
  expect(screen.getByText('注意力')).toBeTruthy()
  expect(screen.getByText('attention')).toBeTruthy()
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/pages/Search.test.tsx -t "recentSearches"
git add src/pages/Search.test.tsx
git commit -m "test(phase-08): recentSearches surfaces on empty q in /search"
```

---

<!-- openspec-task: 7.1 -->

### Task 10: IndexBanner — main-side broadcast + renderer-side store + component

**Files:**

- Modify: `shared/ipc-contract.ts` (add events)
- Modify: `electron/services/search/rebuild.ts` (broadcast events)
- Modify: `electron/preload/index.ts` (or wherever event channels are whitelisted)
- Create: `src/stores/indexBanner.ts`
- Create: `src/components/IndexBanner.tsx`
- Create: `src/components/IndexBanner.test.tsx`
- Modify: `src/App.tsx` (mount the banner)

- [ ] **Step 1: Add events to `shared/ipc-contract.ts`**

Find `IpcEventContract` (around `shared/ipc-contract.ts:170-180`):

```ts
export type IpcEventContract = {
  'project:changed': GroveSummary | null
  'bootstrap:ready': { ... }
  'db:rebuilding': void
  'db:rebuilt': void
  'index:rebuildProgress': { done: number; total: number }
  'index:rebuildDone': { total: number }
}
```

- [ ] **Step 2: Verify preload forwards these channels**

```bash
grep -n "rebuildProgress\|rebuildDone\|index:" electron/preload/*.ts
```

If the preload script has an explicit allow-list of channel names, add `'index:rebuildProgress'` and `'index:rebuildDone'`. If it forwards anything matching `IpcEventContract` keys (typed forwarding), no change needed.

If unsure, **add a smoke test** (skipped if preload uses dynamic forwarding). Otherwise update the allow-list now:

```ts
// electron/preload/index.ts (excerpt — exact location varies)
const ALLOWED_EVENTS = [
  'project:changed',
  'bootstrap:ready',
  'db:rebuilding',
  'db:rebuilt',
  'index:rebuildProgress',
  'index:rebuildDone'
] as const
```

- [ ] **Step 3: Broadcast from main on rebuild progress + done**

Edit `electron/services/search/rebuild.ts`. Add a helper at the top:

```ts
import { BrowserWindow } from 'electron'

function broadcastEvent(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send(channel, payload)
    } catch {
      /* renderer destroyed */
    }
  }
}
```

In `rebuildFts`, replace:

```ts
rebuildEvents.emit('progress', payload)
```

with:

```ts
rebuildEvents.emit('progress', payload)
broadcastEvent('index:rebuildProgress', payload)
```

And replace:

```ts
rebuildEvents.emit('done', { total })
```

with:

```ts
rebuildEvents.emit('done', { total })
broadcastEvent('index:rebuildDone', { total })
```

> Tests for `rebuildFts` previously stubbed `rebuildEvents` listeners; with `BrowserWindow` imported from electron, those tests will fail at module load (electron is not present in unit tests). Wrap the call so the import is lazy:

Replace `import { BrowserWindow } from 'electron'` with:

```ts
function broadcastEvent(channel: string, payload: unknown): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as {
      BrowserWindow: {
        getAllWindows: () => { webContents: { send: (c: string, p: unknown) => void } }[]
      }
    }
    for (const win of electron.BrowserWindow.getAllWindows()) {
      try {
        win.webContents.send(channel, payload)
      } catch {
        /* destroyed */
      }
    }
  } catch {
    // running outside electron (unit tests) — silently no-op
  }
}
```

- [ ] **Step 4: Renderer-side IndexBanner store**

Create `src/stores/indexBanner.ts`:

```ts
import { create } from 'zustand'
import { ipc } from '@/ipc/client'

interface IndexBannerStore {
  rebuildVisible: boolean
  done: number
  total: number
  init: () => () => void
  _setProgressForTest: (done: number, total: number) => void
  _setHiddenForTest: () => void
}

export const useIndexBannerStore = create<IndexBannerStore>((set) => ({
  rebuildVisible: false,
  done: 0,
  total: 0,

  init: () => {
    const offProgress = ipc.on('index:rebuildProgress', (payload) => {
      set({ rebuildVisible: true, done: payload.done, total: payload.total })
    })
    const offDone = ipc.on('index:rebuildDone', () => {
      set({ rebuildVisible: false, done: 0, total: 0 })
    })
    return () => {
      offProgress()
      offDone()
    }
  },

  _setProgressForTest: (done: number, total: number) => set({ rebuildVisible: true, done, total }),
  _setHiddenForTest: () => set({ rebuildVisible: false, done: 0, total: 0 })
}))
```

- [ ] **Step 5: IndexBanner component**

Create `src/components/IndexBanner.tsx`:

```tsx
import type { JSX } from 'react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useIndexBannerStore } from '@/stores/indexBanner'

export function IndexBanner(): JSX.Element | null {
  const { t } = useTranslation()
  const visible = useIndexBannerStore((s) => s.rebuildVisible)
  const done = useIndexBannerStore((s) => s.done)
  const total = useIndexBannerStore((s) => s.total)
  const init = useIndexBannerStore((s) => s.init)

  useEffect(() => init(), [init])

  if (!visible) return null
  return (
    <div
      className="border-b border-amber-300 bg-amber-50 text-amber-900 px-4 py-2 text-sm"
      role="status"
      aria-live="polite"
    >
      {t('search.rebuilding', {
        defaultValue: '索引构建中 {{done}} / {{total}}',
        done,
        total
      })}
    </div>
  )
}
```

- [ ] **Step 6: Test**

Create `src/components/IndexBanner.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { IndexBanner } from './IndexBanner'
import { useIndexBannerStore } from '@/stores/indexBanner'

vi.mock('@/ipc/client', () => ({
  ipc: { on: vi.fn().mockReturnValue(() => {}) }
}))

describe('IndexBanner', () => {
  beforeEach(() => {
    useIndexBannerStore.getState()._setHiddenForTest()
  })

  it('renders nothing when not rebuilding', () => {
    render(<IndexBanner />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows progress when set', () => {
    render(<IndexBanner />)
    act(() => useIndexBannerStore.getState()._setProgressForTest(3200, 8000))
    expect(screen.getByRole('status').textContent).toContain('3200')
    expect(screen.getByRole('status').textContent).toContain('8000')
  })
})
```

- [ ] **Step 7: Mount the banner**

Edit `src/App.tsx`. Add import + render:

```tsx
import { IndexBanner } from '@/components/IndexBanner'

// inside <main> wrapper, just below TitleBar:
;<IndexBanner />
```

- [ ] **Step 8: Run all tests + typecheck**

```bash
npm run typecheck
npx vitest run src/components/IndexBanner.test.tsx src/stores/search.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add shared/ipc-contract.ts electron/services/search/rebuild.ts electron/preload/index.ts src/stores/indexBanner.ts src/components/IndexBanner.tsx src/components/IndexBanner.test.tsx src/App.tsx
git commit -m "feat(phase-08): IndexBanner subscribes to index:rebuildProgress events"
```

---

<!-- openspec-task: 7.2 -->

### Task 11: IndexBanner re-fires search after `index:rebuildDone`

When the rebuild finishes, the user might be sitting on `/search` showing "构建完成后将自动重试". We want the page to automatically re-issue the last `q`.

**Files:**

- Modify: `src/pages/Search.tsx`
- Modify: `src/pages/Search.test.tsx`

- [ ] **Step 1: Failing test**

Append:

```tsx
import { useIndexBannerStore } from '@/stores/indexBanner'

it('re-runs fullText query when rebuildDone fires', async () => {
  const ipcModule = await import('@/ipc/client')
  vi.mocked(ipcModule.ipc.search.fullText).mockReset()
  vi.mocked(ipcModule.ipc.search.fullText).mockResolvedValue({
    items: [],
    total: 0,
    pending: false
  })

  render(
    <MemoryRouter initialEntries={['/search?q=注意力']}>
      <Search />
    </MemoryRouter>
  )
  await act(async () => {
    await new Promise((r) => setTimeout(r, 250))
  })

  vi.mocked(ipcModule.ipc.search.fullText).mockClear()

  act(() => {
    // Simulate rebuildDone toggling visible→hidden
    useIndexBannerStore.getState()._setProgressForTest(100, 100)
  })
  act(() => {
    useIndexBannerStore.getState()._setHiddenForTest()
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50))
  })

  expect(ipcModule.ipc.search.fullText).toHaveBeenCalled()
})
```

- [ ] **Step 2: Implement**

Edit `src/pages/Search.tsx`. In `SearchResults`, observe `rebuildVisible` and re-run on transition true→false:

```tsx
const rebuildVisible = useIndexBannerStore((s) => s.rebuildVisible)
const prevRebuildVisible = useRef(rebuildVisible)

useEffect(() => {
  if (prevRebuildVisible.current && !rebuildVisible && q.length > 0) {
    void runFullText(q)
  }
  prevRebuildVisible.current = rebuildVisible
}, [rebuildVisible, q, runFullText])
```

Add the imports at the top:

```tsx
import { useRef } from 'react'
import { useIndexBannerStore } from '@/stores/indexBanner'
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run src/pages/Search.test.tsx -t "rebuildDone"
git add src/pages/Search.tsx src/pages/Search.test.tsx
git commit -m "feat(phase-08): /search auto-retries query when index rebuild completes"
```

---

<!-- openspec-task: 8.1 -->

### Task 12: i18n keys — full set for QuickSwitcher + Search panel + IndexBanner

**Files:**

- Modify: `src/i18n/<existing-locale-file>.ts`

- [ ] **Step 1: Identify the locale file**

```bash
grep -rln "i18next.init\|createInstance\|i18n" src/i18n/ 2>/dev/null
ls src/i18n/ 2>/dev/null
```

Use the output to locate the source-of-truth resource bundle (likely `src/i18n/zh.ts` or `src/i18n/index.ts`).

- [ ] **Step 2: Add the full search namespace**

Add to the locale file:

```ts
search: {
  // QuickSwitcher
  placeholder_quick: '搜索文件名 / 路径',
  recent: '最近打开',

  // Full-text Search panel
  placeholder_full: '搜索全文（支持中文分词）',
  empty_q: '输入关键词开始搜索（支持中文分词）',
  no_results: '无匹配结果',
  no_results_full: '无匹配结果。尝试减少关键词 / 使用引号做精确短语',
  pending: '索引构建中，请稍候…构建完成后将自动重试',
  syntax_error: '搜索语法错误',
  recent_searches: '最近搜索',
  total_count: '{{count}} 条结果',
  phrase_hint: '输入 "xxxx" 做精确短语搜索',

  // IndexBanner
  rebuilding: '索引构建中 {{done}} / {{total}}'
}
```

If the project uses flat keys instead of nested:

```ts
'search.placeholder_quick': '搜索文件名 / 路径',
'search.recent': '最近打开',
'search.placeholder_full': '搜索全文（支持中文分词）',
// ... etc.
```

- [ ] **Step 3: Remove `defaultValue` fallbacks from the components (optional polish)**

We added `t('key', { defaultValue: '...' })` throughout this plan as a safety net. With keys now present, the `defaultValue` overhead is unnecessary — but removing them is also risky if the locale file structure differs across environments. **Skip this cleanup** unless the renderer logs warnings about missing keys at runtime. The `defaultValue` mechanism is a feature, not a bug.

- [ ] **Step 4: Smoke test**

```bash
npm run dev
```

In the running app:

- Press Cmd+P — input placeholder reads "搜索文件名 / 路径".
- Press Cmd+Shift+F — page heading and placeholder reflect the keys.
- Open a brand-new grove with seeded files — the IndexBanner should briefly show "索引构建中 X / Y" during rebuild.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/
git commit -m "feat(phase-08): i18n keys for QuickSwitcher / Search panel / IndexBanner"
```

---

## Self-review checklist

- [ ] `/search?q=...` route exists; URL is the source of truth; navigation back/forward keeps the query.
- [ ] Input debounce is 200ms; URL update is debounced; `runFullText` is dispatched on `q` change via `useEffect(..., [q])`.
- [ ] `useSearchStore.fullText` slice has: `q`, `items`, `total`, `pending`, `syntaxError`, `requestId`, `recentSearches`. `runFullText` cancels stale results.
- [ ] `recentSearches` capped at 5; only successful non-empty queries with at least one result push.
- [ ] `Cmd+Shift+F` navigates to `/search`, or `select-all` if already there.
- [ ] `FullTextResultList` renders `<mark>` snippets via `dangerouslySetInnerHTML`; defensive test asserts no script execution.
- [ ] Click row → `/editor/<encodedPath>#match=<q>`; Cmd+Click → `/library?focus=<encodedPath>`.
- [ ] Empty / pending / syntax-error / no-results states each have an explicit branch and test.
- [ ] `IndexBanner` subscribes to `index:rebuildProgress` and `index:rebuildDone`; visible during rebuild, hides on done.
- [ ] `/search` re-runs the active query when `rebuildVisible` transitions true→false.
- [ ] All twelve OpenSpec labels (6.1–6.9, 7.1, 7.2, 8.1) appear exactly once as `<!-- openspec-task: ... -->` annotations.
