// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react'
import { ConflictDetailPanel } from './ConflictDetailPanel'
import type { ConflictMeta } from '@shared/conflict-types'
import type { DiffResult } from '@shared/ipc-contract'

vi.mock('@/ipc/client', () => ({
  ipc: {
    conflict: {
      read: vi.fn(),
      diff: vi.fn(),
      delete: vi.fn(),
      deleteAll: vi.fn(),
      openSnapshotFile: vi.fn()
    },
    file: {
      openContainingDir: vi.fn()
    },
    on: vi.fn(() => () => {})
  }
}))

import { ipc } from '@/ipc/client'

const meta: ConflictMeta = {
  path: 'notes/thought.md',
  ts: '2026-05-03T10:00:00.000Z',
  resolved_by: 'keep_local'
}

const diff: DiffResult = {
  left: {
    label: 'local',
    lines: [
      { num: 1, text: 'line one', kind: 'equal' },
      { num: 2, text: 'removed', kind: 'del' }
    ]
  },
  right: {
    label: 'remote',
    lines: [
      { num: 1, text: 'line one', kind: 'equal' },
      { num: 0, text: '', kind: 'equal' },
      { num: 2, text: 'added', kind: 'add' }
    ]
  },
  stats: { added: 1, removed: 1 }
}

function setupMocks() {
  vi.mocked(ipc.conflict.read).mockResolvedValue({
    meta,
    localText: 'line one\nremoved',
    remoteText: 'line one\nadded',
    baseText: ''
  })
  vi.mocked(ipc.conflict.diff).mockResolvedValue(diff)
  vi.mocked(ipc.conflict.delete).mockResolvedValue({ ok: true })
  vi.mocked(ipc.conflict.deleteAll).mockResolvedValue({ ok: true, deleted: 3 })
  vi.mocked(ipc.conflict.openSnapshotFile).mockResolvedValue({ ok: true })
  vi.mocked(ipc.file.openContainingDir).mockResolvedValue({ ok: true })
}

