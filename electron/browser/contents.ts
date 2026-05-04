// electron/browser/contents.ts
import { WebContentsView, BrowserWindow, session } from 'electron'
import type { TabId, TabPatch, TabStateChangedPayload } from '@shared/browser-types'

export interface CreateTabViewOpts {
  url: string
  sessionPartition: string // e.g., 'persist:browser-default'
}

export interface CreatedTabView {
  view: WebContentsView
  webContents: Electron.WebContents
}

/**
 * Create a sandboxed WebContentsView for one browser tab.
 * - sandbox: true / contextIsolation: true / nodeIntegration: false
 * - no preload (the in-app browser does not expose window.api to the page)
 * - shared persistent session via the supplied partition
 *
 * Per-tab event subscription and setWindowOpenHandler are attached by
 * `manager.attach` (task 2.4 + 2.5), not here, so this factory stays pure.
 */
export function createTabView(opts: CreateTabViewOpts): CreatedTabView {
  const partitionedSession = session.fromPartition(opts.sessionPartition)
  const view = new WebContentsView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Empty string disables preload entirely.
      preload: '',
      session: partitionedSession,
      webSecurity: true,
      spellcheck: false
    }
  })
  void view.webContents.loadURL(opts.url)
  return { view, webContents: view.webContents }
}

// --- Per-tab event wiring ---

export type SendTabStateChanged = (payload: TabStateChangedPayload) => void

/**
 * Subscribe to the standard set of WebContents events for one tab and
 * forward TabPatch deltas via the supplied `send` function. Returns an
 * unsubscribe handle that the manager calls on destroy.
 */
export function attachTabEvents(
  tabId: TabId,
  webContents: Electron.WebContents,
  send: SendTabStateChanged
): () => void {
  const emit = (patch: TabPatch): void => send({ tabId, patch })

  const onStartLoading = (): void => emit({ loading: true })
  const onStopLoading = (): void =>
    emit({
      loading: false,
      canGoBack: webContents.navigationHistory.canGoBack(),
      canGoForward: webContents.navigationHistory.canGoForward()
    })
  const onTitleUpdated = (_e: Electron.Event, title: string): void => emit({ title })
  const onFaviconUpdated = (_e: Electron.Event, favicons: string[]): void => {
    emit({ favicon: favicons[0] ?? null })
  }
  const onDidNavigate = (_e: Electron.Event, url: string): void => {
    emit({
      url,
      readerMode: false, // spec: navigation resets reader mode
      canGoBack: webContents.navigationHistory.canGoBack(),
      canGoForward: webContents.navigationHistory.canGoForward()
    })
  }
  const onDidNavigateInPage = (_e: Electron.Event, url: string): void => {
    emit({
      url,
      canGoBack: webContents.navigationHistory.canGoBack(),
      canGoForward: webContents.navigationHistory.canGoForward()
    })
  }

  webContents.on('did-start-loading', onStartLoading)
  webContents.on('did-stop-loading', onStopLoading)
  webContents.on('page-title-updated', onTitleUpdated)
  webContents.on('page-favicon-updated', onFaviconUpdated)
  webContents.on('did-navigate', onDidNavigate)
  webContents.on('did-navigate-in-page', onDidNavigateInPage)

  return () => {
    webContents.off('did-start-loading', onStartLoading)
    webContents.off('did-stop-loading', onStopLoading)
    webContents.off('page-title-updated', onTitleUpdated)
    webContents.off('page-favicon-updated', onFaviconUpdated)
    webContents.off('did-navigate', onDidNavigate)
    webContents.off('did-navigate-in-page', onDidNavigateInPage)
  }
}

// --- Typed event channel ---

export const TAB_STATE_CHANGED_CHANNEL = 'browser:tabStateChanged' as const

export function makeTabStateSender(window: BrowserWindow): SendTabStateChanged {
  return (payload) => {
    if (!window.isDestroyed()) {
      window.webContents.send(TAB_STATE_CHANGED_CHANNEL, payload)
    }
  }
}
