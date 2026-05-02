// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
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
    on: vi.fn(() => () => {})
  }
}))

import { useLibraryStore } from '@/stores/library'
import { VirtualFileList } from './VirtualFileList'
import type { FileSummary } from '@shared/ipc-contract'

function row(path: string, extra: Partial<FileSummary> = {}): FileSummary {
  return {
    path, title: path, category: null, rating: null, clipped_at: null,
    site: null, has_summary: false, tags: [], is_reviewing: false, ...extra
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
      get() { return 600 }
    })
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get() { return 360 }
    })
  })

  afterEach(() => {
    // Restore original offsetHeight/offsetWidth descriptors
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

  it('renders the search input', () => {
    render(<MemoryRouter><VirtualFileList /></MemoryRouter>)
    expect(screen.getByRole('searchbox')).toBeTruthy()
  })

  it('typing in search input debounces setFilter by 150ms', async () => {
    vi.useFakeTimers()
    const setFilter = vi.fn()
    useLibraryStore.setState({ setFilter })
    render(<MemoryRouter><VirtualFileList /></MemoryRouter>)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '注意力' } })
    expect(setFilter).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(150) })
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
    const { container } = render(<MemoryRouter><VirtualFileList /></MemoryRouter>)
    const rows = container.querySelectorAll('[data-testid="file-row"]')
    expect(rows.length).toBeGreaterThanOrEqual(2)
  })

  it('clicking a row calls select(path)', () => {
    useLibraryStore.setState({ items: [row('a.md', { title: 'A' })], total: 1 })
    const select = vi.fn()
    useLibraryStore.setState({ select })
    const { container } = render(<MemoryRouter><VirtualFileList /></MemoryRouter>)
    const rowEl = container.querySelector('[data-testid="file-row"]')!
    fireEvent.click(rowEl)
    expect(select).toHaveBeenCalledWith('a.md')
  })

  it('shows footer "{shown} / {total}"', () => {
    useLibraryStore.setState({ items: [row('a.md'), row('b.md')], total: 5 })
    render(<MemoryRouter><VirtualFileList /></MemoryRouter>)
    expect(screen.getByText(/2.*\/.*5/)).toBeTruthy()
  })

  it('list container has correct role', () => {
    useLibraryStore.setState({ items: [row('a.md')], total: 1, selectedPath: 'a.md' })
    render(<MemoryRouter><VirtualFileList /></MemoryRouter>)
    expect(screen.getByRole('listbox')).toBeTruthy()
  })
})
