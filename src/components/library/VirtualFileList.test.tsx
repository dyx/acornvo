// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Initialize i18n before anything uses useTranslation
import { i18n } from '@/i18n'

vi.mock('@/ipc/client', () => ({
  ipc: {
    files: {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      get: vi.fn(),
      getCategoryTree: vi.fn(),
      getTagCloud: vi.fn(),
      revealInFinder: vi.fn()
    },
    file: {
      trash: vi.fn().mockResolvedValue({ ok: true }),
      hardDelete: vi.fn().mockResolvedValue({ ok: true })
    },
    on: vi.fn(() => () => {})
  }
}))

import { ipc } from '@/ipc/client'
import { useLibraryStore } from '@/stores/library'
import { VirtualFileList } from './VirtualFileList'
import type { FileSummary } from '@shared/ipc-contract'

function row(path: string, extra: Partial<FileSummary> = {}): FileSummary {
  return {
    path,
    title: path,
    category: null,
    rating: null,
    clipped_at: null,
    site: null,
    has_summary: false,
    tags: [],
    is_reviewing: false,
    review_status: 'none',
    review_error: null,
    ...extra
  }
}

// Save originals for restoration
const _origOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
const _origOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')

describe('VirtualFileList', () => {
  beforeEach(async () => {
    if (!i18n.isInitialized) {
      await i18n.init()
    }
    useLibraryStore.setState(useLibraryStore.getInitialState(), true)

    // tanstack virtual-core's getRect() reads offsetHeight/offsetWidth (not getBoundingClientRect).
    // jsdom returns 0 for these by default, which makes useVirtualizer render no items.
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() {
        return 600
      }
    })
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get() {
        return 360
      }
    })
  })

  afterEach(() => {
    // Restore original offsetHeight/offsetWidth descriptors
    if (_origOffsetHeight) {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', _origOffsetHeight)
    } else {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight
    }
    if (_origOffsetWidth) {
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', _origOffsetWidth)
    } else {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetWidth
    }
    vi.useRealTimers()
    cleanup()
  })

  it('renders the search input', () => {
    render(
      <MemoryRouter>
        <VirtualFileList />
      </MemoryRouter>
    )
    expect(screen.getByRole('searchbox')).toBeTruthy()
  })

  it('typing in search input debounces setFilter by 150ms', async () => {
    vi.useFakeTimers()
    const setFilter = vi.fn()
    useLibraryStore.setState({ setFilter })
    render(
      <MemoryRouter>
        <VirtualFileList />
      </MemoryRouter>
    )
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '注意力' } })
    expect(setFilter).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(150)
    })
    // flush pending microtasks after timer fires
    await act(() => Promise.resolve())
    expect(setFilter).toHaveBeenCalledWith({ q: '注意力' })
    vi.useRealTimers()
  })

  it('renders rows for items in the store', () => {
    useLibraryStore.setState({
      items: [row('a.md', { title: 'A' }), row('b.md', { title: 'B' })],
      total: 2
    })
    const { container } = render(
      <MemoryRouter>
        <VirtualFileList />
      </MemoryRouter>
    )
    const rows = container.querySelectorAll('[data-testid="file-row"]')
    expect(rows.length).toBeGreaterThanOrEqual(2)
  })

  it('clicking a row calls select(path)', () => {
    useLibraryStore.setState({ items: [row('a.md', { title: 'A' })], total: 1 })
    const select = vi.fn()
    useLibraryStore.setState({ select })
    const { container } = render(
      <MemoryRouter>
        <VirtualFileList />
      </MemoryRouter>
    )
    const rowEl = container.querySelector('[data-testid="file-row"]')!
    fireEvent.click(rowEl)
    expect(select).toHaveBeenCalledWith('a.md')
  })

  it('shows footer "{shown} / {total}"', () => {
    useLibraryStore.setState({ items: [row('a.md'), row('b.md')], total: 5 })
    render(
      <MemoryRouter>
        <VirtualFileList />
      </MemoryRouter>
    )
    expect(screen.getByText(/2.*\/.*5/)).toBeTruthy()
  })

  it('list container has correct role', () => {
    useLibraryStore.setState({ items: [row('a.md')], total: 1, selectedPath: 'a.md' })
    render(
      <MemoryRouter>
        <VirtualFileList />
      </MemoryRouter>
    )
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('Delete key opens trash confirm dialog when a row is selected', () => {
    useLibraryStore.setState({
      items: [row('a.md', { title: 'A' }), row('b.md', { title: 'B' })],
      total: 2,
      selectedPath: 'a.md'
    })
    render(
      <MemoryRouter>
        <VirtualFileList />
      </MemoryRouter>
    )
    const listbox = screen.getByRole('listbox')
    fireEvent.keyDown(listbox, { key: 'Delete' })
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '移到废纸篓' })).toBeTruthy()
  })

  it('Cmd+Backspace opens trash confirm dialog when a row is selected', () => {
    useLibraryStore.setState({
      items: [row('a.md', { title: 'A' })],
      total: 1,
      selectedPath: 'a.md'
    })
    render(
      <MemoryRouter>
        <VirtualFileList />
      </MemoryRouter>
    )
    const listbox = screen.getByRole('listbox')
    fireEvent.keyDown(listbox, { key: 'Backspace', metaKey: true })
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('trash shortcut does nothing when no row is selected', () => {
    useLibraryStore.setState({
      items: [row('a.md', { title: 'A' })],
      total: 1,
      selectedPath: null
    })
    render(
      <MemoryRouter>
        <VirtualFileList />
      </MemoryRouter>
    )
    const listbox = screen.getByRole('listbox')
    fireEvent.keyDown(listbox, { key: 'Delete' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('E_TRASH fallback: checkbox enables permanent delete, calls hardDelete and cleans store', async () => {
    vi.mocked(ipc.file.trash).mockResolvedValue({
      ok: false,
      error: { code: 'E_TRASH', message: 'Trash failed' }
    })
    const hardDelete = vi.fn().mockResolvedValue({ ok: true })
    vi.mocked(ipc.file.hardDelete).mockImplementation(hardDelete)

    useLibraryStore.setState({
      items: [row('a.md', { title: 'A' })],
      total: 1,
      selectedPath: 'a.md'
    })

    render(
      <MemoryRouter>
        <VirtualFileList />
      </MemoryRouter>
    )

    // Trigger Cmd+Backspace to open dialog
    const listbox = screen.getByRole('listbox')
    fireEvent.keyDown(listbox, { key: 'Backspace', metaKey: true })

    // Verify initial confirm dialog
    expect(screen.getByRole('heading', { name: '移到废纸篓' })).toBeTruthy()

    // Click "移到废纸篓" -- trash fails, enters fallback
    fireEvent.click(screen.getByRole('button', { name: '移到废纸篓' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '无法移到废纸篓' })).toBeTruthy()
    })

    // Checkbox exists, initially unchecked; "永久删除" disabled
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    const hardDeleteButton = screen.getByRole('button', { name: '永久删除' }) as HTMLButtonElement
    expect(hardDeleteButton.disabled).toBe(true)

    // Check the checkbox to enable "永久删除"
    fireEvent.click(checkbox)
    expect(hardDeleteButton.disabled).toBe(false)

    // Click "永久删除"
    fireEvent.click(hardDeleteButton)

    await waitFor(() => {
      expect(hardDelete).toHaveBeenCalledWith('a.md')
    })

    // Store item removed
    expect(useLibraryStore.getState().items).toHaveLength(0)
  })

  it('hardDelete failure keeps dialog open and preserves store item', async () => {
    // Catch expected unhandled rejection from hardDelete throwing IpcError
    const rejectionCaught = vi.fn<(reason: unknown) => void>()
    const onRejection = (reason: unknown) => {
      rejectionCaught(reason)
    }
    process.on('unhandledRejection', onRejection)

    vi.mocked(ipc.file.trash).mockResolvedValue({
      ok: false,
      error: { code: 'E_TRASH', message: 'Trash failed' }
    })
    vi.mocked(ipc.file.hardDelete).mockResolvedValue({
      ok: false,
      error: { code: 'E_UNKNOWN' as any, message: 'Delete failed' }
    })

    useLibraryStore.setState({
      items: [row('a.md', { title: 'A' })],
      total: 1,
      selectedPath: 'a.md'
    })

    render(
      <MemoryRouter>
        <VirtualFileList />
      </MemoryRouter>
    )

    // Trigger Cmd+Backspace
    const listbox = screen.getByRole('listbox')
    fireEvent.keyDown(listbox, { key: 'Backspace', metaKey: true })

    // Click "移到废纸篓" -- enters fallback
    fireEvent.click(screen.getByRole('button', { name: '移到废纸篓' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '无法移到废纸篓' })).toBeTruthy()
    })

    // Check the checkbox and click "永久删除"
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '永久删除' }))

    // Let async operations settle (hardDelete fails, throws IpcError)
    await act(() => Promise.resolve())

    // Verify hardDelete was called
    await waitFor(() => {
      expect(rejectionCaught).toHaveBeenCalled()
    })
    process.removeListener('unhandledRejection', onRejection)

    // Item still in store (removeItem was never called)
    expect(useLibraryStore.getState().items).toHaveLength(1)
    expect(useLibraryStore.getState().items[0].path).toBe('a.md')

    // Dialog remains open (trashTarget was never cleared)
    expect(screen.getByRole('heading', { name: '无法移到废纸篓' })).toBeTruthy()
  })
})
