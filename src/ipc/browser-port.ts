// src/ipc/browser-port.ts
import { ipc } from './client'
import type { BrowserPort, BrowserEventPort } from '@/stores/browser'
import type { TabStateChangedPayload } from '@shared/browser-types'

export const browserPort: BrowserPort = {
  createTab: (url) => ipc.browser.createTab(url),
  closeTab: (id) => ipc.browser.closeTab(id),
  activateTab: (id) => ipc.browser.activateTab(id),
  navigate: (id, url) => ipc.browser.navigate(id, url),
  reload: (id) => ipc.browser.reload(id),
  goBack: (id) => ipc.browser.goBack(id),
  goForward: (id) => ipc.browser.goForward(id),
  setReaderMode: (id, on) => ipc.browser.setReaderMode(id, on),
  setViewport: (rect) => ipc.browser.setViewport(rect),
  suspendTab: (id) => ipc.browser.suspendTab(id),
  resumeTab: (id) => ipc.browser.resumeTab(id)
}

export const browserEventPort: BrowserEventPort = {
  onTabStateChanged: (h) =>
    ipc.on('browser:tabStateChanged', (p: TabStateChangedPayload) => h(p))
}
