import { shell, type BrowserWindow } from 'electron'
import { logger } from '../obs/logger'

/**
 * URLs that may be navigated to inside the app window.
 * Currently only the local renderer. Expanded when in-app tabs land.
 */
function isInternalUrl(url: string): boolean {
  return (
    url.startsWith('file://') ||
    url.startsWith('http://localhost:') ||
    url.startsWith('http://127.0.0.1:')
  )
}

const HTTP_ONLY = /^https?:\/\//i

export function safeOpenExternal(url: string): void {
  if (!HTTP_ONLY.test(url)) {
    logger().warn('security', { msg: 'blocked non-http openExternal', meta: { url } })
    return
  }
  void shell.openExternal(url).catch((err) =>
    logger().warn('security', {
      msg: 'shell.openExternal failed',
      meta: { url, error: String(err) }
    })
  )
}

export function installExternalLinkGuards(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isInternalUrl(url)) {
      safeOpenExternal(url)
    }
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (!isInternalUrl(url)) {
      event.preventDefault()
      safeOpenExternal(url)
    }
  })
}
