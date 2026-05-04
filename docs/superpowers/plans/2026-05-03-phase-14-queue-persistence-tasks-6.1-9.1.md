# Phase-14 Queue Persistence — Plan 3: Renderer UI, Pipeline Rewire, Indexer Rewire, i18n

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-14-queue-persistence`
> **Task range:** OpenSpec tasks `6.1`–`9.1` (10 tasks)
> **Plan order:** 3 of 4. Depends on Plans 1 (`tasks-1.1-2.4`) and 2 (`tasks-3.1-5.3`). Plan 4 (`tasks-10.1-10.14`) is the acceptance suite.
> **Status:** Not started
> **Created:** 2026-05-03
> **Branch suggestion:** continue on `feat/phase-14-queue-persistence`

---

## Goal

Add the **Jobs** tab to the existing phase-10 `/history` page (4-tab layout, URL ↔ tab sync), build the virtualised JobsTab UI with kind/status filters + retry/cancel buttons + clearDone, replace phase-12's `clipQueue.enqueue` placeholder with real `jobs.enqueue('ai-review-clip', …)`, replace phase-5's `setTimeout` self-retry with `jobs.enqueue('index-retry', …)` (and treat ENOENT as a permanent error), and add the i18n keys for everything new.

## Architecture

`/history` is owned by phase-10 with three tabs (Trash / Conflicts / Ops). Phase-14 grows it to four. The Jobs tab is a single component (`JobsTab.tsx`) backed by `@tanstack/react-virtual` (already a dep) for the list and `window.api.jobs.*` for data; it subscribes to `'jobs:changed'` for live updates and reloads the list on every event (cheap given small N — sub-1000 rows). The pipeline + indexer rewires are surgical: only the call sites move; nothing else changes shape.

## Tech Stack

- React 19, react-router-dom 7 (existing routing)
- `@tanstack/react-virtual` 3 (existing dep) for the list virtualizer
- `i18next` + `react-i18next` (existing) — keys live in `src/i18n/locales/zh-CN.json`
- Vitest + React Testing Library (existing)

## Cross-Plan Decisions (locked here)

1. **Default Jobs filter**: `kind=all`, `status=running|pending|failed` (i.e., hide done & canceled). Implementation: do **three** calls to `jobs.list` (one per status) and merge — simpler than expanding the spec's filter to support arrays. Total/limit handled per-call. *Alternative considered:* extend `JobListFilter.status` to `JobStatus | JobStatus[]`. Rejected for spec consistency — Plan 4's acceptance test 10.1 verifies the existing filter shape.
2. **Refresh strategy**: on every `'jobs:changed'` event, debounce 100ms, then re-fetch the current filter. Avoids storms during rapid runner ticks.
3. **Row height** = 48 px (per spec); virtualizer overscan = 5 rows.
4. **Tab URL convention**: `/history/trash`, `/history/conflicts`, `/history/ops`, `/history/jobs`. Default `/history` redirects to `/history/trash` (pre-existing phase-10 behaviour); we add the fourth route + label without rearranging existing tabs.
5. **Pipeline rewire (Task 7.x)**: import the renderer-facing `clipQueue` *only if* phase-12 actually exposed one as a renderer module — review of phase-12 spec shows it lives in the **main** process (`electron/clipper/pipeline.ts`), so the rewire is a main-process change.
6. **Indexer ENOENT handling**: phase-5 `upsertFromFs` on `ENOENT` MUST delete the row from `files` (and tags, FTS) and **must not** enqueue a retry. The phase-14 spec (file-indexer §"文件不存在") demands this; we use `index-queries.deleteFile(path)` (or whatever phase-5 named it).

---

## Pre-flight

Plans 1 + 2 must be merged. Specifically:
- `window.api.jobs.list / retry / cancel / clearDone` and `window.api.on('jobs:changed', …)` are reachable from any renderer.
- `jobs.enqueue('ai-review-clip' | 'index-retry', payload, opts)` is callable from the main process via `getQueueBootstrap()?.store.enqueue(...)` (or the `bootstrapQueueRunner`'s exposed store). If your Plan-2 implementation didn't surface `enqueue` on the bootstrap, expose it here as part of Task 7.1 (one-line change).

This plan also assumes phase-10 has shipped `src/pages/History.tsx` with three tabs and three child routes. **Read** that file first (and `phase-10-history-and-trash` archived spec) so the existing patterns can be reused 1:1.

---

## File Structure

| Path | Action | Owner task |
|---|---|---|
| `src/pages/History.tsx` | Modify (add fourth tab + child route) | 6.1 |
| `src/components/history/JobsTab.tsx` | Create | 6.2 |
| `src/components/history/JobsTab.test.tsx` | Create | 6.2, 6.4, 6.5 |
| `src/components/history/JobRow.tsx` | Create | 6.3 |
| `src/components/history/JobRow.test.tsx` | Create | 6.3 |
| `electron/clipper/pipeline.ts` | Modify (call jobs.enqueue) | 7.1 |
| `electron/clipper/clipQueue.ts` (or wherever phase-12 placed it) | Delete | 7.2 |
| `electron/services/indexer.ts` | Modify (enqueue index-retry on transient errs; delete row on ENOENT) | 8.1 |
| `electron/services/indexer.test.ts` | Modify (replace setTimeout assertions with jobs.enqueue) | 8.1, 8.2 |
| `src/i18n/locales/zh-CN.json` | Modify (add `history.jobs.*`, `jobs.status.*`, etc.) | 9.1 |
| `src/i18n/phase-14.test.ts` | Create (key-presence test) | 9.1 |

---

## Tasks

<!-- openspec-task: 6.1 -->
### Task 1: `History.tsx` 4-tab layout — add Jobs tab + `/history/jobs` route

**Files:**
- Modify: `src/pages/History.tsx`
- Modify: `src/main.tsx` (route registration — only if phase-10 routes the children there)

- [ ] **Step 1: Read the existing History page**

```bash
cat src/pages/History.tsx
```

Identify (a) the Tabs primitive used (likely a Radix wrapper at `src/components/ui/tabs.tsx` — phase-10 may have added it), (b) how URL ↔ tab sync is done, (c) where children render. Don't refactor; only add.

- [ ] **Step 2: Append a failing test for the Jobs tab presence**

Create or extend `src/pages/History.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { i18n } from '@/i18n'
import { MemoryRouter } from 'react-router-dom'
import { History } from './History'

