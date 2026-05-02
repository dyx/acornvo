// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/ipc/client', () => ({
  ipc: {
    files: {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      get: vi.fn(),
      getCategoryTree: vi.fn().mockResolvedValue([]),
      getTagCloud: vi.fn().mockResolvedValue([]),
      revealInFinder: vi.fn()
    },
    on: vi.fn(() => () => {})
  }
}))
import { ipc } from '@/ipc/client'

import { useGroveStore } from '@/stores/grove'
import { useLibraryStore, _resetLibrarySubscriber } from '@/stores/library'
import { Library } from './Library'

describe('Library page (three-pane)', () => {
  beforeEach(() => {
    cleanup()
    _resetLibrarySubscriber()
    useLibraryStore.setState(useLibraryStore.getInitialState(), true)
    useGroveStore.setState({
      current: { id: 'g', path: '/p', name: 'My Grove', color: null, sync_warning: null }
    }, false)
  })

  it('renders the page title with grove name', () => {
    render(<MemoryRouter><Library /></MemoryRouter>)
    expect(screen.getByText(/My Grove/)).toBeTruthy()
  })

  it('renders the three panes', () => {
    render(<MemoryRouter><Library /></MemoryRouter>)
    expect(screen.getByTestId('library-category-sidebar')).toBeTruthy()
    expect(screen.getByTestId('library-list')).toBeTruthy()
    expect(screen.getByTestId('preview-empty')).toBeTruthy()
  })

  it('mounts all three panes side-by-side', () => {
    render(<MemoryRouter><Library /></MemoryRouter>)
    expect(screen.getByTestId('library-category-sidebar')).toBeTruthy()
    expect(screen.getByTestId('library-list')).toBeTruthy()
    expect(screen.getByTestId('preview-empty')).toBeTruthy()
  })

  it('on mount calls files.list / files.getCategoryTree / files.getTagCloud once each', async () => {
    render(<MemoryRouter><Library /></MemoryRouter>)
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
    expect(ipc.files.list).toHaveBeenCalled()
    expect(ipc.files.getCategoryTree).toHaveBeenCalled()
    expect(ipc.files.getTagCloud).toHaveBeenCalled()
  })

  it('installs index event subscribers on mount', async () => {
    (ipc.on as ReturnType<typeof vi.fn>).mockClear()
    render(<MemoryRouter><Library /></MemoryRouter>)
    await new Promise((r) => setTimeout(r, 0))
    const channelsCalled = (ipc.on as ReturnType<typeof vi.fn>).mock.calls.map((c: [string]) => c[0])
    expect(channelsCalled).toContain('index:fileChanged')
    expect(channelsCalled).toContain('index:fileDeleted')
    expect(channelsCalled).toContain('index:fileRenamed')
    expect(channelsCalled).toContain('project:changed')
  })
})
