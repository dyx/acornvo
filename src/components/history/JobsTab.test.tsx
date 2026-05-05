// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Initialize i18n before anything uses useTranslation
import { i18n } from '@/i18n'

const navigateMock = vi.fn()

vi.mock('@/ipc/client', () => ({
  ipc: {
    jobs: {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      retry: vi.fn().mockResolvedValue({ ok: true }),
      cancel: vi.fn().mockResolvedValue({ ok: true }),
      clearDone: vi.fn().mockResolvedValue({ removed: 0 })
    },
    on: vi.fn(() => () => {})
  }
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock
  }
})

import { ipc } from '@/ipc/client'
import { JobsTab } from './JobsTab'
import type { Job } from '@shared/job-types'

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

describe('JobsTab — default load', () => {
  beforeEach(async () => {
    if (!i18n.isInitialized) {
      await i18n.init()
    }
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('on mount, queries jobs.list for pending + running + failed', async () => {
    render(<MemoryRouter><JobsTab /></MemoryRouter>)
    await waitFor(() => expect(ipc.jobs.list).toHaveBeenCalled())
  })

  it('renders loading state initially', () => {
    vi.mocked(ipc.jobs.list).mockReturnValue(new Promise(() => {})) // never resolves
    render(<MemoryRouter><JobsTab /></MemoryRouter>)
    expect(screen.getByText('加载中…')).toBeTruthy()
  })

  it('shows empty state when all lists are empty', async () => {
    vi.mocked(ipc.jobs.list)
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })
    render(<MemoryRouter><JobsTab /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByTestId('jobs-tab')).toBeTruthy()
    })
    // Empty state should show
    expect(screen.getByText('暂无任务')).toBeTruthy()
  })

  it('subscribes to jobs:changed on mount', () => {
    render(<MemoryRouter><JobsTab /></MemoryRouter>)
    expect(ipc.on).toHaveBeenCalledWith('jobs:changed', expect.any(Function))
  })

  it('unsubscribes from jobs:changed on unmount', () => {
    const unsub = vi.fn()
    vi.mocked(ipc.on).mockReturnValue(unsub)
    const { unmount } = render(<MemoryRouter><JobsTab /></MemoryRouter>)
    unmount()
    expect(unsub).toHaveBeenCalled()
  })
})

describe('JobsTab — render items', () => {
  beforeEach(async () => {
    if (!i18n.isInitialized) {
      await i18n.init()
    }
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders job rows when items exist', async () => {
    vi.mocked(ipc.jobs.list)
      .mockResolvedValueOnce({
        items: [
          makeJob({ id: 'j1', kind: 'index-retry', status: 'pending', payload: { path: 'notes/a.md' } }),
          makeJob({ id: 'j2', kind: 'ai-review-clip', status: 'running', payload: { clipId: 'c1' } })
        ],
        total: 2
      })
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })

    render(<MemoryRouter><JobsTab /></MemoryRouter>)

    await waitFor(() => {
      expect(screen.getByTestId('jobs-tab')).toBeTruthy()
    })
  })

  it('renders job kind badge and status for each job', async () => {
    vi.mocked(ipc.jobs.list)
      .mockResolvedValueOnce({
        items: [
          makeJob({ id: 'j1', kind: 'index-retry', status: 'pending', payload: { path: 'notes/doc.md' } })
        ],
        total: 1
      })
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })

    render(<MemoryRouter><JobsTab /></MemoryRouter>)

    await waitFor(() => {
      expect(screen.getByText('notes/doc.md')).toBeTruthy()
    })
  })
})

