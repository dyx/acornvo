// electron/settings/profile-key.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { runMigrations } from '../services/db/migrations'

vi.mock('../services/db', () => ({ dbService: { requireCurrent: vi.fn() } }))
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn((s: string) => Buffer.from(`enc:${s}`)),
    decryptString: vi.fn((b: Buffer) => b.toString('utf8').replace(/^enc:/, ''))
  }
}))
vi.mock('../services/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

import { dbService } from '../services/db'
import { profilesStore } from './profiles'
import { getProfileDecryptedKey } from './profile-key'
import { initSafeStorageAvailability, __resetForTest as resetSafe } from './safe-storage-state'

const reqCur = dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>
const MIGRATIONS = resolve(__dirname, '../services/db/migrations')

describe('getProfileDecryptedKey', () => {
  let db: Database.Database
  beforeEach(() => {
    resetSafe()
    initSafeStorageAvailability()
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS)
    reqCur.mockReturnValue(db)
  })
  afterEach(() => db.close())

  it('returns the decrypted plaintext for a profile that has a key', () => {
    const { id } = profilesStore.create({
      name: 'p',
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-abc'
    })
    expect(getProfileDecryptedKey(id)).toBe('sk-abc')
  })

  it('returns null when the profile has no api_key_ref (e.g. local ollama)', () => {
    const { id } = profilesStore.create({ name: 'ollama', provider: 'ollama', model: 'llama3' })
    expect(getProfileDecryptedKey(id)).toBeNull()
  })

  it('returns null for a non-existent profile id', () => {
    expect(getProfileDecryptedKey('no-such-id')).toBeNull()
  })
})
