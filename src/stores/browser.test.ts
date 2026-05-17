// src/stores/browser.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useBrowserStore, setBrowserPort, setBrowserEventPort } from './browser'
import type { BrowserPort, BrowserEventPort } from './browser'

function reset() {
  useBrowserStore.setState({
    tabs: [],
    activeTabId: null,
    bookmarksOpen: false,
    viewport: { x: 0, y: 0, width: 0, height: 0 }
  })
}

function makePort(overrides: Partial<BrowserPort> = {}): BrowserPort {
  return {
    createTab: vi.fn(async (url) => ({ id: 'mock-' + Math.random().toString(36).slice(2, 6), url: url ?? 'about:blank' })),
    closeTab: vi.fn(async () => {}),
    activateTab: vi.fn(async () => {}),
    navigate: vi.fn(async () => {}),
    reload: vi.fn(async () => {}),
    goBack: vi.fn(async () => {}),
    goForward: vi.fn(async () => {}),
    setReaderMode: vi.fn(async () => {}),
    setViewport: vi.fn(async () => {}),
    suspendTab: vi.fn(async (_id: string) => {}),
    resumeTab: vi.fn(async (id: string) => ({ id, url: 'about:blank' })),
    ...overrides
  }
}

function makeEventPort() {
  const handlers: Record<string, ((p: any) => void)[]> = {}
  const port: BrowserEventPort = {
    onTabStateChanged: (h) => {
      handlers['tabStateChanged'] ??= []
      handlers['tabStateChanged'].push(h)
      return () => {}
    }
  }
  return { port, fire: (p: any) => handlers['tabStateChanged']?.forEach((h) => h(p)) }
}

// --- 4.1 State ---

describe('browser store — state', () => {
  beforeEach(reset)

  it('starts empty when reset', () => {
    const s = useBrowserStore.getState()
    expect(s.tabs).toEqual([])
    expect(s.activeTabId).toBe(null)
    expect(s.bookmarksOpen).toBe(false)
  })

  it('exposes selectors for active tab', () => {
    useBrowserStore.setState({
      tabs: [
        { id: 't1', url: 'https://a', title: 'A', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: 'https://a', isClipped: false }
      ],
      activeTabId: 't1'
    })
    expect(useBrowserStore.getState().getActiveTab()?.id).toBe('t1')
  })
})

// --- 4.2 Actions ---

describe('browser store — actions', () => {
  beforeEach(reset)

  it('createTab appends and activates a new tab', async () => {
    const port = makePort({
      createTab: vi.fn(async (url) => ({ id: 'new-1', url: url ?? 'about:blank' }))
    })
    setBrowserPort(port)

    await useBrowserStore.getState().createTab('https://example.com')

    const s = useBrowserStore.getState()
    expect(s.tabs).toHaveLength(1)
    expect(s.tabs[0].id).toBe('new-1')
    expect(s.activeTabId).toBe('new-1')
    expect(port.createTab).toHaveBeenCalledWith('https://example.com')
  })

  it('closeTab removes the tab; if it was active, switch to the right neighbour', async () => {
    const port = makePort()
    setBrowserPort(port)
    useBrowserStore.setState({
      tabs: [
        { id: 'a', url: '', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: '', isClipped: false },
        { id: 'b', url: '', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: '', isClipped: false },
        { id: 'c', url: '', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: '', isClipped: false }
      ],
      activeTabId: 'b'
    })

    await useBrowserStore.getState().closeTab('b')

    const s = useBrowserStore.getState()
    expect(s.tabs.map((t) => t.id)).toEqual(['a', 'c'])
    expect(s.activeTabId).toBe('c')
    expect(port.closeTab).toHaveBeenCalledWith('b')
  })

  it('closeTab on the last remaining tab triggers a fresh blank tab', async () => {
    const port = makePort({
      createTab: vi.fn(async () => ({ id: 'fresh', url: 'about:blank' }))
    })
    setBrowserPort(port)
    useBrowserStore.setState({
      tabs: [
        { id: 'only', url: 'https://x', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: 'https://x', isClipped: false }
      ],
      activeTabId: 'only'
    })

    await useBrowserStore.getState().closeTab('only')

    const s = useBrowserStore.getState()
    expect(s.tabs).toHaveLength(1)
    expect(s.tabs[0].id).toBe('fresh')
  })

  it('activateTab calls port.activateTab and updates state', async () => {
    const port = makePort()
    setBrowserPort(port)
    useBrowserStore.setState({
      tabs: [
        { id: 'a', url: '', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: '', isClipped: false },
        { id: 'b', url: '', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: '', isClipped: false }
      ],
      activeTabId: 'a'
    })

    await useBrowserStore.getState().activateTab('b')

    expect(useBrowserStore.getState().activeTabId).toBe('b')
    expect(port.activateTab).toHaveBeenCalledWith('b')
  })

  it('reorderTab moves a tab to the target index', () => {
    useBrowserStore.setState({
      tabs: [
        { id: 'a', url: '', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: '', isClipped: false },
        { id: 'b', url: '', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: '', isClipped: false },
        { id: 'c', url: '', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: '', isClipped: false }
      ]
    })
    useBrowserStore.getState().reorderTab('a', 2)
    expect(useBrowserStore.getState().tabs.map((t) => t.id)).toEqual(['b', 'c', 'a'])
  })

  it('setReaderMode flips the local flag and forwards to port', async () => {
    const port = makePort()
    setBrowserPort(port)
    useBrowserStore.setState({
      tabs: [
        { id: 'a', url: '', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: '', isClipped: false }
      ],
      activeTabId: 'a'
    })

    await useBrowserStore.getState().setReaderMode('a', true)

    expect(useBrowserStore.getState().tabs[0].readerMode).toBe(true)
    expect(port.setReaderMode).toHaveBeenCalledWith('a', true)
  })

  it('navigate forwards to port and locally patches savedUrl', async () => {
    const port = makePort()
    setBrowserPort(port)
    useBrowserStore.setState({
      tabs: [
        { id: 'a', url: 'https://old', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: 'https://old', isClipped: false }
      ],
      activeTabId: 'a'
    })

    await useBrowserStore.getState().navigate('a', 'https://new')

    expect(port.navigate).toHaveBeenCalledWith('a', 'https://new')
    expect(useBrowserStore.getState().tabs[0].savedUrl).toBe('https://new')
  })

  it('setViewport debounces — last value wins and reaches port within 16ms', async () => {
    vi.useFakeTimers()
    const port = makePort()
    setBrowserPort(port)

    useBrowserStore.getState().setViewport({ x: 0, y: 0, width: 100, height: 100 })
    useBrowserStore.getState().setViewport({ x: 0, y: 0, width: 200, height: 200 })
    useBrowserStore.getState().setViewport({ x: 0, y: 0, width: 300, height: 300 })

    expect(port.setViewport).not.toHaveBeenCalled()
    vi.advanceTimersByTime(16)
    expect(port.setViewport).toHaveBeenCalledTimes(1)
    expect(port.setViewport).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 300, height: 300 })

    expect(useBrowserStore.getState().viewport).toEqual({ x: 0, y: 0, width: 300, height: 300 })
    vi.useRealTimers()
  })
})

