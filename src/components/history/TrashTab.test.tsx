// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Initialize i18n before anything uses useTranslation
import { i18n } from '@/i18n'

vi.mock('@/ipc/client', () => ({
  ipc: {
    ops: {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 })
    },
    file: {
      openContainingDir: vi.fn().mockResolvedValue({ ok: true })
    },
    on: vi.fn(() => () => {})
  }
}))

import { ipc } from '@/ipc/client'
import { TrashTab } from './TrashTab'
import type { OpsItem } from '@shared/ops-types'

function makeItem(overrides: Partial<OpsItem> = {}): OpsItem {
  return {
    id: 1,
    op: 'trash',
    path: 'test/file.md',
    ts: '2026-05-03T12:00:00.000Z',
    meta: null,
    ...overrides
  }
}

describe('TrashTab', () => {
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
    vi.mocked(ipc.ops.list).mockReturnValue(new Promise(() => {})) // never resolves
    render(
      <MemoryRouter>
        <TrashTab />
      </MemoryRouter>
    )
    expect(screen.getByText('加载中…')).toBeTruthy()
  })

  it('renders empty state when no items', async () => {
    vi.mocked(ipc.ops.list).mockResolvedValue({ items: [], total: 0 })
    render(
      <MemoryRouter>
        <TrashTab />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByText('废纸篓为空')).toBeTruthy()
    })
  })

  it('renders trash and hard_delete items merged', async () => {
    vi.mocked(ipc.ops.list)
      .mockResolvedValueOnce({
        items: [makeItem({ id: 1, op: 'trash', path: 'a.md', ts: '2026-05-03T10:00:00.000Z' })],
        total: 1
      })
      .mockResolvedValueOnce({
        items: [
          makeItem({ id: 2, op: 'hard_delete', path: 'b.md', ts: '2026-05-03T11:00:00.000Z' })
        ],
        total: 1
      })

    render(
      <MemoryRouter>
        <TrashTab />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('a.md')).toBeTruthy()
    })

    expect(screen.getByText('b.md')).toBeTruthy()
    expect(screen.getByText('废纸篓')).toBeTruthy()
    expect(screen.getByText('永久删除')).toBeTruthy()
  })

  it('displays op badges with correct styling', async () => {
    vi.mocked(ipc.ops.list)
      .mockResolvedValueOnce({
        items: [makeItem({ id: 1, op: 'trash', path: 'trash.md' })],
        total: 1
      })
      .mockResolvedValueOnce({ items: [], total: 0 })

    render(
      <MemoryRouter>
        <TrashTab />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('废纸篓')).toBeTruthy()
    })
  })

  it('calls openContainingDir on row click', async () => {
    vi.mocked(ipc.ops.list)
      .mockResolvedValueOnce({
        items: [makeItem({ id: 1, op: 'trash', path: 'notes/thought.md' })],
        total: 1
      })
      .mockResolvedValueOnce({ items: [], total: 0 })

    render(
      <MemoryRouter>
        <TrashTab />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('notes/thought.md')).toBeTruthy()
    })

    const row = screen.getByTestId('trash-row')
    fireEvent.click(row)

    expect(ipc.file.openContainingDir).toHaveBeenCalledWith('notes/thought.md')
  })
})
