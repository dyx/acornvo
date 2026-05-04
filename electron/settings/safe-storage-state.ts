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

/** Test-only escape hatch. */
export function __resetForTest(): void {
  cached = null
}
