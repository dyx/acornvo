// electron/settings/secrets.ts
import { safeStorage } from 'electron'
import { IpcError } from '@shared/ipc-contract'
import { getGlobalDb } from '../services/global-db'
import { isSafeStorageAvailable } from './safe-storage-state'

function requireKeychain(): void {
  if (!isSafeStorageAvailable()) {
    throw new IpcError(
      'E_KEYCHAIN_UNAVAILABLE',
      'E_KEYCHAIN_UNAVAILABLE: OS keychain (safeStorage) is not available'
    )
  }
}

function set(key: string, plain: string): void {
  requireKeychain()
  let enc: Buffer
  try {
    enc = safeStorage.encryptString(plain)
  } catch (err) {
    throw new IpcError(
      'E_KEYCHAIN_UNAVAILABLE',
      `E_KEYCHAIN_UNAVAILABLE: Keychain error during encryption: ${err instanceof Error ? err.message : String(err)}`
    )
  }
  const db = getGlobalDb()
  db.prepare(
    `
    INSERT INTO settings_secrets (key, encrypted_value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET encrypted_value = excluded.encrypted_value, updated_at = excluded.updated_at
  `
  ).run(key, enc, new Date().toISOString())
}

function get(key: string): string | null {
  requireKeychain()
  const db = getGlobalDb()
  const row = db.prepare('SELECT encrypted_value FROM settings_secrets WHERE key = ?').get(key) as
    | { encrypted_value: Buffer }
    | undefined
  if (!row) return null
  try {
    return safeStorage.decryptString(row.encrypted_value)
  } catch (err) {
    throw new IpcError(
      'E_KEYCHAIN_UNAVAILABLE',
      `E_KEYCHAIN_UNAVAILABLE: Keychain error during decryption: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

/** Idempotent. Allowed even when the keychain is unavailable so callers can
 *  clean up orphan rows (e.g. when deleting a profile after a reboot into a
 *  Linux session without libsecret). */
function deleteSecret(key: string): void {
  const db = getGlobalDb()
  db.prepare('DELETE FROM settings_secrets WHERE key = ?').run(key)
}

export const secretsStore = {
  set,
  get,
  delete: deleteSecret
}
