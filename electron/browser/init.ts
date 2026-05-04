// electron/browser/init.ts
import { session, type BrowserWindow } from 'electron'
import { logger } from '../services/logger'
import { configureBounds, getBounds } from './bounds'
import { setMainWindow, getManager, setBoundsApplier } from './manager'

export const BROWSER_SESSION_PARTITION = 'persist:browser-default'

/**
 * One-shot wiring called from electron/main.ts after the main BrowserWindow exists.
 * Subsequent tasks (3.2, 3.3) extend this with adblock loading + counter logging.
 */
export function initBrowserSubsystem(mainWindow: BrowserWindow): void {
  setMainWindow(mainWindow)
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

  logger.info('browser subsystem initialized', {
    partition: BROWSER_SESSION_PARTITION
  })
}
