// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Initialize i18n before anything uses useTranslation
import { i18n } from '@/i18n'

vi.mock('@/ipc/client', () => ({
  ipc: {
    ops: {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 })
    },
    on: vi.fn(() => () => {})
  }
}))

import { ipc } from '@/ipc/client'
import { OpsTab } from './OpsTab'
import type { OpsItem } from '@shared/ops-types'

function makeItem(overrides: Partial<OpsItem> = {}): OpsItem {
  return {
    id: 1,
    op: 'trash',
    path: 'notes/doc.md',
    ts: '2026-05-03T12:00:00.000Z',
    meta: null,
    ...overrides
  }
}

describe('OpsTab', () => {
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
    vi.mocked(ipc.ops.list).mockReturnValue(new Promise(() => {}))
    render(<MemoryRouter><OpsTab /></MemoryRouter>)
    expect(screen.getByText('加载中…')).toBeTruthy()
  })

  it('renders empty state when no items', async () => {
    vi.mocked(ipc.ops.list).mockResolvedValue({ items: [], total: 0 })
    render(<MemoryRouter><OpsTab /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText('暂无操作记录')).toBeTruthy()
    })
  })

  it('renders ops rows when items exist', async () => {
    vi.mocked(ipc.ops.list).mockResolvedValue({
      items: [
        makeItem({ id: 1, op: 'trash', path: 'a.md' }),
        makeItem({ id: 2, op: 'rename', path: 'b.md' }),
        makeItem({ id: 3, op: 'conflict_resolve', path: 'c.md' })
      ],
      total: 3
    })

    render(<MemoryRouter><OpsTab /></MemoryRouter>)

    await waitFor(() => {
      expect(screen.getByText('a.md')).toBeTruthy()
    })

    expect(screen.getByText('b.md')).toBeTruthy()
    expect(screen.getByText('c.md')).toBeTruthy()
    expect(screen.getByText('废纸篓')).toBeTruthy()
    expect(screen.getByText('重命名')).toBeTruthy()
    expect(screen.getByText('冲突解决')).toBeTruthy()
    const rows = screen.getAllByTestId('ops-row')
    expect(rows).toHaveLength(3)
  })

  it('handles fetch error gracefully', async () => {
    vi.mocked(ipc.ops.list).mockRejectedValue(new Error('Network error'))
    render(<MemoryRouter><OpsTab /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText('暂无操作记录')).toBeTruthy()
    })
  })
})
