// electron/settings/secrets.ts
import { getGlobalDb } from '../services/global-db'

function set(key: string, plain: string): void {
  // Store plaintext directly, encoded as a buffer to match the existing BLOB schema
  const enc = Buffer.from(plain, 'utf-8')
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
  const db = getGlobalDb()
  const row = db.prepare('SELECT encrypted_value FROM settings_secrets WHERE key = ?').get(key) as
    | { encrypted_value: Buffer }
    | undefined
  if (!row) return null
  return row.encrypted_value.toString('utf-8')
}

/** Idempotent. Used to clean up orphan rows. */
function deleteSecret(key: string): void {
  const db = getGlobalDb()
  db.prepare('DELETE FROM settings_secrets WHERE key = ?').run(key)
}

export const secretsStore = {
  set,
  get,
  delete: deleteSecret
}
