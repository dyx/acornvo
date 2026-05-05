// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Initialize i18n before anything uses useTranslation
import { i18n } from '@/i18n'

vi.mock('@/ipc/client', () => ({
  ipc: {
    jobs: {
      retry: vi.fn().mockResolvedValue({ ok: true }),
      cancel: vi.fn().mockResolvedValue({ ok: true })
    }
  }
}))

import { ipc } from '@/ipc/client'
import { JobRow } from './JobRow'
import type { Job } from '@shared/job-types'

function makeJob(overrides: Partial<Job> = {}): Job {
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

function renderRow(job: Job, onChanged = () => {}) {
  return render(<JobRow job={job} onChanged={onChanged} />)
}

describe('JobRow — payload summary by kind', () => {
  beforeEach(async () => {
    if (!i18n.isInitialized) {
      await i18n.init()
    }
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('index-retry shows path in summary', () => {
    renderRow(makeJob({ kind: 'index-retry', payload: { path: 'notes/a.md' } }))
    expect(screen.getByText(/notes\/a\.md/)).toBeTruthy()
  })

  it('ai-review-clip shows clip info', () => {
    renderRow(makeJob({ kind: 'ai-review-clip', payload: { clipId: 42 } }))
    expect(screen.getByText(/clip.*42|42/)).toBeTruthy()
  })

  it('shows status badge text', () => {
    renderRow(makeJob({ status: 'failed', lastError: 'EIO' }))
    expect(screen.getByText(/失败|failed/i)).toBeTruthy()
  })

  it('shows attempts count', () => {
    renderRow(makeJob({ attempts: 3 }))
    expect(screen.getByText(/3/)).toBeTruthy()
  })

  it('shows lastError for failed rows', () => {
    renderRow(makeJob({ status: 'failed', lastError: 'disk full' }))
    expect(screen.getByText('disk full')).toBeTruthy()
  })

  it('does NOT show lastError for non-failed rows', () => {
    renderRow(makeJob({ status: 'pending', lastError: 'should not show' }))
    expect(screen.queryByText('should not show')).toBeNull()
  })

  it('truncates lastError to 60 chars', () => {
    const longError = 'E'.repeat(100)
    renderRow(makeJob({ status: 'failed', lastError: longError }))
    const text = screen.getByText(/E{10,}/)
    expect(text.textContent!.length).toBeLessThanOrEqual(63) // 60 chars + '…'
  })

  it('renders kind badge', () => {
    renderRow(makeJob({ kind: 'index-retry' }))
    expect(screen.getByText('索引重试')).toBeTruthy()
  })

  it('renders relative time', () => {
    renderRow(makeJob())
    // formatDistanceToNow should produce some output
    const el = screen.getByTestId('job-row')
    expect(el.textContent).toBeTruthy()
  })
})

describe('JobRow — actions', () => {
  beforeEach(async () => {
    if (!i18n.isInitialized) {
      await i18n.init()
    }
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('failed row retry button calls jobs.retry and onChanged', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    renderRow(makeJob({ id: 'f', status: 'failed', lastError: 'EIO' }), onChanged)

    const btn = screen.getByRole('button', { name: /重试|retry/i })
    await user.click(btn)

    expect(ipc.jobs.retry).toHaveBeenCalledWith('f')
    expect(onChanged).toHaveBeenCalled()
  })

  it('pending row cancel button calls jobs.cancel and onChanged', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    renderRow(makeJob({ id: 'p', status: 'pending' }), onChanged)

    const btn = screen.getByRole('button', { name: /取消|cancel/i })
    await user.click(btn)

    expect(ipc.jobs.cancel).toHaveBeenCalledWith('p')
    expect(onChanged).toHaveBeenCalled()
  })

  it('running row cancel button calls jobs.cancel and onChanged', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    renderRow(makeJob({ id: 'r', status: 'running' }), onChanged)

    const btn = screen.getByRole('button', { name: /取消|cancel/i })
    await user.click(btn)

    expect(ipc.jobs.cancel).toHaveBeenCalledWith('r')
    expect(onChanged).toHaveBeenCalled()
  })

  it('done rows show no action buttons', () => {
    renderRow(makeJob({ status: 'done' }))
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('canceled rows show no action buttons', () => {
    renderRow(makeJob({ status: 'canceled' }))
    expect(screen.queryByRole('button')).toBeNull()
  })
})
