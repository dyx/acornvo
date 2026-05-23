// @vitest-environment jsdom
// src/hooks/useBrowserHotkeys.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { fireEvent } from '@testing-library/dom'
import { useBrowserHotkeys } from './useBrowserHotkeys'
import { useBrowserStore, setBrowserPort } from '@/stores/browser'

const port = {
  createTab: vi.fn(async () => ({ id: 'new', url: 'about:blank' })),
  closeTab: vi.fn(),
  activateTab: vi.fn(),
  navigate: vi.fn(async () => {}),
  reload: vi.fn(async () => {}),
  goBack: vi.fn(async () => {}),
  goForward: vi.fn(async () => {}),
  setViewport: vi.fn(async () => {}),
  suspendTab: vi.fn(async () => {}),
  resumeTab: vi.fn(async (id: string) => ({ id, url: 'about:blank' }))
} as any

function makeTab(id: string) {
  return {
    id,
    url: 'https://x',
    title: id,
    favicon: null,
    loading: false,
    canGoBack: true,
    canGoForward: true,
    suspended: false,
    savedUrl: 'https://x'
  }
}

function reset(tabs: any[] = [], active: string | null = null) {
  useBrowserStore.setState({
    tabs,
    activeTabId: active,
    bookmarksOpen: false,
    viewport: { x: 0, y: 0, width: 0, height: 0 }
  })
}

describe('useBrowserHotkeys', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setBrowserPort(port)
  })

  // 7.1 Cmd+T / Cmd+W
  describe('Cmd+T / Cmd+W', () => {
    it('Cmd+T calls createTab', () => {
      reset([makeTab('a')], 'a')
      renderHook(() => useBrowserHotkeys())
      fireEvent.keyDown(window, { key: 't', metaKey: true })
      expect(port.createTab).toHaveBeenCalled()
    })

    it('Ctrl+T calls createTab', () => {
      reset([makeTab('a')], 'a')
      renderHook(() => useBrowserHotkeys())
      fireEvent.keyDown(window, { key: 't', ctrlKey: true })
      expect(port.createTab).toHaveBeenCalled()
    })

    it('Cmd+W calls closeTab on active tab', () => {
      reset([makeTab('a'), makeTab('b')], 'a')
      renderHook(() => useBrowserHotkeys())
      fireEvent.keyDown(window, { key: 'w', metaKey: true })
      expect(port.closeTab).toHaveBeenCalledWith('a')
    })

    it('Cmd+W with single tab calls closeTab on it', () => {
      reset([makeTab('only')], 'only')
      renderHook(() => useBrowserHotkeys())
      fireEvent.keyDown(window, { key: 'w', metaKey: true })
      expect(port.closeTab).toHaveBeenCalledWith('only')
    })
  })

  // 7.2 Tab cycling
  describe('tab cycling', () => {
    it('Cmd+Tab cycles to the next tab (wraps at end)', () => {
      reset([makeTab('a'), makeTab('b'), makeTab('c')], 'b')
      renderHook(() => useBrowserHotkeys())
      fireEvent.keyDown(window, { key: 'Tab', metaKey: true })
      expect(port.activateTab).toHaveBeenCalledWith('c')
    })

    it('Cmd+Shift+Tab cycles to the previous tab (wraps at start)', () => {
      reset([makeTab('a'), makeTab('b'), makeTab('c')], 'b')
      renderHook(() => useBrowserHotkeys())
      fireEvent.keyDown(window, { key: 'Tab', metaKey: true, shiftKey: true })
      expect(port.activateTab).toHaveBeenCalledWith('a')
    })

    it('Cmd+Tab with one tab is a no-op', () => {
      reset([makeTab('a')], 'a')
      renderHook(() => useBrowserHotkeys())
      fireEvent.keyDown(window, { key: 'Tab', metaKey: true })
      expect(port.activateTab).not.toHaveBeenCalled()
    })
  })

  // 7.3 Cmd+1..9
  describe('Cmd+N number keys', () => {
    it('Cmd+3 activates the third tab', () => {
      reset([makeTab('a'), makeTab('b'), makeTab('c'), makeTab('d')], 'a')
      renderHook(() => useBrowserHotkeys())
      fireEvent.keyDown(window, { key: '3', metaKey: true })
      expect(port.activateTab).toHaveBeenCalledWith('c')
    })

    it('Cmd+9 activates the LAST tab when fewer than 9 exist', () => {
      reset([makeTab('a'), makeTab('b'), makeTab('c')], 'a')
      renderHook(() => useBrowserHotkeys())
      fireEvent.keyDown(window, { key: '9', metaKey: true })
      expect(port.activateTab).toHaveBeenCalledWith('c')
    })

    it('Cmd+1 activates the first tab', () => {
      reset([makeTab('a'), makeTab('b')], 'b')
      renderHook(() => useBrowserHotkeys())
      fireEvent.keyDown(window, { key: '1', metaKey: true })
      expect(port.activateTab).toHaveBeenCalledWith('a')
    })

    it('Cmd+5 with only 2 tabs is a no-op', () => {
      reset([makeTab('a'), makeTab('b')], 'a')
      renderHook(() => useBrowserHotkeys())
      fireEvent.keyDown(window, { key: '5', metaKey: true })
      expect(port.activateTab).not.toHaveBeenCalled()
    })
  })

  // 7.5 Back/Forward/Reload
  describe('back/forward/reload', () => {
    it('Cmd+[ calls goBack', () => {
      reset([makeTab('a')], 'a')
      renderHook(() => useBrowserHotkeys())
      fireEvent.keyDown(window, { key: '[', metaKey: true })
      expect(port.goBack).toHaveBeenCalledWith('a')
    })

    it('Cmd+] calls goForward', () => {
      reset([makeTab('a')], 'a')
      renderHook(() => useBrowserHotkeys())
      fireEvent.keyDown(window, { key: ']', metaKey: true })
      expect(port.goForward).toHaveBeenCalledWith('a')
    })

    it('Cmd+R calls reload', () => {
      reset([makeTab('a')], 'a')
      renderHook(() => useBrowserHotkeys())
      fireEvent.keyDown(window, { key: 'r', metaKey: true })
      expect(port.reload).toHaveBeenCalledWith('a')
    })
  })
})
