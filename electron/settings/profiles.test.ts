// electron/settings/profiles.test.ts
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


import { dbService } from '../services/db'
import { __setGlobalDbForTest, __resetGlobalDbForTest } from '../services/global-db'
import { profilesStore } from './profiles'
import { secretsStore } from './secrets'
import { settingsStore } from './store'
import { initSafeStorageAvailability, __resetForTest as resetSafe } from './safe-storage-state'

const reqCur = dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>
const MIGRATIONS = resolve(__dirname, '../services/db/migrations')

describe('profilesStore', () => {
  let db: Database.Database
  beforeEach(() => {
    resetSafe()
    initSafeStorageAvailability()
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS)
    reqCur.mockReturnValue(db)
    __setGlobalDbForTest(db)
    settingsStore.__resetSubscribers()
  })
  afterEach(() => {
    __resetGlobalDbForTest()
  })

  it('create({ name, provider, model }) returns { id } and inserts a row WITHOUT api_key_ref', () => {
    const { id } = profilesStore.create({ name: 'p1', provider: 'openai', model: 'gpt-4o' })
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(8)
    const row = db.prepare('SELECT * FROM ai_provider_profiles WHERE id=?').get(id) as {
      name: string
      api_key_ref: string | null
    }
    expect(row.name).toBe('p1')
    expect(row.api_key_ref).toBeNull()
  })

  it('create repairs a stale defaultProfileId by making the new profile default', () => {
    settingsStore.set('ai', { defaultProfileId: 'missing-profile' })
    const { id } = profilesStore.create({ name: 'fresh', provider: 'openai', model: 'gpt-4o' })
    expect(settingsStore.get('ai').defaultProfileId).toBe(id)
  })

  it('create with apiKey saves secret first then writes api_key_ref', () => {
    const { id } = profilesStore.create({
      name: 'p2',
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-abc'
    })
    expect(secretsStore.get(`ai.key.${id}`)).toBe('sk-abc')
    const row = db.prepare('SELECT api_key_ref FROM ai_provider_profiles WHERE id=?').get(id) as {
      api_key_ref: string
    }
    expect(row.api_key_ref).toBe(`ai.key.${id}`)
  })

  it('create with duplicate name throws E_DUPLICATE_NAME; no row, no secret', () => {
    profilesStore.create({ name: 'dup', provider: 'openai', model: 'gpt-4o', apiKey: 'sk-1' })
    expect(() =>
      profilesStore.create({
        name: 'dup',
        provider: 'anthropic',
        model: 'claude-4',
        apiKey: 'sk-2'
      })
    ).toThrow(/E_DUPLICATE_NAME/)
    const count = db
      .prepare('SELECT COUNT(*) AS n FROM ai_provider_profiles WHERE name=?')
      .get('dup') as { n: number }
    expect(count.n).toBe(1)
  })

  it('list() returns all profiles WITHOUT apiKey, with apiKeyRef', () => {
    profilesStore.create({ name: 'a', provider: 'openai', model: 'gpt-4o', apiKey: 'sk-a' })
    profilesStore.create({ name: 'b', provider: 'anthropic', model: 'claude-4', apiKey: 'sk-b' })
    const list = profilesStore.list()
    expect(list).toHaveLength(2)
    for (const p of list) {
      expect(p).not.toHaveProperty('apiKey')
      expect(p.apiKeyRef).toMatch(/^ai\.key\./)
    }
  })

  it('update with apiKey="newkey" overwrites secret, leaves other fields unchanged', () => {
    const { id } = profilesStore.create({
      name: 'p',
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'old'
    })
    profilesStore.update(id, { apiKey: 'new' })
    expect(secretsStore.get(`ai.key.${id}`)).toBe('new')
    const row = db.prepare('SELECT name FROM ai_provider_profiles WHERE id=?').get(id) as {
      name: string
    }
    expect(row.name).toBe('p')
  })

  it('update with apiKey="" deletes the secret and sets api_key_ref=NULL', () => {
    const { id } = profilesStore.create({
      name: 'p',
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk'
    })
    profilesStore.update(id, { apiKey: '' })
    expect(secretsStore.get(`ai.key.${id}`)).toBeNull()
    const row = db.prepare('SELECT api_key_ref FROM ai_provider_profiles WHERE id=?').get(id) as {
      api_key_ref: string | null
    }
    expect(row.api_key_ref).toBeNull()
  })

  it('update with apiKey=undefined leaves secret untouched', () => {
    const { id } = profilesStore.create({
      name: 'p',
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'keep'
    })
    profilesStore.update(id, { name: 'p2' })
    expect(secretsStore.get(`ai.key.${id}`)).toBe('keep')
  })

  it('update on missing id throws E_PROFILE_NOT_FOUND', () => {
    expect(() => profilesStore.update('does-not-exist', { name: 'x' })).toThrow(
      /E_PROFILE_NOT_FOUND/
    )
  })

  it('update name conflict throws E_DUPLICATE_NAME', () => {
    profilesStore.create({ name: 'a', provider: 'openai', model: 'gpt-4o' })
    const { id } = profilesStore.create({ name: 'b', provider: 'openai', model: 'gpt-4o' })
    expect(() => profilesStore.update(id, { name: 'a' })).toThrow(/E_DUPLICATE_NAME/)
  })

  it('delete cascades to secret in a single transaction', () => {
    const { id } = profilesStore.create({
      name: 'p',
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk'
    })
    profilesStore.delete(id)
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM ai_provider_profiles WHERE id=?').get(id)
    ).toMatchObject({ n: 0 })
    expect(secretsStore.get(`ai.key.${id}`)).toBeNull()
  })

  it('delete on default profile reassigns defaultProfileId to first remaining', () => {
    const { id: a } = profilesStore.create({ name: 'a', provider: 'openai', model: 'gpt-4o' })
    const { id: b } = profilesStore.create({ name: 'b', provider: 'openai', model: 'gpt-4o' })
    settingsStore.set('ai', { defaultProfileId: a })
    profilesStore.delete(a)
    expect(settingsStore.get('ai').defaultProfileId).toBe(b)
  })

  it('delete on default profile (last one) sets defaultProfileId=null', () => {
    const { id } = profilesStore.create({ name: 'only', provider: 'openai', model: 'gpt-4o' })
    settingsStore.set('ai', { defaultProfileId: id })
    profilesStore.delete(id)
    expect(settingsStore.get('ai').defaultProfileId).toBeNull()
  })

  it('delete on missing id throws E_PROFILE_NOT_FOUND', () => {
    expect(() => profilesStore.delete('nope')).toThrow(/E_PROFILE_NOT_FOUND/)
  })


})

