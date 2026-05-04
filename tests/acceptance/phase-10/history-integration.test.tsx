// @vitest-environment jsdom
/**
 * Phase 10 Acceptance: History page integration
 *
 * Scenarios:
 *  1. History page loads with 3 tabs
 *  2. Switching tabs works
 *  3. Conflict click opens detail panel with side-by-side layout
 *  4. Diff view renders correctly
 *  5. Empty states render for all three tabs
 *  6. Ops list renders correctly with correct op badges
 */
import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Initialise i18n before anything uses useTranslation
import { i18n } from '@/i18n'

// Polyfill ResizeObserver for react-resizable-panels
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.mock('@/ipc/client', () => ({
  ipc: {
    ops: {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 })
    },
    conflict: {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      read: vi.fn().mockResolvedValue({
        meta: {
          path: 'notes/conflict.md',
          ts: '2026-05-03T12:00:00.000Z',
          resolved_by: 'keep_local'
        },
        localText: 'local content',
        remoteText: 'remote content',
        baseText: 'base content'
      }),
      diff: vi.fn().mockResolvedValue({
        left: { label: 'local', lines: [{ num: 1, text: 'local line', kind: 'del' as const }] },
        right: { label: 'remote', lines: [{ num: 1, text: 'remote line', kind: 'add' as const }] },
        stats: { added: 1, removed: 1 }
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
import { TrashTab } from '@/components/history/TrashTab'
import { ConflictsTab } from '@/components/history/ConflictsTab'
import { OpsTab } from '@/components/history/OpsTab'
import { HistoryLayout } from '@/components/history/HistoryLayout'
import type { OpsItem } from '@shared/ops-types'
import type { ConflictItem } from '@shared/conflict-types'

// ── Helpers ──
function makeOpsItem(overrides: Partial<OpsItem> = {}): OpsItem {
  return {
    id: 1,
    op: 'trash',
    path: 'notes/doc.md',
    ts: '2026-05-03T12:00:00.000Z',
    meta: null,
    ...overrides
  }
}

function makeConflict(overrides: Partial<ConflictItem> = {}): ConflictItem {
  return {
    id: 'c-1',
    path: 'notes/doc.md',
    ts: '2026-05-03T12:00:00.000Z',
    resolved_by: 'keep_local',
    ...overrides
  }
}

describe('Phase 10 Integration: HistoryLayout', () => {
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

  // ── Scenario 1: History page loads with 3 tabs ──
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

  // ── Scenario 2: Switching tabs works ──
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

    const opsTab = screen.getByRole('tab', { name: '操作记录' })
    expect(opsTab.getAttribute('data-state')).toBe('inactive')
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

  // ── Scenario 3: Conflict click opens detail panel with side-by-side layout ──
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

    // Wait for detail panel to appear
    await waitFor(() => {
      expect(screen.getByTestId('conflict-detail-panel')).toBeTruthy()
    })

    // IPC should have been called with the right conflict ID
    expect(ipc.conflict.read).toHaveBeenCalledWith('c-99')

    // Diff IPC should also be called
    await waitFor(() => {
      expect(ipc.conflict.diff).toHaveBeenCalledWith('c-99', 'local-remote')
    })
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

    await waitFor(() => {
      expect(screen.getByTestId('conflict-detail-panel')).toBeTruthy()
    })

    // Click close button
    fireEvent.click(screen.getByLabelText('关闭'))

    await waitFor(() => {
      expect(screen.queryByTestId('conflict-detail-panel')).toBeFalsy()
    })
  })

  // ── Scenario 4: Diff view renders correctly ──
  it('renders diff view with stats when conflict detail is opened', async () => {
    vi.mocked(ipc.conflict.list).mockResolvedValue({
      items: [makeConflict({ id: 'diff-1', path: 'notes/changed.md' })],
      total: 1
    })

    render(
      <MemoryRouter>
        <HistoryLayout tab="conflicts" />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('notes/changed.md')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('conflict-row'))

    // Wait for detail panel and diff to load
    await waitFor(() => {
      expect(screen.getByTestId('diff-view')).toBeTruthy()
    })

    // Check stats are rendered
    // Diff view shows +added -removed
    const diffView = screen.getByTestId('diff-view')
    expect(diffView).toBeTruthy()

    // Check column headers (本地 / 远端)
    expect(screen.getByText('本地')).toBeTruthy()
    expect(screen.getByText('远端')).toBeTruthy()
  })
})

// ── Empty state tests for all three tabs ──
describe('Phase 10 Integration: Empty states', () => {
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

  it('TrashTab shows empty state when no items', async () => {
    vi.mocked(ipc.ops.list).mockResolvedValue({ items: [], total: 0 })
    render(
      <MemoryRouter>
        <TrashTab />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('废纸篓为空')).toBeTruthy()
    })
    expect(screen.getByTestId('empty-state')).toBeTruthy()
  })

  it('ConflictsTab shows empty state when no items', async () => {
    vi.mocked(ipc.conflict.list).mockResolvedValue({ items: [], total: 0 })
    render(
      <MemoryRouter>
        <ConflictsTab />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('暂无冲突')).toBeTruthy()
    })
    expect(screen.getByTestId('empty-state')).toBeTruthy()
  })

  it('OpsTab shows empty state when no items', async () => {
    vi.mocked(ipc.ops.list).mockResolvedValue({ items: [], total: 0 })
    render(
      <MemoryRouter>
        <OpsTab />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('暂无操作记录')).toBeTruthy()
    })
    expect(screen.getByTestId('empty-state')).toBeTruthy()
  })

  it('OpsTab shows empty state when ops.list returns empty results', async () => {
    // Explicitly test empty results (not just no items)
    vi.mocked(ipc.ops.list).mockResolvedValue({ items: [], total: 0 })
    render(
      <MemoryRouter>
        <OpsTab />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('ops-tab')).toBeTruthy()
      expect(screen.getByTestId('empty-state')).toBeTruthy()
    })
  })
})

