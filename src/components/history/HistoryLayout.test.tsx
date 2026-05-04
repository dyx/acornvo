// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HistoryLayout } from './HistoryLayout'
import { i18n } from '@/i18n'

// Polyfill ResizeObserver for react-resizable-panels
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.mock('@/ipc/client', () => ({
  ipc: {
    conflict: {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      read: vi.fn().mockResolvedValue({
        meta: {
          path: 'notes/thought.md',
          ts: '2026-05-03T10:00:00.000Z',
          resolved_by: 'keep_local'
        },
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
    file: {
      openContainingDir: vi.fn().mockResolvedValue({ ok: true })
    },
    on: vi.fn(() => () => {})
  }
}))

import { ipc } from '@/ipc/client'
import type { ConflictItem } from '@shared/conflict-types'

function makeConflict(overrides: Partial<ConflictItem> = {}): ConflictItem {
  return {
    id: 'c-1',
    path: 'notes/doc.md',
    ts: '2026-05-03T12:00:00.000Z',
    resolved_by: 'keep_local',
    ...overrides
  }
}

describe('HistoryLayout', () => {
  beforeEach(async () => {
    if (!i18n.isInitialized) {
      await i18n.init()
    }
    vi.clearAllMocks()
    cleanup()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders all three tab triggers', () => {
    render(
      <MemoryRouter>
        <HistoryLayout tab="trash" />
      </MemoryRouter>
    )

    expect(screen.getByRole('tab', { name: '废纸篓' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '冲突' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '操作记录' })).toBeTruthy()
  })

  it('renders TrashTab content when tab is trash', () => {
    render(
      <MemoryRouter>
        <HistoryLayout tab="trash" />
      </MemoryRouter>
    )

    expect(screen.getByTestId('trash-tab')).toBeTruthy()
  })

  it('renders ConflictsTab content when tab is conflicts', () => {
    render(
      <MemoryRouter>
        <HistoryLayout tab="conflicts" />
      </MemoryRouter>
    )

    expect(screen.getByTestId('conflicts-tab')).toBeTruthy()
  })

  it('renders OpsTab content when tab is ops', () => {
    render(
      <MemoryRouter>
        <HistoryLayout tab="ops" />
      </MemoryRouter>
    )

    expect(screen.getByTestId('ops-tab')).toBeTruthy()
  })

  it('marks the active tab based on the tab prop', () => {
    render(
      <MemoryRouter>
        <HistoryLayout tab="conflicts" />
      </MemoryRouter>
    )

    const conflictsTab = screen.getByRole('tab', { name: '冲突' })
    expect(conflictsTab.getAttribute('data-state')).toBe('active')

    const trashTab = screen.getByRole('tab', { name: '废纸篓' })
    expect(trashTab.getAttribute('data-state')).toBe('inactive')
  })

  it('opens ConflictDetailPanel when a conflict row is clicked', async () => {
    vi.mocked(ipc.conflict.list).mockResolvedValue({
      items: [makeConflict({ id: 'c-99', path: 'notes/xyz.md' })],
      total: 1
    })

    render(
      <MemoryRouter>
        <HistoryLayout tab="conflicts" />
      </MemoryRouter>
    )

    // Wait for conflict row to appear
    await waitFor(() => {
      expect(screen.getByText('notes/xyz.md')).toBeTruthy()
    })

    // Click the conflict row
    fireEvent.click(screen.getByTestId('conflict-row'))

    // Wait for detail panel to appear (it fetches conflict.read)
    await waitFor(() => {
      expect(screen.getByTestId('conflict-detail-panel')).toBeTruthy()
    })

    // IPC should have been called with the right conflict ID
    expect(ipc.conflict.read).toHaveBeenCalledWith('c-99')
  })

  it('closes detail panel when close button is clicked', async () => {
    vi.mocked(ipc.conflict.list).mockResolvedValue({
      items: [makeConflict({ id: 'c-99', path: 'notes/xyz.md' })],
      total: 1
    })

    render(
      <MemoryRouter>
        <HistoryLayout tab="conflicts" />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('notes/xyz.md')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('conflict-row'))

    // Wait for detail panel to load
    await waitFor(() => {
      expect(screen.getByTestId('conflict-detail-panel')).toBeTruthy()
    })

    // Click close button
    fireEvent.click(screen.getByLabelText('关闭'))

    // Detail panel should be gone
    await waitFor(() => {
      expect(screen.queryByTestId('conflict-detail-panel')).toBeFalsy()
    })
  })

  it('auto-selects conflict when initialSelectedConflictId is provided', async () => {
    vi.mocked(ipc.conflict.list).mockResolvedValue({
      items: [makeConflict({ id: 'c-77', path: 'docs/preload.md' })],
      total: 1
    })

    render(
      <MemoryRouter>
        <HistoryLayout tab="conflicts" initialSelectedConflictId="c-77" />
      </MemoryRouter>
    )

    // Detail panel should open immediately (after conflict.read resolves)
    await waitFor(() => {
      expect(screen.getByTestId('conflict-detail-panel')).toBeTruthy()
    })

    expect(ipc.conflict.read).toHaveBeenCalledWith('c-77')
  })
})
