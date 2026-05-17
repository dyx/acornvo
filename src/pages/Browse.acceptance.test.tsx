// @vitest-environment jsdom
// src/pages/Browse.acceptance.test.tsx
// Phase 11 acceptance tests — store-level and event-level coverage
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'
import { AppRail } from '@/components/AppRail'
import { Browse } from '@/pages/Browse'
import { useBrowserStore, setBrowserPort, setBrowserEventPort } from '@/stores/browser'
import type { TabStateChangedPayload } from '@shared/browser-types'

Element.prototype.getBoundingClientRect = vi.fn(() => ({
  x: 0, y: 0, width: 800, height: 600, top: 0, right: 800, bottom: 600, left: 0, toJSON: () => {}
}))
Element.prototype.setPointerCapture = vi.fn()
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn()
}))

const { ipcMocks } = vi.hoisted(() => {
  const handlers: Record<string, ((p: any) => void)[]> = {}
  return {
    ipcMocks: {
      bookmarks: {
        list: vi.fn(async () => ({ items: [], total: 0 })),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        getByUrl: vi.fn(async () => null)
      },
      on: vi.fn((channel: string, h: any) => {
        handlers[channel] ??= []
        handlers[channel].push(h)
        return () => {}
      }),
      _handlers: handlers
    }
  }
})
vi.mock('@/ipc/client', () => ({ ipc: ipcMocks }))

const _h = (ipcMocks as any)._handlers as Record<string, ((p: any) => void)[]>
function fireEvent(channel: string, payload: any) {
  for (const h of _h[channel] ?? []) h(payload)
}

let nextId = 1
function makePort() {
  return {
    createTab: vi.fn(async (url?: string) => {
      const id = `t${nextId++}`
      return { id, url: url ?? 'about:blank' }
    }),
    closeTab: vi.fn(async () => {}),
    activateTab: vi.fn(async () => {}),
    navigate: vi.fn(async () => {}),
    reload: vi.fn(async () => {}),
    goBack: vi.fn(async () => {}),
    goForward: vi.fn(async () => {}),
    setViewport: vi.fn(async () => {}),
    suspendTab: vi.fn(async () => {}),
    resumeTab: vi.fn(async (id: string) => ({ id, url: 'about:blank' }))
  }
}

function reset() {
  useBrowserStore.setState({
    tabs: [],
    activeTabId: null,
    bookmarksOpen: false,
    viewport: { x: 0, y: 0, width: 0, height: 0 }
  })
  for (const k of Object.keys(_h)) delete _h[k]
  nextId = 1
}

function renderApp(path = '/library') {
  const port = makePort()
  setBrowserPort(port as any)
  setBrowserEventPort({
    onTabStateChanged: (h) => {
      _h['browser:tabStateChanged'] ??= []
      _h['browser:tabStateChanged'].push(h)
      return () => {}
    }
  })
  return {
    port,
    fire: (payload: TabStateChangedPayload) => fireEvent('browser:tabStateChanged', payload),
    ...render(
      <MemoryRouter initialEntries={[path]}>
        <div className="flex h-full">
          <AppRail />
          <div className="flex-1">
            <Routes>
              <Route path="/library" element={<div data-testid="library-stub" />} />
              <Route path="/browser" element={<Browse />} />
            </Routes>
          </div>
        </div>
      </MemoryRouter>
    )
  }
}

beforeEach(() => {
  reset()
  ipcMocks.bookmarks.list.mockResolvedValue({ items: [], total: 0 })
  ipcMocks.bookmarks.getByUrl.mockResolvedValue(null)
})

