import { app, BrowserWindow, powerMonitor } from 'electron'
import { join } from 'node:path'
import { initLogger, logger } from './services/logger'
import { installCsp } from './security/csp'
import { installExternalLinkGuards } from './security/external-links'
import { registerHandlers } from './ipc/router'
import { ipcHandlers } from './ipc/handlers'
import { appLifecycle } from './app-lifecycle'
import { installGroveBroadcaster } from './services/grove-broadcast'
import { attachIndexEventForwarders } from './ipc/index'
import * as groveService from './services/grove'
import { dbService } from './services/db'
import { runBootstrap } from './bootstrap'
import { setDb as setIndexerDb, startScan, reset as resetIndexer } from './services/indexer'
import { start as watcherStart, stop as watcherStop } from './services/watcher'
import { initBrowserSubsystem } from './browser/init'
import { initAdBlock, __resetForTest as resetAdBlock } from './browser/adblock'
import { settingsStore } from './settings/store'
import { initSafeStorageAvailability } from './settings/safe-storage-state'
import { installSettingsBroadcaster } from './settings/broadcast'
import type { QueueRunner } from './queue/runner'

export let mainWindow: BrowserWindow | null = null
let isQuitting = false
let queueRunner: QueueRunner | null = null
let adBlockInstalled = false

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    center: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      preload: join(__dirname, '../preload/preload.js')
    }
  })

  win.once('ready-to-show', () => {
    win.show()
    logger.info('app started', {
      version: app.getVersion(),
      platform: process.platform,
      electron: process.versions.electron
    })
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.on('close', (event) => {
    if (process.platform === 'darwin' && !isQuitting) {
      event.preventDefault()
      win.hide()
    }
  })

  installExternalLinkGuards(win)

  return win
}

async function bootstrap(): Promise<void> {
  await initLogger()
  await app.whenReady()
  installCsp()
  initSafeStorageAvailability()
  registerHandlers(ipcHandlers)
  const disposeBroadcaster = installGroveBroadcaster()
  app.on('will-quit', disposeBroadcaster)
  const disposeSettingsBroadcaster = installSettingsBroadcaster()
  app.on('will-quit', disposeSettingsBroadcaster)
  const disposeDbSubscriber = groveService.onChange((payload) => {
    void (async () => {
      try {
        if (payload === null) {
          // Grove closed or switching away — cleanup (watcherStop, resetIndexer,
          // closeCurrent) is already done by openGrove / closeGrove BEFORE they
          // fire notifyChange(null). Nothing to do here.
        } else {
          // Grove opened or switched to — ensure db is open
          if (dbService.getCurrentGrovePath() !== payload.path) {
            // openGrove already called openForGrove; this is the catch-all for
            // future code paths that change the project without going through it.
            dbService.openForGrove(payload.path)
          }
          // After DB is open, init ad-block with current setting (one-shot)
          if (!adBlockInstalled) {
            adBlockInstalled = true
            const browser = settingsStore.get('browser')
            initAdBlock({ initialEnabled: browser.blockAds })
          }
          const db = dbService.getCurrent()
          if (db) {
            setIndexerDb(db)
            await startScan(payload.path)
            await watcherStart(payload.path, db)
            // phase-14: start the queue runner
            const { bootstrapQueueRunner } = await import('./queue')
            const { record: opsLogRecord } = await import('./services/ops/log')
            queueRunner = bootstrapQueueRunner(dbService.requireCurrent(), {
              opsLog: (r) => opsLogRecord(r as Parameters<typeof opsLogRecord>[0]),
              getRenderers: () => BrowserWindow.getAllWindows().map((w) => w.webContents)
            })
            queueRunner.start()
          }
        }
      } catch (err) {
        logger.error('db subscriber failed on project:changed', {
          message: err instanceof Error ? err.message : String(err)
        })
      }
    })()
  })
  app.on('will-quit', disposeDbSubscriber)
  appLifecycle.onBeforeQuit(async () => {
    await watcherStop()
    resetIndexer()
  })
  appLifecycle.onBeforeQuit(async () => {
    if (queueRunner) {
      try {
        await queueRunner.drainOnQuit(5_000)
      } finally {
        queueRunner = null
      }
    }
  })
  app.on('will-quit', () => {
    void groveService.closeGrove().catch((err) => {
      logger.error('grove close on will-quit failed', {
        message: err instanceof Error ? err.message : String(err)
      })
    })
  })
  app.on('will-quit', () => {
    try {
      // Defensive: closeGrove cascades to closeCurrent, but also handle the
      // "no grove open but stray db handle" edge case.
      dbService.closeCurrent()
    } catch (err) {
      logger.error('db close on will-quit failed', {
        message: err instanceof Error ? err.message : String(err)
      })
    }
  })
  const bootstrapResult = await runBootstrap()
  mainWindow = createMainWindow()
  initBrowserSubsystem(mainWindow)
  const disposeIndexForwarders = attachIndexEventForwarders(mainWindow)
  app.on('will-quit', disposeIndexForwarders)
  mainWindow.webContents.once('did-finish-load', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('bootstrap:ready', bootstrapResult)
  })
}

bootstrap().catch((err) => {
  console.error('bootstrap failed', err)
  process.exit(1)
})

app.on('before-quit', (event) => {
  if (isQuitting) return
  event.preventDefault()
  isQuitting = true
  void appLifecycle._runBeforeQuit().finally(() => {
    app.quit()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
  // macOS: do nothing — app stays alive with no windows.
})

app.on('activate', () => {
  // macOS: Dock click — re-show hidden window or recreate it.
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow()
    return
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show()
  }
})

powerMonitor.on('resume', () => {
  void appLifecycle._runWindowResume()
})
