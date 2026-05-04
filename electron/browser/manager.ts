// electron/browser/manager.ts
import type { WebContentsView, BrowserWindow } from 'electron'
import type { TabId } from '@shared/browser-types'

export interface ManagedTab {
  view: WebContentsView
  lastActiveAt: number
}

export interface ManagerDeps {
  /** Returns the parent BrowserWindow.contentView. Lazy because the window may not exist yet. */
  getContentView: () => Electron.View
  /** Re-applies the latest viewport bounds to the given view. Implemented by bounds.ts (task 2.3). */
  applyBoundsToView: (view: WebContentsView) => void
  /** Source of monotonic time for LRU; injectable so tests are deterministic. */
  nowMs: () => number
}

export interface Manager {
  register(tabId: TabId, view: WebContentsView): void
  attach(tabId: TabId): void
  detach(tabId: TabId): void
  destroy(tabId: TabId): void
  has(tabId: TabId): boolean
  get(tabId: TabId): ManagedTab | undefined
  attachedTabId(): TabId | null
  /** Oldest by lastActiveAt; null when registry is empty. */
  pickLruTabId(): TabId | null
  size(): number
}

export function createManager(deps: ManagerDeps): Manager {
  const tabs = new Map<TabId, ManagedTab>()
  let attachedId: TabId | null = null

  function attach(tabId: TabId): void {
    const tab = tabs.get(tabId)
    if (!tab) return
    if (attachedId && attachedId !== tabId) {
      const prev = tabs.get(attachedId)
      if (prev) deps.getContentView().removeChildView(prev.view)
    }
    deps.getContentView().addChildView(tab.view)
    deps.applyBoundsToView(tab.view)
    tab.lastActiveAt = deps.nowMs()
    attachedId = tabId
  }

  function detach(tabId: TabId): void {
    const tab = tabs.get(tabId)
    if (!tab) return
    if (attachedId === tabId) {
      deps.getContentView().removeChildView(tab.view)
      attachedId = null
    }
  }

  function destroy(tabId: TabId): void {
    const tab = tabs.get(tabId)
    if (!tab) return
    detach(tabId)
    if (!tab.view.webContents.isDestroyed()) {
      tab.view.webContents.close()
    }
    tabs.delete(tabId)
  }

  return {
    register(tabId, view) {
      tabs.set(tabId, { view, lastActiveAt: deps.nowMs() })
    },
    attach,
    detach,
    destroy,
    has: (tabId) => tabs.has(tabId),
    get: (tabId) => tabs.get(tabId),
    attachedTabId: () => attachedId,
    pickLruTabId() {
      let oldestId: TabId | null = null
      let oldest = Number.POSITIVE_INFINITY
      for (const [id, tab] of tabs) {
        if (tab.lastActiveAt < oldest) {
          oldest = tab.lastActiveAt
          oldestId = id
        }
      }
      return oldestId
    },
    size: () => tabs.size
  }
}

// --- Singleton wiring (used by IPC handlers; tests use createManager directly) ---

let mainWindowRef: BrowserWindow | null = null
let singleton: Manager | null = null

export function setMainWindow(win: BrowserWindow): void {
  mainWindowRef = win
  singleton = null // force rebuild on next access
}

export function getManager(): Manager {
  if (!singleton) {
    if (!mainWindowRef) {
      throw new Error('manager: setMainWindow must be called before getManager')
    }
    singleton = createManager({
      getContentView: () => mainWindowRef!.contentView,
      applyBoundsToView: (view) => boundsApplier(view),
      nowMs: () => Date.now()
    })
  }
  return singleton
}

let boundsApplier: (view: WebContentsView) => void = () => {}
export function setBoundsApplier(fn: (view: WebContentsView) => void): void {
  boundsApplier = fn
}
