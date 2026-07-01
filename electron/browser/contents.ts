// electron/browser/contents.ts
import { WebContentsView, BrowserWindow, session } from 'electron'
import type { TabId, TabPatch, TabStateChangedPayload } from '@shared/browser-types'
import { sendEvent } from '../ipc/events'
import { safeOpenExternal } from '../security/external-links'

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
      // Omit preload property entirely to disable preload.
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

  const ALLOWED_NAV_SCHEMES = new Set(['http:', 'https:', 'about:'])
  const onWillNavigate = (e: Electron.Event, url: string): void => {
    try {
      if (!ALLOWED_NAV_SCHEMES.has(new URL(url).protocol)) {
        e.preventDefault()
      }
    } catch {
      e.preventDefault()
    }
  }
  webContents.on('will-navigate', onWillNavigate)

  const onDomReady = (): void => {
    // Inject DOM-based corner masks. This is much more reliable than CSS clip-path on html,
    // which fails on sites (like Zhihu) that manipulate html/body heights or overflows.
    const script = `
      (function() {
        if (document.getElementById('acornvo-corner-masks')) return;
        const div = document.createElement('div');
        div.id = 'acornvo-corner-masks';
        div.style.cssText = 'position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;';
        
        const bl = document.createElement('div');
        bl.style.cssText = 'position: absolute; left: 0; bottom: 0; width: 11px; height: 11px;';
        
        const br = document.createElement('div');
        br.style.cssText = 'position: absolute; right: 0; bottom: 0; width: 11px; height: 11px;';
        
        div.appendChild(bl);
        div.appendChild(br);
        
        function updateColors() {
          const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          // Use the App's outer background color (--color-paper-2)
          const bg = isDark ? 'oklch(0.22 0.018 60)' : 'oklch(0.955 0.015 82)';
          // Use the container's border color (--color-line)
          const line = isDark ? 'oklch(0.32 0.015 60)' : 'oklch(0.86 0.022 75)';
          
          // Draw the transparent cutout, then the 1px border, then fill the rest with the app background.
          // This creates a perfect illusion of the container's rounded corner that WebContentsView paints over.
          bl.style.background = \`radial-gradient(circle at 100% 0, transparent 10.5px, \${line} 11px, \${line} 12px, \${bg} 12.5px)\`;
          br.style.background = \`radial-gradient(circle at 0 0, transparent 10.5px, \${line} 11px, \${line} 12px, \${bg} 12.5px)\`;
        }
        
        updateColors();
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateColors);
        
        const observer = new MutationObserver(() => {
          if (!document.documentElement.contains(div)) {
            document.documentElement.appendChild(div);
          }
        });
        
        if (document.documentElement) {
          document.documentElement.appendChild(div);
          observer.observe(document.documentElement, { childList: true });
        } else {
          window.addEventListener('DOMContentLoaded', () => {
            document.documentElement.appendChild(div);
            observer.observe(document.documentElement, { childList: true });
          });
        }
      })();
    `
    webContents.executeJavaScript(script).catch(() => {})
  }
  webContents.on('dom-ready', onDomReady)

  return () => {
    webContents.off('did-start-loading', onStartLoading)
    webContents.off('did-stop-loading', onStopLoading)
    webContents.off('page-title-updated', onTitleUpdated)
    webContents.off('page-favicon-updated', onFaviconUpdated)
    webContents.off('did-navigate', onDidNavigate)
    webContents.off('did-navigate-in-page', onDidNavigateInPage)
    webContents.off('will-navigate', onWillNavigate)
    webContents.off('dom-ready', onDomReady)
  }
}

// --- Typed event channel ---

export const TAB_STATE_CHANGED_CHANNEL = 'browser:tabStateChanged' as const

export function makeTabStateSender(window: BrowserWindow): SendTabStateChanged {
  return (payload) => {
    sendEvent(window.webContents, TAB_STATE_CHANGED_CHANNEL, payload)
  }
}

// --- Window open handler (task 2.5) ---

export interface AdoptionContext {
  notifyOpenUrl: (url: string) => void
}

/**
 * Per-tab window-open handler:
 *  - http(s)  → allow + adopt as a new tab via `app.on('web-contents-created')` listener
 *  - other    → deny + shell.openExternal(url)
 */
export function attachWindowOpenHandler(
  webContents: Electron.WebContents,
  ctx: AdoptionContext
): void {
  webContents.setWindowOpenHandler(({ url }) => {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return { action: 'deny' }
    }
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      ctx.notifyOpenUrl(url)
      return { action: 'deny' }
    }
    safeOpenExternal(url)
    return { action: 'deny' }
  })
}
