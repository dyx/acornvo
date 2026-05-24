import { session } from 'electron'

/**
 * Baseline CSP for the main window. Intentionally permissive on script/style
 * inline to accommodate Vite dev HMR and future vditor/tailwind injection.
 * `vditor-editor-autosave` (phase-03) can tighten this further.
 */
const CSP_BASELINE = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https: acornvo-local:",
  "font-src 'self' data:",
  "connect-src 'self' ws: http://localhost:* https://localhost:*"
].join('; ')

export function installCsp(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP_BASELINE]
      }
    })
  })
}
