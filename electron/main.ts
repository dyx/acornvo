import { app, BrowserWindow, powerMonitor } from 'electron'
import { join } from 'node:path'
import { initLogger, logger } from './services/logger'
import { installCsp } from './security/csp'
import { installExternalLinkGuards } from './security/external-links'
import { registerHandlers } from './ipc/router'
import { ipcHandlers } from './ipc/handlers'
import { appLifecycle } from './app-lifecycle'

export let mainWindow: BrowserWindow | null = null
let isQuitting = false

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
  registerHandlers(ipcHandlers)
  mainWindow = createMainWindow()
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