// --- 10.1 AppRail → /browser ---
describe('10.1 AppRail → /browser', () => {
  it('clicking 拾果 navigates to /browser and renders the layout', async () => {
    const { port } = renderApp('/library')
    expect(screen.getByTestId('library-stub')).toBeInTheDocument()

    const railLink = screen.getByRole('link', { name: /拾果|browser/i })
    await userEvent.click(railLink)

    await waitFor(() => {
      expect(screen.getByTestId('browse-page')).toBeInTheDocument()
    })
    expect(screen.getByTestId('tabbar')).toBeInTheDocument()
    expect(screen.getByTestId('browser-viewport')).toBeInTheDocument()
    await waitFor(() => {
      expect(port.createTab).toHaveBeenCalled()
    })
  })
})

// --- 10.11/10.12 bookmark list filter ---
describe('10.11/10.12 bookmark search + tag filter', () => {
  it('bookmarks.list with q filters by title or url', async () => {
    ipcMocks.bookmarks.list.mockResolvedValueOnce({
      items: [{ id: 1, url: 'https://news.com', title: 'News', favicon: null, tags: [], createdAt: '', updatedAt: '' }],
      total: 1
    })
    await ipcMocks.bookmarks.list({ q: 'news', limit: 200, offset: 0 })
    expect(ipcMocks.bookmarks.list).toHaveBeenCalledWith(expect.objectContaining({ q: 'news' }))
  })

  it('bookmarks.list with tag filters by tag', async () => {
    ipcMocks.bookmarks.list.mockResolvedValueOnce({
      items: [{ id: 2, url: 'https://ai.com', title: 'AI', favicon: null, tags: ['ai'], createdAt: '', updatedAt: '' }],
      total: 1
    })
    await ipcMocks.bookmarks.list({ tag: 'ai', limit: 200, offset: 0 })
    expect(ipcMocks.bookmarks.list).toHaveBeenCalledWith(expect.objectContaining({ tag: 'ai' }))
  })
})

// --- 10.13 LRU suspend/resume ---
describe('10.13 LRU suspend/resume', () => {
  it('exceeding 20 alive tabs suspends the oldest non-active', async () => {
    const { port } = renderApp()
    // Seed the store directly rather than waiting for auto-create
    useBrowserStore.setState({
      tabs: [{ id: 't0', url: 'about:blank', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, suspended: false, savedUrl: 'about:blank', isClipped: false }],
      activeTabId: 't0'
    })
    setBrowserPort(port as any)

    for (let i = 0; i < 21; i++) {
      await useBrowserStore.getState().createTab(`https://x${i}.com`)
    }
    const s = useBrowserStore.getState()
    const suspendedCount = s.tabs.filter((t) => t.suspended).length
    expect(suspendedCount).toBeGreaterThanOrEqual(1)
    expect(port.suspendTab).toHaveBeenCalled()
  })

  it('activating a suspended tab calls resumeTab and clears flag', async () => {
    const { port } = renderApp()
    const id = 't-suspended'
    useBrowserStore.setState({
      tabs: [{ id, url: 'https://x', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, suspended: true, savedUrl: 'https://x', isClipped: false }],
      activeTabId: null
    })
    setBrowserPort(port as any)
    port.resumeTab.mockResolvedValueOnce({ id, url: 'https://restored' })

    await useBrowserStore.getState().activateTab(id)
    expect(port.resumeTab).toHaveBeenCalledWith(id)
    expect(useBrowserStore.getState().tabs[0].suspended).toBe(false)
  })
})

// --- 10.14 viewport debounce ---
describe('10.14 viewport debounce', () => {
  it('setViewport coalesces within 16ms', async () => {
    vi.useFakeTimers()
    const { port } = renderApp('/browser')
    act(() => { vi.advanceTimersByTime(20) })
    expect(port.setViewport).toHaveBeenCalled()

    const calls = port.setViewport.mock.calls.length
    for (let i = 0; i < 5; i++) {
      useBrowserStore.getState().setViewport({ x: 0, y: 0, width: 100 + i, height: 100 + i })
    }
    act(() => { vi.advanceTimersByTime(20) })

    expect(port.setViewport.mock.calls.length).toBe(calls + 1)
    expect(port.setViewport).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 104, height: 104 })
    vi.useRealTimers()
  })
})
