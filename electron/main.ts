import { app, BrowserWindow, nativeTheme, powerMonitor, protocol, net } from 'electron'

// Enable auto dark mode for WebContents (browser tabs) when themeSource is dark
app.commandLine.appendSwitch('enable-features', 'WebContentsForceDark')

protocol.registerSchemesAsPrivileged([
  { scheme: 'acornvo-local', privileges: { secure: true, standard: true, supportFetchAPI: true } }
])

import { getOverlayForTheme } from './window/title-bar-theme'
import { join } from 'node:path'
import { safeResolve } from './services/path-safety'
import { logger, rotateOnBoot } from './obs/logger'
import {
  checkLastRun,
  installCrashHooks,
  purgeOldAcked,
  startElectronCrashReporter
} from './obs/crashReporter'
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

import { settingsStore } from './settings/store'
import { initSafeStorageAvailability } from './settings/safe-storage-state'
import { installSettingsBroadcaster } from './settings/broadcast'
import { initAutoUpdate } from './update/updater'
import type { QueueRunner } from './queue/runner'
export let mainWindow: BrowserWindow | null = null
let isQuitting = false
let queueRunner: QueueRunner | null = null


function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    center: true,
    show: false,
    titleBarStyle: 'hiddenInset',
    ...(process.platform === 'win32' ? { titleBarOverlay: getOverlayForTheme() } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      preload: join(__dirname, '../preload/preload.js')
    }
  })

  const onThemeChanged = (): void => {
    if (process.platform === 'win32' && !win.isDestroyed()) {
      win.setTitleBarOverlay(getOverlayForTheme())
    }
  }
  nativeTheme.on('updated', onThemeChanged)

  win.once('ready-to-show', () => {
    const files = checkLastRun()
    if (files.length > 0) {
      win.webContents.send('crash:detected', { files })
    }
    win.show()
    logger().info('main', {
      msg: 'app started',
      meta: {
        version: app.getVersion(),
        platform: process.platform,
        electron: process.versions.electron
      }
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

  win.on('closed', () => {
    nativeTheme.off('updated', onThemeChanged)
  })

  installExternalLinkGuards(win)

  return win
}

app.on('web-contents-created', (_event, wc) => {
  wc.on('before-input-event', (e, input) => {
    // Disable zoom shortcuts (Cmd/Ctrl + or - or =)
    if (
      input.type === 'keyDown' &&
      (input.control || input.meta) &&
      (input.key === '+' || input.key === '=' || input.key === '-')
    ) {
      e.preventDefault()
    }

    if (
      input.type === 'keyDown' &&
      (input.control || input.meta) &&
      input.key.toLowerCase() === 'r' &&
      !input.shift
    ) {
      e.preventDefault()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('hotkey:reload', {})
      }
    }
  })
})


import { initGlobalDb } from './services/global-db'

async function bootstrap(): Promise<void> {
  startElectronCrashReporter()
  await app.whenReady()

  protocol.handle('acornvo-local', (request) => {
    const rawUrl = request.url.replace(/^acornvo-local:\/\//i, '')
    const relPath = decodeURIComponent(rawUrl)
    const grovePath = dbService.getCurrentGrovePath()
    if (!grovePath) return new Response('Not Found', { status: 404 })
    let absolutePath: string
    try {
      absolutePath = safeResolve(grovePath, relPath)
    } catch {
      return new Response('Not Found', { status: 404 })
    }
    const fileUri = absolutePath.startsWith('/') ? `file://${absolutePath}` : `file:///${absolutePath}`
    return net.fetch(fileUri)
  })

  initGlobalDb()
  installCrashHooks()
  purgeOldAcked()
  rotateOnBoot()
  logger().info('main', { op: 'boot', meta: { ts: new Date().toISOString() } })
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
          // Grove closed or switching away
        } else {
          if (dbService.getCurrentGrovePath() !== payload.path) {
            dbService.openForGrove(payload.path)
          }

          const db = dbService.getCurrent()
          if (db) {
            setIndexerDb(db)
            await startScan(payload.path)
            await watcherStart(payload.path, db)


            if (queueRunner) {
              queueRunner.stop()
              queueRunner = null
            }

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
        logger().error('main', {
          msg: 'db subscriber failed on project:changed',
          meta: { message: err instanceof Error ? err.message : String(err) }
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
      logger().error('main', {
        msg: 'grove close on will-quit failed',
        meta: { message: err instanceof Error ? err.message : String(err) }
      })
    })
  })
  app.on('will-quit', () => {
    try {
      // Defensive: closeGrove cascades to closeCurrent, but also handle the
      // "no grove open but stray db handle" edge case.
      dbService.closeCurrent()
    } catch (err) {
      logger().error('main', {
        msg: 'db close on will-quit failed',
        meta: { message: err instanceof Error ? err.message : String(err) }
      })
    }
  })
  const bootstrapResult = await runBootstrap()
  mainWindow = createMainWindow()
  const { createToastWindow } = await import('./toast-window')
  createToastWindow(mainWindow)
  initBrowserSubsystem(mainWindow)
  const disposeIndexForwarders = attachIndexEventForwarders(mainWindow)
  app.on('will-quit', disposeIndexForwarders)

  if (process.env.NODE_ENV === 'production') {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow!.webContents.closeDevTools()
      logger().warn('main', { op: 'devtools-blocked' })
    })
  }

  mainWindow.webContents.once('did-finish-load', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('bootstrap:ready', bootstrapResult)
  })

  // Auto-update: check the user's preference; default to enabled.
  let autoCheck = true
  try {
    autoCheck = settingsStore.get('update').autoCheck
  } catch {
    // DB may not be ready yet — use default
  }
  if (autoCheck) initAutoUpdate()
}

bootstrap().catch((err) => {
  logger().error('main', {
    op: 'boot',
    ok: false,
    msg: err instanceof Error ? err.message : String(err)
  })
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
