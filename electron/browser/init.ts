// electron/browser/init.ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, session, type BrowserWindow } from 'electron'
import { logger } from '../services/logger'
import { configureBounds, getBounds } from './bounds'
import { setMainWindow, getManager, setBoundsApplier } from './manager'
import { createAdblock, bindAdblockToSession, setAdblock, getAdblock } from './adblock'
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

function resolveHostsPath(): string {
  // In dev, public/ is served from the project root. In a packaged app, vite
  // copies public/ into the renderer dist; for main we resolve relative to
  // app.getAppPath() which is stable in both modes.
  return join(app.getAppPath(), 'public', 'hosts', 'block-domains.txt')
}

function loadAdblock(): void {
  let hosts: Set<string>
  try {
    const text = readFileSync(resolveHostsPath(), 'utf8')
    hosts = parseHostsFile(text)
  } catch (err) {
    logger.warn('browser: failed to load block-domains.txt; ad-block disabled', {
      message: err instanceof Error ? err.message : String(err)
    })
    hosts = new Set()
  }
  const ab = createAdblock(hosts)
  setAdblock(ab)
  const s = session.fromPartition(BROWSER_SESSION_PARTITION)
  bindAdblockToSession(s, ab)
  logger.info('browser: ad-block ready', { hostsCount: hosts.size })
}

// --- Hourly ad-block counter logger (task 3.3) ---

function startAdblockReporter(): NodeJS.Timeout {
  const ONE_HOUR_MS = 60 * 60 * 1000
  const handle = setInterval(() => {
    const n = getAdblock().drainCount()
    if (n > 0) {
      logger.info('browser.adblock.hourly', { blocked: n })
    }
  }, ONE_HOUR_MS)
  // Allow Node to exit if this is the only timer
  if (typeof handle.unref === 'function') handle.unref()
  return handle
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

  logger.info('browser subsystem initialized', {
    partition: BROWSER_SESSION_PARTITION
  })

  loadAdblock()
  startAdblockReporter()
}
