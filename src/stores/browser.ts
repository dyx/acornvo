// src/stores/browser.ts
import { create } from 'zustand'
import type {
  Tab,
  TabId,
  TabPatch,
  SetViewportArgs,
  TabStateChangedPayload
} from '@shared/browser-types'
import { getClipsPort } from '@/ipc/clips-port'

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
  setViewport(rect: SetViewportArgs): Promise<void>
  suspendTab(id: TabId): Promise<void>
  resumeTab(id: TabId): Promise<{ id: TabId; url: string }>
  hideBrowserView(): Promise<void>
  showBrowserView(): Promise<void>
}

let port: BrowserPort = {
  createTab: () => {
    throw new Error('BrowserPort not configured')
  },
  closeTab: () => {
    throw new Error('BrowserPort not configured')
  },
  activateTab: () => {
    throw new Error('BrowserPort not configured')
  },
  navigate: () => {
    throw new Error('BrowserPort not configured')
  },
  reload: () => {
    throw new Error('BrowserPort not configured')
  },
  goBack: () => {
    throw new Error('BrowserPort not configured')
  },
  goForward: () => {
    throw new Error('BrowserPort not configured')
  },
  setViewport: () => {
    throw new Error('BrowserPort not configured')
  },
  suspendTab: () => {
    throw new Error('BrowserPort not configured')
  },
  resumeTab: () => {
    throw new Error('BrowserPort not configured')
  },
  hideBrowserView: () => {
    throw new Error('BrowserPort not configured')
  },
  showBrowserView: () => {
    throw new Error('BrowserPort not configured')
  }
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
    suspended: false,
    savedUrl: url,
    isClipped: false
  }
}

// --- Store ---

let viewportTimer: ReturnType<typeof setTimeout> | null = null

// --- isClipped sync (phase-12) ---
const clipCheckTimers = new Map<string, ReturnType<typeof setTimeout>>()

function scheduleClipCheck(tabId: string, url: string): void {
  const prev = clipCheckTimers.get(tabId)
  if (prev) clearTimeout(prev)
  const t = setTimeout(async () => {
    try {
      const r = await getClipsPort().getByUrl({ url })
      if (!r.ok) return
      const clipped = r.data !== null
      useBrowserStore.setState((s) => ({
        tabs: s.tabs.map((tab) => (tab.id === tabId ? { ...tab, isClipped: clipped } : tab))
      }))
    } catch {
      // swallow — best-effort indicator
    }
  }, 200)
  clipCheckTimers.set(tabId, t)
}

export interface BrowserState {
  tabs: Tab[]
  activeTabId: TabId | null
  bookmarksOpen: boolean
  bookmarksRevision: number
  viewport: SetViewportArgs

  getActiveTab(): Tab | undefined
  getTabIndex(id: TabId): number

  createTab(url?: string): Promise<TabId>
  closeTab(id: TabId): Promise<void>
  activateTab(id: TabId): Promise<void>
  reorderTab(id: TabId, targetIndex: number): void
  navigate(id: TabId, url: string): Promise<void>
  goBack(id: TabId): Promise<void>
  goForward(id: TabId): Promise<void>
  reload(id: TabId): Promise<void>
  setViewport(rect: SetViewportArgs): void
  setBookmarksOpen(open: boolean): void
  bumpBookmarksRevision(): void
  applyTabPatch(id: TabId, patch: TabPatch): void

  isOccluded: boolean
  setOccluded(occluded: boolean): void
}

export const useBrowserStore = create<BrowserState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  bookmarksOpen: false,
  bookmarksRevision: 0,
  viewport: { x: 0, y: 0, width: 0, height: 0 },
  isOccluded: false,

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
          tabs: s.tabs.map((t) => (t.id === victim.id ? { ...t, suspended: true } : t))
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
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex((t) => t.id === id)
    if (idx === -1) return

    if (tabs.length === 1) {
      const tab = tabs[0]
      if (tab.url !== BLANK_URL) {
        await port.navigate(id, BLANK_URL)
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === id
              ? { ...t, url: BLANK_URL, savedUrl: BLANK_URL, title: '', favicon: null, isClipped: false }
              : t
          )
        }))
      }
      return
    }

    await port.closeTab(id)
    const remaining = tabs.filter((t) => t.id !== id)
    
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
        tabs: s.tabs.map((t) => (t.id === id ? { ...t, suspended: false, loading: true } : t))
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

  async navigate(id, url) {
    await port.navigate(id, url)
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, savedUrl: url, loading: true } : t))
    }))
  },

  goBack: (id) => port.goBack(id),
  goForward: (id) => port.goForward(id),
  reload: (id) => port.reload(id),

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

  bumpBookmarksRevision() {
    set((s) => ({ bookmarksRevision: s.bookmarksRevision + 1 }))
  },

  applyTabPatch(id, patch) {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, ...patch, savedUrl: patch.url ?? t.savedUrl } : t
      )
    }))
    if (patch.url) scheduleClipCheck(id, patch.url)
  },

  setOccluded(occluded) {
    set({ isOccluded: occluded })
  }
}))
