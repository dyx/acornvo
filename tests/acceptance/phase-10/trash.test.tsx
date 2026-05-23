// @vitest-environment jsdom
/**
 * Phase 10 Acceptance: Trash flow end-to-end
 *
 * Scenarios:
 *  1. Right-click menu shows "移到废纸篓"
 *  2. Click opens TrashConfirmDialog
 *  3. Confirm calls ipc.file.trash with correct path
 *  4. Success removes item from library
 *  5. E_TRASH triggers fallback mode with hard-delete option
 *  6. hardDelete failure keeps dialog open and preserves store item
 */
import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Initialise i18n before anything uses useTranslation
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
import { VirtualFileList } from '@/components/library/VirtualFileList'
import type { FileSummary } from '@shared/ipc-contract'

function row(path: string, extra: Partial<FileSummary> = {}): FileSummary {
  return {
    path,
    title: path.replace(/\.md$/, ''),
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

describe('Phase 10 Acceptance: Right-click trash flow', () => {
  beforeEach(async () => {
    if (!i18n.isInitialized) {
      await i18n.init()
    }
    useLibraryStore.setState(useLibraryStore.getInitialState(), true)

    // tanstack virtual-core needs non-zero offsetHeight/offsetWidth
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
    if (_origOffsetHeight) {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', _origOffsetHeight)
    } else {
      delete (HTMLElement.prototype as Record<string, unknown>).offsetHeight
    }
    if (_origOffsetWidth) {
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', _origOffsetWidth)
    } else {
      delete (HTMLElement.prototype as Record<string, unknown>).offsetWidth
    }
    vi.useRealTimers()
    cleanup()
  })

  // ── Scenario 1: Right-click menu shows "移到废纸篓" ──
  it('right-click opens context menu with "移到废纸篓" option', async () => {
    useLibraryStore.setState({
      items: [row('notes/test.md', { title: 'Test' })],
      total: 1
    })

    render(
      <MemoryRouter>
        <VirtualFileList />
      </MemoryRouter>
    )

    const fileRow = document.querySelector('[data-testid="file-row"]') as HTMLElement
    fireEvent.contextMenu(fileRow, { clientX: 50, clientY: 50 })
    await act(() => Promise.resolve())

    const menu = screen.getByTestId('file-row-menu')
    expect(menu).toBeTruthy()

    // The menu should contain the trash option (resolved i18n text)
    const trashItem = screen.getByRole('menuitem', { name: '移到废纸篓' })
    expect(trashItem).toBeTruthy()
  })

  // ── Scenario 2: Click opens TrashConfirmDialog ──
  it('clicking "移到废纸篓" in context menu opens TrashConfirmDialog', async () => {
    useLibraryStore.setState({
      items: [row('notes/test.md', { title: 'Test' })],
      total: 1
    })

    render(
      <MemoryRouter>
        <VirtualFileList />
      </MemoryRouter>
    )

    // Right-click to open menu
    const fileRow = document.querySelector('[data-testid="file-row"]') as HTMLElement
    fireEvent.contextMenu(fileRow, { clientX: 50, clientY: 50 })
    await act(() => Promise.resolve())

    // Click "移到废纸篓" in context menu
    await userEvent.click(screen.getByRole('menuitem', { name: '移到废纸篓' }))
    await act(() => Promise.resolve())

    // TrashConfirmDialog should be visible with path and heading
    expect(screen.getByRole('heading', { name: '移到废纸篓' })).toBeTruthy()
    // Path appears in both file row and dialog description — verify at least one
    expect(screen.getAllByText('notes/test.md').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('button', { name: '取消' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '移到废纸篓' })).toBeTruthy()
  })

  // ── Scenario 3: Confirm calls ipc.file.trash with correct path ──
  it('confirm calls ipc.file.trash with correct path', async () => {
    vi.mocked(ipc.file.trash).mockResolvedValue({ ok: true })

    useLibraryStore.setState({
      items: [row('notes/test.md', { title: 'Test' })],
      total: 1
    })

    render(
      <MemoryRouter>
        <VirtualFileList />
      </MemoryRouter>
    )

    // Open context menu and click trash
    const fileRow = document.querySelector('[data-testid="file-row"]') as HTMLElement
    fireEvent.contextMenu(fileRow, { clientX: 50, clientY: 50 })
    await act(() => Promise.resolve())
    await userEvent.click(screen.getByRole('menuitem', { name: '移到废纸篓' }))
    await act(() => Promise.resolve())

    // Click confirm button in dialog
    await userEvent.click(screen.getByRole('button', { name: '移到废纸篓' }))
    await act(() => Promise.resolve())

    await waitFor(() => {
      expect(ipc.file.trash).toHaveBeenCalledWith('notes/test.md')
    })
  })

  // ── Scenario 4: Success removes item from library ──
  it('successful trash removes item from library store', async () => {
    vi.mocked(ipc.file.trash).mockResolvedValue({ ok: true })

    useLibraryStore.setState({
      items: [
        row('notes/a.md', { title: 'A' }),
        row('notes/b.md', { title: 'B' })
      ],
      total: 2
    })

    render(
      <MemoryRouter>
        <VirtualFileList />
      </MemoryRouter>
    )

    // Open context menu on second row
    const rows = document.querySelectorAll('[data-testid="file-row"]')
    fireEvent.contextMenu(rows[1], { clientX: 50, clientY: 50 })
    await act(() => Promise.resolve())
    await userEvent.click(screen.getByRole('menuitem', { name: '移到废纸篓' }))
    await act(() => Promise.resolve())

    // Click confirm
    await userEvent.click(screen.getByRole('button', { name: '移到废纸篓' }))
    await act(() => Promise.resolve())

    await waitFor(() => {
      expect(useLibraryStore.getState().items).toHaveLength(1)
      expect(useLibraryStore.getState().items[0].path).toBe('notes/a.md')
    })
  })

  // ── Scenario 5: E_TRASH triggers fallback mode with hard-delete option ──
  it('E_TRASH error transitions dialog to fallback mode with hard-delete option', async () => {
    vi.mocked(ipc.file.trash).mockResolvedValue({
      ok: false,
      error: { code: 'E_TRASH', message: 'Cannot move to system trash' }
    })

    vi.mocked(ipc.file.hardDelete).mockResolvedValue({ ok: true })

    useLibraryStore.setState({
      items: [row('notes/fragile.md', { title: 'Fragile' })],
      total: 1
    })

    render(
      <MemoryRouter>
        <VirtualFileList />
      </MemoryRouter>
    )

    // Open context menu and click trash
    const fileRow = document.querySelector('[data-testid="file-row"]') as HTMLElement
    fireEvent.contextMenu(fileRow, { clientX: 50, clientY: 50 })
    await act(() => Promise.resolve())
    await userEvent.click(screen.getByRole('menuitem', { name: '移到废纸篓' }))
    await act(() => Promise.resolve())

    // Click confirm — will fail with E_TRASH
    fireEvent.click(screen.getByRole('button', { name: '移到废纸篓' }))

    // Wait for fallback mode
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '无法移到废纸篓' })).toBeTruthy()
    })

    // Error message should be visible
    expect(screen.getByText(/Cannot move to system trash/)).toBeTruthy()

    // Checkbox should be present and unchecked
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(false)

    // "永久删除" button should be present but disabled
    const hardDeleteButton = screen.getByRole('button', { name: '永久删除' }) as HTMLButtonElement
    expect(hardDeleteButton).toBeTruthy()
    expect(hardDeleteButton.disabled).toBe(true)

    // Check the checkbox
    fireEvent.click(checkbox)
    expect(hardDeleteButton.disabled).toBe(false)

    // Click hard delete
    fireEvent.click(hardDeleteButton)

    await waitFor(() => {
      expect(ipc.file.hardDelete).toHaveBeenCalledWith('notes/fragile.md')
    })

    // Item should be removed from store
    await waitFor(() => {
      expect(useLibraryStore.getState().items).toHaveLength(0)
    })
  })

  // ── Scenario 6: hardDelete failure keeps dialog open and preserves store ──
  it('hardDelete failure keeps dialog open and does NOT remove item from store', async () => {
    const rejectionCaught = vi.fn<[unknown]>()
    const onRejection = (reason: unknown) => {
      rejectionCaught(reason)
    }
    process.on('unhandledRejection', onRejection)

    vi.mocked(ipc.file.trash).mockResolvedValue({
      ok: false,
      error: { code: 'E_TRASH', message: 'Cannot move to system trash' }
    })

    vi.mocked(ipc.file.hardDelete).mockResolvedValue({
      ok: false,
      error: { code: 'E_UNKNOWN', message: 'Hard delete failed' }
    })

    useLibraryStore.setState({
      items: [row('notes/stubborn.md', { title: 'Stubborn' })],
      total: 1
    })

    render(
      <MemoryRouter>
        <VirtualFileList />
      </MemoryRouter>
    )

    // Open context menu and click trash
    const fileRow = document.querySelector('[data-testid="file-row"]') as HTMLElement
    fireEvent.contextMenu(fileRow, { clientX: 50, clientY: 50 })
    await act(() => Promise.resolve())
    await userEvent.click(screen.getByRole('menuitem', { name: '移到废纸篓' }))
    await act(() => Promise.resolve())

    // Click confirm → enters fallback
    fireEvent.click(screen.getByRole('button', { name: '移到废纸篓' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '无法移到废纸篓' })).toBeTruthy()
    })

    // Check the checkbox and click "永久删除"
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '永久删除' }))

    // Let async operations settle
    await act(() => Promise.resolve())

    await waitFor(() => {
      expect(rejectionCaught).toHaveBeenCalled()
    })
    process.removeListener('unhandledRejection', onRejection)

    // Item should still be in store (removeItem was never called)
    expect(useLibraryStore.getState().items).toHaveLength(1)
    expect(useLibraryStore.getState().items[0].path).toBe('notes/stubborn.md')

    // Dialog remains in fallback mode (heading still visible)
    expect(screen.getByRole('heading', { name: '无法移到废纸篓' })).toBeTruthy()
  })
})

