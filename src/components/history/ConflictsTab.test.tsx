// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Initialize i18n before anything uses useTranslation
import { i18n } from '@/i18n'

vi.mock('@/ipc/client', () => ({
  ipc: {
    conflict: {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 })
    },
    on: vi.fn(() => () => {})
  }
}))

import { ipc } from '@/ipc/client'
import { ConflictsTab } from './ConflictsTab'
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

describe('ConflictsTab', () => {
  beforeEach(async () => {
    if (!i18n.isInitialized) {
      await i18n.init()
    }
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders loading state initially', () => {
    vi.mocked(ipc.conflict.list).mockReturnValue(new Promise(() => {}))
    render(
      <MemoryRouter>
        <ConflictsTab />
      </MemoryRouter>
    )
    expect(screen.getByText('加载中…')).toBeTruthy()
  })

  it('renders empty state when no conflicts', async () => {
    vi.mocked(ipc.conflict.list).mockResolvedValue({ items: [], total: 0 })
    render(
      <MemoryRouter>
        <ConflictsTab />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByText('暂无冲突')).toBeTruthy()
    })
  })

  it('renders conflict rows when items exist', async () => {
    vi.mocked(ipc.conflict.list).mockResolvedValue({
      items: [
        makeConflict({ id: 'c-1', path: 'a.md', resolved_by: 'keep_local' }),
        makeConflict({ id: 'c-2', path: 'b.md', resolved_by: 'save_as' })
      ],
      total: 2
    })

    render(
      <MemoryRouter>
        <ConflictsTab />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('a.md')).toBeTruthy()
    })

    expect(screen.getByText('b.md')).toBeTruthy()
    expect(screen.getByText('保留本地')).toBeTruthy()
    expect(screen.getByText('另存副本')).toBeTruthy()
    const rows = screen.getAllByTestId('conflict-row')
    expect(rows).toHaveLength(2)
  })

  it('calls onSelectConflict when a row is clicked', async () => {
    const onSelect = vi.fn()
    vi.mocked(ipc.conflict.list).mockResolvedValue({
      items: [makeConflict({ id: 'c-99', path: 'notes/xyz.md' })],
      total: 1
    })

    render(
      <MemoryRouter>
        <ConflictsTab onSelectConflict={onSelect} />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('notes/xyz.md')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('conflict-row'))
    expect(onSelect).toHaveBeenCalledWith('c-99')
  })

  it('handles fetch error gracefully', async () => {
    vi.mocked(ipc.conflict.list).mockRejectedValue(new Error('Network error'))
    render(
      <MemoryRouter>
        <ConflictsTab />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByText('暂无冲突')).toBeTruthy()
    })
  })
})