// --- 4.3 tabStateChanged subscription ---

describe('browser store — tabStateChanged subscription', () => {
  beforeEach(reset)

  it('applies patches to the matching tab', () => {
    const ep = makeEventPort()
    setBrowserEventPort(ep.port)

    useBrowserStore.setState({
      tabs: [
        { id: 'a', url: 'https://x', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: 'https://x', isClipped: false }
      ],
      activeTabId: 'a'
    })

    ep.fire({ tabId: 'a', patch: { title: 'Hello', loading: true } })

    expect(useBrowserStore.getState().tabs[0]).toMatchObject({
      title: 'Hello',
      loading: true
    })
  })

  it('ignores patches for unknown tabs', () => {
    const ep = makeEventPort()
    setBrowserEventPort(ep.port)

    ep.fire({ tabId: 'ghost', patch: { title: 'X' } })

    expect(useBrowserStore.getState().tabs).toEqual([])
  })
})

// --- 4.4 LRU suspend ---

describe('browser store — LRU suspend', () => {
  beforeEach(reset)

  it('suspends the oldest non-active tab when alive count would exceed 20', async () => {
    const port = makePort({
      createTab: vi.fn(async (url) => ({ id: 'new', url: url ?? 'about:blank' })),
      suspendTab: vi.fn(async () => {})
    })
    setBrowserPort(port)

    useBrowserStore.setState({
      tabs: Array.from({ length: 20 }, (_, i) => ({
        id: `t${i + 1}`, url: '', title: '', favicon: null,
        loading: false, canGoBack: false, canGoForward: false,
        readerMode: false, suspended: false, savedUrl: '', isClipped: false })),
      activeTabId: 't20'
    })

    await useBrowserStore.getState().createTab('https://new')

    const s = useBrowserStore.getState()
    expect(s.tabs).toHaveLength(21)
    const t1 = s.tabs.find((t) => t.id === 't1')!
    expect(t1.suspended).toBe(true)
    expect(port.suspendTab).toHaveBeenCalledWith('t1')
  })

  it('does not suspend the active tab even if it is oldest', async () => {
    const port = makePort({
      createTab: vi.fn(async () => ({ id: 'new', url: 'about:blank' })),
      suspendTab: vi.fn(async () => {})
    })
    setBrowserPort(port)

    useBrowserStore.setState({
      tabs: Array.from({ length: 20 }, (_, i) => ({
        id: `t${i + 1}`, url: '', title: '', favicon: null,
        loading: false, canGoBack: false, canGoForward: false,
        readerMode: false, suspended: false, savedUrl: '', isClipped: false })),
      activeTabId: 't1'
    })

    await useBrowserStore.getState().createTab()

    expect(port.suspendTab).toHaveBeenCalledWith('t2')
  })
})

// --- 4.5 Resume ---

describe('browser store — resume', () => {
  beforeEach(reset)

  it('activateTab on a suspended tab calls resumeTab and clears suspended flag', async () => {
    const port = makePort({
      resumeTab: vi.fn(async (id) => ({ id, url: 'https://restored' }))
    })
    setBrowserPort(port)

    useBrowserStore.setState({
      tabs: [
        { id: 'a', url: 'https://restored', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: true, savedUrl: 'https://restored', isClipped: false }
      ],
      activeTabId: null
    })

    await useBrowserStore.getState().activateTab('a')

    expect(port.resumeTab).toHaveBeenCalledWith('a')
    expect(port.activateTab).toHaveBeenCalledWith('a')
    const s = useBrowserStore.getState()
    expect(s.activeTabId).toBe('a')
    expect(s.tabs[0].suspended).toBe(false)
    expect(s.tabs[0].loading).toBe(true)
  })
})
