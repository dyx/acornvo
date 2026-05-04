// src/stores/browser.ts
import { create } from 'zustand'
import type { Tab, TabId, TabPatch, SetViewportArgs, TabStateChangedPayload } from '@shared/browser-types'

const BLANK_URL = 'about:blank'
const ALIVE_LIMIT = 20

export interface BrowserPort {
  createTab(url?: string): Promise<{ id: TabId; url: string }>
  closeTab(id: TabId): Promise<void>
  activateTab(id: TabId): Promise<void>
  navigate(id: TabId, url: string): Promise<void>
  reload(id: TabId): Promise<void>
  goBack(id: TabId): Promise<void>
  goForward(id: TabId): Promise<void>
  setReaderMode(id: TabId, on: boolean): Promise<void>
  setViewport(rect: SetViewportArgs): Promise<void>
  suspendTab(id: TabId): Promise<void>
  resumeTab(id: TabId): Promise<{ id: TabId; url: string }>
}

let port: BrowserPort = {
  createTab: () => { throw new Error('BrowserPort not configured') },
  closeTab: () => { throw new Error('BrowserPort not configured') },
  activateTab: () => { throw new Error('BrowserPort not configured') },
  navigate: () => { throw new Error('BrowserPort not configured') },
  reload: () => { throw new Error('BrowserPort not configured') },
  goBack: () => { throw new Error('BrowserPort not configured') },
  goForward: () => { throw new Error('BrowserPort not configured') },
  setReaderMode: () => { throw new Error('BrowserPort not configured') },
  setViewport: () => { throw new Error('BrowserPort not configured') },
  suspendTab: () => { throw new Error('BrowserPort not configured') },
  resumeTab: () => { throw new Error('BrowserPort not configured') }
}

export function setBrowserPort(p: BrowserPort): void {
  port = p
}

// --- Event port (task 4.3) ---

export type EventOff = () => void
export interface BrowserEventPort {
  onTabStateChanged(handler: (payload: TabStateChangedPayload) => void): EventOff
}

let eventOff: EventOff | null = null

export function setBrowserEventPort(p: BrowserEventPort): void {
  if (eventOff) eventOff()
  eventOff = p.onTabStateChanged(({ tabId, patch }) => {
    useBrowserStore.getState().applyTabPatch(tabId, patch)
  })
}

// --- Tab factory ---

function makeTab(id: TabId, url: string): Tab {
  return {
    id,
    url,
    title: '',
    favicon: null,
    loading: false,
    canGoBack: false,
    canGoForward: false,
    readerMode: false,
    suspended: false,
    savedUrl: url
  }
}

// --- Store ---

let viewportTimer: ReturnType<typeof setTimeout> | null = null

export interface BrowserState {
  tabs: Tab[]
  activeTabId: TabId | null
  bookmarksOpen: boolean
  viewport: SetViewportArgs

  getActiveTab(): Tab | undefined
  getTabIndex(id: TabId): number

  createTab(url?: string): Promise<TabId>
  closeTab(id: TabId): Promise<void>
  activateTab(id: TabId): Promise<void>
  reorderTab(id: TabId, targetIndex: number): void
  setReaderMode(id: TabId, on: boolean): Promise<void>
  navigate(id: TabId, url: string): Promise<void>
  setViewport(rect: SetViewportArgs): void
  setBookmarksOpen(open: boolean): void
  applyTabPatch(id: TabId, patch: TabPatch): void
}

export const useBrowserStore = create<BrowserState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  bookmarksOpen: false,
  viewport: { x: 0, y: 0, width: 0, height: 0 },

  getActiveTab: () => {
    const id = get().activeTabId
    return id ? get().tabs.find((t) => t.id === id) : undefined
  },
  getTabIndex: (id) => get().tabs.findIndex((t) => t.id === id),

  async createTab(url) {
    const stateBefore = get()
    const aliveTabs = stateBefore.tabs.filter((t) => !t.suspended)
    if (aliveTabs.length >= ALIVE_LIMIT) {
      // Pick the oldest non-active alive tab
      const victim = aliveTabs.find((t) => t.id !== stateBefore.activeTabId)
      if (victim) {
        await port.suspendTab(victim.id)
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === victim.id ? { ...t, suspended: true } : t
          )
        }))
      }
    }
    const created = await port.createTab(url)
    set((s) => ({
      tabs: [...s.tabs, makeTab(created.id, created.url)],
      activeTabId: created.id
    }))
    return created.id
  },

  async closeTab(id) {
    await port.closeTab(id)
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex((t) => t.id === id)
    if (idx === -1) return
    const remaining = tabs.filter((t) => t.id !== id)
    if (remaining.length === 0) {
      const blank = await port.createTab(BLANK_URL)
      set({ tabs: [makeTab(blank.id, blank.url)], activeTabId: blank.id })
      return
    }
    let nextActive = activeTabId
    if (activeTabId === id) {
      const after = tabs[idx + 1]
      const before = tabs[idx - 1]
      nextActive = (after ?? before)!.id
      await port.activateTab(nextActive)
    }
    set({ tabs: remaining, activeTabId: nextActive })
  },

  async activateTab(id) {
    const tab = get().tabs.find((t) => t.id === id)
    if (tab?.suspended) {
      await port.resumeTab(id)
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === id ? { ...t, suspended: false, loading: true } : t
        )
      }))
    }
    await port.activateTab(id)
    set({ activeTabId: id })
  },

  reorderTab(id, targetIndex) {
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id)
      if (idx === -1) return s
      const next = s.tabs.slice()
      const [moved] = next.splice(idx, 1)
      const clamped = Math.max(0, Math.min(targetIndex, next.length))
      next.splice(clamped, 0, moved)
      return { tabs: next }
    })
  },

  async setReaderMode(id, on) {
    await port.setReaderMode(id, on)
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, readerMode: on } : t))
    }))
  },

  async navigate(id, url) {
    await port.navigate(id, url)
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, savedUrl: url, loading: true } : t
      )
    }))
  },

  setViewport(rect) {
    set({ viewport: rect })
    if (viewportTimer) clearTimeout(viewportTimer)
    viewportTimer = setTimeout(() => {
      void port.setViewport(rect)
    }, 16)
  },

  setBookmarksOpen(open) {
    set({ bookmarksOpen: open })
  },

  applyTabPatch(id, patch) {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch, savedUrl: patch.url ?? t.savedUrl } : t))
    }))
  }
}))