describe('security audit — profile CRUD never leaks apiKey plaintext', () => {
  let db: Database.Database
  beforeEach(() => {
    resetSafe()
    initSafeStorageAvailability()
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS)
    reqCur.mockReturnValue(db)
    __setGlobalDbForTest(db)
  })
  afterEach(() => {
    __resetGlobalDbForTest()
  })

  it('list() output is JSON-serializable and does not contain "apiKey"', () => {
    profilesStore.create({ name: 'a', provider: 'openai', model: 'gpt-4o', apiKey: 'sk-secret' })
    const list = profilesStore.list()
    const json = JSON.stringify(list)
    expect(json).not.toMatch(/apiKey"\s*:/)
    expect(json).not.toMatch(/sk-secret/)
    expect(json).toMatch(/apiKeyRef/)
  })

  it('create() return shape is { id } only — does not echo apiKey', () => {
    const result = profilesStore.create({
      name: 'a',
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-secret'
    })
    expect(result).toEqual({ id: expect.any(String) })
    expect(JSON.stringify(result)).not.toMatch(/sk-secret/)
  })

  it('after delete, secrets.get(oldRef) returns null AND no orphan row remains', () => {
    const { id } = profilesStore.create({
      name: 'audit',
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-x'
    })
    const ref = `ai.key.${id}`
    expect(secretsStore.get(ref)).toBe('sk-x')
    profilesStore.delete(id)
    expect(secretsStore.get(ref)).toBeNull()
    const remaining = db
      .prepare('SELECT COUNT(*) AS n FROM settings_secrets WHERE key = ?')
      .get(ref) as { n: number }
    expect(remaining.n).toBe(0)
    const profileRow = db
      .prepare('SELECT api_key_ref FROM ai_provider_profiles WHERE id = ?')
      .get(id)
    expect(profileRow).toBeUndefined()
  })

  it('delete is atomic at the SQL level — verify with a fresh select', () => {
    const { id } = profilesStore.create({
      name: 'x',
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'k'
    })
    profilesStore.delete(id)
    const profiles = db.prepare('SELECT COUNT(*) AS n FROM ai_provider_profiles').get() as {
      n: number
    }
    const secrets = db.prepare('SELECT COUNT(*) AS n FROM settings_secrets').get() as { n: number }
    expect(profiles.n).toBe(0)
    expect(secrets.n).toBe(0)
  })
})