describe('History page — phase-14', () => {
  it('renders all four tab labels: Trash / Conflicts / Ops / Jobs', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/history/trash']}>
          <History />
        </MemoryRouter>
      </I18nextProvider>
    )
    expect(screen.getByRole('tab', { name: /回收站|trash/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /冲突|conflict/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /操作|ops/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /任务|jobs/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- src/pages/History.test.tsx`
Expected: FAIL — only three tabs found.

- [ ] **Step 4: Add the fourth tab**

Modify `src/pages/History.tsx` — wherever the three Tab triggers are listed, append the fourth:

```tsx
<TabsTrigger value="jobs">{t('history.jobs.tabLabel')}</TabsTrigger>
```

And the matching content panel:

```tsx
<TabsContent value="jobs">
  <JobsTab />
</TabsContent>
```

Add the import:

```tsx
import { JobsTab } from '@/components/history/JobsTab'
```

If History.tsx maps `value ↔ URL`, add `'jobs' ↔ '/history/jobs'`.

If the routing is in `src/main.tsx` (children of a `History` route), append:

```tsx
{ path: 'history/jobs', element: <JobsTab /> }
```

- [ ] **Step 5: Stub out `JobsTab` to make the test pass**

Create `src/components/history/JobsTab.tsx` (just enough for the test — full impl in Task 6.2):

```tsx
import type { JSX } from 'react'

export function JobsTab(): JSX.Element {
  return <div data-testid="jobs-tab" />
}
```

- [ ] **Step 6: Run the test**

Run: `npm test -- src/pages/History.test.tsx`
Expected: PASS — four tabs present.

- [ ] **Step 7: Commit**

```bash
git add src/pages/History.tsx src/components/history/JobsTab.tsx src/main.tsx src/pages/History.test.tsx
git commit -m "feat(history): add Jobs tab + /history/jobs route (phase-14 6.1)"
```

---

<!-- openspec-task: 6.2 -->
### Task 2: `JobsTab.tsx` — filters + clear-done button + virtualised list

**Files:**
- Modify: `src/components/history/JobsTab.tsx`
- Create: `src/components/history/JobsTab.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/history/JobsTab.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { I18nextProvider } from 'react-i18next'
import { i18n } from '@/i18n'
import { JobsTab } from './JobsTab'
import type { Job } from '@shared/job-types'

const mockApi = {
  jobs: {
    list: vi.fn(),
    retry: vi.fn(),
    cancel: vi.fn(),
    clearDone: vi.fn()
  },
  on: vi.fn().mockReturnValue(() => {})
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as { api: typeof mockApi }).api = mockApi
  mockApi.jobs.list.mockResolvedValue({ items: [], total: 0 })
})

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: overrides.id ?? `j-${Math.random()}`,
    kind: overrides.kind ?? 'index-retry',
    payload: overrides.payload ?? { path: 'a.md' },
    status: overrides.status ?? 'pending',
    attempts: overrides.attempts ?? 0,
    nextRunAt: overrides.nextRunAt ?? '2026-05-03T10:00:00.000Z',
    lastError: overrides.lastError ?? null,
    createdAt: '2026-05-03T10:00:00.000Z',
    updatedAt: '2026-05-03T10:00:00.000Z'
  }
}

function renderTab() {
  return render(
    <I18nextProvider i18n={i18n}>
      <JobsTab />
    </I18nextProvider>
  )
}

describe('JobsTab — default load', () => {
  it('on mount, queries jobs.list for pending + running + failed (3 calls)', async () => {
    renderTab()
    await waitFor(() => expect(mockApi.jobs.list).toHaveBeenCalledTimes(3))
    const statuses = mockApi.jobs.list.mock.calls.map(([f]) => (f as { status?: string }).status)
    expect(statuses.sort()).toEqual(['failed', 'pending', 'running'])
  })

  it('shows "没有待办任务" when all three lists are empty', async () => {
    renderTab()
    expect(await screen.findByText(/没有待办任务/)).toBeInTheDocument()
  })

  it('renders rows for jobs returned across the three default statuses', async () => {
    mockApi.jobs.list.mockImplementation((f: { status?: string }) => {
      if (f.status === 'pending')
        return Promise.resolve({ items: [job({ id: 'p', status: 'pending' })], total: 1 })
      if (f.status === 'running')
        return Promise.resolve({ items: [job({ id: 'r', status: 'running' })], total: 1 })
      if (f.status === 'failed')
        return Promise.resolve({ items: [job({ id: 'f', status: 'failed', lastError: 'EIO' })], total: 1 })
      return Promise.resolve({ items: [], total: 0 })
    })
    renderTab()
    await waitFor(() => {
      expect(screen.getByTestId('job-row-p')).toBeInTheDocument()
      expect(screen.getByTestId('job-row-r')).toBeInTheDocument()
      expect(screen.getByTestId('job-row-f')).toBeInTheDocument()
    })
  })
})

describe('JobsTab — filter changes', () => {
  it('changing status filter to "done" issues a single jobs.list call with status=done', async () => {
    const user = userEvent.setup()
    renderTab()
    await waitFor(() => expect(mockApi.jobs.list).toHaveBeenCalled())
    mockApi.jobs.list.mockClear()
    // Open status select and pick done
    await user.click(screen.getByLabelText(/status|状态/i))
    await user.click(screen.getByRole('option', { name: /done|完成/i }))
    await waitFor(() => {
      expect(mockApi.jobs.list).toHaveBeenCalledTimes(1)
      const arg = mockApi.jobs.list.mock.calls[0][0] as { status?: string }
      expect(arg.status).toBe('done')
    })
  })
})

describe('JobsTab — clearDone confirm flow', () => {
  it('shows confirm dialog and calls clearDone on confirm', async () => {
    const user = userEvent.setup()
    mockApi.jobs.clearDone.mockResolvedValue({ removed: 3 })
    renderTab()
    await waitFor(() => expect(mockApi.jobs.list).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: /清除已完成/ }))
    // Confirm in dialog
    await user.click(screen.getByRole('button', { name: /^确定$/ }))
    await waitFor(() => expect(mockApi.jobs.clearDone).toHaveBeenCalledTimes(1))
  })

  it('cancel in confirm dialog does NOT call clearDone', async () => {
    const user = userEvent.setup()
    renderTab()
    await waitFor(() => expect(mockApi.jobs.list).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: /清除已完成/ }))
    await user.click(screen.getByRole('button', { name: /^取消$/ }))
    expect(mockApi.jobs.clearDone).not.toHaveBeenCalled()
  })
})

