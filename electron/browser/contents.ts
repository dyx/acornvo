// electron/browser/contents.ts
import { WebContentsView, session } from 'electron'

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