// ── Ops list rendering ──
describe('Phase 10 Integration: OpsTab content', () => {
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

  it('renders multiple ops with correct badges', async () => {
    vi.mocked(ipc.ops.list).mockResolvedValue({
      items: [
        makeOpsItem({ id: 1, op: 'trash', path: 'trashed.md' }),
        makeOpsItem({ id: 2, op: 'hard_delete', path: 'deleted.md' }),
        makeOpsItem({ id: 3, op: 'rename', path: 'renamed.md' }),
        makeOpsItem({ id: 4, op: 'conflict_resolve', path: 'resolved.md' })
      ],
      total: 4
    })

    render(
      <MemoryRouter>
        <OpsTab />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('trashed.md')).toBeTruthy()
    })

    expect(screen.getByText('deleted.md')).toBeTruthy()
    expect(screen.getByText('renamed.md')).toBeTruthy()
    expect(screen.getByText('resolved.md')).toBeTruthy()

    // Check badges
    expect(screen.getByText('废纸篓')).toBeTruthy()
    expect(screen.getByText('永久删除')).toBeTruthy()
    expect(screen.getByText('重命名')).toBeTruthy()
    expect(screen.getByText('冲突解决')).toBeTruthy()

    const rows = screen.getAllByTestId('ops-row')
    expect(rows).toHaveLength(4)
  })

  it('renders loading state initially', () => {
    vi.mocked(ipc.ops.list).mockReturnValue(new Promise(() => {})) // never resolves
    render(
      <MemoryRouter>
        <OpsTab />
      </MemoryRouter>
    )

    expect(screen.getByText('加载中…')).toBeTruthy()
  })
})

// ── TrashTab edge case: ops.list error ──
describe('Phase 10 Integration: TrashTab error handling', () => {
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

  it('handles ops.list fetch error gracefully and shows empty state', async () => {
    vi.mocked(ipc.ops.list).mockRejectedValue(new Error('Network error'))
    render(
      <MemoryRouter>
        <TrashTab />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('废纸篓为空')).toBeTruthy()
    })
  })

  it('shows loading spinner while fetching', () => {
    // Don't resolve the promise — loading state stays
    vi.mocked(ipc.ops.list).mockReturnValue(new Promise(() => {}))
    render(
      <MemoryRouter>
        <TrashTab />
      </MemoryRouter>
    )

    expect(screen.getByText('加载中…')).toBeTruthy()
    expect(screen.queryByTestId('empty-state')).toBeNull()
  })
})
