import { BrowserWindow } from 'electron'
import { join } from 'node:path'

export let toastWindow: BrowserWindow | null = null

export function createToastWindow(parentWindow: BrowserWindow): BrowserWindow {
  const win = new BrowserWindow({
    parent: parentWindow,
    transparent: true,
    frame: false,
    hasShadow: false,
    focusable: false,
    alwaysOnTop: true, // ensure it's above everything including BrowserView
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: join(__dirname, '../preload/preload.js')
    }
  })

  // Ignore all mouse events and forward them to the window below
  win.setIgnoreMouseEvents(true, { forward: true })

  // Synchronize bounds with parent
  const syncBounds = () => {
    if (!parentWindow.isDestroyed() && !win.isDestroyed()) {
      win.setBounds(parentWindow.getBounds())
    }
  }

  parentWindow.on('move', syncBounds)
  parentWindow.on('resize', syncBounds)
  syncBounds() // initial sync

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    win.loadURL(`${devUrl}/toast.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/toast.html'))
  }

  win.once('ready-to-show', () => {
    if (!parentWindow.isDestroyed()) {
      win.showInactive() // Show without taking focus
    }
  })

  // Ensure window gets destroyed properly
  parentWindow.once('closed', () => {
    if (!win.isDestroyed()) {
      win.close()
    }
  })

  toastWindow = win
  return win
}
