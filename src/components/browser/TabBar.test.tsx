// src/components/browser/TabBar.test.tsx
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { TabBar } from './TabBar'
import { useBrowserStore, setBrowserPort } from '@/stores/browser'

// jsdom does not implement setPointerCapture
Element.prototype.setPointerCapture = vi.fn()

function tab(id: string, overrides: Partial<any> = {}) {
  return {
    id,
    url: 'https://x',
    title: id,
    favicon: null,
    loading: false,
    canGoBack: false,
    canGoForward: false,
    suspended: false,
    savedUrl: 'https://x',
    isClipped: false,
    ...overrides
  }
}

const port = {
  createTab: vi.fn(async () => ({ id: 'new', url: 'about:blank' })),
  closeTab: vi.fn(),
  activateTab: vi.fn(),
  navigate: vi.fn(), reload: vi.fn(), goBack: vi.fn(), goForward: vi.fn(),
  setViewport: vi.fn(), suspendTab: vi.fn(), resumeTab: vi.fn()
} as any

describe('TabBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setBrowserPort(port)
    useBrowserStore.setState({ tabs: [], activeTabId: null, bookmarksOpen: false, viewport: { x: 0, y: 0, width: 0, height: 0 } })
  })
  afterEach(() => {
    cleanup()
    useBrowserStore.setState({ tabs: [], activeTabId: null, bookmarksOpen: false, viewport: { x: 0, y: 0, width: 0, height: 0 } })
  })

  it('renders one button per tab + a "+" button', () => {
    useBrowserStore.setState({
      tabs: [tab('a'), tab('b')],
      activeTabId: 'a'
    })
    render(<TabBar />)
    expect(screen.getByTestId('tabbar')).toBeInTheDocument()
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(screen.getByRole('button', { name: /new tab/i })).toBeInTheDocument()
  })

  it('marks the active tab with aria-selected=true', () => {
    useBrowserStore.setState({
      tabs: [tab('a'), tab('b')],
      activeTabId: 'b'
    })
    render(<TabBar />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false')
  })

  it('clicking a tab calls activateTab', async () => {
    useBrowserStore.setState({
      tabs: [tab('a'), tab('b')],
      activeTabId: 'a'
    })
    render(<TabBar />)
    await userEvent.click(screen.getAllByRole('tab')[1])
    expect(port.activateTab).toHaveBeenCalledWith('b')
  })

  it('clicking the close button calls closeTab', async () => {
    useBrowserStore.setState({
      tabs: [tab('a'), tab('b')],
      activeTabId: 'a'
    })
    render(<TabBar />)
    const closeBtn = screen.getByLabelText('close tab a')
    await userEvent.click(closeBtn)
    expect(port.closeTab).toHaveBeenCalledWith('a')
  })

  it('clicking "+" calls createTab', async () => {
    useBrowserStore.setState({
      tabs: [tab('a')],
      activeTabId: 'a'
    })
    render(<TabBar />)
    await userEvent.click(screen.getByRole('button', { name: /new tab/i }))
    expect(port.createTab).toHaveBeenCalled()
  })

  it('shows spinner when tab.loading is true', () => {
    useBrowserStore.setState({
      tabs: [tab('a', { loading: true })],
      activeTabId: 'a'
    })
    render(<TabBar />)
    expect(screen.getByTestId('tab-spinner-a')).toBeInTheDocument()
  })

  it('drag-and-drop reorders the tabs', () => {
    useBrowserStore.setState({
      tabs: [tab('a'), tab('b'), tab('c')],
      activeTabId: 'a'
    })
    render(<TabBar />)
    const tabs = screen.getAllByRole('tab')
    const tabA = tabs[0]
    const tabC = tabs[2]

    fireEvent.pointerDown(tabA, { pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(tabA, { pointerId: 1, clientX: 500, clientY: 0 })
    fireEvent.pointerUp(tabC, { pointerId: 1, clientX: 500, clientY: 0 })

    const ids = useBrowserStore.getState().tabs.map((t) => t.id)
    expect(ids).toEqual(['b', 'c', 'a'])
  })
})