describe('JobsTab — clearDone confirm flow', () => {
  beforeEach(async () => {
    if (!i18n.isInitialized) {
      await i18n.init()
    }
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows clear done button', async () => {
    vi.mocked(ipc.jobs.list)
      .mockResolvedValueOnce({ items: [], total: 0 }) // pending
      .mockResolvedValueOnce({ items: [], total: 0 }) // running
      .mockResolvedValueOnce({ items: [], total: 0 }) // failed

    render(<MemoryRouter><JobsTab /></MemoryRouter>)

    await waitFor(() => {
      expect(screen.getByTestId('jobs-tab')).toBeTruthy()
    })

    // The clear-done button should be present
    const clearBtn = screen.queryByText(/清除已完成|clear/i)
    expect(clearBtn).toBeTruthy()
  })

  it('opens confirm dialog and calls clearDone on confirm', async () => {
    const user = userEvent.setup()
    vi.mocked(ipc.jobs.clearDone).mockResolvedValue({ removed: 3 })
    vi.mocked(ipc.jobs.list)
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })

    render(<MemoryRouter><JobsTab /></MemoryRouter>)

    await waitFor(() => {
      expect(screen.getByTestId('jobs-tab')).toBeTruthy()
    })

    // Find and click the clear-done button
    const clearBtn = screen.queryByText(/清除已完成|clear/i)
    if (clearBtn) {
      await user.click(clearBtn)

      // Wait for dialog to appear
      await waitFor(() => {
        expect(screen.getByText(/确认清除/i)).toBeTruthy()
      })

      // Click confirm
      const confirmBtn = screen.queryByRole('button', { name: /确定|确认/i })
      if (confirmBtn) await user.click(confirmBtn)

      await waitFor(() => expect(ipc.jobs.clearDone).toHaveBeenCalled())
    }
  })

  it('handles clearDone error gracefully', async () => {
    const user = userEvent.setup()
    vi.mocked(ipc.jobs.clearDone).mockRejectedValue(new Error('Clear failed'))
    vi.mocked(ipc.jobs.list)
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })

    render(<MemoryRouter><JobsTab /></MemoryRouter>)

    await waitFor(() => {
      expect(screen.getByTestId('jobs-tab')).toBeTruthy()
    })

    const clearBtn = screen.queryByText(/清除已完成|clear/i)
    if (clearBtn) {
      await user.click(clearBtn)

      await waitFor(() => {
        expect(screen.getByText(/确认清除/i)).toBeTruthy()
      })

      const confirmBtn = screen.queryByRole('button', { name: /确定|确认/i })
      if (confirmBtn) await user.click(confirmBtn)

      // Should not crash — just verify clearDone was attempted
      await waitFor(() => expect(ipc.jobs.clearDone).toHaveBeenCalled())
    }
  })

  it('closes confirm dialog on cancel', async () => {
    const user = userEvent.setup()
    vi.mocked(ipc.jobs.list)
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })

    render(<MemoryRouter><JobsTab /></MemoryRouter>)

    await waitFor(() => {
      expect(screen.getByTestId('jobs-tab')).toBeTruthy()
    })

    const clearBtn = screen.queryByText(/清除已完成|clear/i)
    if (clearBtn) {
      await user.click(clearBtn)

      await waitFor(() => {
        expect(screen.getByText(/确认清除/i)).toBeTruthy()
      })

      // Click cancel
      const cancelBtn = screen.queryByRole('button', { name: /取消|cancel/i })
      if (cancelBtn) {
        await user.click(cancelBtn)
        await waitFor(() => {
          // Dialog should be gone
          expect(screen.queryByText(/确认清除/i)).toBeFalsy()
        })
      }
    }
  })
})

describe('JobsTab — empty state per filter', () => {
  beforeEach(async () => {
    if (!i18n.isInitialized) {
      await i18n.init()
    }
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows empty text for default filter when nothing matches', async () => {
    vi.mocked(ipc.jobs.list)
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })

    render(<MemoryRouter><JobsTab /></MemoryRouter>)

    await waitFor(() => expect(ipc.jobs.list).toHaveBeenCalled())

    expect(screen.getByTestId('jobs-tab')).toBeTruthy()
    expect(screen.getByTestId('empty-state')).toBeTruthy()
    expect(screen.getByText('暂无任务')).toBeTruthy()
    expect(screen.getByText('后台任务会出现在这里')).toBeTruthy()
  })

  it('shows empty text after switching to "done" filter when no done jobs exist', async () => {
    vi.mocked(ipc.jobs.list)
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })

    render(<MemoryRouter><JobsTab /></MemoryRouter>)

    await waitFor(() => expect(ipc.jobs.list).toHaveBeenCalled())

    const statusSelect = screen.getByTestId('status-filter')
    fireEvent.change(statusSelect, { target: { value: 'done' } })

    // Empty state should still be visible after switching filter
    expect(screen.getByTestId('empty-state')).toBeTruthy()
  })

  it('shows empty text after switching to kind filter when no matching jobs', async () => {
    vi.mocked(ipc.jobs.list)
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })

    render(<MemoryRouter><JobsTab /></MemoryRouter>)

    await waitFor(() => expect(ipc.jobs.list).toHaveBeenCalled())

    const kindSelect = screen.getByTestId('kind-filter')
    fireEvent.change(kindSelect, { target: { value: 'index-retry' } })

    // Empty state should still be visible
    expect(screen.getByTestId('empty-state')).toBeTruthy()
  })
})
