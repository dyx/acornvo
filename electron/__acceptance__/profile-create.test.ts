// electron/__acceptance__/profile-create.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { runMigrations } from '../services/db/migrations'

vi.mock('../services/db', () => ({ dbService: { requireCurrent: vi.fn() } }))
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn((s: string) => Buffer.from(Buffer.from(s).toString('base64'))),
    decryptString: vi.fn((b: Buffer) => Buffer.from(b.toString('utf8'), 'base64').toString('utf8'))
  }
}))

import { dbService } from '../services/db'
import { profilesStore } from '../settings/profiles'
import { initSafeStorageAvailability, __resetForTest as resetSafe } from '../settings/safe-storage-state'

const reqCur = dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>
const MIGRATIONS = resolve(__dirname, '../services/db/migrations')

describe('acceptance 9.5 — create profile with apiKey persists row + encrypted blob', () => {
  let db: Database.Database
  beforeEach(() => {
    resetSafe(); initSafeStorageAvailability()
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS)
    reqCur.mockReturnValue(db)
  })
  afterEach(() => db.close())

  it('after create, ai_provider_profiles has a row AND settings_secrets has encrypted blob', () => {
    const { id } = profilesStore.create({ name: 'openai-prod', provider: 'openai', model: 'gpt-4o', apiKey: 'sk-LONG-SECRET-KEY' })
    const profileRow = db.prepare('SELECT id, name, provider, model, api_key_ref FROM ai_provider_profiles WHERE id=?').get(id) as any
    expect(profileRow).toMatchObject({ id, name: 'openai-prod', provider: 'openai', model: 'gpt-4o', api_key_ref: `ai.key.${id}` })
    const secretRow = db.prepare('SELECT encrypted_value FROM settings_secrets WHERE key=?').get(`ai.key.${id}`) as any
    expect(secretRow).toBeDefined()
    expect(secretRow.encrypted_value).toBeInstanceOf(Buffer)
    expect(secretRow.encrypted_value.toString('utf8')).not.toContain('SECRET-KEY')
  })
})
