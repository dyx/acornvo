// tests/acceptance/electron/keychain-unavailable.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { runMigrations } from '../../../electron/services/db/migrations'

vi.mock('../../../electron/services/db', () => ({ dbService: { requireCurrent: vi.fn() } }))
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(false),
    encryptString: vi.fn(),
    decryptString: vi.fn()
  }
}))

import { dbService } from '../../../electron/services/db'
import { profilesStore } from '../../../electron/settings/profiles'
import { settingsHandlers } from '../../../electron/ipc/settings'
import { initSafeStorageAvailability, __resetForTest as resetSafe } from '../../../electron/settings/safe-storage-state'

const reqCur = dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>
const MIGRATIONS = resolve(__dirname, '../services/db/migrations')

describe('acceptance 9.13 — keychain unavailable', () => {
  let db: Database.Database
  beforeEach(() => {
    resetSafe(); initSafeStorageAvailability()
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS)
    reqCur.mockReturnValue(db)
  })
  afterEach(() => db.close())

  it('keychainAvailable() returns false', () => {
    expect(settingsHandlers.keychainAvailable()).toBe(false)
  })

  it('creating a profile WITH apiKey throws E_KEYCHAIN_UNAVAILABLE', () => {
    expect(() => profilesStore.create({ name: 'p', provider: 'openai', model: 'gpt-4o', apiKey: 'sk-x' })).toThrow(/E_KEYCHAIN_UNAVAILABLE/)
    const n = db.prepare('SELECT COUNT(*) AS n FROM ai_provider_profiles').get() as { n: number }
    expect(n.n).toBe(0)
  })

  it('creating a profile WITHOUT apiKey succeeds even when keychain unavailable', () => {
    const { id } = profilesStore.create({ name: 'ollama', provider: 'ollama', model: 'llama3' })
    expect(typeof id).toBe('string')
  })
})
