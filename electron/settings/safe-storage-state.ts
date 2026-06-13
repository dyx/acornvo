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
    const { execSync } = require('child_process')
    const { app } = require('electron')
    const serviceNames = [`${app.getName()} Safe Storage`, 'Acornvo Safe Storage', 'acornvo Safe Storage']
    
    for (const name of new Set(serviceNames)) {
      try {
        execSync(`security delete-generic-password -s "${name}"`)
      } catch {
        // Ignore if not found
      }
    }
    
    // If we deleted it, we must relaunch to let safeStorage recreate it and prompt again
    // Even if we didn't delete it (maybe it wasn't there), we can try relaunching to re-trigger the prompt
    app.relaunch()
    app.quit()
    return false
  }

  cached = null
  initSafeStorageAvailability()
  return cached!
}
