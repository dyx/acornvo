// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Initialize i18n before anything uses useTranslation
import { i18n } from '@/i18n'

const navigateMock = vi.fn()

vi.mock('@/ipc/client', () => ({
  ipc: {
    ops: {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 })
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
    render(
      <MemoryRouter>
        <OpsTab />
      </MemoryRouter>
    )
    expect(screen.getByText('加载中…')).toBeTruthy()
  })

  it('renders empty state when no items', async () => {
    vi.mocked(ipc.ops.list).mockResolvedValue({ items: [], total: 0 })
    render(
      <MemoryRouter>
        <OpsTab />
      </MemoryRouter>
    )
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

    render(
      <MemoryRouter>
        <OpsTab />
      </MemoryRouter>
    )

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
    render(
      <MemoryRouter>
        <OpsTab />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByText('暂无操作记录')).toBeTruthy()
    })
  })

  it('navigates to /history/conflicts?id=<id> when conflict_resolve row is clicked', async () => {
    vi.mocked(ipc.ops.list).mockResolvedValue({
      items: [
        makeItem({
          id: 10,
          op: 'conflict_resolve',
          path: 'notes/doc.md',
          meta: { id: 'c-42', resolved_by: 'keep_local' }
        })
      ],
      total: 1
    })

    render(
      <MemoryRouter>
        <OpsTab />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('notes/doc.md')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('ops-row'))
    expect(navigateMock).toHaveBeenCalledWith('/history/conflicts?id=c-42')
  })

  it('does NOT navigate when clicking non-conflict_resolve rows', async () => {
    vi.mocked(ipc.ops.list).mockResolvedValue({
      items: [
        makeItem({ id: 1, op: 'trash', path: 'a.md', meta: null }),
        makeItem({ id: 2, op: 'rename', path: 'b.md', meta: { new_path: 'b2.md' } })
      ],
      total: 2
    })

    render(
      <MemoryRouter>
        <OpsTab />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('a.md')).toBeTruthy()
    })

    const rows = screen.getAllByTestId('ops-row')
    fireEvent.click(rows[0])
    fireEvent.click(rows[1])
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('does NOT navigate when conflict_resolve meta has no id', async () => {
    vi.mocked(ipc.ops.list).mockResolvedValue({
      items: [
        makeItem({
          id: 5,
          op: 'conflict_resolve',
          path: 'banner.md',
          meta: { resolved_by: 'load_remote_banner' } // no id
        })
      ],
      total: 1
    })

    render(
      <MemoryRouter>
        <OpsTab />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('banner.md')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('ops-row'))
    expect(navigateMock).not.toHaveBeenCalled()
  })
})