describe('JobsTab — live refresh on jobs:changed', () => {
  it('subscribes on mount and re-queries when jobs:changed fires', async () => {
    let handler: ((j: Job) => void) | null = null
    mockApi.on.mockImplementation((channel: string, h: (j: Job) => void) => {
      if (channel === 'jobs:changed') handler = h
      return () => {}
    })
    renderTab()
    await waitFor(() => expect(mockApi.jobs.list).toHaveBeenCalled())
    mockApi.jobs.list.mockClear()
    expect(handler).not.toBeNull()
    handler!(job({ id: 'new', status: 'pending' }))
    await waitFor(() => expect(mockApi.jobs.list).toHaveBeenCalled(), { timeout: 500 })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/components/history/JobsTab.test.tsx`
Expected: FAIL — UI elements not present.

- [ ] **Step 3: Implement `JobsTab.tsx`**

Replace `src/components/history/JobsTab.tsx`:

```tsx
import { useEffect, useMemo, useReducer, useRef, useState, type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ipc } from '@/ipc/client'
import type { Job, JobStatus } from '@shared/job-types'
import { JobRow } from './JobRow'

type StatusFilter = 'default' | 'all' | JobStatus
type KindFilter = 'all' | string

const DEFAULT_STATUSES: JobStatus[] = ['running', 'pending', 'failed']
const KINDS: KindFilter[] = ['all', 'ai-review-clip', 'index-retry']

interface State {
  loading: boolean
  jobs: Job[]
  error: string | null
}

type Action =
  | { type: 'load' }
  | { type: 'loaded'; jobs: Job[] }
  | { type: 'error'; message: string }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'load':
      return { ...state, loading: true, error: null }
    case 'loaded':
      return { loading: false, jobs: action.jobs, error: null }
    case 'error':
      return { ...state, loading: false, error: action.message }
  }
}

async function loadJobs(status: StatusFilter, kind: KindFilter): Promise<Job[]> {
  const kindFilter = kind === 'all' ? {} : { kind }
  if (status === 'default') {
    const results = await Promise.all(
      DEFAULT_STATUSES.map((s) =>
        ipc.jobs.list({ ...kindFilter, status: s, limit: 200, offset: 0 })
      )
    )
    return results.flatMap((r) => r.items)
  }
  if (status === 'all') {
    const r = await ipc.jobs.list({ ...kindFilter, limit: 500, offset: 0 })
    return r.items
  }
  const r = await ipc.jobs.list({ ...kindFilter, status, limit: 500, offset: 0 })
  return r.items
}

export function JobsTab(): JSX.Element {
  const { t } = useTranslation()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('default')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [state, dispatch] = useReducer(reducer, { loading: true, jobs: [], error: null })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const parentRef = useRef<HTMLDivElement>(null)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useMemo(() => {
    return () => {
      dispatch({ type: 'load' })
      loadJobs(statusFilter, kindFilter).then(
        (jobs) => dispatch({ type: 'loaded', jobs }),
        (err: unknown) =>
          dispatch({ type: 'error', message: err instanceof Error ? err.message : String(err) })
      )
    }
  }, [statusFilter, kindFilter])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const off = ipc.on('jobs:changed', () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      refreshTimer.current = setTimeout(refresh, 100)
    })
    return () => {
      off()
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }
  }, [refresh])

  const virtualizer = useVirtualizer({
    count: state.jobs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 5
  })

  async function handleClearDone(): Promise<void> {
    setConfirmOpen(false)
    const r = await ipc.jobs.clearDone()
    // Toast handled by phase-10 toaster pattern; minimal: just refresh.
    void r
    refresh()
  }

  return (
    <div className="flex h-full flex-col" data-testid="jobs-tab">
      <div className="flex items-center gap-2 border-b p-2">
        <label className="flex items-center gap-1 text-sm">
          {t('history.jobs.kindFilterLabel')}
          <select
            aria-label={t('history.jobs.kindFilterLabel') ?? 'kind'}
            className="rounded border px-2 py-1"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k === 'all' ? t('history.jobs.kindAll') : t(`history.jobs.kind.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-sm">
          {t('history.jobs.statusFilterLabel')}
          <select
            aria-label={t('history.jobs.statusFilterLabel') ?? 'status'}
            className="rounded border px-2 py-1"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="default">{t('history.jobs.statusDefault')}</option>
            <option value="all">{t('history.jobs.statusAll')}</option>
            <option value="running">{t('jobs.status.running')}</option>
            <option value="pending">{t('jobs.status.pending')}</option>
            <option value="failed">{t('jobs.status.failed')}</option>
            <option value="done">{t('jobs.status.done')}</option>
            <option value="canceled">{t('jobs.status.canceled')}</option>
          </select>
        </label>
        <span className="ml-auto" />
        <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
          {t('jobs.clearDone')}
        </Button>
      </div>

      {state.jobs.length === 0 && !state.loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {t('history.jobs.empty')}
        </div>
      ) : (
        <div ref={parentRef} className="flex-1 overflow-auto">
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: '100%',
              position: 'relative'
            }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const job = state.jobs[vi.index]
              if (!job) return null
              return (
                <div
                  key={job.id}
                  data-index={vi.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vi.start}px)`,
                    height: 48
                  }}
                >
                  <JobRow job={job} onChanged={refresh} />
                </div>
              )
            })}
          </div>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('jobs.clearDone')}</DialogTitle>
            <DialogDescription>{t('history.jobs.clearDoneConfirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleClearDone}>{t('common.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

> **Note on Dialog primitives:** the file imports from `@/components/ui/dialog` — phase-10 should have shipped this wrapper. If the actual export names differ (`AlertDialog` vs `Dialog`), adapt the imports and component usage to whatever exists.

- [ ] **Step 4: Run the test suite**

Run: `npm test -- src/components/history/JobsTab.test.tsx`
Expected: PASS — empty-state, three default-status calls, filter change, confirm flow, jobs:changed subscription. The "renders rows for jobs" test is gated by Task 6.3 (`JobRow.tsx`) — leave it failing for now and pick it up in Task 3 below.

- [ ] **Step 5: Commit**

```bash
git add src/components/history/JobsTab.tsx src/components/history/JobsTab.test.tsx
git commit -m "feat(history): JobsTab filters + virtualized list + clearDone (phase-14 6.2)"
```

---

<!-- openspec-task: 6.3 -->
### Task 3: `JobRow.tsx` — payload-summary renderer per kind

**Files:**
- Create: `src/components/history/JobRow.tsx`
- Create: `src/components/history/JobRow.test.tsx`

The row layout is fixed at 48 px. Columns (left-to-right): kind icon, payload summary, status badge, attempts, relative `next_run_at`, last_error (failed only), action button.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/history/JobRow.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { I18nextProvider } from 'react-i18next'
import { i18n } from '@/i18n'
import { JobRow } from './JobRow'
import type { Job } from '@shared/job-types'

function row(overrides: Partial<Job> = {}): Job {
  return {
    id: 'j-1',
    kind: 'index-retry',
    payload: { path: 'a.md' },
    status: 'pending',
    attempts: 0,
    nextRunAt: '2026-05-03T10:00:00.000Z',
    lastError: null,
    createdAt: '2026-05-03T10:00:00.000Z',
    updatedAt: '2026-05-03T10:00:00.000Z',
    ...overrides
  }
}

beforeEach(() => {
  ;(window as unknown as { api: unknown }).api = {
    jobs: { retry: vi.fn(), cancel: vi.fn() },
    on: () => () => {}
  }
})

function renderRow(job: Job) {
  return render(
    <I18nextProvider i18n={i18n}>
      <JobRow job={job} onChanged={() => {}} />
    </I18nextProvider>
  )
}

describe('JobRow — payload summary by kind', () => {
  it('index-retry shows "索引重试 · <path>"', () => {
    renderRow(row({ kind: 'index-retry', payload: { path: 'notes/a.md' } }))
    expect(screen.getByText(/索引重试.*notes\/a\.md/)).toBeInTheDocument()
  })

  it('ai-review-clip shows "AI 审读 · clip:<id>" by default', () => {
    renderRow(row({ kind: 'ai-review-clip', payload: { clipId: 42 } }))
    expect(screen.getByText(/AI 审读.*clip:42/)).toBeInTheDocument()
  })

  it('unknown kind falls back to "<kind> · <stringified payload prefix>"', () => {
    renderRow(row({ kind: 'foo-bar' as unknown as 'index-retry', payload: { x: 1 } }))
    expect(screen.getByText(/foo-bar/)).toBeInTheDocument()
    expect(screen.getByText(/{.*"x":1.*}/)).toBeInTheDocument()
  })

  it('shows status badge with i18n label', () => {
    renderRow(row({ status: 'failed', lastError: 'EIO' }))
    expect(screen.getByText(/失败|failed/i)).toBeInTheDocument()
  })

  it('failed row shows lastError in red, truncated to 60 chars', () => {
    const long = 'x'.repeat(100)
    renderRow(row({ status: 'failed', lastError: long }))
    const errEl = screen.getByText(new RegExp(long.slice(0, 60).replace(/(.)/g, '$1?')))
    expect(errEl).toHaveClass(/red|destructive|text-red/i.source) // tailwind class can vary
  })

  it('shows attempts count', () => {
    renderRow(row({ attempts: 3 }))
    expect(screen.getByText(/3/)).toBeInTheDocument()
  })

  it('does not render lastError block when status !== failed', () => {
    renderRow(row({ status: 'pending', lastError: null }))
    expect(screen.queryByTestId('job-row-error')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/components/history/JobRow.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `JobRow.tsx`**

```tsx
import { useTranslation } from 'react-i18next'
import { useState, type JSX } from 'react'
import { Button } from '@/components/ui/button'
import { ipc } from '@/ipc/client'
import type { Job } from '@shared/job-types'

interface Props {
  job: Job
  onChanged: () => void
}

function summary(job: Job, t: (key: string) => string): string {
  const p = job.payload as { path?: unknown; clipId?: unknown; clipTitle?: unknown }
  if (job.kind === 'index-retry' && typeof p.path === 'string') {
    return `${t('history.jobs.summary.indexRetry')} · ${p.path}`
  }
  if (job.kind === 'ai-review-clip') {
    const title = typeof p.clipTitle === 'string' ? p.clipTitle : null
    const id = typeof p.clipId === 'number' ? `clip:${p.clipId}` : ''
    return `${t('history.jobs.summary.aiReview')} · ${title ?? id}`
  }
  const blob = JSON.stringify(job.payload)
  return `${job.kind} · ${blob.slice(0, 60)}`
}

function relTime(iso: string): string {
  const ms = Date.parse(iso) - Date.now()
  const min = Math.round(ms / 60_000)
  if (Math.abs(min) < 1) return 'now'
  if (Math.abs(min) < 60) return `${min}m`
  const h = Math.round(min / 60)
  return `${h}h`
}

export function JobRow({ job, onChanged }: Props): JSX.Element {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  async function onRetry(): Promise<void> {
    setBusy(true)
    try {
      await ipc.jobs.retry(job.id)
    } finally {
      setBusy(false)
      onChanged()
    }
  }

  async function onCancel(): Promise<void> {
    setBusy(true)
    try {
      await ipc.jobs.cancel(job.id)
    } finally {
      setBusy(false)
      onChanged()
    }
  }

  return (
    <div
      data-testid={`job-row-${job.id}`}
      className="flex h-12 items-center gap-3 border-b px-3 text-sm"
    >
      <span className="flex-1 truncate">{summary(job, t)}</span>
      <span className="rounded bg-muted px-2 py-0.5 text-xs">
        {t(`jobs.status.${job.status}`)}
      </span>
      <span className="w-8 text-right text-xs text-muted-foreground" title="attempts">
        {job.attempts}
      </span>
      <span className="w-12 text-right text-xs text-muted-foreground" title={job.nextRunAt}>
        {relTime(job.nextRunAt)}
      </span>
      {job.status === 'failed' && job.lastError ? (
        <span
          data-testid="job-row-error"
          className="max-w-[220px] truncate text-xs text-destructive"
          title={job.lastError}
        >
          {job.lastError.slice(0, 60)}
        </span>
      ) : null}
      {job.status === 'failed' ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={onRetry}>
          {t('jobs.action.retry')}
        </Button>
      ) : job.status === 'running' || job.status === 'pending' ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={onCancel}>
          {t('jobs.action.cancel')}
        </Button>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/components/history/JobRow.test.tsx src/components/history/JobsTab.test.tsx`
Expected: PASS — all row + tab tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/history/JobRow.tsx src/components/history/JobRow.test.tsx
git commit -m "feat(history): JobRow payload-summary + status badge (phase-14 6.3)"
```

---

<!-- openspec-task: 6.4 -->
### Task 4: Row buttons — retry / cancel wired through IPC + jobs:changed refresh

**Files:**
- Modify: `src/components/history/JobRow.test.tsx`

`JobRow.tsx` already calls `ipc.jobs.retry(id)` / `ipc.jobs.cancel(id)` and triggers `onChanged()` — Task 6.2 + 6.3 implemented this. This task is **verification**: add explicit interaction tests proving the wiring.

- [ ] **Step 1: Append failing tests**

```tsx
// append to src/components/history/JobRow.test.tsx
import userEvent from '@testing-library/user-event'

describe('JobRow — actions', () => {
  it('failed row → click 重试 calls jobs.retry and onChanged', async () => {
    const user = userEvent.setup()
    const retry = vi.fn().mockResolvedValue({ ok: true })
    ;(window as unknown as { api: unknown }).api = { jobs: { retry, cancel: vi.fn() } }
    const onChanged = vi.fn()
    render(
      <I18nextProvider i18n={i18n}>
        <JobRow job={row({ id: 'f', status: 'failed', lastError: 'EIO' })} onChanged={onChanged} />
      </I18nextProvider>
    )
    await user.click(screen.getByRole('button', { name: /重试|retry/i }))
    expect(retry).toHaveBeenCalledWith('f')
    expect(onChanged).toHaveBeenCalled()
  })

  it('running row → click 取消 calls jobs.cancel and onChanged', async () => {
    const user = userEvent.setup()
    const cancel = vi.fn().mockResolvedValue({ ok: true })
    ;(window as unknown as { api: unknown }).api = { jobs: { retry: vi.fn(), cancel } }
    const onChanged = vi.fn()
    render(
      <I18nextProvider i18n={i18n}>
        <JobRow job={row({ id: 'r', status: 'running' })} onChanged={onChanged} />
      </I18nextProvider>
    )
    await user.click(screen.getByRole('button', { name: /取消|cancel/i }))
    expect(cancel).toHaveBeenCalledWith('r')
    expect(onChanged).toHaveBeenCalled()
  })

  it('pending row → click 取消 calls jobs.cancel', async () => {
    const user = userEvent.setup()
    const cancel = vi.fn().mockResolvedValue({ ok: true })
    ;(window as unknown as { api: unknown }).api = { jobs: { retry: vi.fn(), cancel } }
    render(
      <I18nextProvider i18n={i18n}>
        <JobRow job={row({ id: 'p', status: 'pending' })} onChanged={() => {}} />
      </I18nextProvider>
    )
    await user.click(screen.getByRole('button', { name: /取消|cancel/i }))
    expect(cancel).toHaveBeenCalledWith('p')
  })

  it('done / canceled rows show no action buttons', () => {
    ;(window as unknown as { api: unknown }).api = { jobs: { retry: vi.fn(), cancel: vi.fn() } }
    render(
      <I18nextProvider i18n={i18n}>
        <JobRow job={row({ status: 'done' })} onChanged={() => {}} />
      </I18nextProvider>
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npm test -- src/components/history/JobRow.test.tsx`
Expected: PASS — all interaction tests green (the implementation already supports this).

- [ ] **Step 3: Commit**

```bash
git add src/components/history/JobRow.test.tsx
git commit -m "test(history): JobRow retry/cancel interaction coverage (phase-14 6.4)"
```

---

<!-- openspec-task: 6.5 -->
### Task 5: Empty state — "没有待办任务" when filter result is 0

**Files:**
- Modify: `src/components/history/JobsTab.test.tsx`

`JobsTab.tsx` already shows the empty text (Task 6.2). This task adds an explicit test that the empty state is consistent across filter changes — to lock the behaviour against regressions in Plan 4.

- [ ] **Step 1: Append failing test**

```tsx
describe('JobsTab — empty state per filter', () => {
  it('shows empty text for default filter when nothing matches', async () => {
    renderTab()
    expect(await screen.findByText(/没有待办任务/)).toBeInTheDocument()
  })

  it('shows empty text after switching to "done" filter when no done jobs exist', async () => {
    const user = userEvent.setup()
    renderTab()
    await waitFor(() => expect(mockApi.jobs.list).toHaveBeenCalled())
    await user.click(screen.getByLabelText(/status|状态/i))
    await user.click(screen.getByRole('option', { name: /done|完成/i }))
    expect(await screen.findByText(/没有待办任务/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npm test -- src/components/history/JobsTab.test.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/history/JobsTab.test.tsx
git commit -m "test(history): JobsTab empty state coverage (phase-14 6.5)"
```

---

<!-- openspec-task: 7.1 -->
### Task 6: Pipeline rewire — `clipQueue.enqueue` → `jobs.enqueue('ai-review-clip', …, { dedupeKey: 'clip:' + clipId })`

**Files:**
- Modify: `electron/clipper/pipeline.ts`
- Modify: `electron/clipper/pipeline.test.ts`

- [ ] **Step 1: Locate the existing call**

```bash
grep -n "clipQueue\.enqueue\|clipQueue\b" electron/clipper/
```

Expected: one or two hits in `electron/clipper/pipeline.ts`.

- [ ] **Step 2: Modify the failing test first**

In `electron/clipper/pipeline.test.ts` (or wherever phase-12 verifies the enqueue placeholder):

```ts
import { getQueueBootstrap } from '../queue'

it('enqueues ai-review-clip with dedupeKey clip:<id> after successful save', async () => {
  // ... existing pipeline setup that completes a clip with id=42 ...
  const result = await pipeline.run(/* ... */)
  expect(result.ok).toBe(true)
  const store = getQueueBootstrap()!.store
  const list = store.list({ kind: 'ai-review-clip', limit: 50, offset: 0 })
  expect(list.total).toBe(1)
  expect(list.items[0].payload).toMatchObject({ clipId: 42 })
})

it('dedupe: re-running the pipeline for the same clipId reuses the same job id', async () => {
  // ... run pipeline twice with the same URL, simulating "re-clip" ...
  const store = getQueueBootstrap()!.store
  const list = store.list({ kind: 'ai-review-clip', limit: 50, offset: 0 })
  expect(list.total).toBe(1) // only one row
})
```

- [ ] **Step 3: Replace the call site**

In `electron/clipper/pipeline.ts`, find:

```ts
clipQueue.enqueue({ clipId, url, path })
```

Replace with:

```ts
const queue = getQueueBootstrap()
if (queue) {
  queue.store.enqueue(
    'ai-review-clip',
    { clipId, path },
    { dedupeKey: `clip:${clipId}` }
  )
} else {
  // queue not initialised — log and continue; user can manually retry from /history/jobs in phase-18
  logger.warn('queue bootstrap unavailable; ai-review-clip not enqueued', { clipId })
}
```

Add the import:

```ts
import { getQueueBootstrap } from '../queue'
import { logger } from '../services/logger'
```

Remove the old `import { clipQueue } from './clipQueue'` (or wherever it lived).

> **Note on enqueue failures:** the design says enqueue failure MUST NOT roll back the clip write. `store.enqueue` only throws on programmer errors (invalid args); SQLite write failures throw `SqliteError`. Wrap the call:
>
> ```ts
> try {
>   queue.store.enqueue(/* ... */)
> } catch (e) {
>   const msg = e instanceof Error ? e.message : String(e)
>   logger.error('ai-review-clip enqueue failed; clip already saved', { clipId, error: msg })
>   // also write ops_log op='enqueue.failed' if phase-10 opsLog is in scope
> }
> ```

- [ ] **Step 4: Run pipeline tests**

Run: `npm test -- electron/clipper/`
Expected: PASS — the rewritten assertions go green.

- [ ] **Step 5: Commit**

```bash
git add electron/clipper/pipeline.ts electron/clipper/pipeline.test.ts
git commit -m "feat(clipper): pipeline calls jobs.enqueue('ai-review-clip', ...) (phase-14 7.1)"
```

---

<!-- openspec-task: 7.2 -->
### Task 7: Delete the no-op `clipQueue` placeholder module

**Files:**
- Delete: `electron/clipper/clipQueue.ts` (path may differ; check Task 7.1 grep output)
- Delete: `electron/clipper/clipQueue.test.ts` (if any)

- [ ] **Step 1: Verify no remaining references**

```bash
grep -rn "clipQueue\b" electron/ src/
```

Expected: no matches (Task 7.1 should have removed the only consumer).

- [ ] **Step 2: Delete**

```bash
git rm electron/clipper/clipQueue.ts
# also delete its test file if it existed:
git rm electron/clipper/clipQueue.test.ts 2>/dev/null || true
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — nothing depended on the deleted module.

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(clipper): drop clipQueue placeholder (phase-14 7.2)"
```

---

<!-- openspec-task: 8.1 -->
### Task 8: Indexer rewire — `upsertFromFs` failure → `jobs.enqueue('index-retry', …)`; ENOENT → delete row

**Files:**
- Modify: `electron/services/indexer.ts`
- Modify: `electron/services/indexer.test.ts`

- [ ] **Step 1: Locate the existing failure path**

```bash
grep -n "upsertFromFs\|setTimeout\|ENOENT\|catch" electron/services/indexer.ts | head
```

Find the catch block around `upsertFromFs`.

- [ ] **Step 2: Append failing tests**

```ts
// electron/services/indexer.test.ts
import { getQueueBootstrap } from '../queue'

describe('indexer upsertFromFs failure handling — phase-14', () => {
  it('on EIO: enqueues index-retry with dedupeKey idx:<path>', async () => {
    // arrange: mock fs.readFile to throw EIO once
    // ...
    await expectUpsertToHandleError() // your existing helper
    const store = getQueueBootstrap()!.store
    const list = store.list({ kind: 'index-retry', limit: 50, offset: 0 })
    expect(list.total).toBe(1)
    expect(list.items[0].payload).toMatchObject({ path: 'a.md' })
  })

  it('on ENOENT: deletes the files row, does NOT enqueue', async () => {
    // arrange: mock fs.readFile to throw ENOENT
    // pre-seed a files row at path 'gone.md'
    // ...
    await expectUpsertToHandleError()
    const store = getQueueBootstrap()!.store
    const list = store.list({ kind: 'index-retry', limit: 50, offset: 0 })
    expect(list.total).toBe(0) // not enqueued
    // verify the files row is gone
    const row = db.prepare('SELECT * FROM files WHERE path=?').get('gone.md')
    expect(row).toBeUndefined()
  })

  it('dedupe: two consecutive failures for the same path produce one job', async () => {
    // ...
    const store = getQueueBootstrap()!.store
    expect(store.list({ kind: 'index-retry', limit: 50, offset: 0 }).total).toBe(1)
  })
})
```

> **Note on test wiring:** the existing indexer tests likely use a temp grove. Make sure `bootstrapQueueRunner(db)` is called in your test setup so `getQueueBootstrap()` returns a usable store. If isolation between tests is an issue, expose `__resetBootstrap()` on `electron/queue/index.ts` and call it in `beforeEach`.

- [ ] **Step 3: Modify the indexer**

In `electron/services/indexer.ts`, replace the `setTimeout` retry block with:

```ts
import { getQueueBootstrap } from '../queue'

  try {
    await upsertCore(path) // existing implementation
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code
    if (code === 'ENOENT') {
      try {
        deleteFromIndex(path) // calls index-queries.ts deleteFile / equivalent
      } catch (delErr) {
        logger.warn('index: failed to delete row on ENOENT', { path, error: String(delErr) })
      }
      return
    }
    const queue = getQueueBootstrap()
    const reason = e instanceof Error ? e.message : String(e)
    if (queue) {
      try {
        queue.store.enqueue(
          'index-retry',
          { path, reason },
          { dedupeKey: `idx:${path}` }
        )
      } catch (enqErr) {
        logger.error('index: enqueue index-retry failed', { path, error: String(enqErr) })
      }
    } else {
      logger.warn('index: queue not initialised; dropping retry', { path, reason })
    }
  }
```

> Adapt `deleteFromIndex(path)` to whatever phase-5 exposes (`indexQueries.deleteFile(path)`, `removePath(path)`, etc.). Confirm via:
> ```bash
> grep -n "export function delete\|export.*deleteFile\|export.*removePath" electron/services/index-queries.ts
> ```

- [ ] **Step 4: Run tests**

Run: `npm test -- electron/services/indexer.test.ts`
Expected: PASS — all three new cases green.

- [ ] **Step 5: Commit**

```bash
git add electron/services/indexer.ts electron/services/indexer.test.ts
git commit -m "feat(indexer): enqueue index-retry on transient errs; delete row on ENOENT (phase-14 8.1)"
```

---

<!-- openspec-task: 8.2 -->
### Task 9: Remove scattered `setTimeout` self-retries from the indexer

**Files:**
- Modify: `electron/services/indexer.ts`
- Modify: `electron/services/indexer.test.ts`
- Possibly: `electron/services/watcher.ts` (if phase-5 also self-retried there)

- [ ] **Step 1: Search for stragglers**

```bash
grep -n "setTimeout\|retry" electron/services/indexer.ts electron/services/watcher.ts
```

For each match, decide:
- Is this part of a `chokidar` event-debounce? **Keep.** (phase-5 typically debounces add/change events.)
- Is this a "wait then call upsertFromFs again on error"? **Remove** — Task 8.1's enqueue replaces it.

- [ ] **Step 2: Delete the dead retry code**

For each "wait then retry" block, delete it. Don't try to "preserve behaviour" — the queue is the new authoritative retry loop.

- [ ] **Step 3: Update tests**

Search the indexer test file for assertions about `setTimeout` / fake-timer-based retry counts. Replace them with assertions about the queue:

```ts
// before:
//   await vi.advanceTimersByTimeAsync(3_000)
//   expect(upsertCore).toHaveBeenCalledTimes(3)
// after:
//   expect(getQueueBootstrap()!.store.list({ kind: 'index-retry', limit: 50, offset: 0 }).total).toBe(1)
```

- [ ] **Step 4: Run tests**

Run: `npm test -- electron/services/`
Expected: PASS — all indexer + watcher tests green; no orphaned fake-timer calls.

- [ ] **Step 5: Commit**

```bash
git add electron/services/indexer.ts electron/services/indexer.test.ts electron/services/watcher.ts electron/services/watcher.test.ts
git commit -m "refactor(indexer): drop setTimeout self-retry (queue handles it now) (phase-14 8.2)"
```

---

<!-- openspec-task: 9.1 -->
### Task 10: i18n keys — `history.jobs.*`, `jobs.status.*`, `jobs.action.*`, `jobs.clearDone`

**Files:**
- Modify: `src/i18n/locales/zh-CN.json`
- Create: `src/i18n/phase-14.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/i18n/phase-14.test.ts
import { describe, it, expect } from 'vitest'
import zh from './locales/zh-CN.json'

const REQUIRED_KEYS = [
  'history.jobs.tabLabel',
  'history.jobs.empty',
  'history.jobs.kindFilterLabel',
  'history.jobs.statusFilterLabel',
  'history.jobs.statusDefault',
  'history.jobs.statusAll',
  'history.jobs.kindAll',
  'history.jobs.kind.ai-review-clip',
  'history.jobs.kind.index-retry',
  'history.jobs.summary.aiReview',
  'history.jobs.summary.indexRetry',
  'history.jobs.clearDoneConfirm',
  'jobs.status.pending',
  'jobs.status.running',
  'jobs.status.done',
  'jobs.status.failed',
  'jobs.status.canceled',
  'jobs.action.retry',
  'jobs.action.cancel',
  'jobs.clearDone'
]

function get(obj: Record<string, unknown>, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((acc, k) => {
    if (acc && typeof acc === 'object' && k in (acc as object)) {
      return (acc as Record<string, unknown>)[k]
    }
    return undefined
  }, obj)
}

describe('phase-14 i18n keys', () => {
  it.each(REQUIRED_KEYS)('zh-CN has key %s', (key) => {
    const v = get(zh as Record<string, unknown>, key)
    expect(typeof v).toBe('string')
    expect((v as string).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/i18n/phase-14.test.ts`
Expected: FAIL — keys missing.

- [ ] **Step 3: Add the keys**

Modify `src/i18n/locales/zh-CN.json`. Add (or merge into existing nested structure) the following:

```json
{
  "history": {
    "jobs": {
      "tabLabel": "任务",
      "empty": "没有待办任务",
      "kindFilterLabel": "类型",
      "statusFilterLabel": "状态",
      "statusDefault": "进行中（默认）",
      "statusAll": "全部",
      "kindAll": "全部类型",
      "kind": {
        "ai-review-clip": "AI 审读",
        "index-retry": "索引重试"
      },
      "summary": {
        "aiReview": "AI 审读",
        "indexRetry": "索引重试"
      },
      "clearDoneConfirm": "确认清除所有已完成的任务？已失败的任务会保留。"
    }
  },
  "jobs": {
    "status": {
      "pending": "等待中",
      "running": "进行中",
      "done": "已完成",
      "failed": "失败",
      "canceled": "已取消"
    },
    "action": {
      "retry": "重试",
      "cancel": "取消"
    },
    "clearDone": "清除已完成"
  }
}
```

> **Caution:** `zh-CN.json` already has top-level `history`, `common`, etc. Merge into the existing `history` node — don't replace it. If your editor lacks JSON-merge support, do it manually and re-run `npm run format` afterward.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/i18n/phase-14.test.ts`
Expected: PASS — all 20 keys present.

Run: `npm test -- src/components/history/`
Expected: PASS — JobsTab + JobRow tests now find their translations.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/locales/zh-CN.json src/i18n/phase-14.test.ts
git commit -m "feat(i18n): phase-14 jobs UI keys (phase-14 9.1)"
```

---

## Self-Review Checklist (before handing off to Plan 4)

- [ ] `/history/jobs` URL renders the JobsTab; existing tabs still work.
- [ ] Default filter shows running + pending + failed; switching to "done" or "canceled" still loads correctly.
- [ ] `JobRow` shows the right action button per status: `failed → 重试`, `running/pending → 取消`, others → no button.
- [ ] `payload.path` / `payload.clipId` reach the right summary string in `JobRow.summary()`.
- [ ] After `jobs.clearDone()`, the list reloads and shows zero done rows; failed rows stay.
- [ ] Phase-12 pipeline test "occupies the row in jobs after successful save" passes; the `clipQueue` module no longer exists.
- [ ] Indexer tests: ENOENT → row deleted (no enqueue); EIO → one index-retry row with `dedupeKey='idx:<path>'`.
- [ ] No `setTimeout` references remain in the indexer for "wait-then-retry" purposes.
- [ ] All i18n keys listed in `REQUIRED_KEYS` resolve to non-empty zh-CN strings.
- [ ] Every Task heading is preceded by `<!-- openspec-task: LABEL -->` matching tasks.md labels: `6.1`, `6.2`, `6.3`, `6.4`, `6.5`, `7.1`, `7.2`, `8.1`, `8.2`, `9.1`.

Plan 4 (`tasks-10.1-10.14`) runs the end-to-end acceptance suite proving each spec scenario from design.md.
