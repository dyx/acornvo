// electron/ipc/browser.ts — implemented in Plan 2 task 5.3
import type { IpcContract, TabId, SetViewportArgs } from '@shared/ipc-contract'
import { logger } from '../services/logger'
import { mainWindow } from '../main'
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
export const resolveCreateUrl = (url: string | undefined): string =>
  url ?? 'about:blank'

// --- adoption ---
function adoptWebContents(webContents: Electron.WebContents): TabId {
  const id = newTabId()
  const url = webContents.getURL() || 'about:blank'
  webContents.close()
  registerNewTabFromUrl(id, url)
  return id
}

function registerNewTabFromUrl(id: TabId, url: string): void {
  const win = mainWindow
  if (!win) throw new Error('mainWindow not ready')
  const { view, webContents } = createTabView({
    url,
    sessionPartition: BROWSER_SESSION_PARTITION
  })
  attachTabEvents(id, webContents, makeTabStateSender(win))
  attachWindowOpenHandler(webContents, {
    registerNewTab: (wc) => adoptWebContents(wc)
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
    getManager().attach(id)
    logger.info('browser.createTab', { id, url: resolved })
    return { id, url: resolved }
  },
  closeTab(id) {
    getManager().destroy(id)
  },
  activateTab(id) {
    getManager().attach(id)
  },
  navigate(id, url) {
    const tab = getManager().get(id)
    if (!tab) return
    void tab.view.webContents.loadURL(url)
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
  setReaderMode(id, on) {
    const tab = getManager().get(id)
    if (!tab) return
    const wc = tab.view.webContents
    const READER_CSS = `
      body { max-width: 720px !important; margin: 0 auto !important;
             font-family: Georgia, serif; font-size: 18px; line-height: 1.7; color: #222; }
      header, nav, footer, aside, [class*="sidebar"], [class*="banner"], [class*="ad"] { display: none !important; }
      img { max-width: 100% !important; height: auto !important; }
    `
    ;(globalThis as any).__readerCssKeys ??= new Map<TabId, string>()
    const m = (globalThis as any).__readerCssKeys as Map<TabId, string>
    if (on) {
      void wc.insertCSS(READER_CSS).then((key) => m.set(id, key))
    } else {
      const key = m.get(id)
      if (key) {
        void wc.removeInsertedCSS(key)
        m.delete(id)
      }
    }
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
    return { id, url: 'about:blank' }
  }
}
