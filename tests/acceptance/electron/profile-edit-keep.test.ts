// tests/acceptance/electron/profile-edit-keep.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { runMigrations } from '../../../electron/services/db/migrations'

vi.mock('../../../electron/services/db', () => ({ dbService: { requireCurrent: vi.fn() } }))
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn((s: string) => Buffer.from(Buffer.from(s).toString('base64'))),
    decryptString: vi.fn((b: Buffer) => Buffer.from(b.toString('utf8'), 'base64').toString('utf8'))
  }
}))

import { dbService } from '../../../electron/services/db'
import { profilesStore } from '../../../electron/settings/profiles'
import { secretsStore } from '../../../electron/settings/secrets'
import { getProfileDecryptedKey } from '../../../electron/settings/profile-key'
import { initSafeStorageAvailability, __resetForTest as resetSafe } from '../../../electron/settings/safe-storage-state'

const reqCur = dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>
const MIGRATIONS = resolve(__dirname, '../services/db/migrations')

describe('acceptance 9.6 — edit without apiKey preserves original', () => {
  let db: Database.Database
  beforeEach(() => {
    resetSafe(); initSafeStorageAvailability()
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS)
    reqCur.mockReturnValue(db)
  })
  afterEach(() => db.close())

  it('update with apiKey=undefined leaves the secret + ref intact', () => {
    const { id } = profilesStore.create({ name: 'p', provider: 'openai', model: 'gpt-4o', apiKey: 'sk-orig' })
    expect(getProfileDecryptedKey(id)).toBe('sk-orig')
    profilesStore.update(id, { name: 'p-renamed' })
    expect(getProfileDecryptedKey(id)).toBe('sk-orig')
    expect(secretsStore.get(`ai.key.${id}`)).toBe('sk-orig')
  })
})

describe('acceptance 9.7 — edit with apiKey="" clears the secret', () => {
  let db: Database.Database
  beforeEach(() => {
    resetSafe(); initSafeStorageAvailability()
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS)
    reqCur.mockReturnValue(db)
  })
  afterEach(() => db.close())

  it('update with apiKey="" removes the secret row AND nulls api_key_ref', () => {
    const { id } = profilesStore.create({ name: 'p', provider: 'openai', model: 'gpt-4o', apiKey: 'sk-orig' })
    const ref = `ai.key.${id}`
    expect(secretsStore.get(ref)).toBe('sk-orig')
    profilesStore.update(id, { apiKey: '' })
    expect(secretsStore.get(ref)).toBeNull()
    const row = db.prepare('SELECT api_key_ref FROM ai_provider_profiles WHERE id=?').get(id) as any
    expect(row.api_key_ref).toBeNull()
  })
})
