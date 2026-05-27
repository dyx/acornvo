// electron/browser/init.ts
import { session, type BrowserWindow } from 'electron'
import { logger } from '../obs/logger'
import { configureBounds, getBounds } from './bounds'
import { setMainWindow, getManager, setBoundsApplier } from './manager'
import { setMainWindowForBrowser } from '../ipc/browser'

export const BROWSER_SESSION_PARTITION = 'persist:browser-default'

// --- Pure host-file parser (unit-tested) ---

export function parseHostsFile(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#')) continue
    out.add(line.toLowerCase())
  }
  return out
}

// --- Main bootstrap ---

/**
 * One-shot wiring called from electron/main.ts after the main BrowserWindow exists.
 */
export function initBrowserSubsystem(mainWindow: BrowserWindow): void {
  setMainWindow(mainWindow)
  setMainWindowForBrowser(mainWindow)
  configureBounds(() => {
    const id = getManager().attachedTabId()
    if (!id) return null
    const t = getManager().get(id)
    return t ? t.view : null
  })
  setBoundsApplier((view) => getBounds().applyTo(view))

  // Touch the partitioned session early so it's created and persistent storage
  // is initialised before the first tab loads.
  const s = session.fromPartition(BROWSER_SESSION_PARTITION)
  // Set a sensible UA suffix so sites can identify the in-app browser if they want
  s.setUserAgent(s.getUserAgent() + ' Acornvo/0.0.0')

  logger().info('browser', {
    msg: 'browser subsystem initialized',
    meta: { partition: BROWSER_SESSION_PARTITION }
  })
}