describe('ConflictDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
    cleanup()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows loading state initially', () => {
    vi.mocked(ipc.conflict.read).mockReturnValue(new Promise(() => {}))
    render(<ConflictDetailPanel conflictId="test-id" />)
    expect(screen.getByText('加载中…')).toBeTruthy()
  })

  it('renders conflict path and resolved_by badge after load', async () => {
    render(<ConflictDetailPanel conflictId="test-id" />)

    await waitFor(() => {
      expect(screen.getByText('notes/thought.md')).toBeTruthy()
    })

    expect(ipc.conflict.read).toHaveBeenCalledWith('test-id')
    expect(ipc.conflict.diff).toHaveBeenCalledWith('test-id', 'local-remote')
  })

  it('renders resolved_by badge with correct label', async () => {
    render(<ConflictDetailPanel conflictId="test-id" />)

    await waitFor(() => {
      expect(screen.getByText('保留本地')).toBeTruthy()
    }) // keep_local
  })

  it('renders hash snippet from conflict id', async () => {
    render(<ConflictDetailPanel conflictId="abc12345-xxxx" />)

    await waitFor(() => {
      expect(screen.getByText('#abc12345')).toBeTruthy()
    })
  })

  it('renders side selector buttons', async () => {
    render(<ConflictDetailPanel conflictId="test-id" />)

    await waitFor(() => {
      expect(screen.getByText('notes/thought.md')).toBeTruthy()
    })

    expect(screen.getByText('本地 ↔ 远端')).toBeTruthy()
    expect(screen.getByText('本地 ↔ 基准')).toBeTruthy()
    expect(screen.getByText('远端 ↔ 基准')).toBeTruthy()
  })

  it('re-fetches diff when side selection changes', async () => {
    render(<ConflictDetailPanel conflictId="test-id" />)

    await waitFor(() => {
      expect(screen.getByText('notes/thought.md')).toBeTruthy()
    })

    // Initial call
    expect(ipc.conflict.diff).toHaveBeenCalledWith('test-id', 'local-remote')

    // Click different side
    fireEvent.click(screen.getByText('本地 ↔ 基准'))
    expect(ipc.conflict.diff).toHaveBeenCalledWith('test-id', 'local-base')
  })

  it('renders action buttons', async () => {
    render(<ConflictDetailPanel conflictId="test-id" />)

    await waitFor(() => {
      expect(screen.getByText('notes/thought.md')).toBeTruthy()
    })

    expect(screen.getByText('在原目录中打开')).toBeTruthy()
    expect(screen.getByText('打开 本地')).toBeTruthy()
    expect(screen.getByText('打开 远端')).toBeTruthy()
    expect(screen.getByText('打开 基准')).toBeTruthy()
    expect(screen.getByText('删除此冲突')).toBeTruthy()
  })

  it('renders delete all button in footer', async () => {
    render(<ConflictDetailPanel conflictId="test-id" />)

    await waitFor(() => {
      expect(screen.getByText('notes/thought.md')).toBeTruthy()
    })

    expect(screen.getByText('删除全部冲突')).toBeTruthy()
  })

  it('calls openContainingDir when button clicked', async () => {
    render(<ConflictDetailPanel conflictId="test-id" />)

    await waitFor(() => {
      expect(screen.getByText('notes/thought.md')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('在原目录中打开'))
    expect(ipc.file.openContainingDir).toHaveBeenCalledWith('notes/thought.md')
  })

  it('calls openSnapshotFile for each side', async () => {
    render(<ConflictDetailPanel conflictId="test-id" />)

    await waitFor(() => {
      expect(screen.getByText('notes/thought.md')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('打开 本地'))
    expect(ipc.conflict.openSnapshotFile).toHaveBeenCalledWith('test-id', 'local')

    fireEvent.click(screen.getByText('打开 远端'))
    expect(ipc.conflict.openSnapshotFile).toHaveBeenCalledWith('test-id', 'remote')

    fireEvent.click(screen.getByText('打开 基准'))
    expect(ipc.conflict.openSnapshotFile).toHaveBeenCalledWith('test-id', 'base')
  })

  it('opens delete confirmation dialog', async () => {
    render(<ConflictDetailPanel conflictId="test-id" />)

    await waitFor(() => {
      expect(screen.getByText('notes/thought.md')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('删除此冲突'))

    // Dialog with confirm button should be visible
    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeTruthy()
    })

    // Confirm button appears in the dialog
    expect(screen.getByRole('button', { name: '删除' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '取消' })).toBeTruthy()
  })

  it('opens delete all confirmation dialog', async () => {
    render(<ConflictDetailPanel conflictId="test-id" />)

    await waitFor(() => {
      expect(screen.getByText('notes/thought.md')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('删除全部冲突'))

    // Dialog with confirm button should be visible
    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeTruthy()
    })

    expect(screen.getByRole('button', { name: '删除全部' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '取消' })).toBeTruthy()
  })

  it('calls delete and onClose when delete confirmed', async () => {
    const onClose = vi.fn()
    render(<ConflictDetailPanel conflictId="test-id" onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('notes/thought.md')).toBeTruthy()
    })

    // Open dialog
    fireEvent.click(screen.getByText('删除此冲突'))

    // Click confirm in dialog
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '删除' })).toBeTruthy()
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '删除' }))
    })

    await waitFor(() => {
      expect(ipc.conflict.delete).toHaveBeenCalledWith('test-id')
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('calls deleteAll and onClose when delete all confirmed', async () => {
    const onClose = vi.fn()
    render(<ConflictDetailPanel conflictId="test-id" onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('notes/thought.md')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('删除全部冲突'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '删除全部' })).toBeTruthy()
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '删除全部' }))
    })

    await waitFor(() => {
      expect(ipc.conflict.deleteAll).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('calls onClose when close button clicked', async () => {
    const onClose = vi.fn()
    render(<ConflictDetailPanel conflictId="test-id" onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('notes/thought.md')).toBeTruthy()
    })

    fireEvent.click(screen.getByLabelText('关闭'))
    expect(onClose).toHaveBeenCalled()
  })

  it('has data-testid on root element', async () => {
    render(<ConflictDetailPanel conflictId="test-id" />)

    await waitFor(() => {
      expect(screen.getByTestId('conflict-detail-panel')).toBeTruthy()
    })
  })

  it('renders diff view when diff loaded', async () => {
    render(<ConflictDetailPanel conflictId="test-id" />)

    await waitFor(() => {
      expect(screen.getByTestId('diff-view')).toBeTruthy()
    })
  })
})