// ── Edge cases ──
describe('Phase 10 Acceptance: Keyboard shortcut trash flow', () => {
  beforeEach(async () => {
    if (!i18n.isInitialized) {
      await i18n.init()
    }
    useLibraryStore.setState(useLibraryStore.getInitialState(), true)

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
    if (_origOffsetHeight) {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', _origOffsetHeight)
    } else {
      delete (HTMLElement.prototype as Record<string, unknown>).offsetHeight
    }
    if (_origOffsetWidth) {
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', _origOffsetWidth)
    } else {
      delete (HTMLElement.prototype as Record<string, unknown>).offsetWidth
    }
    vi.useRealTimers()
    cleanup()
  })

  it('Delete key opens trash dialog when a row is selected', () => {
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
    fireEvent.keyDown(listbox, { key: 'Delete' })
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '移到废纸篓' })).toBeTruthy()
  })

  it('Cmd+Backspace opens trash dialog when a row is selected', () => {
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

    fireEvent.keyDown(listbox, { key: 'Backspace', metaKey: true })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

// ── Double-click prevention / busy state ──
describe('Phase 10 Acceptance: TrashConfirmDialog busy state', () => {
  beforeEach(async () => {
    if (!i18n.isInitialized) {
      await i18n.init()
    }
    vi.useRealTimers()
  })

  afterEach(() => {
    cleanup()
  })

  it('"移到废纸篓" button is disabled while confirming (double-click prevention)', async () => {
    // Import separately for isolated component-level test
    const { TrashConfirmDialog } = await import('@/components/library/TrashConfirmDialog')

    // Create a promise we can resolve manually to simulate a slow trash
    let resolveTrash!: () => void
    const trashPromise = new Promise<void>((resolve) => {
      resolveTrash = resolve
    })

    const onConfirm = vi.fn().mockImplementation(() => trashPromise)
    const onCancel = vi.fn()
    const onHardDelete = vi.fn()

    render(
      <TrashConfirmDialog
        open={true}
        path="notes/test.md"
        onCancel={onCancel}
        onConfirm={onConfirm}
        onHardDelete={onHardDelete}
      />
    )

    // Click confirm
    const confirmBtn = screen.getByRole('button', { name: '移到废纸篓' })
    fireEvent.click(confirmBtn)

    // Button should be disabled while busy
    await waitFor(() => {
      expect((confirmBtn as HTMLButtonElement).disabled).toBe(true)
    })

    // Release the promise
    resolveTrash()
    await act(() => Promise.resolve())
  })

  it('"取消" button is always enabled (escape hatch while busy)', async () => {
    const { TrashConfirmDialog } = await import('@/components/library/TrashConfirmDialog')

    let resolveTrash!: () => void
    const trashPromise = new Promise<void>((resolve) => {
      resolveTrash = resolve
    })

    const onConfirm = vi.fn().mockImplementation(() => trashPromise)
    const onCancel = vi.fn()
    const onHardDelete = vi.fn()

    render(
      <TrashConfirmDialog
        open={true}
        path="notes/test.md"
        onCancel={onCancel}
        onConfirm={onConfirm}
        onHardDelete={onHardDelete}
      />
    )

    // Click confirm
    fireEvent.click(screen.getByRole('button', { name: '移到废纸篓' }))

    // Wait for busy state
    await waitFor(() => {
      expect((screen.getByRole('button', { name: '移到废纸篓' }) as HTMLButtonElement).disabled).toBe(true)
    })

    // Cancel button should still be enabled
    const cancelBtn = screen.getByRole('button', { name: '取消' }) as HTMLButtonElement
    expect(cancelBtn.disabled).toBe(false)

    // Clean up
    resolveTrash()
    await act(() => Promise.resolve())
  })
})
