// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { i18n } from '@/i18n'

// Polyfill ResizeObserver for react-resizable-panels in HistoryLayout
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// ── IPC mock (matches History.test.tsx comprehensive pattern — all tabs are forceMount) ──
vi.mock('@/ipc/client', () => ({
  ipc: {
    trash: {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
      deleteAll: vi.fn().mockResolvedValue({ ok: true, deleted: 1 }),
      restore: vi.fn().mockResolvedValue({ ok: true }),
      batchRestore: vi.fn().mockResolvedValue({ ok: true, restored: 0 }),
      batchDelete: vi.fn().mockResolvedValue({ ok: true, deleted: 0 })
    },
    conflict: {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      read: vi.fn().mockResolvedValue({
        meta: { path: '', ts: '', resolved_by: 'keep_local' },
        localText: '',
        remoteText: '',
        baseText: ''
      }),
      diff: vi.fn().mockResolvedValue({
        left: { label: 'local', lines: [] },
        right: { label: 'remote', lines: [] },
        stats: { added: 0, removed: 0 }
      }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
      deleteAll: vi.fn().mockResolvedValue({ ok: true, deleted: 1 }),
      openSnapshotFile: vi.fn().mockResolvedValue({ ok: true })
    },
    ops: {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 })
    },
    jobs: {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      retry: vi.fn().mockResolvedValue({ ok: true }),
      cancel: vi.fn().mockResolvedValue({ ok: true }),
      clearDone: vi.fn().mockResolvedValue({ removed: 0 })
    },
    file: {
      openContainingDir: vi.fn().mockResolvedValue({ ok: true })
    },
    on: vi.fn(() => () => {})
  }
}))

import { ipc } from '@/ipc/client'
import History from '@/pages/History'
import type { Job } from '@shared/job-types'

// ── helpers ──

const ipcMock = ipc as unknown as {
  jobs: {
    list: ReturnType<typeof vi.fn>
    retry: ReturnType<typeof vi.fn>
    cancel: ReturnType<typeof vi.fn>
    clearDone: ReturnType<typeof vi.fn>
  }
  on: ReturnType<typeof vi.fn>
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: overrides.id ?? 'j-test',
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

function renderAtTab(tab: string) {
  return render(
    <MemoryRouter initialEntries={[`/history/${tab}`]}>
      <Routes>
        <Route path="/history/:tab" element={<History />} />
      </Routes>
    </MemoryRouter>
  )
}

// ── suites ──

describe('Acceptance 10.1 — /history/jobs route + default filter', () => {
  beforeEach(async () => {
    if (!i18n.isInitialized) {
      await i18n.init()
    }
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('navigating to /history/jobs renders the JobsTab', async () => {
    renderAtTab('jobs')

    await waitFor(() => {
      expect(screen.getByTestId('jobs-tab')).toBeTruthy()
    })
  })

  it('default filter loads jobs.list with pending / running / failed', async () => {
    renderAtTab('jobs')

    await waitFor(() => expect(ipcMock.jobs.list).toHaveBeenCalled())

    const statuses: string[] = []
    for (const call of ipcMock.jobs.list.mock.calls) {
      const filter = call[0] as { status?: string }
      if (filter?.status) statuses.push(filter.status)
    }
    // Verify the three default statuses are called
    expect(statuses).toContain('pending')
    expect(statuses).toContain('running')
    expect(statuses).toContain('failed')
  })
})

describe('Acceptance 10.6 — cancel pending hides from default view', () => {
  beforeEach(async () => {
    if (!i18n.isInitialized) {
      await i18n.init()
    }
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('clicks cancel on a pending row and calls jobs.cancel', async () => {
    const user = userEvent.setup()
    const pendingJob = makeJob({ id: 'p1', status: 'pending', payload: { path: 'a.md' } })

    ipcMock.jobs.list.mockImplementation((filter: { status?: string }) => {
      if (filter?.status === 'pending') {
        return Promise.resolve({ items: [pendingJob], total: 1 })
      }
      return Promise.resolve({ items: [], total: 0 })
    })

    renderAtTab('jobs')

    // Wait for the pending row to appear
    await waitFor(() => {
      expect(screen.getByTestId('job-row')).toBeTruthy()
    })

    // Find and click the cancel button (aria-label="取消")
    const cancelBtn = screen.getByRole('button', { name: /取消/i })
    expect(cancelBtn).toBeTruthy()
    await user.click(cancelBtn)

    // Verify cancel was called with the correct job id
    await waitFor(() => {
      expect(ipcMock.jobs.cancel).toHaveBeenCalledWith('p1')
    })
  })
})

describe('Acceptance 10.13 — jobs:changed → list refreshes', () => {
  let jobsChangedHandler: (() => void) | null = null

  beforeEach(async () => {
    if (!i18n.isInitialized) {
      await i18n.init()
    }
    vi.clearAllMocks()
    jobsChangedHandler = null

    // Override the on mock to capture the jobs:changed handler
    ipcMock.on.mockImplementation((channel: string, handler: () => void) => {
      if (channel === 'jobs:changed') {
        jobsChangedHandler = handler
      }
      return () => {}
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('emitting jobs:changed triggers a re-fetch and the new row appears', async () => {
    let returnedItems: Job[] = []

    ipcMock.jobs.list.mockImplementation(async (filter: { status?: string }) => {
      if (filter?.status === 'pending') {
        return { items: returnedItems, total: returnedItems.length }
      }
      return { items: [], total: 0 }
    })

    renderAtTab('jobs')

    // Wait for initial fetch to complete
    await waitFor(() => expect(ipcMock.jobs.list).toHaveBeenCalled())

    // Verify subscription was set up
    expect(jobsChangedHandler).toBeTruthy()

    // Initially the list is empty — no job row should be present
    expect(screen.queryByTestId('job-row')).toBeNull()

    // Now push a new job and fire the change event
    returnedItems = [
      makeJob({
        id: 'live',
        kind: 'index-retry',
        payload: { path: 'live.md' },
        status: 'pending'
      })
    ]

    jobsChangedHandler!()

    // Wait for the 100ms debounce + re-fetch + render
    await waitFor(
      () => {
        expect(screen.getByTestId('job-row')).toBeTruthy()
      },
      { timeout: 2000 }
    )

    // Verify the new row content is visible
    expect(screen.getByText('live.md')).toBeTruthy()
  })
})
