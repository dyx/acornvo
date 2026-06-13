import { safeStorage } from 'electron'

/**
 * safeStorage.isEncryptionAvailable() may only be called after
 * app.whenReady(). We call it once at bootstrap and cache the result for
 * the rest of the process lifetime so the secrets-store and the IPC handler
 * for the AI tab banner have a synchronous answer.
 */
let cached: boolean | null = null

export function initSafeStorageAvailability(): void {
  if (cached !== null) return
  cached = safeStorage.isEncryptionAvailable()
}

export function isSafeStorageAvailable(): boolean {
  if (cached === null) {
    throw new Error(
      'safe-storage-state not initialized — call initSafeStorageAvailability() after app.whenReady()'
    )
  }
  return cached
}

/** Test-only escape hatch, but also used when user manually retries keychain access. */
export function __resetForTest(): void {
  cached = null
}

export function retrySafeStorageAvailability(): boolean {
  if (process.platform === 'darwin') {
    const { app } = require('electron')
    // We must restart the app because Chromium's OSCrypt caches the denial state
    // within the process. Upon restart, accessing safeStorage will trigger the
    // macOS permission prompt again.
    // NOTE: We absolutely MUST NOT delete the keychain item here, because that
    // would destroy the master encryption key, rendering all existing API keys
    // in the database unreadable!
    app.relaunch()
    app.quit()
    return false
  }

  cached = null
  initSafeStorageAvailability()
  return cached!
}
