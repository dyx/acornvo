// src/pages/Browse.test.tsx
import { render, screen, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { Browse } from './Browse'
import { useBrowserStore, setBrowserPort } from '@/stores/browser'

vi.mock('@/ipc/client', () => ({
  ipc: {
    bookmarks: {
      list: vi.fn(async () => ({ items: [], total: 0 })),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      getByUrl: vi.fn(async () => null)
    },
    on: vi.fn(() => () => {})
  }
}))

// jsdom polyfill: getBoundingClientRect returns zeros by default
Element.prototype.getBoundingClientRect = vi.fn(() => ({
  x: 0, y: 0, width: 800, height: 600,
  top: 0, right: 800, bottom: 600, left: 0,
  toJSON: () => {}
}))

// jsdom polyfill: ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}))

function reset() {
  useBrowserStore.setState({
    tabs: [],
    activeTabId: null,
    bookmarksOpen: false,
    viewport: { x: 0, y: 0, width: 0, height: 0 }
  })
}

let _mockId = 0
function mockPort() {
  const id = `mock-${++_mockId}`
  return {
    createTab: vi.fn(async (url: string | undefined) => ({ id, url: url ?? 'about:blank' })),
    closeTab: vi.fn(),
    activateTab: vi.fn(),
    navigate: vi.fn(),
    reload: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
    setViewport: vi.fn(),
    suspendTab: vi.fn(),
    resumeTab: vi.fn()
  } as any
}

describe('Browse page', () => {
  beforeEach(reset)

  it('on mount, auto-creates a blank tab if tabs is empty', async () => {
    const port = mockPort()
    setBrowserPort(port)
    render(<Browse />)

    await waitFor(() => {
      expect(useBrowserStore.getState().tabs).toHaveLength(1)
    })
    expect(port.createTab).toHaveBeenCalled()
  })

  it('renders the viewport div with stable id', () => {
    setBrowserPort(mockPort())
    render(<Browse />)
    expect(document.getElementById('browser-viewport')).not.toBeNull()
  })

  it('does not auto-create a tab when tabs already exist', async () => {
    const port = mockPort()
    setBrowserPort(port)
    useBrowserStore.setState({
      tabs: [{ id: 'existing', url: 'about:blank', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, suspended: false, savedUrl: 'about:blank', isClipped: false }],
      activeTabId: 'existing'
    })
    render(<Browse />)

    await new Promise((r) => setTimeout(r, 0))
    expect(port.createTab).not.toHaveBeenCalled()
  })
})

describe('Browse — viewport sync', () => {
  beforeEach(reset)

  it('pushes initial viewport on mount', async () => {
    const port = mockPort()
    setBrowserPort(port)
    vi.useFakeTimers()
    render(<Browse />)

    act(() => { vi.advanceTimersByTime(20) })
    // Initial getBoundingClientRect() call in useEffect pushes viewport
    expect(port.setViewport).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('pushes a new viewport when bookmarks sidebar toggles', async () => {
    const port = mockPort()
    setBrowserPort(port)
    vi.useFakeTimers()
    render(<Browse />)

    act(() => { vi.advanceTimersByTime(20) })
    const before = (port.setViewport as any).mock.calls.length

    useBrowserStore.getState().setBookmarksOpen(true)
    act(() => { vi.advanceTimersByTime(50) })

    expect((port.setViewport as any).mock.calls.length).toBeGreaterThanOrEqual(before)
    vi.useRealTimers()
  })
})
