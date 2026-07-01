// electron/ipc/browser.ts — implemented in Plan 2 task 5.3
import type { BrowserWindow } from 'electron'
import type { IpcContract, TabId, SetViewportArgs } from '@shared/ipc-contract'
import { sendEvent } from './events'
import { logger } from '../obs/logger'
import {
  createTabView,
  attachTabEvents,
  attachWindowOpenHandler,
  makeTabStateSender
} from '../browser/contents'
import { getManager } from '../browser/manager'
import { getBounds } from '../browser/bounds'
import { BROWSER_SESSION_PARTITION } from '../browser/init'

// --- pure helpers (unit-tested) ---
export const newTabId = (): TabId => `tab-${crypto.randomUUID()}`

const ALLOWED_NAV_SCHEMES = new Set(['http:', 'https:', 'about:'])

export const resolveCreateUrl = (url: string | undefined): string => {
  if (!url || url === 'about:blank') return 'about:blank'
  try {
    const { protocol } = new URL(url)
    if (!ALLOWED_NAV_SCHEMES.has(protocol)) {
      throw new Error(`disallowed scheme: ${protocol}`)
    }
    return url
  } catch (e) {
    throw new Error(`invalid url: ${url}`)
  }
}

let _mainWindow: BrowserWindow | null = null
let _hiddenTabId: TabId | null = null
export function setMainWindowForBrowser(win: BrowserWindow): void {
  _mainWindow = win
}

function registerNewTabFromUrl(id: TabId, url: string): void {
  const win = _mainWindow
  if (!win) throw new Error('mainWindow not ready')
  const { view, webContents } = createTabView({
    url,
    sessionPartition: BROWSER_SESSION_PARTITION
  })
  attachTabEvents(id, webContents, makeTabStateSender(win))
  attachWindowOpenHandler(webContents, {
    notifyOpenUrl: (urlToOpen) => {
      const w = _mainWindow
      if (w && !w.isDestroyed()) {
        sendEvent(w.webContents, 'browser:openNewTabRequest', { url: urlToOpen })
      }
    }
  })
  getManager().register(id, view)
}

// --- handler map ---
type H = IpcContract['browser']

export const browserHandlers: H = {
  createTab(url) {
    const id = newTabId()
    const resolved = resolveCreateUrl(url)
    registerNewTabFromUrl(id, resolved)
    if (resolved !== 'about:blank') {
      getManager().attach(id)
      _hiddenTabId = null
    } else {
      _hiddenTabId = id
    }
    logger().info('browser', { msg: 'browser.createTab', meta: { id, url: resolved } })
    return { id, url: resolved }
  },
  closeTab(id) {
    getManager().destroy(id)
  },
  activateTab(id) {
    const tab = getManager().get(id)
    if (tab && tab.view.webContents.getURL() !== 'about:blank') {
      getManager().attach(id)
      _hiddenTabId = null
    } else {
      const attachedId = getManager().attachedTabId()
      if (attachedId) {
        getManager().detach(attachedId)
      }
      _hiddenTabId = id
    }
  },
  navigate(id, url) {
    const tab = getManager().get(id)
    if (!tab) return
    if (url === 'about:blank') {
      if (getManager().attachedTabId() === id) {
        _hiddenTabId = id
        getManager().detach(id)
      }
    } else {
      if (getManager().attachedTabId() !== id) {
        getManager().attach(id)
        _hiddenTabId = null
      }
    }
    try {
      const resolved = resolveCreateUrl(url)
      void tab.view.webContents.loadURL(resolved)
    } catch {
      // Invalid or disallowed url
    }
  },
  reload(id) {
    getManager().get(id)?.view.webContents.reload()
  },
  goBack(id) {
    const wc = getManager().get(id)?.view.webContents
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
  },
  goForward(id) {
    const wc = getManager().get(id)?.view.webContents
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
  },
  setViewport(rect: SetViewportArgs) {
    getBounds().setViewport(rect)
  },
  suspendTab(id) {
    getManager().destroy(id)
  },
  resumeTab(id) {
    registerNewTabFromUrl(id, 'about:blank')
    getManager().attach(id)
    _hiddenTabId = null
    return { id, url: 'about:blank' }
  },
  hideBrowserView() {
    const id = getManager().attachedTabId()
    if (id) {
      _hiddenTabId = id
      getManager().detach(id)
    }
  },
  showBrowserView() {
    if (_hiddenTabId && getManager().has(_hiddenTabId)) {
      getManager().attach(_hiddenTabId)
    }
    _hiddenTabId = null
  }
}
