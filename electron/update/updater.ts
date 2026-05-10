import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'
import { logger } from '../obs/logger'

let initted = false
let firstTimer: NodeJS.Timeout | null = null
let intervalTimer: NodeJS.Timeout | null = null

const FOUR_HOURS_MS = 4 * 3600 * 1000
const SIXTY_S_MS = 60_000

export function __resetUpdaterForTests(): void {
  initted = false
  if (firstTimer) clearTimeout(firstTimer)
  if (intervalTimer) clearInterval(intervalTimer)
  firstTimer = null
  intervalTimer = null
}

export function initAutoUpdate(): void {
  if (initted) return
  initted = true
  autoUpdater.autoDownload = true
  bridgeEvents()
  firstTimer = setTimeout(() => {
    void runCheck('auto')
    intervalTimer = setInterval(() => {
      void runCheck('auto')
    }, FOUR_HOURS_MS)
  }, SIXTY_S_MS)
}

export async function checkForUpdatesManual(): Promise<{
  status: 'up-to-date' | 'available' | 'failed'
  version?: string
  message?: string
}> {
  try {
    const r = await autoUpdater.checkForUpdates()
    if (r && r.updateInfo && r.updateInfo.version) {
      return { status: 'available', version: r.updateInfo.version }
    }
    return { status: 'up-to-date' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger().error('update', { op: 'manual-check', meta: { error: msg } })
    return { status: 'failed', message: msg }
  }
}

async function runCheck(trigger: 'auto' | 'manual'): Promise<void> {
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    logger().warn('update', {
      op: 'check',
      meta: { trigger, error: (err as Error).message }
    })
  }
}

function bridgeEvents(): void {
  function emit<T>(name: string, payload: T): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(name, payload)
    }
  }
  autoUpdater.on('update-available', (info) => {
    logger().info('update', { op: 'available', meta: { version: info.version } })
    emit('update:available', { version: info.version })
  })
  autoUpdater.on('download-progress', (p) => {
    emit('update:download-progress', {
      percent: p.percent,
      bytesPerSecond: p.bytesPerSecond,
      total: p.total,
      transferred: p.transferred
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    logger().info('update', { op: 'downloaded', meta: { version: info.version } })
    emit('update:downloaded', { version: info.version })
  })
  autoUpdater.on('error', (err) => {
    logger().error('update', { op: 'error', meta: { message: err.message } })
    emit('update:error', { message: err.message })
  })
}
