// electron/settings/secrets.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { runMigrations } from '../services/db/migrations'

vi.mock('../services/db', () => ({
  dbService: { requireCurrent: vi.fn() }
}))
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn((s: string) => Buffer.from(`enc:${s}`, 'utf8')),
    decryptString: vi.fn((b: Buffer) => b.toString('utf8').replace(/^enc:/, ''))
  }
}))

import { dbService } from '../services/db'
import { safeStorage } from 'electron'
import { secretsStore } from './secrets'
import { __resetForTest as resetSafeStorage, initSafeStorageAvailability } from './safe-storage-state'

const requireCurrentMock = dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>
const isEncAvailableMock = safeStorage.isEncryptionAvailable as unknown as ReturnType<typeof vi.fn>
const encryptMock = safeStorage.encryptString as unknown as ReturnType<typeof vi.fn>
const decryptMock = safeStorage.decryptString as unknown as ReturnType<typeof vi.fn>

const MIGRATIONS = resolve(__dirname, '../services/db/migrations')

describe('secretsStore', () => {
  let db: Database.Database
  beforeEach(() => {
    resetSafeStorage()
    isEncAvailableMock.mockReturnValue(true)
    initSafeStorageAvailability()
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS)
    requireCurrentMock.mockReturnValue(db)
  })
  afterEach(() => db.close())

  it('set(key, plain) writes encrypted BLOB; get(key) returns decrypted plaintext', () => {
    secretsStore.set('ai.key.uuid-1', 'sk-abc123')
    expect(encryptMock).toHaveBeenCalledWith('sk-abc123')

    const row = db
      .prepare('SELECT encrypted_value, updated_at FROM settings_secrets WHERE key=?')
      .get('ai.key.uuid-1') as { encrypted_value: Buffer; updated_at: string }
    expect(row.encrypted_value).toBeInstanceOf(Buffer)
    expect(row.encrypted_value.toString('utf8')).toBe('enc:sk-abc123')
    expect(row.updated_at).toMatch(/^\d{4}-/)

    expect(secretsStore.get('ai.key.uuid-1')).toBe('sk-abc123')
    expect(decryptMock).toHaveBeenCalled()
  })

  it('get(key) returns null for missing key', () => {
    expect(secretsStore.get('missing')).toBeNull()
  })

  it('set overwrites existing row with new encrypted value', () => {
    secretsStore.set('k', 'v1')
    secretsStore.set('k', 'v2')
    expect(secretsStore.get('k')).toBe('v2')
    const count = db.prepare('SELECT COUNT(*) AS n FROM settings_secrets WHERE key=?').get('k') as { n: number }
    expect(count.n).toBe(1)
  })

  it('delete(key) removes the row; subsequent get returns null', () => {
    secretsStore.set('k', 'v')
    secretsStore.delete('k')
    expect(secretsStore.get('k')).toBeNull()
  })

  it('delete(missing) is a no-op (no throw)', () => {
    expect(() => secretsStore.delete('not-there')).not.toThrow()
  })

  it('throws E_KEYCHAIN_UNAVAILABLE when safeStorage cannot encrypt', () => {
    resetSafeStorage()
    isEncAvailableMock.mockReturnValue(false)
    initSafeStorageAvailability()
    expect(() => secretsStore.set('k', 'v')).toThrow(/E_KEYCHAIN_UNAVAILABLE/)
    expect(() => secretsStore.get('k')).toThrow(/E_KEYCHAIN_UNAVAILABLE/)
    // delete is allowed even when keychain is unavailable (so cleanup works)
    expect(() => secretsStore.delete('k')).not.toThrow()
    // No row was created
    const n = db.prepare('SELECT COUNT(*) AS n FROM settings_secrets').get() as { n: number }
    expect(n.n).toBe(0)
  })
})
